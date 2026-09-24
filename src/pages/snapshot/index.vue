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
		</view>

		<!-- AI 今日建议（根据心情+睡眠+天气综合） -->
		<view class="ai-card">
			<view class="ai-head">
				<view class="ai-badge">💪 Daily Challenge</view>
			</view>
			<text class="ai-title">{{ aiSuggestion.title }}</text>
			<text class="ai-desc">{{ aiSuggestion.desc }}</text>
			<view class="ai-action" @tap="doAiAction">{{ aiSuggestion.cta }}</view>
		</view>

		<!-- 第一行：5 图标 -->
		<view class="card row-card">
			<view class="grid-5">
				<view class="grid-item" @tap="openSheet('mood')">
					<image class="grid-icon" :src="moodIcon" mode="aspectFit" />
					<text class="grid-label">心情</text>
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

		<!-- 健康设备导入入口 -->
		<view class="device-banner" @tap="goHealthProfile">
			<image class="device-icon" src="/static/snapshot/icons/ic-send.png" mode="aspectFit" />
			<view class="device-text">
				<text class="device-title">健康</text>
				<text class="device-desc">同步步数 / 睡眠 / 心率，查看健康档案</text>
			</view>
			<text class="device-arrow">›</text>
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
			<view class="two-item" @tap="goFinance">
				<image class="two-icon" src="/static/snapshot/icons/ic-cart.png" mode="aspectFit" />
				<view class="two-text">
					<text class="two-label">支出</text>
					<text class="two-value">{{ data.financeAmount ? '¥' + data.financeAmount : '记一笔' }}</text>
				</view>
			</view>
			<view class="two-item" @tap="goFinance">
				<image class="two-icon" src="/static/snapshot/icons/ic-piggy.png" mode="aspectFit" />
				<view class="two-text">
					<text class="two-label">收入</text>
					<text class="two-value">{{ data.incomeAmount ? '¥' + data.incomeAmount : '记一笔' }}</text>
				</view>
			</view>
		</view>

		<!-- 第三行：餐饮 -->
		<view class="card row-card">
			<view class="meal-header">
				<image class="meal-icon" src="/static/snapshot/icons/ic-book.png" mode="aspectFit" />
				<text class="meal-title">今天吃了什么？</text>
			</view>
			<scroll-view scroll-x class="meal-scroll" v-if="meals.length">
				<view class="meal-list">
					<view class="meal-chip" v-for="(m, i) in meals" :key="i" @tap="editMeal(i)">
						<text class="meal-type">{{ m.type }}</text>
						<text class="meal-name">{{ m.name }}</text>
					</view>
					<view class="meal-chip add" @tap="goMeal">
						<text class="meal-plus">+</text>
					</view>
				</view>
			</scroll-view>
			<view class="meal-empty" v-else @tap="goMeal">
				<text class="meal-empty-text">+ 记一餐</text>
			</view>
		</view>

		<!-- 今日挑战（学 Reflectly：根据心情给行动建议） -->
		<view class="card challenge-card" v-if="todayChallenge">
			<view class="challenge-tag">今日挑战</view>
			<text class="challenge-title">{{ todayChallenge.title }}</text>
			<text class="challenge-desc">{{ todayChallenge.desc }}</text>
			<view class="challenge-actions">
				<view class="challenge-btn done" @tap="completeChallenge">已完成 ✓</view>
				<view class="challenge-btn skip" @tap="skipChallenge">跳过</view>
			</view>
		</view>

		<!-- 晨间意向 + 晚间反思（左右两列） -->
		<view class="dual-cards">
			<view class="dual-card" @tap="goMeditation">
				<image class="dual-icon" src="/static/snapshot/weather/weather-sunny.png" mode="aspectFit" />
				<text class="dual-title">晨间意向</text>
				<text class="dual-sub">开始你的一天</text>
			</view>
			<view class="dual-card" @tap="openSheet('evening')">
				<image class="dual-icon" src="/static/snapshot/icons/ic-moon.png" mode="aspectFit" />
				<text class="dual-title">晚间反思</text>
				<text class="dual-sub">反思和放松</text>
			</view>
		</view>

		<!-- 每周系列：今日一问 -->
		<view class="weekly-card">
			<text class="weekly-label">每周系列</text>
			<text class="weekly-question">{{ todayQuestion }}</text>
			<text class="weekly-meta">关于诚实 · 第2天（共7天）</text>
			<view class="weekly-bookmark">
				<text class="bookmark-icon">🔖</text>
			</view>
		</view>

		<!-- 保存按钮（已删除：选完即存） -->

		<!-- 心情弹窗：5×4 = 20 表情 -->
		<view class="sheet-mask" v-if="sheet === 'mood'" @tap="closeSheet"></view>
		<view class="sheet" v-if="sheet === 'mood'">
			<view class="sheet-handle"></view>
			<text class="sheet-title">今天心情怎么样？</text>
			<view class="mood-grid">
				<view
					v-for="m in moodOptions"
					:key="m.name"
					class="mood-cell"
					:class="{ active: data.mood === m.name }"
					@tap="selectMood(m)"
				>
					<image class="mood-img" :src="m.icon" mode="aspectFit" />
					<text class="mood-name">{{ m.label }}</text>
				</view>
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

		<!-- 今日所在弹窗 -->
		<view class="sheet-mask" v-if="sheet === 'scene'" @tap="closeSheet"></view>
		<view class="sheet location-sheet" v-if="sheet === 'scene'">
			<view class="sheet-handle"></view>
			<view class="loc-header">
				<text class="loc-title">今日所在</text>
				<view class="loc-close" @tap="closeSheet">✕</view>
			</view>
			<text class="loc-desc">选择后确认保存到当天记录</text>

			<view class="loc-current">
				<view class="loc-current-head">
					<view class="loc-dot green"></view>
					<text class="loc-current-label">当前选择</text>
					<text class="loc-current-status">{{ data.scene || '尚未填写' }}</text>
				</view>
				<view class="loc-input-row">
					<view class="loc-input-box">
						<text class="loc-input">{{ data.scene || '点击填写所在位置' }}</text>
						<text class="loc-input-hint">可以定位获取，也可以手动填写</text>
					</view>
					<view class="loc-edit-btn">✏️</view>
				</view>
				<view class="loc-relocate" @tap="relocate">📍 重新定位当前位置</view>
			</view>

			<view class="loc-fav-head">
				<text class="loc-fav-title">常用地址 <text class="loc-fav-count">0 个</text></text>
				<text class="loc-fav-add" @tap="addFav">+ 新增</text>
			</view>
			<view class="loc-fav-empty">
				<text class="loc-fav-empty-title">还没有常用地址</text>
				<text class="loc-fav-empty-desc">新增后，每天选择位置会更快</text>
				<view class="loc-pin">📍</view>
			</view>

			<view class="loc-actions">
				<view class="loc-confirm" @tap="confirmScene">确认位置</view>
				<view class="loc-cancel" @tap="closeSheet">取消</view>
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

		<!-- 支出弹窗 -->
		<view class="sheet-mask" v-if="sheet === 'finance-expense'" @tap="closeSheet"></view>
		<view class="sheet" v-if="sheet === 'finance-expense'">
			<view class="sheet-handle"></view>
			<text class="sheet-title">今天花了多少？</text>
			<view class="fin-row">
				<text class="fin-label">¥</text>
				<input class="fin-input" type="digit" v-model="data.financeAmount" placeholder="0" />
			</view>
			<view class="tag-grid">
				<view
					v-for="c in ['餐饮','交通','购物','居家','其他']"
					:key="c"
					class="mood-tag"
					:class="{ active: data.financeCategory === c }"
					@tap="data.financeCategory = c"
				>{{ c }}</view>
			</view>
			<view class="sheet-done" @tap="closeSheet">完成</view>
		</view>

		<!-- 收入弹窗 -->
		<view class="sheet-mask" v-if="sheet === 'finance-income'" @tap="closeSheet"></view>
		<view class="sheet" v-if="sheet === 'finance-income'">
			<view class="sheet-handle"></view>
			<text class="sheet-title">今天收入多少？</text>
			<view class="fin-row">
				<text class="fin-label">¥</text>
				<input class="fin-input" type="digit" v-model="data.incomeAmount" placeholder="0" />
			</view>
			<view class="tag-grid">
				<view
					v-for="c in ['工资','副业','红包','其他']"
					:key="c"
					class="mood-tag"
					:class="{ active: data.incomeCategory === c }"
					@tap="data.incomeCategory = c"
				>{{ c }}</view>
			</view>
			<view class="sheet-done" @tap="closeSheet">完成</view>
		</view>
	</view>
