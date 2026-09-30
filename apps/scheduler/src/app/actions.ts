'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { inferHorizon } from '@/lib/schedule-core/horizon';
import type { Horizon, SchedStatus } from '@/lib/schedule-core/types';

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  /** 낙관적 락 충돌. 호출부가 "불러오기 / 내 변경 유지" 를 띄운다 */
  conflict?: boolean;
  data?: T;
}

const ok = <T,>(data?: T): ActionResult<T> => ({ ok: true, data });
const fail = <T,>(error: string, conflict = false): ActionResult<T> => ({ ok: false, error, conflict });

/* ── 워크스페이스 ──────────────────────────────────────────────────── */

export async function createWorkspace(name: string, slug: string): Promise<ActionResult<{ slug: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_workspace', { ws_name: name, ws_slug: slug });

  if (error) {
    if (error.code === '23505') return fail('이미 사용 중인 주소입니다.');
    return fail(error.message);
  }
  revalidatePath('/w');
  return ok({ slug: (data as { slug: string }).slug });
}

/* ── 일정 ──────────────────────────────────────────────────────────── */

export interface ScheduleDraft {
  workspaceId: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  projectId?: string | null;
  teamId?: string | null;
  phaseId?: string | null;
  parentId?: string | null;
  /** null 이면 기간으로 추론한다(자동). 값을 주면 사용자가 고른 것으로 본다. */
  horizon?: Horizon | null;
  status?: SchedStatus;
  progress?: number;
  assigneeIds?: string[];
}

export async function createSchedule(draft: ScheduleDraft): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('로그인이 필요합니다.');

  const title = draft.title.trim();
  if (!title) return fail('제목을 입력해 주세요.');

  const start = new Date(draft.startAt);
  const end = new Date(draft.endAt);
  if (Number.isNaN(+start) || Number.isNaN(+end)) return fail('기간을 확인해 주세요.');
  if (end < start) return fail('종료가 시작보다 빠릅니다.');

  const { data, error } = await supabase
    .from('schedules')
    .insert({
      workspace_id: draft.workspaceId,
      project_id: draft.projectId ?? null,
      team_id: draft.teamId ?? null,
      phase_id: draft.phaseId ?? null,
      parent_id: draft.parentId ?? null,
      title,
      description: draft.description?.trim() || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      all_day: draft.allDay ?? true,
      horizon: draft.horizon ?? inferHorizon(start, end),
      horizon_locked: Boolean(draft.horizon),
      status: draft.status ?? 'planned',
      progress: Math.max(0, Math.min(100, Math.round(draft.progress ?? 0))),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) return fail(error.message);

  if (draft.assigneeIds?.length) {
    await supabase
      .from('schedule_assignees')
      .insert(draft.assigneeIds.map((m) => ({ schedule_id: data.id, membership_id: m })));
  }

  revalidatePath('/w', 'layout');
  return ok({ id: data.id });
}

export interface SchedulePatch {
  title?: string;
  description?: string | null;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  projectId?: string | null;
  teamId?: string | null;
  phaseId?: string | null;
  parentId?: string | null;
  horizon?: Horizon;
  status?: SchedStatus;
  progress?: number;
}

export async function updateSchedule(
  id: string,
  patch: SchedulePatch,
  expectedUpdatedAt: string,
): Promise<ActionResult<{ updated_at: string }>> {
  const supabase = await createClient();

  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    if (!patch.title.trim()) return fail('제목은 비울 수 없습니다.');
    row.title = patch.title.trim();
  }
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.allDay !== undefined) row.all_day = patch.allDay;
  if (patch.projectId !== undefined) row.project_id = patch.projectId;
  if (patch.teamId !== undefined) row.team_id = patch.teamId;
  if (patch.phaseId !== undefined) row.phase_id = patch.phaseId;
  if (patch.parentId !== undefined) row.parent_id = patch.parentId;
  if (patch.status !== undefined) {
    row.status = patch.status;
    // 완료로 옮기면 진행률도 따라간다 — 둘이 어긋나면 차트가 거짓말을 한다
    if (patch.status === 'done' && patch.progress === undefined) row.progress = 100;
  }
  if (patch.progress !== undefined) row.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));

  if (patch.startAt || patch.endAt) {
    const { data: current } = await supabase
      .from('schedules')
      .select('start_at, end_at, horizon_locked')
      .eq('id', id)
      .single();
    if (!current) return fail('일정을 찾을 수 없습니다.');

    const start = new Date(patch.startAt ?? current.start_at);
    const end = new Date(patch.endAt ?? current.end_at);
    if (end < start) return fail('종료가 시작보다 빠릅니다.');

    row.start_at = start.toISOString();
    row.end_at = end.toISOString();
    if (!current.horizon_locked && patch.horizon === undefined) {
      row.horizon = inferHorizon(start, end);
    }
  }

  if (patch.horizon !== undefined) {
    row.horizon = patch.horizon;
    row.horizon_locked = true;
  }

  if (!Object.keys(row).length) return fail('변경할 내용이 없습니다.');

  // 낙관적 락: 그 사이 남이 고쳤으면 0행이 갱신된다
  const { data, error } = await supabase
    .from('schedules')
    .update(row)
    .eq('id', id)
    .eq('updated_at', expectedUpdatedAt)
    .select('updated_at')
    .maybeSingle();

  if (error) return fail(error.message);
  if (!data) return fail('다른 멤버가 방금 이 일정을 수정했습니다.', true);

  revalidatePath('/w', 'layout');
  return ok({ updated_at: data.updated_at });
}

