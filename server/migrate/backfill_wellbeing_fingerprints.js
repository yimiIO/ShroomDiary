'use strict';

const db = require('../src/db');
const { wellbeingSourceFingerprint } = require('../src/wellbeing-review');

async function main() {
  const result = await db.query(
    `SELECT w.id, d.content
       FROM wellbeing_records w
       JOIN diaries d ON d.id = w.diary_id AND d.user_id = w.user_id
      WHERE w.source_fingerprint = ''`
  );
  let updated = 0;
  await db.transaction(async client => {
    for (const row of result.rows) {
      const fingerprint = wellbeingSourceFingerprint(row.content);
      if (!fingerprint) continue;
      const change = await client.query(
        `UPDATE wellbeing_records SET source_fingerprint = $2, updated_at = updated_at
          WHERE id = $1 AND source_fingerprint = ''`,
        [row.id, fingerprint]
      );
      updated += change.rowCount;
    }
  });
  console.log(JSON.stringify({ ok: true, scanned: result.rowCount, updated }));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.close());
