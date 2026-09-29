/**
 * Supabase 프로젝트를 고르거나 만들고, 마이그레이션까지 적용한다.
 *
 * 대시보드를 오가지 않으려고 Management API 를 쓴다. 사람이 넣어야 하는 값이
 * 토큰 하나로 줄어드는 것이 목적이다 — URL·키·DB 비밀번호를 손으로 옮겨
 * 적는 과정에서 칸이 바뀌는 사고가 실제로 났다.
 *
 * DB 비밀번호는 쓰지 않는다. 마이그레이션도 이 API 의 query 로 보내므로
 * 연결 문자열을 만들 일이 없고, 비밀번호 인코딩 문제도 생기지 않는다.
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

const mask = (v) => (!v || v.length <= 10 ? '…' : v.slice(0, 4) + '…' + v.slice(-4));

async function api(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
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
    const msg = body && typeof body === 'object' && body.message ? body.message : String(body).slice(0, 300);
    throw new Error((init.method ?? 'GET') + ' ' + path + ' → ' + res.status + ' ' + msg);
  }
  return body;
}

/** 프로젝트에 SQL 을 보낸다. */
const query = (ref, sql) =>
  api('/projects/' + ref + '/database/query', { method: 'POST', body: JSON.stringify({ query: sql }) });

/* ── 1. 프로젝트 확보 ──────────────────────────────────────────── */
console.log('[1] 프로젝트');
const projects = await api('/projects');

// 이름이 맞는 것을 먼저 찾고, 이름 지정이 없고 프로젝트가 하나뿐이면 그것을 쓴다.
// 계정에 하나만 있는데 새로 만들면 무료 플랜 상한에 걸리고, 사람이 방금 만든
// 프로젝트를 두고 엉뚱한 곳에 스키마를 올리게 된다.
let project =
  projects.find((p) => p.name === WANT_NAME) ??
  (!process.env.SUPABASE_PROJECT_NAME && projects.length === 1 ? projects[0] : null);

let dbPass = process.env.SUPABASE_DB_PASSWORD ?? null;

if (project) {
  console.log('  기존 프로젝트 사용: ' + project.name + ' (' + mask(project.id) + ', ' + project.region + ')');
} else {
  // 새로 만들 때만 조직이 필요하다.
  const orgs = await api('/organizations');
  const org = orgs && orgs[0];
  if (!org) {
    console.error(
      '  조직 목록이 비어 있어 새 프로젝트를 만들 수 없습니다.\n' +
        '  토큰 범위 때문일 수 있습니다. 대시보드에서 프로젝트를 만든 뒤\n' +
        '  SUPABASE_PROJECT_NAME 에 그 이름을 적어 다시 실행하세요.',
    );
    process.exit(1);
  }
  console.log('  조직: ' + (org.name ?? org.id));

  // 비밀번호를 사람이 정하지 않게 한다 — 약한 값이 들어가는 것을 막고, 옮겨
  // 적다 틀리는 일도 없앤다.
  dbPass ??= [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56])
    .join('');
  console.log('  새로 만듭니다: ' + WANT_NAME + ' (' + REGION + ')');
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
    console.error('  생성 실패 — ' + err.message);
    if (/402|quota|limit/.test(err.message)) {
      console.error('\n  무료 플랜의 프로젝트 수 상한일 수 있습니다.');
    } else if (/401|403/.test(err.message)) {
      console.error('\n  토큰이 만료되었거나 권한이 없습니다.');
    }
    process.exit(1);
  }
}

const ref = project.id ?? project.ref;

/* ── 2. 준비될 때까지 기다린다 ─────────────────────────────────── */
// 만들어진 직후에는 Postgres 가 아직 뜨지 않아 쿼리가 거부된다.
if (project.status !== 'ACTIVE_HEALTHY') {
  console.log('\n[2] 프로젝트 준비 대기');
  const deadline = Date.now() + 6 * 60_000;
  let status = project.status ?? 'UNKNOWN';
  while (status !== 'ACTIVE_HEALTHY' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 6000));
    try {
      status = (await api('/projects/' + ref)).status;
    } catch {
      /* 생성 직후 잠깐 404 가 날 수 있다 — 계속 기다린다 */
    }
    process.stdout.write('\r  상태: ' + status + '            ');
  }
  console.log();
  if (status !== 'ACTIVE_HEALTHY') {
    console.error('  제한 시간 안에 준비되지 않았습니다. 잠시 뒤 다시 실행하세요.');
    process.exit(1);
  }
} else {
  console.log('\n[2] 프로젝트 준비 대기 — 이미 ACTIVE_HEALTHY');
}

