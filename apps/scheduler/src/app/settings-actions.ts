'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { DisplayMode, MemberRole } from '@/lib/schedule-core/types';
import type { ActionResult } from './actions';

const ok = <T,>(data?: T): ActionResult<T> => ({ ok: true, data });
const fail = <T,>(error: string): ActionResult<T> => ({ ok: false, error });

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * RLS 가 최종 관문이다. 여기 검사는 거절 사유를 사용자에게 알려주기 위한 것으로,
 * 이게 없으면 "0행이 갱신됨"이라는 무의미한 결과만 돌아온다.
 */
async function myRole(workspaceId: string): Promise<MemberRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('memberships')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle<{ role: MemberRole }>();
  return data?.role ?? null;
}

async function requireAdmin(workspaceId: string): Promise<string | null> {
  const role = await myRole(workspaceId);
  if (role === 'owner' || role === 'admin') return null;
  return '이 작업은 관리자만 할 수 있습니다.';
}

const touch = () => revalidatePath('/w', 'layout');

/* ── 팀 ────────────────────────────────────────────────────────────── */

export async function createTeam(
  workspaceId: string,
  name: string,
  color: string,
): Promise<ActionResult<{ id: string }>> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);
  if (!name.trim()) return fail('팀 이름을 입력해 주세요.');
  if (!HEX.test(color)) return fail('색상 형식이 올바르지 않습니다.');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('teams')
    .insert({ workspace_id: workspaceId, name: name.trim(), color })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return fail('같은 이름의 팀이 이미 있습니다.');
    return fail(error.message);
  }
  touch();
  return ok({ id: data.id });
}

export async function updateTeam(
  workspaceId: string,
  id: string,
  patch: { name?: string; color?: string },
): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return fail('팀 이름은 비울 수 없습니다.');
    row.name = patch.name.trim();
  }
  if (patch.color !== undefined) {
    if (!HEX.test(patch.color)) return fail('색상 형식이 올바르지 않습니다.');
    row.color = patch.color;
  }
  if (!Object.keys(row).length) return fail('변경할 내용이 없습니다.');

  const supabase = await createClient();
  const { error } = await supabase.from('teams').update(row).eq('id', id);
  if (error) {
    if (error.code === '23505') return fail('같은 이름의 팀이 이미 있습니다.');
    return fail(error.message);
  }
  touch();
  return ok();
}

/** 팀을 지워도 일정은 남는다 — schedules.team_id 가 ON DELETE SET NULL 이다. */
export async function deleteTeam(workspaceId: string, id: string): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const supabase = await createClient();
  const { error } = await supabase.from('teams').delete().eq('id', id);
  if (error) return fail(error.message);
  touch();
  return ok();
}

/** 팀 구성원을 통째로 교체한다. 부분 갱신보다 화면 상태와 어긋날 여지가 적다. */
export async function setTeamMembers(
  workspaceId: string,
  teamId: string,
  membershipIds: string[],
): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const supabase = await createClient();
  const { error: delErr } = await supabase.from('team_members').delete().eq('team_id', teamId);
  if (delErr) return fail(delErr.message);

  if (membershipIds.length) {
    const { error } = await supabase
      .from('team_members')
      .insert(membershipIds.map((m) => ({ team_id: teamId, membership_id: m })));
    if (error) return fail(error.message);
  }
  touch();
  return ok();
}

/* ── 업무구분 ──────────────────────────────────────────────────────── */

export async function createPhase(
  workspaceId: string,
  name: string,
  color: string,
): Promise<ActionResult<{ id: string }>> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);
  if (!name.trim()) return fail('업무구분 이름을 입력해 주세요.');
  if (!HEX.test(color)) return fail('색상 형식이 올바르지 않습니다.');

  const supabase = await createClient();
  const { data: last } = await supabase
    .from('phases')
    .select('sort_order')
    .eq('workspace_id', workspaceId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  const { data, error } = await supabase
    .from('phases')
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      color,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return fail('같은 이름의 업무구분이 이미 있습니다.');
    return fail(error.message);
  }
  touch();
  return ok({ id: data.id });
}

export async function updatePhase(
  workspaceId: string,
  id: string,
  patch: { name?: string; color?: string },
): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return fail('이름은 비울 수 없습니다.');
    row.name = patch.name.trim();
  }
  if (patch.color !== undefined) {
    if (!HEX.test(patch.color)) return fail('색상 형식이 올바르지 않습니다.');
    row.color = patch.color;
  }
  if (!Object.keys(row).length) return fail('변경할 내용이 없습니다.');

  const supabase = await createClient();
  const { error } = await supabase.from('phases').update(row).eq('id', id);
  if (error) {
    if (error.code === '23505') return fail('같은 이름의 업무구분이 이미 있습니다.');
    return fail(error.message);
  }
  touch();
  return ok();
}

export async function deletePhase(workspaceId: string, id: string): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const supabase = await createClient();
  const { error } = await supabase.from('phases').delete().eq('id', id);
  if (error) return fail(error.message);
  touch();
  return ok();
}

