/**
 * Supabase 프로젝트를 만들고(또는 고르고) 마이그레이션까지 적용한다.
 *
 * 대시보드를 오가지 않으려고 Management API 를 쓴다. 사람이 넣어야 하는 값이
 * 토큰 하나로 줄어드는 것이 목적이다 — URL·키·DB 비밀번호를 손으로 옮겨
 * 적는 과정에서 칸이 바뀌는 사고가 실제로 났다.
 *
 * 출력에 비밀값을 싣지 않는다. 프로젝트 ref 도 앞뒤만 남긴다.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.supabase.com/v1';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const WANT_NAME = process.env.SUPABASE_PROJECT_NAME || 'alpetax-scheduler';
const REGION = process.env.SUPABASE_REGION || 'ap-northeast-2'; // 서울

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN 이 없습니다.');
  process.exit(1);
}

const mask = (v) => (!v || v.length <= 10 ? '…' : `${v.slice(0, 4)}…${v.slice(-4)}`);

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = typeof body === 'object' && body?.message ? body.message : String(body).slice(0, 300);
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${msg}`);
  }
  return body;
}

/** 무료 플랜은 동시 프로젝트 수가 제한되어 있어 생성이 거부될 수 있다. */
function explainCreateFailure(err) {
  const m = err.message;
  if (m.includes('402') || m.includes('quota') || m.includes('limit')) {
    return '\n무료 플랜의 프로젝트 수 상한에 걸린 것 같습니다. 대시보드에서 쓰지 않는 프로젝트를 지우거나,\n기존 프로젝트를 쓰려면 SUPABASE_PROJECT_NAME 에 그 이름을 적어 주세요.';
  }
  if (m.includes('401') || m.includes('403')) {
    return '\n토큰이 만료되었거나 권한이 없습니다. https://supabase.com/dashboard/account/tokens 에서 새로 만드세요.';
  }
  return '';
}

/* ── 1. 조직 확인 ──────────────────────────────────────────────── */
console.log('[1] 계정 확인');
const orgs = await api('/organizations');
if (!orgs?.length) {
  console.error('  조직이 없습니다. 대시보드에서 조직을 먼저 만드세요.');
  process.exit(1);
}
const org = orgs[0];
console.log(`  조직: ${org.name}${orgs.length > 1 ? ` (${orgs.length}개 중 첫 번째)` : ''}`);

/* ── 2. 프로젝트 확보 ──────────────────────────────────────────── */
console.log('\n[2] 프로젝트');
const projects = await api('/projects');
let project = projects.find((p) => p.name === WANT_NAME);
let dbPass = process.env.SUPABASE_DB_PASSWORD ?? null;

if (project) {
  console.log(`  기존 프로젝트 사용: ${WANT_NAME} (${mask(project.id)}, ${project.region})`);
  if (!dbPass) {
    console.error(
      '\n  이 프로젝트의 DB 비밀번호를 모릅니다.' +
        '\n  credentials.sh 에 SUPABASE_DB_PASSWORD 를 적거나,' +
        '\n  대시보드 → Settings → Database → Reset database password 로 새로 정하세요.',
    );
    process.exit(1);
  }
} else {
  // 비밀번호를 사람이 정하지 않게 한다 — 약한 값이 들어가는 것을 막고, 옮겨 적다
  // 틀리는 일도 없앤다. 생성 후 credentials.sh 에 적어 둔다.
  dbPass ??= [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56])
    .join('');
  console.log(`  새로 만듭니다: ${WANT_NAME} (${REGION})`);
  try {
    project = await api('/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: WANT_NAME,
        organization_id: org.id,
        region: REGION,
        plan: 'free',
        db_pass: dbPass,
      }),
    });
  } catch (err) {
    console.error(`  생성 실패 — ${err.message}${explainCreateFailure(err)}`);
    process.exit(1);
  }
}

const ref = project.id ?? project.ref;

