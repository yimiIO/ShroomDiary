<template>
	<view class="finance-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-header">
			<view class="back-btn" @tap="goBack"><text class="back-text">‹</text></view>
			<text class="page-title">今日账单</text>
			<view class="settings-btn" @tap="showSettings">账单设置 ›</view>
		</view>

		<view class="summary-card">
			<view class="summary-top">
				<text class="summary-date">{{ dateLabel }}</text>
			</view>
			<view class="balance-row">
				<view class="balance-label">
					<text class="balance-title">今日结余</text>
					<text class="balance-status">待记录</text>
				</view>
			</view>
			<view class="balance-amount">
				<text class="currency">¥</text>
				<text class="amount">0.00</text>
			</view>
			<text class="balance-desc">先从一笔开始，让今天的资金去向有迹可循。</text>

			<view class="divider"></view>

			<view class="two-col">
				<view class="col">
					<view class="col-head">
						<view class="dot green"></view>
						<text class="col-name">支出</text>
						<text class="col-count">0 笔</text>
					</view>
					<text class="col-amount green">¥0.00</text>
				</view>
				<view class="col">
					<view class="col-head">
						<view class="dot red"></view>
						<text class="col-name">收入</text>
						<text class="col-count">0 笔</text>
					</view>
					<text class="col-amount red">¥0.00</text>
				</view>
			</view>
		</view>

		<view class="empty-card">
			<view class="empty-illustration">
				<view class="doc-icon">
					<view class="doc-line"></view>
					<view class="doc-line short"></view>
					<view class="doc-line"></view>
					<view class="doc-line short"></view>
				</view>
				<view class="float-dot d1"></view>
				<view class="float-dot d2"></view>
				<view class="float-yen">¥</view>
			</view>
			<text class="empty-title">今天还没有账单</text>
			<text class="empty-desc">记录第一笔收支，让今天的来往更清楚</text>
		</view>

		<view class="fab" @tap="addRecord">+</view>
	</view>
</template>

<script>
export default {
	data() { return { statusBarHeight: 20 } },
	computed: {
		dateLabel() {
			const d = new Date()
			const wd = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]
			return `${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日 · ${wd}`
		}
	},
	onLoad() { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20 },
	methods: {
		goBack() { uni.navigateBack() },
		showSettings() {},
		addRecord() { uni.showToast({ title: '记一笔开发中', icon: 'none' }) }
	}
}
</script>

<style lang="scss" scoped>
.finance-page { min-height: 100vh; background: #F0F4F2; padding: 0 30rpx 140rpx; }
.page-header { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0 30rpx; }
.back-text { font-size: 56rpx; color: #666; }
.page-title { font-size: 36rpx; font-weight: 700; color: #333; }
.settings-btn { font-size: 26rpx; color: #999; }

.summary-card { background: #fff; border-radius: 28rpx; padding: 36rpx; margin-bottom: 24rpx; }
.summary-date { font-size: 28rpx; color: #999; }
.balance-row { margin-top: 30rpx; }
.balance-label { display: flex; align-items: baseline; gap: 16rpx; }
.balance-title { font-size: 28rpx; color: #333; border-left: 6rpx solid #7CAE5A; padding-left: 16rpx; }
.balance-status { font-size: 24rpx; color: #999; }
.balance-amount { margin-top: 16rpx; display: flex; align-items: baseline; }
.currency { font-size: 36rpx; color: #333; margin-right: 8rpx; }
.amount { font-size: 80rpx; font-weight: 700; color: #333; line-height: 1; }
.balance-desc { font-size: 24rpx; color: #999; margin-top: 16rpx; display: block; }
.divider { height: 1rpx; background: #f0f0f0; margin: 30rpx 0; }
.two-col { display: flex; }
.col { flex: 1; }
.col-head { display: flex; align-items: center; gap: 10rpx; }
.dot { width: 14rpx; height: 14rpx; border-radius: 50%;
	&.green { background: #7CAE5A; } &.red { background: #E06B6B; } }
.col-name { font-size: 28rpx; color: #333; }
.col-count { font-size: 24rpx; color: #bbb; margin-left: auto; }
.col-amount { font-size: 40rpx; font-weight: 600; margin-top: 12rpx;
	&.green { color: #7CAE5A; } &.red { color: #E06B6B; } }

.empty-card { background: #fff; border-radius: 28rpx; padding: 60rpx 40rpx; display: flex; flex-direction: column; align-items: center; }
.empty-illustration { position: relative; width: 200rpx; height: 180rpx; margin-bottom: 30rpx; }
.doc-icon { position: absolute; left: 30rpx; top: 20rpx; width: 140rpx; height: 120rpx; background: #f5f5f0; border-radius: 16rpx; padding: 20rpx; }
.doc-line { height: 10rpx; background: #e0e0e0; border-radius: 5rpx; margin-bottom: 14rpx; width: 100%;
	&.short { width: 60%; } }
.float-dot { position: absolute; width: 24rpx; height: 24rpx; border-radius: 50%;
	&.d1 { left: 0; top: 60rpx; background: #c8e0b8; }
	&.d2 { right: 10rpx; top: 20rpx; background: #f0c8c8; } }
.float-yen { position: absolute; right: 10rpx; bottom: 10rpx; width: 56rpx; height: 56rpx; background: #7CAE5A; color: #fff; border-radius: 50%; text-align: center; line-height: 56rpx; font-size: 28rpx; font-weight: 600; }
.empty-title { font-size: 32rpx; font-weight: 600; color: #333; }
.empty-desc { font-size: 24rpx; color: #999; margin-top: 12rpx; }

.fab { position: fixed; bottom: 60rpx; left: 50%; transform: translateX(-50%);
	width: 110rpx; height: 110rpx; background: #4CAF7D; border-radius: 50%;
	color: #fff; font-size: 60rpx; text-align: center; line-height: 110rpx;
	box-shadow: 0 8rpx 24rpx rgba(76,175,125,0.4); }
</style>
