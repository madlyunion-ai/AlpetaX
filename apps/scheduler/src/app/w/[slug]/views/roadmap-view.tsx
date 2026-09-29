'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { createScale, laneCount, packLanes, type PackedBar } from '@/lib/schedule-core/layout';
import type { DateRange } from '@/lib/schedule-core/range';
import { barColor } from './bar-color';
import { milestoneStat, milestoneTiming } from '@/lib/schedule-core/milestone';
import { WEEK_STARTS_ON } from '@/lib/schedule-core/holidays';
import { updateProject } from '../../../settings-actions';
import type { Milestone, Phase, Project, Schedule, TimeScale } from '@/lib/schedule-core/types';

/** 스케일별 주 1칸의 폭. 헤더의 1W~4W 칸에 해당한다. */
const PX_PER_WEEK: Record<TimeScale, number> = { day: 84, week: 54, month: 34, quarter: 21 };

const BAR_H = 22;
const LANE_GAP = 6;
const BAND_PAD = 8;
/**
 * 캔버스 측정 없이 글자 폭을 어림한다.
 * 한글·한자·가나는 글자 크기 그대로, 나머지는 약 55% 로 본다.
 */
function approxTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    const wide =
      (c >= 0x1100 && c <= 0x11ff) || // 한글 자모
      (c >= 0x3000 && c <= 0x9fff) || // CJK 문장부호·가나·한자
      (c >= 0xac00 && c <= 0xd7af) || // 한글 음절
      (c >= 0xff00 && c <= 0xffef); // 전각
    w += wide ? fontSize : fontSize * 0.55;
  }
  return w;
}

/* 좌측 두 칸은 글자에 맞춰 늘고 줄되, 캔버스를 잡아먹지 않게 상한을 둔다. */
const PROJ_FONT = 14;
const PROJ_PAD = 40; // 좌 12 + 메뉴 버튼 자리 24 + 여유 4
const PROJ_MIN = 88;
const PROJ_MAX = 220;

const PHASE_FONT = 12;
const PHASE_PAD = 14; // 좌우 6 + 여유 2
const PHASE_MIN = 40;
const PHASE_MAX = 120;
/** 한글 두 글자 폭 — 업무구분 이름이 맞춰 설 기준선 */
const PHASE_TARGET = PHASE_FONT * 2;

/**
 * 'UI·UX' 처럼 라틴 글자가 섞인 이름은 글자 수가 많아 한글 두 글자보다 넓어진다.
 * 칸에서 혼자 튀지 않게 글자 크기로 먼저 줄이고, 남는 차이를 자간으로 좁힌다.
 * 한글만 있는 이름은 글자당 폭이 이미 일정해 손대지 않는다.
 */
function condensePhase(name: string): { fontSize: number; letterSpacing: number } | null {
  if (!/[A-Za-z]/.test(name)) return null;

  const natural = approxTextWidth(name, PHASE_FONT);
  if (natural <= PHASE_TARGET) return null;

  // 10px 아래로는 읽기 어려워진다 — 거기서 멈추고 나머지는 자간이 맡는다
  const fontSize = Math.max(10, PHASE_FONT * (PHASE_TARGET / natural));
  const shrunk = approxTextWidth(name, fontSize);
  const gaps = Math.max(1, [...name].length - 1);
  const letterSpacing = Math.max(-0.8, (PHASE_TARGET - shrunk) / gaps);

  return {
    fontSize: Math.round(fontSize * 10) / 10,
    letterSpacing: Math.round(letterSpacing * 100) / 100,
  };
}

/** 칸 폭을 잴 때도 좁힌 뒤의 폭을 쓴다 — 안 그러면 쓰지 않을 자리를 예약한다 */
function phaseLabelWidth(name: string): number {
  return condensePhase(name) ? PHASE_TARGET : approxTextWidth(name, PHASE_FONT);
}
const HEAD_H = 53; // globals.css 의 --rm-head-h 와 같은 값. 팝오버 위치 계산에만 쓴다
const MS_LANE_H = 26; // 마일스톤 전용 줄

