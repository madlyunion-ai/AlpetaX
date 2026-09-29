import { differenceInCalendarDays } from 'date-fns';
import type { Horizon } from './types';

/**
 * 기간 길이로 시계(horizon)를 추론한다.
 * 사용자가 직접 고른 경우(horizon_locked)에는 호출하지 않는다.
 */
export function inferHorizon(startAt: Date, endAt: Date): Horizon {
  const days = differenceInCalendarDays(endAt, startAt) + 1;
  if (days >= 90) return 'long'; // 분기 이상
  if (days >= 14) return 'mid'; // 2주 이상
  return 'short';
}

export const HORIZON_ORDER: Horizon[] = ['long', 'mid', 'short'];
