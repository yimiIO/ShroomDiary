<template>
	<view class="med-page" :class="{ dark: isMeditating }">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

		<!-- 首页 -->
		<block v-if="!isMeditating && !isFinished">
			<view class="page-header">
				<view class="back-btn" @tap="goBack"><text class="back-text">‹</text></view>
				<text class="page-title">晨间冥想</text>
				<view class="edit-btn" @tap="editing = !editing">✏️</view>
			</view>

			<view class="counter-row">
				<view class="counter-item">
					<text class="counter-num">{{ streak }}</text>
					<text class="counter-label">连续天数</text>
				</view>
				<view class="counter-divider"></view>
				<view class="counter-item">
					<text class="counter-num">{{ totalCount }}</text>
					<text class="counter-label">总次数</text>
				</view>
				<view class="counter-divider"></view>
				<view class="counter-item">
					<text class="counter-num">{{ totalMinutes }}</text>
					<text class="counter-label">总分钟</text>
				</view>
			</view>

			<view class="quote-card">
				<text class="quote-mark">"</text>
				<text class="quote-text">{{ affirmation }}</text>
				<text class="quote-mark right">"</text>
			</view>

			<view class="quote-edit" v-if="editing">
				<textarea class="quote-input" v-model="affirmation" maxlength="200" />
				<view class="save-quote" @tap="saveQuote">保存这句话</view>
			</view>

			<view class="duration-label">选择时长</view>
			<view class="duration-row">
				<view
					v-for="d in durations"
					:key="d"
					class="duration-chip"
					:class="{ active: selectedDuration === d }"
					@tap="selectedDuration = d"
				>{{ d }} 分钟</view>
			</view>

			<view class="start-btn" @tap="startMeditation">
				<text class="start-text">开始冥想</text>
			</view>
		</block>

		<!-- 冥想中 -->
		<block v-if="isMeditating">
			<view class="med-area">
				<view class="breath-circle" :class="{ inhaling: phase === 'inhale' }">
					<text class="breath-text">{{ phaseText }}</text>
				</view>
				<text class="med-quote">{{ affirmation }}</text>
				<text class="med-timer">{{ remaining }} 秒</text>
			</view>
			<view class="end-med-btn" @tap="endMeditation">提前结束</view>
		</block>

		<!-- 结束总结 -->
		<block v-if="isFinished">
			<view class="finish-card">
				<text class="finish-emoji">🌿</text>
				<text class="finish-title">本次完成</text>
				<text class="finish-time">{{ lastMinutes }} 分钟</text>
				<view class="finish-divider"></view>
				<view class="finish-stats">
					<view class="fs-item">
						<text class="fs-num">{{ streak }}</text>
						<text class="fs-label">连续天数</text>
					</view>
					<view class="fs-item">
						<text class="fs-num">{{ totalCount }}</text>
						<text class="fs-label">总次数</text>
					</view>
				</view>
				<text class="finish-encourage">{{ encourage }}</text>
				<view class="finish-btn" @tap="backHome">回到今日快照</view>
			</view>
		</block>
	</view>
</template>

<script>
import { completeMeditation } from '@/api/snapshot';

export default {
	data() {
		return {
			statusBarHeight: 20,
			editing: false,
			affirmation: '今天我对自己温柔一点，允许一切如其所是。',
			durations: [1, 3, 5],
			selectedDuration: 3,
			isMeditating: false,
			isFinished: false,
			remaining: 0,
			timer: null,
			phase: 'inhale',
			phaseText: '吸气',
			phaseTimer: null,
			streak: 7,
			totalCount: 23,
			totalMinutes: 68,
			lastMinutes: 3,
			encourage: '很好，今天的觉察从这一刻开始。',
		}
	},
	onLoad() { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20 },
	onUnload() { this.stopAllTimers() },
	methods: {
		goBack() { uni.navigateBack() },
		saveQuote() { this.editing = false; uni.showToast({ title: '已保存', icon: 'success' }) },
		startMeditation() {
			this.isMeditating = true
			this.remaining = this.selectedDuration * 60
			this.phase = 'inhale'
			this.phaseText = '吸气'
			this.timer = setInterval(() => {
				this.remaining--
				if (this.remaining <= 0) this.endMeditation()
			}, 1000)
			// 呼吸引导：4秒吸-6秒呼
			this.phaseTimer = setInterval(() => {
				if (this.phase === 'inhale') { this.phase = 'exhale'; this.phaseText = '呼气' }
				else { this.phase = 'inhale'; this.phaseText = '吸气' }
			}, 5000)
		},
		async endMeditation() {
			if (!this.isMeditating) return
			this.stopAllTimers()
			this.isMeditating = false
			this.isFinished = true
			this.lastMinutes = this.selectedDuration
			try {
				const response = await completeMeditation({
					duration_min: this.selectedDuration,
					affirmation: this.affirmation
				})
				const result = response.data || response
				this.streak = Number(result.streak) || 0
				this.totalCount = Number(result.totalCount) || 0
				this.totalMinutes = Number(result.totalMinutes) || 0
			} catch (error) {}
		},
		backHome() { uni.navigateBack() },
		stopAllTimers() {
			if (this.timer) clearInterval(this.timer)
			if (this.phaseTimer) clearInterval(this.phaseTimer)
			this.timer = null; this.phaseTimer = null
		},
	}
}
</script>

