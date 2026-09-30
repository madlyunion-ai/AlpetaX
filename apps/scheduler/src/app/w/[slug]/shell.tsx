'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { rangeFor, stepAnchor } from '@/lib/schedule-core/range';
import { isLate } from '@/lib/schedule-core/workload';
import { memberLabel } from '@/lib/schedule-core/types';
import type {
  Dependency,
  Filters,
  Membership,
  Milestone,
  Project,
  Schedule,
  Team,
  TimeScale,
  Phase,
  ViewKind,
  Workspace,
} from '@/lib/schedule-core/types';
import { Sidebar } from './sidebar';
import { RoadmapView } from './views/roadmap-view';
import { MonthView } from './views/month-view';
import { TimeGridView } from './views/time-grid-view';
import { TimelineView } from './views/timeline-view';
import { MilestoneView } from './views/milestone-view';
import { WorkloadView } from './views/workload-view';
import { DetailPanel } from './detail-panel';
import { QuickAdd } from './quick-add';
import { WelcomeModal } from './welcome-modal';
import './shell.css';

const VIEW_LABEL: Record<ViewKind, string> = {
  roadmap: '로드맵',
  month: '월',
  week: '주',
  day: '일',
  timeline: '타임라인',
  milestone: '마일스톤',
  workload: '담당자별',
};

export interface ShellProps {
  workspace: Workspace;
  me: Membership | null;
  members: Membership[];
  teams: Team[];
  phases: Phase[];
  projects: Project[];
  /** 워크스페이스의 모든 일정. 기간·필터는 브라우저에서 건다. */
  schedules: Schedule[];
  milestones: Milestone[];
  assignees: { schedule_id: string; membership_id: string }[];
  dependencies: Dependency[];
  view: ViewKind;
  scale: TimeScale;
  anchorIso: string;
  selectedId: string | null;
  filters: Filters;
  /** 지연을 빨강으로 강조하는 중인가. 끄면 다른 일과 같은 색으로 보인다. */
  markLate: boolean;
  loadError: string | null;
}

/** 화면이 무엇을 보여 줄지 — 서버가 아니라 브라우저가 들고 있는 값 */
interface ViewState {
  view: ViewKind;
  scale: TimeScale;
  anchorIso: string;
  sel: string | null;
  markLate: boolean;
  filters: Filters;
}

/** URL 을 화면 상태로 바꾼다. 서버의 page.tsx 와 같은 규칙을 쓴다. */
function readUrl(sp: URLSearchParams, fallback: ViewState): ViewState {
  const list = (k: string): string[] | null => {
    const v = sp.get(k);
    if (!v) return null;
    if (v === '-') return [];
    const out = v.split(',').filter(Boolean);
    return out.length ? out : null;
  };
  const v = sp.get('view');
  const sc = sp.get('scale');
  return {
    view: (v as ViewKind) ?? fallback.view,
    scale: (sc as TimeScale) ?? fallback.scale,
    anchorIso: sp.get('anchor') ?? fallback.anchorIso,
    sel: sp.get('sel'),
    markLate: sp.get('late') !== 'off',
    filters: {
      projectIds: list('projects'),
      teamIds: list('teams'),
      phaseIds: list('phases'),
      assigneeIds: list('assignees'),
    },
  };
}

