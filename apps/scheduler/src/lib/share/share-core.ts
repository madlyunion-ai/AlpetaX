/**
 * 외부 공유 — 화면·서버가 함께 쓰는 순수 함수.
 *
 * 공개 페이지, .ics 라우트, 공유 창의 '캘린더' 탭이 모두 같은 함수로
 * 내보낸다. 한쪽만 고치면 받는 사람이 보는 것과 캘린더에 들어가는 것이
 * 서로 달라진다.
 */
import { STATUS_LABEL, type SchedStatus } from '../schedule-core/types';

export type ShareKind = 'schedule' | 'view';
export type ShareScope = 'anyone' | 'password';
export type ExpireChoice = '7' | '30' | '90' | 'none';

export const SCOPE_LABEL: Record<ShareScope, string> = {
  anyone: '링크가 있는 누구나',
  password: '비밀번호를 아는 사람',
};
export const EXPIRE_LABEL: Record<ExpireChoice, string> = {
  '7': '7일',
  '30': '30일',
  '90': '90일',
  none: '만료 없음',
};

/** 외부에 보일 항목. 제목·기간·프로젝트는 늘 보인다. */
export interface ShareFields {
  show_team: boolean;
  show_progress: boolean;
  show_assignees: boolean;
  show_description: boolean;
}
export const FIELD_LABEL: Record<keyof ShareFields, string> = {
  show_team: '팀 이름',
  show_progress: '상태 · 진행률',
  show_assignees: '담당자 이름',
  show_description: '설명',
};
/** 기본은 '덜 보여 주기' — 담당자 이름·설명은 직접 켜야 나간다. DB 기본값과 같다. */
export const DEFAULT_FIELDS: ShareFields = {
  show_team: true,
  show_progress: true,
  show_assignees: false,
  show_description: false,
};

/** 화면 공유가 저장하는 조건. 목록 키가 null 이면 전부, [] 이면 아무것도. */
export interface ShareFilter {
  from: string;
  to: string;
  project_ids: string[] | null;
  team_ids: string[] | null;
  phase_ids: string[] | null;
  assignee_ids: string[] | null;
}

/** share_links 한 줄 — 비밀번호 해시는 별도 표라 여기에 없다. */
export interface ShareLink extends ShareFields {
  id: string;
  workspace_id: string;
  token: string;
  kind: ShareKind;
  schedule_id: string | null;
  title: string | null;
  filter: ShareFilter | null;
  scope: ShareScope;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_by: string;
  created_at: string;
}

export const SHARE_COLUMNS =
  'id, workspace_id, token, kind, schedule_id, title, filter, scope, show_team, show_progress, show_assignees, show_description, expires_at, revoked_at, view_count, last_viewed_at, created_by, created_at';

/** 받는 사람에게 가는 일정 한 건. 꺼 둔 항목은 키 자체가 없다. */
export interface ShareItem {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  project?: string;
  project_color?: string;
  team?: string;
  team_color?: string;
  status?: SchedStatus;
  progress?: number;
  description?: string;
  assignees?: string[];
}

export type OpenStatus =
  | 'ok'
  | 'not_found'
  | 'revoked'
  | 'expired'
  | 'disabled'
  | 'password_required'
  | 'wrong_password';

export interface OpenShareResult {
  status: OpenStatus;
  workspace?: string;
  share?: ShareFields & {
    kind: ShareKind;
    title: string;
    workspace: string;
    expires_at: string | null;
    scope: ShareScope;
    from: string | null;
    to: string | null;
  };
  items?: ShareItem[];
}

export const isExpired = (l: Pick<ShareLink, 'expires_at'>, now = new Date()) =>
  l.expires_at !== null && new Date(l.expires_at) < now;
export const isActive = (l: Pick<ShareLink, 'expires_at' | 'revoked_at'>, now = new Date()) =>
  l.revoked_at === null && !isExpired(l, now);

export function expiresAtFor(choice: ExpireChoice, now = new Date()): string | null {
  if (choice === 'none') return null;
  return new Date(now.getTime() + Number(choice) * 86_400_000).toISOString();
}

export const shareUrl = (origin: string, token: string) => `${origin}/s/${token}`;
/** 캘린더 구독 주소. webcal:// 로 열면 캘린더 앱이 '구독' 으로 받는다. */
export const icsUrl = (origin: string, token: string) =>
  `${origin}/s/${token}/calendar.ics`.replace(/^https?:/, 'webcal:');

/* ── 날짜 ──────────────────────────────────────────────────────────── */
const pad = (n: number) => String(n).padStart(2, '0');
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 날짜를 서울 기준으로 읽는다. 공개 페이지·.ics 는 서버(UTC)에서 그려지므로
 * 런타임 시간대를 믿으면 종일 일정이 하루씩 밀린다. 이 앱의 사용자는 한국에 있다.
 */
