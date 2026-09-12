<template>
	<view class="edit-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="navbar" :style="{ paddingTop: navPadding + 'rpx' }"><button @tap="goBack">取消</button><text>{{ todoId ? '调整待办' : '新建待办' }}</text><button data-testid="save-todo" :disabled="saving" @tap="save">{{ saving ? '保存中…' : '保存' }}</button></view>
		<scroll-view class="form" scroll-y>
			<view class="title-block"><text>要做什么？</text><textarea v-model="form.title" maxlength="500" auto-height placeholder="只写标题也可以保存" /></view>
			<view class="description-block"><text>任务说明</text><textarea v-model="form.description" maxlength="5000" auto-height placeholder="具体动作、完成标准或这次不做什么（可选）" /></view>
			<view class="settings">
				<picker :range="projectOptions" range-key="name" :value="projectIndex" @change="form.projectId = projectOptions[$event.detail.value].id"><view class="setting"><text>项目</text><text>{{ selectedProject }}　›</text></view></picker>
				<view class="setting date"><text>安排日期</text><picker mode="date" :value="form.scheduledDate || today" @change="form.scheduledDate = $event.detail.value"><text>{{ form.scheduledDate || '未设置' }}</text></picker><button v-if="form.scheduledDate" @tap="form.scheduledDate = ''">清除</button></view>
				<view class="setting date"><text>截止日期</text><picker mode="date" :value="form.deadline || today" @change="form.deadline = $event.detail.value"><text>{{ form.deadline || '未设置' }}</text></picker><button v-if="form.deadline" @tap="form.deadline = ''">清除</button></view>
				<picker :range="directionOptions" range-key="name" :value="directionIndex" @change="form.compoundItemId = directionOptions[$event.detail.value].id"><view class="setting"><text>复利方向</text><text>{{ selectedDirection }}　›</text></view></picker>
				<view v-if="task && task.recurrence" class="repeat-editor">
					<text>修改范围</text><view class="scope-buttons"><button :class="{ active: repeatScope === 'INSTANCE' }" @tap="repeatScope = 'INSTANCE'">仅本次</button><button :class="{ active: repeatScope === 'FUTURE' }" @tap="repeatScope = 'FUTURE'">本次及以后</button></view>
					<text class="scope-note">{{ repeatScope === 'INSTANCE' ? '修改当前这一次，不影响其他日期。' : '过去已完成的记录保留，从这一次开始使用新安排。' }}</text>
					<view v-if="repeatScope === 'FUTURE'" class="repeat-fields">
						<picker :range="repeatLabels" :value="repeatIndex" @change="chooseRepeat"><view class="setting"><text>重复方式</text><text>{{ repeatLabels[repeatIndex] }}　›</text></view></picker>
						<view class="setting"><text>新安排从</text><picker mode="date" :value="recurrence.startsOn" @change="recurrence.startsOn = $event.detail.value"><text>{{ recurrence.startsOn }}</text></picker></view>
						<view v-if="recurrence.frequency === 'WEEKLY'" class="week-days"><button v-for="day in weekDayOptions" :key="day.value" :class="{ active: recurrence.weekDays.includes(day.value) }" @tap="toggleWeekday(day.value)">{{ day.label }}</button></view>
						<view v-if="recurrence.frequency === 'MONTHLY'" class="setting"><text>每月日期</text><input v-model.number="recurrence.monthDay" type="number" maxlength="2" /></view>
						<view class="setting date"><text>结束日期</text><picker mode="date" :value="recurrence.endsOn || recurrence.startsOn" @change="recurrence.endsOn = $event.detail.value"><text>{{ recurrence.endsOn || '不设置' }}</text></picker><button v-if="recurrence.endsOn" @tap="recurrence.endsOn = ''">清除</button></view>
					</view>
				</view>
			</view>
			<view v-if="task && task.sourceType !== 'MANUAL'" class="source"><text>来源</text><text>{{ sourceLabel }}</text><text>来源只用于返回上下文，不会创建另一条待办。</text></view>
			<view class="bottom-space"></view>
		</scroll-view>
	</view>
</template>

