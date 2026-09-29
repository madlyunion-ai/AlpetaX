'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TeamSyncLogo } from '@/app/w/[slug]/logo';

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') ?? '/w';
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
    });

    if (error) {
      setError(error.message);
      setState('idle');
      return;
    }
    setState('sent');
  }

  return (
    <main
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100dvh',
        padding: '2rem',
      }}
    >
      <div className="panel" style={{ width: 'min(400px, 100%)', padding: '2rem' }}>
        <TeamSyncLogo style={{ display: 'block', width: 150, height: 'auto', marginBottom: 20 }} />
        <h1 style={{ fontSize: 22, margin: '0 0 .25rem', letterSpacing: '-.02em' }}>
          팀 일정을 한 화면에서
        </h1>
        <p style={{ color: 'var(--ink-2)', margin: '0 0 1.5rem', fontSize: 13 }}>
          이메일로 로그인 링크를 보냅니다. 비밀번호는 없습니다.
        </p>

        {state === 'sent' ? (
          <div
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              padding: '1rem',
              borderRadius: 'var(--radius)',
              fontSize: 13,
            }}
          >
            <b>{email}</b> 으로 로그인 링크를 보냈습니다.
            <br />
            메일함을 확인해 주세요. 링크는 1시간 동안 유효합니다.
          </div>
        ) : (
          <form onSubmit={send} style={{ display: 'grid', gap: 12 }}>
            <div className="field">
              <label htmlFor="email">이메일</label>
              <input
                id="email"
                className="input"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button className="btn btn--primary" style={{ height: 36 }} disabled={state === 'sending'}>
              {state === 'sending' ? '보내는 중…' : '로그인 링크 받기'}
            </button>
            {error && (
              <p style={{ color: 'var(--warn)', fontSize: 12, margin: 0 }} role="alert">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
