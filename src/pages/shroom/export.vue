<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell">
			<view class="header"><view class="back" @tap="goBack">‹</view><view><text class="kicker">DATA OWNERSHIP</text><text class="title">带走我的数据</text></view></view>
			<view class="statement"><text class="statement-index">YOUR DATA</text><text class="statement-title">你的记忆，不该被困在一个产品里。</text><text class="statement-copy">导出内容包括日记、人脉、互动、评分、承诺、菇卡、待办、人生 OS 和月度复盘；不包含密码或登录会话。</text></view>
			<view class="option" :class="{ active: mode === 'full' }" @tap="mode = 'full'"><view class="radio"><view></view></view><view><text>完整私密备份</text><text>保留姓名、联系方式和全部原始记录，只适合自己保存。</text></view></view>
			<view class="option" :class="{ active: mode === 'redacted' }" @tap="mode = 'redacted'"><view class="radio"><view></view></view><view><text>脱敏副本</text><text>移除账号、联系方式和媒体，将已知人物姓名替换为序号。</text></view></view>
			<view class="export-button" :class="{ disabled: exporting }" @tap="exportData">{{ exporting ? '正在整理…' : '生成 JSON 导出文件' }}</view>
			<text class="notice">导出在当前设备完成。请妥善保管完整备份，避免转发到公开聊天或网盘共享链接。</text>
			<view class="result" v-if="summary"><text>最近一次导出</text><text>{{ summary }}</text></view>
		</view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { dataExport } from '@/api/shroom-system';

export default {
	data() { return { statusBarHeight: 0, mode: 'full', exporting: false, summary: '' }; },
	onLoad() { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; },
	methods: {
		async exportData() {
			if (this.exporting) return;
			this.exporting = true;
			try {
				const res = await this.$http.get(dataExport, { redacted: this.mode === 'redacted' ? 'true' : 'false' });
				const json = JSON.stringify(res.data, null, 2);
				const filename = `shroom-${this.mode}-${moment().format('YYYYMMDD-HHmm')}.json`;
				// #ifdef H5
				const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
				const url = URL.createObjectURL(blob);
				const anchor = document.createElement('a');
				anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
				// #endif
				// #ifndef H5
				uni.setClipboardData({ data: json, success: () => uni.showToast({ title: '数据已复制', icon: 'success' }) });
				// #endif
				this.summary = `${moment().format('YYYY.MM.DD HH:mm')} · ${this.mode === 'redacted' ? '脱敏副本' : '完整备份'} · ${Math.ceil(json.length / 1024)} KB`;
			} catch (error) { console.error('导出数据失败', error); }
			finally { this.exporting = false; }
		},
		goBack() { const pages = getCurrentPages(); if (pages.length > 1) uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/me' }) }); else uni.switchTab({ url: '/pages/shroom/me' }); }
	}
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: #f1f8e9; }
.shell { box-sizing: border-box; padding: 32rpx 34rpx 120rpx; }
.header { display: flex; align-items: center; gap: 20rpx; }
.back { display: flex; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.7); font-size: 50rpx; }
.header > view:last-child { display: flex; flex-direction: column; gap: 8rpx; }
.kicker { font-size: 16rpx; font-weight: 700; letter-spacing: 2.3rpx; color: #718075; }
.title { font-size: 40rpx; font-weight: 740; }
.statement { margin-top: 43rpx; padding: 39rpx 35rpx; border-radius: 35rpx; background: #172019; color: #fff; }
.statement-index, .statement-title, .statement-copy { display: block; }
.statement-index { font-size: 15rpx; font-weight: 700; letter-spacing: 2.7rpx; color: #9dad9e; }
.statement-title { margin-top: 22rpx; font-size: 31rpx; font-weight: 700; line-height: 1.45; }
.statement-copy { margin-top: 18rpx; font-size: 20rpx; line-height: 1.7; color: #b7c4b7; }
.option { display: flex; gap: 19rpx; margin-top: 18rpx; padding: 29rpx; border: 2rpx solid transparent; border-radius: 29rpx; background: #fff; }
.option.active { border-color: #708a72; background: #f9fcf7; }
.radio { display: flex; width: 28rpx; height: 28rpx; flex: 0 0 28rpx; align-items: center; justify-content: center; border: 2rpx solid #8b988d; border-radius: 50%; }
.option.active .radio view { width: 16rpx; height: 16rpx; border-radius: 50%; background: #59725e; }
.option > view:last-child { display: flex; flex-direction: column; gap: 9rpx; }
.option > view:last-child text:first-child { font-size: 24rpx; font-weight: 690; }
.option > view:last-child text:last-child { font-size: 19rpx; line-height: 1.6; color: #748078; }
.export-button { margin-top: 31rpx; padding: 27rpx; border-radius: 999rpx; background: #172019; text-align: center; font-size: 23rpx; font-weight: 690; color: #fff; }
.export-button.disabled { opacity: .55; }
.notice { display: block; margin-top: 21rpx; padding: 0 16rpx; text-align: center; font-size: 18rpx; line-height: 1.65; color: #748078; }
.result { display: flex; margin-top: 27rpx; padding: 25rpx 29rpx; flex-direction: column; gap: 9rpx; border-radius: 25rpx; background: #dfead7; }
.result text:first-child { font-size: 17rpx; font-weight: 700; letter-spacing: 1.5rpx; color: #617064; }
.result text:last-child { font-size: 20rpx; color: #35463a; }
/* #ifdef H5 */
@media (min-width: 850px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 760px; margin: 0 auto; padding: 64px 44px 100px; } }
/* #endif */
</style>
