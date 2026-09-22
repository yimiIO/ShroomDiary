<template>
	<view class="trend-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-header">
			<view class="back-btn" @tap="goBack"><text class="back-text">←</text></view>
			<text class="page-title">7 日趋势</text>
			<view class="placeholder"></view>
		</view>

		<view class="card">
			<text class="chart-title">心情</text>
			<view class="bar-chart">
				<view class="bar-col" v-for="(v,i) in mood" :key="i">
					<view class="bar" :style="{ height: (v*20)+'rpx' }"></view>
					<text class="bar-label">{{ labels[i] }}</text>
				</view>
			</view>
		</view>

		<view class="card">
			<text class="chart-title">睡眠时长（小时）</text>
			<view class="bar-chart">
				<view class="bar-col" v-for="(v,i) in sleep" :key="i">
					<view class="bar sleep" :style="{ height: (v*20)+'rpx' }"></view>
					<text class="bar-label">{{ labels[i] }}</text>
				</view>
			</view>
		</view>

		<view class="card">
			<text class="chart-title">步数</text>
			<view class="bar-chart">
				<view class="bar-col" v-for="(v,i) in steps" :key="i">
					<view class="bar steps" :style="{ height: (v/100)+'rpx' }"></view>
					<text class="bar-label">{{ labels[i] }}</text>
				</view>
			</view>
		</view>

		<view class="card">
			<text class="chart-title">天气</text>
			<view class="weather-row">
				<view class="w-col" v-for="(w,i) in weather" :key="i">
					<image class="w-icon" :src="w.icon" mode="aspectFit" />
					<text class="w-temp">{{ w.temp }}°</text>
					<text class="bar-label">{{ labels[i] }}</text>
				</view>
			</view>
		</view>

		<view class="disclaimer">以上仅来自你的记录，不代表因果关系或医学结论。</view>
	</view>
</template>

<script>
export default {
	data() {
		return {
			statusBarHeight: 20,
			labels: ['一','二','三','四','五','六','日'],
			mood: [3,4,2,4,3,4,4],
			sleep: [7,8,6,7.5,7,8,8],
			steps: [5200,8400,3100,6700,4200,9100,7800],
			weather: [
				{ icon: '/static/snapshot/weather/weather-cloudy.png', temp: 20 },
				{ icon: '/static/snapshot/weather/weather-sunny.png', temp: 23 },
				{ icon: '/static/snapshot/weather/weather-light-rain.png', temp: 18 },
				{ icon: '/static/snapshot/weather/weather-light-rain.png', temp: 17 },
				{ icon: '/static/snapshot/weather/weather-sunny.png', temp: 22 },
				{ icon: '/static/snapshot/weather/weather-sunny.png', temp: 24 },
				{ icon: '/static/snapshot/weather/weather-cloudy.png', temp: 21 },
			],
		}
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
	},
	methods: {
		goBack() { uni.navigateBack() },
	}
}
</script>

<style lang="scss" scoped>
.trend-page { min-height: 100vh; background: #f1f8e9; padding: 0 30rpx 60rpx; }
.page-header { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0 30rpx; }
.back-text { font-size: 40rpx; color: #333; }
.page-title { font-size: 36rpx; font-weight: 700; color: #333; }
.placeholder { width: 60rpx; }
.card { background: #fff; border-radius: 24rpx; padding: 30rpx; margin-bottom: 24rpx; }
.chart-title { font-size: 28rpx; font-weight: 600; color: #333; display: block; margin-bottom: 30rpx; }
.bar-chart { display: flex; justify-content: space-between; align-items: flex-end; height: 160rpx; }
.bar-col { display: flex; flex-direction: column; align-items: center; flex: 1; }
.bar {
	width: 40rpx;
	background: #7CAE5A;
	border-radius: 8rpx 8rpx 0 0;
	&.sleep { background: #D8963A; }
	&.steps { background: #88B7E0; }
}
.bar-label { font-size: 20rpx; color: #999; margin-top: 10rpx; }
.weather-row { display: flex; justify-content: space-between; }
.w-col { display: flex; flex-direction: column; align-items: center; flex: 1; }
.w-icon { width: 56rpx; height: 56rpx; }
.w-temp { font-size: 22rpx; color: #666; margin-top: 6rpx; }
.disclaimer { font-size: 22rpx; color: #bbb; text-align: center; padding: 30rpx; }
</style>
