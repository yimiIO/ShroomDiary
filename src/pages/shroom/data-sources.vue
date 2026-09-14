<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell">
			<view class="header">
				<view class="back" @tap="goBack">‹</view>
				<view><text class="kicker">MY DATA SOURCES</text><text class="title">数据与连接</text><text class="subtitle">让你没写进日记的真实活动，也能成为可查看、可撤回的记忆线索。</text></view>
			</view>

			<view class="boundary">
				<text>你始终掌控连接</text>
				<text>数据源是菇日记的用户级能力，不属于 AI 复利。AI 只有在你允许并主动发起日记分析时，才可能读取当天线索。</text>
			</view>

			<view class="source-card">
				<view class="source-head">
					<view class="source-mark">C</view>
					<view class="source-copy"><text class="source-kicker">CODEX</text><text class="source-name">菇日记 · Codex 数据源</text><text class="source-note">同步已完成的 Codex 任务事实，不同步对话、回答、工具调用或文件内容。</text></view>
					<text class="status" :class="connectionStatusClass">{{ connectionStatusLabel }}</text>
				</view>

				<view v-if="!connection" class="empty-connect">
					<text>连接后，本机会定期把最小任务摘要发给菇日记。</text>
					<button :disabled="creating" @tap="createConnection">{{ creating ? '正在生成…' : '连接这台电脑的 Codex' }}</button>
				</view>

				<view v-else class="connection-body">
					<view class="facts">
						<view><text>{{ connection.eventCount || 0 }}</text><text>已同步任务</text></view>
						<view><text>{{ lastSyncLabel }}</text><text>最近同步</text></view>
					</view>
					<view v-if="connection.status === 'PENDING' && !pairing" class="pending-missing"><text>上次配对码已不可再显示。</text><button @tap="createConnection">重新生成配对码</button></view>

					<view class="pairing" v-if="pairing">
						<text class="pairing-label">10 分钟内有效的配对码</text>
						<view class="code-row"><text>{{ pairing.pairingCode }}</text><button :class="{ copied: copiedTarget === 'code' }" @tap="copy(pairing.pairingCode, 'code')">{{ copiedTarget === 'code' ? '已复制' : '复制' }}</button></view>
						<text class="pairing-help">在这台电脑的 Codex 终端运行一次下面的连接命令。</text>
						<view class="command-row"><text>{{ pairing.command }}</text><button :class="{ copied: copiedTarget === 'command' }" @tap="copy(pairing.command, 'command')">{{ copiedTarget === 'command' ? '已复制' : '复制命令' }}</button></view>
					</view>

					<view class="settings" v-if="connection.status === 'ACTIVE' || connection.status === 'PAUSED'">
						<view class="setting-row"><view><text>显示在日记时间线</text><text>作为“来自数据源”的独立记录</text></view><switch color="#5d725f" :checked="connection.includeInDiary" @change="setDiaryVisibility" /></view>
						<view class="setting-row"><view><text>允许用于 AI 日记分析</text><text>只在你主动分析当天日记时读取</text></view><switch color="#5d725f" :checked="connection.aiAllowed" @change="setAiAccess" /></view>
						<view class="interval-setting"><view><text>同步频率</text><text>下次本机同步任务应使用这个频率</text></view><view class="intervals"><button v-for="item in intervals" :key="item.value" :class="{ active: connection.syncIntervalHours === item.value }" @tap="setInterval(item.value)">{{ item.label }}</button></view></view>
					</view>

					<view class="actions">
						<button v-if="connection.status === 'ACTIVE'" @tap="setStatus('PAUSED')">暂停同步</button>
						<button v-if="connection.status === 'PAUSED'" class="resume" @tap="setStatus('ACTIVE')">继续同步</button>
						<button v-if="connection.status === 'DISCONNECTED'" class="resume" @tap="createConnection">重新连接 Codex</button>
						<button v-if="connection.status !== 'DISCONNECTED'" class="disconnect" @tap="disconnect(false)">断开连接</button>
						<button v-if="connection.eventCount" class="purge" @tap="disconnect(true)">断开并删除已同步记录</button>
					</view>
				</view>
			</view>

			<view class="meaning-card">
				<text>数据如何进入菇</text>
				<view><text>01</text><text>Codex 本机连接器读取任务状态</text></view>
				<view><text>02</text><text>菇保存外部活动事实，与你亲笔日记分开</text></view>
				<view><text>03</text><text>日记时间线、AI 分析或复盘可在各自权限下读取</text></view>
				<text class="footnote">任务运行时间 ≠ 你的人工专注时间。没有 Codex 记录也不代表你没有做事。</text>
			</view>
		</view>
	</view>
