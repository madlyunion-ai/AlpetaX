import { describe, expect, it } from 'vitest';
import { inferHorizon } from './horizon';
import {
  assignLanes,
  barsForWeek,
  createScale,
  flattenTree,
  laneCount,
  layoutDayColumn,
  packLanes,
} from './layout';
import { dowIndex, holidayName, isRestDay, SATURDAY, SUNDAY, WEEK_STARTS_ON } from './holidays';
import { milestoneStat, milestoneTiming } from './milestone';
import { activeNow, isLate, peakConcurrency, workloadFor } from './workload';
import type { Schedule } from './types';

const iso = (s: string) => new Date(s).toISOString();

function sched(over: Partial<Schedule> & { id: string; start_at: string; end_at: string }): Schedule {
  return {
    workspace_id: 'w',
    project_id: null,
    team_id: null,
    phase_id: null,
    parent_id: null,
    title: over.id,
    description: null,
    all_day: true,
    horizon: 'short',
    horizon_locked: false,
    status: 'planned',
    progress: 0,
    sort_order: 0,
    created_by: 'u',
    created_at: iso('2026-01-01'),
    updated_at: iso('2026-01-01'),
    ...over,
  };
}

describe('inferHorizon', () => {
  it('90일 이상은 장기', () => {
    expect(inferHorizon(new Date('2026-01-01'), new Date('2026-04-01'))).toBe('long');
  });
  it('14~89일은 중기', () => {
    expect(inferHorizon(new Date('2026-01-01'), new Date('2026-01-20'))).toBe('mid');
  });
  it('13일 이하는 단기', () => {
    expect(inferHorizon(new Date('2026-01-01'), new Date('2026-01-05'))).toBe('short');
  });
  it('경계값 — 정확히 14일은 중기', () => {
    expect(inferHorizon(new Date('2026-01-01'), new Date('2026-01-14'))).toBe('mid');
  });
});

describe('barsForWeek', () => {
  const weekStart = new Date('2026-09-28T00:00:00'); // 월요일

  it('주 경계를 넘는 일정은 잘리고 표시가 남는다', () => {
    const bars = barsForWeek(
      [sched({ id: 'a', start_at: iso('2026-09-25'), end_at: iso('2026-10-07') })],
      weekStart,
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].startCol).toBe(0);
    expect(bars[0].endCol).toBe(6);
    expect(bars[0].clippedStart).toBe(true);
    expect(bars[0].clippedEnd).toBe(true);
  });

  it('범위 밖 일정은 제외된다', () => {
    const bars = barsForWeek(
      [sched({ id: 'a', start_at: iso('2026-08-01'), end_at: iso('2026-08-02') })],
      weekStart,
    );
    expect(bars).toHaveLength(0);
  });
});

describe('assignLanes', () => {
  const weekStart = new Date('2026-09-28T00:00:00');

  it('겹치지 않으면 같은 레인을 쓴다', () => {
    const lanes = assignLanes(
      barsForWeek(
        [
          sched({ id: 'a', start_at: iso('2026-09-28'), end_at: iso('2026-09-29') }),
          sched({ id: 'b', start_at: iso('2026-10-01'), end_at: iso('2026-10-02') }),
        ],
        weekStart,
      ),
    );
    expect(lanes.map((l) => l.lane)).toEqual([0, 0]);
  });

  it('겹치면 다른 레인으로 밀린다', () => {
    const lanes = assignLanes(
      barsForWeek(
        [
          sched({ id: 'a', start_at: iso('2026-09-28'), end_at: iso('2026-10-02') }),
          sched({ id: 'b', start_at: iso('2026-09-29'), end_at: iso('2026-09-30') }),
        ],
        weekStart,
      ),
    );
    const byId = new Map(lanes.map((l) => [l.schedule.id, l.lane]));
    expect(byId.get('a')).not.toBe(byId.get('b'));
  });

  it('긴 일정이 먼저 위쪽 레인을 차지한다', () => {
    const lanes = assignLanes(
      barsForWeek(
        [
          sched({ id: 'short', start_at: iso('2026-09-28'), end_at: iso('2026-09-28') }),
          sched({ id: 'long', start_at: iso('2026-09-28'), end_at: iso('2026-10-03') }),
        ],
        weekStart,
      ),
    );
    expect(lanes.find((l) => l.schedule.id === 'long')!.lane).toBe(0);
  });
});