/** 위/아래 한 칸 이동. 이웃한 두 행의 sort_order 를 맞바꾼다. */
export async function movePhase(
  workspaceId: string,
  id: string,
  dir: 'up' | 'down',
): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const supabase = await createClient();
  const { data: list } = await supabase
    .from('phases')
    .select('id, sort_order')
    .eq('workspace_id', workspaceId)
    .order('sort_order')
    .returns<{ id: string; sort_order: number }[]>();

  if (!list?.length) return fail('업무구분을 찾을 수 없습니다.');
  const i = list.findIndex((p) => p.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return fail('더 옮길 수 없습니다.');

  const a = list[i];
  const b = list[j];
  const { error: e1 } = await supabase.from('phases').update({ sort_order: b.sort_order }).eq('id', a.id);
  if (e1) return fail(e1.message);
  const { error: e2 } = await supabase.from('phases').update({ sort_order: a.sort_order }).eq('id', b.id);
  if (e2) return fail(e2.message);

  touch();
  return ok();
}

/* ── 프로젝트 ──────────────────────────────────────────────────────── */

export async function updateProject(
  id: string,
  patch: { name?: string; color?: string; description?: string | null },
): Promise<ActionResult> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return fail('프로젝트 이름은 비울 수 없습니다.');
    row.name = patch.name.trim();
  }
  if (patch.color !== undefined) {
    if (!HEX.test(patch.color)) return fail('색상 형식이 올바르지 않습니다.');
    row.color = patch.color;
  }
  if (patch.description !== undefined) row.description = patch.description;
  if (!Object.keys(row).length) return fail('변경할 내용이 없습니다.');

  const supabase = await createClient();
  const { error } = await supabase.from('projects').update(row).eq('id', id);
  if (error) return fail(error.message);
  touch();
  return ok();
}

/** 보관은 되돌릴 수 있는 삭제다. 목록에서만 빠지고 일정은 그대로 남는다. */
export async function archiveProject(id: string, archived: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('projects')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) return fail(error.message);
  touch();
  return ok();
}

/* ── 멤버 ──────────────────────────────────────────────────────────── */

export async function updateMemberRole(
  workspaceId: string,
  membershipId: string,
  role: MemberRole,
): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('memberships')
    .select('role')
    .eq('id', membershipId)
    .maybeSingle<{ role: MemberRole }>();
  if (!target) return fail('멤버를 찾을 수 없습니다.');

  // 마지막 소유자를 강등하면 아무도 워크스페이스를 관리할 수 없게 된다
  if (target.role === 'owner' && role !== 'owner') {
    const { count } = await supabase
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('role', 'owner');
    if ((count ?? 0) <= 1) return fail('마지막 소유자의 역할은 바꿀 수 없습니다.');
  }
  if (role === 'owner' && (await myRole(workspaceId)) !== 'owner') {
    return fail('소유자 지정은 소유자만 할 수 있습니다.');
  }

  const { error } = await supabase.from('memberships').update({ role }).eq('id', membershipId);
  if (error) return fail(error.message);
  touch();
  return ok();
}

export async function removeMember(workspaceId: string, membershipId: string): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('memberships')
    .select('role')
    .eq('id', membershipId)
    .maybeSingle<{ role: MemberRole }>();
  if (!target) return fail('멤버를 찾을 수 없습니다.');

  if (target.role === 'owner') {
    const { count } = await supabase
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('role', 'owner');
    if ((count ?? 0) <= 1) return fail('마지막 소유자는 내보낼 수 없습니다.');
  }

  const { error } = await supabase.from('memberships').delete().eq('id', membershipId);
  if (error) return fail(error.message);
  touch();
  return ok();
}

export async function revokeInvitation(workspaceId: string, id: string): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const supabase = await createClient();
  const { error } = await supabase.from('invitations').delete().eq('id', id);
  if (error) return fail(error.message);
  touch();
  return ok();
}

/* ── 승인 요청 ──────────────────────────────────────────────────────
   승인·거절 판정은 DB 함수 안에서 한다. 서버 액션에서 역할만 보고 통과시키면
   같은 규칙이 두 곳에 생기고, 한쪽만 고쳐지는 날이 온다. */

export async function approveRequest(
  workspaceId: string,
  requestId: string,
  role: MemberRole = 'member',
): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const supabase = await createClient();
  const { error } = await supabase.rpc('approve_access_request', {
    req_id: requestId,
    as_role: role,
  });
  if (error) return fail(error.message);
  touch();
  return ok();
}

export async function rejectRequest(
  workspaceId: string,
  requestId: string,
  reason?: string,
): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const supabase = await createClient();
  const { error } = await supabase.rpc('reject_access_request', {
    req_id: requestId,
    reason: reason?.trim() || null,
  });
  if (error) return fail(error.message);
  touch();
  return ok();
}

export async function deleteRequest(workspaceId: string, requestId: string): Promise<ActionResult> {
  const denied = await requireAdmin(workspaceId);
  if (denied) return fail(denied);

  const supabase = await createClient();
  const { error } = await supabase.from('access_requests').delete().eq('id', requestId);
  if (error) return fail(error.message);
  touch();
  return ok();
}

/* ── 내 정보 ────────────────────────────────────────────────────────
   멤버십의 update 정책은 관리자에게만 열려 있다. 스스로 역할을 올리지 못하게
   한 것이므로, 이름과 표시 방식만 바꾸는 좁은 길을 DB 함수로 따로 냈다. */

export async function updateMyProfile(
  workspaceId: string,
  displayName: string,
  displayAs: DisplayMode,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_my_profile', {
    ws: workspaceId,
    new_name: displayName,
    new_mode: displayAs,
  });
  if (error) return fail(error.message);
  touch();
  return ok();
}
