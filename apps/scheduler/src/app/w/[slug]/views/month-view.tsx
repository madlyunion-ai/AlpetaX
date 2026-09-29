'use client';

import { useMemo, useState } from 'react';
import { addDays, endOfDay, isSameDay, isSameMonth, startOfDay } from 'date-fns';
import { assignLanes, barsForWeek } from '@/lib/schedule-core/layout';
import type { DateRange } from '@/lib/schedule-core/range';
import { barColor } from './bar-color';
import { dowIndex, isRestDay, SATURDAY, SUNDAY, holidayName } from '@/lib/schedule-core/holidays';
import type { Schedule, Team } from '@/lib/schedule-core/types';

// 일요일부터. schedule-core 의 WEEK_STARTS_ON 과 짝이다.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const LANE_H = 21;
const MAX_LANES = 3;

interface Props {
  anchor: Date;
  range: DateRange;
  schedules: Schedule[];
  teamById: Map<string, Team>;
  /** 지연을 빨강으로 강조할지 — 툴바 스위치가 정한다 */
  markLate: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: (start: Date, end: Date, allDay: boolean) => void;
}

export function MonthView({
  anchor,
  range,
  schedules,
  teamById,
  markLate,
  selectedId,
  onSelect,
  onCreate,
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // 오늘 0시. 이보다 앞선 날은 지나간 칸으로 배경을 눌러 둔다.
  const todayStart = useMemo(() => startOfDay(new Date()), []);

  const weeks = useMemo(() => {
    const out: Date[] = [];
    for (let d = range.start; d <= range.end; d = addDays(d, 7)) out.push(d);
    return out;
  }, [range]);

  return (
    <div className="month">
      <div className="month__head">
        {DOW.map((d, i) => (
          <span key={d} data-sat={i === SATURDAY} data-sun={i === SUNDAY}>
            {d}
          </span>
        ))}
      </div>
      <div className="month__body">
        {weeks.map((weekStart, wi) => {
          const lanes = assignLanes(barsForWeek(schedules, weekStart));
          const open = expanded.has(wi);
          const laneCount = lanes.reduce((m, b) => Math.max(m, b.lane + 1), 0);
          const visibleLanes = open ? laneCount : Math.min(laneCount, MAX_LANES);

          // 레인이 잘린 날짜별로 숨겨진 개수를 센다
          const hiddenPerCol = new Array(7).fill(0);
          for (const b of lanes) {
            if (b.lane < visibleLanes) continue;
            for (let c = b.startCol; c <= b.endCol; c++) hiddenPerCol[c]++;
          }

          return (
            <div
              className="month__week"
              key={wi}
              style={{ minHeight: 26 + visibleLanes * LANE_H + 18 }}
            >
              {Array.from({ length: 7 }, (_, i) => {
                const day = addDays(weekStart, i);
                return (
                  <div
                    key={i}
                    className="month__cell"
                    data-out={!isSameMonth(day, anchor)}
                    data-past={startOfDay(day) < todayStart}
                    data-today={isSameDay(day, todayStart)}
                    onDoubleClick={() => onCreate?.(startOfDay(day), endOfDay(day), true)}
                  >
                    <span
                      className="month__daynum"
                      data-today={isSameDay(day, todayStart)}
                      data-sat={dowIndex(day) === SATURDAY}
                      data-sun={isRestDay(day)}
                      title={holidayName(day) ?? undefined}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                );
              })}

              <div className="month__lanes">
                {lanes
                  .filter((b) => b.lane < visibleLanes)
                  .map((b) => {
                    const team = b.schedule.team_id ? teamById.get(b.schedule.team_id) : undefined;
                    const left = (b.startCol / 7) * 100;
                    const width = ((b.endCol - b.startCol + 1) / 7) * 100;
                    return (
                      <button
                        key={b.schedule.id}
                        className="month__bar"
                        data-done={b.schedule.status === 'done'}
                        data-sel={b.schedule.id === selectedId}
                        title={b.schedule.title}
                        style={{
                          left: `calc(${left}% + 3px)`,
                          width: `calc(${width}% - 6px)`,
                          top: b.lane * LANE_H,
                          background: barColor(b.schedule, team?.color, markLate),
                          borderTopLeftRadius: b.clippedStart ? 0 : 4,
                          borderBottomLeftRadius: b.clippedStart ? 0 : 4,
                          borderTopRightRadius: b.clippedEnd ? 0 : 4,
                          borderBottomRightRadius: b.clippedEnd ? 0 : 4,
                        }}
                        onClick={() => onSelect(b.schedule.id)}
                      >
                        {b.clippedStart ? '◀ ' : ''}
                        {b.schedule.title}
                        {b.clippedEnd ? ' ▶' : ''}
                      </button>
                    );
                  })}

                {!open &&
                  hiddenPerCol.map((n, c) =>
                    n > 0 ? (
                      <button
                        key={c}
                        className="month__more"
                        style={{ left: `calc(${(c / 7) * 100}% + 4px)`, top: visibleLanes * LANE_H }}
                        onClick={() => setExpanded(new Set(expanded).add(wi))}
                      >
                        +{n}개 더
                      </button>
                    ) : null,
                  )}

                {open && (
                  <button
                    className="month__more"
                    style={{ left: 4, top: visibleLanes * LANE_H }}
                    onClick={() => {
                      const next = new Set(expanded);
                      next.delete(wi);
                      setExpanded(next);
                    }}
                  >
                    접기
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