describe('layoutDayColumn', () => {
  const day = new Date('2026-09-28T00:00:00');

  it('겹치지 않으면 전체 폭을 쓴다', () => {
    const blocks = layoutDayColumn(
      [
        sched({ id: 'a', start_at: iso('2026-09-28T09:00'), end_at: iso('2026-09-28T10:00'), all_day: false }),
        sched({ id: 'b', start_at: iso('2026-09-28T14:00'), end_at: iso('2026-09-28T15:00'), all_day: false }),
      ],
      day,
    );
    expect(blocks.every((b) => b.width === 1)).toBe(true);
  });

  it('3개가 겹치면 각 1/3 폭', () => {
    const blocks = layoutDayColumn(
      [
        sched({ id: 'a', start_at: iso('2026-09-28T09:00'), end_at: iso('2026-09-28T11:00'), all_day: false }),
        sched({ id: 'b', start_at: iso('2026-09-28T09:30'), end_at: iso('2026-09-28T11:00'), all_day: false }),
        sched({ id: 'c', start_at: iso('2026-09-28T10:00'), end_at: iso('2026-09-28T11:00'), all_day: false }),
      ],
      day,
    );
    expect(blocks.every((b) => Math.abs(b.width - 1 / 3) < 1e-9)).toBe(true);
    expect(new Set(blocks.map((b) => b.left)).size).toBe(3);
  });

  it('한 묶음이 좁아져도 떨어진 묶음은 전체 폭을 유지한다', () => {
    const blocks = layoutDayColumn(
      [
        sched({ id: 'a', start_at: iso('2026-09-28T09:00'), end_at: iso('2026-09-28T11:00'), all_day: false }),
        sched({ id: 'b', start_at: iso('2026-09-28T09:30'), end_at: iso('2026-09-28T11:00'), all_day: false }),
        sched({ id: 'far', start_at: iso('2026-09-28T18:00'), end_at: iso('2026-09-28T19:00'), all_day: false }),
      ],
      day,
    );
    expect(blocks.find((b) => b.schedule.id === 'far')!.width).toBe(1);
  });
});

describe('createScale', () => {
  const from = new Date('2026-09-01T00:00:00');
  const to = new Date('2026-09-30T23:59:59');

  it('x 와 date 는 서로의 역이다', () => {
    const sc = createScale(from, to, 24);
    const d = new Date('2026-09-15T00:00:00');
    expect(Math.abs(sc.date(sc.x(d)).getTime() - d.getTime())).toBeLessThan(1000);
  });

  it('넓은 스케일에서는 날짜 단위로 스냅한다', () => {
    const sc = createScale(from, to, 8);
    const snapped = sc.snap(new Date('2026-09-15T13:40:00'));
    expect(snapped.getHours()).toBe(0);
  });

  it('좁은 스케일에서는 시간 단위로 스냅한다', () => {
    const sc = createScale(from, to, 72);
    const snapped = sc.snap(new Date('2026-09-15T13:40:00'));
    expect(snapped.getHours()).toBe(14);
    expect(snapped.getMinutes()).toBe(0);
  });
});

describe('flattenTree', () => {
  it('자식은 부모 아래 들여쓰기된다', () => {
    const rows = flattenTree(
      [
        sched({ id: 'parent', start_at: iso('2026-09-01'), end_at: iso('2026-09-30') }),
        sched({ id: 'child', parent_id: 'parent', start_at: iso('2026-09-02'), end_at: iso('2026-09-05') }),
      ],
      new Set(),
    );
    expect(rows.map((r) => [r.schedule.id, r.depth])).toEqual([
      ['parent', 0],
      ['child', 1],
    ]);
  });

  it('접으면 자식이 빠진다', () => {
    const rows = flattenTree(
      [
        sched({ id: 'parent', start_at: iso('2026-09-01'), end_at: iso('2026-09-30') }),
        sched({ id: 'child', parent_id: 'parent', start_at: iso('2026-09-02'), end_at: iso('2026-09-05') }),
      ],
      new Set(['parent']),
    );
    expect(rows).toHaveLength(1);
  });

  it('부모가 조회 범위 밖이면 자식을 최상위로 올린다', () => {
    const rows = flattenTree(
      [sched({ id: 'orphan', parent_id: 'missing', start_at: iso('2026-09-02'), end_at: iso('2026-09-05') })],
      new Set(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].depth).toBe(0);
  });
});

