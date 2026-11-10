'use client';

import { useMemo, useState, useTransition } from 'react';
import { TeamSyncLogo } from '../../w/[slug]/logo';
import {
  STATUS_LABEL,
} from '@/lib/schedule-core/types';
import {
  buildIcs,
  fmtDate,
  fmtPeriod,
  safeFileName,
  type OpenShareResult,
  type ShareItem,
} from '@/lib/share/share-core';
import { unlockShare } from '../../share-actions';

const CLOSED: Record<string, { title: string; body: string }> = {
  not_found: { title: '열 수 없는 링크입니다', body: '주소가 틀렸거나, 공유한 사람이 주소를 새로 만들었습니다.' },
  revoked: { title: '공유가 중지되었습니다', body: '공유한 사람이 이 링크를 더 이상 열리지 않게 했습니다.' },
  expired: { title: '공유 기간이 끝났습니다', body: '이 링크는 정해진 기간이 지나 닫혔습니다.' },
  disabled: { title: '지금은 열 수 없습니다', body: '공유한 조직에서 외부 공유를 꺼 두었습니다.' },
};

export function PublicShare({ token, initial }: { token: string; initial: OpenShareResult }) {
  const [res, setRes] = useState(initial);
  const [pw, setPw] = useState('');
  const [pending, startTx] = useTransition();

  const brand = (
    <div className="pub__brand">
      <TeamSyncLogo className="pub__logo" />
      <span className="chip">읽기 전용</span>
    </div>
  );

  if (res.status === 'password_required' || res.status === 'wrong_password') {
    return (
      <main className="pub">
        <div className="pub__page">
          {brand}
          <form
            className="pub__card pub__gate"
            onSubmit={(e) => {
              e.preventDefault();
              startTx(async () => setRes(await unlockShare(token, pw)));
            }}
          >
            <h1 className="pub__title">비밀번호로 보호된 일정</h1>
            <p className="pub__sub">
              {res.workspace ? `${res.workspace}에서 공유한 일정입니다. ` : ''}전달받은 비밀번호를 입력하세요.
            </p>
            <input
              className="input"
              type="password"
              autoFocus
              autoComplete="off"
              aria-label="비밀번호"
              placeholder="비밀번호"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            {res.status === 'wrong_password' && <p className="pub__err">비밀번호가 맞지 않습니다.</p>}
            <button className="btn btn--primary" disabled={pending || !pw}>
              {pending ? '확인 중…' : '열기'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (res.status !== 'ok' || !res.share) {
    const c = CLOSED[res.status] ?? CLOSED.not_found;
    return (
      <main className="pub">
        <div className="pub__page">
          {brand}
          <div className="pub__card pub__gate">
            <h1 className="pub__title">{c.title}</h1>
            <p className="pub__sub">{c.body}</p>
            <p className="pub__sub">계속 보려면 공유한 사람에게 새 링크를 요청하세요.</p>
          </div>
        </div>
      </main>
    );
  }

  return <Opened token={token} res={res as Required<OpenShareResult>} />;
}

function Progress({ it }: { it: ShareItem }) {
  if (!it.status) return null;
  return (
    <span className="pub__progwrap">
      <span className="pub__status" data-st={it.status}>
        {STATUS_LABEL[it.status]}
      </span>
      <span className="pub__prog" aria-label={`진행률 ${it.progress ?? 0}%`}>
        <span style={{ width: `${it.progress ?? 0}%` }} />
      </span>
      <span className="pub__pct">{it.progress ?? 0}%</span>
    </span>
  );
}

function Opened({ token, res }: { token: string; res: Required<OpenShareResult> }) {
  const { share, items } = res;
  const groups = useMemo(() => {
    const m = new Map<string, ShareItem[]>();
    for (const it of items) {
      const k = it.project ?? '프로젝트 없음';
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return [...m.entries()];
  }, [items]);

  const download = () => {
    const link = `${window.location.origin}/s/${token}`;
    const ics = buildIcs(items, { name: share.title, workspace: share.workspace, link });
    const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = `${safeFileName(share.title)}.ics`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const s = items[0];
  return (
    <main className="pub">
      <div className="pub__page">
        <div className="pub__brand">
          <TeamSyncLogo className="pub__logo" />
          <span className="chip">읽기 전용</span>
        </div>

        <article className="pub__card">
          <header>
            <h1 className="pub__title">{share.title}</h1>
            <p className="pub__sub">
              {share.workspace}에서 공유
              {share.kind === 'view' && share.from && share.to && ` · ${fmtDate(share.from)} – ${fmtDate(share.to)}`}
              {share.expires_at && ` · ${fmtDate(share.expires_at)}까지 볼 수 있음`}
            </p>
          </header>

          {share.kind === 'schedule' ? (
            !s ? (
              <p className="pub__sub pub__empty">공유된 일정이 삭제되었습니다.</p>
            ) : (
              <dl className="pub__dl">
                <dt>기간</dt>
                <dd>{fmtPeriod(s)}</dd>
                {s.project && (
                  <>
                    <dt>프로젝트</dt>
                    <dd>
                      <span className="pub__dot" style={{ background: s.project_color }} />
                      {s.project}
                    </dd>
                  </>
                )}
                {s.team && (
                  <>
                    <dt>팀</dt>
                    <dd>
                      <span className="pub__dot" style={{ background: s.team_color }} />
                      {s.team}
                    </dd>
                  </>
                )}
                {s.status && (
                  <>
                    <dt>진행</dt>
                    <dd>
                      <Progress it={s} />
                    </dd>
                  </>
                )}
                {s.assignees && (
                  <>
                    <dt>담당</dt>
                    <dd>{s.assignees.join(', ')}</dd>
                  </>
                )}
                {s.description && (
                  <>
                    <dt>설명</dt>
                    <dd className="pub__desc">{s.description}</dd>
                  </>
                )}
              </dl>
            )
          ) : items.length === 0 ? (
            <p className="pub__sub pub__empty">이 기간에 공유된 일정이 없습니다.</p>
          ) : (
            <div className="pub__groups">
              {groups.map(([project, list]) => (
                <section key={project} className="pub__group">
                  <h2 className="pub__gtitle">
                    <span className="pub__dot" style={{ background: list[0].project_color ?? 'var(--ink-3)' }} />
                    {project}
                    <span className="pub__gcount">{list.length}건</span>
                  </h2>
                  {list.map((it) => (
                    <div key={it.id} className="pub__row">
                      <span className="pub__rowmain">
                        <b>{it.title}</b>
                        <span className="pub__meta">
                          {[fmtPeriod(it), it.team, it.assignees?.join(', ')].filter(Boolean).join(' · ')}
                        </span>
                        {it.description && <span className="pub__meta pub__desc">{it.description}</span>}
                      </span>
                      <Progress it={it} />
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </article>

        <footer className="pub__foot">
          <span>로그인 없이 보는 읽기 전용 화면입니다. 공유한 사람이 언제든 중지할 수 있습니다.</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" disabled={!items.length} onClick={download}>
            .ics 로 내 캘린더에 담기
          </button>
        </footer>
      </div>
    </main>
  );
}