<script>
import { todoCreate, todoDetail, todoOptions, todoUpdate } from '@/api/todo';
export default {
	data() { return { statusBarHeight: 0, customBarHeight: 0, todoId: '', task: null, saving: false, createRequestId: `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`, today: this.localToday(), timeZone: this.localTimeZone(), projects: [], directions: [], repeatScope: 'INSTANCE', repeatIndex: 1, repeatLabels: ['每天', '每周', '每月'], weekDayOptions: [{ value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' }, { value: 4, label: '四' }, { value: 5, label: '五' }, { value: 6, label: '六' }, { value: 7, label: '日' }], recurrence: { frequency: 'DAILY', startsOn: this.localToday(), endsOn: '', weekDays: [], monthDay: Number(this.localToday().slice(8, 10)) }, form: { title: '', description: '', projectId: '', scheduledDate: '', deadline: '', compoundItemId: '' } }; },
	computed: {
		navPadding() { return Math.max(20, (this.customBarHeight - this.statusBarHeight) * 2 + 10); },
		projectOptions() { return [{ id: '', name: '不属于项目' }, ...this.projects]; },
		directionOptions() { return [{ id: '', name: '不关联' }, ...this.directions]; },
		projectIndex() { return Math.max(0, this.projectOptions.findIndex(item => item.id === this.form.projectId)); },
		directionIndex() { return Math.max(0, this.directionOptions.findIndex(item => item.id === this.form.compoundItemId)); },
		selectedProject() { const item = this.projectOptions[this.projectIndex]; return item ? item.name : '不属于项目'; },
		selectedDirection() { const item = this.directionOptions[this.directionIndex]; return item ? item.name : '不关联'; },
		sourceLabel() { return { DIARY_AI: '日记 AI 建议', COMPOUND: '复利系统', PROJECT: '项目' }[this.task && this.task.sourceType] || '其他'; }
	},
	onLoad(options) { const info = uni.getSystemInfoSync(); this.statusBarHeight = info.statusBarHeight || 0; this.customBarHeight = this.statusBarHeight + 44; this.todoId = options.id || ''; this.form.projectId = options.projectId || ''; this.initialize(); },
	methods: {
		localToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },
		localTimeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; } catch (_) { return 'Asia/Shanghai'; } },
		async initialize() { try { const options = await this.$http.get(todoOptions); const data = options.data || {}; this.projects = data.projects || []; this.directions = data.directions || []; if (this.todoId) await this.load(); } catch (e) { uni.showToast({ title: '设置加载失败', icon: 'none' }); } },
		async load() { const res = await this.$http.get(todoDetail, { id: this.todoId, timeZone: this.timeZone }); if (res.code !== 200) throw new Error(res.message); this.task = res.data; this.form = { title: res.data.title, description: res.data.description || '', projectId: res.data.projectId || '', scheduledDate: res.data.scheduledDate || '', deadline: res.data.deadline || '', compoundItemId: res.data.compoundItemId || '' }; if (res.data.recurrence) { this.repeatIndex = Math.max(0, ['DAILY', 'WEEKLY', 'MONTHLY'].indexOf(res.data.recurrence.frequency)); this.recurrence = { frequency: res.data.recurrence.frequency, startsOn: res.data.occurrenceDate || res.data.scheduledDate || this.today, endsOn: res.data.recurrence.endsOn || '', weekDays: res.data.recurrence.weekDays || [], monthDay: res.data.recurrence.monthDay || Number((res.data.occurrenceDate || this.today).slice(8, 10)) }; } },
		chooseRepeat(e) { this.repeatIndex = Number(e.detail.value); this.recurrence.frequency = ['DAILY', 'WEEKLY', 'MONTHLY'][this.repeatIndex]; if (this.recurrence.frequency === 'WEEKLY' && !this.recurrence.weekDays.length) this.recurrence.weekDays = [((new Date(`${this.recurrence.startsOn}T00:00:00`).getDay() + 6) % 7) + 1]; },
		toggleWeekday(value) { const days = this.recurrence.weekDays; this.recurrence.weekDays = days.includes(value) ? days.filter(day => day !== value) : [...days, value].sort(); },
		async save() { if (this.saving || !this.form.title.trim()) return uni.showToast({ title: '写下要做什么', icon: 'none' }); this.saving = true; try { const payload = { ...this.form, title: this.form.title.trim(), timeZone: this.timeZone, version: this.task ? this.task.version : null, clientRequestId: this.createRequestId }; let res; if (this.todoId && this.task.recurrence && this.repeatScope === 'FUTURE') { res = await this.$http.put(`/todos/v1/recurrences/${this.task.recurrenceRuleId}`, { ...payload, currentTaskId: this.task.id, effectiveOn: this.task.occurrenceDate || this.task.scheduledDate || this.today, recurrence: this.recurrence, version: this.task.recurrence.version, operationId: `repeat-${this.createRequestId}` }); } else { res = this.todoId ? await this.$http.put(`${todoUpdate}?id=${this.todoId}`, payload) : await this.$http.post(todoCreate, payload); } if (res.code !== 200) throw new Error(res.message); uni.showToast({ title: '已保存', icon: 'success' }); setTimeout(() => uni.navigateBack(), 450); } catch (e) { uni.showToast({ title: e.message || '保存失败', icon: 'none' }); } finally { this.saving = false; } },
		goBack() { uni.navigateBack(); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; border: 0; background: transparent; line-height: 1; } button::after { border: 0; }
.edit-page { min-height: 100vh; background: #f3f1e9; color: #28342c; }
.navbar { display: flex; align-items: center; padding: 0 30rpx 20rpx; }
.navbar text { flex: 1; text-align: center; font: 700 31rpx/1.2 Georgia, 'Songti SC', serif; }
.navbar button { min-width: 72rpx; color: #627066; font-size: 22rpx; } .navbar button:last-child { color: #3e543f; font-weight: 700; text-align: right; }
.form { height: calc(100vh - 150rpx - env(safe-area-inset-top)); }
.title-block, .description-block, .settings, .source { margin: 16rpx 30rpx; padding: 25rpx; border: 1rpx solid rgba(40,53,43,.08); border-radius: 24rpx; background: rgba(255,253,247,.76); }
.title-block > text, .description-block > text, .source > text:first-child { color: #768078; font-size: 19rpx; font-weight: 700; letter-spacing: 1rpx; }
textarea { width: 100%; max-width: 100%; min-height: 90rpx; margin-top: 17rpx; box-sizing: border-box; color: #28342c; font-size: 28rpx; line-height: 1.55; overflow-wrap: anywhere; }
.description-block textarea { min-height: 140rpx; font-size: 23rpx; }
.setting { display: flex; align-items: center; min-height: 76rpx; border-bottom: 1rpx solid rgba(40,53,43,.08); color: #5e6961; font-size: 22rpx; }
.setting:last-child { border-bottom: 0; } .setting > text:first-child { flex: 1; color: #39463d; }
.setting.date picker { margin-left: auto; } .setting.date button { margin-left: 14rpx; color: #9b5b55; font-size: 18rpx; }
.repeat-editor { padding: 20rpx 0; border-bottom: 1rpx solid rgba(40,53,43,.08); } .repeat-editor > text:first-child { color: #39463d; font-size: 22rpx; } .scope-buttons { display: flex; gap: 10rpx; margin-top: 16rpx; } .scope-buttons button { flex: 1; padding: 15rpx; border-radius: 16rpx; background: #eeeee7; color: #677269; font-size: 20rpx; } .scope-buttons button.active { background: #dfe8bd; color: #34442e; font-weight: 700; } .scope-note { display: block; margin-top: 12rpx; color: #848d86; font-size: 18rpx; line-height: 1.5; } .repeat-fields { margin-top: 14rpx; padding: 0 16rpx; border-radius: 18rpx; background: #f3f3ed; } .repeat-fields input { width: 90rpx; text-align: right; } .week-days { display: flex; justify-content: space-between; padding: 15rpx 0; } .week-days button { display: flex; width: 48rpx; height: 48rpx; align-items: center; justify-content: center; border-radius: 50%; background: #fff; color: #69736b; font-size: 18rpx; } .week-days button.active { background: #52643d; color: #fff; }
.source { display: flex; flex-direction: column; gap: 10rpx; } .source > text:nth-child(2) { font-size: 23rpx; } .source > text:last-child { color: #7d867f; font-size: 19rpx; line-height: 1.45; }
.bottom-space { height: 80rpx; }
@media (min-width: 900px) { .edit-page { width: 720px; min-height: 760px; margin: 40px auto; border-radius: 28px; } }
</style>
