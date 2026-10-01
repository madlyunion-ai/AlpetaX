'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { NewWorkspaceForm } from '../new-workspace-form';
import { JoinWorkspace } from './join-workspace';
import './shell.css';

/*
 * 축척은 네 단계다. 왼쪽이 크게 보는 쪽 — 같은 화면에 더 짧은 기간이 들어간다.
 * '+' 는 확대(왼쪽으로), '-' 는 축소(오른쪽으로). 지도 확대·축소와 같은 방향이라
 * 따로 배우지 않아도 된다.
 */
const SCALE_STEPS: TimeScale[] = ['day', 'week', 'month', 'quarter'];
const SCALE_LABEL: Record<TimeScale, { roadmap: string; other: string }> = {
  day: { roadmap: '크게', other: '일' },
  week: { roadmap: '보통', other: '주' },
  month: { roadmap: '작게', other: '월' },
  quarter: { roadmap: '전체', other: '분기' },
};

/** 전환 상자에서 '만들기' 를 뜻하는 값. 주소로 쓰일 수 없는 모양이라 섞이지 않는다. */
const NEW_WS = '__new__';
/** 전환 상자에서 '다른 곳에 참여 요청' 을 뜻하는 값 */
const JOIN_WS = '__join__';

const VIEW_LABEL: Record<ViewKind, string> = {
  roadmap: '로드맵',
  month: '월',
  week: '주',
  day: '일',
  timeline: '타임라인',
  milestone: '마일스톤',
  workload: '담당자별 업무현황',
};

/** 상단 전환 상자가 쓰는 최소 정보 */
export interface WorkspaceRef {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface ShellProps {
  workspace: Workspace;
  /** 내가 속한 워크스페이스 전부 */
  myWorkspaces: WorkspaceRef[];
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
  const scaleIndex = SCALE_STEPS.indexOf(scale);
  const anchor = useMemo(() => new Date(ui.anchorIso), [ui.anchorIso]);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSeed, setQuickSeed] = useState<{ start: Date; end: Date; allDay: boolean } | null>(null);
  /*
   * 어느 프로젝트로 열 것인가. 로드맵의 '일정추가' 로 열면 그 프로젝트가
   * 미리 골라져야 한다 — 방금 그 이름을 눌렀는데 다시 고르게 하면 헛수고다.
   * null 이면 지금까지처럼 필터·첫 프로젝트를 따른다.
   */
  const [quickProject, setQuickProject] = useState<string | null>(null);
  const [quickPhase, setQuickPhase] = useState<string | null>(null);
  /* 새 워크스페이스 만들기 창 */
  const [wsNew, setWsNew] = useState(false);
  const [wsJoin, setWsJoin] = useState(false);
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
    setQuickProject(null);
    setQuickOpen(true);
  }, []);

  const openQuickForProject = useCallback((projectId: string) => {
    setQuickSeed(null);
    setQuickProject(projectId);
    setQuickPhase(null);
    setQuickOpen(true);
  }, []);

  /**
   * 로드맵의 빈 칸을 눌렀을 때. 누른 자리가 곧 입력값이다 —
   * 그 줄의 프로젝트·업무구분과 그 지점의 날짜로 폼이 채워진다.
   */
  const openQuickAt = useCallback(
    (o: { projectId: string | null; phaseName: string; start: Date; end: Date }) => {
      setQuickSeed({ start: o.start, end: o.end, allDay: true });
      setQuickProject(o.projectId);
      // 줄 제목으로 업무구분을 되찾는다. '미지정' 줄이면 고르지 않은 채로 둔다.
      setQuickPhase(props.phases.find((p) => p.name === o.phaseName)?.id ?? null);
      setQuickOpen(true);
    },
    [props.phases],
  );

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
              <div className="zoom" role="group" aria-label="기간 확대·축소">
                <button
                  className="zoom__btn"
                  aria-label="기간 늘리기 — 더 넓게 봅니다"
                  disabled={scaleIndex >= SCALE_STEPS.length - 1}
                  onClick={() => setParams({ scale: SCALE_STEPS[scaleIndex + 1] })}
                >
                  −
                </button>
                {/* 지금 어느 단계인지 — 버튼만 두면 몇 번 남았는지 알 수 없다 */}
                <span className="zoom__now">
                  {view === 'roadmap' ? SCALE_LABEL[scale].roadmap : SCALE_LABEL[scale].other}
                </span>
                <button
                  className="zoom__btn"
                  aria-label="기간 줄이기 — 더 자세히 봅니다"
                  disabled={scaleIndex <= 0}
                  onClick={() => setParams({ scale: SCALE_STEPS[scaleIndex - 1] })}
                >
                  +
                </button>
              </div>
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

            {/* 워크스페이스 — 고르면 옮겨 가고, 옆 버튼은 그 설정으로 */}
            <div className="wsbox">
              {props.myWorkspaces.length > 1 ? (
                <select
                  className="wsbox__pick"
                  aria-label="워크스페이스"
                  value={workspace.slug}
                  onChange={(e) => {
                    if (e.target.value === NEW_WS) return setWsNew(true);
                    if (e.target.value === JOIN_WS) return setWsJoin(true);
                    router.push(`/w/${e.target.value}`);
                  }}
                >
                  {props.myWorkspaces.map((w) => (
                    <option key={w.id} value={w.slug}>
                      {w.name}
                    </option>
                  ))}
                  <option value={JOIN_WS}>다른 워크스페이스 참여 요청…</option>
                  <option value={NEW_WS}>+ 새 워크스페이스…</option>
                </select>
              ) : (
                /*
                 * 하나뿐이어도 만들 길은 있어야 한다. 목록이 없다고 해서
                 * 더 만들 수 없는 것은 아니다.
                 */
                <select
                  className="wsbox__pick"
                  aria-label="워크스페이스"
                  value={workspace.slug}
                  onChange={(e) => {
                    if (e.target.value === NEW_WS) return setWsNew(true);
                    if (e.target.value === JOIN_WS) return setWsJoin(true);
                    router.push(`/w/${e.target.value}`);
                  }}
                >
                  <option value={workspace.slug}>{workspace.name}</option>
                  <option value={JOIN_WS}>다른 워크스페이스 참여 요청…</option>
                  <option value={NEW_WS}>+ 새 워크스페이스…</option>
                </select>
              )}
              <Link
                className="wsbox__gear"
                href={`/w/${workspace.slug}/settings?tab=workspace`}
                aria-label="워크스페이스 설정"
                title="워크스페이스 설정"
              >
                <SlidersIcon />
              </Link>
            </div>

            {props.me && <UserMenu me={props.me} slug={workspace.slug} />}
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
              members={props.members}
              assigneeMap={assigneesBySchedule}
              scale={scale}
              /* 로드맵만 전체를 받는다 — 트리의 줄이 기간에 따라 사라지지 않게 */
              schedules={filtered}
              onReachEdge={stepRange}
              onAddSchedule={canEdit ? openQuickForProject : undefined}
              onCreateAt={canEdit ? openQuickAt : undefined}
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
              projects={props.projects}
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

      {wsJoin && props.me && (
        <JoinWorkspace
          me={props.me}
          joinedSlugs={props.myWorkspaces.map((w) => w.slug)}
          onClose={() => setWsJoin(false)}
          onToast={say}
        />
      )}

      {wsNew && (
        <div
          className="quick"
          onMouseDown={(e) => e.target === e.currentTarget && setWsNew(false)}
        >
          <div className="wsnew">
            <div className="qf__head">
              <h2 className="qf__title">새 워크스페이스</h2>
              <button
                type="button"
                className="btn btn--ghost"
                aria-label="닫기"
                onClick={() => setWsNew(false)}
              >
                ✕
              </button>
            </div>
            <div className="wsnew__body">
              <NewWorkspaceForm />
            </div>
          </div>
        </div>
      )}

      {quickOpen && (
        <QuickAdd
          workspaceId={workspace.id}
          teams={props.teams}
          phases={props.phases}
          members={props.members}
          projects={props.projects}
          schedules={props.schedules}
          defaultProjectId={quickProject ?? filters.projectIds?.[0] ?? props.projects[0]?.id ?? null}
          defaultPhaseId={quickPhase}
          seed={quickSeed}
          onClose={() => {
            setQuickOpen(false);
            setQuickProject(null);
            setQuickPhase(null);
          }}
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

/** 설정 손잡이. 값을 조절한다는 뜻이 톱니바퀴보다 또렷하다. */
function SlidersIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M2 5h2M10 5h12M2 12h12M20 12h2M2 19h2M10 19h12" />
      <circle cx="7" cy="5" r="2.6" />
      <circle cx="17" cy="12" r="2.6" />
      <circle cx="7" cy="19" r="2.6" />
    </svg>
  );
}