describe('packLanes — 로드맵 띠 안의 레인 패킹', () => {
  it('겹치지 않으면 한 레인에 모인다', () => {
    const bars = packLanes([
      sched({ id: 'a', start_at: iso('2026-01-01'), end_at: iso('2026-01-31') }),
      sched({ id: 'b', start_at: iso('2026-03-01'), end_at: iso('2026-03-31') }),
    ]);
    expect(laneCount(bars)).toBe(1);
  });

  it('겹치면 레인이 늘어난다', () => {
    const bars = packLanes([
      sched({ id: 'a', start_at: iso('2026-01-01'), end_at: iso('2026-03-31') }),
      sched({ id: 'b', start_at: iso('2026-02-01'), end_at: iso('2026-04-30') }),
      sched({ id: 'c', start_at: iso('2026-03-01'), end_at: iso('2026-05-31') }),
    ]);
    expect(laneCount(bars)).toBe(3);
  });

  it('minGap 보다 가까이 붙은 두 바는 같은 레인에 두지 않는다', () => {
    const items = [
      sched({ id: 'a', start_at: iso('2026-01-01'), end_at: iso('2026-01-31') }),
      sched({ id: 'b', start_at: iso('2026-02-01'), end_at: iso('2026-02-28') }),
    ];
    expect(laneCount(packLanes(items, 0))).toBe(1);
    // 10일치 간격을 요구하면 하루 차이로 붙은 둘은 갈라진다
    expect(laneCount(packLanes(items, 10 * 86400000))).toBe(2);
  });

  it('긴 일정이 먼저 위쪽 레인을 차지한다', () => {
    const bars = packLanes([
      sched({ id: 'short', start_at: iso('2026-01-01'), end_at: iso('2026-01-05') }),
      sched({ id: 'long', start_at: iso('2026-01-01'), end_at: iso('2026-06-30') }),
    ]);
    expect(bars.find((b) => b.schedule.id === 'long')!.lane).toBe(0);
  });

  it('빈 목록이면 레인이 0이다', () => {
    expect(laneCount(packLanes([]))).toBe(0);
  });
});

