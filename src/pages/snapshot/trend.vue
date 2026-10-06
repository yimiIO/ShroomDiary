<template>
	<view class="sleep-trend-page snapshot-subpage">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-header">
			<view class="back-btn" @tap="goBack"><text>‹</text></view>
			<text class="page-title">睡眠趋势</text>
			<view class="header-space"></view>
		</view>

		<view class="range-switch" aria-label="选择查看范围">
			<view
				v-for="days in rangeOptions"
				:key="days"
				class="range-option"
				:class="{ active: rangeDays === days }"
				@tap="selectRange(days)"
			>{{ days }} 天</view>
		</view>

		<view class="trend-card">
			<view class="trend-heading">
				<view>
					<text class="trend-title">入睡与起床</text>
					<text class="trend-subtitle">看长期规律，不评价某一天</text>
				</view>
				<view class="selected-date" v-if="selectedEntry">{{ selectedEntry.dayLabel }}</view>
			</view>

			<view class="selected-times" v-if="selectedEntry">
				<view class="selected-time bedtime">
					<text class="selected-label">入睡</text>
					<text class="selected-value">{{ selectedEntry.bedtime || '未记录' }}</text>
				</view>
				<view class="selected-time wake">
					<text class="selected-label">起床</text>
					<text class="selected-value">{{ selectedEntry.wakeTime || '未记录' }}</text>
				</view>
			</view>

			<view class="chart-wrap" v-if="entries.length">
				<canvas
					id="sleepTrendCanvas"
					canvas-id="sleepTrendCanvas"
					class="trend-canvas"
					@touchstart="selectPoint"
				></canvas>
				<view class="chart-legend">
					<view><text class="legend-dot bedtime"></text><text>入睡</text></view>
					<view><text class="legend-dot wake"></text><text>起床</text></view>
				</view>
				<text class="chart-hint">轻点折线查看当天时间</text>
			</view>
			<view class="empty-state" v-else-if="!loading">
				<text class="empty-title">还没有足够的睡眠记录</text>
				<text class="empty-copy">记录几天入睡和起床时间后，这里会形成趋势。</text>
			</view>
			<view class="loading-state" v-else>正在读取记录…</view>
		</view>

		<text class="trend-note">时间来自你的每日记录；趋势用于自我观察，不代表医学结论。</text>
	</view>
</template>

<script>
import { getSnapshotHistory } from '@/api/snapshot';

const AXIS_MIN = 18
const AXIS_MAX = 36

