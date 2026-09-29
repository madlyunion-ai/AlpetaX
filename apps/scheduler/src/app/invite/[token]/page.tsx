import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { acceptInvitation } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인 후 다시 이 링크로 돌아오게 한다
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const res = await acceptInvitation(token);
  if (res.ok) redirect(`/w/${res.data!.slug}`);

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: '2rem' }}>
      <div className="panel" style={{ padding: '1.75rem', width: 'min(420px, 100%)' }}>
        <p className="mono" style={{ margin: 0 }}>
          초대
        </p>
        <h1 style={{ fontSize: 18, margin: '.4rem 0 .5rem' }}>참여하지 못했습니다</h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '0 0 1rem' }}>{res.error}</p>
        <a className="btn" href="/w">
          내 워크스페이스로
        </a>
      </div>
    </main>
  );
}
