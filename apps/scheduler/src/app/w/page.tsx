import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { NewWorkspaceForm } from './new-workspace-form';

export const dynamic = 'force-dynamic';

export default async function WorkspacePicker() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: memberships } = await supabase
    .from('memberships')
    .select('role, workspaces(id, name, slug)')
    .order('created_at');

  const list = (memberships ?? []).flatMap((m) => {
    const ws = m.workspaces as unknown as { id: string; name: string; slug: string } | null;
    return ws ? [{ ...ws, role: m.role as string }] : [];
  });

  // 워크스페이스가 하나뿐이면 고르는 화면을 보여줄 이유가 없다
  if (list.length === 1) redirect(`/w/${list[0].slug}`);

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: '2rem' }}>
      <div style={{ width: 'min(460px, 100%)', display: 'grid', gap: 16 }}>
        <div>
          <p className="mono" style={{ margin: 0 }}>
            TeamSync
          </p>
          <h1 style={{ fontSize: 22, margin: '.35rem 0 0', letterSpacing: '-.02em' }}>
            {list.length ? '워크스페이스 선택' : '워크스페이스 만들기'}
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '.25rem 0 0' }}>
            {user.email}
          </p>
        </div>

        {list.length > 0 && (
          <div className="panel" style={{ overflow: 'hidden' }}>
            {list.map((ws) => (
              <Link
                key={ws.id}
                href={`/w/${ws.slug}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--line-soft)',
                  textDecoration: 'none',
                  color: 'var(--ink)',
                }}
              >
                <span style={{ fontWeight: 600 }}>{ws.name}</span>
                <span className="chip">{ws.role}</span>
              </Link>
            ))}
          </div>
        )}

        <NewWorkspaceForm />

        <form action="/auth/signout" method="post">
          <button className="btn btn--ghost" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            로그아웃
          </button>
        </form>
      </div>
    </main>
  );
}
