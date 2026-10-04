'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const jsDir = path.join(root, 'dist', 'build', 'h5', 'static', 'js');
const bundles = fs.existsSync(jsDir)
	? fs.readdirSync(jsDir).filter(name => /^pages-diary-edit\..+\.js$/.test(name))
	: [];

if (!bundles.length) {
	throw new Error(`Missing built diary editor bundle in ${jsDir}`);
}

const source = bundles.map(name => fs.readFileSync(path.join(jsDir, name), 'utf8')).join('\n');
const requiredSignals = [
	['durable IndexedDB draft', 'shroom-voice-drafts'],
	['private direct upload', 'direct-uploads'],
	['resumable fallback upload', '/voice/uploads'],
	['local recovery message', '录音已保存在本机']
];

const missing = requiredSignals.filter(([, signal]) => !source.includes(signal));
if (missing.length) {
	throw new Error(`Unsafe H5 diary build: missing ${missing.map(([label]) => label).join(', ')}`);
}

process.stdout.write(`Verified H5 voice safety in ${bundles.join(', ')}\n`);
