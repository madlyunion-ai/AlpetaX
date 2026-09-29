-- ═══════════════════════════════════════════════════════════════════
--  회원 정보 — 표시 이름과 표시 방식
--
--  지금까지 멤버 이름은 가입할 때 이메일 앞부분을 잘라 넣은 값이었다.
--  madlyunion@gmail.com 이면 "madlyunion" 이 되는 식이라, 화면 어디에도
--  사람 이름이 나오지 않았다.
--
--  이메일을 memberships 에 복사해 두는 이유: auth.users 는 워크스페이스
--  동료가 읽을 수 없다. 이메일로 자신을 표시하겠다고 고른 사람이 있어도
--  다른 사람 화면에서는 그 값을 가져올 방법이 없다.
--  같은 워크스페이스 안에서만 보이므로 RLS 범위는 그대로다.
-- ═══════════════════════════════════════════════════════════════════

alter table memberships add column if not exists email text;

-- 이름으로 보일지 이메일로 보일지. 본인이 고른다.
do $$ begin
  create type display_mode as enum ('name', 'email');
exception when duplicate_object then null; end $$;

alter table memberships add column if not exists display_as display_mode not null default 'name';

-- 기존 멤버의 이메일을 채운다.
update memberships m
   set email = u.email
  from auth.users u
 where u.id = m.user_id and m.email is null;

-- ── 멤버십을 만드는 세 경로 모두 이메일을 함께 넣는다 ────────────────
-- 한 곳이라도 빠지면 그 사람만 이메일 표시가 안 되고, 원인을 찾기 어렵다.

create or replace function create_workspace(ws_name text, ws_slug text)
returns workspaces
language plpgsql security definer set search_path = public as $$
declare
  w  workspaces;
  mb uuid;
  em text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from workspaces)
     and not exists (select 1 from memberships m
                     where m.user_id = auth.uid() and m.role = 'owner') then
    raise exception '워크스페이스 생성 권한이 없습니다. 관리자의 승인을 받아 주세요.'
      using errcode = 'insufficient_privilege';
  end if;

  if ws_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception '주소는 영문 소문자·숫자·하이픈 3~40자여야 합니다.' using errcode = 'check_violation';
  end if;

  select email into em from auth.users where id = auth.uid();

  insert into workspaces (name, slug, created_by)
  values (ws_name, ws_slug, auth.uid())
  returning * into w;

  insert into memberships (workspace_id, user_id, role, display_name, email)
  values (w.id, auth.uid(), 'owner',
          coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = auth.uid()),
                   split_part(em, '@', 1)),
          em)
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
    insert into memberships (workspace_id, user_id, role, display_name, email)
    values (inv.workspace_id, auth.uid(), inv.role,
            -- 승인 요청에 적은 이름이 있으면 그것을 쓴다. 본인이 적은 이름이
            -- 이메일 앞부분보다 낫다.
            coalesce((select display_name from access_requests
                       where workspace_id = inv.workspace_id and email = em
                       order by created_at desc limit 1),
                     split_part(em, '@', 1)),
            em)
    on conflict (workspace_id, user_id) do nothing;

    update invitations set accepted_at = now() where id = inv.id;
    n := n + 1;
  end loop;

  return n;
end $$;

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

  insert into memberships (workspace_id, user_id, role, display_name, email)
  values (inv.workspace_id, auth.uid(), inv.role, split_part(em, '@', 1), em)
  on conflict (workspace_id, user_id) do nothing;

  update invitations set accepted_at = now() where id = inv.id;

  select * into w from workspaces where id = inv.workspace_id;
  return w;
end $$;

-- ── 본인 정보 고치기 ────────────────────────────────────────────────
-- 멤버십 update 정책은 관리자만 열려 있다. 역할을 스스로 올리지 못하게 하려는
-- 것이므로, 이름과 표시 방식만 바꾸는 좁은 길을 따로 낸다.
-- 이메일은 받지 않는다 — 로그인 계정과 갈라지면 누가 누구인지 어긋난다.
create or replace function update_my_profile(ws uuid, new_name text, new_mode display_mode)
returns void
language plpgsql security definer set search_path = public as $$
declare
  nm text := btrim(new_name);
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;
  if length(nm) < 1 or length(nm) > 60 then
    raise exception '이름을 1~60자로 적어 주세요.' using errcode = 'check_violation';
  end if;

  update memberships
     set display_name = nm,
         display_as   = new_mode,
         -- 이메일이 비어 있던 오래된 행을 이 기회에 채운다
         email        = coalesce(email, (select email from auth.users where id = auth.uid()))
   where workspace_id = ws and user_id = auth.uid();

  if not found then
    raise exception '이 워크스페이스의 멤버가 아닙니다.' using errcode = 'insufficient_privilege';
  end if;
end $$;

revoke execute on function update_my_profile(uuid, text, display_mode) from anon;