</template>

<script>
import { createCodexConnection, dataSourceConnections } from '@/api/data-sources';

export default {
	data() {
		return {
			statusBarHeight: 0,
			connections: [],
			pairing: null,
			creating: false,
			pollTimer: null,
			copyTimer: null,
			copiedTarget: null,
			intervals: [{ value: 24, label: '每天' }, { value: 72, label: '每 3 天' }, { value: 168, label: '每周' }]
		};
	},
	computed: {
		connection() { return this.connections.find(item => item.provider === 'CODEX') || null; },
		connectionStatusLabel() { return { PENDING: '待配对', ACTIVE: '已连接', PAUSED: '已暂停', DISCONNECTED: '已断开' }[this.connection && this.connection.status] || '未连接'; },
		connectionStatusClass() { return (this.connection && this.connection.status || 'OFF').toLowerCase(); },
		lastSyncLabel() {
			if (!this.connection || !this.connection.lastSyncAt) return '尚未';
			return new Date(this.connection.lastSyncAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
		}
	},
	onLoad() { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; },
	onShow() { this.load(); },
	onHide() { this.stopPolling(); },
	onUnload() { this.stopPolling(); },
	methods: {
		goBack() { uni.navigateBack(); },
		async load() {
			try {
				const response = await this.$http.get(dataSourceConnections);
				this.connections = Array.isArray(response.data) ? response.data : [];
				if (this.connection && this.connection.status === 'PENDING' && this.pairing) this.startPolling();
				else { this.stopPolling(); if (this.connection && this.connection.status === 'ACTIVE') this.pairing = null; }
			} catch (error) { console.error('加载数据源失败', error); }
		},
		startPolling() { this.stopPolling(); this.pollTimer = setTimeout(() => this.load(), 2500); },
		stopPolling() { if (this.pollTimer) clearTimeout(this.pollTimer); this.pollTimer = null; },
		markCopied(target) {
			this.copiedTarget = target;
			if (this.copyTimer) clearTimeout(this.copyTimer);
			this.copyTimer = setTimeout(() => { this.copiedTarget = null; this.copyTimer = null; }, 2200);
		},
		copySucceeded(target) {
			this.markCopied(target);
			uni.showToast({ title: '已复制', icon: 'none' });
		},
		copyFailed() {
			uni.showModal({
				title: '复制失败',
				content: '请长按上方的配对码或命令，选择后手动复制。',
				showCancel: false
			});
		},
		copyWithBrowserFallback(text, target) {
			let textarea = null;
			try {
				textarea = document.createElement('textarea');
				textarea.value = text;
				textarea.setAttribute('readonly', '');
				textarea.style.position = 'fixed';
				textarea.style.left = '-9999px';
				textarea.style.top = '0';
				textarea.style.opacity = '0';
				textarea.style.fontSize = '16px';
				document.body.appendChild(textarea);
				textarea.focus();
				textarea.select();
				textarea.setSelectionRange(0, text.length);
				if (!document.execCommand('copy')) throw new Error('copy command rejected');
				this.copySucceeded(target);
			} catch (error) {
				this.copyFailed();
			} finally {
				if (textarea && textarea.parentNode) textarea.parentNode.removeChild(textarea);
			}
		},
		async createConnection() {
			if (this.creating) return;
			this.creating = true;
			try {
				const response = await this.$http.post(createCodexConnection, { syncIntervalHours: 72, includeInDiary: true, aiAllowed: true });
				this.pairing = response.data;
				this.connections = [response.data.connection];
				this.startPolling();
			} catch (error) { console.error('创建 Codex 连接失败', error); }
			finally { this.creating = false; }
		},
		copy(value, target) {
			const text = String(value || '');
			if (!text) { this.copyFailed(); return; }
			// #ifdef H5
			const clipboard = window.navigator && window.navigator.clipboard;
			if (clipboard && typeof clipboard.writeText === 'function') {
				clipboard.writeText(text)
					.then(() => this.copySucceeded(target))
					.catch(() => this.copyWithBrowserFallback(text, target));
				return;
			}
			this.copyWithBrowserFallback(text, target);
			return;
			// #endif
			uni.setClipboardData({
				data: text,
				success: () => this.copySucceeded(target),
				fail: () => this.copyFailed()
			});
		},
		async update(patch) {
			if (!this.connection) return;
			try {
				const response = await this.$http.patch(`${dataSourceConnections}/${this.connection.id}`, patch);
				this.connections = [response.data];
			} catch (error) { console.error('更新数据源失败', error); }
		},
		setDiaryVisibility(event) { this.update({ includeInDiary: Boolean(event.detail.value) }); },
		setAiAccess(event) { this.update({ aiAllowed: Boolean(event.detail.value) }); },
		setInterval(value) { this.update({ syncIntervalHours: value }); },
		setStatus(status) { this.update({ status }); },
		disconnect(purge) {
			uni.showModal({
				title: purge ? '删除 Codex 记录？' : '断开 Codex？',
				content: purge ? '连接、已同步任务和使用它们的旧 AI 分析将被删除或失效，不可撤销。' : '同步将停止，已同步的历史记录会保留。',
				confirmText: purge ? '删除' : '断开',
				confirmColor: '#9b4e46',
				success: async result => {
					if (!result.confirm || !this.connection) return;
					try {
						await this.$http.delete(`${dataSourceConnections}/${this.connection.id}`, {}, { params: { purge } });
						this.connections = [];
						this.pairing = null;
						uni.showToast({ title: purge ? '记录已删除' : '已断开', icon: 'success' });
					} catch (error) { console.error('断开数据源失败', error); }
				}
			});
		}
	}
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.shell { box-sizing: border-box; padding: 34rpx 34rpx 100rpx; }
.header { display: flex; align-items: flex-start; gap: 23rpx; }
.back { display: flex; width: 58rpx; height: 58rpx; flex: 0 0 58rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.72); font-size: 42rpx; }
.header > view:last-child, .source-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.kicker, .source-kicker { color: #728074; font-size: 16rpx; font-weight: 750; letter-spacing: 3rpx; }
.title { margin-top: 9rpx; font-family: Georgia, 'Songti SC', serif; font-size: 47rpx; font-weight: 690; }
.subtitle { margin-top: 13rpx; color: #6d796f; font-size: 21rpx; line-height: 1.7; }
.boundary { display: flex; margin-top: 35rpx; padding: 28rpx; flex-direction: column; gap: 10rpx; border-radius: 24rpx; background: #e4ebd2; }
.boundary text:first-child { font-size: 24rpx; font-weight: 700; }
.boundary text:last-child { color: #66705f; font-size: 20rpx; line-height: 1.7; }
.source-card, .meaning-card { margin-top: 25rpx; padding: 30rpx; border: 1rpx solid rgba(23,32,25,.07); border-radius: 30rpx; background: #fff; box-shadow: 0 18rpx 50rpx rgba(58,80,60,.06); }
.source-head { display: flex; align-items: flex-start; gap: 18rpx; }
.source-mark { display: flex; width: 61rpx; height: 61rpx; flex: 0 0 61rpx; align-items: center; justify-content: center; border-radius: 19rpx; background: #18211a; color: #eff5e8; font-family: Georgia, serif; font-size: 28rpx; }
.source-name { margin-top: 4rpx; font-size: 26rpx; font-weight: 710; }
.source-note { margin-top: 9rpx; color: #727e74; font-size: 19rpx; line-height: 1.6; }
.status { flex: 0 0 auto; padding: 8rpx 12rpx; border-radius: 999rpx; background: #edf0eb; color: #758078; font-size: 16rpx; }
.status.active { background: #dfead1; color: #4f664e; }
.status.paused, .status.pending { background: #f1ead1; color: #76683f; }
.empty-connect { display: flex; margin-top: 28rpx; padding-top: 24rpx; flex-direction: column; gap: 20rpx; border-top: 1rpx solid #edf0eb; }
.empty-connect > text { color: #657169; font-size: 20rpx; line-height: 1.6; }
.empty-connect button, .resume { border: 0; border-radius: 999rpx; background: #172019; color: #fff; font-size: 21rpx; }
.facts { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12rpx; margin-top: 27rpx; }
.facts view { display: flex; padding: 20rpx; flex-direction: column; gap: 5rpx; border-radius: 20rpx; background: #f5f7f2; }
.facts text:first-child { font-size: 24rpx; font-weight: 700; }
.facts text:last-child { color: #7b857d; font-size: 17rpx; }
.pairing { display: flex; margin-top: 22rpx; padding: 23rpx; flex-direction: column; gap: 14rpx; border-radius: 20rpx; background: #172019; color: #eef4e8; }
.pending-missing { display: flex; margin-top: 22rpx; align-items: center; justify-content: space-between; gap: 15rpx; }
.pending-missing text { color: #78837b; font-size: 18rpx; }
.pending-missing button { margin: 0; border: 1rpx solid #dfe5dc; border-radius: 999rpx; background: #fff; font-size: 18rpx; }
.pairing-label { color: #aebbad; font-size: 17rpx; }
.code-row, .command-row { display: flex; align-items: center; justify-content: space-between; gap: 14rpx; }
.code-row > text { font-family: monospace; font-size: 32rpx; font-weight: 750; letter-spacing: 4rpx; }
.pairing-help { color: #aebbad; font-size: 17rpx; line-height: 1.6; }
.command-row > text { overflow: hidden; flex: 1; color: #dbe5d7; font-family: monospace; font-size: 16rpx; line-height: 1.5; word-break: break-all; }
.code-row > text, .command-row > text { -webkit-user-select: text; user-select: text; }
.pairing button { flex: 0 0 auto; margin: 0; border: 0; border-radius: 999rpx; background: rgba(255,255,255,.12); color: #fff; font-size: 17rpx; }
.pairing button.copied { background: #dce9cf; color: #314234; }
.settings { margin-top: 23rpx; border-top: 1rpx solid #edf0eb; }
.setting-row, .interval-setting { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; padding: 23rpx 0; border-bottom: 1rpx solid #edf0eb; }
.setting-row > view, .interval-setting > view:first-child { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5rpx; }
.setting-row > view text:first-child, .interval-setting > view:first-child text:first-child { font-size: 21rpx; font-weight: 670; }
.setting-row > view text:last-child, .interval-setting > view:first-child text:last-child { color: #7a857d; font-size: 17rpx; line-height: 1.5; }
.interval-setting { align-items: flex-start; flex-direction: column; }
.intervals { display: flex; gap: 10rpx; }
.intervals button { margin: 0; padding: 0 22rpx; border: 1rpx solid #dfe5dc; border-radius: 999rpx; background: #fff; color: #667068; font-size: 18rpx; line-height: 58rpx; }
.intervals button::after, .actions button::after, .empty-connect button::after { border: 0; }
.intervals button.active { border-color: #617663; background: #e6efdc; color: #435646; }
.actions { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 24rpx; }
.actions button { margin: 0; border: 1rpx solid #dde4dc; border-radius: 999rpx; background: #fff; color: #5d685f; font-size: 18rpx; }
.actions .purge { border-color: rgba(155,78,70,.2); color: #9b4e46; }
.meaning-card { display: flex; flex-direction: column; gap: 17rpx; background: #f8f5e9; }
.meaning-card > text:first-child { font-family: Georgia, 'Songti SC', serif; font-size: 27rpx; font-weight: 680; }
.meaning-card > view { display: flex; align-items: flex-start; gap: 15rpx; }
.meaning-card > view text:first-child { color: #7b876f; font-size: 16rpx; font-weight: 750; letter-spacing: 1rpx; }
.meaning-card > view text:last-child { color: #596158; font-size: 20rpx; line-height: 1.55; }
.footnote { margin-top: 8rpx; padding-top: 17rpx; border-top: 1rpx solid rgba(23,32,25,.08); color: #7b7765; font-size: 18rpx; line-height: 1.65; }
/* #ifdef H5 */
@media (min-width: 920px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 820px; margin: 0 auto; padding: 64px 40px 110px; } }
/* #endif */
</style>
