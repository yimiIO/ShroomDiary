'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'src', 'project.config.json');
const outputPath = path.join(root, 'dist', 'build', 'mp-weixin', 'project.config.json');
const privateOutputPath = path.join(root, 'dist', 'build', 'mp-weixin', 'project.private.config.json');

if (!fs.existsSync(outputPath)) {
	throw new Error('[mp-weixin] 编译产物不存在，无法生成微信开发者工具工程配置');
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const generated = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
const project = {
	...generated,
	...source,
	setting: { ...(generated.setting || {}), ...(source.setting || {}) },
	packOptions: { ...(generated.packOptions || {}), ...(source.packOptions || {}) }
};

fs.writeFileSync(outputPath, `${JSON.stringify(project, null, 2)}\n`);
fs.writeFileSync(privateOutputPath, `${JSON.stringify({
	description: 'Shroom 本地微信开发者工具设置；不参与正式上传配置',
	setting: { urlCheck: false }
}, null, 2)}\n`);
console.log(`[mp-weixin] 微信开发者工具工程已准备：${outputPath}`);
