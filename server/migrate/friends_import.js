'use strict';

const fs = require('node:fs');
const path = require('node:path');

const inputPath = process.argv[2];
const baseUrl = String(process.env.SHROOM_API_URL || 'https://shroom.surfplus.xyz').replace(/\/$/, '');
const token = process.env.SHROOM_ACCESS_TOKEN;

if (!inputPath || !token) {
  console.error('Usage: SHROOM_ACCESS_TOKEN=... node migrate/friends_import.js /path/to/friends-asset.json');
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
const friends = Array.isArray(source) ? source : source.friends;
if (!Array.isArray(friends)) throw new Error('friends-asset.json does not contain a friends array');

async function run() {
  const response = await fetch(`${baseUrl}/api/friends/v1/import`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rfdiary-token': token
    },
    body: JSON.stringify({ friends })
  });
  const result = await response.json();
  if (!response.ok || result.code !== 200) throw new Error(result.message || `Import failed (${response.status})`);
  if (result.data.friends !== friends.length) {
    throw new Error(`Count mismatch: source=${friends.length}, imported=${result.data.friends}`);
  }
  console.log(JSON.stringify({ ok: true, source: friends.length, imported: result.data }));
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
