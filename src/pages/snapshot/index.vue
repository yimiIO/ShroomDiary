<template>
	<view class="snapshot-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

		<!-- 顶部标题 -->
		<view class="page-header">
			<view>
				<text class="eyebrow">DAILY SNAPSHOT</text>
				<text class="page-title">今日快照</text>
				<text class="page-date">{{ todayLabel }}</text>
			</view>
			<view class="header-actions">
				<view class="icon-btn" @tap="goTrend">
					<text class="icon-btn-text">趋势</text>
				</view>
				<view class="icon-btn" @tap="goHistory">
					<text class="icon-btn-text">历史</text>
				</view>
			</view>
		</view>

		<!-- 周历 -->
		<view class="week-row">
			<view
				v-for="(day, i) in weekDays"
				:key="i"
				class="week-day"
				:class="{ active: day.isToday, selected: day.date === selectedDate }"
				@tap="selectDate(day.date)"
			>
				<text class="week-label">{{ day.label }}</text>
				<text class="week-num">{{ day.day }}</text>
			</view>
		</view>

		<!-- 第一行：5 图标 -->
		<view class="card row-card">
			<view class="grid-5">
				<view class="grid-item" @tap="openSheet('mood')">
					<image class="grid-icon" :src="moodIcon" mode="aspectFit" />
					<text class="grid-label">心情</text>
					<text class="grid-value">{{ data.moodScore ? '😊' + data.moodScore : '' }}</text>
				</view>
				<view class="grid-item" @tap="openSheet('weather')">
					<image class="grid-icon" :src="weatherIcon" mode="aspectFit" />
					<text class="grid-label">天气</text>
					<text class="grid-value">{{ data.weatherTemp ? data.weatherTemp + '°' : '' }}</text>
				</view>
				<view class="grid-item" @tap="openSheet('steps')">
					<image class="grid-icon" src="/static/snapshot/icons/ic-steps.png" mode="aspectFit" />
					<text class="grid-label">步数</text>
					<text class="grid-value">{{ data.steps ? data.steps.toLocaleString() : '' }}</text>
				</view>
				<view class="grid-item" @tap="openSheet('sleep')">
					<image class="grid-icon" src="/static/snapshot/icons/ic-moon.png" mode="aspectFit" />
					<text class="grid-label">入睡</text>
					<text class="grid-value">{{ data.bedtime || '' }}</text>
				</view>
				<view class="grid-item" @tap="openSheet('sleep')">
					<image class="grid-icon" src="/static/snapshot/icons/ic-wake.png" mode="aspectFit" />
					<text class="grid-label">起床</text>
					<text class="grid-value">{{ data.wakeTime || '' }}</text>
				</view>
			</view>
		</view>

		<!-- 第二行：场景 + 财务 -->
		<view class="card row-card two-col">
			<view class="two-item" @tap="openSheet('scene')">
				<image class="two-icon" src="/static/snapshot/icons/ic-location.png" mode="aspectFit" />
				<view class="two-text">
					<text class="two-label">场景</text>
					<text class="two-value">{{ sceneLabel || '在哪里？' }}</text>
				</view>
			</view>
			<view class="two-item" v-if="financeEnabled" @tap="openSheet('finance')">
				<image class="two-icon" src="/static/snapshot/icons/ic-piggy.png" mode="aspectFit" />
				<view class="two-text">
					<text class="two-label">财务</text>
					<text class="two-value">{{ financeSummary || '记一笔' }}</text>
				</view>
			</view>
			<view class="two-item finance-off" v-else @tap="toggleFinance">
				<image class="two-icon dimmed" src="/static/snapshot/icons/ic-piggy.png" mode="aspectFit" />
				<view class="two-text">
					<text class="two-label">财务</text>
					<text class="two-value dimmed-text">点击开启</text>
				</view>
			</view>
		</view>

		<!-- 第三行：餐饮 -->
		<view class="card row-card">
			<view class="meal-header">
				<image class="meal-icon" src="/static/snapshot/icons/ic-book.png" mode="aspectFit" />
				<text class="meal-title">今天吃了什么？</text>
				<text class="meal-hint" v-if="!meals.length">（可选）</text>
			</view>
			<scroll-view scroll-x class="meal-scroll" v-if="meals.length">
				<view class="meal-list">
					<view class="meal-chip" v-for="(m, i) in meals" :key="i" @tap="editMeal(i)">
						<text class="meal-type">{{ m.type }}</text>
						<text class="meal-name">{{ m.name }}</text>
					</view>
					<view class="meal-chip add" @tap="openSheet('meal')">
						<text class="meal-plus">+</text>
					</view>
				</view>
			</scroll-view>
			<view class="meal-empty" v-else @tap="openSheet('meal')">
				<text class="meal-empty-text">+ 记一餐</text>
			</view>
		</view>

		<!-- 保存按钮 -->
		<view class="save-btn" :class="{ saved: isSaved }" @tap="saveSnapshot">
			<text class="save-text">{{ isSaved ? '编辑今日快照' : '保存今日快照' }}</text>
		</view>
		<view class="history-link" v-if="isSaved" @tap="goHistory">
			<text>查看历史 →</text>
		</view>

		<!-- 心情弹窗 -->
		<view class="sheet-mask" v-if="sheet === 'mood'" @tap="closeSheet"></view>
		<view class="sheet" v-if="sheet === 'mood'">
			<view class="sheet-handle"></view>
			<text class="sheet-title">今天心情怎么样？</text>
			<view class="mood-stars">
				<view
					v-for="n in 5"
					:key="n"
					class="mood-star"
					:class="{ active: data.moodScore === n }"
					@tap="data.moodScore = n"
				>
					<image class="mood-face" :src="moodFaces[n]" mode="aspectFit" />
					<text class="mood-num">{{ n }}</text>
				</view>
			</view>
			<view class="tag-grid">
				<view
					v-for="t in moodTags"
					:key="t"
					class="mood-tag"
					:class="{ active: data.moodTags.includes(t) }"
					@tap="toggleTag(t)"
				>{{ t }}</view>
			</view>
			<view class="sheet-done" @tap="closeSheet">完成</view>
		</view>

		<!-- 天气弹窗 -->
		<view class="sheet-mask" v-if="sheet === 'weather'" @tap="closeSheet"></view>
		<view class="sheet" v-if="sheet === 'weather'">
			<view class="sheet-handle"></view>
			<text class="sheet-title">今天天气怎么样？</text>
			<view class="weather-grid">
				<view
					v-for="w in weatherOptions"
					:key="w.code"
					class="weather-item"
					:class="{ active: data.weatherCode === w.code }"
					@tap="data.weatherCode = w.code"
				>
					<image class="weather-img" :src="w.icon" mode="aspectFit" />
					<text class="weather-name">{{ w.name }}</text>
				</view>
			</view>
			<view class="temp-row">
				<text class="temp-label">温度</text>
				<input class="temp-input" type="number" v-model="data.weatherTemp" placeholder="23" />
				<text class="temp-unit">°C</text>
			</view>
			<view class="sheet-done" @tap="closeSheet">完成</view>
		</view>

		<!-- 睡眠弹窗 -->
		<view class="sheet-mask" v-if="sheet === 'sleep'" @tap="closeSheet"></view>
		<view class="sheet" v-if="sheet === 'sleep'">
			<view class="sheet-handle"></view>
			<text class="sheet-title">昨晚睡眠</text>
			<view class="time-row">
				<text class="time-label">入睡</text>
				<picker mode="time" :value="data.bedtime" @change="e => data.bedtime = e.detail.value">
					<view class="time-box">{{ data.bedtime || '23:00' }}</view>
				</picker>
			</view>
			<view class="time-row">
				<text class="time-label">起床</text>
				<picker mode="time" :value="data.wakeTime" @change="e => data.wakeTime = e.detail.value">
					<view class="time-box">{{ data.wakeTime || '07:00' }}</view>
				</picker>
			</view>
			<view class="sleep-duration">睡眠时长：{{ sleepHours }} 小时</view>
			<view class="sheet-done" @tap="closeSheet">完成</view>
		</view>

		<!-- 步数弹窗 -->
		<view class="sheet-mask" v-if="sheet === 'steps'" @tap="closeSheet"></view>
		<view class="sheet" v-if="sheet === 'steps'">
			<view class="sheet-handle"></view>
			<text class="sheet-title">今天走了多少步？</text>
			<view class="steps-value">{{ (data.steps || 0).toLocaleString() }} 步</view>
			<slider class="steps-slider" :value="data.steps || 0" :min="0" :max="30000" :step="100"
				activeColor="#7CAE5A" @change="e => data.steps = e.detail.value" />
			<view class="sheet-done" @tap="closeSheet">完成</view>
		</view>

		<!-- 场景弹窗 -->
		<view class="sheet-mask" v-if="sheet === 'scene'" @tap="closeSheet"></view>
		<view class="sheet" v-if="sheet === 'scene'">
			<view class="sheet-handle"></view>
			<text class="sheet-title">现在在哪里？</text>
			<view class="scene-list">
				<view
					v-for="s in sceneOptions"
					:key="s"
					class="scene-item"
					:class="{ active: data.scene === s }"
					@tap="selectScene(s)"
				>{{ s }}</view>
			</view>
		</view>

		<!-- 餐饮弹窗 -->
		<view class="sheet-mask" v-if="sheet === 'meal'" @tap="closeSheet"></view>
		<view class="sheet" v-if="sheet === 'meal'">
			<view class="sheet-handle"></view>
			<text class="sheet-title">记一餐</text>
			<view class="meal-types">
				<view
					v-for="t in ['早餐','午餐','晚餐','加餐']"
					:key="t"
					class="meal-type"
					:class="{ active: mealDraft.type === t }"
					@tap="mealDraft.type = t"
				>{{ t }}</view>
			</view>
			<input class="meal-input" v-model="mealDraft.name" placeholder="说说吃了什么（可选）" />
			<view class="sheet-done" @tap="saveMeal">完成</view>
		</view>

		<!-- 财务弹窗 -->
		<view class="sheet-mask" v-if="sheet === 'finance'" @tap="closeSheet"></view>
		<view class="sheet" v-if="sheet === 'finance'">
			<view class="sheet-handle"></view>
			<text class="sheet-title">今天财务记录</text>
			<view class="fin-row">
				<text class="fin-label">花钱 ¥</text>
				<input class="fin-input" type="digit" v-model="data.financeAmount" />
			</view>
			<view class="tag-grid">
				<view
					v-for="c in ['餐饮','交通','购物','其他']"
					:key="c"
					class="mood-tag"
					:class="{ active: data.financeCategory === c }"
					@tap="data.financeCategory = c"
				>{{ c }}</view>
			</view>
			<view class="sheet-done" @tap="closeSheet">完成</view>
		</view>
	</view>
