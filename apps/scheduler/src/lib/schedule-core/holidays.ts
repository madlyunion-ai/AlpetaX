/**
 * 날짜가 고정된 한국 공휴일.
 *
 * 음력 기반(설날·부처님오신날·추석)과 대체공휴일은 해마다 날짜가 달라
 * 연도별 표가 있어야 한다. 음력 변환을 추측으로 구현하면 틀린 날을
 * 빨갛게 칠하게 되므로, 여기서는 날짜가 확실한 것만 다룬다.
 *
 * 나머지는 워크스페이스가 직접 등록하는 방식(향후 `holidays` 테이블)으로
 * 채우는 것이 맞다 — 회사마다 창립기념일 같은 자체 휴일도 다르다.
 */
const FIXED: ReadonlyArray<readonly [month: number, day: number, name: string]> = [
  [1, 1, '신정'],
  [3, 1, '삼일절'],
  [5, 5, '어린이날'],
  [6, 6, '현충일'],
  [8, 15, '광복절'],
  [10, 3, '개천절'],
  [10, 9, '한글날'],
  [12, 25, '성탄절'],
];

/** 이 날짜가 고정 공휴일이면 이름을, 아니면 null 을 준다. */
export function holidayName(d: Date): string | null {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return FIXED.find(([hm, hd]) => hm === m && hd === day)?.[2] ?? null;
}

export function isHoliday(d: Date): boolean {
  return holidayName(d) !== null;
}

/**
 * 주가 시작하는 요일. 0 = 일요일.
 * 달력 격자, 주 뷰, 로드맵의 1W~4W 가 모두 이 값을 따른다 —
 * 화면마다 다르면 "이번 주"가 두 가지 뜻을 갖는다.
 */
export const WEEK_STARTS_ON = 0 as const;

/** getDay() 그대로. 0 = 일요일 … 6 = 토요일 */
export function dowIndex(d: Date): number {
  return d.getDay();
}

export const SUNDAY = 0;
export const SATURDAY = 6;

/** 날짜 글자를 빨강으로 칠할 날인가 — 일요일이거나 공휴일 */
export function isRestDay(d: Date): boolean {
  return dowIndex(d) === SUNDAY || isHoliday(d);
}
