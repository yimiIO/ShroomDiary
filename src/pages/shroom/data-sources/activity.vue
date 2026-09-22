<template>
	<view class="activity-page">
		<shroom-page-top-spacer />
		<view class="navbar"><button @tap="goBack">‹</button><text>数据源详情</text><view></view></view>
		<scroll-view v-if="activity" class="content" scroll-y>
			<view class="hero">
				<view class="source-mark">{{ sourceIcon }}</view>
				<view><text class="source-name">{{ activity.sourceName }}</text><text class="title">{{ activity.title }}</text></view>
			</view>
			<view class="facts">
				<view><text>状态</text><text>{{ outcomeLabel(activity.outcomeStatus) }}</text></view>
				<view><text>项目</text><text>{{ activity.projectName || '未记录' }}</text></view>
				<view><text>最后记录</text><text>{{ formatTime(activity.completedAt) }}</text></view>
				<view><text>对话轮次</text><text>{{ activity.turnCount || turns.length }}</text></view>
				<view v-if="activity.taskRuntimeMinutes !== null"><text>工具运行</text><text>{{ activity.taskRuntimeMinutes }} 分钟</text></view>
			</view>
			<view class="meaning">
				<text>这条记录证明什么</text>
				<text>它只表示 Codex 中发生过这项任务活动，不等于你完成了现实结果，也不把运行时长当作人的专注时长。</text>
			</view>
			<view class="turns" v-if="turns.length">
				<text class="section-title">同一任务的轮次</text>
				<view v-for="turn in turns" :key="turn.id">
					<text>#{{ turn.index }}</text><text>{{ outcomeLabel(turn.outcomeStatus) }}</text><text>{{ formatTime(turn.completedAt) }}</text>
				</view>
			</view>
			<view class="bottom-space"></view>
		</scroll-view>
		<view v-else-if="loading" class="state">正在读取这条记录…</view>
		<view v-else class="state">这条记录暂时无法读取</view>
	</view>
</template>

<script>
import { dataSourceActivityDetail } from '@/api/data-sources';

export default {
	data() { return { activityId: '', activity: null, turns: [], loading: true }; },
	computed: {
		sourceIcon() { return this.activity && this.activity.source === 'CODEX' ? 'C' : '◇'; }
	},
	onLoad(options) { this.activityId = options.id || ''; this.load(); },
	methods: {
		async load() {
			if (!this.activityId) { this.loading = false; return; }
			try {
				const res = await this.$http.get(dataSourceActivityDetail(this.activityId));
				if (res.code !== 200) throw new Error(res.message);
				this.activity = res.data.activity;
				this.turns = res.data.turns || [];
			} catch (error) {
				uni.showToast({ title: error.message || '记录加载失败', icon: 'none' });
			} finally { this.loading = false; }
		},
		outcomeLabel(value) { return { COMPLETED: '已结束', INTERRUPTED: '已中断', FAILED: '失败' }[value] || '已记录'; },
		formatTime(value) {
			if (!value) return '未记录';
			const date = new Date(value);
			return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
		},
		goBack() { uni.navigateBack(); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; border: 0; background: transparent; line-height: 1; } button::after { border: 0; }
.activity-page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.navbar { display: flex; align-items: center; padding: 18rpx 30rpx 22rpx; }
.navbar button, .navbar view { width: 70rpx; color: #59655c; font-size: 38rpx; }
.navbar > text { flex: 1; text-align: center; font: 700 29rpx/1.2 Georgia, 'Songti SC', serif; }
.content { height: calc(100vh - 110rpx - env(safe-area-inset-top)); }
.hero { display: flex; gap: 20rpx; margin: 12rpx 30rpx; padding: 30rpx; border-radius: 28rpx; background: #172019; color: #fffdf7; }
.source-mark { display: flex; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; align-items: center; justify-content: center; border-radius: 20rpx; background: #ddec8c; color: #172019; font: 700 30rpx/1 Georgia, serif; }
.hero > view:last-child { display: flex; min-width: 0; flex-direction: column; gap: 10rpx; }
.source-name { color: #b9c7b8; font-size: 17rpx; letter-spacing: 1rpx; }
.title { font-size: 29rpx; font-weight: 720; line-height: 1.45; overflow-wrap: anywhere; }
.facts, .meaning, .turns { margin: 18rpx 30rpx; padding: 26rpx; border: 1rpx solid #dfead7; border-radius: 24rpx; background: #fffdf7; }
.facts > view { display: flex; justify-content: space-between; gap: 30rpx; padding: 13rpx 0; border-bottom: 1rpx solid #edf1e9; font-size: 21rpx; }
.facts > view:last-child { border-bottom: 0; }.facts > view text:first-child { color: #718075; }.facts > view text:last-child { text-align: right; }
.meaning { display: flex; flex-direction: column; gap: 14rpx; }.meaning text:first-child, .section-title { color: #42634a; font-size: 19rpx; font-weight: 750; }.meaning text:last-child { color: #59655c; font-size: 21rpx; line-height: 1.65; }
.turns { display: flex; flex-direction: column; }.turns > view { display: grid; grid-template-columns: 54rpx 100rpx 1fr; gap: 12rpx; padding: 14rpx 0; border-top: 1rpx solid #edf1e9; color: #59655c; font-size: 19rpx; }.turns > view text:last-child { text-align: right; }
.bottom-space { height: 80rpx; }.state { padding: 120rpx 40rpx; color: #718075; text-align: center; font-size: 22rpx; }
</style>