/* ── 3. publishable 키 ─────────────────────────────────────────── */
console.log('\n[3] API 키');
const keys = await api('/projects/' + ref + '/api-keys');
// type 으로 고른다 — legacy 항목이 함께 오므로 순서에 기대면 안 된다.
const pub =
  keys.find((k) => k.type === 'publishable')?.api_key ??
  keys.find((k) => k.type === 'legacy' && k.name === 'anon')?.api_key;
if (!pub) {
  console.error('  publishable(anon) 키를 찾지 못했습니다.');
  process.exit(1);
}
if (pub.startsWith('sb_secret_') || keys.some((k) => k.type === 'secret' && k.api_key === pub)) {
  console.error('  secret 키를 골랐습니다 — 중단합니다. RLS 를 우회하는 키입니다.');
  process.exit(1);
}
console.log('  publishable 키 확보 (' + pub.length + '자)');

/* ── 4. 마이그레이션 ───────────────────────────────────────────── */
console.log('\n[4] 마이그레이션');
const DIR = 'supabase/migrations';
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort(); // 0001 → 0004. 이름 순서가 곧 적용 순서다.

// 이미 스키마가 있으면 멈춘다 — 남의 데이터 위에 덮어쓰지 않는다.
const existing = await query(
  ref,
  "select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
);
if (existing[0].n > 0) {
  console.log('  이미 public 테이블이 ' + existing[0].n + '개 있습니다.');
  if (process.env.ALLOW_EXISTING_SCHEMA !== 'yes') {
    console.error(
      '  덮어쓰지 않고 멈춥니다. 같은 스키마를 다시 올리려면\n' +
        '  ALLOW_EXISTING_SCHEMA=yes 를 주고 실행하세요.',
    );
    process.exit(1);
  }
  console.log('  ALLOW_EXISTING_SCHEMA=yes — 계속합니다.');
}

for (const f of files) {
  const sql = readFileSync(join(DIR, f), 'utf8');
  process.stdout.write('  ' + f + ' … ');
  try {
    // 파일 하나를 트랜잭션 하나로. 중간에 터져 반쯤 적용된 스키마가 남지 않게 한다.
    await query(ref, 'begin;\n' + sql + '\ncommit;');
    console.log('적용');
  } catch (err) {
    console.log('실패');
    console.error('\n  ' + err.message + '\n');
    await query(ref, 'rollback;').catch(() => {});
    process.exit(1);
  }
}

/* ── 5. 적용 결과 확인 ─────────────────────────────────────────── */
// "오류 없음" 과 "실제로 만들어짐" 은 다른 주장이다.
console.log('\n[5] 확인');
const [{ n: tables }] = await query(
  ref,
  "select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
);
const [{ n: rls }] = await query(
  ref,
  "select count(*)::int n from pg_tables where schemaname='public' and rowsecurity=true",
);
const [{ n: fn }] = await query(
  ref,
  "select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace" +
    " where ns.nspname='public' and p.proname='schedules_in_range'",
);
console.log('  테이블 ' + tables + '개 · RLS 적용 ' + rls + '개 · schedules_in_range ' + fn + '개');

let warned = 0;
if (tables !== rls) {
  console.log('  경고: RLS 가 빠진 테이블이 있습니다 — 누구에게나 열려 있습니다.');
  warned++;
}
if (fn !== 1) {
  console.log('  경고: schedules_in_range 가 ' + fn + '개입니다 — 조회가 실패할 수 있습니다.');
  warned++;
}

/* ── 6. 다음 단계로 넘길 값 ────────────────────────────────────── */
writeFileSync(
  'deploy/.provisioned.json',
  JSON.stringify(
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://' + ref + '.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: pub,
      PROJECT_REF: ref,
      ...(dbPass ? { SUPABASE_DB_PASSWORD: dbPass } : {}),
    },
    null,
    2,
  ),
);
console.log('\n프로젝트 ' + mask(ref) + ' 준비 완료' + (warned ? ' (경고 ' + warned + '건)' : '') + '.');
console.log('값은 deploy/.provisioned.json 에 적었습니다 (gitignore 됨).');