interface Props {
  range: DateRange;
  scale: TimeScale;
  /**
   * 워크스페이스의 모든 일정. 보이는 기간 밖의 것도 들어 있다.
   *
   * 트리의 줄은 이 목록으로 만든다 — 기간을 옮겼다고 프로젝트나 업무구분 줄이
   * 사라지면, 일정을 등록해 둔 사람에게는 없어진 것처럼 보인다. 줄과 높이는
   * 그대로 두고, 막대만 기간 안일 때 그린다.
   */
  schedules: Schedule[];
  projects: Project[];
  phases: Phase[];
  milestones: Milestone[];
  /** 지연을 빨강으로 강조할지 — 툴바 스위치가 정한다 */
  markLate: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * 가로 끝까지 밀었을 때. -1 은 과거, 1 은 미래로 기간을 한 칸 옮긴다.
   * 뷰가 직접 URL 을 만지지 않는 이유 — 기간을 정하는 규칙은 셸에 한 곳뿐이고,
   * 이전/다음 버튼도 같은 길을 쓴다.
   */
  onReachEdge?: (dir: -1 | 1) => void;
  /** 마일스톤 마커를 눌렀을 때 — 마일스톤 뷰로 보낸다 */
  onOpenMilestones: () => void;
  canEdit: boolean;
  workspaceSlug: string;
  onToast: (msg: string) => void;
}

interface Band {
  key: string;
  /** 좌측 1열 — 프로젝트 */
  projectId: string | null;
  projectName: string;
  projectColor: string;
  /** 좌측 2열 — 업무구분 */
  phaseName: string;
  barColor: string;
  bars: PackedBar[];
  height: number;
  /** 이 프로젝트의 첫 띠인가 — 세로 라벨을 여기서만 그린다 */
  projectStart: boolean;
  /** 마지막 띠인가 — 여기 아래에 프로젝트 구분선을 긋는다 */
  projectEnd: boolean;
  projectSpan: number;
}

