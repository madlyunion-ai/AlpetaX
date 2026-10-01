import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { NewWorkspaceForm } from './new-workspace-form';
import { TeamSyncLogo } from './[slug]/logo';

export const dynamic = 'force-dynamic';

export default async function WorkspacePicker() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  /*
   * 승인된 사람에게는 초대가 만들어져 있다. 메일을 보내지 않으므로 토큰 링크를
   * 건넬 방법이 없어, 로그인한 주소로 남아 있는 초대를 스스로 집어 간다.
   * 멤버십을 읽기 전에 해야 한다 — 순서가 바뀌면 승인 직후 첫 로그인에서
   * "소속 없음" 화면을 한 번 보고 새로고침해야 한다.
   */
  await supabase.rpc('claim_invitations');

  // RLS 는 내 워크스페이스의 멤버십을 전부 읽게 열어 준다(멤버 목록을 위해).
  // 내 소속만 세려면 user_id 를 직접 걸러야 한다 — 걸러 두지 않으면 멤버가
  // 세 명인 워크스페이스 하나가 세 줄로 나온다.
  const { data: memberships } = await supabase
    .from('memberships')
    .select('role, workspaces(id, name, slug)')
    .eq('user_id', user.id)
    .order('created_at');

  const list = (memberships ?? []).flatMap((m) => {
    const ws = m.workspaces as unknown as { id: string; name: string; slug: string } | null;
    return ws ? [{ ...ws, role: m.role as string }] : [];
  });

  /*
   * 승인 대기 건수. RLS 가 소유자·관리자에게만 열어 주므로, 권한이 없는
   * 워크스페이스의 줄은 아예 오지 않는다 — 따로 거를 필요가 없다.
   *
   * 여기에 붙이는 이유: 팀마다 워크스페이스를 두면 승인 화면도 팀마다 하나다.
   * 어디에 대기 중인 요청이 있는지 이 목록에서 보이지 않으면, 마스터가 팀 수
   * 만큼 설정 화면을 돌아다니며 확인해야 한다.
   */
  const { data: pendingRows } = await supabase
    .from('access_requests')
    .select('workspace_id')
    .eq('status', 'pending');

  const pending = new Map<string, number>();
  for (const r of pendingRows ?? []) {
    pending.set(r.workspace_id, (pending.get(r.workspace_id) ?? 0) + 1);
  }

  // 워크스페이스가 하나뿐이면 고르는 화면을 보여줄 이유가 없다
  if (list.length === 1) redirect(`/w/${list[0].slug}`);

  /*
   * 소속이 없다 — 신청한 팀의 승인을 기다리는 중이거나, 아직 신청하지
   * 않았거나.
   *
   * 여기서도 제 팀을 만들 수 있다. 승인 절차가 막는 것은 '남의 팀에 들어오는
   * 것' 이지 '제 팀을 꾸리는 것' 이 아니다. 기다리는 동안 아무것도 못 하게
   * 둘 이유가 없다.
   */
  if (list.length === 0) {
    return (
      <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: '2rem' }}>
        <div className="panel" style={{ width: 'min(420px, 100%)', padding: '2rem' }}>
          <TeamSyncLogo style={{ display: 'block', width: 150, height: 'auto', marginBottom: 20 }} />
          <h1 style={{ fontSize: 22, margin: '0 0 .25rem', letterSpacing: '-.02em' }}>
            승인 대기 중입니다
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.7, margin: '0 0 1.25rem' }}>
            <b>{user.email}</b> 로 로그인하셨지만 아직 참여할 수 있는 워크스페이스가 없습니다.
            <br />
            관리자가 승인하면 이 화면에서 바로 들어가실 수 있습니다.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <Link className="btn" href="/w">
              다시 확인
            </Link>
            <Link className="btn btn--ghost" href="/request" style={{ fontSize: 13 }}>
              아직 신청하지 않았다면 — 승인 요청하기
            </Link>
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line-soft)' }}>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '0 0 10px' }}>
              기다리는 대신 <b>직접 팀을 만들어</b> 시작하셔도 됩니다.
            </p>
            <NewWorkspaceForm />
          </div>

          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            <form action="/auth/signout" method="post">
              <button
                className="btn btn--ghost"
                style={{ width: '100%', fontSize: 12, color: 'var(--ink-3)' }}
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: '2rem' }}>
      <div style={{ width: 'min(460px, 100%)', display: 'grid', gap: 16 }}>
        <div>
          <TeamSyncLogo style={{ display: 'block', width: 140, height: 'auto', marginBottom: 12 }} />
          <h1 style={{ fontSize: 22, margin: '.35rem 0 0', letterSpacing: '-.02em' }}>
            워크스페이스 선택
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '.25rem 0 0' }}>{user.email}</p>
        </div>

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
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {(pending.get(ws.id) ?? 0) > 0 && (
                  <span className="badge badge--warn">승인 {pending.get(ws.id)}</span>
                )}
                <span className="chip">{ws.role}</span>
              </span>
            </Link>
          ))}
        </div>

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
