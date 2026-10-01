-- ═══════════════════════════════════════════════════════════════════
--  워크스페이스 나가기
--
--  멤버십 삭제 정책은 관리자에게만 열려 있다 — 아무나 남을 내보내지 못하게
--  한 것이다. 그 때문에 스스로 나가는 길까지 막혀 있었다.
--
--  정책을 넓히지 않고 좁은 함수를 따로 낸다. 정책을 "관리자 또는 본인" 으로
--  바꾸면 '내보내기' 와 '나가기' 가 같은 규칙을 쓰게 되어, 한쪽을 손볼 때
--  다른 쪽이 조용히 따라 바뀐다.
-- ═══════════════════════════════════════════════════════════════════

create or replace function leave_workspace(ws uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  mine memberships;
  owners int;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = 'insufficient_privilege';
  end if;

  select * into mine from memberships
   where workspace_id = ws and user_id = auth.uid();

  if mine.id is null then
    raise exception '이 워크스페이스의 멤버가 아닙니다.' using errcode = 'no_data_found';
  end if;

  /*
   * 마지막 소유자는 나갈 수 없다. 나가 버리면 아무도 설정을 바꾸거나 멤버를
   * 받을 수 없는 워크스페이스가 남는다 — 지우지도 못한다(삭제도 소유자만).
   * 내보내기·강등에 걸어 둔 것과 같은 보호다.
   */
  if mine.role = 'owner' then
    select count(*) into owners from memberships
     where workspace_id = ws and role = 'owner';
    if owners <= 1 then
      raise exception '마지막 소유자는 나갈 수 없습니다. 다른 사람에게 소유자를 넘기거나 워크스페이스를 삭제하세요.'
        using errcode = 'check_violation';
    end if;
  end if;

  delete from memberships where id = mine.id;

  -- 남아 있는 초대를 지운다. 두지 않으면 다음 로그인에서 claim_invitations 가
  -- 그 초대를 집어 방금 나온 곳으로 다시 들여보낸다.
  delete from invitations
   where workspace_id = ws and lower(email) = lower(coalesce(mine.email, ''));
end $$;

revoke execute on function leave_workspace(uuid) from anon;
