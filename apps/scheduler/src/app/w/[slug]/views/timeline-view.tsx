'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { addDays, addMonths, format, startOfMonth, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { createScale, flattenTree, PX_PER_DAY, type TreeRow } from '@/lib/schedule-core/layout';
import { HORIZON_ORDER } from '@/lib/schedule-core/horizon';
import { WEEK_STARTS_ON } from '@/lib/schedule-core/holidays';
import type { DateRange } from '@/lib/schedule-core/range';
import { barColor } from './bar-color';
import {
  HORIZON_LABEL,
  type Dependency,
  type Horizon,
  type Milestone,
  type Schedule,
  type Team,
  type TimeScale,
} from '@/lib/schedule-core/types';
import { moveSchedule, resizeSchedule } from '../../../actions';

const ROW_H = 36;
const SECTION_H = 28;

interface Props {
  range: DateRange;
  scale: TimeScale;
  schedules: Schedule[];
  milestones: Milestone[];
  teamById: Map<string, Team>;
  dependencies: Dependency[];
  /** 지연을 빨강으로 강조할지 — 툴바 스위치가 정한다 */
  markLate: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  canEdit: boolean;
  onToast: (msg: string) => void;
}

type Drag =
  | { kind: 'move'; id: string; startX: number; updatedAt: string }
  | { kind: 'resize'; id: string; edge: 'start' | 'end'; startX: number; updatedAt: string };

