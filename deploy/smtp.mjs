/**
 * Supabase 에 Resend SMTP 를 붙이고 메일 한도를 올린다.
 *
 * 기본 발송은 시간당 2통이라 팀을 한꺼번에 들일 수 없다. Supabase 는 커스텀
 * SMTP 가 없으면 한도 상향 자체를 거부하므로, 둘은 한 번에 처리해야 한다.
 *
 * 설정을 넣기 전에 키가 실제로 동작하는지 먼저 확인한다 — 틀린 키를 넣으면
 * 메일이 조용히 실패하고, 사용자는 "링크가 안 온다" 만 겪는다. 그때 원인을
 * 찾기는 훨씬 어렵다.
 */
const API = 'https://api.supabase.com/v1';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';
const NAME = process.env.RESEND_FROM_NAME || 'TeamSync';
const LIMIT = Number(process.env.EMAIL_RATE_LIMIT || 100);

if (!TOKEN || !KEY) {
  console.error('SUPABASE_ACCESS_TOKEN 과 RESEND_API_KEY 가 모두 필요합니다.');
  process.exit(1);
}

const mask = (v) => (!v || v.length <= 10 ? '…' : v.slice(0, 4) + '…' + v.slice(-4));

/**
 * 연결이 끊기면 다시 시도한다.
 * 이 스크립트가 중간에 죽으면 SMTP 는 붙고 한도는 안 오른 상태로 남을 수
 * 있다 — 그 절반짜리 상태가 가장 헷갈린다.
 */
async function tryFetch(url, init = {}, tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      last = err;
      if (i < tries) {
        process.stdout.write(`  (연결 실패 ${i}/${tries} — 다시 시도)
`);
        await new Promise((r) => setTimeout(r, 2000 * i));
      }
    }
  }
  throw last;
}
const { PROJECT_REF: ref } = JSON.parse(
  await import('node:fs').then((fs) => fs.readFileSync('deploy/.provisioned.json', 'utf8')),
);

/* ── 1. 키가 살아 있는지 ────────────────────────────────────────── */
console.log('[1] Resend 키 확인');
if (!KEY.startsWith('re_')) {
  console.error('  Resend 키는 re_ 로 시작합니다. 값을 다시 확인하세요.');
  process.exit(1);
}

const who = await tryFetch('https://api.resend.com/domains', {
  headers: { Authorization: `Bearer ${KEY}` },
});
const raw = await who.text();

/*
 * 발송 전용 키는 /domains 에 401 을 준다. 그렇다고 못 쓰는 키가 아니다 —
 * SMTP 에 필요한 것은 발송 권한뿐이고, 권한이 좁은 편이 오히려 낫다.
 * 그래서 "401" 만 보고 자르면 안 되고, 왜 401 인지를 봐야 한다.
 */
let domains = [];
let restricted = false;
if (who.ok) {
  domains = JSON.parse(raw).data ?? [];
  console.log(`  키 동작함 — 전체 권한 (${mask(KEY)})`);
} else if (raw.includes('restricted_api_key')) {
  restricted = true;
  console.log(`  키 동작함 — 발송 전용 (${mask(KEY)})`);
} else if (who.status === 401) {
  console.error('  401 — 키가 올바르지 않거나 폐기되었습니다.');
  process.exit(1);
} else {
  console.error(`  ${who.status} — ${raw.slice(0, 200)}`);
  process.exit(1);
}

/* 보내는 주소가 실제로 쓸 수 있는 것인지 본다. resend.dev 는 시험용으로
   누구나 쓸 수 있지만, 자기 도메인은 인증을 마쳐야 발송이 거부되지 않는다. */
const host = FROM.split('@')[1];

/*
 * gmail.com 같은 공용 메일 도메인은 발신 주소로 쓸 수 없다. Resend 는 DNS
 * 레코드로 도메인 소유를 확인하는데, 남의 도메인에는 레코드를 넣을 수 없다.
 * 설정은 통과해도 실제 발송에서 거부되므로 여기서 막는다 — "메일이 안 온다"
 * 로 나중에 겪는 것보다 지금 아는 편이 낫다.
 */
