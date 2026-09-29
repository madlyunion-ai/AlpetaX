/**
 * Supabase 에 구글 로그인을 붙인다.
 *
 * 메일을 한 통도 쓰지 않는다 — 발송 한도, 발신 도메인, SMTP 가 모두 무관해진다.
 * 팀원을 들일 때 "메일이 왜 안 오지" 를 겪지 않는 것이 이 방식의 요점이다.
 *
 * 이메일 로그인은 끄지 않는다. 구글 계정이 아닌 주소로 승인된 사람이 남아
 * 있을 수 있고, 로그인 수단을 하나만 두면 그쪽이 막혔을 때 들어갈 길이 없다.
 */
const API = 'https://api.supabase.com/v1';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ID = process.env.GOOGLE_CLIENT_ID;
const SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!TOKEN || !ID || !SECRET) {
  console.error('SUPABASE_ACCESS_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 이 모두 필요합니다.');
  process.exit(1);
}

const mask = (v) => (!v || v.length <= 10 ? '…' : v.slice(0, 4) + '…' + v.slice(-4));

async function tryFetch(url, init = {}, tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      last = err;
      if (i < tries) {
        console.log(`  (연결 실패 ${i}/${tries} — 다시 시도)`);
        await new Promise((r) => setTimeout(r, 2000 * i));
      }
    }
  }
  throw last;
}

const { PROJECT_REF: ref } = JSON.parse(
  await import('node:fs').then((fs) => fs.readFileSync('deploy/.provisioned.json', 'utf8')),
);

/* ── 값 모양 확인 ──────────────────────────────────────────────── */
// 구글 콘솔에서 두 값을 옮겨 적다 보면 서로 바뀌는 일이 흔하다.
// 형식으로 걸러내면 "로그인이 안 된다" 를 나중에 겪지 않는다.
console.log('[1] 값 확인');
if (!ID.endsWith('.apps.googleusercontent.com')) {
  console.error('  GOOGLE_CLIENT_ID 는 .apps.googleusercontent.com 으로 끝나야 합니다.');
  console.error('  클라이언트 ID 와 시크릿이 바뀌지 않았는지 확인하세요.');
  process.exit(1);
}
if (ID === SECRET) {
  console.error('  두 값이 같습니다.');
  process.exit(1);
}
console.log(`  클라이언트 ID  ${mask(ID)}`);
console.log(`  시크릿         ${mask(SECRET)}`);

/* ── 붙이기 ────────────────────────────────────────────────────── */
console.log('\n[2] Supabase 설정');
const res = await tryFetch(`${API}/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    external_google_enabled: true,
    external_google_client_id: ID,
    external_google_secret: SECRET,
    // 구글이 확인해 준 주소는 다시 확인하지 않는다. 이걸 켜 두면 구글로 들어온
    // 사람에게도 확인 메일이 나가서, 메일을 안 쓰려던 목적이 무너진다.
    mailer_autoconfirm: true,
  }),
});
const out = await res.json();
if (!res.ok || out.message) {
  console.error(`  실패: ${out.message ?? res.status}`);
  process.exit(1);
}

/* ── 읽어서 확인 ───────────────────────────────────────────────── */
console.log('\n[3] 확인');
const c = await (
  await tryFetch(`${API}/projects/${ref}/config/auth`, { headers: { Authorization: `Bearer ${TOKEN}` } })
).json();

const rows = [
  ['구글 로그인', c.external_google_enabled, true],
  ['클라이언트 ID 등록', Boolean(c.external_google_client_id), true],
  ['이메일 로그인 유지', c.external_email_enabled, true],
];
let bad = 0;
for (const [label, got, want] of rows) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`  ${ok ? 'OK  ' : '다름'} ${label.padEnd(20)} ${got}`);
}

console.log(`\n리디렉션 URI (구글 콘솔에 등록돼 있어야 함):`);
console.log(`  https://${ref}.supabase.co/auth/v1/callback`);
console.log(bad === 0 ? '\n구글 로그인 연결 완료.' : `\n${bad}개 항목이 기대와 다릅니다.`);
process.exit(bad === 0 ? 0 : 1);
