'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const config = require('../src/config');

const baseline = process.argv.includes('--baseline');
const sqlDirectory = path.resolve(__dirname, '..', 'sql');

function checksum(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

async function main() {
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('shroom-schema-migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS shroom_schema_migrations (
        filename text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        baseline boolean NOT NULL DEFAULT false
      )
    `);

    const files = fs.readdirSync(sqlDirectory)
      .filter(name => /^\d+_.+\.sql$/u.test(name))
      .sort((left, right) => left.localeCompare(right, 'en'));

    for (const filename of files) {
      const contents = fs.readFileSync(path.join(sqlDirectory, filename), 'utf8');
      const digest = checksum(contents);
      const existing = await client.query(
        'SELECT checksum FROM shroom_schema_migrations WHERE filename = $1',
        [filename]
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum.trim() !== digest) {
          throw new Error(`Migration checksum changed after application: ${filename}`);
        }
        continue;
      }

      if (!baseline) await client.query(contents);
      await client.query(
        `INSERT INTO shroom_schema_migrations (filename, checksum, baseline)
         VALUES ($1, $2, $3)`,
        [filename, digest, baseline]
      );
      process.stdout.write(`${baseline ? 'baselined' : 'applied'} ${filename}\n`);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('shroom-schema-migrations'))").catch(() => {});
    await client.end();
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
