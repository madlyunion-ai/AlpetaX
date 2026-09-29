/**
 * Supabase 마이그레이션 실행기.
 *
 * 대시보드 SQL 편집기에 네 파일을 손으로 붙여넣는 대신 순서대로 적용한다.
 *
 * 파일 하나를 트랜잭션 하나로 감싸는 것이 이 스크립트의 핵심이다 —
 * 0001 은 테이블 열두 개를 만드는데, 중간에서 터지면 절반만 생긴 스키마가
 * 남는다. 그 상태는 다시 돌리기도 어렵고 원인을 찾기도 어렵다.
 *
 * 자격증명은 환경변수로만 받는다. 인자로 받으면 프로세스 목록에 노출된다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const DIR = 'supabase/migrations';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL 이 없습니다. deploy/credentials.sh 를 source 하세요.');
  process.exit(1);
}

/** 로그에 비밀번호가 새지 않도록 호스트만 보여 준다. */
function safeTarget(conn) {
  try {
    const u = new URL(conn);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return '(연결 문자열 형식을 읽을 수 없음)';
  }
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort(); // 0001 → 0004. 이름 순서가 곧 적용 순서다.

console.log(`대상  ${safeTarget(url)}`);
console.log(`파일  ${files.join(', ')}\n`);

// Supabase 는 TLS 를 요구하지만 체인은 자체 CA 다 — 검증을 끄지 않으면 연결이 끊긴다.
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
} catch (err) {
  console.error(`연결 실패: ${err.message}`);
  console.error('\n비밀번호에 @ : / 같은 문자가 있으면 퍼센트 인코딩해야 합니다.');
  process.exit(1);
}

let applied = 0;
for (const f of files) {
  const sql = readFileSync(join(DIR, f), 'utf8');
  process.stdout.write(`  ${f} … `);
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('적용');
    applied++;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.log('실패 — 되돌렸습니다');
    console.error(`\n  ${err.message}`);
    if (err.position) {
      // 실패 지점의 줄을 짚어 준다. 위치 숫자만으로는 어디인지 알 수 없다.
      const upto = sql.slice(0, Number(err.position));
      const line = upto.split('\n').length;
      console.error(`  ${f}:${line} 부근`);
    }
    console.error(`\n${applied}개 파일까지 적용된 상태입니다. 원인을 고친 뒤 다시 실행하세요.`);
    await client.end();
    process.exit(1);
  }
}

/* 적용 결과를 직접 확인한다 — "오류 없음" 과 "실제로 만들어짐" 은 다르다. */
const { rows: tables } = await client.query(
  `select count(*)::int n from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'`,
);
const { rows: rls } = await client.query(
  `select count(*)::int n from pg_tables
   where schemaname = 'public' and rowsecurity = true`,
);
const { rows: fn } = await client.query(
  `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'schedules_in_range'`,
);

console.log(`\n테이블 ${tables[0].n}개 · RLS 적용 ${rls[0].n}개 · schedules_in_range ${fn[0].n}개`);
if (fn[0].n !== 1) {
  console.log('경고: schedules_in_range 가 1개가 아닙니다. 오버로드가 남으면 조회가 실패할 수 있습니다.');
}
if (tables[0].n !== rls[0].n) {
  console.log('경고: RLS 가 빠진 테이블이 있습니다. 그 테이블은 누구에게나 열려 있습니다.');
}

await client.end();
console.log('\n마이그레이션 완료.');
