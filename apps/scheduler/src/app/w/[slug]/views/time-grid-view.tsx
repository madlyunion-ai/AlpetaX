'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, differenceInMinutes, endOfDay, isSameDay, startOfDay } from 'date-fns';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { layoutDayColumn } from '@/lib/schedule-core/layout';
import type { DateRange } from '@/lib/schedule-core/range';
import { barColor } from './bar-color';
import { dowIndex, isRestDay, SATURDAY, holidayName } from '@/lib/schedule-core/holidays';
import type { Schedule, Team } from '@/lib/schedule-core/types';

const HOUR_H = 48;
const GUTTER = 54;

interface Props {
  days: 1 | 7;
  range: DateRange;
  schedules: Schedule[];
  teamById: Map<string, Team>;
  /** 지연을 빨강으로 강조할지 — 툴바 스위치가 정한다 */
  markLate: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: (start: Date, end: Date, allDay: boolean) => void;
}

/** 주 뷰와 일 뷰는 열 개수만 다르다. 같은 그리드를 공유한다. */
export function TimeGridView({
  days,
  range,
  schedules,
  teamById,
  markLate,
  selectedId,
  onSelect,
  onCreate,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 처음 열면 업무 시간대가 보이게 스크롤한다
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 8 * HOUR_H });
  }, []);

  const cols = useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(range.start, i)),
    [days, range.start],
  );

  const { timed, allDay } = useMemo(() => {
    const timed: Schedule[] = [];
    const allDay: Schedule[] = [];
    for (const s of schedules) {
      const span = differenceInMinutes(new Date(s.end_at), new Date(s.start_at));
      if (s.all_day || span >= 1440) allDay.push(s);
      else timed.push(s);
    }
    return { timed, allDay };
  }, [schedules]);

  const template = `${GUTTER}px repeat(${days}, minmax(0, 1fr))`;

  return (
    <div className="grid" data-single={days === 1}>
      <div className="grid__head" style={{ gridTemplateColumns: template }}>
        <div />
        {cols.map((d) => (
          <div
            key={+d}
            className="grid__headcell"
            data-today={isSameDay(d, now)}
            data-sat={dowIndex(d) === SATURDAY}
            data-sun={isRestDay(d)}
            title={holidayName(d) ?? undefined}
          >
            <span className="mono" style={{ fontSize: 11 }}>
              {format(d, 'EEE', { locale: ko })}
            </span>
            <b>{d.getDate()}</b>
          </div>
        ))}
      </div>

      <div className="grid__allday" style={{ gridTemplateColumns: template }}>
        <div
          className="mono"
          style={{ fontSize: 10, display: 'grid', placeItems: 'center', borderRight: '1px solid var(--line-soft)' }}
        >
          종일
        </div>
        {cols.map((d) => {
          const dayStart = startOfDay(d);
          const dayEnd = endOfDay(d);
          const here = allDay.filter(
            (s) => new Date(s.start_at) <= dayEnd && new Date(s.end_at) >= dayStart,
          );
          return (
            <div
              key={+d}
              className="grid__alldaycell"
              data-past={dayStart < startOfDay(now)}
              data-today={isSameDay(d, now)}
              onDoubleClick={() => onCreate?.(dayStart, dayEnd, true)}
            >
              {here.map((s) => {
                const team = s.team_id ? teamById.get(s.team_id) : undefined;
                return (
                  <button
                    key={s.id}
                    className="month__bar"
                    data-done={s.status === 'done'}
                    data-sel={s.id === selectedId}
                    style={{ position: 'static', background: barColor(s, team?.color, markLate), width: '100%' }}
                    onClick={() => onSelect(s.id)}
                    title={s.title}
                  >
                    {s.title}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="stage" ref={scrollRef} style={{ background: 'var(--ground)' }}>
        <div className="grid__body" style={{ gridTemplateColumns: template, height: 24 * HOUR_H }}>
          <div className="grid__gutter">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="grid__hour" style={{ borderBottom: 0 }}>
                {h > 0 && <span className="grid__hourlabel">{String(h).padStart(2, '0')}:00</span>}
              </div>
            ))}
          </div>

          {cols.map((d) => {
            const blocks = layoutDayColumn(
              timed.filter(
                (s) => new Date(s.start_at) <= endOfDay(d) && new Date(s.end_at) >= startOfDay(d),
              ),
              d,
            );
            const isToday = isSameDay(d, now);
            const nowTop = (differenceInMinutes(now, startOfDay(now)) / 60) * HOUR_H;

            return (
              <div
                key={+d}
                className="grid__col"
                data-past={startOfDay(d) < startOfDay(now)}
                data-today={isToday}
                onDoubleClick={(e) => {
                  if (!onCreate) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const minutes = Math.floor(((e.clientY - rect.top) / HOUR_H) * 60 / 30) * 30;
                  const start = new Date(startOfDay(d).getTime() + minutes * 60_000);
                  onCreate(start, new Date(start.getTime() + 3_600_000), false);
                }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="grid__hour" />
                ))}

                {blocks.map((b) => {
                  const team = b.schedule.team_id ? teamById.get(b.schedule.team_id) : undefined;
                  return (
                    <button
                      key={b.schedule.id}
                      className="grid__block"
                      data-sel={b.schedule.id === selectedId}
                      style={{
                        top: (b.startMin / 60) * HOUR_H,
                        height: ((b.endMin - b.startMin) / 60) * HOUR_H - 2,
                        left: `calc(${b.left * 100}% + 2px)`,
                        width: `calc(${b.width * 100}% - 4px)`,
                        background: barColor(b.schedule, team?.color, markLate),
                        opacity: b.schedule.status === 'done' ? 0.55 : 1,
                      }}
                      onClick={() => onSelect(b.schedule.id)}
                      title={b.schedule.title}
                    >
                      <b style={{ display: 'block', fontWeight: 600 }}>{b.schedule.title}</b>
                      {format(new Date(b.schedule.start_at), 'HH:mm')}
                    </button>
                  );
                })}

                {isToday && <div className="grid__now" style={{ top: nowTop }} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
