<template>
	<view class="snapshot-page">
		<view class="snapshot-hero" :style="{ paddingTop: (statusBarHeight + 10) + 'px' }">
			<image class="snapshot-hero-art" src="/static/images/shroom-snapshot-hero-art-v2.webp" mode="aspectFill" aria-hidden="true" />
			<view class="hero-brand">
				<image class="hero-logo" src="/static/icons/tab-shroom-filled.svg" mode="aspectFit" />
				<view class="hero-brand-copy">
					<text class="hero-brand-name">SHROOM</text>
					<text class="hero-brand-line">把生活的碎片，变成闪闪发光的故事。</text>
				</view>
			</view>
			<view class="hero-heading">
				<text class="hero-kicker">DAILY SNAPSHOT</text>
				<text class="hero-title">今日快照</text>
				<text class="hero-date">{{ todayLabel }}</text>
			</view>
			<view class="hero-note"><text>生活再小的片段，</text><text>也是闪闪发光的。</text></view>
			<view class="history-entry" @tap="goHistory">历史 ›</view>
		</view>

		<view class="snapshot-content">
			<view class="challenge-panel">
				<image class="challenge-art" src="/static/images/shroom-snapshot-mug-v1.webp" mode="aspectFit" aria-hidden="true" />
				<view class="challenge-copy">
					<view class="challenge-label">💪 Daily Challenge</view>
					<text class="challenge-title">{{ aiSuggestion.title }}</text>
					<text class="challenge-desc">{{ aiSuggestion.desc }}</text>
					<view class="challenge-cta" @tap="doAiAction">{{ aiSuggestion.cta }} <text>→</text></view>
				</view>
				<view class="challenge-note"><text>小小的行动，</text><text>也是一种成长。</text></view>
			</view>

			<view class="state-panel">
				<view class="state-item" @tap="openSheet('mood')">
					<image class="state-icon" :src="moodIcon" mode="aspectFit" />
					<text class="state-label">心情</text>
					<text class="state-value">{{ moodLabel }}</text>
				</view>
				<view class="state-item" @tap="openSheet('weather')">
					<image class="state-icon" :src="weatherIcon" mode="aspectFit" />
					<text class="state-label">天气</text>
					<text class="state-value">{{ weatherLabel }}</text>
				</view>
				<view class="state-item" @tap="openSheet('steps')">
					<image class="state-icon" src="/static/snapshot/icons/ic-steps.png" mode="aspectFit" />
					<text class="state-label">步数</text>
					<text class="state-value">{{ data.steps ? data.steps.toLocaleString() : '未记录' }}</text>
				</view>
				<view class="state-item" @tap="openSleepSheet('bedtime')">
					<image class="state-icon" src="/static/snapshot/icons/ic-moon.png" mode="aspectFit" />
					<text class="state-label">入睡</text>
					<text class="state-value">{{ data.bedtime || '未记录' }}</text>
				</view>
				<view class="state-item" @tap="openSleepSheet('wakeTime')">
					<image class="state-icon" src="/static/snapshot/icons/ic-wake.png" mode="aspectFit" />
					<text class="state-label">起床</text>
					<text class="state-value">{{ data.wakeTime || '未记录' }}</text>
				</view>
			</view>

			<view class="health-panel" @tap="goHealthProfile">
				<image class="health-landscape" src="/static/images/shroom-snapshot-health-landscape-v1.webp" mode="aspectFill" aria-hidden="true" />
				<view class="round-icon health-icon"><image src="/static/snapshot/icons/ic-send.png" mode="aspectFit" /></view>
				<view class="module-copy">
					<text class="module-title">健康</text>
					<text class="module-subtitle">查看亲自记录的步数与睡眠</text>
				</view>
				<text class="health-note">身体是探索世界的本钱。</text>
				<text class="module-arrow">›</text>
			</view>

			<view class="life-panel">
				<view class="life-item" @tap="openSheet('scene')">
					<image class="life-icon" src="/static/snapshot/icons/ic-location.png" mode="aspectFit" />
					<view class="life-copy"><text>场景</text><text class="life-value">{{ sceneLabel || '在哪里？' }}</text></view>
					<text class="life-arrow">›</text>
				</view>
				<view class="life-item" @tap="goFinance">
					<image class="life-icon" src="/static/snapshot/icons/ic-cart.png" mode="aspectFit" />
					<view class="life-copy"><text>支出</text><text class="life-value">{{ data.financeAmount ? '¥' + data.financeAmount : '记一笔' }}</text></view>
					<text class="life-arrow">›</text>
				</view>
				<view class="life-item" @tap="goFinance">
					<image class="life-icon" src="/static/snapshot/icons/ic-piggy.png" mode="aspectFit" />
					<view class="life-copy"><text>收入</text><text class="life-value">{{ data.incomeAmount ? '¥' + data.incomeAmount : '记一笔' }}</text></view>
					<text class="life-arrow">›</text>
				</view>
			</view>

			<view class="meal-panel" @tap="goMeal">
				<image class="meal-art" src="/static/images/shroom-snapshot-meal-art-v1.webp" mode="aspectFill" aria-hidden="true" />
				<view class="round-icon meal-round"><text>♧</text></view>
				<view class="module-copy meal-copy">
					<text class="module-title">今天吃了什么？</text>
					<text class="module-subtitle">{{ mealSummary }}</text>
				</view>
				<text class="module-arrow">›</text>
			</view>

			<view class="meditation-panel" @tap="goMeditation">
				<view class="meditation-orbit"><view class="meditation-core"></view></view>
				<view class="module-copy">
					<text class="module-title">晨间冥想</text>
					<text class="module-subtitle">{{ meditationSummary }}</text>
				</view>
				<text class="module-arrow">›</text>
			</view>
		</view>

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
		<view class="sheet sleep-sheet" v-if="sheet === 'sleep'">
			<view class="sheet-handle"></view>
			<text class="sheet-title">昨晚睡眠</text>
			<view class="sleep-time-tabs">
				<view class="sleep-time-tab" :class="{ active: sleepEditingField === 'bedtime' }" @tap="switchSleepField('bedtime')">
					<text class="sleep-time-label">入睡</text>
					<text class="sleep-time-value" data-testid="snapshot-bedtime-value">{{ data.bedtime || '23:00' }}</text>
				</view>
				<view class="sleep-time-tab" :class="{ active: sleepEditingField === 'wakeTime' }" @tap="switchSleepField('wakeTime')">
					<text class="sleep-time-label">起床</text>
					<text class="sleep-time-value" data-testid="snapshot-wake-time-value">{{ data.wakeTime || '07:00' }}</text>
				</view>
			</view>
			<picker-view class="sleep-picker" :value="sleepPickerValue" indicator-style="height: 96rpx;" @change="onSleepPickerChange">
				<picker-view-column>
					<view class="sleep-picker-item" v-for="hour in sleepHourOptions" :key="hour">{{ hour }} 时</view>
				</picker-view-column>
				<picker-view-column>
					<view class="sleep-picker-item" v-for="minute in sleepMinuteOptions" :key="minute">{{ minute }} 分</view>
				</picker-view-column>
			</picker-view>
			<view class="sleep-duration">睡眠时长：{{ sleepHours }} 小时</view>
			<view class="sleep-trend-entry" @tap="goSleepTrend">
				<text>查看睡眠趋势</text>
				<text>›</text>
			</view>
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
					<input class="loc-input" v-model="data.scene" maxlength="48" placeholder="填写所在位置" />
					<text class="loc-input-hint">可以选点获取，也可以手动填写</text>
					</view>
					<view class="loc-edit-btn">✏️</view>
				</view>
				<view class="loc-relocate" @tap="relocate">📍 重新定位当前位置</view>
			</view>
			<view class="scene-options">
				<view
					v-for="option in sceneOptions"
					:key="option"
					class="scene-option"
					:class="{ active: data.scene === option }"
					@tap="data.scene = option"
				>{{ option }}</view>
			</view>

			<view class="loc-fav-head">
				<text class="loc-fav-title">常用地址 <text class="loc-fav-count">{{ places.length }} 个</text></text>
				<text class="loc-fav-add" @tap="addFav">+ 新增</text>
			</view>
			<view v-if="places.length" class="scene-options">
				<view v-for="place in places" :key="place.id" class="scene-option" :class="{ active: data.scene === place.label }" @tap="data.scene = place.label">{{ place.label }}</view>
			</view>
			<view v-else class="loc-fav-empty">
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