/* ── 3. 준비될 때까지 기다린다 ─────────────────────────────────── */
// 만들어진 직후에는 Postgres 가 아직 뜨지 않아 쿼리가 거부된다.
console.log('\n[3] 프로젝트 준비 대기');
const deadline = Date.now() + 6 * 60_000;
let status = project.status;
while (status !== 'ACTIVE_HEALTHY' && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 6000));
  try {
    status = (await api(`/projects/${ref}`)).status;
  } catch {
    /* 생성 직후 잠깐 404 가 날 수 있다 — 계속 기다린다 */
  }
  process.stdout.write(`\r  상태: ${status}            `);
}
console.log();
if (status !== 'ACTIVE_HEALTHY') {
  console.error('  제한 시간 안에 준비되지 않았습니다. 잠시 뒤 다시 실행하세요.');
  process.exit(1);
}

/* ── 4. publishable 키 ─────────────────────────────────────────── */
console.log('\n[4] API 키');
const keys = await api(`/projects/${ref}/api-keys`);
const pub =
  keys.find((k) => k.type === 'publishable')?.api_key ??
  keys.find((k) => k.name === 'anon')?.api_key;
if (!pub) {
  console.error('  publishable(anon) 키를 찾지 못했습니다.');
  process.exit(1);
}
console.log(`  publishable 키 확보 (${pub.length}자)`);

/* ── 5. 마이그레이션 ───────────────────────────────────────────── */
// pg 로 붙지 않고 Management API 의 query 엔드포인트를 쓴다. 연결 문자열을
// 사람이 옮겨 적을 필요가 없어지고, 비밀번호 인코딩 문제도 사라진다.
console.log('\n[5] 마이그레이션');
const DIR = 'supabase/migrations';
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

for (const f of files) {
  const sql = readFileSync(join(DIR, f), 'utf8');
  process.stdout.write(`  ${f} … `);
  try {
    // 파일 하나를 트랜잭션 하나로. 중간에 터져 반쯤 적용된 스키마가 남지 않게 한다.
    await api(`/projects/${ref}/database/query`, {
      method: 'POST',
      body: JSON.stringify({ query: `begin;\n${sql}\ncommit;` }),
    });
    console.log('적용');
  } catch (err) {
    console.log('실패');
    console.error(`\n  ${err.message}\n`);
    await api(`/projects/${ref}/database/query`, {
      method: 'POST',
      body: JSON.stringify({ query: 'rollback;' }),
    }).catch(() => {});
    process.exit(1);
  }
}

/* ── 6. 적용 결과 확인 ─────────────────────────────────────────── */
// "오류 없음" 과 "실제로 만들어짐" 은 다른 주장이다.
console.log('\n[6] 확인');
const [{ n: tables }] = await api(`/projects/${ref}/database/query`, {
  method: 'POST',
  body: JSON.stringify({
    query: `select count(*)::int n from information_schema.tables
            where table_schema='public' and table_type='BASE TABLE'`,
  }),
});
const [{ n: rls }] = await api(`/projects/${ref}/database/query`, {
  method: 'POST',
  body: JSON.stringify({
    query: `select count(*)::int n from pg_tables where schemaname='public' and rowsecurity=true`,
  }),
});
const [{ n: fn }] = await api(`/projects/${ref}/database/query`, {
  method: 'POST',
  body: JSON.stringify({
    query: `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
            where ns.nspname='public' and p.proname='schedules_in_range'`,
  }),
});
console.log(`  테이블 ${tables}개 · RLS 적용 ${rls}개 · schedules_in_range ${fn}개`);
if (tables !== rls) console.log('  경고: RLS 가 빠진 테이블이 있습니다 — 누구에게나 열려 있습니다.');
if (fn !== 1) console.log('  경고: 함수 오버로드가 남았습니다 — 조회가 실패할 수 있습니다.');

/* ── 7. 다음 단계로 넘길 값 ────────────────────────────────────── */
const out = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: pub,
  SUPABASE_DB_PASSWORD: dbPass,
  PROJECT_REF: ref,
};
writeFileSync('deploy/.provisioned.json', JSON.stringify(out, null, 2));
console.log(`\n프로젝트 https://${mask(ref)}.supabase.co 준비 완료.`);
console.log('값은 deploy/.provisioned.json 에 적었습니다 (gitignore 됨).');
