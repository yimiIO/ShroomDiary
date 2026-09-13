'use strict';

const db = require('../src/db');
const config = require('../src/config');
const { refreshWellbeingHypotheses } = require('../src/wellbeing-hypotheses');

function option(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : '';
}

async function main() {
  const mobile = option('mobile') || String(process.env.SHROOM_BACKFILL_MOBILE || '').trim();
  if (!/^1[3-9]\d{9}$/u.test(mobile)) throw new Error('请通过 --mobile=手机号指定唯一账号');
  const userResult = await db.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
  if (userResult.rowCount !== 1) throw new Error('没有找到唯一的 Shroom 用户');
  const result = await refreshWellbeingHypotheses(userResult.rows[0].id, config.aiModel);
  console.log(JSON.stringify({
    ok: true,
    sourceCount: result.sourceCount,
    hypothesisCount: result.hypotheses.length,
    stored: result.stored,
    hypotheses: result.hypotheses.map(item => ({
      name: item.name,
      domain: item.domain,
      kind: item.kind,
      evidenceStrength: item.evidenceStrength,
      evidenceCount: item.supportingEvidence.length
    }))
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.close());