</template>

<script>
export default {
	data() {
		return {
			statusBarHeight: 20,
			selectedDate: '',
			sheet: '',
			isSaved: false,
			financeEnabled: false,
			mealDraft: { type: '早餐', name: '' },
			editingMealIndex: -1,
			data: {
				moodScore: 0,
				moodTags: [],
				weatherCode: '',
				weatherTemp: '',
				steps: 0,
				bedtime: '',
				wakeTime: '',
				scene: '',
				financeAmount: '',
				financeCategory: '',
			},
			meals: [],
			moodTags: ['开心','平静','焦虑','低落','兴奋','疲惫','烦躁'],
			sceneOptions: ['家','办公室','学校','户外','咖啡馆','其他'],
			weatherOptions: [
				{ code: 'sunny', name: '晴', icon: '/static/snapshot/weather/weather-sunny.png' },
				{ code: 'cloudy', name: '多云', icon: '/static/snapshot/weather/weather-cloudy.png' },
				{ code: 'overcast', name: '阴', icon: '/static/snapshot/weather/weather-overcast.png' },
				{ code: 'light-rain', name: '小雨', icon: '/static/snapshot/weather/weather-light-rain.png' },
				{ code: 'heavy-rain', name: '大雨', icon: '/static/snapshot/weather/weather-heavy-rain.png' },
				{ code: 'snow', name: '雪', icon: '/static/snapshot/weather/weather-snow.png' },
				{ code: 'haze', name: '雾', icon: '/static/snapshot/weather/weather-haze.png' },
				{ code: 'windy', name: '大风', icon: '/static/snapshot/weather/weather-windy.png' },
			],
		}
	},
	computed: {
		todayLabel() {
			const d = new Date()
			const wd = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]
			return `${d.getMonth()+1}月${d.getDate()}日 ${wd}`
		},
		weekDays() {
			const days = []
			const now = new Date()
			const monday = new Date(now)
			monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
			for (let i = 0; i < 7; i++) {
				const d = new Date(monday)
				d.setDate(monday.getDate() + i)
				days.push({
					label: ['一','二','三','四','五','六','日'][i],
					day: d.getDate(),
					date: d.toISOString().slice(0,10),
					isToday: d.toDateString() === now.toDateString(),
				})
			}
			return days
		},
		moodFaces() {
			return {
				1: '/static/snapshot/emotions/mood-terrible.png',
				2: '/static/snapshot/emotions/mood-unhappy.png',
				3: '/static/snapshot/emotions/mood-calm.png',
				4: '/static/snapshot/emotions/mood-happy.png',
				5: '/static/snapshot/emotions/mood-super.png',
			}
		},
		moodIcon() {
			return this.data.moodScore ? this.moodFaces[this.data.moodScore] : '/static/snapshot/icons/ic-mood.png'
		},
		weatherIcon() {
			const w = this.weatherOptions.find(x => x.code === this.data.weatherCode)
			return w ? w.icon : '/static/snapshot/icons/ic-sun.png'
		},
		sceneLabel() {
			return this.data.scene
		},
		financeSummary() {
			if (!this.data.financeAmount) return ''
			return `¥${this.data.financeAmount} ${this.data.financeCategory || ''}`
		},
		sleepHours() {
			if (!this.data.bedtime || !this.data.wakeTime) return '—'
			const [bh, bm] = this.data.bedtime.split(':').map(Number)
			const [wh, wm] = this.data.wakeTime.split(':').map(Number)
			let h = wh - bh
			if (h < 0) h += 24
			return (h + (wm - bm) / 60).toFixed(1)
		},
	},
	onLoad() {
		const sys = uni.getSystemInfoSync()
		this.statusBarHeight = sys.statusBarHeight || 20
		this.selectedDate = new Date().toISOString().slice(0,10)
	},
	methods: {
		selectDate(date) {
			this.selectedDate = date
		},
		openSheet(name) { this.sheet = name },
		closeSheet() { this.sheet = '' },
		toggleTag(t) {
			const i = this.data.moodTags.indexOf(t)
			i >= 0 ? this.data.moodTags.splice(i,1) : this.data.moodTags.push(t)
		},
		selectScene(s) {
			this.data.scene = s
			this.closeSheet()
		},
		toggleFinance() {
			this.financeEnabled = true
			this.openSheet('finance')
		},
		saveMeal() {
			if (this.editingMealIndex >= 0) {
				this.meals[this.editingMealIndex] = { ...this.mealDraft }
				this.editingMealIndex = -1
			} else if (this.mealDraft.name || this.mealDraft.type) {
				this.meals.push({ ...this.mealDraft })
			}
			this.mealDraft = { type: '早餐', name: '' }
			this.closeSheet()
		},
		editMeal(i) {
			this.editingMealIndex = i
			this.mealDraft = { ...this.meals[i] }
			this.openSheet('meal')
		},
		saveSnapshot() {
			this.isSaved = true
			uni.showToast({ title: '已记录今日快照', icon: 'success' })
		},
		goHistory() { uni.navigateTo({ url: '/pages/snapshot/history' }) },
		goTrend() { uni.navigateTo({ url: '/pages/snapshot/trend' }) },
	}
}
</script>

