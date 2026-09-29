'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
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

  /*
   * 구글 로그인.
   * 메일을 한 통도 쓰지 않으므로 발송 한도와 무관하다 — 팀원을 들일 때
   * 매직링크가 시간당 몇 통이냐를 따지지 않아도 된다.
   */
  async function google() {
    setError(null);
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) setError(error.message);
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
          <>
            <button type="button" className="btn btn--google" onClick={google}>
              <GoogleMark />
              Google 계정으로 로그인
            </button>

            <div className="login__or">
              <span>또는 이메일로</span>
            </div>

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
          </>
        )}

        {/* 승인받지 못한 사람에게 막다른 길을 주지 않는다 — 여기서 신청한다 */}
        <p
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid var(--line-soft)',
            fontSize: 13,
            color: 'var(--ink-2)',
          }}
        >
          아직 승인받지 않으셨나요? <Link href="/request">승인 요청하기</Link>
        </p>
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

/**
 * 구글 로고.
 * 브랜드 색이 정해져 있어 토큰으로 바꾸지 않는다 — 구글 로고 사용 규정이
 * 색 변경을 허용하지 않고, 어두운 테마에서도 이 색 그대로가 맞다.
 */
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}
