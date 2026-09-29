/**
 * 메일을 거치지 않고 로그인 링크를 만든다.
 *
 * Supabase 기본 메일 발송은 시간당 2통이다. 한도에 걸리면 한 시간을 기다려야
 * 하는데, Admin API 로 메일이 담았을 링크를 직접 받아 올 수 있다.
 *
 * secret 키를 쓴다 — 이 키는 RLS 를 우회하므로 브라우저 쪽에는 절대 가지
 * 않는다. 여기서만 쓰고 출력하지 않는다.
 *
 * 링크 자체가 로그인 자격이다. 화면에 찍지 않고 파일에 쓴다.
 */
import { writeFileSync } from 'node:fs';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const email = process.argv[2];

if (!TOKEN || !email) {
  console.error('사용법: SUPABASE_ACCESS_TOKEN=... node deploy/login-link.mjs <이메일>');
  process.exit(1);
}

const { PROJECT_REF: ref, NEXT_PUBLIC_SUPABASE_URL: url } = JSON.parse(
  await import('node:fs').then((fs) => fs.readFileSync('deploy/.provisioned.json', 'utf8')),
);

/* secret 키를 가져온다 */
const keysRes = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
if (!keysRes.ok) {
  console.error(`키 조회 실패: ${keysRes.status}`);
  process.exit(1);
}
const keys = await keysRes.json();
// legacy service_role(JWT) 을 먼저 고른다 — auth 관리자 엔드포인트는 아직
// 새 sb_secret_ 형식을 받지 않고 "Invalid API key" 로 거절한다.
const secret =
  keys.find((k) => k.type === 'legacy' && k.name === 'service_role')?.api_key ??
  keys.find((k) => k.type === 'secret')?.api_key;
if (!secret) {
  console.error('secret(service_role) 키를 찾지 못했습니다.');
  process.exit(1);
}

/* 메일이 담았을 링크를 그대로 받아 온다 */
const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ type: 'magiclink', email }),
});

const body = await res.json();
if (!res.ok) {
  console.error(`링크 생성 실패 ${res.status}: ${body.msg ?? body.message ?? JSON.stringify(body)}`);
  process.exit(1);
}

const link = body.properties?.action_link ?? body.action_link;
if (!link) {
  console.error('응답에 action_link 가 없습니다.');
  process.exit(1);
}

const OUT = 'deploy/.login-link.txt';
writeFileSync(OUT, link + '\n');
console.log(`${email} 의 로그인 링크를 ${OUT} 에 적었습니다.`);
console.log('브라우저에 붙여넣어 여세요. 한 시간 뒤 만료되고, 한 번 쓰면 무효가 됩니다.');
