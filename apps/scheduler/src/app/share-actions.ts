'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  SHARE_COLUMNS,
  expiresAtFor,
  type ExpireChoice,
  type OpenShareResult,
  type ShareFields,
  type ShareFilter,
  type ShareLink,
  type ShareScope,
} from '@/lib/share/share-core';
import type { ActionResult } from './actions';

const ok = <T,>(data?: T): ActionResult<T> => ({ ok: true, data });
const fail = <T,>(error: string): ActionResult<T> => ({ ok: false, error });

/**
 * DB 오류를 사람 말로. 0011 마이그레이션이 아직 적용되지 않았으면 표가 없다 —
 * 그 경우를 따로 알려야 '버튼이 고장 났다' 로 읽히지 않는다.
 */
function explain(err: { code?: string; message: string }): string {
  const missing =
    err.code === '42P01' ||
    err.code === 'PGRST202' || // 함수를 못 찾음
    err.code === 'PGRST205' || // 표를 못 찾음
    (/share_|allow_external_share/.test(err.message) && /does not exist|schema cache/.test(err.message));
  if (missing)
    return '공유 기능의 DB 준비가 아직 안 됐습니다(0011 마이그레이션). 관리자에게 알려 주세요.';
  if (err.code === '42501') return err.message.includes('외부 공유') ? err.message : '권한이 없습니다.';
  return err.message;
}

export interface ShareOptions extends ShareFields {
  scope: ShareScope;
  /** scope 가 password 일 때만. 비우면 기존 비밀번호를 그대로 둔다(수정 시). */
  password?: string;
  expire: ExpireChoice;
}

export type ShareTarget =
  | { kind: 'schedule'; scheduleId: string }
  | { kind: 'view'; title: string; filter: ShareFilter };

function revalidate(slug?: string) {
  if (slug) revalidatePath(`/w/${slug}/settings`);
}

export async function createShareLink(
  workspaceId: string,
  target: ShareTarget,
  opts: ShareOptions,
  slug?: string,
): Promise<ActionResult<ShareLink>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('로그인이 필요합니다.');

  if (opts.scope === 'password' && (opts.password ?? '').length < 4)
    return fail('비밀번호를 4자 이상 입력해 주세요.');
  if (target.kind === 'view' && !target.title.trim()) return fail('공유 이름을 입력해 주세요.');

  /*
   * 비밀번호 링크는 '누구나' 로 먼저 만들고, 비밀번호를 건 뒤에 잠근다.
   * 반대 순서면 비밀번호 저장이 실패했을 때 아무도 열 수 없는 링크가 남는다.
   * 이 순서에서는 실패하면 링크를 지우므로 열린 채 남지도 않는다.
   */
  const { data, error } = await supabase
    .from('share_links')
    .insert({
      workspace_id: workspaceId,
      kind: target.kind,
      schedule_id: target.kind === 'schedule' ? target.scheduleId : null,
      title: target.kind === 'view' ? target.title.trim() : null,
      filter: target.kind === 'view' ? target.filter : null,
      scope: 'anyone',
      show_team: opts.show_team,
      show_progress: opts.show_progress,
      show_assignees: opts.show_assignees,
      show_description: opts.show_description,
      expires_at: expiresAtFor(opts.expire),
      created_by: user.id,
      // 비밀번호 링크는 잠그기 전까지 열리지 않게 회수 상태로 시작한다
      revoked_at: opts.scope === 'password' ? new Date().toISOString() : null,
    })
    .select(SHARE_COLUMNS)
    .single<ShareLink>();
  if (error) return fail(explain(error));

  if (opts.scope === 'password') {
    const { error: pwErr } = await supabase.rpc('set_share_password', { link: data.id, pw: opts.password });
    if (!pwErr) {
      const { data: locked, error: lockErr } = await supabase
        .from('share_links')
        .update({ scope: 'password', revoked_at: null })
        .eq('id', data.id)
        .select(SHARE_COLUMNS)
        .single<ShareLink>();
      if (!lockErr) {
        revalidate(slug);
        return ok(locked);
      }
    }
    await supabase.from('share_links').delete().eq('id', data.id);
    return fail(explain(pwErr ?? { message: '비밀번호를 걸지 못했습니다.' }));
  }

  revalidate(slug);
  return ok(data);
}

/** 이미 나간 링크를 고친다 — 받는 사람이 가진 주소는 그대로 두고 범위·항목만 바뀐다. */
export async function updateShareLink(
  id: string,
  patch: Partial<ShareOptions>,
  slug?: string,
): Promise<ActionResult<ShareLink>> {
  const supabase = await createClient();

  if (patch.scope === 'password') {
    // 잠그는데 비밀번호가 없으면 아무도 열 수 없는 링크가 된다
    if ((patch.password ?? '').length < 4) return fail('비밀번호를 4자 이상 입력해 주세요.');
    const { error } = await supabase.rpc('set_share_password', { link: id, pw: patch.password });
    if (error) return fail(explain(error));
  }

  const row: Record<string, unknown> = {};
  for (const k of ['show_team', 'show_progress', 'show_assignees', 'show_description', 'scope'] as const)
    if (patch[k] !== undefined) row[k] = patch[k];
  if (patch.expire !== undefined) row.expires_at = expiresAtFor(patch.expire);

  const { data, error } = await supabase
    .from('share_links')
    .update(row)
    .eq('id', id)
    .select(SHARE_COLUMNS)
    .maybeSingle<ShareLink>();
  if (error) return fail(explain(error));
  if (!data) return fail('이 링크를 바꿀 권한이 없습니다. 만든 사람이나 관리자만 고칠 수 있습니다.');

  // 비밀번호를 풀었으면 해시도 지운다. 남겨 두면 다시 잠글 때 예전 비밀번호가 살아난다.
  if (patch.scope === 'anyone') await supabase.rpc('set_share_password', { link: id, pw: null });

  revalidate(slug);
  return ok(data);
}

/** 새 주소를 만들고 이전 주소는 그 자리에서 막는다. */
export async function regenerateShareToken(id: string, slug?: string): Promise<ActionResult<{ token: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('regenerate_share_token', { link: id });
  if (error) return fail(explain(error));
  if (!data) return fail('이 링크를 바꿀 권한이 없습니다.');
  revalidate(slug);
  return ok({ token: data as string });
}

export async function revokeShareLink(id: string, slug?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) return fail(explain(error));
  if (!data?.length) return fail('이 링크를 중지할 권한이 없습니다.');
  revalidate(slug);
  return ok();
}

/** 목록에서 지운다 — 중지·만료된 것을 정리할 때 */
export async function deleteShareLink(id: string, slug?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('share_links').delete().eq('id', id).select('id');
  if (error) return fail(explain(error));
  if (!data?.length) return fail('이 링크를 지울 권한이 없습니다.');
  revalidate(slug);
  return ok();
}

/** 워크스페이스 전체 스위치. 끄면 이미 나간 링크도 즉시 닫힌다. */
export async function setExternalShare(workspaceId: string, on: boolean, slug?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspaces')
    .update({ allow_external_share: on })
    .eq('id', workspaceId)
    .select('id');
  if (error) return fail(explain(error));
  if (!data?.length) return fail('관리자만 바꿀 수 있습니다.');
  revalidate(slug);
  return ok();
}

/** 공개 페이지의 비밀번호 입력. 로그인 없이 부른다. */
export async function unlockShare(token: string, password: string): Promise<OpenShareResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('open_share', { tok: token, pw: password });
  if (error) return { status: 'not_found' };
  return data as OpenShareResult;
}