export function Shell(props: ShellProps) {
  const { workspace } = props;
  const router = useRouter();
  const pathname = usePathname();

  /*
   * 화면 상태를 브라우저가 들고 있는다.
   *
   * 전에는 탭·필터·상세 창이 전부 URL 을 거쳐 서버를 다시 돌렸다. 그런데 그
   * 동작들은 데이터를 바꾸지 않는다 — 이미 받아 둔 것을 어떻게 보여 줄지만
   * 정한다. 서버를 부르면 왕복 다섯 번이 그대로 얹힌다.
   *
   * URL 은 계속 맞춰 둔다. 링크로 넘기면 같은 화면이 열려야 하고, 뒤로 가기도
   * 동작해야 한다. 다만 history API 로 직접 쓴다 — router.push 는 서버
   * 컴포넌트를 다시 그리게 한다.
   */
  const [ui, setUi] = useState<ViewState>({
    view: props.view,
    scale: props.scale,
    anchorIso: props.anchorIso,
    sel: props.selectedId,
    markLate: props.markLate,
    filters: props.filters,
  });

  const { view, scale, filters } = ui;
  const anchor = useMemo(() => new Date(ui.anchorIso), [ui.anchorIso]);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSeed, setQuickSeed] = useState<{ start: Date; end: Date; allDay: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  /* ── 화면 상태 바꾸기 — 서버를 거치지 않는다 ────────────────────── */
  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      window.history.pushState(null, '', qs ? `${pathname}?${qs}` : pathname);
      setUi((prev) => readUrl(next, prev));
    },
    [pathname],
  );

  // 뒤로/앞으로 — 주소가 바뀌었으니 화면 상태도 따라간다
  useEffect(() => {
    const onPop = () =>
      setUi((prev) => readUrl(new URLSearchParams(window.location.search), prev));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const select = useCallback((id: string | null) => setParams({ sel: id }), [setParams]);

  /** 로드맵을 가로 끝까지 밀었을 때 — 이전/다음 버튼과 같은 길을 쓴다 */
  const stepRange = useCallback(
    (dir: -1 | 1) => setParams({ anchor: stepAnchor(view, anchor, dir, scale).toISOString() }),
    [setParams, view, anchor, scale],
  );

  const range = useMemo(() => rangeFor(view, anchor, scale), [view, anchor, scale]);

  const assigneesBySchedule = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of props.assignees) {
      const list = map.get(a.schedule_id) ?? [];
      list.push(a.membership_id);
      map.set(a.schedule_id, list);
    }
    return map;
  }, [props.assignees]);

  /*
   * 필터는 여기서 건다. 전에는 질의에 조건을 실어 보냈는데, 체크박스를 하나
   * 누를 때마다 서버 왕복이 났다.
   *
   * 세 상태를 그대로 옮긴다 — null 이면 전부, 배열이면 그 항목만, 빈 배열이면
   * 아무것도. 빈 배열을 "전부" 로 다루면 '전체 해제' 가 동작하지 않는다.
   */
  const filtered = useMemo(() => {
    const pass = (sel: string[] | null, v: string | null) =>
      sel === null || (v !== null && sel.includes(v));
    return props.schedules.filter((s) => {
      if (!pass(filters.projectIds, s.project_id)) return false;
      if (!pass(filters.phaseIds, s.phase_id)) return false;
      if (!pass(filters.teamIds, s.team_id)) return false;
      if (filters.assigneeIds !== null) {
        const mine = assigneesBySchedule.get(s.id) ?? [];
        if (!mine.some((id) => filters.assigneeIds!.includes(id))) return false;
      }
      return true;
    });
  }, [props.schedules, filters, assigneesBySchedule]);

  /** 기간 안의 것만 — 로드맵 트리는 이것 말고 전체를 쓴다 */
  const inRange = useMemo(
    () => filtered.filter((s) => new Date(s.end_at) >= range.start && new Date(s.start_at) <= range.end),
    [filtered, range],
  );

  const lateCount = useMemo(
    () => inRange.filter((s) => isLate(s, new Date())).length,
    [inRange],
  );

  const rangeLabel = useMemo(() => {
    if (view === 'day') return format(anchor, 'yyyy년 M월 d일 (EEE)', { locale: ko });
    if (view === 'week')
      return `${format(range.start, 'M월 d일', { locale: ko })} – ${format(range.end, 'M월 d일', { locale: ko })}`;
    if (view === 'month') return format(anchor, 'yyyy년 M월', { locale: ko });
    if (view === 'roadmap' || view === 'workload')
      return `${format(range.start, 'yyyy.MM')} – ${format(range.end, 'yyyy.MM')}`;
    return `${format(range.start, 'yyyy.MM', { locale: ko })} – ${format(range.end, 'yyyy.MM', { locale: ko })}`;
  }, [view, anchor, range]);

  /* ── Realtime: 같은 워크스페이스의 변경을 반영 ──────────────────── */
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ws:${workspace.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedules',
          filter: `workspace_id=eq.${workspace.id}`,
        },
        (payload: { new?: unknown; old?: unknown }) => {
          // 지금 보고 있는 범위와 겹칠 때만 다시 가져온다. 범위 밖 변경은 버린다.
          const row = (payload.new ?? payload.old) as Partial<Schedule> | undefined;
          if (!row?.start_at || !row?.end_at) {
            router.refresh();
            return;
          }
          const s = new Date(row.start_at);
          const e = new Date(row.end_at);
          if (s <= range.end && range.start <= e) router.refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'milestones', filter: `workspace_id=eq.${workspace.id}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspace.id, range.start, range.end, router]);

  /*
   * Esc 로 열린 패널을 닫는다.
   * 이것만 남긴 이유 — 겹쳐 뜬 패널을 키보드로 빠져나올 방법이 아예 없으면
   * 마우스를 못 쓰는 사용자가 갇힌다. 단축키라기보다 탈출구다.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (quickOpen) setQuickOpen(false);
      else if (ui.sel) select(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickOpen, ui.sel, select]);

  const teamById = useMemo(() => new Map(props.teams.map((t) => [t.id, t])), [props.teams]);

  const selected = useMemo(
    () => props.schedules.find((s) => s.id === ui.sel) ?? null,
    [props.schedules, ui.sel],
  );

  /* ── 캔버스 드래그로 일정 만들기 ────────────────────────────────── */
  const openQuickFor = useCallback((start: Date, end: Date, allDay: boolean) => {
    setQuickSeed({ start, end, allDay });
    setQuickOpen(true);
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
    let active = 0;
    let dueSoon = 0;
    for (const s of props.schedules) {
      if (s.status === 'active') active++;
      if (s.status !== 'done' && s.status !== 'cancelled' && s.status !== 'blocked') {
        const end = new Date(s.end_at);
        if (end >= now && end <= weekAhead) dueSoon++;
      }
    }
    return { active, dueSoon };
  }, [props.schedules]);

  const canEdit = props.me?.role !== 'guest';

  return (
    <div className="shell">
      <Sidebar
        workspaceSlug={workspace.slug}
        projects={props.projects}
        teams={props.teams}
        phases={props.phases}
        members={props.members}
        filters={filters}
        workspaceId={workspace.id}
        onChange={setParams}
        onToast={say}
      />

      <div className="canvas">
        <div className="toolbar">
          <div className="toolbar__nav">
            <button
              className="btn btn--ghost"
              aria-label="이전"
              onClick={() => setParams({ anchor: stepAnchor(view, anchor, -1, scale).toISOString() })}
            >
              ‹
            </button>
            <span className="toolbar__label">{rangeLabel}</span>
            <button
              className="btn btn--ghost"
              aria-label="다음"
              onClick={() => setParams({ anchor: stepAnchor(view, anchor, 1, scale).toISOString() })}
            >
              ›
            </button>
            <button className="btn" onClick={() => setParams({ anchor: new Date().toISOString() })}>
              오늘
            </button>
          </div>

          <div className="tabs" role="tablist">
            {(Object.keys(VIEW_LABEL) as ViewKind[]).map((v) => (
              <button
                key={v}
                role="tab"
                className="tab"
                aria-selected={v === view}
                data-on={v === view}
                onClick={() => setParams({ view: v })}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>

          <span className="toolbar__spacer" />

          <div className="toolbar__right">
            {/* 지연 강조 켜기/끄기. 항목을 감추지 않으므로 건수는 늘 같다.
                role="switch" 는 켜고 끄는 것이라는 뜻이다. 버튼으로 두면
                보조기기가 "눌렀다" 까지만 알리고 무엇이 켜졌는지 말하지 못한다. */}
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={ui.markLate}
              title={ui.markLate ? '지연 강조 끄기' : '지연 강조 켜기'}
              onClick={() => setParams({ late: ui.markLate ? 'off' : null })}
            >
              <span className="switch__text">지연</span>
              {lateCount > 0 && <em className="switch__count">{lateCount}</em>}
              <span className="switch__track" aria-hidden="true">
                <span className="switch__knob" />
              </span>
            </button>

            {(view === 'timeline' || view === 'roadmap' || view === 'workload') && (
              <select
                className="select"
                style={{ width: 'auto' }}
                value={scale}
                onChange={(e) => setParams({ scale: e.target.value })}
                aria-label="시간축 단위"
              >
                <option value="day">{view === 'roadmap' ? '크게' : '일'}</option>
                <option value="week">{view === 'roadmap' ? '보통' : '주'}</option>
                <option value="month">{view === 'roadmap' ? '작게' : '월'}</option>
                <option value="quarter">{view === 'roadmap' ? '전체' : '분기'}</option>
              </select>
            )}

            {canEdit && (
              <button
                className="btn btn--primary"
                onClick={() => {
                  setQuickSeed(null);
                  setQuickOpen(true);
                }}
              >
                + 일정
              </button>
            )}

            <Link
              className="btn"
              href={`/w/${workspace.slug}/settings`}
              title="팀 · 업무구분 · 멤버 설정"
            >
              설정
            </Link>

            <form action="/auth/signout" method="post">
              <button className="btn btn--ghost" title={props.me ? memberLabel(props.me) : ''}>
                나가기
              </button>
            </form>
          </div>
        </div>

        <div className="stage">
          {props.loadError ? (
            <div className="empty">
              <b>일정을 불러오지 못했습니다.</b>
              <span style={{ fontSize: 12 }}>{props.loadError}</span>
            </div>
          ) : view === 'roadmap' ? (
            <RoadmapView
              range={range}
              scale={scale}
              /* 로드맵만 전체를 받는다 — 트리의 줄이 기간에 따라 사라지지 않게 */
              schedules={filtered}
              onReachEdge={stepRange}
              projects={props.projects}
              phases={props.phases}
              milestones={props.milestones}
              markLate={ui.markLate}
              selectedId={ui.sel}
              onSelect={select}
              onOpenMilestones={() => setParams({ view: 'milestone' })}
              canEdit={canEdit}
              workspaceSlug={workspace.slug}
              onToast={say}
            />
          ) : view === 'month' ? (
            <MonthView
              anchor={anchor}
              range={range}
              schedules={inRange}
              teamById={teamById}
              markLate={ui.markLate}
              selectedId={ui.sel}
              onSelect={select}
              onCreate={canEdit ? openQuickFor : undefined}
            />
          ) : view === 'week' || view === 'day' ? (
            <TimeGridView
              days={view === 'day' ? 1 : 7}
              range={range}
              schedules={inRange}
              teamById={teamById}
              markLate={ui.markLate}
              selectedId={ui.sel}
              onSelect={select}
              onCreate={canEdit ? openQuickFor : undefined}
            />
          ) : view === 'workload' ? (
            <WorkloadView
              range={range}
              schedules={inRange}
              members={props.members}
              teams={props.teams}
              phases={props.phases}
              projects={props.projects}
              assigneeMap={assigneesBySchedule}
              markLate={ui.markLate}
              selectedId={ui.sel}
              onSelect={select}
            />
          ) : view === 'timeline' ? (
            <TimelineView
              range={range}
              scale={scale}
              schedules={inRange}
              milestones={props.milestones}
              teamById={teamById}
              dependencies={props.dependencies}
              markLate={ui.markLate}
              selectedId={ui.sel}
              onSelect={select}
              canEdit={canEdit}
              onToast={say}
            />
          ) : (
            <MilestoneView
              projects={props.projects}
              milestones={props.milestones}
              schedules={inRange}
              workspaceId={workspace.id}
              canEdit={canEdit}
              onToast={say}
            />
          )}
        </div>
      </div>

      <footer className="footbar">
        <span>
          진행 <b>{stats.active}</b>
        </span>
        <span>
          지연 <b style={{ color: lateCount ? 'var(--warn)' : undefined }}>{lateCount}</b>
        </span>
        <span>
          이번 주 마감 <b>{stats.dueSoon}</b>
        </span>
        <span className="toolbar__spacer" />
        <span className="mono" style={{ fontSize: 11 }}>
          {workspace.name} · {props.schedules.length}건 표시
        </span>
      </footer>

      {selected && (
        <DetailPanel
          key={selected.id}
          schedule={selected}
          workspace={workspace}
          teams={props.teams}
          phases={props.phases}
          projects={props.projects}
          members={props.members}
          allSchedules={props.schedules}
          dependencies={props.dependencies}
          assigneeIds={assigneesBySchedule.get(selected.id) ?? []}
          canEdit={canEdit}
          onClose={() => select(null)}
          onToast={say}
        />
      )}

      {/* 첫 로그인 환영 창. me 가 없으면(초대 직후 등) 띄우지 않는다 —
          누구에게 보여 준 것인지 기록할 열쇠가 없다. */}
      {props.me && (
        <WelcomeModal
          userId={props.me.user_id}
          onAddSchedule={() => {
            setQuickSeed(null);
            setQuickOpen(true);
          }}
        />
      )}

      {quickOpen && (
        <QuickAdd
          workspaceId={workspace.id}
          teams={props.teams}
          phases={props.phases}
          members={props.members}
          projects={props.projects}
          schedules={props.schedules}
          defaultProjectId={filters.projectIds?.[0] ?? props.projects[0]?.id ?? null}
          seed={quickSeed}
          onClose={() => setQuickOpen(false)}
          onToast={say}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