</template>

import { getTodaySnapshot, updateTodaySnapshot } from '@/api/snapshot';

<script>
const E = '/static/snapshot/emotions/'
export default {
	data() {
		return {
			statusBarHeight: 20,
			sheet: '',
			mealDraft: { type: '早餐', name: '' },
			editingMealIndex: -1,
			data: {
				mood: '',
				weatherCode: '',
				weatherTemp: '',
				steps: 0,
				bedtime: '23:00',
				wakeTime: '07:00',
				scene: '',
				financeAmount: '',
				financeCategory: '',
				incomeAmount: '',
				incomeCategory: '',
				morningIntent: '',
				answer: '',
			},
			meals: [],
			moodOptions: [
				{ name: 'super', label: '超棒', icon: E+'mood-super.png' },
				{ name: 'happy', label: '开心', icon: E+'mood-happy.png' },
				{ name: 'moved', label: '感动', icon: E+'mood-moved.png' },
				{ name: 'heart', label: '心动', icon: E+'mood-heart.png' },
				{ name: 'calm', label: '平静', icon: E+'mood-calm.png' },
				{ name: 'cozy', label: '舒服', icon: E+'mood-cozy.png' },
				{ name: 'speechless', label: '无语', icon: E+'mood-speechless.png' },
				{ name: 'lost', label: '迷茫', icon: E+'mood-lost.png' },
				{ name: 'bored', label: '无聊', icon: E+'mood-bored.png' },
				{ name: 'tired', label: '疲惫', icon: E+'mood-tired.png' },
				{ name: 'irritated', label: '烦躁', icon: E+'mood-irritated.png' },
				{ name: 'unhappy', label: '低落', icon: E+'mood-unhappy.png' },
				{ name: 'scared', label: '害怕', icon: E+'mood-scared.png' },
				{ name: 'shock', label: '震惊', icon: E+'mood-shock.png' },
				{ name: 'surprise', label: '惊讶', icon: E+'mood-surprise.png' },
				{ name: 'terrible', label: '糟糕', icon: E+'mood-terrible.png' },
				{ name: 'unwell', label: '难受', icon: E+'mood-unwell.png' },
				{ name: 'angry', label: '生气', icon: E+'mood-angry.png' },
				{ name: 'worried', label: '焦虑', icon: E+'mood-worried.png' },
				{ name: 'wronged', label: '委屈', icon: E+'mood-wronged.png' },
			],
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
			questions: [
				'你可以对谁最轻松地做到完全诚实？',
				'今天哪一刻你觉得最像自己？',
				'如果明天醒来所有问题都消失了，你会先做什么？',
				'最近什么事一直在你脑子里打转？',
				'你最近一次真心笑是什么时候？',
			],
		}
	},
	computed: {
		todayLabel() {
			const d = new Date()
			const wd = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]
			return `${d.getMonth()+1}月${d.getDate()}日 ${wd}`
		},
		moodIcon() {
			const m = this.moodOptions.find(x => x.name === this.data.mood)
			return m ? m.icon : '/static/snapshot/icons/ic-mood.png'
		},
		weatherIcon() {
			const w = this.weatherOptions.find(x => x.code === this.data.weatherCode)
			return w ? w.icon : '/static/snapshot/icons/ic-sun.png'
		},
		sceneLabel() { return this.data.scene },
		sleepHours() {
			if (!this.data.bedtime || !this.data.wakeTime) return '—'
			const [bh,bm] = this.data.bedtime.split(':').map(Number)
			const [wh,wm] = this.data.wakeTime.split(':').map(Number)
			let h = wh - bh; if (h < 0) h += 24
			return (h + (wm-bm)/60).toFixed(1)
		},
		todayQuestion() {
			const i = new Date().getDate() % this.questions.length
			return this.questions[i]
		},
		// AI 综合建议（心情+睡眠+天气）
		aiSuggestion() {
			const m = this.data.mood
			const sl = parseFloat(this.sleepHours) || 0
			const w = this.data.weatherCode
			// 睡眠不足
			if (sl && sl < 6) return { title: '昨晚睡得不够', desc: `只睡了 ${sl} 小时，今天先别排硬任务，中午补 20 分钟觉，喝够水。`, cta: '好，今晚早睡' }
			// 情绪低落
			if (m === 'unhappy' || m === 'terrible' || m === 'angry' || m === 'irritated') {
				if (w === 'light-rain' || w === 'heavy-rain') return { title: '雨天适合内观', desc: '外面下雨、心情也低，正好泡杯热饮，写 3 句现在的感受，不用评判。', cta: '去写几句' }
				return { title: '身体先松开', desc: '情绪低的时候，先动身体。出门走 15 分钟，或者做 5 分钟拉伸，让身体先松开。', cta: '去散步' }
			}
			// 好心情
			if (m === 'super' || m === 'happy') return { title: '趁好心情做点重要的事', desc: '能量高的时候适合推进困难项，选一件你一直拖着的事，做 25 分钟。', cta: '开始 25 分钟' }
			// 平静
			if (m === 'calm' || m === 'cozy') return { title: '记录此刻的舒适', desc: '什么让你觉得舒服？写下来，下次低谷时翻出来看。', cta: '写下来' }
			// 默认
			return { title: '从一件小事开始', desc: '今天先做一件让自己舒服的事：喝杯温水、深呼吸 3 次，或出门晒 2 分钟太阳。', cta: '现在就做' }
		},
		// 根据心情给行动建议（学 Reflectly CBT 引导）
		todayChallenge() {
			if (!this.data.mood) return null
			const map = {
				super:    { title: '把这份好心情传出去', desc: '给一个人发句暖心的话，或记录一件值得记住的事' },
				happy:    { title: '趁好心情做点小事', desc: '整理桌面、散步 10 分钟，或给朋友发条消息' },
				calm:     { title: '试着再慢一点', desc: '做 3 次深呼吸，感受此刻，不评判' },
				cozy:     { title: '记录此刻的舒适', desc: '什么让你觉得舒服？写下来，下次需要时翻出来' },
				tired:    { title: '今天先照顾自己', desc: '早睡 30 分钟，或放下一件可做可不做的事' },
				unhappy:  { title: '动一动身体', desc: '出门走 15 分钟，或做 5 分钟拉伸，让身体先松开' },
				irritated:{ title: '给情绪一个出口', desc: '写下让你烦躁的事，然后做一次深呼吸' },
				terrible: { title: '不要硬撑', desc: '告诉一个信任的人今天不好，或只是允许自己难过一会儿' },
				angry:    { title: '离开触发源', desc: '走开 10 分钟，喝点水，等这股劲过去再决定' },
				worried:  { title: '把担心写下来', desc: '写下你最怕发生什么，再写一句"最坏情况我能怎么办"' },
				scared:   { title: '做一件让你有掌控感的事', desc: '整理一个小角落、列个清单，从微小的确定感开始' },
			}
			return map[this.data.mood] || { title: '记录此刻', desc: '不管什么感觉，写下来就是觉察的开始' }
		},
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
		this.loadToday()
	},
	methods: {
		async loadToday() {
			try {
				const res = await getTodaySnapshot()
				if (res.snapshot) {
					this.data.mood = res.snapshot.mood || ''
					this.data.weatherCode = res.snapshot.weather_code || ''
					this.data.weatherTemp = res.snapshot.weather_temp || ''
					this.data.steps = res.snapshot.steps || 0
					this.data.bedtime = res.snapshot.bedtime || '23:00'
					this.data.wakeTime = res.snapshot.wake_time || '07:00'
					this.data.scene = res.snapshot.scene || ''
					this.data.financeAmount = res.snapshot.expense_amount || ''
					this.data.financeCategory = res.snapshot.expense_category || ''
					this.data.incomeAmount = res.snapshot.income_amount || ''
					this.data.incomeCategory = res.snapshot.income_category || ''
					this.data.morningIntent = res.snapshot.morning_intent || ''
				}
				if (res.meals) this.meals = res.meals
			} catch (e) { /* mock mode */ }
		},
		async sync(patch) {
			try { await updateTodaySnapshot(patch) } catch (e) {}
		},
		openSheet(n) { this.sheet = n },
		closeSheet() { this.sheet = '' },
		selectMood(m) { this.data.mood = m.name; this.sync({ mood: m.name }) },
		selectScene(s) { this.data.scene = s; this.closeSheet(); this.sync({ scene: s }) },
		relocate() { uni.showToast({ title: '定位中…', icon: 'none' }) },
		addFav() {},
		confirmScene() { this.closeSheet(); uni.showToast({ title: '已保存位置', icon: 'success' }) },
		goHealthProfile() { uni.showToast({ title: '健康档案页开发中', icon: 'none' }) },
		goFinance() { uni.navigateTo({ url: '/pages/snapshot/finance' }) },
		goMeal() { uni.navigateTo({ url: '/pages/snapshot/meal' }) },
		goMeditation() { uni.navigateTo({ url: '/pages/snapshot/meditation' }) },
		doAiAction() { uni.showToast({ title: '已加入今日计划', icon: 'success' }) },
		completeChallenge() { uni.showToast({ title: '已完成，真棒', icon: 'success' }) },
		skipChallenge() {},
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
			uni.navigateTo({url:"/pages/snapshot/meal"})
		},
	}
}
</script>

