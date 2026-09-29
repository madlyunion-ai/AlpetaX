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
const { PROJECT_REF: ref } = JSON.parse(
  await import('node:fs').then((fs) => fs.readFileSync('deploy/.provisioned.json', 'utf8')),
);

/* ── 1. 키가 살아 있는지 ────────────────────────────────────────── */
console.log('[1] Resend 키 확인');
const who = await fetch('https://api.resend.com/domains', {
  headers: { Authorization: `Bearer ${KEY}` },
});
if (who.status === 401) {
  console.error('  401 — 키가 올바르지 않거나 폐기되었습니다.');
  process.exit(1);
}
if (!who.ok) {
  console.error(`  ${who.status} — ${(await who.text()).slice(0, 200)}`);
  process.exit(1);
}
const domains = (await who.json()).data ?? [];
console.log(`  키 동작함 (${mask(KEY)})`);

/* 보내는 주소가 실제로 쓸 수 있는 것인지 본다. resend.dev 는 시험용으로
   누구나 쓸 수 있지만, 자기 도메인은 인증을 마쳐야 발송이 거부되지 않는다. */
const host = FROM.split('@')[1];
if (host === 'resend.dev') {
  console.log('  발신 주소: onboarding@resend.dev (시험용)');
  console.log('  주의: 이 주소로는 본인 가입 메일 주소에만 보낼 수 있습니다.');
  console.log('        팀원에게 보내려면 자기 도메인을 인증해야 합니다.');
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
  smtp_port: 587,
  smtp_user: 'resend',
  smtp_pass: KEY,
  smtp_admin_email: FROM,
  smtp_sender_name: NAME,
  // SMTP 가 붙어야만 받아 준다. 그래서 같은 요청에 함께 보낸다.
  rate_limit_email_sent: LIMIT,
};

const res = await fetch(`${API}/projects/${ref}/config/auth`, {
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
  await fetch(`${API}/projects/${ref}/config/auth`, { headers: { Authorization: `Bearer ${TOKEN}` } })
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