describe('milestoneStat — 마일스톤 달성 가능성', () => {
  const now = new Date('2026-09-28T09:00:00');
  const ms = (due: string, status: 'upcoming' | 'reached' | 'missed' = 'upcoming') => ({
    project_id: 'p1',
    due_on: due,
    status,
  });

  it('관련 일정이 없으면 progress 는 null', () => {
    const stat = milestoneStat(ms('2026-10-31'), [], now);
    expect(stat.progress).toBeNull();
    expect(stat.relatedCount).toBe(0);
  });

  it('다른 프로젝트의 일정은 세지 않는다', () => {
    const stat = milestoneStat(
      ms('2026-10-31'),
      [sched({ id: 'x', project_id: 'p2', start_at: iso('2026-10-01'), end_at: iso('2026-10-10'), progress: 100 })],
      now,
    );
    expect(stat.progress).toBeNull();
  });

  it('기한 뒤에 시작하는 일정은 세지 않는다', () => {
    const stat = milestoneStat(
      ms('2026-10-31'),
      [sched({ id: 'x', project_id: 'p1', start_at: iso('2026-11-05'), end_at: iso('2026-11-10'), progress: 0 })],
      now,
    );
    expect(stat.progress).toBeNull();
  });

  it('기간으로 가중 평균한다 — 하루짜리 잡무가 두 달 작업과 같은 무게를 갖지 않는다', () => {
    const stat = milestoneStat(
      ms('2026-12-31'),
      [
        // 1일 × 100%
        sched({ id: 'tiny', project_id: 'p1', start_at: iso('2026-10-01'), end_at: iso('2026-10-01'), progress: 100 }),
        // 99일 × 0%
        sched({ id: 'big', project_id: 'p1', start_at: iso('2026-10-01'), end_at: iso('2026-12-31'), progress: 0 }),
      ],
      now,
    );
    // 단순 평균이면 50%. 가중 평균이면 1%에 가깝다.
    expect(stat.progress).toBeLessThan(5);
    expect(stat.relatedCount).toBe(2);
  });

  it('done 인 일정은 progress 값과 무관하게 100 으로 친다', () => {
    const stat = milestoneStat(
      ms('2026-12-31'),
      [sched({ id: 'd', project_id: 'p1', start_at: iso('2026-10-01'), end_at: iso('2026-10-10'), status: 'done', progress: 40 })],
      now,
    );
    expect(stat.progress).toBe(100);
  });

  it('기한이 지난 upcoming 은 지연이다', () => {
    const stat = milestoneStat(ms('2026-09-20'), [], now);
    expect(stat.late).toBe(true);
    expect(stat.daysLeft).toBe(-8);
    expect(milestoneTiming(stat, 'upcoming')).toBe('8일 지연');
  });

  it('달성한 마일스톤은 기한이 지나도 지연이 아니다', () => {
    const stat = milestoneStat(ms('2026-09-20', 'reached'), [], now);
    expect(stat.late).toBe(false);
    expect(milestoneTiming(stat, 'reached')).toBe('달성');
  });

  it('오늘이 기한이면 "오늘"', () => {
    const stat = milestoneStat(ms('2026-09-28'), [], now);
    expect(stat.daysLeft).toBe(0);
    expect(milestoneTiming(stat, 'upcoming')).toBe('오늘');
  });
});

describe('요일과 공휴일', () => {
  it('일요일이 0, 토요일이 6', () => {
    // 2026-09-27 은 일요일
    expect(dowIndex(new Date('2026-09-27T09:00:00'))).toBe(SUNDAY);
    expect(dowIndex(new Date('2026-10-03T09:00:00'))).toBe(SATURDAY);
    expect(WEEK_STARTS_ON).toBe(SUNDAY);
  });

  it('날짜가 고정된 공휴일을 찾는다', () => {
    expect(holidayName(new Date('2027-01-01T09:00:00'))).toBe('신정');
    expect(holidayName(new Date('2026-08-15T09:00:00'))).toBe('광복절');
    expect(holidayName(new Date('2026-12-25T09:00:00'))).toBe('성탄절');
  });

  it('평범한 날은 공휴일이 아니다', () => {
    expect(holidayName(new Date('2026-09-28T09:00:00'))).toBeNull();
    expect(isRestDay(new Date('2026-09-28T09:00:00'))).toBe(false);
  });

  it('일요일과 공휴일은 쉬는 날, 토요일은 아니다', () => {
    expect(isRestDay(new Date('2026-09-27T09:00:00'))).toBe(true); // 일요일
    expect(isRestDay(new Date('2026-06-06T09:00:00'))).toBe(true); // 현충일(토)
    expect(isRestDay(new Date('2026-10-03T09:00:00'))).toBe(true); // 개천절(토)
    expect(isRestDay(new Date('2026-09-26T09:00:00'))).toBe(false); // 평범한 토요일
  });
});

