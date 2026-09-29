'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { TeamSyncLogo } from './logo';

/**
 * 첫 로그인 환영 창.
 *
 * 본 적이 있는지는 브라우저에 기록한다 — 서버 왕복 없이 첫 화면을 그릴 수
 * 있어야 하고, 이 창 하나 때문에 로드맵이 늦게 뜨면 손해가 더 크다.
 *
 * 사용자 id 를 열쇠에 넣는 이유: 한 브라우저를 여러 사람이 쓸 때 앞사람이
 * 끈 것을 뒷사람이 물려받으면 안 된다.
 */
const KEY = (userId: string) => `teamsync:welcome:${userId}`;

/*
 * localStorage 는 React 바깥의 저장소다. 이펙트에서 읽어 상태로 옮기면
 * 첫 렌더 뒤에 한 번 더 그려지고(연쇄 렌더), 서버와 클라이언트의 첫 출력도
 * 어긋난다. useSyncExternalStore 는 그런 값을 읽으라고 있는 것이다.
 *
 * 서버 쪽 스냅샷은 '이미 껐다'로 둔다 — 서버가 창을 그려 두면 껐던 사람에게도
 * 한순간 번쩍이고 사라진다. 아예 안 그리는 편이 낫다.
 */
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function readDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(KEY(userId)) === 'off';
  } catch {
    // 저장소를 막아 둔 브라우저 — 끈 적 없는 것으로 본다
    return false;
  }
}

interface Props {
  userId: string;
  /** 업무 등록 창을 연다 */
  onAddSchedule: () => void;
}

export function WelcomeModal({ userId, onAddSchedule }: Props) {
  const getSnapshot = useCallback(() => readDismissed(userId), [userId]);
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, () => true);

  // 이번에 닫았는지. '더 이상 보지 않기' 를 켜지 않아도 이번 화면에서는 닫힌다.
  const [closed, setClosed] = useState(false);
  const [never, setNever] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const open = !dismissed && !closed;

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  function dismiss(then?: () => void) {
    if (never) {
      try {
        localStorage.setItem(KEY(userId), 'off');
      } catch {
        /* 못 써도 닫히기는 해야 한다 */
      }
      listeners.forEach((l) => l());
    }
    setClosed(true);
    then?.();
  }

  if (!open) return null;

  return (
    <div
      className="wc"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wc-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismiss();
      }}
    >
      <div className="wc__box">
        <header className="wc__head">
          <TeamSyncLogo className="wc__logo" />
          <h2 className="wc__title" id="wc-title">
            오신 것을 환영합니다.
          </h2>
          <p className="wc__lead">팀의 일정을 한 화면에서 보고, 함께 맞춰 갑니다.</p>
        </header>

        <div className="wc__cards">
          <Card
            tone="a"
            art={<ArtTeam />}
            label="A"
            title="함께 모이는 팀"
            sub="사람 중심 · 협업"
          />
          <Card
            tone="b"
            art={<ArtBoard />}
            label="B"
            title="한눈에 보는 보드"
            sub="기능 중심 · 가시성"
          />
          <Card
            tone="c"
            art={<ArtJourney />}
            label="C"
            title="목표를 향한 여정"
            sub="성과 중심 · 동기부여"
          />
        </div>

        <footer className="wc__foot">
          <label className="wc__never">
            <input
              type="checkbox"
              checked={never}
              onChange={(e) => setNever(e.target.checked)}
            />
            더 이상 보지 않기
          </label>
          <span className="wc__spacer" />
          <button ref={closeRef} className="btn" onClick={() => dismiss()}>
            서비스 이용하기
          </button>
          <button className="btn btn--primary" onClick={() => dismiss(onAddSchedule)}>
            업무 등록해보기
          </button>
        </footer>
      </div>
    </div>
  );
}

function Card({
  tone,
  art,
  label,
  title,
  sub,
}: {
  tone: 'a' | 'b' | 'c';
  art: React.ReactNode;
  label: string;
  title: string;
  sub: string;
}) {
  return (
    <figure className="wc__card">
      <div className="wc__art" data-tone={tone}>
        {art}
      </div>
      <figcaption>
        <b className="wc__cardtitle">
          <span className="wc__cardlabel">{label}.</span> {title}
        </b>
        <span className="wc__cardsub">{sub}</span>
      </figcaption>
    </figure>
  );
}

