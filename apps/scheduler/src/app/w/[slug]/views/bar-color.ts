import { isLate } from '@/lib/schedule-core/workload';
import type { Schedule } from '@/lib/schedule-core/types';

/**
 * 막대 색 — 모든 뷰가 이 함수 하나를 쓴다.
 *
 * 지연된 일은 제 색(업무구분·팀 색)을 잃고 빨강이 된다. 테두리로 표시하지
 * 않는 이유 — 축척을 줄이면 막대가 몇 px 로 얇아지고, 그때 2px 테두리는
 * 안쪽 색을 다 덮어 원래 색도 지연 표시도 읽히지 않는다. 면을 칠하면
 * 막대가 아무리 얇아도 빨강 하나로 남는다.
 *
 * 경고 문구용 --warn 이 아니라 --warn-bar(그보다 20% 밝은 값)를 쓴다 —
 * 면을 넓게 칠할 때는 글자에 쓰는 만큼 진하면 옆 막대들을 눌러 버린다.
 * 문자열로 돌려주는 것은 의도다 — 인라인 스타일도 커스텀 속성을 읽으므로
 * 테마가 바뀌면 이 색도 따라 바뀐다.
 */
export function barColor(
  s: Schedule,
  own: string | null | undefined,
  /** 툴바의 '지연' 스위치. 끄면 지연된 일도 제 색으로 돌아간다. */
  markLate = true,
  now?: Date,
): string {
  if (markLate && isLate(s, now)) return 'var(--warn-bar)';
  return own || 'var(--ink-3)';
}