describe('workloadFor — 담당자별 업무현황', () => {
  const now = new Date('2026-09-28T09:00:00');
  const range = { start: new Date('2026-09-01T00:00:00'), end: new Date('2026-09-30T23:59:59') };

  it('일정이 없으면 모두 0, 진행률은 null', () => {
    const w = workloadFor([], range, now);
    expect(w.total).toBe(0);
    expect(w.avgProgress).toBeNull();
    expect(w.busyDays).toBe(0);
    expect(w.busyRatio).toBe(0);
  });

  it('상태를 예정·진행·완료로 나눈다', () => {
    const w = workloadFor(
      [
        sched({ id: 'a', start_at: iso('2026-09-20'), end_at: iso('2026-10-10'), status: 'planned' }),
        sched({ id: 'b', start_at: iso('2026-09-20'), end_at: iso('2026-10-10'), status: 'active' }),
        sched({ id: 'c', start_at: iso('2026-09-01'), end_at: iso('2026-09-05'), status: 'done' }),
      ],
      range,
      now,
    );
    expect(w.total).toBe(3);
    expect(w.upcoming).toBe(1);
    expect(w.active).toBe(1);
    expect(w.done).toBe(1);
    expect(w.late).toBe(0);
  });

  it('끝날이 지났는데 안 끝났으면 지연으로 센다', () => {
    const w = workloadFor(
      [sched({ id: 'x', start_at: iso('2026-09-01'), end_at: iso('2026-09-10'), status: 'active' })],
      range,
      now,
    );
    expect(w.late).toBe(1);
    expect(w.active).toBe(0);
  });

  it('blocked 는 기한과 무관하게 지연이다', () => {
    const w = workloadFor(
      [sched({ id: 'x', start_at: iso('2026-09-20'), end_at: iso('2026-10-20'), status: 'blocked' })],
      range,
      now,
    );
    expect(w.late).toBe(1);
  });

  it('같은 날 겹치는 일정을 두 번 세지 않는다', () => {
    const solo = workloadFor(
      [sched({ id: 'a', start_at: iso('2026-09-01'), end_at: iso('2026-09-10') })],
      range,
      now,
    );
    const overlapped = workloadFor(
      [
        sched({ id: 'a', start_at: iso('2026-09-01'), end_at: iso('2026-09-10') }),
        sched({ id: 'b', start_at: iso('2026-09-03'), end_at: iso('2026-09-08') }),
      ],
      range,
      now,
    );
    expect(solo.busyDays).toBe(10);
    expect(overlapped.busyDays).toBe(10);
  });

  it('구간 밖으로 삐져나온 기간은 잘라서 센다', () => {
    const w = workloadFor(
      [sched({ id: 'a', start_at: iso('2026-08-01'), end_at: iso('2026-12-31') })],
      range,
      now,
    );
    expect(w.busyDays).toBe(30);
    expect(w.busyRatio).toBe(100);
  });

  it('취소한 일정은 점유 일수에 넣지 않는다', () => {
    const w = workloadFor(
      [sched({ id: 'a', start_at: iso('2026-09-01'), end_at: iso('2026-09-10'), status: 'cancelled' })],
      range,
      now,
    );
    expect(w.busyDays).toBe(0);
    expect(w.active + w.upcoming + w.late + w.done).toBe(0);
  });
});

describe('isLate — 지연 판정', () => {
  const now = new Date('2026-09-28T09:00:00');

  it('마감이 지났는데 안 끝났으면 지연', () => {
    expect(isLate(sched({ id:'a', start_at:iso('2026-09-01'), end_at:iso('2026-09-10'), status:'active' }), now)).toBe(true);
  });
  it('막힌 일은 마감이 남아도 지연', () => {
    expect(isLate(sched({ id:'b', start_at:iso('2026-09-20'), end_at:iso('2026-10-20'), status:'blocked' }), now)).toBe(true);
  });
  it('오늘 마감은 아직 지연이 아니다', () => {
    expect(isLate(sched({ id:'c', start_at:iso('2026-09-20'), end_at:iso('2026-09-28'), status:'active' }), now)).toBe(false);
  });
  it('끝났거나 취소한 일은 마감이 지나도 지연이 아니다', () => {
    expect(isLate(sched({ id:'d', start_at:iso('2026-09-01'), end_at:iso('2026-09-10'), status:'done' }), now)).toBe(false);
    expect(isLate(sched({ id:'e', start_at:iso('2026-09-01'), end_at:iso('2026-09-10'), status:'cancelled' }), now)).toBe(false);
  });
  it('workloadFor 의 late 집계와 어긋나지 않는다', () => {
    const list = [
      sched({ id:'x', start_at:iso('2026-09-01'), end_at:iso('2026-09-10'), status:'active' }),
      sched({ id:'y', start_at:iso('2026-09-20'), end_at:iso('2026-10-20'), status:'blocked' }),
      sched({ id:'z', start_at:iso('2026-09-20'), end_at:iso('2026-10-20'), status:'active' }),
    ];
    const range = { start:new Date('2026-09-01'), end:new Date('2026-10-31') };
    expect(list.filter((s) => isLate(s, now)).length).toBe(workloadFor(list, range, now).late);
  });
});

