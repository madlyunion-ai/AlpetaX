import {
  addDays,
  differenceInCalendarDays,
  differenceInMinutes,
  endOfDay,
  startOfDay,
} from 'date-fns';
import type { Schedule } from './types';

/* ──────────────────────────────────────────────────────────────────────
   월 뷰 — 주 단위 막대 + 레인 배정
   ────────────────────────────────────────────────────────────────────── */

export interface WeekBar {
  schedule: Schedule;
  /** 그 주 안에서의 시작 열 (0=월요일) */
  startCol: number;
  /** 끝 열 (포함) */
  endCol: number;
  /** 왼쪽이 이전 주로 이어지는가 */
  clippedStart: boolean;
  clippedEnd: boolean;
}

export interface LaneBar extends WeekBar {
  lane: number;
}

/**
 * 한 주(7칸) 안에서 일정을 막대로 자른다.
 * 여러 날에 걸친 일정은 주 경계에서 끊기고 clipped 플래그가 선다.
 */
export function barsForWeek(schedules: Schedule[], weekStart: Date): WeekBar[] {
  const weekEnd = endOfDay(addDays(weekStart, 6));
  const bars: WeekBar[] = [];

  for (const s of schedules) {
    const start = new Date(s.start_at);
    const end = new Date(s.end_at);
    if (end < weekStart || start > weekEnd) continue;

    const rawStartCol = differenceInCalendarDays(startOfDay(start), weekStart);
    const rawEndCol = differenceInCalendarDays(startOfDay(end), weekStart);

    bars.push({
      schedule: s,
      startCol: Math.max(0, rawStartCol),
      endCol: Math.min(6, rawEndCol),
      clippedStart: rawStartCol < 0,
      clippedEnd: rawEndCol > 6,
    });
  }
  return bars;
}

/**
 * 겹치지 않는 막대끼리 같은 레인(세로 위치)을 공유하게 배정한다.
 *
 * 시작이 이른 순 → 긴 순으로 정렬해 넣는 이유: 긴 일정이 위쪽 레인을 먼저
 * 차지해야 그 주 내내 같은 높이에 머물고, 읽는 사람의 시선이 끊기지 않는다.
 */
