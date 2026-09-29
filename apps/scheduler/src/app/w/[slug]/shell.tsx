'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { rangeFor, stepAnchor } from '@/lib/schedule-core/range';
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
  schedules: Schedule[];
  /** 기간과 무관한 전체 목록. 로드맵 트리가 줄을 만드는 데 쓴다. */
  allSchedules: Schedule[];
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
  /** 강조 여부와 무관한 지연 건수 */
  lateCount: number;
  loadError: string | null;
}

export function Shell(props: ShellProps) {
  const { workspace, view, scale, filters } = props;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const anchor = useMemo(() => new Date(props.anchorIso), [props.anchorIso]);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSeed, setQuickSeed] = useState<{ start: Date; end: Date; allDay: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  /* ── URL 이 유일한 뷰 상태 저장소 ───────────────────────────────── */
  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const select = useCallback((id: string | null) => setParams({ sel: id }), [setParams]);

  /** 로드맵을 가로 끝까지 밀었을 때 — 이전/다음 버튼과 같은 길을 쓴다 */
  const stepRange = useCallback(
    (dir: -1 | 1) => setParams({ anchor: stepAnchor(view, anchor, dir, scale).toISOString() }),
    [setParams, view, anchor, scale],
  );

  const range = useMemo(() => rangeFor(view, anchor, scale), [view, anchor, scale]);

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
      else if (props.selectedId) select(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickOpen, props.selectedId, select]);

  const assigneesBySchedule = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of props.assignees) {
      const list = map.get(a.schedule_id) ?? [];
      list.push(a.membership_id);
      map.set(a.schedule_id, list);
    }
    return map;
  }, [props.assignees]);

  const teamById = useMemo(() => new Map(props.teams.map((t) => [t.id, t])), [props.teams]);

  const selected = useMemo(
    () => props.schedules.find((s) => s.id === props.selectedId) ?? null,
    [props.schedules, props.selectedId],
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
              aria-checked={props.markLate}
              title={props.markLate ? '지연 강조 끄기' : '지연 강조 켜기'}
              onClick={() => setParams({ late: props.markLate ? 'off' : null })}
            >
              <span className="switch__text">지연</span>
              {props.lateCount > 0 && <em className="switch__count">{props.lateCount}</em>}
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
              schedules={props.allSchedules}
              onReachEdge={stepRange}
              projects={props.projects}
              phases={props.phases}
              milestones={props.milestones}
              markLate={props.markLate}
              selectedId={props.selectedId}
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
              schedules={props.schedules}
              teamById={teamById}
              markLate={props.markLate}
              selectedId={props.selectedId}
              onSelect={select}
              onCreate={canEdit ? openQuickFor : undefined}
            />
          ) : view === 'week' || view === 'day' ? (
            <TimeGridView
              days={view === 'day' ? 1 : 7}
              range={range}
              schedules={props.schedules}
              teamById={teamById}
              markLate={props.markLate}
              selectedId={props.selectedId}
              onSelect={select}
              onCreate={canEdit ? openQuickFor : undefined}
            />
          ) : view === 'workload' ? (
            <WorkloadView
              range={range}
              schedules={props.schedules}
              members={props.members}
              teams={props.teams}
              phases={props.phases}
              projects={props.projects}
              assigneeMap={assigneesBySchedule}
              markLate={props.markLate}
              selectedId={props.selectedId}
              onSelect={select}
            />
          ) : view === 'timeline' ? (
            <TimelineView
              range={range}
              scale={scale}
              schedules={props.schedules}
              milestones={props.milestones}
              teamById={teamById}
              dependencies={props.dependencies}
              markLate={props.markLate}
              selectedId={props.selectedId}
              onSelect={select}
              canEdit={canEdit}
              onToast={say}
            />
          ) : (
            <MilestoneView
              projects={props.projects}
              milestones={props.milestones}
              schedules={props.schedules}
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
          지연 <b style={{ color: props.lateCount ? 'var(--warn)' : undefined }}>{props.lateCount}</b>
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