/** 세로 점 세 개 — 로드맵 트리의 프로젝트 메뉴와 같은 모양. */
function DotsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="3.4" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="8" cy="12.6" r="1.4" />
    </svg>
  );
}

/**
 * 사용자 칩 + 설정 메뉴.
 *
 * 로그아웃을 메뉴 안에 넣은 이유 — 툴바에 그대로 두면 다른 버튼들과 같은
 * 무게로 보인다. 자주 누를 일이 아니고, 잘못 누르면 하던 일이 끊긴다.
 */
function UserMenu({ me, slug }: { me: Membership; slug: string }) {
  const [open, setOpen] = useState(false);
  /*
   * 메뉴를 어디에 띄울지. 툴바가 overflow 를 자르므로 그 안에 absolute 로
   * 두면 그려지기는 해도 잘려서 보이지 않는다 — 눌러도 아무 일이 없는 것처럼
   * 보이던 원인이다. body 로 내보내고 좌표를 직접 잡는다.
   */
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc 로 닫는다. 메뉴는 body 에 있으므로 따로 확인한다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!boxRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = memberLabel(me);

  function toggle() {
    if (open) return setOpen(false);
    const r = boxRef.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setOpen(true);
  }

  return (
    <div className="userbox" ref={boxRef}>
      <span className="userbox__avatar" aria-hidden="true">
        {label.slice(0, 1)}
      </span>
      <span className="userbox__name" title={label}>
        {label}
      </span>
      <button
        type="button"
        className="userbox__gear"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="내 메뉴"
        onClick={toggle}
      >
        <DotsIcon />
      </button>

      {open &&
        at &&
        createPortal(
          <div className="usermenu" role="menu" ref={menuRef} style={{ top: at.top, right: at.right }}>
            <Link
              className="usermenu__item"
              role="menuitem"
              href={`/w/${slug}/settings?tab=profile`}
              onClick={() => setOpen(false)}
            >
              회원정보 수정
            </Link>
            <form action="/auth/signout" method="post">
              <button className="usermenu__item usermenu__item--out" role="menuitem">
                로그아웃
              </button>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
