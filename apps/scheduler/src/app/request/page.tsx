'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TeamSyncLogo } from '@/app/w/[slug]/logo';

/**
 * 승인 요청 — 로그인 전에 받는다.
 *
 * 로그인을 먼저 시키지 않는 이유: 신청할 때마다 매직링크 메일이 한 통씩 나간다.
 * Supabase 기본 발송은 시간당 2통이라 세 번째 신청자부터 막힌다. 여기서는
 * 메일을 쓰지 않고, 승인된 뒤 첫 로그인에서만 한 통 쓴다.
 *
 * 이메일 소유 확인은 그 첫 로그인이 대신한다 — 남의 주소로 신청할 수는 있어도
 * 매직링크는 그 주소로만 가므로 실제로 들어오지는 못한다.
 */
interface Ws {
  id: string;
  name: string;
  slug: string;
}

export default function RequestPage() {
  return (
    <Suspense fallback={null}>
      <RequestForm />
    </Suspense>
  );
}

function RequestForm() {
  const params = useSearchParams();
  /*
   * 주소를 링크로 지정할 수 있다 — /request?ws=union
   * 팀 이름 목록조차 공개하고 싶지 않을 때, 마스터가 이 링크를 직접 건네면
   * 고르는 칸 없이 그 워크스페이스로만 신청된다.
   */
  const fixed = params.get('ws');

  const [list, setList] = useState<Ws[] | null>(null);
  const [slug, setSlug] = useState(fixed ?? '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  /*
   * 참여할 수 있는 워크스페이스 목록. 이름과 주소만 돌려주는 함수를 쓴다 —
   * workspaces 표는 로그인 전에 한 줄도 읽히지 않는다.
   */
  useEffect(() => {
    let alive = true;
    createClient()
      .rpc('list_open_workspaces')
      .then(({ data }: { data: Ws[] | null }) => {
        if (!alive) return;
        const rows = (data ?? []) as Ws[];
        setList(rows);
        // 하나뿐이면 고를 것이 없다
        setSlug((cur) => cur || (rows.length === 1 ? rows[0].slug : ''));
      });
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc('request_access', {
      req_email: email.trim(),
      req_name: name.trim(),
      req_note: note.trim() || null,
      ws_slug: slug || null,
    });

    if (error) {
      setError(error.message);
      setState('idle');
      return;
    }
    setState('sent');
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: '2rem' }}>
      <div className="panel" style={{ width: 'min(420px, 100%)', padding: '2rem' }}>
        <TeamSyncLogo style={{ display: 'block', width: 150, height: 'auto', marginBottom: 20 }} />

        {state === 'sent' ? (
          <>
            <h1 style={{ fontSize: 22, margin: '0 0 .25rem', letterSpacing: '-.02em' }}>
              요청이 접수되었습니다
            </h1>
            <p style={{ color: 'var(--ink-2)', margin: '0 0 1.5rem', fontSize: 13, lineHeight: 1.7 }}>
              {list?.find((w) => w.slug === slug)?.name ?? '관리자'} 쪽에서 승인하면{' '}
              <b>{email}</b> 로 로그인하실 수 있습니다.
              <br />
              승인 여부는 따로 알려 드리지 않으니, 잠시 뒤 로그인을 시도해 보세요.
            </p>
            <Link className="btn" href="/login" style={{ width: '100%' }}>
              로그인 화면으로
            </Link>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, margin: '0 0 .25rem', letterSpacing: '-.02em' }}>승인 요청</h1>
            <p style={{ color: 'var(--ink-2)', margin: '0 0 1.5rem', fontSize: 13 }}>
              이름과 이메일을 남기면 관리자가 확인 후 승인합니다.
            </p>

            <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
              {/* 어느 팀으로 갈지 먼저 정한다 — 이름을 적기 전에 */}
              {!fixed && list && list.length > 1 && (
                <label style={{ display: 'grid', gap: 5 }}>
                  <span className="mono">참여할 팀</span>
                  <select
                    className="select"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      고르세요
                    </option>
                    {list.map((w) => (
                      <option key={w.id} value={w.slug}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label style={{ display: 'grid', gap: 5 }}>
                <span className="mono">이름</span>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  required
                  maxLength={60}
                />
              </label>

              <label style={{ display: 'grid', gap: 5 }}>
                <span className="mono">이메일</span>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                />
              </label>

              <label style={{ display: 'grid', gap: 5 }}>
                <span className="mono">메모 (선택)</span>
                <textarea
                  className="textarea"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="소속이나 용건을 적어 주시면 승인이 빠릅니다."
                  rows={3}
                  maxLength={500}
                />
              </label>

              {error && (
                <p style={{ color: 'var(--warn)', fontSize: 13, margin: 0 }} role="alert">
                  {error}
                </p>
              )}

              <button className="btn btn--primary" disabled={state === 'sending'}>
                {state === 'sending' ? '보내는 중…' : '승인 요청하기'}
              </button>
            </form>

            <p style={{ marginTop: 16, marginBottom: 0, fontSize: 13 }}>
              이미 승인받으셨나요? <Link href="/login">로그인</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
