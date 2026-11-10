import { createClient } from '@/lib/supabase/server';
import { buildIcs, type OpenShareResult } from '@/lib/share/share-core';

export const dynamic = 'force-dynamic';

/**
 * 캘린더 구독 주소. 캘린더 앱이 몇 시간마다 이 주소를 다시 읽는다.
 *
 * 비밀번호 링크는 여기서 열지 않는다 — 캘린더 앱은 비밀번호를 입력할 수 없고,
 * 주소에 비밀번호를 실으면 잠근 의미가 없다.
 * 막힌 링크는 빈 달력이 아니라 오류로 답한다. 빈 달력을 주면 구독한 쪽에서
 * 일정이 '삭제된' 것처럼 보이고, 왜 사라졌는지 알 길이 없다.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('open_share', { tok: token, pw: null });
  const res: OpenShareResult = error ? { status: 'not_found' } : (data as OpenShareResult);

  if (res.status !== 'ok' || !res.share) {
    const code = res.status === 'not_found' ? 404 : res.status === 'password_required' ? 403 : 410;
    return new Response(`이 공유 링크는 캘린더로 구독할 수 없습니다 (${res.status}).`, {
      status: code,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const origin = new URL(_req.url).origin;
  const ics = buildIcs(res.items ?? [], {
    name: res.share.title,
    workspace: res.share.workspace,
    link: `${origin}/s/${token}`,
  });
  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="schedule.ics"',
      'cache-control': 'private, max-age=300',
      'x-robots-tag': 'noindex',
    },
  });
}