<style lang="scss" scoped>
.med-page { min-height: 100vh; background: #f1f8e9; padding: 0 40rpx 60rpx;
	&.dark { background: #2c3e35; } }

.page-header { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0 40rpx; }
.back-text { font-size: 56rpx; color: #666; }
.page-title { font-size: 36rpx; font-weight: 700; color: #333; }
.edit-btn { font-size: 32rpx; }

.counter-row { display: flex; align-items: center; justify-content: center; background: #fff; border-radius: 24rpx; padding: 30rpx; margin-bottom: 30rpx; }
.counter-item { flex: 1; text-align: center; }
.counter-num { font-size: 48rpx; font-weight: 700; color: #7CAE5A; display: block; }
.counter-label { font-size: 22rpx; color: #999; margin-top: 6rpx; display: block; }
.counter-divider { width: 1rpx; height: 60rpx; background: #eee; }

.quote-card { background: #fff; border-radius: 28rpx; padding: 50rpx 40rpx; margin-bottom: 30rpx; position: relative; }
.quote-mark { font-size: 60rpx; color: #7CAE5A; opacity: 0.3; &.right { float: right; } }
.quote-text { font-size: 32rpx; color: #333; line-height: 1.8; text-align: center; display: block; padding: 20rpx 0; }

.quote-edit { margin-bottom: 30rpx; }
.quote-input { width: 100%; height: 160rpx; background: #fff; border-radius: 20rpx; padding: 24rpx; font-size: 28rpx; }
.save-quote { background: #7CAE5A; color: #fff; text-align: center; padding: 20rpx; border-radius: 30rpx; margin-top: 16rpx; font-size: 28rpx; }

.duration-label { font-size: 26rpx; color: #999; text-align: center; display: block; margin-bottom: 20rpx; }
.duration-row { display: flex; justify-content: center; gap: 20rpx; margin-bottom: 40rpx; }
.duration-chip { padding: 16rpx 40rpx; background: #fff; border-radius: 30rpx; font-size: 28rpx; color: #666;
	&.active { background: #7CAE5A; color: #fff; } }

.start-btn { background: #7CAE5A; border-radius: 40rpx; padding: 30rpx; text-align: center;
	.start-text { color: #fff; font-size: 32rpx; font-weight: 600; } }

/* 冥想中 */
.med-area { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; }
.breath-circle {
	width: 280rpx; height: 280rpx; border-radius: 50%;
	background: rgba(124,174,90,0.2); border: 2rpx solid rgba(124,174,90,0.5);
	display: flex; align-items: center; justify-content: center;
	transition: all 5s ease-in-out;
	&.inhaling { transform: scale(1.3); background: rgba(124,174,90,0.35); }
}
.breath-text { font-size: 32rpx; color: #c8e0b8; letter-spacing: 8rpx; }
.med-quote { font-size: 32rpx; color: #d0d8d0; text-align: center; line-height: 1.8; margin-top: 60rpx; padding: 0 40rpx; }
.med-timer { font-size: 48rpx; color: #7CAE5A; font-weight: 600; margin-top: 40rpx; }
.end-med-btn { position: fixed; bottom: 60rpx; left: 50%; transform: translateX(-50%);
	color: #888; font-size: 26rpx; padding: 16rpx 40rpx; border: 1rpx solid #555; border-radius: 30rpx; }

/* 结束 */
.finish-card { display: flex; flex-direction: column; align-items: center; padding-top: 120rpx; }
.finish-emoji { font-size: 100rpx; }
.finish-title { font-size: 32rpx; color: #333; margin-top: 20rpx; }
.finish-time { font-size: 72rpx; font-weight: 700; color: #7CAE5A; margin-top: 16rpx; }
.finish-divider { width: 200rpx; height: 1rpx; background: #ddd; margin: 40rpx 0; }
.finish-stats { display: flex; gap: 80rpx; }
.fs-item { text-align: center; }
.fs-num { font-size: 48rpx; font-weight: 700; color: #333; display: block; }
.fs-label { font-size: 22rpx; color: #999; margin-top: 6rpx; display: block; }
.finish-encourage { font-size: 26rpx; color: #888; margin-top: 40rpx; text-align: center; }
.finish-btn { margin-top: 60rpx; background: #7CAE5A; color: #fff; padding: 24rpx 80rpx; border-radius: 40rpx; font-size: 28rpx; }
</style>