<style lang="scss" scoped>
.snapshot-page { min-height: 100vh; background: #f1f8e9; padding: 0 30rpx 60rpx; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; padding: 20rpx 0 30rpx; }
.eyebrow { font-size: 20rpx; color: #999; letter-spacing: 2rpx; display: block; }
.page-title { font-size: 44rpx; font-weight: 700; color: #333; display: block; }
.page-date { font-size: 26rpx; color: #999; display: block; margin-top: 6rpx; }

.card { background: #fff; border-radius: 28rpx; padding: 30rpx; margin-bottom: 24rpx; }
.row-card { padding: 24rpx; }
.grid-5 { display: flex; justify-content: space-between; }
.grid-item { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 10rpx 4rpx; }
.grid-icon { width: 80rpx; height: 80rpx; }
.grid-label { font-size: 22rpx; color: #999; margin-top: 10rpx; }
.grid-value { font-size: 22rpx; color: #7CAE5A; font-weight: 600; margin-top: 2rpx; min-height: 30rpx; }

.device-banner {
	display: flex; align-items: center; gap: 20rpx;
	background: #fff; border-radius: 24rpx; padding: 24rpx 28rpx; margin-bottom: 24rpx;
}
.device-icon { width: 56rpx; height: 56rpx; }
.device-text { flex: 1; display: flex; flex-direction: column; }
.device-title { font-size: 28rpx; font-weight: 600; color: #333; }
.device-desc { font-size: 22rpx; color: #999; margin-top: 4rpx; }
.device-arrow { font-size: 40rpx; color: #ccc; }

.two-col { display: flex; }
.two-item { flex: 1; display: flex; align-items: center; gap: 20rpx; padding: 10rpx 16rpx; }
.two-icon { width: 72rpx; height: 72rpx; &.dimmed { opacity: 0.4; } }
.two-text { display: flex; flex-direction: column; }
.two-label { font-size: 22rpx; color: #999; }
.two-value { font-size: 26rpx; color: #333; font-weight: 600; margin-top: 4rpx; &.dimmed-text { color: #bbb; } }

.meal-header { display: flex; align-items: center; gap: 16rpx; margin-bottom: 20rpx; }
.meal-icon { width: 56rpx; height: 56rpx; }
.meal-title { font-size: 28rpx; font-weight: 600; color: #333; }
.meal-scroll { white-space: nowrap; }
.meal-list { display: flex; gap: 16rpx; }
.meal-chip { flex-shrink: 0; background: #e8f0e3; border-radius: 20rpx; padding: 16rpx 24rpx; display: flex; flex-direction: column; align-items: center; min-width: 140rpx; &.add { justify-content: center; } }
.meal-type { font-size: 22rpx; color: #999; }
.meal-name { font-size: 24rpx; color: #333; margin-top: 4rpx; }
.meal-plus { font-size: 40rpx; color: #7CAE5A; }
.meal-empty { padding: 30rpx; background: #e8f0e3; border-radius: 20rpx; text-align: center; }
.meal-empty-text { color: #7CAE5A; font-size: 28rpx; }

/* challenge / intent / question cards */
.challenge-tag { display: inline-block; font-size: 20rpx; color: #D8963A; background: #fdf3e3; padding: 6rpx 16rpx; border-radius: 20rpx; margin-bottom: 16rpx;
	&.green { color: #7CAE5A; background: #eef5e6; }
	&.purple { color: #9b7ebd; background: #f0eaf7; }
}
.challenge-title { font-size: 30rpx; font-weight: 600; color: #333; display: block; }
.challenge-desc { font-size: 24rpx; color: #888; display: block; margin-top: 10rpx; line-height: 1.6; }
.challenge-actions { display: flex; gap: 16rpx; margin-top: 24rpx; }
.challenge-btn { flex: 1; text-align: center; padding: 18rpx; border-radius: 30rpx; font-size: 26rpx;
	&.done { background: #7CAE5A; color: #fff; }
	&.skip { background: #f0ebdd; color: #999; }
}
.intent-input { margin-top: 20rpx; background: #e8f0e3; border-radius: 16rpx; padding: 20rpx; font-size: 26rpx; }
.intent-text { font-size: 28rpx; color: #7CAE5A; font-weight: 600; }
.intent-edit { font-size: 22rpx; color: #999; margin-top: 10rpx; display: block; }
.question-text { font-size: 28rpx; color: #555; line-height: 1.6; display: block; }

.ai-card {
	background: linear-gradient(135deg, #fff8ec 0%, #fff 60%);
	border: 2rpx solid #fdebd0; border-radius: 28rpx; padding: 30rpx; margin-bottom: 24rpx;
}
.ai-head { margin-bottom: 16rpx; }
.ai-badge { display: inline-block; font-size: 22rpx; color: #D8963A; background: #fdf3e3; padding: 6rpx 16rpx; border-radius: 20rpx; }
.ai-title { font-size: 30rpx; font-weight: 700; color: #333; display: block; }
.ai-desc { font-size: 24rpx; color: #888; line-height: 1.6; display: block; margin-top: 10rpx; }
.ai-action { display: inline-block; margin-top: 20rpx; background: #D8963A; color: #fff; font-size: 24rpx; padding: 14rpx 32rpx; border-radius: 30rpx; }

.dual-cards { display: flex; gap: 20rpx; margin-bottom: 24rpx; }
.dual-card {
	flex: 1; background: #fff; border-radius: 28rpx; padding: 40rpx 20rpx;
	display: flex; flex-direction: column; align-items: center;
}
.dual-icon { width: 90rpx; height: 90rpx; margin-bottom: 20rpx; }
.dual-title { font-size: 32rpx; font-weight: 700; color: #333; }
.dual-sub { font-size: 24rpx; color: #999; margin-top: 8rpx; }

.weekly-card {
	background: #fff; border-radius: 28rpx; padding: 50rpx 40rpx;
	display: flex; flex-direction: column; align-items: center; margin-bottom: 24rpx;
}
.weekly-label { font-size: 24rpx; color: #999; letter-spacing: 4rpx; margin-bottom: 30rpx; }
.weekly-question { font-size: 36rpx; font-weight: 600; color: #333; text-align: center; line-height: 1.5; }
.weekly-meta { font-size: 24rpx; color: #999; margin-top: 24rpx; }
.weekly-bookmark { margin-top: 30rpx; }
.bookmark-icon { font-size: 40rpx; }

/* sheets */
.sheet-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; }
.sheet { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-radius: 40rpx 40rpx 0 0; padding: 20rpx 40rpx 60rpx; z-index: 101; max-height: 85vh; overflow-y: auto; }
.sheet-handle { width: 60rpx; height: 8rpx; background: #ddd; border-radius: 4rpx; margin: 0 auto 20rpx; }
.sheet-title { font-size: 32rpx; font-weight: 600; color: #333; display: block; text-align: center; margin-bottom: 30rpx; }

/* 20 mood grid */
.mood-grid { display: flex; flex-wrap: wrap; gap: 12rpx; justify-content: space-between; margin-bottom: 30rpx; }
.mood-cell { width: 20%; display: flex; flex-direction: column; align-items: center; padding: 12rpx 4rpx; border-radius: 20rpx; &.active { background: #f0ebdd; } }
.mood-img { width: 80rpx; height: 80rpx; }
.mood-name { font-size: 20rpx; color: #888; margin-top: 6rpx; }

.weather-grid { display: flex; flex-wrap: wrap; gap: 20rpx; justify-content: center; margin-bottom: 30rpx; }
.weather-item { width: 140rpx; display: flex; flex-direction: column; align-items: center; padding: 16rpx; border-radius: 20rpx; &.active { background: #f0ebdd; border: 2rpx solid #7CAE5A; } }
.weather-img { width: 64rpx; height: 64rpx; }
.weather-name { font-size: 22rpx; color: #666; margin-top: 8rpx; }
.temp-row { display: flex; align-items: center; justify-content: center; gap: 16rpx; margin-bottom: 30rpx; }
.temp-label { font-size: 28rpx; color: #666; }
.temp-input { width: 120rpx; text-align: center; font-size: 36rpx; font-weight: 600; border-bottom: 2rpx solid #7CAE5A; }
.temp-unit { font-size: 28rpx; color: #666; }
.time-row { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 0; }
.time-label { font-size: 28rpx; color: #666; }
.time-box { padding: 16rpx 40rpx; background: #e8f0e3; border-radius: 16rpx; font-size: 36rpx; font-weight: 600; color: #7CAE5A; }
.sleep-duration { text-align: center; font-size: 28rpx; color: #333; padding: 20rpx 0; }
.steps-value { text-align: center; font-size: 48rpx; font-weight: 700; color: #7CAE5A; padding: 20rpx 0; }
.steps-slider { margin: 20rpx 0 30rpx; }
.location-sheet { padding-bottom: 40rpx; }
.loc-header { display: flex; justify-content: space-between; align-items: center; padding: 10rpx 0; }
.loc-title { font-size: 36rpx; font-weight: 700; color: #333; }
.loc-close { width: 56rpx; height: 56rpx; border-radius: 50%; background: #f0f0f0; text-align: center; line-height: 56rpx; color: #999; }
.loc-desc { font-size: 24rpx; color: #999; display: block; margin: 10rpx 0 24rpx; }
.loc-current { background: #f5faf3; border-radius: 20rpx; padding: 24rpx; margin-bottom: 30rpx; }
.loc-current-head { display: flex; align-items: center; }
.loc-dot { width: 14rpx; height: 14rpx; border-radius: 50%; margin-right: 10rpx;
	&.green { background: #7CAE5A; } }
.loc-current-label { font-size: 26rpx; color: #333; }
.loc-current-status { font-size: 26rpx; color: #7CAE5A; margin-left: auto; }
.loc-input-row { display: flex; align-items: center; gap: 16rpx; margin-top: 20rpx; }
.loc-input-box { flex: 1; }
.loc-input { font-size: 34rpx; font-weight: 600; color: #333; display: block; }
.loc-input-hint { font-size: 22rpx; color: #999; display: block; margin-top: 8rpx; }
.loc-edit-btn { width: 64rpx; height: 64rpx; background: #fdebd0; border-radius: 16rpx; text-align: center; line-height: 64rpx; }
.loc-relocate { font-size: 26rpx; color: #7CAE5A; margin-top: 20rpx; display: block; }
.loc-fav-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.loc-fav-title { font-size: 30rpx; font-weight: 600; color: #333; }
.loc-fav-count { font-size: 24rpx; color: #bbb; font-weight: 400; }
.loc-fav-add { font-size: 26rpx; color: #7CAE5A; }
.loc-fav-empty { border: 2rpx dashed #e0e0e0; border-radius: 20rpx; padding: 40rpx; display: flex; flex-direction: column; align-items: center; position: relative; }
.loc-fav-empty-title { font-size: 30rpx; color: #999; }
.loc-fav-empty-desc { font-size: 22rpx; color: #bbb; margin-top: 10rpx; }
.loc-pin { font-size: 80rpx; margin-top: 20rpx; opacity: 0.5; }
.loc-actions { display: flex; gap: 20rpx; margin-top: 30rpx; }
.loc-confirm { flex: 2; background: #e8f5e9; color: #7CAE5A; text-align: center; padding: 26rpx; border-radius: 40rpx; font-size: 30rpx; font-weight: 600; }
.loc-cancel { flex: 1; background: #f0f0f0; color: #999; text-align: center; padding: 26rpx; border-radius: 40rpx; font-size: 30rpx; }
.meal-types { display: flex; gap: 16rpx; justify-content: center; margin-bottom: 20rpx; }
.meal-type { padding: 12rpx 28rpx; background: #e8f0e3; border-radius: 30rpx; font-size: 24rpx; &.active { background: #7CAE5A; color: #fff; } }
.meal-input { background: #e8f0e3; border-radius: 16rpx; padding: 24rpx; font-size: 28rpx; margin-bottom: 30rpx; }
.fin-row { display: flex; align-items: center; justify-content: center; gap: 16rpx; margin-bottom: 30rpx; }
.fin-label { font-size: 28rpx; color: #666; }
.fin-input { width: 200rpx; text-align: center; font-size: 40rpx; font-weight: 600; border-bottom: 2rpx solid #7CAE5A; }
.tag-grid { display: flex; flex-wrap: wrap; gap: 16rpx; justify-content: center; margin-bottom: 30rpx; }
.mood-tag { padding: 12rpx 28rpx; background: #e8f0e3; border-radius: 30rpx; font-size: 24rpx; color: #666; &.active { background: #7CAE5A; color: #fff; } }
.sheet-done { background: #7CAE5A; border-radius: 40rpx; padding: 24rpx; text-align: center; color: #fff; font-size: 30rpx; font-weight: 600; margin-top: 20rpx; }
</style>