const PUBLIC_MAIL = [
  'gmail.com', 'googlemail.com', 'naver.com', 'daum.net', 'hanmail.net',
  'kakao.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'nate.com', 'icloud.com',
];
if (PUBLIC_MAIL.includes(host)) {
  console.error(`
  ${host} 은 발신 주소로 쓸 수 없습니다.`);
  console.error('  Resend 는 DNS 로 도메인 소유를 확인하는데, 공용 메일 도메인에는');
  console.error('  그 레코드를 넣을 수 없습니다. 설정은 되더라도 발송이 거부됩니다.');
  console.error('');
  console.error('  둘 중 하나로 바꾸세요 — deploy/credentials.sh 의 RESEND_FROM:');
  console.error("    RESEND_FROM=''                     비우면 onboarding@resend.dev (시험용)");
  console.error("    RESEND_FROM='no-reply@내도메인'     Resend → Domains 에서 인증 후");
  process.exit(1);
}

if (host === 'resend.dev') {
  console.log('  발신 주소: onboarding@resend.dev (시험용)');
  console.log('  주의: 이 주소로는 본인 가입 메일 주소에만 보낼 수 있습니다.');
  console.log('        팀원에게 보내려면 자기 도메인을 인증해야 합니다.');
} else if (restricted) {
  // 권한이 없어 확인할 수 없다. 못 본 것을 봤다고 하지 않는다.
  console.log(`  발신 주소: ${FROM}`);
  console.log(`  ${host} 의 인증 여부는 이 키로 확인할 수 없습니다.`);
  console.log('  Resend → Domains 에서 verified 인지 직접 보세요. 아니면 발송이 거부됩니다.');
} else {
  const d = domains.find((x) => x.name === host);
  if (!d) {
    console.error(`  ${host} 이 Resend 에 등록되어 있지 않습니다.`);
    console.error('  Resend → Domains 에서 추가·인증한 뒤 다시 실행하세요.');
    process.exit(1);
  }
  if (d.status !== 'verified') {
    console.error(`  ${host} 의 상태가 ${d.status} 입니다. 인증이 끝나야 발송됩니다.`);
    process.exit(1);
  }
  console.log(`  발신 주소: ${FROM} (${host} 인증됨)`);
}

/* ── 2. Supabase 에 붙이기 ──────────────────────────────────────── */
console.log('\n[2] Supabase SMTP 설정');
const body = {
  smtp_host: 'smtp.resend.com',
  smtp_port: '587', // 숫자로 보내면 거부된다
  smtp_user: 'resend',
  smtp_pass: KEY,
  smtp_admin_email: FROM,
  smtp_sender_name: NAME,
  // SMTP 가 붙어야만 받아 준다. 그래서 같은 요청에 함께 보낸다.
  rate_limit_email_sent: LIMIT,
};

const res = await tryFetch(`${API}/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const out = await res.json();
if (!res.ok || out.message) {
  console.error(`  실패: ${out.message ?? res.status}`);
  process.exit(1);
}

/* ── 3. 읽어서 확인 ─────────────────────────────────────────────── */
// 응답이 200 이라는 것과 값이 실제로 바뀌었다는 것은 다른 주장이다.
console.log('\n[3] 확인');
const check = await (
  await tryFetch(`${API}/projects/${ref}/config/auth`, { headers: { Authorization: `Bearer ${TOKEN}` } })
).json();

const rows = [
  ['smtp_host', check.smtp_host, 'smtp.resend.com'],
  ['smtp_port', String(check.smtp_port), '587'],
  ['smtp_user', check.smtp_user, 'resend'],
  ['보내는 주소', check.smtp_admin_email, FROM],
  ['보내는 이름', check.smtp_sender_name, NAME],
  ['시간당 한도', String(check.rate_limit_email_sent), String(LIMIT)],
];
let bad = 0;
for (const [label, got, want] of rows) {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log(`  ${ok ? 'OK  ' : '다름'} ${label.padEnd(14)} ${got ?? '(비어 있음)'}`);
}

console.log(
  bad === 0
    ? `\nSMTP 연결 완료. 시간당 ${LIMIT}통까지 보냅니다.`
    : `\n${bad}개 항목이 기대와 다릅니다. 위를 확인하세요.`,
);
process.exit(bad === 0 ? 0 : 1);
