-- TeamSync 0003 — RPC, 초대, Realtime

-- ── 범위 조회: 월/주/일/타임라인 다섯 뷰의 단일 진입점 ────────────────
-- security invoker(기본) 이므로 schedules 의 RLS 가 그대로 적용된다.
create or replace function schedules_in_range(
  ws            uuid,
  from_ts       timestamptz,
  to_ts         timestamptz,
  project_ids   uuid[] default null,
  team_ids      uuid[] default null,
  assignee_ids  uuid[] default null
) returns setof schedules
language sql stable as $$
  select s.*
  from schedules s
  where s.workspace_id = ws
    and tstzrange(s.start_at, s.end_at, '[]') && tstzrange(from_ts, to_ts, '[]')
    and (project_ids  is null or s.project_id = any(project_ids))
    and (team_ids     is null or s.team_id    = any(team_ids))
    and (assignee_ids is null or exists (
          select 1 from schedule_assignees a
          where a.schedule_id = s.id and a.membership_id = any(assignee_ids)))
  order by s.start_at, s.sort_order, s.id
$$;

-- ── 워크스페이스 부트스트랩 ───────────────────────────────────────────
-- 워크스페이스와 owner 멤버십은 함께 생겨야 한다(하나만 생기면 접근 불가 상태가 됨).
-- 그래서 직접 insert 를 막고 이 함수로만 만든다.
create or replace function create_workspace(ws_name text, ws_slug text)
returns workspaces
language plpgsql security definer set search_path = public as $$
declare
  w  workspaces;
  mb uuid;
  pj uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;
  if ws_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception '주소는 영문 소문자·숫자·하이픈 3~40자여야 합니다.' using errcode = 'check_violation';
  end if;

  insert into workspaces (name, slug, created_by)
  values (ws_name, ws_slug, auth.uid())
  returning * into w;

  insert into memberships (workspace_id, user_id, role, display_name)
  values (w.id, auth.uid(), 'owner',
          coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = auth.uid()),
                   split_part((select email from auth.users where id = auth.uid()), '@', 1)))
  returning id into mb;

  -- 기본 팀 3개: 색은 여기서 정해지고 이후 모든 뷰의 일정 색이 된다
  insert into teams (workspace_id, name, color) values
    (w.id, '기획',   '#5B8DEF'),
    (w.id, '디자인', '#E8814A'),
    (w.id, '개발',   '#3FA372');

  insert into team_members (team_id, membership_id)
  select id, mb from teams where workspace_id = w.id;

  insert into projects (workspace_id, name, description, starts_on, ends_on)
  values (w.id, '첫 프로젝트', '일정을 추가해 보세요.',
          current_date, current_date + 90)
  returning id into pj;

  return w;
end $$;

-- ── 초대 ──────────────────────────────────────────────────────────────
create table if not exists invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  email        text not null,
  role         member_role not null default 'member',
  token        uuid not null default gen_random_uuid() unique,
  invited_by   uuid not null references auth.users,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (workspace_id, email)
);

alter table invitations enable row level security;

drop policy if exists inv_read on invitations;
create policy inv_read on invitations for select
  using (auth_role(workspace_id) in ('owner','admin'));
drop policy if exists inv_write on invitations;
create policy inv_write on invitations for insert
  with check (auth_role(workspace_id) in ('owner','admin') and invited_by = auth.uid());
drop policy if exists inv_delete on invitations;
create policy inv_delete on invitations for delete
  using (auth_role(workspace_id) in ('owner','admin'));

-- 토큰을 가진 사람이 스스로 멤버가 된다. 이메일이 일치해야 한다.
create or replace function accept_invitation(invite_token uuid)
returns workspaces
language plpgsql security definer set search_path = public as $$
declare
  inv invitations;
  w   workspaces;
  em  text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;

  select * into inv from invitations where token = invite_token;
  if inv.id is null then
    raise exception '초대 링크가 유효하지 않습니다.' using errcode = 'no_data_found';
  end if;
  if inv.accepted_at is not null then
    raise exception '이미 사용된 초대 링크입니다.' using errcode = 'check_violation';
  end if;

  select email into em from auth.users where id = auth.uid();
  if lower(em) <> lower(inv.email) then
    raise exception '이 초대는 % 로 발송되었습니다. 해당 계정으로 로그인해 주세요.', inv.email
      using errcode = 'insufficient_privilege';
  end if;

  insert into memberships (workspace_id, user_id, role, display_name)
  values (inv.workspace_id, auth.uid(), inv.role, split_part(em, '@', 1))
  on conflict (workspace_id, user_id) do nothing;

  update invitations set accepted_at = now() where id = inv.id;

  select * into w from workspaces where id = inv.workspace_id;
  return w;
end $$;

-- ── Realtime ──────────────────────────────────────────────────────────
-- 변경 브로드캐스트 대상. RLS 는 구독에도 적용된다.
do $$ begin
  alter publication supabase_realtime add table schedules;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table milestones;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table comments;
exception when duplicate_object then null; end $$;

-- 삭제 이벤트에서 workspace_id 로 필터링하려면 old 레코드 전체가 필요하다
alter table schedules  replica identity full;
alter table milestones replica identity full;
