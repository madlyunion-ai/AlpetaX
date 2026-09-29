import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { Schedule } from './types';
import type { DateRange } from './range';

export interface WorkloadStat {
  total: number;
  upcoming: number;
  active: number;
  /** 지연 — 상태가 blocked 이거나, 끝나야 할 날이 지났는데 안 끝난 것 */
  late: number;
  done: number;
  /** 기간으로 가중 평균한 진행률. 일정이 없으면 null */
  avgProgress: number | null;
  /**
   * 조회 구간 안에서 실제로 일이 잡혀 있는 날 수.
   * 겹치는 일정은 한 번만 센다 — 같은 날 세 건이 있다고 하루가 3일이 되지는 않는다.
   */
  busyDays: number;
  /** 구간 전체 일수 대비 busyDays 비율 0~100 */
  busyRatio: number;
}

const DAY = 86_400_000;

export function workloadFor(
  schedules: Schedule[],
  range: DateRange,
  now = new Date(),
): WorkloadStat {
  const today = startOfDay(now);
  const rangeStart = startOfDay(range.start);
  const rangeDays = Math.max(1, differenceInCalendarDays(range.end, range.start) + 1);

  let upcoming = 0;
  let active = 0;
  let late = 0;
  let done = 0;
  let weighted = 0;
  let totalDays = 0;

  // 날짜 칸을 직접 세면 같은 날이 여러 번 더해진다. 집합으로 한 번만 센다.
  const busy = new Set<number>();

  for (const s of schedules) {
    const start = new Date(s.start_at);
    const end = new Date(s.end_at);

    if (s.status === 'done') done++;
    else if (s.status === 'blocked') late++;
    else if (s.status === 'cancelled') {
      /* 취소는 어느 칸에도 넣지 않는다 */
    } else if (end < today) late++;
    else if (s.status === 'active') active++;
    else upcoming++;

    const days = Math.max(1, differenceInCalendarDays(end, start) + 1);
    weighted += days * (s.status === 'done' ? 100 : s.progress);
    totalDays += days;

    if (s.status === 'cancelled') continue;
    const from = Math.max(0, differenceInCalendarDays(start, rangeStart));
    const to = Math.min(rangeDays - 1, differenceInCalendarDays(end, rangeStart));
    for (let d = from; d <= to; d++) busy.add(d);
  }

  return {
    total: schedules.length,
    upcoming,
    active,
    late,
    done,
    avgProgress: totalDays ? Math.round(weighted / totalDays) : null,
    busyDays: busy.size,
    busyRatio: Math.round((busy.size / rangeDays) * 100),
  };
}

/**
 * 지연 판정 — 화면 전체가 이 함수 하나를 본다.
 * 막혔다고 표시된 일, 또는 끝나야 할 날이 지났는데 안 끝난 일이다.
 * workloadFor 의 late 집계와 같은 규칙을 써야 "지연 3" 과 목록이 어긋나지 않는다.
 */
export function isLate(s: Schedule, now = new Date()): boolean {
  if (s.status === 'done' || s.status === 'cancelled') return false;
  if (s.status === 'blocked') return true;
  return startOfDay(new Date(s.end_at)) < startOfDay(now);
}

/** 지금 손대고 있어야 하는 일의 종류. 목록 정렬과 배지 색이 이 값을 따른다. */
export type ActiveKind = 'blocked' | 'late' | 'running';

export interface ActiveTask {
  schedule: Schedule;
  kind: ActiveKind;
  /** 마감까지 남은 날. 오늘 마감이면 0, 지났으면 음수 */
  daysLeft: number;
}

/**
 * "지금 진행 중인" 일만 고른다.
 *
 * 무엇을 넣고 무엇을 뺐는지가 이 목록의 뜻을 정한다:
 *   - 끝난 일·취소한 일은 뺀다. 지금 할 일이 아니다.
 *   - 아직 시작일이 오지 않은 일도 뺀다. 그건 예정이지 진행이 아니다.
 *   - 마감이 지났는데 안 끝난 일은 넣는다. 오히려 가장 먼저 봐야 한다.
 * 급한 것부터 — 막힌 일, 늦은 일, 그다음 마감이 가까운 순이다.
 */
export function activeNow(schedules: Schedule[], now = new Date()): ActiveTask[] {
  const today = startOfDay(now);
  const RANK: Record<ActiveKind, number> = { blocked: 0, late: 1, running: 2 };
  const out: ActiveTask[] = [];

  for (const s of schedules) {
    if (s.status === 'done' || s.status === 'cancelled') continue;

    const start = startOfDay(new Date(s.start_at));
    const end = startOfDay(new Date(s.end_at));
    const daysLeft = differenceInCalendarDays(end, today);

    let kind: ActiveKind;
    if (s.status === 'blocked') kind = 'blocked';
    else if (daysLeft < 0) kind = 'late';
    else if (start <= today) kind = 'running';
    else continue; // 아직 시작 전

    out.push({ schedule: s, kind, daysLeft });
  }

  return out.sort(
    (a, b) =>
      RANK[a.kind] - RANK[b.kind] ||
      a.daysLeft - b.daysLeft ||
      a.schedule.title.localeCompare(b.schedule.title, 'ko'),
  );
}

/** 겹치는 일정이 하루에 몇 건까지 쌓이는지 — 과부하 신호 */
export function peakConcurrency(schedules: Schedule[]): number {
  const edges: { at: number; delta: number }[] = [];
  for (const s of schedules) {
    if (s.status === 'cancelled' || s.status === 'done') continue;
    edges.push({ at: +startOfDay(new Date(s.start_at)), delta: 1 });
    edges.push({ at: +startOfDay(new Date(s.end_at)) + DAY, delta: -1 });
  }
  edges.sort((a, b) => a.at - b.at || a.delta - b.delta);

  let cur = 0;
  let peak = 0;
  for (const e of edges) {
    cur += e.delta;
    if (cur > peak) peak = cur;
  }
  return peak;
}
