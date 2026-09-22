<template>
	<view class="page">
		<shroom-page-top-spacer />
		<view class="shell">
			<view class="header">
				<view class="back" @tap="goBack">‹</view>
				<view class="header-copy"><text class="kicker">CONNECTIONS</text><text class="title">数据与连接</text><text class="subtitle">选择要连接到菇日记的数据源，并分别管理它们的权限。</text></view>
			</view>

			<view class="boundary">
				<text>连接由你控制</text>
				<text>每个数据源独立授权、暂停或断开。外部活动与你亲笔写下的日记始终分开保存。</text>
			</view>

			<view class="section">
				<text class="section-label">可用连接</text>
				<view class="source-row" data-testid="connection-codex" @tap="openCodex">
					<view class="source-mark">C</view>
					<view class="source-copy"><text>Codex</text><text>同步最小任务事实，不同步对话或文件内容</text></view>
					<view class="source-state"><text :class="connectionStatusClass">{{ connectionStatusLabel }}</text><text class="arrow">›</text></view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import { dataSourceConnections } from '@/api/data-sources';

export default {
	data() { return { statusBarHeight: 0, connections: [] }; },
	computed: {
		connection() { return this.connections.find(item => item.provider === 'CODEX') || null; },
		connectionStatusLabel() { return { PENDING: '待配对', ACTIVE: '已连接', PAUSED: '已暂停', DISCONNECTED: '已断开' }[this.connection && this.connection.status] || '未连接'; },
		connectionStatusClass() { return (this.connection && this.connection.status || 'OFF').toLowerCase(); }
	},
	onLoad() { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; },
	onShow() { this.load(); },
	methods: {
		goBack() { uni.navigateBack(); },
		openCodex() { uni.navigateTo({ url: '/pages/shroom/data-sources/codex' }); },
		async load() {
			try {
				const response = await this.$http.get(dataSourceConnections);
				this.connections = Array.isArray(response.data) ? response.data : [];
			} catch (error) { console.error('加载数据源失败', error); }
		}
	}
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.shell { box-sizing: border-box; padding: 34rpx 34rpx 100rpx; }
.header { display: flex; align-items: flex-start; gap: 23rpx; }
.back { display: flex; width: 58rpx; height: 58rpx; flex: 0 0 58rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.72); font-size: 42rpx; }
.header-copy, .source-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.kicker, .section-label { color: #728074; font-size: 16rpx; font-weight: 750; letter-spacing: 3rpx; }
.title { margin-top: 9rpx; font-family: Georgia, 'Songti SC', serif; font-size: 47rpx; font-weight: 690; }
.subtitle { margin-top: 13rpx; color: #6d796f; font-size: 21rpx; line-height: 1.7; }
.boundary { display: flex; margin-top: 35rpx; padding: 28rpx; flex-direction: column; gap: 10rpx; border-radius: 24rpx; background: #e4ebd2; }
.boundary text:first-child { font-size: 24rpx; font-weight: 700; }
.boundary text:last-child { color: #66705f; font-size: 20rpx; line-height: 1.7; }
.section { margin-top: 32rpx; }
.section-label { display: block; margin: 0 8rpx 13rpx; }
.source-row { display: flex; align-items: center; gap: 18rpx; padding: 28rpx; border: 1rpx solid rgba(23,32,25,.07); border-radius: 26rpx; background: #fff; box-shadow: 0 18rpx 50rpx rgba(58,80,60,.06); }
.source-mark { display: flex; width: 61rpx; height: 61rpx; flex: 0 0 61rpx; align-items: center; justify-content: center; border-radius: 19rpx; background: #18211a; color: #eff5e8; font-family: Georgia, serif; font-size: 28rpx; }
.source-copy text:first-child { font-size: 25rpx; font-weight: 710; }
.source-copy text:last-child { margin-top: 7rpx; color: #727e74; font-size: 18rpx; line-height: 1.5; }
.source-state { display: flex; flex: 0 0 auto; align-items: center; gap: 12rpx; }
.source-state > text:first-child { padding: 7rpx 11rpx; border-radius: 999rpx; background: #edf0eb; color: #758078; font-size: 16rpx; }
.source-state > text.active { background: #dfead1; color: #4f664e; }
.source-state > text.paused, .source-state > text.pending { background: #f1ead1; color: #76683f; }
.arrow { color: #89938b; font-size: 34rpx; }
/* #ifdef H5 */
@media (min-width: 920px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 820px; margin: 0 auto; padding: 64px 40px 110px; } }
/* #endif */
</style>
