'use client';

import { useMemo, useState } from 'react';

export interface Ws {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  /** null 이면 아직 불러오는 중 */
  list: Ws[] | null;
  /** 목록에서 뺄 주소 — 이미 속한 곳 */
  exclude?: string[];
  picked: Ws | null;
  onPick: (w: Ws | null) => void;
  autoFocus?: boolean;
}

/**
 * 워크스페이스를 찾아 고르는 조각.
 *
 * 선택 상자로 두지 않는 이유: 열어 봐야 뭐가 있는지 알 수 있고, 수가 늘면
 * 끝없이 스크롤해야 한다. 이름 일부를 치면 바로 좁혀지는 쪽이 낫다.
 *
 * 승인 요청 화면과 로그인 뒤의 참여 요청 창이 같은 이 조각을 쓴다 — 두 벌로
 * 두면 한쪽만 고쳐져 같은 일이 다르게 동작한다.
 */
export function WorkspaceSearch({ list, exclude = [], picked, onPick, autoFocus }: Props) {
  const [q, setQ] = useState('');

  const candidates = useMemo(() => {
    const skip = new Set(exclude);
    const needle = q.trim().toLowerCase();
    return (list ?? [])
      .filter((w) => !skip.has(w.slug))
      .filter((w) => !needle || w.name.toLowerCase().includes(needle) || w.slug.includes(needle));
  }, [list, exclude, q]);

  return (
    <>
      <input
        className="input"
        autoFocus={autoFocus}
        placeholder="워크스페이스 이름으로 찾기"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          // 좁히는 동안 고른 것이 목록 밖으로 밀려나면 버튼 문구와 어긋난다
          onPick(null);
        }}
      />

      <div className="join__list quiet-scroll">
        {list === null ? (
          <p className="join__empty">불러오는 중…</p>
        ) : candidates.length === 0 ? (
          <p className="join__empty">
            {q.trim() ? '찾는 이름이 없습니다.' : '참여할 수 있는 곳이 없습니다.'}
          </p>
        ) : (
          candidates.map((w) => (
            <button
              type="button"
              key={w.id}
              className="join__item"
              data-on={picked?.id === w.id}
              onClick={() => onPick(w)}
            >
              <b>{w.name}</b>
              <span className="mono">/w/{w.slug}</span>
            </button>
          ))
        )}
      </div>
    </>
  );
}