/** 타임라인/캘린더 드래그 이동. 기간 길이는 유지한다. */
export async function moveSchedule(
  id: string,
  deltaMinutes: number,
  expectedUpdatedAt: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: cur } = await supabase.from('schedules').select('start_at, end_at').eq('id', id).single();
  if (!cur) return fail('일정을 찾을 수 없습니다.');

  const shift = deltaMinutes * 60_000;
  return updateSchedule(
    id,
    {
      startAt: new Date(new Date(cur.start_at).getTime() + shift).toISOString(),
      endAt: new Date(new Date(cur.end_at).getTime() + shift).toISOString(),
    },
    expectedUpdatedAt,
  );
}

export async function resizeSchedule(
  id: string,
  edge: 'start' | 'end',
  newAt: string,
  expectedUpdatedAt: string,
): Promise<ActionResult> {
  return updateSchedule(id, edge === 'start' ? { startAt: newAt } : { endAt: newAt }, expectedUpdatedAt);
}

export async function deleteSchedule(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('schedules').delete().eq('id', id);
  if (error) return fail(error.message);
  revalidatePath('/w', 'layout');
  return ok();
}

export async function setAssignees(scheduleId: string, membershipIds: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { error: delErr } = await supabase
    .from('schedule_assignees')
    .delete()
    .eq('schedule_id', scheduleId);
  if (delErr) return fail(delErr.message);

  if (membershipIds.length) {
    const { error } = await supabase
      .from('schedule_assignees')
      .insert(membershipIds.map((m) => ({ schedule_id: scheduleId, membership_id: m })));
    if (error) return fail(error.message);
  }
  revalidatePath('/w', 'layout');
  return ok();
}

/* ── 의존성 ────────────────────────────────────────────────────────── */

export async function addDependency(predecessorId: string, successorId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('schedule_dependencies')
    .insert({ predecessor_id: predecessorId, successor_id: successorId });

  if (error) {
    if (error.code === '23505') return fail('이미 연결된 일정입니다.');
    // 순환은 DB 트리거가 막는다 (0001_init.sql)
    if (error.message.includes('순환')) return fail('순환 의존성입니다: 이 연결은 만들 수 없습니다.');
    return fail(error.message);
  }
  revalidatePath('/w', 'layout');
  return ok();
}

export async function removeDependency(predecessorId: string, successorId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('schedule_dependencies')
    .delete()
    .eq('predecessor_id', predecessorId)
    .eq('successor_id', successorId);
  if (error) return fail(error.message);
  revalidatePath('/w', 'layout');
  return ok();
}

/* ── 프로젝트 · 마일스톤 ───────────────────────────────────────────── */

export async function createProject(workspaceId: string, name: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  if (!name.trim()) return fail('프로젝트 이름을 입력해 주세요.');
  const { data, error } = await supabase
    .from('projects')
    .insert({ workspace_id: workspaceId, name: name.trim() })
    .select('id')
    .single();
  if (error) return fail(error.message);
  revalidatePath('/w', 'layout');
  return ok({ id: data.id });
}

export async function upsertMilestone(input: {
  id?: string;
  workspaceId: string;
  projectId: string;
  title: string;
  dueOn: string;
  status?: 'upcoming' | 'reached' | 'missed';
}): Promise<ActionResult> {
  const supabase = await createClient();
  if (!input.title.trim()) return fail('마일스톤 이름을 입력해 주세요.');

  const row = {
    workspace_id: input.workspaceId,
    project_id: input.projectId,
    title: input.title.trim(),
    due_on: input.dueOn,
    status: input.status ?? 'upcoming',
  };

  const { error } = input.id
    ? await supabase.from('milestones').update(row).eq('id', input.id)
    : await supabase.from('milestones').insert(row);

  if (error) return fail(error.message);
  revalidatePath('/w', 'layout');
  return ok();
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('milestones').delete().eq('id', id);
  if (error) return fail(error.message);
  revalidatePath('/w', 'layout');
  return ok();
}

/* ── 댓글 ──────────────────────────────────────────────────────────── */

export async function addComment(
  workspaceId: string,
  scheduleId: string,
  body: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('로그인이 필요합니다.');
  if (!body.trim()) return fail('내용을 입력해 주세요.');

  const { error } = await supabase.from('comments').insert({
    workspace_id: workspaceId,
    schedule_id: scheduleId,
    author_id: user.id,
    body: body.trim(),
  });
  if (error) return fail(error.message);
  revalidatePath('/w', 'layout');
  return ok();
}

/* ── 초대 ──────────────────────────────────────────────────────────── */

export async function inviteMember(
  workspaceId: string,
  email: string,
  role: 'admin' | 'member' | 'guest',
): Promise<ActionResult<{ token: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('로그인이 필요합니다.');

  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return fail('이메일 형식을 확인해 주세요.');

  const { data, error } = await supabase
    .from('invitations')
    .upsert(
      { workspace_id: workspaceId, email: clean, role, invited_by: user.id, accepted_at: null },
      { onConflict: 'workspace_id,email' },
    )
    .select('token')
    .single();

  if (error) return fail(error.message);
  revalidatePath('/w', 'layout');
  return ok({ token: data.token });
}

export async function acceptInvitation(token: string): Promise<ActionResult<{ slug: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('accept_invitation', { invite_token: token });
  if (error) return fail(error.message);
  revalidatePath('/w', 'layout');
  return ok({ slug: (data as { slug: string }).slug });
}
