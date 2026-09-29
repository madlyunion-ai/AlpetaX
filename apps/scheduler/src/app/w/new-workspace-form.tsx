'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWorkspace } from '../actions';

/** 이름에서 주소를 만든다. 한글은 슬러그가 될 수 없으므로 비면 사용자가 직접 넣는다. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

export function NewWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const effectiveSlug = slugTouched ? slug : slugify(name);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createWorkspace(name.trim(), effectiveSlug);
      if (!res.ok) {
        setError(res.error ?? '만들지 못했습니다.');
        return;
      }
      router.push(`/w/${res.data!.slug}`);
    });
  }

  return (
    <form onSubmit={submit} className="panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <p className="mono" style={{ margin: 0 }}>
        새 워크스페이스
      </p>
      <div className="field">
        <label htmlFor="ws-name">이름</label>
        <input
          id="ws-name"
          className="input"
          required
          placeholder="우리 회사"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="ws-slug">주소</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--ink-3)', fontSize: 12, fontFamily: 'var(--f-mono)' }}>/w/</span>
          <input
            id="ws-slug"
            className="input"
            required
            pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
            title="영문 소문자·숫자·하이픈 3~40자"
            placeholder="our-team"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
        </div>
      </div>
      <button className="btn btn--primary" disabled={pending}>
        {pending ? '만드는 중…' : '만들기'}
      </button>
      {error && (
        <p role="alert" style={{ color: 'var(--warn)', fontSize: 12, margin: 0 }}>
          {error}
        </p>
      )}
      <p style={{ color: 'var(--ink-3)', fontSize: 12, margin: 0 }}>
        기본 팀(기획·디자인·개발)과 첫 프로젝트가 함께 만들어집니다.
      </p>
    </form>
  );
}
