-- TeamSync 0004 — 단계(phase)와 프로젝트 색
--
-- 로드맵 뷰의 좌측 축은 두 열이다.
--   1열(세로 색 띠) = 프로젝트
--   2열(행)         = 단계: 기획 / 분석 / UI·UX / 개발 / 운영
--
-- horizon(장기·중기·단기)은 시간축 기준 분류라 타임라인 뷰가 쓰고,
-- phase 는 업무 성격 기준 분류라 로드맵 뷰가 쓴다. 둘은 독립이다.

-- ── 프로젝트에 색 ─────────────────────────────────────────────────────
-- 로드맵 1열의 세로 띠 색이 된다
alter table projects add column if not exists color text not null default '#2F3E6E';

-- ── 단계 ──────────────────────────────────────────────────────────────
create table if not exists phases (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name         text not null,
  color        text not null default '#2E8BA5',
  sort_order   double precision not null default 0,
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);
create index if not exists phases_ws_idx on phases (workspace_id, sort_order);

alter table schedules add column if not exists phase_id uuid references phases on delete set null;
create index if not exists schedules_phase_idx on schedules (phase_id, start_at);

-- ── RLS ───────────────────────────────────────────────────────────────
alter table phases enable row level security;

drop policy if exists ph_read on phases;
create policy ph_read on phases for select
  using (workspace_id in (select auth_workspace_ids()));
drop policy if exists ph_write on phases;
create policy ph_write on phases for insert
  with check (auth_role(workspace_id) in ('owner','admin'));
drop policy if exists ph_update on phases;
create policy ph_update on phases for update
  using (auth_role(workspace_id) in ('owner','admin'));
drop policy if exists ph_delete on phases;
create policy ph_delete on phases for delete
  using (auth_role(workspace_id) in ('owner','admin'));

-- ── 범위 조회에 phase 필터 추가 ───────────────────────────────────────
drop function if exists schedules_in_range(uuid, timestamptz, timestamptz, uuid[], uuid[], uuid[]);
drop function if exists schedules_in_range(uuid, timestamptz, timestamptz, uuid[], uuid[], uuid[], uuid[]);

create or replace function schedules_in_range(
  ws            uuid,
  from_ts       timestamptz,
  to_ts         timestamptz,
  project_ids   uuid[] default null,
  team_ids      uuid[] default null,
  assignee_ids  uuid[] default null,
  phase_ids     uuid[] default null
) returns setof schedules
language sql stable as $$
  select s.*
  from schedules s
  where s.workspace_id = ws
    and tstzrange(s.start_at, s.end_at, '[]') && tstzrange(from_ts, to_ts, '[]')
    and (project_ids  is null or s.project_id = any(project_ids))
    and (team_ids     is null or s.team_id    = any(team_ids))
    and (phase_ids    is null or s.phase_id   = any(phase_ids))
    and (assignee_ids is null or exists (
          select 1 from schedule_assignees a
          where a.schedule_id = s.id and a.membership_id = any(assignee_ids)))
  order by s.start_at, s.sort_order, s.id
$$;

-- ── 기본 단계 ─────────────────────────────────────────────────────────
create or replace function seed_default_phases(ws uuid)
returns void language sql security definer set search_path = public as $$
  insert into phases (workspace_id, name, color, sort_order) values
    (ws, '기획',   '#2F3E6E', 0),
    (ws, '분석',   '#3AA0B8', 1),
    (ws, 'UI·UX',  '#E8814A', 2),
    (ws, '개발',   '#2E8BA5', 3),
    (ws, '운영',   '#7B3D8E', 4)
  on conflict (workspace_id, name) do nothing;
$$;

-- create_workspace 가 단계까지 함께 만들도록 교체
create or replace function create_workspace(ws_name text, ws_slug text)
returns workspaces
language plpgsql security definer set search_path = public as $$
declare
  w  workspaces;
  mb uuid;
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

  insert into teams (workspace_id, name, color) values
    (w.id, '기획',   '#5B8DEF'),
    (w.id, '디자인', '#E8814A'),
    (w.id, '개발',   '#3FA372');

  insert into team_members (team_id, membership_id)
  select id, mb from teams where workspace_id = w.id;

  perform seed_default_phases(w.id);

  insert into projects (workspace_id, name, description, starts_on, ends_on, color)
  values (w.id, '첫 프로젝트', '일정을 추가해 보세요.', current_date, current_date + 90, '#2F3E6E');

  return w;
end $$;

-- 이미 만들어 둔 워크스페이스에도 한 번 심어 준다
do $$
declare ws uuid;
begin
  for ws in select id from workspaces w
            where not exists (select 1 from phases p where p.workspace_id = w.id)
  loop
    perform seed_default_phases(ws);
  end loop;
end $$;

-- 0004_tracks.sql 을 이미 실행했다면 아래로 되돌린다
drop table if exists tracks cascade;
alter table schedules drop column if exists track_id;
drop function if exists seed_default_tracks(uuid);
drop function if exists reject_track_depth();