<script>
import { addSnapshotPlace, getSnapshotPlaces, getTodaySnapshot, updateTodaySnapshot } from '@/api/snapshot';
import { todoCreate } from '@/api/todo';
const E = '/static/snapshot/emotions/'
export default {
	data() {
		return {
			statusBarHeight: 20,
			sheet: '',
			mealDraft: { type: '早餐', name: '' },
			editingMealIndex: -1,
			sleepEditingField: 'bedtime',
			sleepPickerValue: [23, 0],
			sleepHourOptions: Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')),
			sleepMinuteOptions: ['00','05','10','15','20','25','30','35','40','45','50','55'],
			data: {
				mood: '',
				weatherCode: '',
				weatherTemp: '',
				steps: 0,
				bedtime: '',
				wakeTime: '',
				scene: '',
				financeAmount: '',
				financeCategory: '',
				incomeAmount: '',
				incomeCategory: '',
				morningIntent: '',
				answer: '',
				},
				meals: [],
			meditations: [],
			places: [],
			challengeCompleted: false,
			challengeSkipped: false,
			challengeTitle: '',
			challengeTodoId: '',
			savingAction: false,
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
		moodLabel() {
			const mood = this.moodOptions.find(item => item.name === this.data.mood)
			return mood ? mood.label : '未记录'
		},
		weatherLabel() {
			const weather = this.weatherOptions.find(item => item.code === this.data.weatherCode)
			if (!weather && !this.data.weatherTemp) return '未记录'
			return [weather ? weather.name : '', this.data.weatherTemp !== '' ? `${this.data.weatherTemp}°` : ''].filter(Boolean).join(' ')
		},
			mealSummary() {
			if (!this.meals.length) return '记录一日三餐，关注饮食与能量'
			const labels = this.meals.slice(0, 3).map(meal => meal.name || meal.type).filter(Boolean)
				return labels.length ? labels.join(' · ') : '查看今天的饮食记录'
			},
			meditationSummary() {
				if (!this.meditations.length) return '选择 1–5 分钟，完整结束后记入今日'
				const minutes = this.meditations.reduce((total, item) => total + (Number(item.duration_min) || 0), 0)
				return `今日已完成 ${minutes} 分钟 · ${this.meditations.length} 次`
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
	},
	onShow() { this.loadToday() },
	methods: {
		async loadToday() {
			try {
				const [res, placeResponse] = await Promise.all([getTodaySnapshot(), getSnapshotPlaces()])
				const payload = res.data || res
				const placePayload = placeResponse.data || placeResponse
				this.places = Array.isArray(placePayload.places) ? placePayload.places : []
				if (payload.snapshot) {
					this.data.mood = payload.snapshot.mood || ''
					this.data.weatherCode = payload.snapshot.weather_code || ''
					this.data.weatherTemp = payload.snapshot.weather_temp === null || payload.snapshot.weather_temp === undefined ? '' : payload.snapshot.weather_temp
					this.data.steps = payload.snapshot.steps || 0
					this.data.bedtime = payload.snapshot.bedtime || ''
					this.data.wakeTime = payload.snapshot.wake_time || ''
					this.data.scene = payload.snapshot.scene || ''
					this.data.financeAmount = payload.snapshot.expense_amount || ''
					this.data.financeCategory = payload.snapshot.expense_category || ''
					this.data.incomeAmount = payload.snapshot.income_amount || ''
					this.data.incomeCategory = payload.snapshot.income_category || ''
					this.data.morningIntent = payload.snapshot.morning_intent || ''
					this.challengeCompleted = !!payload.snapshot.challenge_completed
					this.challengeSkipped = !!payload.snapshot.challenge_skipped
					this.challengeTitle = payload.snapshot.challenge_title || ''
					this.challengeTodoId = payload.snapshot.challenge_todo_id || ''
				}
					if (payload.meals) this.meals = payload.meals.map(meal => ({ ...meal, type: meal.meal_type }))
					if (payload.meditations) this.meditations = payload.meditations
			} catch (e) { uni.showToast({ title: e.message || '今日快照读取失败', icon: 'none' }) }
		},
		async sync(patch) {
			try { await updateTodaySnapshot(patch); return true } catch (e) { uni.showToast({ title: e.message || '保存失败', icon: 'none' }); return false }
		},
		openSheet(n) { this.sheet = n },
		openSleepSheet(field) {
			this.sleepEditingField = field === 'wakeTime' ? 'wakeTime' : 'bedtime'
			this.syncSleepPicker(this.sleepEditingField)
			this.sheet = 'sleep'
		},
		switchSleepField(field) {
			if (field !== 'bedtime' && field !== 'wakeTime') return
			this.sleepEditingField = field
			this.syncSleepPicker(field)
		},
		syncSleepPicker(field) {
			const fallback = field === 'bedtime' ? '23:00' : '07:00'
			const [hours, minutes] = String(this.data[field] || fallback).split(':').map(Number)
			if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return
			let snappedHour = hours
			let minuteIndex = Math.round(minutes / 5)
			if (minuteIndex >= this.sleepMinuteOptions.length) {
				snappedHour = (snappedHour + 1) % 24
				minuteIndex = 0
			}
			this.sleepPickerValue = [snappedHour, minuteIndex]
		},
		onSleepPickerChange(event) {
			const value = event && event.detail && Array.isArray(event.detail.value) ? event.detail.value : []
			const hour = this.sleepHourOptions[value[0]]
			const minute = this.sleepMinuteOptions[value[1]]
			if (hour === undefined || minute === undefined) return
			this.data[this.sleepEditingField] = `${hour}:${minute}`
		},
		closeSheet() {
			const currentSheet = this.sheet
			this.sheet = ''
			if (currentSheet === 'weather') {
				this.sync({ weather_code: this.data.weatherCode, weather_temp: this.data.weatherTemp })
			} else if (currentSheet === 'steps') {
				this.sync({ steps: this.data.steps })
			} else if (currentSheet === 'sleep') {
				this.sync({ bedtime: this.data.bedtime, wake_time: this.data.wakeTime })
			}
		},
		selectMood(m) { this.data.mood = m.name; this.sync({ mood: m.name }) },
		selectScene(s) { this.data.scene = s; this.closeSheet(); this.sync({ scene: s }) },
		relocate() { uni.chooseLocation({ success: value => { this.data.scene = [value.name, value.address].filter(Boolean).join(' · ').slice(0, 48) }, fail: error => { if (!String(error.errMsg || '').includes('cancel')) uni.showToast({ title: '无法获取位置，可手动填写', icon: 'none' }) } }) },
		async addFav() { const label = String(this.data.scene || '').trim(); if (!label) return uni.showToast({ title: '先填写一个位置', icon: 'none' }); try { await addSnapshotPlace(label); await this.loadToday(); uni.showToast({ title: '已加入常用地址', icon: 'success' }) } catch (e) { uni.showToast({ title: e.message || '保存常用地址失败', icon: 'none' }) } },
		async confirmScene() { if (await this.sync({ scene: this.data.scene })) { this.closeSheet(); uni.showToast({ title: '已保存位置', icon: 'success' }) } },
		goHealthProfile() { uni.navigateTo({ url: '/pages/snapshot/health' }) },
		goHistory() { uni.navigateTo({ url: '/pages/snapshot/history' }) },
		goSleepTrend() { uni.navigateTo({ url: '/pages/snapshot/trend' }) },
		goFinance() { uni.navigateTo({ url: '/pages/snapshot/finance' }) },
		goMeal() { uni.navigateTo({ url: '/pages/snapshot/meal' }) },
		goMeditation() { uni.navigateTo({ url: '/pages/snapshot/meditation' }) },
		async doAiAction() { if (this.savingAction) return; if (this.challengeTodoId && this.challengeTitle === this.aiSuggestion.title) return uni.navigateTo({ url: `/pages/todo/detail?id=${this.challengeTodoId}` }); this.savingAction = true; try { const d = new Date(); const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; const response = await this.$http.post(todoCreate, { title: this.aiSuggestion.title, description: this.aiSuggestion.desc, scheduledDate: date, clientRequestId: `snapshot-challenge-${date}-${this.aiSuggestion.title}` }); if (response.code !== 200) throw new Error(response.message); const todoId = response.data && response.data.id; await updateTodaySnapshot({ challenge_title: this.aiSuggestion.title, challenge_todo_id: todoId }); this.challengeTitle = this.aiSuggestion.title; this.challengeTodoId = todoId; uni.showToast({ title: '已加入真实待办', icon: 'success' }) } catch (e) { uni.showToast({ title: e.message || '未能加入待办', icon: 'none' }) } finally { this.savingAction = false } },
		async completeChallenge() { if (await this.sync({ challenge_completed: true, challenge_skipped: false, challenge_title: this.todayChallenge ? this.todayChallenge.title : '' })) { this.challengeCompleted = true; this.challengeSkipped = false; uni.showToast({ title: '已记录完成', icon: 'success' }) } },
		async skipChallenge() { if (await this.sync({ challenge_completed: false, challenge_skipped: true, challenge_title: this.todayChallenge ? this.todayChallenge.title : '' })) { this.challengeSkipped = true; this.challengeCompleted = false; uni.showToast({ title: '已记录跳过', icon: 'none' }) } },
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
		editMeal(i) { const meal = this.meals[i]; if (meal && meal.id) uni.navigateTo({url:`/pages/snapshot/meal?id=${meal.id}`}) },
	}
}
</script>

<style lang="scss" scoped>
.snapshot-page {
	box-sizing: border-box;
	min-height: 100vh;
	max-width: 750rpx;
	margin: 0 auto;
	padding-bottom: calc(154rpx + env(safe-area-inset-bottom));
	background:
		radial-gradient(circle at 12% 48%, rgba(224, 240, 206, .58), transparent 29%),
		linear-gradient(180deg, #fffdf7 0%, #f2f9e9 54%, #f7faef 100%);
	overflow-x: hidden;
	color: #171a18;
}

.snapshot-hero {
	box-sizing: border-box;
	position: relative;
	height: 392rpx;
	padding-right: 34rpx;
	padding-left: 34rpx;
	overflow: hidden;
	background: #f7f3df;
}

.snapshot-hero::after {
	content: '';
	position: absolute;
	right: 0;
	bottom: -1rpx;
	left: 0;
	height: 54rpx;
	background: linear-gradient(180deg, rgba(247, 249, 238, 0), rgba(247, 249, 238, .97));
	pointer-events: none;
}

.snapshot-hero-art {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-position: 49% 50%;
}

.hero-brand,
.hero-heading,
.hero-note { position: relative; z-index: 1; }

.hero-brand { display: flex; align-items: center; width: 280rpx; }
.hero-logo { width: 58rpx; height: 58rpx; margin-right: 13rpx; }
.hero-brand-copy { min-width: 0; display: flex; flex-direction: column; }
.hero-brand-name { font-size: 27rpx; font-weight: 900; line-height: 1; letter-spacing: 1.5rpx; color: #141715; }
.hero-brand-line { margin-top: 7rpx; font-size: 18rpx; line-height: 1.35; color: #454b45; letter-spacing: .5rpx; }

.hero-heading { position: absolute; left: 34rpx; bottom: 45rpx; display: flex; flex-direction: column; }
.hero-kicker { font-size: 18rpx; color: #73776f; letter-spacing: 3.6rpx; }
.hero-title { margin-top: 4rpx; font-size: 45rpx; font-weight: 860; line-height: 1.06; letter-spacing: -2rpx; color: #171a18; }
.hero-date { margin-top: 9rpx; font-size: 25rpx; font-weight: 650; color: #676c67; }
.hero-note {
	position: absolute;
	top: 68rpx;
	right: 22rpx;
	max-width: 176rpx;
	font-family: "Kaiti SC", "STKaiti", "KaiTi", serif;
	font-size: 19rpx;
	line-height: 1.55;
	text-align: center;
	white-space: pre-line;
	transform: rotate(-5deg);
	color: #323630;
}
.history-entry { position: absolute; z-index: 4; right: 28rpx; bottom: 40rpx; padding: 10rpx 16rpx; border-radius: 24rpx; background: rgba(255,255,255,.72); color: #5f685f; font-size: 19rpx; font-weight: 700; }
.hero-note text,
.challenge-note text { display: block; }

.snapshot-content { position: relative; z-index: 2; margin-top: -8rpx; padding: 0 23rpx; }

.challenge-panel,
.state-panel,
.health-panel,
.life-panel,
.meal-panel {
	box-sizing: border-box;
	position: relative;
	overflow: hidden;
	border: 1rpx solid rgba(112, 126, 94, .14);
	box-shadow: 0 10rpx 25rpx rgba(82, 104, 68, .045);
}

.challenge-panel {
	height: 286rpx;
	padding: 24rpx 286rpx 22rpx 27rpx;
	border-color: rgba(224, 182, 103, .38);
	border-radius: 28rpx;
	background: linear-gradient(135deg, rgba(255, 254, 249, .99), rgba(255, 251, 242, .97));
}
.challenge-copy { position: relative; z-index: 2; display: flex; height: 100%; flex-direction: column; align-items: flex-start; }
.challenge-label { padding: 7rpx 15rpx; border-radius: 24rpx; background: #fff4dc; color: #df8b24; font-size: 21rpx; font-weight: 700; }
.challenge-title { display: block; margin-top: 12rpx; color: #1a1c1a; font-size: 31rpx; font-weight: 800; line-height: 1.15; }
.challenge-desc { display: -webkit-box; margin-top: 8rpx; overflow: hidden; color: #777b77; font-size: 20rpx; line-height: 1.48; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.challenge-cta { margin-top: auto; padding: 14rpx 25rpx 14rpx 29rpx; border-radius: 42rpx; background: linear-gradient(135deg, #f5a336, #e98624); color: #fff; font-size: 23rpx; font-weight: 700; box-shadow: 0 7rpx 16rpx rgba(221, 132, 33, .18); }
.challenge-cta text { margin-left: 9rpx; font-size: 27rpx; }
.challenge-art { position: absolute; z-index: 1; right: 4rpx; bottom: -8rpx; width: 265rpx; height: 238rpx; }
.challenge-note { position: absolute; z-index: 3; top: 22rpx; right: 19rpx; font-family: "Kaiti SC", "STKaiti", "KaiTi", serif; font-size: 17rpx; line-height: 1.45; white-space: pre-line; text-align: center; transform: rotate(-6deg); color: #454641; }

.state-panel { display: flex; height: 178rpx; margin-top: 18rpx; padding: 16rpx 12rpx 13rpx; border-radius: 27rpx; background: rgba(255, 255, 255, .93); }
.state-item { position: relative; display: flex; min-width: 0; flex: 1; flex-direction: column; align-items: center; justify-content: flex-end; }
.state-item + .state-item::before { content: ''; position: absolute; top: 20rpx; bottom: 20rpx; left: 0; width: 1rpx; background: rgba(32, 39, 33, .065); }
.state-icon { width: 70rpx; height: 70rpx; margin-bottom: 1rpx; }
.state-label { color: #747873; font-size: 20rpx; line-height: 1.2; }
.state-value { max-width: 100%; min-height: 28rpx; margin-top: 4rpx; overflow: hidden; color: #619149; font-size: 21rpx; font-weight: 650; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }

.health-panel { display: flex; height: 116rpx; margin-top: 18rpx; padding: 17rpx 48rpx 16rpx 22rpx; align-items: center; border-radius: 25rpx; background: rgba(255, 255, 255, .94); }
.health-landscape { position: absolute; right: 72rpx; bottom: -8rpx; width: 326rpx; height: 105rpx; opacity: .76; }
.round-icon { position: relative; z-index: 1; display: flex; width: 70rpx; height: 70rpx; flex: 0 0 70rpx; align-items: center; justify-content: center; border-radius: 50%; background: #eef7e6; }
.health-icon image { width: 46rpx; height: 46rpx; }
.module-copy { position: relative; z-index: 2; display: flex; min-width: 0; margin-left: 17rpx; flex: 1; flex-direction: column; }
.module-title { color: #191c1a; font-size: 28rpx; font-weight: 790; line-height: 1.2; }
.module-subtitle { display: block; max-width: 390rpx; margin-top: 5rpx; overflow: hidden; color: #8a8d89; font-size: 19rpx; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.health-note { position: absolute; z-index: 2; top: 23rpx; right: 61rpx; width: 196rpx; font-family: "Kaiti SC", "STKaiti", "KaiTi", serif; font-size: 16rpx; line-height: 1.35; transform: rotate(-6deg); color: #4c514c; }
.module-arrow { position: absolute; z-index: 3; top: 50%; right: 20rpx; color: #303430; font-size: 45rpx; font-weight: 300; line-height: 1; transform: translateY(-50%); }

.life-panel { display: flex; height: 143rpx; margin-top: 18rpx; padding: 12rpx 8rpx; border-radius: 25rpx; background: rgba(255, 255, 255, .94); }
.life-item { position: relative; display: flex; min-width: 0; flex: 1; align-items: center; padding: 4rpx 18rpx 4rpx 12rpx; }
.life-item + .life-item { border-left: 1rpx solid rgba(38, 44, 39, .075); }
.life-icon { width: 63rpx; height: 63rpx; flex: 0 0 63rpx; }
.life-copy { display: flex; min-width: 0; margin-left: 10rpx; flex-direction: column; }
.life-copy text { color: #888b87; font-size: 19rpx; }
.life-copy .life-value { margin-top: 4rpx; overflow: hidden; color: #1d201e; font-size: 25rpx; font-weight: 760; text-overflow: ellipsis; white-space: nowrap; }
.life-arrow { position: absolute; top: 47rpx; right: 5rpx; color: #666a66; font-size: 36rpx; line-height: 1; }

.meal-panel { display: flex; height: 145rpx; margin-top: 18rpx; padding: 24rpx 46rpx 22rpx 22rpx; align-items: center; border-radius: 25rpx; background: #fffdf7; }
.meal-art { position: absolute; top: 0; right: 0; width: 380rpx; height: 100%; opacity: .95; }
.meal-round { background: #f3f8e8; }
.meal-round text { font-size: 48rpx; line-height: 1; transform: rotate(90deg); color: #373a35; }
.meal-copy { max-width: 385rpx; }
.meal-panel .module-subtitle { max-width: 350rpx; }
.meditation-panel { display: flex; min-height: 112rpx; margin-top: 18rpx; padding: 24rpx 46rpx 24rpx 24rpx; align-items: center; gap: 20rpx; border-radius: 25rpx; background: rgba(232, 240, 227, .86); }
.meditation-orbit { width: 64rpx; height: 64rpx; flex: 0 0 64rpx; border: 2rpx solid rgba(75, 113, 82, .38); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.meditation-core { width: 28rpx; height: 28rpx; border-radius: 50%; background: #7cae5a; box-shadow: 0 0 0 10rpx rgba(124, 174, 90, .13); }

@media (max-height: 720px) {
	.snapshot-hero { height: 310rpx; }
	.hero-heading { bottom: 28rpx; }
	.hero-note { top: 55rpx; }
	.challenge-panel { height: 254rpx; }
	.challenge-art { width: 238rpx; height: 214rpx; }
	.life-panel { height: 116rpx; }
	.life-arrow { top: 35rpx; }
}

/* sheets */
.sheet-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; }
.sheet { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-radius: 40rpx 40rpx 0 0; padding: 20rpx 40rpx 60rpx; z-index: 1001; max-height: 85vh; overflow-y: auto; }
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
.sleep-sheet { padding-right: 28rpx; padding-left: 28rpx; }
.sleep-sheet .sheet-title { margin-bottom: 18rpx; }
.sleep-time-tabs { display: flex; margin-bottom: 10rpx; gap: 12rpx; }
.sleep-time-tab { display: flex; min-height: 98rpx; flex: 1; flex-direction: column; align-items: center; justify-content: center; border: 1rpx solid rgba(112, 126, 94, .15); border-radius: 20rpx; background: #f7f9f5; }
.sleep-time-tab.active { border-color: #7cae5a; background: #eef6e8; }
.sleep-time-label { color: #747974; font-size: 22rpx; line-height: 1.2; }
.sleep-time-value { margin-top: 6rpx; color: #353a35; font-size: 36rpx; font-weight: 780; line-height: 1; letter-spacing: 1rpx; }
.sleep-time-tab.active .sleep-time-label,
.sleep-time-tab.active .sleep-time-value { color: #568a3f; }
.sleep-picker { position: relative; width: 100%; height: 300rpx; margin-top: 4rpx; }
.sleep-picker::before,
.sleep-picker::after { content: ''; position: absolute; z-index: 2; right: 0; left: 0; height: 82rpx; pointer-events: none; }
.sleep-picker::before { top: 0; background: linear-gradient(180deg, #fff 20%, rgba(255,255,255,0)); }
.sleep-picker::after { bottom: 0; background: linear-gradient(0deg, #fff 20%, rgba(255,255,255,0)); }
.sleep-picker-item { display: flex; height: 96rpx; align-items: center; justify-content: center; color: #272b27; font-size: 34rpx; font-weight: 650; }
.sleep-duration { margin-top: 2rpx; padding: 12rpx 0 4rpx; color: #626762; font-size: 25rpx; font-weight: 600; text-align: center; }
.sleep-trend-entry { display: flex; min-height: 58rpx; align-items: center; justify-content: center; gap: 8rpx; color: #5d8d47; font-size: 23rpx; font-weight: 650; }
@media (max-height: 650px) {
	.sleep-picker { height: 250rpx; }
}
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
.scene-options { display: flex; flex-wrap: wrap; gap: 14rpx; margin-bottom: 28rpx; }
.scene-option { padding: 14rpx 26rpx; background: #f3f3f3; color: #666; border-radius: 30rpx; font-size: 26rpx;
	&.active { background: #e8f5e9; color: #4f7f38; border: 2rpx solid #7CAE5A; } }
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
