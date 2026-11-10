'use client';

import { useMemo, useState, useTransition } from 'react';
import { differenceInCalendarMonths, endOfMonth, startOfMonth } from 'date-fns';
import { TeamSyncLogo } from '../../w/[slug]/logo';
import { RoadmapView } from '../../w/[slug]/views/roadmap-view';
import {
  STATUS_LABEL,
  type Membership,
  type Milestone,
  type Phase,
  type Project,
  type Schedule,
  type TimeScale,
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
  // 화면 공유는 앱과 같은 로드맵으로 연다. 일정 한 건은 막대 하나뿐이라 카드가 낫다.
  const [mode, setMode] = useState<'roadmap' | 'list'>('roadmap');
  if (res.share.kind === 'view' && mode === 'roadmap')
    return <RoadmapShare token={token} res={res} onList={() => setMode('list')} />;
  return <ListShare token={token} res={res} onRoadmap={res.share.kind === 'view' ? () => setMode('roadmap') : undefined} />;
}

/** .ics 내려받기 — 두 보기가 같이 쓴다 */
function downloadIcs(token: string, res: Required<OpenShareResult>) {
  const link = `${window.location.origin}/s/${token}`;
  const ics = buildIcs(res.items, { name: res.share.title, workspace: res.share.workspace, link });
  const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = `${safeFileName(res.share.title)}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** 보는 기간이 길수록 성기게 — 앱의 로드맵 축척 네 단계 중에서 고른다 */
function scaleFor(from: Date, to: Date): TimeScale {
  const months = differenceInCalendarMonths(to, from) + 1;
  if (months <= 3) return 'day';
  if (months <= 8) return 'week';
  if (months <= 20) return 'month';
  return 'quarter';
}

function ViewSwitch({ mode, onChange }: { mode: 'roadmap' | 'list'; onChange: () => void }) {
  return (
    <div className="pub__switch" role="tablist" aria-label="보기">
      <button type="button" role="tab" aria-selected={mode === 'roadmap'} data-on={mode === 'roadmap'} onClick={mode === 'list' ? onChange : undefined}>
        로드맵
      </button>
      <button type="button" role="tab" aria-selected={mode === 'list'} data-on={mode === 'list'} onClick={mode === 'roadmap' ? onChange : undefined}>
        목록
      </button>
    </div>
  );
}

/**
 * 앱의 로드맵 화면을 그대로 쓴다 — 받는 사람이 보는 그림과 팀이 보는 그림이
 * 같아야 '이 일정' 이라고 짚어 말할 수 있다. 편집은 막고(readOnly), 서버가
 * 내보내지 않은 항목은 빈 값으로 채운다.
 */
function RoadmapShare({ token, res, onList }: { token: string; res: Required<OpenShareResult>; onList: () => void }) {
  const { share, items } = res;
  const [sel, setSel] = useState<string | null>(null);

  const model = useMemo(() => {
    // 화면 공유는 늘 기간을 들고 온다. 없을 일은 없지만, 있다면 일정 자체의 기간으로.
    const from = new Date(share.from ?? items[0]?.start_at ?? 0);
    const to = new Date(share.to ?? items.at(-1)?.end_at ?? 0);
    const range = { start: startOfMonth(from), end: endOfMonth(to) };

    const projects: Project[] = (res.projects ?? []).map((p) => ({
      id: p.id, workspace_id: '', name: p.name, description: null,
      starts_on: null, ends_on: null, archived_at: null, color: p.color,
    }));
    const phases: Phase[] = (res.phases ?? []).map((p) => ({ ...p, workspace_id: '' }));
    const milestones: Milestone[] = (res.milestones ?? []).map((m) => ({ ...m, workspace_id: '', description: null }));

    // 담당자는 이름만 온다. 로드맵이 얼굴 표시에 쓰는 멤버 모양으로 바꾼다.
    const members: Membership[] = [];
    const assigneeMap = new Map<string, string[]>();
    const schedules: Schedule[] = items.map((it) => {
      const ids = (it.assignees ?? []).map((name, i) => {
        const id = `${it.id}:${i}`;
        members.push({ id, workspace_id: '', user_id: '', role: 'member', display_name: name, email: null, display_as: 'name', avatar_url: null });
        return id;
      });
      if (ids.length) assigneeMap.set(it.id, ids);
      return {
        id: it.id, workspace_id: '', project_id: it.project_id ?? null, team_id: null,
        phase_id: it.phase_id ?? null, parent_id: null, title: it.title,
        description: it.description ?? null, start_at: it.start_at, end_at: it.end_at,
        all_day: it.all_day, horizon: it.horizon ?? 'mid', horizon_locked: false,
        // 상태·진행률을 감춘 링크는 '예정 0%' 로 그린다 — 지연 강조도 함께 끈다
        status: it.status ?? 'planned', progress: it.progress ?? 0, sort_order: it.sort_order ?? 0,
        created_by: '', created_at: '', updated_at: '',
      };
    });
    return { range, scale: scaleFor(range.start, range.end), projects, phases, milestones, members, assigneeMap, schedules };
  }, [share, items, res.projects, res.phases, res.milestones]);

  const picked = items.find((it) => it.id === sel) ?? null;

  return (
    <main className="pub pub--wide">
      <div className="pub__wide">
        <header className="pub__wtop">
          <div className="pub__brand">
            <TeamSyncLogo className="pub__logo" />
            <span className="chip">읽기 전용</span>
          </div>
          <div className="pub__wtitle">
            <h1 className="pub__title">{share.title}</h1>
            <p className="pub__sub">
              {share.workspace}에서 공유
              {share.from && share.to && ` · ${fmtDate(share.from)} – ${fmtDate(share.to)}`}
              {share.expires_at && ` · ${fmtDate(share.expires_at)}까지 볼 수 있음`}
              {` · 일정 ${items.length}건`}
            </p>
          </div>
          <span style={{ flex: 1 }} />
          <ViewSwitch mode="roadmap" onChange={onList} />
          <button type="button" className="btn" disabled={!items.length} onClick={() => downloadIcs(token, res)}>
            .ics 로 내 캘린더에 담기
          </button>
        </header>

        <div className="pub__rm">
          <RoadmapView
            range={model.range}
            scale={model.scale}
            schedules={model.schedules}
            projects={model.projects}
            phases={model.phases}
            milestones={model.milestones}
            members={model.members}
            assigneeMap={model.assigneeMap}
            markLate={share.show_progress}
            selectedId={sel}
            onSelect={(id) => setSel((cur) => (cur === id ? null : id))}
            onOpenMilestones={() => {}}
            canEdit={false}
            readOnly
            workspaceSlug=""
            onToast={() => {}}
          />

          {picked && (
            <aside className="pub__pick" aria-label="일정 정보">
              <div className="pub__pickhead">
                <b>{picked.title}</b>
                <button type="button" className="btn btn--ghost" aria-label="닫기" onClick={() => setSel(null)}>
                  ✕
                </button>
              </div>
              <dl className="pub__dl pub__dl--tight">
                <dt>기간</dt>
                <dd>{fmtPeriod(picked)}</dd>
                {picked.project && (
                  <>
                    <dt>프로젝트</dt>
                    <dd>{picked.project}</dd>
                  </>
                )}
                {picked.team && (
                  <>
                    <dt>팀</dt>
                    <dd>{picked.team}</dd>
                  </>
                )}
                {picked.status && (
                  <>
                    <dt>진행</dt>
                    <dd>
                      <Progress it={picked} />
                    </dd>
                  </>
                )}
                {picked.assignees && (
                  <>
                    <dt>담당</dt>
                    <dd>{picked.assignees.join(', ')}</dd>
                  </>
                )}
                {picked.description && (
                  <>
                    <dt>설명</dt>
                    <dd className="pub__desc">{picked.description}</dd>
                  </>
                )}
              </dl>
            </aside>
          )}
        </div>

        <p className="pub__foot pub__foot--wide">
          로그인 없이 보는 읽기 전용 화면입니다. 막대를 누르면 내용을 볼 수 있고, 공유한 사람이 언제든 중지할 수 있습니다.
        </p>
      </div>
    </main>
  );
}

function ListShare({
  token,
  res,
  onRoadmap,
}: {
  token: string;
  res: Required<OpenShareResult>;
  onRoadmap?: () => void;
}) {
  const { share, items } = res;
  const groups = useMemo(() => {
    const m = new Map<string, ShareItem[]>();
    for (const it of items) {
      const k = it.project ?? '프로젝트 없음';
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return [...m.entries()];
  }, [items]);

  const download = () => downloadIcs(token, res);

  const s = items[0];
  return (
    <main className="pub">
      <div className="pub__page">
        <div className="pub__brand">
          <TeamSyncLogo className="pub__logo" />
          <span className="chip">읽기 전용</span>
          <span style={{ flex: 1 }} />
          {onRoadmap && <ViewSwitch mode="list" onChange={onRoadmap} />}
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
