-- ═══════════════════════════════════════════════════════════════════
--  워크스페이스 생성을 열어 준다
--
--  0005 에서 잠갔던 이유는 "승인받지 못한 사람이 제 워크스페이스를 만들어
--  승인 절차를 우회한다" 였다. 그런데 그 절차가 막는 것은 처음부터
--  "남의 워크스페이스에 들어오는 것" 이지, "제 팀을 꾸리는 것" 이 아니었다.
--
--  두 가지는 다른 일이다:
--    · 남의 팀에 들어가기 → 그 팀 관리자의 승인이 필요하다(그대로 둔다)
--    · 제 팀을 만들기     → 막을 이유가 없다
--
--  로그인 자체는 이미 매직링크나 구글이 주소 소유를 확인한다. 거기까지 온
--  사람에게 제 팀을 못 만들게 할 근거가 없다.
-- ═══════════════════════════════════════════════════════════════════

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

  if ws_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception '주소는 영문 소문자·숫자·하이픈 3~40자여야 합니다.' using errcode = 'check_violation';
  end if;

  -- 한 사람이 만들 수 있는 수에는 상한을 둔다. 자동으로 눌러 대는 가입자가
  -- 워크스페이스를 무한정 찍어내면 신청 화면의 팀 목록이 쓸모없어진다.
  if (select count(*) from memberships where user_id = auth.uid() and role = 'owner') >= 20 then
    raise exception '만들 수 있는 워크스페이스 수를 넘었습니다.' using errcode = 'check_violation';
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