export default {
	data() {
		return {
			statusBarHeight: 20,
			rangeOptions: [7, 30, 90],
			rangeDays: 7,
			entries: [],
			selectedIndex: -1,
			loading: true,
			chartRect: null,
		}
	},
	computed: {
		selectedEntry() {
			return this.selectedIndex >= 0 ? this.entries[this.selectedIndex] : null
		},
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
		this.loadTrend()
	},
	onShow() { uni.hideTabBar({ animation: false, fail: () => {} }) },
	methods: {
		goBack() { uni.navigateBack() },
		async selectRange(days) {
			if (!this.rangeOptions.includes(days) || this.rangeDays === days) return
			this.rangeDays = days
			await this.loadTrend()
		},
		async loadTrend() {
			this.loading = true
			try {
				const response = await getSnapshotHistory(this.rangeDays)
				const payload = response.data || response
				const rows = Array.isArray(payload.days) ? payload.days : []
				this.entries = rows
					.map(row => ({
						day: String(row.day || '').slice(0, 10),
						dayLabel: this.formatDay(row.day),
						bedtime: this.formatClock(row.bedtime),
						wakeTime: this.formatClock(row.wake_time),
					}))
					.filter(item => item.day && (item.bedtime || item.wakeTime))
					.sort((left, right) => left.day.localeCompare(right.day))
				this.selectedIndex = this.entries.length ? this.entries.length - 1 : -1
			} catch (error) {
				this.entries = []
				this.selectedIndex = -1
			} finally {
				this.loading = false
				this.$nextTick(() => this.drawChart())
			}
		},
		formatClock(value) {
			const match = String(value || '').match(/^(\d{2}):(\d{2})/)
			return match ? `${match[1]}:${match[2]}` : ''
		},
		formatDay(value) {
			const source = String(value || '').slice(0, 10)
			const parts = source.split('-').map(Number)
			return parts.length === 3 && parts.every(Number.isFinite) ? `${parts[1]}月${parts[2]}日` : source
		},
		clockValue(value) {
			if (!value) return null
			const parts = value.split(':').map(Number)
			if (parts.length < 2 || !parts.every(Number.isFinite)) return null
			let clock = parts[0] + parts[1] / 60
			if (clock < 12) clock += 24
			return clock
		},
		drawChart() {
			if (!this.entries.length) return
			const query = uni.createSelectorQuery().in(this)
			query.select('#sleepTrendCanvas').boundingClientRect(rect => {
				if (!rect || !rect.width || !rect.height) return
				this.chartRect = rect
				const context = uni.createCanvasContext('sleepTrendCanvas', this)
				const width = rect.width
				const height = rect.height
				const left = 42
				const right = 16
				const top = 18
				const bottom = 32
				const plotWidth = width - left - right
				const plotHeight = height - top - bottom
				const ticks = [18, 24, 30, 36]
				context.setFontSize(11)
				context.setTextAlign('right')
				context.setStrokeStyle('#e8ece5')
				context.setFillStyle('#929792')
				ticks.forEach(value => {
					const y = top + (AXIS_MAX - value) / (AXIS_MAX - AXIS_MIN) * plotHeight
					context.beginPath()
					context.moveTo(left, y)
					context.lineTo(width - right, y)
					context.stroke()
					const label = value === 36 ? '12:00' : `${String(value % 24).padStart(2, '0')}:00`
					context.fillText(label, left - 7, y + 4)
				})

				const xAt = index => this.entries.length === 1
					? left + plotWidth / 2
					: left + index / (this.entries.length - 1) * plotWidth
				const yAt = value => top + (AXIS_MAX - Math.max(AXIS_MIN, Math.min(AXIS_MAX, value))) / (AXIS_MAX - AXIS_MIN) * plotHeight
				const drawSeries = (field, color) => {
					const points = this.entries.map((item, index) => ({ index, value: this.clockValue(item[field]) })).filter(point => point.value !== null)
					if (!points.length) return
					context.setStrokeStyle(color)
					context.setLineWidth(2.5)
					context.beginPath()
					points.forEach((point, index) => {
						const x = xAt(point.index)
						const y = yAt(point.value)
						if (index === 0) context.moveTo(x, y)
						else context.lineTo(x, y)
					})
					context.stroke()
					points.forEach(point => {
						context.beginPath()
						context.setFillStyle(color)
						context.arc(xAt(point.index), yAt(point.value), point.index === this.selectedIndex ? 5 : 3, 0, Math.PI * 2)
						context.fill()
					})
				}
				drawSeries('bedtime', '#5f9049')
				drawSeries('wakeTime', '#d79745')

				if (this.selectedIndex >= 0) {
					const selectedX = xAt(this.selectedIndex)
					context.setStrokeStyle('rgba(53, 62, 54, .22)')
					context.setLineWidth(1)
					context.beginPath()
					context.moveTo(selectedX, top)
					context.lineTo(selectedX, height - bottom)
					context.stroke()
				}

				context.setTextAlign('center')
				context.setFillStyle('#8c918c')
				const labelIndexes = Array.from(new Set([0, Math.floor((this.entries.length - 1) / 2), this.entries.length - 1]))
				labelIndexes.forEach(index => {
					const date = this.entries[index].day.split('-')
					context.fillText(`${Number(date[1])}/${Number(date[2])}`, xAt(index), height - 9)
				})
				context.draw()
			}).exec()
		},
		selectPoint(event) {
			if (!this.entries.length || !this.chartRect) return
			const touch = event.touches && event.touches[0]
			if (!touch) return
			const left = 42
			const right = 16
			const localX = Number.isFinite(touch.x) ? touch.x : touch.clientX - this.chartRect.left
			const ratio = Math.max(0, Math.min(1, (localX - left) / (this.chartRect.width - left - right)))
			this.selectedIndex = this.entries.length === 1 ? 0 : Math.round(ratio * (this.entries.length - 1))
			this.drawChart()
		},
	},
}
</script>