export function TimelineView({
  range,
  scale,
  schedules,
  milestones,
  teamById,
  dependencies,
  markLate,
  selectedId,
  onSelect,
  canEdit,
  onToast,
}: Props) {
  const pxPerDay = PX_PER_DAY[scale];
  const sc = useMemo(() => createScale(range.start, range.end, pxPerDay), [range, pxPerDay]);

  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  // 스케일이 넓으면 단기가, 좁으면 장기가 자동으로 접힌다. 손대면 그 선택이 이긴다.
  const autoCollapsed = useMemo<Set<Horizon>>(() => {
    if (scale === 'quarter') return new Set<Horizon>(['short']);
    if (scale === 'day') return new Set<Horizon>(['long']);
    return new Set<Horizon>();
  }, [scale]);
  const [manualSections, setManualSections] = useState<Map<Horizon, boolean>>(new Map());
  const isSectionOpen = (h: Horizon) => manualSections.get(h) ?? !autoCollapsed.has(h);

  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<{ id: string; dx: number; edge?: 'start' | 'end' } | null>(null);
  const [, startTx] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  /* 좌측 트리와 축을 본문 스크롤에 붙인다 */
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (axisRef.current) axisRef.current.scrollLeft = el.scrollLeft;
    if (treeRef.current) treeRef.current.scrollTop = el.scrollTop;
  }, []);

  /* ── horizon 섹션별 행 ─────────────────────────────────────────── */
  const sections = useMemo(() => {
    return HORIZON_ORDER.map((h) => ({
      horizon: h,
      rows: flattenTree(
        schedules.filter((s) => s.horizon === h),
        collapsedRows,
      ),
    }));
  }, [schedules, collapsedRows]);

  const rowIndex = useMemo(() => {
    const map = new Map<string, number>();
    let y = 0;
    for (const sec of sections) {
      y += SECTION_H;
      if (!isSectionOpen(sec.horizon)) continue;
      for (const r of sec.rows) {
        map.set(r.schedule.id, y);
        y += ROW_H;
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, manualSections, autoCollapsed]);

  const totalHeight = useMemo(() => {
    let y = 0;
    for (const sec of sections) {
      y += SECTION_H;
      if (isSectionOpen(sec.horizon)) y += sec.rows.length * ROW_H;
    }
    return Math.max(y, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, manualSections, autoCollapsed]);

  /* ── 드래그 ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!drag) return;

    function onMove(e: PointerEvent) {
      const dx = e.clientX - drag!.startX;
      setGhost({ id: drag!.id, dx, edge: drag!.kind === 'resize' ? drag!.edge : undefined });
    }

    function onUp(e: PointerEvent) {
      const dx = e.clientX - drag!.startX;
      const deltaMinutes = Math.round((dx / pxPerDay) * 1440);
      const snapped = pxPerDay >= 48 ? Math.round(deltaMinutes / 60) * 60 : Math.round(deltaMinutes / 1440) * 1440;
      setGhost(null);
      const d = drag!;
      setDrag(null);

      if (Math.abs(snapped) < 1) return;

      startTx(async () => {
        if (d.kind === 'move') {
          const res = await moveSchedule(d.id, snapped, d.updatedAt);
          if (!res.ok) onToast(res.error ?? '옮기지 못했습니다.');
        } else {
          const s = schedules.find((x) => x.id === d.id);
          if (!s) return;
          const base = new Date(d.edge === 'start' ? s.start_at : s.end_at);
          const next = new Date(base.getTime() + snapped * 60_000);
          const res = await resizeSchedule(d.id, d.edge, next.toISOString(), d.updatedAt);
          if (!res.ok) onToast(res.error ?? '기간을 바꾸지 못했습니다.');
        }
      });
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, pxPerDay, schedules, onToast]);

  /* ── 축 눈금 ───────────────────────────────────────────────────── */
  const ticks = useMemo(() => {
    const major: { x: number; label: string }[] = [];
    const minor: { x: number; label: string }[] = [];

    if (scale === 'day') {
      for (let d = startOfWeek(range.start, { weekStartsOn: WEEK_STARTS_ON }); d <= range.end; d = addDays(d, 7)) {
        major.push({ x: sc.x(d), label: format(d, 'M월 d일 주', { locale: ko }) });
      }
      for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
        minor.push({ x: sc.x(d), label: format(d, 'd') });
      }
    } else if (scale === 'week') {
      for (let d = startOfMonth(range.start); d <= range.end; d = addMonths(d, 1)) {
        major.push({ x: sc.x(d), label: format(d, 'yyyy년 M월', { locale: ko }) });
      }
      for (let d = startOfWeek(range.start, { weekStartsOn: WEEK_STARTS_ON }); d <= range.end; d = addDays(d, 7)) {
        minor.push({ x: sc.x(d), label: format(d, 'd') });
      }
    } else {
      const step = scale === 'month' ? 3 : 12;
      for (let d = startOfMonth(range.start); d <= range.end; d = addMonths(d, step)) {
        major.push({
          x: sc.x(d),
          label: scale === 'month' ? `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}` : `${d.getFullYear()}`,
        });
      }
      for (let d = startOfMonth(range.start); d <= range.end; d = addMonths(d, scale === 'month' ? 1 : 3)) {
        minor.push({ x: sc.x(d), label: scale === 'month' ? format(d, 'M') : `Q${Math.floor(d.getMonth() / 3) + 1}` });
      }
    }
    return { major, minor };
  }, [scale, range, sc]);

  const todayX = sc.x(new Date());
  const showToday = todayX >= 0 && todayX <= sc.totalWidth;

  const visibleMilestones = useMemo(
    () =>
      milestones.filter((m) => {
        const d = new Date(`${m.due_on}T00:00:00`);
        return d >= range.start && d <= range.end;
      }),
    [milestones, range],
  );

  /* ── 연결선 ────────────────────────────────────────────────────────
     두 가지를 그린다:
       · 선행관계(schedule_dependencies) — "이 일이 끝나야 저 일이 시작된다"
       · 상위 일정(parent_id)            — "저 일에 딸린 일이다"
     둘은 뜻이 다르지만 화면에서는 모두 '이어져 있다' 로 읽힌다. 상위 일정만
     걸어 두고 아무 선도 못 보면 연결이 안 된 것으로 오해하게 된다. */
  const arrows = useMemo(() => {
    const byId = new Map(schedules.map((s) => [s.id, s]));
    const out: { d: string; key: string; kind: 'dep' | 'parent' }[] = [];

    /** 두 줄을 잇는 꺾은선. 세로로 먼저 내려가고 가로로 붙는다. */
    const link = (a: Schedule, b: Schedule, kind: 'dep' | 'parent', key: string) => {
      const ay = rowIndex.get(a.id);
      const by = rowIndex.get(b.id);
      if (ay === undefined || by === undefined) return;
      const x1 = sc.x(a.end_at);
      const y1 = ay + ROW_H / 2;
      const x2 = sc.x(b.start_at);
      const y2 = by + ROW_H / 2;
      const mid = x1 + 10;
      out.push({ key, kind, d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}` });
    };

    // 상위 일정 — 부모의 끝에서 자식의 시작으로
    for (const s of schedules) {
      if (!s.parent_id) continue;
      const p = byId.get(s.parent_id);
      if (p) link(p, s, 'parent', `p-${s.id}`);
    }

    for (const dep of dependencies) {
      const a = byId.get(dep.predecessor_id);
      const b = byId.get(dep.successor_id);
      if (a && b) link(a, b, 'dep', `${dep.predecessor_id}-${dep.successor_id}`);
    }
    return out;
  }, [dependencies, schedules, rowIndex, sc]);

  if (!schedules.length) {
    return (
      <div className="empty">
        <b>이 기간에 일정이 없습니다.</b>
        <span style={{ fontSize: 12 }}>‘+ 일정’ 으로 추가하거나 기간을 옮겨 보세요.</span>
      </div>
    );
  }

  const renderRow = (r: TreeRow, left: boolean) => {
    const s = r.schedule;
    const team = s.team_id ? teamById.get(s.team_id) : undefined;

    if (left) {
      return (
        <button
          key={s.id}
          className="gantt__row"
          data-sel={s.id === selectedId}
          style={{ paddingLeft: 10 + r.depth * 14 }}
          onClick={() => onSelect(s.id)}
        >
          {r.hasChildren ? (
            <span
              className="gantt__twisty"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                const next = new Set(collapsedRows);
                if (next.has(s.id)) next.delete(s.id);
                else next.add(s.id);
                setCollapsedRows(next);
              }}
            >
              {collapsedRows.has(s.id) ? '▶' : '▼'}
            </span>
          ) : (
            <span className="gantt__twisty" />
          )}
          <span className="sidebar__dot" style={{ background: team?.color ?? 'var(--ink-3)' }} />
          <span className="gantt__rowtitle">{s.title}</span>
          <span className="mono" style={{ fontSize: 10 }}>
            {s.progress}%
          </span>
        </button>
      );
    }

    const x = sc.x(s.start_at);
    const w = Math.max(6, sc.x(s.end_at) - x);
    const g = ghost?.id === s.id ? ghost : null;
    const offsetLeft = g ? (g.edge === 'end' ? 0 : g.dx) : 0;
    const offsetWidth = g ? (g.edge === 'end' ? g.dx : g.edge === 'start' ? -g.dx : 0) : 0;

    return (
      <div className="gantt__track" key={s.id}>
        <button
          className="gantt__bar"
          data-sel={s.id === selectedId}
          data-done={s.status === 'done'}
          title={`${s.title} · ${s.progress}%`}
          style={{
            left: x + offsetLeft,
            width: Math.max(6, w + offsetWidth),
            background: barColor(s, team?.color, markLate),
            opacity: g ? 0.7 : 1,
          }}
          onClick={() => onSelect(s.id)}
          onPointerDown={(e) => {
            if (!canEdit || e.button !== 0) return;
            setDrag({ kind: 'move', id: s.id, startX: e.clientX, updatedAt: s.updated_at });
          }}
        >
          <span className="gantt__barfill" style={{ width: `${s.progress}%` }} />
          {w > 80 && <span className="gantt__barlabel">{s.title}</span>}
        </button>

        {canEdit && (
          <>
            <span
              className="gantt__handle"
              role="button"
              aria-label="시작 조절"
              tabIndex={-1}
              style={{ left: x + offsetLeft }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDrag({ kind: 'resize', id: s.id, edge: 'start', startX: e.clientX, updatedAt: s.updated_at });
              }}
            />
            <span
              className="gantt__handle"
              role="button"
              aria-label="종료 조절"
              tabIndex={-1}
              style={{ left: x + offsetLeft + Math.max(6, w + offsetWidth) - 7 }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDrag({ kind: 'resize', id: s.id, edge: 'end', startX: e.clientX, updatedAt: s.updated_at });
              }}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="gantt">
      <div className="gantt__tree">
        <div className="gantt__treehead">
          <span className="mono">일정</span>
        </div>
        <div className="gantt__treebody" ref={treeRef}>
          {sections.map((sec) => (
            <div key={sec.horizon}>
              <button
                className="gantt__section"
                style={{ ['--h' as string]: `var(--${sec.horizon})` }}
                onClick={() =>
                  setManualSections(new Map(manualSections).set(sec.horizon, !isSectionOpen(sec.horizon)))
                }
                aria-expanded={isSectionOpen(sec.horizon)}
              >
                <span style={{ color: 'var(--ink-3)', fontSize: 10 }}>
                  {isSectionOpen(sec.horizon) ? '▼' : '▶'}
                </span>
                <span className="gantt__sectionname" style={{ ['--h' as string]: `var(--${sec.horizon})` }}>
                  {HORIZON_LABEL[sec.horizon]}
                </span>
                <span className="mono" style={{ fontSize: 10 }}>
                  {sec.rows.length}
                </span>
              </button>
              {isSectionOpen(sec.horizon) && sec.rows.map((r) => renderRow(r, true))}
            </div>
          ))}
        </div>
      </div>

      <div className="gantt__right">
        <div className="gantt__axis" ref={axisRef}>
          <div className="gantt__axisinner" style={{ width: sc.totalWidth }}>
            {ticks.major.map((t, i) => (
              <span key={i} className="gantt__tickmajor" style={{ left: t.x }}>
                {t.label}
              </span>
            ))}
            {ticks.minor.map((t, i) => (
              <span key={i} className="gantt__tickminor" style={{ left: t.x }}>
                {t.label}
              </span>
            ))}
          </div>
        </div>

        <div className="gantt__scroll" ref={scrollRef} onScroll={onScroll}>
          <div style={{ width: sc.totalWidth, height: totalHeight, position: 'relative' }}>
            {/* 의존성 화살표 */}
            <svg
              width={sc.totalWidth}
              height={totalHeight}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}
              aria-hidden="true"
            >
              <defs>
                <marker id="arw" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="var(--ink-3)" />
                </marker>
              </defs>
              {/* 상위 일정은 점선, 선행관계는 실선 — 뜻이 다르므로 생김새도 다르게 */}
              {arrows.map((a) => (
                <path
                  key={a.key}
                  d={a.d}
                  fill="none"
                  stroke="var(--ink-3)"
                  strokeWidth="1.2"
                  strokeDasharray={a.kind === 'parent' ? '4 3' : undefined}
                  opacity={a.kind === 'parent' ? 0.65 : 1}
                  markerEnd="url(#arw)"
                />
              ))}
            </svg>

            {/* 마일스톤 수직선 */}
            {visibleMilestones.map((m) => {
              const d = new Date(`${m.due_on}T00:00:00`);
              const late = m.status === 'upcoming' && d < new Date();
              return (
                <span key={m.id}>
                  <span className="gantt__msline" style={{ left: sc.x(d) }} aria-hidden="true" />
                  <span
                    className="gantt__msmark"
                    data-late={late}
                    style={{ left: sc.x(d) }}
                    title={`${m.title} · ${m.due_on}`}
                  />
                </span>
              );
            })}

            {showToday && <span className="gantt__today" style={{ left: todayX }} aria-hidden="true" />}

            {sections.map((sec) => (
              <div key={sec.horizon}>
                <div className="gantt__sectionspacer" />
                {isSectionOpen(sec.horizon) && sec.rows.map((r) => renderRow(r, false))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
