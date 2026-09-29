'use client';

import { useMemo } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { laneCount, packLanes } from '@/lib/schedule-core/layout';
import {
  activeNow,
  peakConcurrency,
  workloadFor,
  type ActiveTask,
  type WorkloadStat,
} from '@/lib/schedule-core/workload';
import type { DateRange } from '@/lib/schedule-core/range';
import { memberLabel } from '@/lib/schedule-core/types';
import type { Membership, Phase, Project, Schedule, Team } from '@/lib/schedule-core/types';
import { barColor } from './bar-color';

const BAR_H = 12;
const LANE_GAP = 3;
const STRIP_PAD = 6;
const MAX_LANES = 4;

interface Props {
  range: DateRange;
  schedules: Schedule[];
  members: Membership[];
  teams: Team[];
  phases: Phase[];
  projects: Project[];
  /** 일정 → 담당자 멤버십 id 목록 */
  assigneeMap: Map<string, string[]>;
  /** 지연을 빨강으로 강조할지 — 툴바 스위치가 정한다 */
  markLate: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface Row {
  id: string;
  name: string;
  schedules: Schedule[];
  /** 지금 진행 중인 것만 — 이 화면의 본문이다 */
  active: ActiveTask[];
  stat: WorkloadStat;
  peak: number;
  lanes: number;
}

/** 남은 날을 사람이 읽는 말로. 숫자만 두면 부호를 매번 해석해야 한다. */
function dueText(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft}일 지남`;
  if (daysLeft === 0) return '오늘 마감';
  if (daysLeft === 1) return '내일 마감';
  return `${daysLeft}일 남음`;
}

export function WorkloadView({
  range,
  schedules,
  members,
  teams,
  phases,
  projects,
  markLate,
  assigneeMap,
  selectedId,
  onSelect,
}: Props) {
  const colorOf = useMemo(() => {
    const phaseColor = new Map(phases.map((p) => [p.id, p.color]));
    const teamColor = new Map(teams.map((t) => [t.id, t.color]));
    // 막대 색은 로드맵과 같은 기준을 따른다 — 화면마다 다른 색이면 같은 일이 달라 보인다
    return (s: Schedule) =>
      barColor(
        s,
        (s.phase_id && phaseColor.get(s.phase_id)) || (s.team_id && teamColor.get(s.team_id)) || '#7B8698',
        markLate,
      );
  }, [phases, teams, markLate]);

  /** 일이 어디에 속한 것인지 — 제목만으로는 맥락이 모자란다 */
  const labelOf = useMemo(() => {
    const projName = new Map(projects.map((p) => [p.id, p.name]));
    const phaseName = new Map(phases.map((p) => [p.id, p.name]));
    return (s: Schedule) =>
      [s.project_id && projName.get(s.project_id), s.phase_id && phaseName.get(s.phase_id)]
        .filter(Boolean)
        .join(' · ');
  }, [projects, phases]);

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    const build = (id: string, name: string, list: Schedule[]): Row => ({
      id,
      name,
      schedules: list,
      active: activeNow(list, now),
      stat: workloadFor(list, range, now),
      peak: peakConcurrency(list),
      lanes: Math.min(MAX_LANES, Math.max(1, laneCount(packLanes(list)))),
    });

    const out = members
      .map((m) =>
        build(
          m.id,
          memberLabel(m),
          schedules.filter((s) => assigneeMap.get(s.id)?.includes(m.id)),
        ),
      )
      // 지금 진행 중인 일이 많은 사람부터. 한가한 사람은 아래로 모인다.
      .sort(
        (a, b) =>
          b.active.length - a.active.length ||
          b.stat.busyDays - a.stat.busyDays ||
          b.stat.total - a.stat.total,
      );

    const unassigned = schedules.filter((s) => !assigneeMap.get(s.id)?.length);
    if (unassigned.length) out.push(build('__none__', '담당자 없음', unassigned));

    return out;
  }, [members, schedules, assigneeMap, range]);

  const rangeDays = Math.max(1, differenceInCalendarDays(range.end, range.start) + 1);
  const span = +range.end - +range.start;
  /** 구간 안 위치를 백분율로 — 화면 폭이 달라져도 그대로 맞는다 */
  const pct = (d: Date | string) => {
    const t = +(typeof d === 'string' ? new Date(d) : d);
    return Math.max(0, Math.min(100, ((t - +range.start) / span) * 100));
  };
  const todayPct = pct(new Date());
  const showToday = todayPct > 0 && todayPct < 100;

  if (!members.length) {
    return (
      <div className="empty">
        <b>멤버가 없습니다.</b>
        <span style={{ fontSize: 13 }}>설정 → 멤버에서 초대할 수 있습니다.</span>
      </div>
    );
  }

  return (
    <div className="wl" data-mark-late={markLate}>
      <div className="wl__head">
        <span className="wl__headname">담당자</span>
        <span className="wl__headstat">진행중</span>
        <span className="wl__headstat">진행률</span>
        <span className="wl__headstat">점유</span>
        <span className="wl__headstrip">
          {format(range.start, 'yyyy.MM')} – {format(range.end, 'yyyy.MM')} · {rangeDays}일
        </span>
      </div>

      {rows.map((r) => {
        const s = r.stat;
        const stripH = r.lanes * BAR_H + (r.lanes - 1) * LANE_GAP + STRIP_PAD * 2;
        const bars = packLanes(r.schedules);

        return (
          <div className="wl__group" key={r.id} data-empty={s.total === 0}>
            {/* 위: 타임라인 — 이 사람의 일이 언제 몰려 있는지 */}
            <div className="wl__row">
              <span className="wl__name">
                <span className="wl__avatar">{r.name.slice(0, 1)}</span>
                <span className="wl__nametext">{r.name}</span>
              </span>

              <span className="wl__counts">
                {r.active.length === 0 ? (
                  <span className="wl__none">없음</span>
                ) : (
                  <>
                    <b>{r.active.length}</b>
                    {s.late > 0 && <span className="badge badge--warn">지연 {s.late}</span>}
                  </>
                )}
              </span>

              <span className="wl__progress">
                {s.avgProgress === null ? (
                  <span className="wl__none">–</span>
                ) : (
                  <>
                    <span className="wl__meter">
                      <span style={{ width: `${s.avgProgress}%` }} />
                    </span>
                    <span className="wl__pct">{s.avgProgress}%</span>
                  </>
                )}
              </span>

              <span className="wl__load" title={`${s.busyDays}일 / ${rangeDays}일`}>
                <span className="wl__meter wl__meter--load">
                  <span style={{ width: `${s.busyRatio}%` }} />
                </span>
                <span className="wl__pct">
                  {s.busyRatio}%{r.peak > 1 && <em className="wl__peak">×{r.peak}</em>}
                </span>
              </span>

              <span className="wl__strip" style={{ height: stripH }}>
                {showToday && <span className="wl__today" style={{ left: `${todayPct}%` }} />}
                {bars.map((bar) => {
                  const sc = bar.schedule;
                  if (bar.lane >= MAX_LANES) return null;
                  const left = pct(sc.start_at);
                  const right = pct(sc.end_at);
                  return (
                    <button
                      key={sc.id}
                      className="wl__bar"
                      data-sel={sc.id === selectedId}
                      data-done={sc.status === 'done'}
                      title={`${sc.title} · ${format(new Date(sc.start_at), 'M.d')}–${format(
                        new Date(sc.end_at),
                        'M.d',
                      )} · ${sc.progress}%`}
                      style={{
                        left: `${left}%`,
                        width: `max(3px, ${right - left}%)`,
                        top: STRIP_PAD + bar.lane * (BAR_H + LANE_GAP),
                        background: colorOf(sc),
                      }}
                      onClick={() => onSelect(sc.id)}
                    />
                  );
                })}
                {r.lanes >= MAX_LANES && laneCount(bars) > MAX_LANES && (
                  <span className="wl__more">+{laneCount(bars) - MAX_LANES}줄 더</span>
                )}
              </span>
            </div>

            {/* 아래: 지금 진행 중인 업무 목록 — 무엇을 하고 있는지 */}
            <div className="wl__tasks">
              {r.active.length === 0 ? (
                <p className="wl__nowork">진행 중인 업무가 없습니다.</p>
              ) : (
                r.active.map((t) => {
                  const sc = t.schedule;
                  return (
                    <button
                      key={sc.id}
                      className="wl__task"
                      data-sel={sc.id === selectedId}
                      data-kind={t.kind}
                      onClick={() => onSelect(sc.id)}
                    >
                      <span className="wl__taskdot" style={{ background: colorOf(sc) }} />
                      <span className="wl__taskmain">
                        <span className="wl__tasktitle">{sc.title}</span>
                        {labelOf(sc) && <span className="wl__taskwhere">{labelOf(sc)}</span>}
                      </span>
                      <span className="wl__taskdate">
                        {format(new Date(sc.start_at), 'M.d')} – {format(new Date(sc.end_at), 'M.d')}
                      </span>
                      <span className="wl__taskdue">{dueText(t.daysLeft)}</span>
                      <span className="wl__taskbar">
                        <span className="wl__meter">
                          <span style={{ width: `${sc.progress}%` }} />
                        </span>
                        <span className="wl__pct">{sc.progress}%</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