<style lang="scss" scoped>
.sleep-trend-page { box-sizing: border-box; min-height: 100vh; padding: 0 26rpx calc(60rpx + env(safe-area-inset-bottom)); background: linear-gradient(180deg, #fbfcf7 0%, #f2f7ec 100%); color: #202420; }
.page-header { display: flex; height: 92rpx; align-items: center; justify-content: space-between; }
.back-btn, .header-space { display: flex; width: 64rpx; height: 64rpx; align-items: center; justify-content: center; }
.back-btn { border-radius: 50%; background: rgba(255,255,255,.88); color: #343934; font-size: 50rpx; }
.page-title { font-size: 34rpx; font-weight: 760; }
.range-switch { display: flex; width: 100%; padding: 6rpx; box-sizing: border-box; border: 1rpx solid rgba(83,105,78,.1); border-radius: 22rpx; background: rgba(255,255,255,.74); }
.range-option { display: flex; min-height: 68rpx; flex: 1; align-items: center; justify-content: center; border-radius: 17rpx; color: #747a74; font-size: 24rpx; font-weight: 650; }
.range-option.active { background: #e6f1de; color: #4f813b; box-shadow: 0 4rpx 12rpx rgba(83,117,68,.08); }
.trend-card { margin-top: 22rpx; padding: 30rpx 24rpx 28rpx; border: 1rpx solid rgba(82,105,77,.1); border-radius: 30rpx; background: rgba(255,255,255,.94); box-shadow: 0 14rpx 35rpx rgba(67,88,62,.06); }
.trend-heading { display: flex; align-items: flex-start; justify-content: space-between; }
.trend-title, .trend-subtitle { display: block; }
.trend-title { font-size: 32rpx; font-weight: 780; }
.trend-subtitle { margin-top: 8rpx; color: #909590; font-size: 21rpx; }
.selected-date { padding: 8rpx 15rpx; border-radius: 20rpx; background: #f1f4ee; color: #686e68; font-size: 21rpx; }
.selected-times { display: flex; margin-top: 25rpx; gap: 14rpx; }
.selected-time { display: flex; min-height: 94rpx; flex: 1; flex-direction: column; align-items: center; justify-content: center; border-radius: 20rpx; background: #f3f8ef; }
.selected-time.wake { background: #fdf6eb; }
.selected-label { color: #858b85; font-size: 20rpx; }
.selected-value { margin-top: 5rpx; color: #55833f; font-size: 33rpx; font-weight: 780; }
.selected-time.wake .selected-value { color: #c27c2e; }
.chart-wrap { margin-top: 20rpx; }
.trend-canvas { display: block; width: 100%; height: 500rpx; }
.chart-legend { display: flex; justify-content: center; gap: 34rpx; color: #737873; font-size: 22rpx; }
.chart-legend view { display: flex; align-items: center; gap: 8rpx; }
.legend-dot { width: 16rpx; height: 16rpx; border-radius: 50%; background: #5f9049; }
.legend-dot.wake { background: #d79745; }
.chart-hint { display: block; margin-top: 16rpx; color: #a0a4a0; font-size: 20rpx; text-align: center; }
.empty-state, .loading-state { display: flex; min-height: 480rpx; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.empty-title { color: #4d534d; font-size: 27rpx; font-weight: 700; }
.empty-copy { max-width: 480rpx; margin-top: 12rpx; color: #969b96; font-size: 22rpx; line-height: 1.6; }
.loading-state { color: #929792; font-size: 23rpx; }
.trend-note { display: block; padding: 26rpx 28rpx 0; color: #a1a5a1; font-size: 20rpx; line-height: 1.55; text-align: center; }
</style>