describe('activeNow — 지금 진행 중인 일만', () => {
  const now = new Date('2026-09-28T09:00:00');

  it('끝난 일·취소한 일·아직 시작 전인 일은 뺀다', () => {
    const got = activeNow(
      [
        sched({ id: 'done', start_at: iso('2026-09-20'), end_at: iso('2026-09-30'), status: 'done' }),
        sched({ id: 'cancel', start_at: iso('2026-09-20'), end_at: iso('2026-09-30'), status: 'cancelled' }),
        sched({ id: 'future', start_at: iso('2026-10-05'), end_at: iso('2026-10-10'), status: 'planned' }),
        sched({ id: 'now', start_at: iso('2026-09-20'), end_at: iso('2026-09-30'), status: 'active' }),
      ],
      now,
    );
    expect(got.map((t) => t.schedule.id)).toEqual(['now']);
    expect(got[0].kind).toBe('running');
  });

  it('마감이 지났는데 안 끝났으면 늦은 일로 넣는다', () => {
    const got = activeNow(
      [sched({ id: 'x', start_at: iso('2026-09-01'), end_at: iso('2026-09-10'), status: 'active' })],
      now,
    );
    expect(got[0].kind).toBe('late');
    expect(got[0].daysLeft).toBeLessThan(0);
  });

  it('막힌 일 → 늦은 일 → 마감 가까운 순으로 정렬한다', () => {
    const got = activeNow(
      [
        sched({ id: 'far', start_at: iso('2026-09-20'), end_at: iso('2026-10-20'), status: 'active' }),
        sched({ id: 'soon', start_at: iso('2026-09-20'), end_at: iso('2026-09-29'), status: 'active' }),
        sched({ id: 'overdue', start_at: iso('2026-09-01'), end_at: iso('2026-09-10'), status: 'active' }),
        sched({ id: 'stuck', start_at: iso('2026-09-20'), end_at: iso('2026-10-20'), status: 'blocked' }),
      ],
      now,
    );
    expect(got.map((t) => t.schedule.id)).toEqual(['stuck', 'overdue', 'soon', 'far']);
  });

  it('오늘 마감이면 남은 날은 0 — 아직 늦은 것이 아니다', () => {
    const got = activeNow(
      [sched({ id: 'today', start_at: iso('2026-09-20'), end_at: iso('2026-09-28'), status: 'active' })],
      now,
    );
    expect(got[0].daysLeft).toBe(0);
    expect(got[0].kind).toBe('running');
  });
});

describe('peakConcurrency — 하루에 몇 건까지 겹치나', () => {
  it('겹치지 않으면 1', () => {
    expect(
      peakConcurrency([
        sched({ id: 'a', start_at: iso('2026-09-01'), end_at: iso('2026-09-05') }),
        sched({ id: 'b', start_at: iso('2026-09-10'), end_at: iso('2026-09-15') }),
      ]),
    ).toBe(1);
  });

  it('세 건이 한 날에 겹치면 3', () => {
    expect(
      peakConcurrency([
        sched({ id: 'a', start_at: iso('2026-09-01'), end_at: iso('2026-09-20') }),
        sched({ id: 'b', start_at: iso('2026-09-05'), end_at: iso('2026-09-25') }),
        sched({ id: 'c', start_at: iso('2026-09-10'), end_at: iso('2026-09-12') }),
      ]),
    ).toBe(3);
  });

  it('끝난 일정과 취소는 세지 않는다', () => {
    expect(
      peakConcurrency([
        sched({ id: 'a', start_at: iso('2026-09-01'), end_at: iso('2026-09-20'), status: 'done' }),
        sched({ id: 'b', start_at: iso('2026-09-05'), end_at: iso('2026-09-25'), status: 'cancelled' }),
        sched({ id: 'c', start_at: iso('2026-09-10'), end_at: iso('2026-09-12') }),
      ]),
    ).toBe(1);
  });
});
