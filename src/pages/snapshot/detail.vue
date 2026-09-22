<template>
	<view class="detail-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-header">
			<view class="back-btn" @tap="goBack"><text class="back-text">←</text></view>
			<text class="page-title">快照详情</text>
			<view class="placeholder"></view>
		</view>
		<view class="card">
			<text class="empty">详情页（限当日编辑）</text>
		</view>
	</view>
</template>
<script>
export default {
	data() { return { statusBarHeight: 20 } },
	onLoad() { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20 },
	methods: { goBack() { uni.navigateBack() } }
}
</script>
<style lang="scss" scoped>
.detail-page { min-height: 100vh; background: #F6F4EC; padding: 0 30rpx; }
.page-header { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0 30rpx; }
.back-text { font-size: 40rpx; color: #333; }
.page-title { font-size: 36rpx; font-weight: 700; color: #333; }
.placeholder { width: 60rpx; }
.card { background: #fff; border-radius: 24rpx; padding: 60rpx; text-align: center; }
.empty { color: #999; font-size: 28rpx; }
</style>
