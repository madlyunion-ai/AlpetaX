-- ═══════════════════════════════════════════════════════════════════
--  승인제 가입
--
--  지금까지는 로그인한 사람이면 누구나 제 워크스페이스를 만들 수 있었다.
--  그 길이 열려 있으면 승인 절차를 넣어도 우회된다 — 승인을 못 받은 사람이
--  자기 워크스페이스를 만들어 버리면 그만이다. 그래서 생성을 먼저 잠그고,
--  그 다음에 요청·승인 경로를 낸다.
--
--  요청은 로그인 전에 받는다. 신청 때 메일을 쓰지 않으므로 Supabase 기본
--  발송의 시간당 2통 한도에 걸리지 않는다. 이메일 소유 확인은 승인 뒤
--  첫 로그인에서 매직링크로 이루어진다 — 남의 주소로 신청할 수는 있어도
--  그 사람만 로그인할 수 있으니 실제로 들어오지는 못한다.
-- ═══════════════════════════════════════════════════════════════════

-- ── 요청 테이블 ─────────────────────────────────────────────────────
do $$ begin
  create type access_request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists access_requests (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  -- 소문자로 고정해 둔다. 승인 뒤 초대·로그인과 대조할 때 대소문자가 갈리면
  -- 같은 사람의 요청이 둘로 보인다.
  email        text not null,
  display_name text not null,
  note         text,
  status       access_request_status not null default 'pending',
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references auth.users,
  decided_note text,
  constraint access_requests_email_lower check (email = lower(email))
);

-- 같은 주소로 대기 중인 요청은 하나만. 새로고침을 연타해도 목록이 불어나지 않는다.
create unique index if not exists access_requests_pending_idx
  on access_requests (workspace_id, email) where status = 'pending';
create index if not exists access_requests_ws_idx
  on access_requests (workspace_id, status, created_at desc);

alter table access_requests enable row level security;

-- 관리자만 본다. 요청자는 로그인 전이므로 읽을 주체가 없고, 읽을 필요도 없다.
drop policy if exists ar_read on access_requests;
create policy ar_read on access_requests for select
  using (workspace_id in (select auth_workspace_ids()) and auth_role(workspace_id) in ('owner','admin'));

drop policy if exists ar_update on access_requests;
create policy ar_update on access_requests for update
  using (workspace_id in (select auth_workspace_ids()) and auth_role(workspace_id) in ('owner','admin'));

drop policy if exists ar_delete on access_requests;
create policy ar_delete on access_requests for delete
  using (workspace_id in (select auth_workspace_ids()) and auth_role(workspace_id) in ('owner','admin'));

-- insert 정책은 두지 않는다. 넣는 길은 아래 RPC 하나뿐이다 —
-- 테이블을 직접 열어 주면 익명 사용자가 아무 workspace_id 로나 행을 만든다.

-- ── 워크스페이스 생성 잠그기 ────────────────────────────────────────
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

  -- 처음 한 번은 열어 둔다(마스터 부트스트랩). 그 뒤로는 기존 워크스페이스의
  -- 소유자만 더 만들 수 있다.
  if exists (select 1 from workspaces)
     and not exists (select 1 from memberships m
                     where m.user_id = auth.uid() and m.role = 'owner') then
    raise exception '워크스페이스 생성 권한이 없습니다. 관리자의 승인을 받아 주세요.'
      using errcode = 'insufficient_privilege';
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