export function assignLanes(bars: WeekBar[]): LaneBar[] {
  const lanes: WeekBar[][] = [];
  const sorted = [...bars].sort(
    (a, b) =>
      a.startCol - b.startCol ||
      b.endCol - b.startCol - (a.endCol - a.startCol) ||
      a.schedule.id.localeCompare(b.schedule.id),
  );

  const out: LaneBar[] = [];
  for (const bar of sorted) {
    let lane = lanes.findIndex((l) => l.every((b) => b.endCol < bar.startCol || b.startCol > bar.endCol));
    if (lane === -1) {
      lanes.push([]);
      lane = lanes.length - 1;
    }
    lanes[lane].push(bar);
    out.push({ ...bar, lane });
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────
   주/일 뷰 — 시간 그리드 겹침 열 분할
   ────────────────────────────────────────────────────────────────────── */

export interface TimedBlock {
  schedule: Schedule;
  /** 자정 기준 분 */
  startMin: number;
  endMin: number;
  /** 0..1 좌측 위치 비율 */
  left: number;
  /** 0..1 폭 비율 */
  width: number;
}

/**
 * 같은 시간대에 겹치는 N개를 폭 1/N 로 나눠 나란히 놓는다.
 * 겹침 묶음(cluster)별로 독립 계산하므로 한 칸만 겹쳐도 전체가 좁아지지 않는다.
 */
export function layoutDayColumn(schedules: Schedule[], day: Date): TimedBlock[] {
  const dayStart = startOfDay(day);
  const items = schedules
    .map((s) => {
      const start = new Date(s.start_at);
      const end = new Date(s.end_at);
      const startMin = Math.max(0, differenceInMinutes(start, dayStart));
      const endMin = Math.min(1440, differenceInMinutes(end, dayStart));
      // 너무 짧은 일정도 최소 30분 높이는 확보해야 클릭할 수 있다
      return { schedule: s, startMin, endMin: Math.max(endMin, startMin + 30) };
    })
    .filter((i) => i.endMin > 0 && i.startMin < 1440)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out: TimedBlock[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    // 클러스터 안에서 열 배정
    const cols: number[] = []; // 각 열의 마지막 끝 시각
    const placed = cluster.map((it) => {
      let col = cols.findIndex((endMin) => endMin <= it.startMin);
      if (col === -1) {
        cols.push(it.endMin);
        col = cols.length - 1;
      } else {
        cols[col] = it.endMin;
      }
      return { it, col };
    });
    const n = cols.length;
    for (const { it, col } of placed) {
      out.push({ ...it, left: col / n, width: 1 / n });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();

  return out;
}

/* ──────────────────────────────────────────────────────────────────────
   로드맵 — 연속 구간의 레인 패킹
   ────────────────────────────────────────────────────────────────────── */

export interface PackedBar {
  schedule: Schedule;
  startMs: number;
  endMs: number;
  lane: number;
}

/**
 * 한 띠(band) 안에서 겹치지 않는 일정끼리 같은 레인을 쓰게 묶는다.
 * assignLanes 가 주 단위 7칸 격자용이라면 이쪽은 연속 시간축용이다.
 *
 * `minGapMs` 는 시각적 여백: 픽셀로 1~2px 붙어 있는 두 바를 같은 레인에 두면
 * 서로 다른 일정이 하나로 읽힌다. 그래서 스케일에 해당하는 최소 간격을 둔다.
 */
export function packLanes(schedules: Schedule[], minGapMs = 0): PackedBar[] {
  const items = schedules
    .map((s) => ({ schedule: s, startMs: +new Date(s.start_at), endMs: +new Date(s.end_at) }))
    .sort(
      (a, b) =>
        a.startMs - b.startMs ||
        b.endMs - b.startMs - (a.endMs - a.startMs) ||
        a.schedule.id.localeCompare(b.schedule.id),
    );

  // 각 레인이 현재까지 채워진 끝 시각
  const laneEnd: number[] = [];
  const out: PackedBar[] = [];

  for (const it of items) {
    let lane = laneEnd.findIndex((end) => end + minGapMs <= it.startMs);
    if (lane === -1) {
      laneEnd.push(it.endMs);
      lane = laneEnd.length - 1;
    } else {
      laneEnd[lane] = it.endMs;
    }
    out.push({ ...it, lane });
  }
  return out;
}

export function laneCount(bars: PackedBar[]): number {
  return bars.reduce((m, b) => Math.max(m, b.lane + 1), 0);
}

/* ──────────────────────────────────────────────────────────────────────
   타임라인 — 픽셀 ↔ 날짜 변환
   ────────────────────────────────────────────────────────────────────── */

export interface Scale {
  x: (d: Date | string) => number;
  date: (px: number) => Date;
  snap: (d: Date) => Date;
  totalWidth: number;
  pxPerDay: number;
  from: Date;
}

export const PX_PER_DAY = { day: 80, week: 25, month: 9, quarter: 3.6 } as const;

/**
 * 타임라인의 모든 좌표 계산은 여기 한 곳을 지난다.
 * 바 위치, 드래그 결과, 오늘 선, 마일스톤 마커가 전부 같은 변환을 쓴다.
 */
export function createScale(from: Date, to: Date, pxPerDay: number): Scale {
  const totalDays = Math.max(1, differenceInCalendarDays(to, from) + 1);
  return {
    pxPerDay,
    from,
    totalWidth: totalDays * pxPerDay,
    x: (d) => (differenceInMinutes(typeof d === 'string' ? new Date(d) : d, from) / 1440) * pxPerDay,
    date: (px) => new Date(from.getTime() + (px / pxPerDay) * 86_400_000),
    // 좁은 스케일에서는 시간 단위, 넓으면 날짜 단위로 떨어뜨린다
    snap: (d) => {
      if (pxPerDay >= 48) {
        const ms = 3_600_000;
        return new Date(Math.round(d.getTime() / ms) * ms);
      }
      return startOfDay(d);
    },
  };
}

/** 부모-자식 일정을 트리 순서로 평탄화한다(간트 좌측 열). */
export interface TreeRow {
  schedule: Schedule;
  depth: number;
  hasChildren: boolean;
}

export function flattenTree(schedules: Schedule[], collapsed: Set<string>): TreeRow[] {
  const byParent = new Map<string | null, Schedule[]>();
  const ids = new Set(schedules.map((s) => s.id));

  for (const s of schedules) {
    // 부모가 현재 결과 집합 밖이면 최상위로 올린다(범위 조회라 부모가 빠질 수 있다)
    const key = s.parent_id && ids.has(s.parent_id) ? s.parent_id : null;
    const list = byParent.get(key) ?? [];
    list.push(s);
    byParent.set(key, list);
  }

  const rows: TreeRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    const children = (byParent.get(parent) ?? []).sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime() ||
        a.id.localeCompare(b.id),
    );
    for (const s of children) {
      const kids = byParent.get(s.id) ?? [];
      rows.push({ schedule: s, depth, hasChildren: kids.length > 0 });
      if (kids.length && !collapsed.has(s.id)) walk(s.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** 선택 상자에 넣을 묶음 하나 */
export interface ProjectGroup {
  name: string;
  items: Schedule[];
}

/**
 * 일정을 프로젝트별로 묶는다 — 상위 일정을 고를 때 쓴다.
 *
 * 목록이 평평하면 이름이 비슷한 일정 중 어느 프로젝트 것인지 알 수 없다.
 * 프로젝트 이름 아래로 갈라 두면 고르기 전에 소속이 보인다.
 *
 * 프로젝트 순서는 넘겨받은 순서를 그대로 따른다 — 사이드바·로드맵과 같은
 * 순서여야 눈이 익은 자리에서 찾을 수 있다. 소속 없는 일정은 맨 뒤로 모은다.
 * 빈 묶음은 돌려주지 않는다. 고를 것이 없는 제목만 남으면 방해만 된다.
 */
export function groupByProject(
  schedules: Schedule[],
  projects: { id: string; name: string }[],
  noneLabel = '프로젝트 없음',
): ProjectGroup[] {
  const byProject = new Map<string, Schedule[]>();
  for (const s of schedules) {
    const key = s.project_id ?? '';
    const list = byProject.get(key) ?? [];
    list.push(s);
    byProject.set(key, list);
  }

  const out: ProjectGroup[] = [];
  for (const p of projects) {
    const items = byProject.get(p.id);
    if (items?.length) out.push({ name: p.name, items });
  }
  const orphans = byProject.get('');
  if (orphans?.length) out.push({ name: noneLabel, items: orphans });
  return out;
}
