import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  expiresAtFor,
  exportText,
  fmtPeriod,
  googleCalendarUrl,
  icsUrl,
  isActive,
  outlookUrl,
  type ShareItem,
} from './share-core';

/* 앱은 종일 일정을 서울 00:00 ~ 23:59 로 저장한다 */
const allDay: ShareItem = {
  id: 'a1',
  title: '예약 화면 개발',
  start_at: '2026-11-08T15:00:00.000Z', // 11.09 00:00 KST
  end_at: '2026-12-25T14:59:00.000Z', //   12.25 23:59 KST
  all_day: true,
  project: '스마트 예약',
};
const timed: ShareItem = {
  id: 't1',
  title: '디자인 리뷰, 2차; 최종',
  start_at: '2026-11-10T05:00:00.000Z', // 14:00 KST
  end_at: '2026-11-10T07:00:00.000Z',
  all_day: false,
  project: '스마트 예약',
  team: '디자인',
  status: 'active',
  progress: 40,
};

describe('기간 표시 — 서버 시간대와 무관하게 서울 기준', () => {
  it('종일 여러 날', () => expect(fmtPeriod(allDay)).toBe('2026.11.09 – 12.25'));
  it('시간 지정', () => expect(fmtPeriod(timed)).toBe('2026.11.10 (화) 14:00–16:00'));
  it('종일 하루', () =>
    expect(
      fmtPeriod({ start_at: '2026-09-27T15:00:00Z', end_at: '2026-09-28T14:59:00Z', all_day: true }),
    ).toBe('2026.09.28 (월)'));
});

describe('.ics', () => {
  const ics = buildIcs([allDay, timed], {
    name: '공유 일정',
    workspace: '유니온',
    now: new Date('2026-11-10T00:00:00Z'),
  });

  it('종일 일정의 종료는 다음 날(배타적)', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20261109');
    expect(ics).toContain('DTEND;VALUE=DATE:20261226');
  });
  it('시간 일정은 UTC', () => {
    expect(ics).toContain('DTSTART:20261110T050000Z');
    expect(ics).toContain('DTEND:20261110T070000Z');
  });
  it('쉼표·세미콜론을 이스케이프', () => expect(ics).toContain('SUMMARY:디자인 리뷰\\, 2차\\; 최종'));
  it('줄 끝은 CRLF, 한 줄은 75바이트 이하', () => {
    expect(ics.includes('\r\n')).toBe(true);
    const enc = new TextEncoder();
    for (const line of ics.split('\r\n')) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
  });
  it('일정 수만큼 VEVENT', () => expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2));
});

describe('꺼 둔 항목은 내보내지 않는다', () => {
  it('담당자·설명이 없는 항목', () => {
    const text = exportText(allDay, '유니온');
    expect(text).not.toContain('담당');
    expect(text).toContain('프로젝트: 스마트 예약');
  });
  it('켠 항목만', () => {
    const text = exportText({ ...timed, assignees: ['김서연'], description: '메모' }, '유니온');
    expect(text).toContain('담당: 김서연');
    expect(text).toContain('상태: 진행중 · 40%');
    expect(text).toContain('메모');
  });
});

describe('캘린더 추가 주소', () => {
  it('Google — 종일은 날짜, 종료는 다음 날', () => {
    const u = new URL(googleCalendarUrl(allDay, '유니온'));
    expect(u.searchParams.get('dates')).toBe('20261109/20261226');
  });
  it('Outlook — 종일', () => {
    const u = new URL(outlookUrl(allDay, '유니온'));
    expect(u.searchParams.get('startdt')).toBe('2026-11-09');
    expect(u.searchParams.get('enddt')).toBe('2026-12-26');
    expect(u.searchParams.get('allday')).toBe('true');
  });
});

describe('주소와 만료', () => {
  it('구독 주소는 webcal', () =>
    expect(icsUrl('https://unionteam.vercel.app', 'abc')).toBe('webcal://unionteam.vercel.app/s/abc/calendar.ics'));
  it('만료 계산', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    expect(expiresAtFor('7', now)).toBe('2026-11-17T00:00:00.000Z');
    expect(expiresAtFor('none', now)).toBeNull();
  });
  it('회수·만료된 링크는 비활성', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    expect(isActive({ revoked_at: null, expires_at: null }, now)).toBe(true);
    expect(isActive({ revoked_at: '2026-11-01T00:00:00Z', expires_at: null }, now)).toBe(false);
    expect(isActive({ revoked_at: null, expires_at: '2026-11-09T00:00:00Z' }, now)).toBe(false);
  });
});
