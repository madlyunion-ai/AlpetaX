import { differenceInCalendarDays } from 'date-fns';
import type { Milestone, Schedule } from './types';

export interface MilestoneStat {
  /** 0~100. 관련 일정이 하나도 없으면 null */
  progress: number | null;
  /** 관련 일정 수 */
  relatedCount: number;
  /** 오늘 기준 남은 일수. 음수면 지났다 */
  daysLeft: number;
  late: boolean;
}

/**
 * 마일스톤 하나의 달성 가능성.
 *
 * 그 프로젝트에서 기한 안에 시작하는 일정들의 진행률을 **기간으로 가중 평균**한다.
 * 단순 평균을 쓰면 하루짜리 잡무가 두 달짜리 개발과 같은 무게를 가져
 * 체크리스트 몇 개를 끝낸 것만으로 진행률이 껑충 뛴다.
 */
export function milestoneStat(
  milestone: Pick<Milestone, 'project_id' | 'due_on' | 'status'>,
  schedules: Schedule[],
  now = new Date(),
): MilestoneStat {
  const due = new Date(`${milestone.due_on}T23:59:59`);
  const daysLeft = differenceInCalendarDays(new Date(`${milestone.due_on}T00:00:00`), now);
  const late = milestone.status === 'upcoming' && daysLeft < 0;

  const related = schedules.filter(
    (s) => s.project_id === milestone.project_id && new Date(s.start_at) <= due,
  );
  if (!related.length) return { progress: null, relatedCount: 0, daysLeft, late };

  let weighted = 0;
  let total = 0;
  for (const s of related) {
    const days = Math.max(1, differenceInCalendarDays(new Date(s.end_at), new Date(s.start_at)) + 1);
    weighted += days * (s.status === 'done' ? 100 : s.progress);
    total += days;
  }

  return {
    progress: Math.round(weighted / total),
    relatedCount: related.length,
    daysLeft,
    late,
  };
}

/** "3일 남음" / "2일 지연" / "오늘" / "달성" */
export function milestoneTiming(stat: MilestoneStat, status: Milestone['status']): string {
  if (status === 'reached') return '달성';
  if (stat.late) return `${Math.abs(stat.daysLeft)}일 지연`;
  if (stat.daysLeft === 0) return '오늘';
  return `${stat.daysLeft}일 남음`;
}
