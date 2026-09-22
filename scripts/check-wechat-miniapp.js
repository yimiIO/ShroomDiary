'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'dist', 'build', 'mp-weixin');
const MAX_MAIN_PACKAGE_BYTES = 2 * 1024 * 1024;
const browserOnlyPattern = /\b(?:window|document|navigator)\.|\b(?:MediaRecorder|XMLHttpRequest|FormData|URLSearchParams)\b|createObjectURL/;
const unsupportedWxmlPattern = /\{\{[^}]*\)\.[A-Za-z_$]/;

function fail(message) {
	throw new Error(`[mp-weixin] ${message}`);
}

function readJson(relativePath) {
	const target = path.join(output, relativePath);
	if (!fs.existsSync(target)) fail(`缺少 ${relativePath}`);
	return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function walk(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
		const target = path.join(directory, entry.name);
		return entry.isDirectory() ? walk(target) : [target];
	});
}

function normalize(relativePath) {
	return relativePath.split(path.sep).join('/');
}

function ignored(relativePath, rules) {
	return rules.some(rule => {
		const value = String(rule.value || '').replace(/^\/+|\/+$/g, '');
		if (!value) return false;
		if (rule.type === 'folder') return relativePath === value || relativePath.startsWith(`${value}/`);
		return rule.type === 'file' && relativePath === value;
	});
}

if (!fs.existsSync(output)) fail('编译目录不存在，请先运行 npm run build:mp-weixin');

const app = readJson('app.json');
const project = readJson('project.config.json');
if (!/^wx[a-z0-9]{16}$/.test(project.appid || '')) fail('project.config.json 缺少正式微信小程序 AppID');
if (project.setting && project.setting.urlCheck !== true) fail('必须开启合法域名校验');

const pages = [
	...(app.pages || []),
	...(app.subPackages || []).flatMap(pack => (pack.pages || []).map(page => `${pack.root}/${page}`))
];
if (!pages.length) fail('app.json 没有页面');
pages.forEach(page => {
	['js', 'json', 'wxml', 'wxss'].forEach(extension => {
		const target = path.join(output, `${page}.${extension}`);
		if (!fs.existsSync(target)) fail(`页面产物不完整：${page}.${extension}`);
	});
});

const tabPages = (((app.tabBar || {}).list) || []).map(item => item.pagePath);
tabPages.forEach(page => {
	if (!app.pages.includes(page)) fail(`TabBar 页面必须留在主包：${page}`);
});

const browserLeaks = walk(output)
	.filter(file => file.endsWith('.js'))
	.filter(file => {
		const relativePath = normalize(path.relative(output, file));
		return relativePath === 'app.js'
			|| relativePath.startsWith('pages/')
			|| relativePath.startsWith('components/');
	})
	.filter(file => browserOnlyPattern.test(fs.readFileSync(file, 'utf8')))
	.map(file => normalize(path.relative(output, file)));
if (browserLeaks.length) fail(`小程序产物仍包含浏览器专用 API：${browserLeaks.join(', ')}`);

const invalidWxml = walk(output)
	.filter(file => file.endsWith('.wxml'))
	.filter(file => unsupportedWxmlPattern.test(fs.readFileSync(file, 'utf8')))
	.map(file => normalize(path.relative(output, file)));
if (invalidWxml.length) fail(`小程序产物包含微信 WXML 不支持的表达式：${invalidWxml.join(', ')}`);

const ignoreRules = ((project.packOptions || {}).ignore) || [];
const packedFiles = walk(output).filter(file => {
	const relativePath = normalize(path.relative(output, file));
	return !ignored(relativePath, ignoreRules);
});
const packageBytes = packedFiles.reduce((total, file) => total + fs.statSync(file).size, 0);
if (!(app.subPackages || []).length && packageBytes > MAX_MAIN_PACKAGE_BYTES) {
	fail(`主包 ${(packageBytes / 1024 / 1024).toFixed(3)} MiB，超过 2 MiB`);
}

console.log(JSON.stringify({
	platform: 'mp-weixin',
	appid: project.appid,
	pages: pages.length,
	mainPackageMiB: Number((packageBytes / 1024 / 1024).toFixed(3)),
	ignoredLegacyAssets: ignoreRules.length,
	browserApiLeaks: 0,
	invalidWxmlExpressions: 0,
	status: 'PASS'
}, null, 2));