<style lang="scss" scoped>
.snapshot-page {
	min-height: 100vh;
	background: #F6F4EC;
	padding: 0 30rpx 60rpx;
}
.page-header {
	display: flex;
	justify-content: space-between;
	align-items: flex-end;
	padding: 20rpx 0 30rpx;
}
.eyebrow { font-size: 20rpx; color: #999; letter-spacing: 2rpx; display: block; }
.page-title { font-size: 44rpx; font-weight: 700; color: #333; display: block; }
.page-date { font-size: 26rpx; color: #999; display: block; margin-top: 6rpx; }
.header-actions { display: flex; gap: 16rpx; }
.icon-btn {
	padding: 10rpx 24rpx;
	background: #fff;
	border-radius: 30rpx;
	&-text { font-size: 24rpx; color: #666; }
}

.week-row {
	display: flex;
	justify-content: space-between;
	background: #fff;
	border-radius: 24rpx;
	padding: 20rpx 16rpx;
	margin-bottom: 24rpx;
}
.week-day {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 12rpx 0;
	border-radius: 16rpx;
	&.active { background: #D8963A; color: #fff; }
	&.selected:not(.active) { background: #f0ebdd; }
}
.week-label { font-size: 22rpx; color: #999; }
.week-day.active .week-label { color: #fff; }
.week-num { font-size: 32rpx; font-weight: 600; color: #333; margin-top: 4rpx; }
.week-day.active .week-num { color: #fff; }

.card {
	background: #fff;
	border-radius: 28rpx;
	padding: 30rpx;
	margin-bottom: 24rpx;
}
.row-card { padding: 24rpx; }

.grid-5 {
	display: flex;
	justify-content: space-between;
}
.grid-item {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 10rpx 4rpx;
}
.grid-icon {
	width: 80rpx;
	height: 80rpx;
}
.grid-label { font-size: 22rpx; color: #999; margin-top: 10rpx; }
.grid-value { font-size: 22rpx; color: #7CAE5A; font-weight: 600; margin-top: 2rpx; min-height: 30rpx; }

.two-col { display: flex; }
.two-item {
	flex: 1;
	display: flex;
	align-items: center;
	gap: 20rpx;
	padding: 10rpx 16rpx;
}
.two-icon { width: 72rpx; height: 72rpx; &.dimmed { opacity: 0.4; } }
.two-text { display: flex; flex-direction: column; }
.two-label { font-size: 22rpx; color: #999; }
.two-value { font-size: 26rpx; color: #333; font-weight: 600; margin-top: 4rpx; &.dimmed-text { color: #bbb; } }

.meal-header {
	display: flex;
	align-items: center;
	gap: 16rpx;
	margin-bottom: 20rpx;
}
.meal-icon { width: 56rpx; height: 56rpx; }
.meal-title { font-size: 28rpx; font-weight: 600; color: #333; }
.meal-hint { font-size: 22rpx; color: #ccc; }
.meal-scroll { white-space: nowrap; }
.meal-list { display: flex; gap: 16rpx; }
.meal-chip {
	flex-shrink: 0;
	background: #f6f4ec;
	border-radius: 20rpx;
	padding: 16rpx 24rpx;
	display: flex;
	flex-direction: column;
	align-items: center;
	min-width: 140rpx;
	&.add { justify-content: center; }
}
.meal-type { font-size: 22rpx; color: #999; }
.meal-name { font-size: 24rpx; color: #333; margin-top: 4rpx; }
.meal-plus { font-size: 40rpx; color: #7CAE5A; }
.meal-empty {
	padding: 30rpx;
	background: #f6f4ec;
	border-radius: 20rpx;
	text-align: center;
}
.meal-empty-text { color: #7CAE5A; font-size: 28rpx; }

.save-btn {
	background: #7CAE5A;
	border-radius: 40rpx;
	padding: 28rpx;
	text-align: center;
	&.saved { background: #f0ebdd; }
}
.save-text { color: #fff; font-size: 30rpx; font-weight: 600; }
.saved .save-text { color: #7CAE5A; }
.history-link { text-align: center; padding: 20rpx; color: #999; font-size: 26rpx; }

/* sheets */
.sheet-mask {
	position: fixed;
	inset: 0;
	background: rgba(0,0,0,0.4);
	z-index: 100;
}
.sheet {
	position: fixed;
	left: 0; right: 0; bottom: 0;
	background: #fff;
	border-radius: 40rpx 40rpx 0 0;
	padding: 20rpx 40rpx 60rpx;
	z-index: 101;
	max-height: 80vh;
	overflow-y: auto;
}
.sheet-handle {
	width: 60rpx;
	height: 8rpx;
	background: #ddd;
	border-radius: 4rpx;
	margin: 0 auto 20rpx;
}
.sheet-title {
	font-size: 32rpx;
	font-weight: 600;
	color: #333;
	display: block;
	text-align: center;
	margin-bottom: 30rpx;
}
.mood-stars {
	display: flex;
	justify-content: space-around;
	margin-bottom: 30rpx;
}
.mood-star {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 10rpx;
	border-radius: 20rpx;
	&.active { background: #f0ebdd; }
}
.mood-face { width: 80rpx; height: 80rpx; }
.mood-num { font-size: 24rpx; color: #999; margin-top: 6rpx; }
.tag-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 16rpx;
	justify-content: center;
	margin-bottom: 30rpx;
}
.mood-tag {
	padding: 12rpx 28rpx;
	background: #f6f4ec;
	border-radius: 30rpx;
	font-size: 24rpx;
	color: #666;
	&.active { background: #7CAE5A; color: #fff; }
}
.weather-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 20rpx;
	justify-content: center;
	margin-bottom: 30rpx;
}
.weather-item {
	width: 140rpx;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 16rpx;
	border-radius: 20rpx;
	&.active { background: #f0ebdd; border: 2rpx solid #7CAE5A; }
}
.weather-img { width: 64rpx; height: 64rpx; }
.weather-name { font-size: 22rpx; color: #666; margin-top: 8rpx; }
.temp-row {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 16rpx;
	margin-bottom: 30rpx;
}
.temp-label { font-size: 28rpx; color: #666; }
.temp-input {
	width: 120rpx;
	text-align: center;
	font-size: 36rpx;
	font-weight: 600;
	border-bottom: 2rpx solid #7CAE5A;
}
.temp-unit { font-size: 28rpx; color: #666; }
.time-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 20rpx 0;
}
.time-label { font-size: 28rpx; color: #666; }
.time-box {
	padding: 16rpx 40rpx;
	background: #f6f4ec;
	border-radius: 16rpx;
	font-size: 36rpx;
	font-weight: 600;
	color: #7CAE5A;
}
.sleep-duration {
	text-align: center;
	font-size: 28rpx;
	color: #333;
	padding: 20rpx 0;
}
.steps-value {
	text-align: center;
	font-size: 48rpx;
	font-weight: 700;
	color: #7CAE5A;
	padding: 20rpx 0;
}
.steps-slider { margin: 20rpx 0 30rpx; }
.scene-list { margin-bottom: 20rpx; }
.scene-item {
	padding: 28rpx;
	border-bottom: 1rpx solid #f0f0f0;
	font-size: 28rpx;
	color: #333;
	text-align: center;
	&.active { color: #7CAE5A; font-weight: 600; }
}
.meal-types {
	display: flex;
	gap: 16rpx;
	justify-content: center;
	margin-bottom: 20rpx;
}
.meal-type {
	padding: 12rpx 28rpx;
	background: #f6f4ec;
	border-radius: 30rpx;
	font-size: 24rpx;
	&.active { background: #7CAE5A; color: #fff; }
}
.meal-input {
	background: #f6f4ec;
	border-radius: 16rpx;
	padding: 24rpx;
	font-size: 28rpx;
	margin-bottom: 30rpx;
}
.fin-row {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 16rpx;
	margin-bottom: 30rpx;
}
.fin-label { font-size: 28rpx; color: #666; }
.fin-input {
	width: 200rpx;
	text-align: center;
	font-size: 40rpx;
	font-weight: 600;
	border-bottom: 2rpx solid #7CAE5A;
}
.sheet-done {
	background: #7CAE5A;
	border-radius: 40rpx;
	padding: 24rpx;
	text-align: center;
	color: #fff;
	font-size: 30rpx;
	font-weight: 600;
	margin-top: 20rpx;
}
</style>
