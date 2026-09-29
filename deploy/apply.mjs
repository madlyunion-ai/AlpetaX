/**
 * 마이그레이션 한 파일을 적용한다.
 *   node deploy/apply.mjs supabase/migrations/0007_member_profile.sql
 *
 * provision.mjs 는 전체를 처음부터 올릴 때 쓰고, 이쪽은 이미 돌아가는
 * 데이터베이스에 한 장을 얹을 때 쓴다. 트랜잭션으로 감싸는 것은 같다 —
 * 중간에 터져 반쯤 적용된 스키마가 남는 쪽이 가장 다루기 어렵다.
 */
import { readFileSync } from 'node:fs';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const file = process.argv[2];
if (!TOKEN || !file) {
  console.error('사용법: SUPABASE_ACCESS_TOKEN=... node deploy/apply.mjs <파일.sql>');
  process.exit(1);
}

const { PROJECT_REF: ref } = JSON.parse(readFileSync('deploy/.provisioned.json', 'utf8'));

export async function query(sql) {
  let last;
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await r.text();
      if (!r.ok) return { error: text.slice(0, 500) };
      return { rows: text ? JSON.parse(text) : [] };
    } catch (err) {
      last = err;
      if (i < 4) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw last;
}

const sql = readFileSync(file, 'utf8');
process.stdout.write(`${file} … `);

const res = await query(`begin;\n${sql}\ncommit;`);
if (res.error) {
  console.log('실패 — 되돌렸습니다');
  console.error(`\n${res.error}\n`);
  await query('rollback;').catch(() => {});
  process.exit(1);
}
console.log('적용');