export const SHARE_TZ = 'Asia/Seoul';
function parts(iso: string, tz = SHARE_TZ) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { y: +get('year'), m: +get('month'), d: +get('day'), hh: get('hour'), mm: get('minute'), dow: wd };
}
const ymdOf = (iso: string) => {
  const p = parts(iso);
  return `${p.y}${pad(p.m)}${pad(p.d)}`;
};
const dashOf = (iso: string) => {
  const p = parts(iso);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};
/** 종일 일정의 종료는 '다음 날 0시' 로 적는다 — 캘린더 표준(RFC 5545)의 약속이다. */
function dayAfter(iso: string) {
  const p = parts(iso);
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
const utcStamp = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function fmtDate(iso: string) {
  const p = parts(iso);
  return `${p.y}.${pad(p.m)}.${pad(p.d)}`;
}

export function fmtPeriod(it: Pick<ShareItem, 'start_at' | 'end_at' | 'all_day'>) {
  const a = parts(it.start_at);
  const b = parts(it.end_at);
  const da = `${a.y}.${pad(a.m)}.${pad(a.d)}`;
  if (!it.all_day) {
    const same = a.y === b.y && a.m === b.m && a.d === b.d;
    return same
      ? `${da} (${DOW[a.dow]}) ${a.hh}:${a.mm}–${b.hh}:${b.mm}`
      : `${da} ${a.hh}:${a.mm} – ${b.y}.${pad(b.m)}.${pad(b.d)} ${b.hh}:${b.mm}`;
  }
  if (a.y === b.y && a.m === b.m && a.d === b.d) return `${da} (${DOW[a.dow]})`;
  return `${da} – ${a.y === b.y ? `${pad(b.m)}.${pad(b.d)}` : `${b.y}.${pad(b.m)}.${pad(b.d)}`}`;
}

/* ── 내보내기 ──────────────────────────────────────────────────────── */

/** 캘린더 메모에 들어갈 본문. 꺼 둔 항목은 ShareItem 에 없으므로 저절로 빠진다. */
export function exportText(it: ShareItem, workspace: string, link?: string) {
  const out: string[] = [];
  if (it.project) out.push(`프로젝트: ${it.project}`);
  if (it.team) out.push(`팀: ${it.team}`);
  if (it.status) out.push(`상태: ${STATUS_LABEL[it.status]} · ${it.progress ?? 0}%`);
  if (it.assignees?.length) out.push(`담당: ${it.assignees.join(', ')}`);
  if (it.description) out.push('', it.description);
  out.push('', `${workspace}에서 Syncteams 로 공유한 일정`);
  if (link) out.push(link);
  return out.join('\n');
}

const icsEscape = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);

/** 한 줄 75바이트 제한(RFC 5545). 한글은 3바이트라 글자 수로 자르면 넘친다. */
function fold(line: string) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let limit = 75;
  for (const ch of line) {
    if (enc.encode(cur + ch).length > limit) {
      out.push(cur);
      cur = ch;
      limit = 74; // 이어지는 줄은 앞의 공백 한 칸을 뺀다
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(
  items: ShareItem[],
  opts: { name: string; workspace: string; link?: string; now?: Date },
) {
  const stamp = utcStamp((opts.now ?? new Date()).toISOString());
  const L = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Syncteams//Share//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opts.name)}`,
    `X-WR-TIMEZONE:${SHARE_TZ}`,
  ];
  for (const it of items) {
    L.push('BEGIN:VEVENT', `UID:${it.id}@syncteams`, `DTSTAMP:${stamp}`);
    if (it.all_day) L.push(`DTSTART;VALUE=DATE:${ymdOf(it.start_at)}`, `DTEND;VALUE=DATE:${dayAfter(it.end_at)}`);
    else L.push(`DTSTART:${utcStamp(it.start_at)}`, `DTEND:${utcStamp(it.end_at)}`);
    L.push(
      `SUMMARY:${icsEscape(it.title)}`,
      `DESCRIPTION:${icsEscape(exportText(it, opts.workspace, opts.link))}`,
    );
    if (opts.link) L.push(`URL:${opts.link}`);
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(it: ShareItem, workspace: string, link?: string) {
  const dates = it.all_day
    ? `${ymdOf(it.start_at)}/${dayAfter(it.end_at)}`
    : `${utcStamp(it.start_at)}/${utcStamp(it.end_at)}`;
  return (
    'https://calendar.google.com/calendar/render?' +
    new URLSearchParams({ action: 'TEMPLATE', text: it.title, dates, details: exportText(it, workspace, link) })
  );
}

export function outlookUrl(it: ShareItem, workspace: string, link?: string) {
  const end = dayAfter(it.end_at);
  return (
    'https://outlook.office.com/calendar/0/deeplink/compose?' +
    new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: it.title,
      startdt: it.all_day ? dashOf(it.start_at) : new Date(it.start_at).toISOString(),
      enddt: it.all_day
        ? `${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}`
        : new Date(it.end_at).toISOString(),
      allday: String(it.all_day),
      body: exportText(it, workspace, link),
    })
  );
}

/** 파일 이름에 쓸 수 없는 글자를 바꾼다. */
export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'schedule';
