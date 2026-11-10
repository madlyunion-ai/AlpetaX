import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import type { OpenShareResult } from '@/lib/share/share-core';
import { PublicShare } from './public-share';
// 로드맵 보기는 앱의 로드맵 컴포넌트를 쓰므로 그 스타일(.rm)도 함께 싣는다
import '../../w/[slug]/shell.css';
import './share-public.css';

export const dynamic = 'force-dynamic';

/*
 * 제목을 미리보기에 싣지 않는다. 메신저가 링크를 펼칠 때 비밀번호 링크의
 * 일정 이름까지 드러나면 잠근 의미가 없다. 검색 엔진에도 올리지 않는다.
 */
export const metadata: Metadata = {
  title: 'Syncteams · 공유된 일정',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('open_share', { tok: token, pw: null });
  const initial: OpenShareResult = error ? { status: 'not_found' } : (data as OpenShareResult);
  return <PublicShare token={token} initial={initial} />;
}