export function RoadmapView({
  range,
  scale,
  schedules,
  projects,
  phases,
  milestones,
  markLate,
  selectedId,
  onSelect,
  onReachEdge,
  onOpenMilestones,
  canEdit,
  workspaceSlug,
  onToast,
}: Props) {
  const pxPerWeek = PX_PER_WEEK[scale];
  const sc = useMemo(() => createScale(range.start, range.end, pxPerWeek / 7), [range, pxPerWeek]);

  /**
   * 두 칸 모두 실제로 화면에 나올 이름만 재서 폭을 정한다.
   * '프로젝트 없음'·'미지정'은 그런 일정이 있을 때만 줄이 생기므로,
   * 없으면 후보에서 빼 괜히 칸이 넓어지지 않게 한다.
   */
  const { projW, phaseW } = useMemo(() => {
    const projectNames = projects.map((p) => p.name);
    if (schedules.some((s) => !s.project_id)) projectNames.push('프로젝트 없음');

    const phaseNames = phases.map((p) => p.name);
    const phaseIds = new Set(phases.map((p) => p.id));
    if (schedules.some((s) => !s.phase_id || !phaseIds.has(s.phase_id))) phaseNames.push('미지정');

    const fit = (
      names: string[],
      measure: (n: string) => number,
      pad: number,
      min: number,
      max: number,
    ) => {
      if (!names.length) return min;
      const widest = Math.max(...names.map(measure));
      return Math.round(Math.min(max, Math.max(min, widest + pad)));
    };

    return {
      projW: fit(projectNames, (n) => approxTextWidth(n, PROJ_FONT), PROJ_PAD, PROJ_MIN, PROJ_MAX),
      phaseW: fit(phaseNames, phaseLabelWidth, PHASE_PAD, PHASE_MIN, PHASE_MAX),
    };
  }, [projects, phases, schedules]);
  const treeW = projW + phaseW;

  const headRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /*
   * 끝에 닿아 기간을 옮기는 중인지. 요청을 보내고 새 범위가 올 때까지
   * 스크롤 이벤트는 계속 들어오므로, 막아 두지 않으면 한 번 밀었을 뿐인데
   * 몇 달이 한꺼번에 건너뛴다.
   */
  const shifting = useRef(false);
  /** 직전 범위. 새 범위가 오면 그 차이만큼 스크롤을 되밀어 화면을 붙잡는다. */
  const prevStart = useRef(range.start);

  /**
   * 헤더는 가로만, 좌측 트리는 세로만 본문 스크롤을 따라간다.
   * 스크롤바를 드러내는 data-scrolling 도 여기서 함께 세운다 — 같은 이벤트라
   * 리스너를 따로 붙일 이유가 없다.
   */
  const onScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (headRef.current) headRef.current.scrollLeft = el.scrollLeft;
    if (treeRef.current) treeRef.current.scrollTop = el.scrollTop;

    /*
     * 양 끝에 닿으면 기간을 옮긴다. 여백을 두는 이유: 정확히 0 까지 밀어야
     * 반응하면 트랙패드 관성으로 멈춘 위치에서는 영영 걸리지 않는다.
     */
    const EDGE = 48;
    if (!shifting.current && onReachEdge) {
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft <= EDGE) {
        shifting.current = true;
        onReachEdge(-1);
      } else if (max > 0 && el.scrollLeft >= max - EDGE) {
        shifting.current = true;
        onReachEdge(1);
      }
    }

    el.dataset.scrolling = 'true';
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      el.dataset.scrolling = 'false';
    }, 700);
  }, [onReachEdge]);

  /* ── 헤더 눈금: 년 / 월 / 주 ────────────────────────────────────── */
  const { years, months, weeks } = useMemo(() => {
    const years: { x: number; w: number; label: string }[] = [];
    const months: { x: number; w: number; label: string; isFirst: boolean }[] = [];
    const weeks: { x: number; w: number; label: string }[] = [];

    for (let m = startOfMonth(range.start); m <= range.end; m = addMonths(m, 1)) {
      const mEnd = endOfMonth(m);
      const x = sc.x(m);
      const w = sc.x(addDays(mEnd, 1)) - x;
      months.push({ x, w, label: `${m.getMonth() + 1}월`, isFirst: m.getMonth() === 0 });

      // 그 달에 걸친 주를 1W, 2W… 로 센다
      let n = 0;
      for (let dd = startOfWeek(m, { weekStartsOn: WEEK_STARTS_ON }); dd <= mEnd; dd = addDays(dd, 7)) {
        const wx = dd < m ? sc.x(m) : sc.x(dd);
        const ww = Math.min(sc.x(addDays(dd, 7)), sc.x(addDays(mEnd, 1))) - wx;
        if (ww > 3) weeks.push({ x: wx, w: ww, label: `${++n}W` });
      }
    }

    let cur: { year: number; x: number; end: number } | null = null;
    for (let m = startOfMonth(range.start); m <= range.end; m = addMonths(m, 1)) {
      const x = sc.x(m);
      const e = sc.x(addDays(endOfMonth(m), 1));
      if (!cur || cur.year !== m.getFullYear()) {
        if (cur) years.push({ x: cur.x, w: cur.end - cur.x, label: `${cur.year}년` });
        cur = { year: m.getFullYear(), x, end: e };
      } else {
        cur.end = e;
      }
    }
    if (cur) years.push({ x: cur.x, w: cur.end - cur.x, label: `${cur.year}년` });

    return { years, months, weeks };
  }, [range, sc]);

  /* ── 프로젝트 × 단계 띠 ─────────────────────────────────────────── */
  const bands = useMemo<Band[]>(() => {
    const phaseById = new Map(phases.map((p) => [p.id, p]));
    const sortedPhases = [...phases].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
    );

    // 바 하나 폭만큼의 시간. 이만큼 안 떨어지면 같은 레인에 붙이지 않는다.
    const minGapMs = (6 / (pxPerWeek / 7)) * 86_400_000;

    const rows: Omit<Band, 'projectStart' | 'projectEnd' | 'projectSpan'>[] = [];

    const push = (
      key: string,
      projectId: string | null,
      projectName: string,
      projectColor: string,
      phaseName: string,
      barColor: string,
      list: Schedule[],
    ) => {
      if (!list.length) return;
      // 레인 배정은 전체 목록으로 한다 — 보이는 것만으로 계산하면 기간을
      // 옮길 때마다 같은 막대가 다른 줄로 옮겨 다닌다.
      const bars = packLanes(list, minGapMs);
      const lanes = Math.max(1, laneCount(bars));
      rows.push({
        key,
        projectId,
        projectName,
        projectColor,
        phaseName,
        barColor,
        bars,
        height: lanes * BAR_H + (lanes - 1) * LANE_GAP + BAND_PAD * 2,
      });
    };

    const forProject = (pid: string | null, name: string, color: string) => {
      const mine = schedules.filter((s) => s.project_id === pid);
      if (!mine.length) return;

      for (const ph of sortedPhases) {
        push(
          `${pid ?? 'none'}:${ph.id}`,
          pid,
          name,
          color,
          ph.name,
          ph.color,
          mine.filter((s) => s.phase_id === ph.id),
        );
      }
      // 업무구분을 지정하지 않은 일정도 숨기지 않는다
      push(
        `${pid ?? 'none'}:nophase`,
        pid,
        name,
        color,
        '미지정',
        '#7B8698',
        mine.filter((s) => !s.phase_id || !phaseById.has(s.phase_id)),
      );
    };

    for (const p of projects) forProject(p.id, p.name, p.color);
    forProject(null, '프로젝트 없음', 'var(--ink-3)');

    // 같은 프로젝트가 연속한 만큼을 세어 세로 라벨 높이를 정한다
    const out: Band[] = [];
    let i = 0;
    while (i < rows.length) {
      let j = i;
      let span = 0;
      while (j < rows.length && rows[j].projectName === rows[i].projectName) {
        span += rows[j].height;
        j++;
      }
      for (let k = i; k < j; k++)
        out.push({ ...rows[k], projectStart: k === i, projectEnd: k === j - 1, projectSpan: span });
      i = j;
    }
    return out;
  }, [projects, phases, schedules, pxPerWeek]);

  // 오늘 0시. 이보다 앞서 끝난 일정은 지나간 것으로 흐리게 그린다.
  const todayStart = useMemo(() => startOfDay(new Date()), []);

  /*
   * 범위가 바뀌면 그만큼 스크롤을 되민다.
   *
   * 이게 없으면 끝에 닿아 기간이 옮겨질 때 화면이 통째로 튄다 — 새 범위는
   * 더 이른 날부터 시작하므로 같은 scrollLeft 가 다른 날짜를 가리킨다.
   * 앞쪽에 붙은 날 수만큼 밀어 주면 보고 있던 자리가 그대로 남는다.
   *
   * 그리기 전에 옮겨야 하므로 useLayoutEffect 를 쓴다. useEffect 면 한 프레임
   * 동안 튄 화면이 보인다.
   */
  useLayoutEffect(() => {
    const el = bodyRef.current;
    shifting.current = false;
    if (!el) return;

    const shiftDays = differenceInCalendarDays(prevStart.current, range.start);
    prevStart.current = range.start;
    if (!shiftDays) return;

    const max = el.scrollWidth - el.clientWidth;
    const next = el.scrollLeft + shiftDays * (pxPerWeek / 7);
    // 「오늘」처럼 멀리 뛰면 보정이 범위를 벗어난다 — 그때는 끝에 붙인다.
    el.scrollLeft = Math.max(0, Math.min(max, next));
    if (headRef.current) headRef.current.scrollLeft = el.scrollLeft;
  }, [range, pxPerWeek]);

  const bandsHeight = bands.reduce((s, b) => s + b.height, 0);
  const totalHeight = MS_LANE_H + bandsHeight;
  const todayX = sc.x(new Date());
  const showToday = todayX >= 0 && todayX <= sc.totalWidth;

  /** 화면 안에 들어오는 마일스톤만, 통계와 프로젝트 이름까지 붙여서 */
  const visibleMilestones = useMemo(() => {
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    return milestones
      .map((m) => ({
        m,
        due: new Date(`${m.due_on}T00:00:00`),
        stat: milestoneStat(m, schedules),
        project: projectName.get(m.project_id) ?? '프로젝트 없음',
      }))
      .filter(({ due }) => due >= range.start && due <= range.end)
      .sort((a, b) => +a.due - +b.due);
  }, [milestones, projects, schedules, range]);

  // 마우스를 올린 마일스톤. 호버 카드를 canvas 안에 절대 위치로 띄운다.
  const [hovered, setHovered] = useState<string | null>(null);

  /** 좌측 세로 라벨을 눌러 여는 프로젝트 설정. top 은 클릭 지점에 맞춘다. */
  const [editing, setEditing] = useState<{ id: string; top: number } | null>(null);
  const [, startTx] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  const editingProject = editing ? (projects.find((p) => p.id === editing.id) ?? null) : null;

  if (!bands.length) {
    return (
      <div className="empty">
        <b>이 기간에 일정이 없습니다.</b>
        <span style={{ fontSize: 12 }}>‘+ 일정’ 으로 추가하거나 기간을 옮겨 보세요.</span>
      </div>
    );
  }

  return (
    <div
      className="rm"
      ref={rootRef}
      style={{
        ['--tree-w' as string]: `${treeW}px`,
        ['--proj-w' as string]: `${projW}px`,
      }}
    >
      <div className="rm__corner">
        <span className="mono">프로젝트 / 업무구분</span>
      </div>

      {/* 3단 헤더 */}
      <div className="rm__head" ref={headRef}>
        <div className="rm__headinner" style={{ width: sc.totalWidth }}>
          {years.map((y) => (
            <span key={y.label} className="rm__year" style={{ left: y.x, width: y.w }}>
              {y.label}
            </span>
          ))}
          {months.map((m, i) => (
            <span key={i} className="rm__month" data-newyear={m.isFirst} style={{ left: m.x, width: m.w }}>
              {m.label}
            </span>
          ))}
          {weeks.map((w, i) => (
            <span key={i} className="rm__week" style={{ left: w.x, width: w.w }}>
              {w.w > 22 ? w.label : ''}
            </span>
          ))}
        </div>
      </div>

      {/* 좌측: 1열 프로젝트(세로) + 2열 업무구분 */}
      <div className="rm__tree" ref={treeRef}>
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div className="rm__treeband rm__treeband--ms" style={{ height: MS_LANE_H }}>
            <span className="rm__mslabel">
              마일스톤
              <span className="badge">{visibleMilestones.length}</span>
            </span>
          </div>
          {bands.map((b) => (
            <div
              className="rm__treeband"
              key={b.key}
              data-projectend={b.projectEnd}
              style={{ height: b.height }}
            >
              {b.projectStart && (
                <span
                  className="rm__project"
                  data-gear={Boolean(b.projectId)}
                  style={{ height: b.projectSpan, background: b.projectColor }}
                >
                  <span className="rm__projectname" title={b.projectName}>
                    {b.projectName}
                  </span>
                  {b.projectId && (
                    <button
                      className="rm__gear"
                      aria-haspopup="dialog"
                      aria-label={`${b.projectName} 설정`}
                      title={`${b.projectName} 설정`}
                      onClick={(e) => {
                        const root = rootRef.current?.getBoundingClientRect();
                        const y = e.currentTarget.getBoundingClientRect().top - (root?.top ?? 0);
                        setEditing({ id: b.projectId!, top: Math.min(Math.max(HEAD_H + 8, y - 120), 9999) });
                      }}
                    >
                      <MenuIcon />
                    </button>
                  )}
                </span>
              )}
              <span className="rm__phase">
                <span
                  className="rm__phasename"
                  title={b.phaseName}
                  style={condensePhase(b.phaseName) ?? undefined}
                >
                  {b.phaseName}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div className="rm__body quiet-scroll quiet-scroll--xy" ref={bodyRef} onScroll={onScroll}>
        <div className="rm__canvas" style={{ width: sc.totalWidth, height: totalHeight }}>
          {todayX > 0 && (
            <span className="rm__past" style={{ width: Math.min(todayX, sc.totalWidth) }} aria-hidden="true" />
          )}

          <div className="rm__grid" aria-hidden="true">
            {weeks.map((w, i) => (
              <span key={i} className="rm__gridweek" style={{ left: w.x }} />
            ))}
            {months.map((m, i) => (
              <span key={i} className="rm__gridmonth" data-newyear={m.isFirst} style={{ left: m.x }} />
            ))}
          </div>

          {/* 마일스톤 수직 점선은 전체 높이로 내려간다 */}
          {visibleMilestones.map(({ m, due, stat }) => (
            <span
              key={`line-${m.id}`}
              className="rm__msline"
              data-late={stat.late}
              style={{ left: sc.x(due) }}
              aria-hidden="true"
            />
          ))}

          {showToday && <span className="rm__today" style={{ left: todayX }} aria-hidden="true" />}

          {/* 마일스톤 전용 줄 — 마커와 라벨이 여기 모인다 */}
          <div className="rm__mslane" style={{ height: MS_LANE_H }}>
            {showToday && <span className="rm__todaychip" style={{ left: todayX }}>오늘</span>}

            {visibleMilestones.map(({ m, due, stat, project }) => {
              const x = sc.x(due);
              const open = hovered === m.id;
              return (
                <span key={m.id}>
                  <button
                    className="rm__msmark"
                    data-late={stat.late}
                    data-reached={m.status === 'reached'}
                    style={{ left: x }}
                    aria-label={`마일스톤 ${m.title}, ${m.due_on}, ${milestoneTiming(stat, m.status)}`}
                    onMouseEnter={() => setHovered(m.id)}
                    onMouseLeave={() => setHovered((h) => (h === m.id ? null : h))}
                    onFocus={() => setHovered(m.id)}
                    onBlur={() => setHovered((h) => (h === m.id ? null : h))}
                    onClick={onOpenMilestones}
                  />
                  <span className="rm__mstext" style={{ left: x + 10 }} aria-hidden="true">
                    {m.title}
                  </span>

                  {open && (
                    <span className="rm__mscard" style={{ left: x }} role="tooltip">
                      <b className="rm__mscardtitle">{m.title}</b>
                      <span className="rm__mscardrow">
                        <span>프로젝트</span>
                        <b>{project}</b>
                      </span>
                      <span className="rm__mscardrow">
                        <span>기한</span>
                        <b>
                          {m.due_on} · {milestoneTiming(stat, m.status)}
                        </b>
                      </span>
                      <span className="rm__mscardrow">
                        <span>관련 일정</span>
                        <b>
                          {stat.relatedCount === 0
                            ? '없음'
                            : `${stat.relatedCount}건 · 진행 ${stat.progress}%`}
                        </b>
                      </span>
                      {stat.progress !== null && (
                        <span className="rm__mscardbar">
                          <span style={{ width: `${stat.progress}%` }} />
                        </span>
                      )}
                      {m.description && <span className="rm__mscarddesc">{m.description}</span>}
                      <span className="rm__mscardhint">클릭하면 마일스톤 목록으로 이동합니다</span>
                    </span>
                  )}
                </span>
              );
            })}

            {!visibleMilestones.length && (
              <span className="rm__msempty">
                이 기간에 마일스톤이 없습니다 — 마일스톤 탭에서 추가하세요
              </span>
            )}
          </div>

          {bands.map((b) => (
            <div
              className="rm__band"
              key={b.key}
              data-projectend={b.projectEnd}
              style={{ height: b.height }}
            >
              {b.bars.map((bar) => {
                const s = bar.schedule;
                // 보이는 기간과 겹치지 않으면 그리지 않는다. 줄과 높이는
                // 이미 잡혀 있으므로 자리는 그대로 남는다.
                if (new Date(s.end_at) < range.start || new Date(s.start_at) > range.end) return null;
                const x = sc.x(s.start_at);
                const w = Math.max(10, sc.x(s.end_at) - x);
                const days = differenceInCalendarDays(new Date(s.end_at), new Date(s.start_at)) + 1;
                const past = new Date(s.end_at) < todayStart;
                return (
                  <button
                    key={s.id}
                    className="rm__bar"
                    data-sel={s.id === selectedId}
                    data-done={s.status === 'done'}
                    data-past={past}
                    title={`${s.title} · ${days}일 · ${s.progress}%`}
                    style={{
                      left: x,
                      width: w,
                      top: BAND_PAD + bar.lane * (BAR_H + LANE_GAP),
                      background: barColor(s, b.barColor, markLate),
                    }}
                    onClick={() => onSelect(s.id)}
                  >
                    <span className="rm__barfill" style={{ width: `${s.progress}%` }} />
                    {w >= 62 && <span className="rm__barlabel">{s.title}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {editingProject && (
        <ProjectPopover
          key={editingProject.id}
          project={editingProject}
          top={editing!.top}
          canEdit={canEdit}
          workspaceSlug={workspaceSlug}
          onClose={() => setEditing(null)}
          onSave={(patch) =>
            startTx(async () => {
              const res = await updateProject(editingProject.id, patch);
              if (!res.ok) return onToast(res.error ?? '저장하지 못했습니다.');
              setEditing(null);
              onToast('프로젝트를 저장했습니다.');
            })
          }
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   프로젝트 설정 팝오버
   좌측 세로 라벨 옆에 붙어, 로드맵을 떠나지 않고 이름과 색을 고친다.
   ────────────────────────────────────────────────────────────────────── */

/** 색상환을 진한 줄·밝은 줄로 두 번 돈다 — 프로젝트가 많아도 이웃끼리 구분된다 */
const PROJECT_COLORS = [
  // 진한 줄
  '#2F3E6E',
  '#1F7A94',
  '#2E7D5B',
  '#7B3D8E',
  '#A33C5B',
  '#B05E22',
  '#4A5568',
  // 밝은 줄
  '#5B8DEF',
  '#2E9BB5',
  '#3FA372',
  '#A96AD1',
  '#D6455E',
  '#E8814A',
  '#7B8698',
];

/** 세로 점 세 개. 좁은 칸에서 톱니바퀴보다 형태가 또렷하다. */
function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="3.4" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="8" cy="12.6" r="1.4" />
    </svg>
  );
}

function ProjectPopover({
  project,
  top,
  canEdit,
  workspaceSlug,
  onClose,
  onSave,
}: {
  project: Project;
  top: number;
  canEdit: boolean;
  workspaceSlug: string;
  onClose: () => void;
  onSave: (patch: { name?: string; color?: string }) => void;
}) {
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);
  const dirty = name.trim() !== project.name || color !== project.color;

  return (
    <>
      <span className="rm__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="rm__popover" style={{ top }} role="dialog" aria-label="프로젝트 설정">
        <div className="rm__popoverhead">
          <span className="mono">프로젝트</span>
          <button className="btn btn--ghost" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="field">
          <label htmlFor="rm-pname">이름</label>
          <input
            id="rm-pname"
            className="input"
            autoFocus
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
        </div>

        <div className="field">
          <label>색</label>
          <div className="rm__swatches">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="rm__swatch"
                data-on={c === color}
                style={{ background: c }}
                aria-label={`색 ${c}`}
                disabled={!canEdit}
                onClick={() => setColor(c)}
              />
            ))}
            <input
              type="color"
              className="set__color"
              style={{ width: 26, height: 26 }}
              value={color}
              disabled={!canEdit}
              aria-label="직접 고르기"
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
        </div>

        {canEdit ? (
          <div className="rm__popoverfoot">
            <Link className="btn btn--ghost" href={`/w/${workspaceSlug}/settings`}>
              전체 설정
            </Link>
            <span style={{ flex: 1 }} />
            <button
              className="btn btn--primary"
              disabled={!dirty || !name.trim()}
              onClick={() => onSave({ name, color })}
            >
              저장
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>관리자만 바꿀 수 있습니다.</p>
        )}
      </div>
    </>
  );
}
