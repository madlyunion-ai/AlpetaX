import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { WEEK_STARTS_ON } from './holidays';
import type { TimeScale, ViewKind } from './types';

export interface DateRange {
  start: Date;
  end: Date;
}

const WEEK_OPTS = { weekStartsOn: WEEK_STARTS_ON } as const;

/**
 * 뷰와 기준일로 조회 범위를 만든다.
 * 다섯 뷰가 모두 이 함수 하나로 범위를 정하고, 같은 질의를 호출한다.
 */
export function rangeFor(view: ViewKind, anchor: Date, scale: TimeScale = 'week'): DateRange {
  switch (view) {
    case 'day':
      return { start: startOfDay(anchor), end: endOfDay(anchor) };
    case 'week':
      return { start: startOfWeek(anchor, WEEK_OPTS), end: endOfWeek(anchor, WEEK_OPTS) };
    case 'month':
      // 월 뷰 그리드는 앞뒤 달의 며칠을 포함하므로 주 경계까지 넓힌다
      return {
        start: startOfWeek(startOfMonth(anchor), WEEK_OPTS),
        end: endOfWeek(endOfMonth(anchor), WEEK_OPTS),
      };
    // 담당자별 현황도 로드맵과 같은 폭으로 본다 — 두 화면을 오갈 때 기간이 튀지 않는다
    case 'roadmap':
    case 'workload':
      return roadmapRange(anchor, scale);
    case 'timeline':
    case 'milestone':
      return timelineRange(anchor, scale);
  }
}

/**
 * 로드맵은 "연 단위 전체 그림"이 목적이므로 항상 월 경계에 맞추고
 * 타임라인보다 훨씬 넓은 구간을 잡는다. 기준일 앞쪽도 얼마간 보여줘야
 * 이미 진행 중인 일이 화면 왼쪽 밖으로 잘리지 않는다.
 */
export function roadmapRange(anchor: Date, scale: TimeScale): DateRange {
  const back = { day: 1, week: 2, month: 3, quarter: 6 }[scale];
  const fwd = { day: 5, week: 11, month: 17, quarter: 29 }[scale];
  return {
    start: startOfMonth(addMonths(anchor, -back)),
    end: endOfMonth(addMonths(anchor, fwd)),
  };
}

/** 타임라인은 스케일이 넓을수록 더 긴 구간을 한 화면에 담는다. */
export function timelineRange(anchor: Date, scale: TimeScale): DateRange {
  switch (scale) {
    case 'day':
      return { start: startOfWeek(anchor, WEEK_OPTS), end: endOfWeek(addDays(anchor, 14), WEEK_OPTS) };
    case 'week':
      return { start: startOfMonth(anchor), end: endOfMonth(addMonths(anchor, 2)) };
    case 'month':
      return { start: startOfMonth(addMonths(anchor, -2)), end: endOfMonth(addMonths(anchor, 9)) };
    case 'quarter':
      return { start: startOfMonth(addMonths(anchor, -6)), end: endOfMonth(addMonths(anchor, 17)) };
  }
}

/**
 * 가진 일정을 모두 담는 범위.
 *
 * 로드맵은 "지금 보고 있는 기간" 이 아니라 "이 팀이 하는 일 전부" 를 보여 주는
 * 화면이다. 기준일 둘레만 잘라 보여 주면 그 밖의 일정은 등록해 두고도 사라져,
 * 없는 것처럼 읽힌다.
 *
 * 오늘을 항상 포함하는 이유: 다 지난 일정만 남았을 때도 '오늘' 선이 화면에
 * 있어야 그 일정들이 과거라는 사실이 보인다.
 *
 * 최소 폭을 두는 이유: 일정이 하나뿐이면 축이 한 달짜리가 되어, 막대가 화면을
 * 가득 채우고 아무 맥락도 남지 않는다.
 */
export function spanAll(
  items: { start_at: string; end_at: string }[],
  now = new Date(),
  minMonths = 6,
): DateRange {
  let lo = startOfDay(now);
  let hi = startOfDay(now);

  for (const it of items) {
    const a = new Date(it.start_at);
    const b = new Date(it.end_at);
    if (a < lo) lo = a;
    if (b > hi) hi = b;
  }

  const start = startOfMonth(lo);
  let end = endOfMonth(hi);

  // 월 수가 모자라면 뒤쪽으로 늘린다 — 앞을 늘리면 오늘이 화면 오른쪽 끝으로
  // 밀려 지금 할 일이 가장 보기 어려운 자리에 놓인다.
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  if (months < minMonths) end = endOfMonth(addMonths(start, minMonths - 1));

  return { start, end };
}

/** 이전/다음 버튼이 기준일을 옮기는 폭. */
export function stepAnchor(view: ViewKind, anchor: Date, dir: -1 | 1, scale: TimeScale): Date {
  switch (view) {
    case 'day':
      return addDays(anchor, dir);
    case 'week':
      return addDays(anchor, 7 * dir);
    case 'month':
      return addMonths(anchor, dir);
    case 'roadmap':
    case 'workload':
      // 로드맵은 분기 단위로 크게 움직인다
      return addMonths(anchor, dir * (scale === 'day' ? 1 : scale === 'week' ? 3 : scale === 'month' ? 6 : 12));
    case 'timeline':
    case 'milestone':
      // 일 스케일에서만 주 단위로 움직인다. 나머지는 월 단위
      if (scale === 'day') return addDays(anchor, 7 * dir);
      return addMonths(anchor, dir * (scale === 'week' ? 1 : scale === 'month' ? 3 : 6));
  }
}

export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}