-- ── 승인 요청 (로그인 전) ───────────────────────────────────────────
-- 익명으로 호출된다. 그래서 무엇을 돌려주는지가 중요하다 — 이 함수는
-- 워크스페이스의 존재 여부도, 이미 멤버인지도 알려 주지 않는다. 어느 경우든
-- 같은 응답을 준다. 그러지 않으면 누가 가입해 있는지 물어보는 도구가 된다.
create or replace function request_access(
  req_email text,
  req_name  text,
  req_note  text default null,
  ws_slug   text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  ws   uuid;
  mail text := lower(btrim(req_email));
  nm   text := btrim(req_name);
begin
  if mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception '이메일 형식이 올바르지 않습니다.' using errcode = 'check_violation';
  end if;
  if length(nm) < 1 or length(nm) > 60 then
    raise exception '이름을 1~60자로 적어 주세요.' using errcode = 'check_violation';
  end if;
  if length(coalesce(req_note, '')) > 500 then
    raise exception '메모는 500자를 넘을 수 없습니다.' using errcode = 'check_violation';
  end if;

  if ws_slug is null then
    -- 워크스페이스가 하나뿐인 배포에서는 고를 것이 없다.
    select id into ws from workspaces limit 2;
    if (select count(*) from workspaces) <> 1 then
      raise exception '워크스페이스를 지정해 주세요.' using errcode = 'check_violation';
    end if;
  else
    select id into ws from workspaces where slug = ws_slug;
  end if;

  -- 없는 주소여도 조용히 끝낸다. 오류를 갈라 주면 슬러그를 찍어 볼 수 있다.
  if ws is null then
    return;
  end if;

  insert into access_requests (workspace_id, email, display_name, note)
  values (ws, mail, nm, nullif(btrim(req_note), ''))
  -- 이미 대기 중이면 이름·메모만 갱신한다. 두 번 눌러도 줄이 늘지 않는다.
  on conflict (workspace_id, email) where status = 'pending'
  do update set display_name = excluded.display_name, note = excluded.note;
end $$;

revoke all on function request_access(text, text, text, text) from public;
grant execute on function request_access(text, text, text, text) to anon, authenticated;

-- ── 승인 ────────────────────────────────────────────────────────────
-- 멤버십을 바로 만들 수는 없다. 아직 auth.users 에 그 사람이 없기 때문이다.
-- 대신 초대를 만들어 두고, 그 사람이 처음 로그인할 때 붙인다.
create or replace function approve_access_request(req_id uuid, as_role member_role default 'member')
returns void
language plpgsql security definer set search_path = public as $$
declare
  r access_requests;
begin
  select * into r from access_requests where id = req_id;
  if r.id is null then
    raise exception '요청을 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;
  if auth_role(r.workspace_id) not in ('owner','admin') then
    raise exception '승인 권한이 없습니다.' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'pending' then
    raise exception '이미 처리된 요청입니다.' using errcode = 'check_violation';
  end if;

  insert into invitations (workspace_id, email, role, invited_by)
  values (r.workspace_id, r.email, as_role, auth.uid())
  -- 이미 초대가 있으면 역할만 맞춘다.
  on conflict (workspace_id, email) do update
    set role = excluded.role, accepted_at = null;

  update access_requests
     set status = 'approved', decided_at = now(), decided_by = auth.uid()
   where id = req_id;
end $$;

create or replace function reject_access_request(req_id uuid, reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r access_requests;
begin
  select * into r from access_requests where id = req_id;
  if r.id is null then
    raise exception '요청을 찾을 수 없습니다.' using errcode = 'no_data_found';
  end if;
  if auth_role(r.workspace_id) not in ('owner','admin') then
    raise exception '거절 권한이 없습니다.' using errcode = 'insufficient_privilege';
  end if;

  update access_requests
     set status = 'rejected', decided_at = now(), decided_by = auth.uid(),
         decided_note = nullif(btrim(reason), '')
   where id = req_id;
end $$;

-- ── 첫 로그인에서 초대 붙이기 ───────────────────────────────────────
-- 승인받은 사람은 토큰 링크를 받지 못한다(메일을 보내지 않으므로).
-- 그래서 로그인한 계정의 주소로 남아 있는 초대를 스스로 찾아 붙인다.
create or replace function claim_invitations()
returns int
language plpgsql security definer set search_path = public as $$
declare
  em  text;
  n   int := 0;
  inv invitations;
begin
  if auth.uid() is null then
    return 0;
  end if;
  select lower(email) into em from auth.users where id = auth.uid();
  if em is null then
    return 0;
  end if;

  for inv in
    select * from invitations where lower(email) = em and accepted_at is null
  loop
    insert into memberships (workspace_id, user_id, role, display_name)
    values (inv.workspace_id, auth.uid(), inv.role,
            coalesce((select display_name from access_requests
                       where workspace_id = inv.workspace_id and email = em
                       order by created_at desc limit 1),
                     split_part(em, '@', 1)))
    on conflict (workspace_id, user_id) do nothing;

    update invitations set accepted_at = now() where id = inv.id;
    n := n + 1;
  end loop;

  return n;
end $$;

-- ── 대기 중인 요청 수 ───────────────────────────────────────────────
-- 설정 화면의 배지에 쓴다. 관리자가 아니면 0 을 준다.
create or replace function pending_request_count(ws uuid)
returns int
language sql stable security definer set search_path = public as $$
  select case
    when auth_role(ws) in ('owner','admin')
      then (select count(*)::int from access_requests where workspace_id = ws and status = 'pending')
    else 0
  end
$$;
