-- ═══════════════════════════════════════════════════════════════════
--  권한 검사에서 NULL 역할이 통과하던 것을 막는다
--
--  0005 의 승인·거절 함수는 이렇게 썼다:
--
--      if auth_role(ws) not in ('owner','admin') then raise ...
--
--  비회원이 부르면 auth_role 은 NULL 을 준다. SQL 에서 NULL 을 IN 과 비교하면
--  참도 거짓도 아닌 NULL 이 나오고, plpgsql 의 if 는 NULL 을 거짓으로 다룬다.
--  그래서 raise 가 건너뛰어지고 함수가 그대로 승인까지 진행했다 —
--  로그인하지 않은 사람도 남을 승인할 수 있었다.
--
--  security definer 함수라 RLS 가 막아 주지도 않는다. 그 안에서는 정책이
--  적용되지 않으므로, 권한 검사는 전적으로 이 if 문에 달려 있었다.
--
--  고치는 방법은 NULL 을 있을 수 있는 값으로 보고 먼저 걸러 내는 것이다.
--  'NULL 이면 거부' 를 눈에 보이게 적는다.
-- ═══════════════════════════════════════════════════════════════════

/** 관리자가 아니면 거기서 끝낸다. NULL(비회원)도 관리자가 아니다. */
create or replace function assert_admin(ws uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
declare
  r member_role;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;
  r := auth_role(ws);
  -- is distinct from 은 NULL 도 제대로 비교한다. r 이 NULL 이면 두 조건 모두
  -- 참이 되어 거부된다.
  if r is distinct from 'owner' and r is distinct from 'admin' then
    raise exception '권한이 없습니다.' using errcode = 'insufficient_privilege';
  end if;
end $$;

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

  perform assert_admin(r.workspace_id);

  if r.status <> 'pending' then
    raise exception '이미 처리된 요청입니다.' using errcode = 'check_violation';
  end if;

  insert into invitations (workspace_id, email, role, invited_by)
  values (r.workspace_id, r.email, as_role, auth.uid())
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

  perform assert_admin(r.workspace_id);

  update access_requests
     set status = 'rejected', decided_at = now(), decided_by = auth.uid(),
         decided_note = nullif(btrim(reason), '')
   where id = req_id;
end $$;

-- 익명에게는 실행 자체를 주지 않는다. 함수 안의 검사가 첫 번째 방어선이고
-- 이것이 두 번째다 — 한쪽이 무너져도 다른 쪽이 남는다.
revoke execute on function approve_access_request(uuid, member_role) from anon;
revoke execute on function reject_access_request(uuid, text) from anon;
revoke execute on function assert_admin(uuid) from anon;