/* ── 삽화 ─────────────────────────────────────────────────────────
   색을 토큰으로 빼지 않는다. 이 그림들은 UI 가 아니라 그림이고, 어두운
   테마에서도 같은 색이어야 세 장이 한 세트로 읽힌다. 대신 칸 배경만
   토큰으로 눌러 테마에 맞춘다. */

function ArtTeam() {
  return (
    <svg viewBox="0 0 200 150" role="img" aria-label="문서를 가운데 두고 모인 사람들">
      <circle cx="100" cy="30" r="15" fill="#3DBE7B" />
      <path d="M82 58a18 18 0 0 1 36 0z" fill="#3DBE7B" />
      <rect x="58" y="60" width="84" height="46" rx="6" fill="#fff" />
      <rect x="68" y="72" width="44" height="6" rx="3" fill="#6C63E8" />
      <rect x="68" y="84" width="64" height="5" rx="2.5" fill="#C9C5F5" />
      <rect x="68" y="94" width="52" height="5" rx="2.5" fill="#C9C5F5" />
      <path d="M40 83h18M142 83h18" stroke="#A9A3EE" strokeWidth="2" strokeDasharray="4 4" />
      <circle cx="30" cy="83" r="13" fill="#F45CA0" />
      <circle cx="170" cy="83" r="13" fill="#F5C63D" />
      <path d="M17 118a13 13 0 0 1 26 0z" fill="#F5A03D" />
      <path d="M157 118a13 13 0 0 1 26 0z" fill="#F5A03D" />
      <circle cx="52" cy="128" r="5" fill="#8E86F0" />
      <circle cx="150" cy="128" r="7" fill="#F9C9DE" />
    </svg>
  );
}

function ArtBoard() {
  return (
    <svg viewBox="0 0 200 150" role="img" aria-label="카드가 놓인 세 개의 보드 열">
      <rect x="18" y="22" width="50" height="106" rx="7" fill="#fff" />
      <rect x="75" y="22" width="50" height="106" rx="7" fill="#fff" />
      <rect x="132" y="22" width="50" height="106" rx="7" fill="#fff" />
      <rect x="26" y="32" width="34" height="18" rx="4" fill="#F7D96A" />
      <rect x="26" y="56" width="34" height="18" rx="4" fill="#F7D96A" />
      <rect x="83" y="32" width="34" height="18" rx="4" fill="#5FD4E8" />
      <rect x="83" y="56" width="34" height="18" rx="4" fill="#5FD4E8" />
      <rect x="140" y="32" width="34" height="18" rx="4" fill="#CFF3E4" />
      <path
        d="M148 41l5 5 9-9"
        stroke="#2FA36B"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 옮기는 중인 카드 — 기울여 두면 움직임이 읽힌다 */}
      <g transform="rotate(-8 100 92)">
        <rect x="80" y="80" width="40" height="24" rx="5" fill="#25BBD8" />
      </g>
      <circle cx="172" cy="20" r="11" fill="#F45CA0" />
    </svg>
  );
}

function ArtJourney() {
  return (
    <svg viewBox="0 0 200 150" role="img" aria-label="점선 길을 따라 깃발로 향하는 여정">
      <circle cx="46" cy="42" r="18" fill="#F5C63D" />
      <path
        d="M24 116C56 112 66 86 96 82c26-3 34-20 62-38"
        stroke="#F09A3E"
        strokeWidth="3"
        strokeDasharray="7 7"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="24" cy="116" r="8" fill="#F5842F" />
      <circle cx="96" cy="82" r="7" fill="#F5842F" />
      <circle cx="131" cy="66" r="8" fill="none" stroke="#F5842F" strokeWidth="3" />
      <path d="M158 40v-28" stroke="#E0453F" strokeWidth="3" strokeLinecap="round" />
      <path d="M158 14l22 7-22 8z" fill="#E0453F" />
      <circle cx="74" cy="122" r="10" fill="#8E86F0" />
      <circle cx="96" cy="126" r="8" fill="#F5C63D" />
      <path d="M64 140a10 10 0 0 1 20 0z" fill="#6C63E8" />
    </svg>
  );
}
