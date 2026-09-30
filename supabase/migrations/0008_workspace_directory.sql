-- ═══════════════════════════════════════════════════════════════════
--  팀별 워크스페이스 — 신청 화면이 고를 목록
--
--  워크스페이스를 팀마다 두면, 승인 요청을 넣는 사람이 어느 팀으로 가려는지
--  골라야 한다. 그런데 workspaces 표는 RLS 로 막혀 있어 로그인 전에는 한 줄도
--  읽을 수 없다 — 그게 맞다. 남의 워크스페이스 목록이 아무에게나 보이면 안 된다.
--
--  그래서 이름과 주소만 돌려주는 좁은 함수를 따로 낸다. 여기서 나가는 것은
--  "이런 이름의 팀이 있다" 까지다. 누가 속해 있는지, 무엇을 하고 있는지는
--  여전히 보이지 않는다.
--
--  팀 이름조차 공개하고 싶지 않다면 이 함수의 anon 권한을 회수하고,
--  마스터가 /request?ws=<주소> 링크를 직접 건네는 방식으로 쓰면 된다.
--  그 경로는 앱에서 이미 지원한다.
-- ═══════════════════════════════════════════════════════════════════

create or replace function list_open_workspaces()
returns table (id uuid, name text, slug text)
language sql stable security definer set search_path = public as $$
  select id, name, slug from workspaces order by name
$$;

revoke all on function list_open_workspaces() from public;
grant execute on function list_open_workspaces() to anon, authenticated;

-- ── 신청 함수: 워크스페이스가 여럿일 때의 안내를 고친다 ─────────────
-- 전에는 하나뿐인 배포를 전제로 "지정해 주세요" 라고만 했다. 이제는 고르는
-- 화면이 있으므로, 주소가 비어 온 것은 화면이 잘못 보낸 것이다.
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
  n    int;
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
    select count(*) into n from workspaces;
    if n <> 1 then
      raise exception '참여할 워크스페이스를 골라 주세요.' using errcode = 'check_violation';
    end if;
    select id into ws from workspaces limit 1;
  else
    select id into ws from workspaces where slug = ws_slug;
  end if;

  -- 없는 주소여도 조용히 끝낸다. 오류를 갈라 주면 주소를 찍어 볼 수 있다.
  if ws is null then
    return;
  end if;

  insert into access_requests (workspace_id, email, display_name, note)
  values (ws, mail, nm, nullif(btrim(req_note), ''))
  on conflict (workspace_id, email) where status = 'pending'
  do update set display_name = excluded.display_name, note = excluded.note;
end $$;

revoke all on function request_access(text, text, text, text) from public;
grant execute on function request_access(text, text, text, text) to anon, authenticated;
