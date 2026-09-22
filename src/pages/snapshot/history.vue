<template>
	<view class="history-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-header">
			<view class="back-btn" @tap="goBack">
				<text class="back-text">←</text>
			</view>
			<text class="page-title">历史快照</text>
			<view class="placeholder"></view>
		</view>

		<view class="month-label">2026年9月</view>

		<view class="snapshot-list">
			<view class="snapshot-card" v-for="(item, i) in list" :key="i" @tap="viewDetail(item)">
				<view class="card-date">
					<text class="date-main">{{ item.date }}</text>
					<text class="date-week">{{ item.week }}</text>
				</view>
				<view class="card-summary">
					<view class="summary-row">
						<image class="sum-icon" src="/static/snapshot/emotions/mood-happy.png" mode="aspectFit" />
						<text class="sum-text">心情 {{ item.mood }}</text>
						<image class="sum-icon sm" src="/static/snapshot/weather/weather-cloudy.png" mode="aspectFit" />
						<text class="sum-text">{{ item.temp }}°</text>
						<image class="sum-icon sm" src="/static/snapshot/icons/ic-steps.png" mode="aspectFit" />
						<text class="sum-text">{{ item.steps.toLocaleString() }}</text>
					</view>
					<view class="summary-row">
						<image class="sum-icon sm" src="/static/snapshot/icons/ic-moon.png" mode="aspectFit" />
						<text class="sum-text">睡 {{ item.sleep }}h</text>
						<image class="sum-icon sm" src="/static/snapshot/icons/ic-location.png" mode="aspectFit" />
						<text class="sum-text">{{ item.scene }}</text>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
export default {
	data() {
		return {
			statusBarHeight: 20,
			list: [
				{ date: '9月21日', week: '周日', mood: 4, temp: 23, steps: 8432, sleep: 8.0, scene: '办公室' },
				{ date: '9月20日', week: '周六', mood: 3, temp: 20, steps: 5231, sleep: 7.0, scene: '家' },
				{ date: '9月19日', week: '周五', mood: 2, temp: 18, steps: 3102, sleep: 6.0, scene: '办公室' },
			],
		}
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
	},
	methods: {
		goBack() { uni.navigateBack() },
		viewDetail(item) { uni.navigateTo({ url: '/pages/snapshot/detail' }) },
	}
}
</script>

<style lang="scss" scoped>
.history-page { min-height: 100vh; background: #f1f8e9; padding: 0 30rpx 60rpx; }
.page-header { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0 30rpx; }
.back-btn { width: 60rpx; height: 60rpx; }
.back-text { font-size: 40rpx; color: #333; }
.page-title { font-size: 36rpx; font-weight: 700; color: #333; }
.placeholder { width: 60rpx; }
.month-label { font-size: 26rpx; color: #999; padding: 10rpx 0 20rpx; }
.snapshot-list { display: flex; flex-direction: column; gap: 20rpx; }
.snapshot-card {
	background: #fff;
	border-radius: 24rpx;
	padding: 28rpx;
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.card-date { display: flex; flex-direction: column; }
.date-main { font-size: 30rpx; font-weight: 600; color: #333; }
.date-week { font-size: 22rpx; color: #999; margin-top: 4rpx; }
.card-summary { display: flex; flex-direction: column; gap: 10rpx; }
.summary-row { display: flex; align-items: center; gap: 12rpx; }
.sum-icon { width: 40rpx; height: 40rpx; &.sm { width: 32rpx; height: 32rpx; } }
.sum-text { font-size: 24rpx; color: #666; }
</style>
