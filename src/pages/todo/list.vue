<template>
	<view class="todo-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="workspace">
			<view class="desktop-sidebar">
				<text class="brand">SHROOM · ACTION</text>
				<text class="sidebar-title">待办</text>
				<text class="sidebar-section-label">按时间</text>
				<button v-for="view in timeViews" :key="view.key" :class="{ active: currentView === view.key }" @tap="setView(view.key)">{{ view.label }}</button>
				<view class="sidebar-divider"></view>
				<text class="sidebar-section-label">组织方式</text>
				<button :class="{ active: currentView === 'projects' }" @tap="setView('projects')">按项目查看</button>
				<view class="sidebar-divider"></view>
				<text class="sidebar-section-label">全部记录</text>
				<button @tap="setView('all')">全部待办</button>
				<button @tap="setView('completed')">已完成</button>
			</view>

			<view class="main-panel">
				<view class="navbar" :style="{ paddingTop: navPadding + 'rpx' }">
					<button class="back" aria-label="返回" @tap="goBack">‹</button>
					<text class="page-title">待办</text>
					<view class="nav-actions">
						<button class="search-button" aria-label="搜索" @tap="toggleSearch">⌕</button>
						<button class="manage-button" data-testid="todo-manage" @tap="openPageMenu">管理</button>
						<button class="new-button" data-testid="add-todo" @tap="openQuickAdd">＋<text>新建</text></button>
					</view>
				</view>

				<view v-if="searchVisible" class="search-row">
					<input v-model="searchQuery" placeholder="搜索所有待办、说明、项目和结果" confirm-type="search" @confirm="searchAll" />
					<button @tap="searchAll">搜索</button>
					<button @tap="clearSearch">取消</button>
				</view>

				<scroll-view class="mobile-tabs" scroll-x :show-scrollbar="false">
					<view class="tab-row">
						<button v-for="view in timeViews" :key="view.key" :class="{ active: currentView === view.key }" @tap="setView(view.key)">{{ view.label }}</button>
					</view>
				</scroll-view>

				<scroll-view class="content-scroll" scroll-y refresher-enabled :refresher-triggered="refreshing" @refresherrefresh="refresh">
					<view v-if="loading && !loaded" class="loading">正在整理你的行动…</view>

					<template v-if="currentView === 'projects'">
						<view class="project-intro"><text>项目把多条行动组织成一个要做成的结果。</text><button @tap="openProjectSheet">＋ 新建项目</button></view>
						<view v-for="project in projects" :key="project.id" class="project-row" @tap="openProject(project)">
							<view><text class="project-name">{{ project.name }}</text><text class="project-goal">{{ project.goal || '还没有填写项目目标' }}</text></view>
							<view class="project-counts"><text v-if="project.progressingCount">进行中 {{ project.progressingCount }}</text><text>未完成 {{ project.openCount }}</text><text>›</text></view>
						</view>
						<view v-if="loaded && !projects.length" class="empty-copy"><text>还没有项目</text><text>普通待办不需要项目。只有一件事需要多步推进时，再建立项目。</text></view>
					</template>

					<template v-else>
						<view v-if="coordinationGroups.length && (currentView === 'current' || currentView === 'all')" class="coordination-card" data-testid="coordination-suggestions" @tap="openCoordination">
							<view class="coordination-copy">
								<text class="coordination-kicker">统筹建议</text>
								<text class="coordination-title">{{ coordinationGroups.length }} 组事可以一起处理</text>
								<text>{{ coordinationTaskCount }} 件待办已按执行方式、项目与长期方向整理。{{ adjustmentCount ? `已学习你 ${adjustmentCount} 次调整。` : '' }}</text>
							</view>
							<text class="coordination-arrow">›</text>
						</view>
						<view v-for="group in visibleGroups" :key="group.key" class="task-section">
							<view class="section-heading">
								<text>{{ group.label || viewLabel }} · {{ group.items.length }}</text>
								<button v-if="group.collapsible && group.items.length > historyLimit" @tap="historyExpanded = !historyExpanded">{{ historyExpanded ? '收起' : `展开 ${group.items.length}` }}</button>
							</view>
							<todo-row v-for="task in limitedItems(group)" :key="task.id" :task="task" :selection-mode="selectionMode" :selected="selectedIds.includes(task.id)" @toggle="toggleTask" @open="openTask" @more="openTaskMenu" />
						</view>

						<view v-if="loaded && currentView === 'current' && !taskCount && unscheduledCount" class="unscheduled-nudge">
							<text>还有 {{ unscheduledCount }} 条待安排的待办，可以选一件开始。</text>
							<button @tap="setView('unscheduled')">查看待安排</button>
						</view>
						<view v-else-if="loaded && !taskCount" class="empty-copy">
							<text>{{ emptyTitle }}</text><text>{{ emptyHint }}</text><button @tap="openQuickAdd">写下一件事</button>
						</view>
					</template>
					<view class="safe-bottom"></view>
				</scroll-view>
			</view>
		</view>

		<view v-if="showPageMenu" class="sheet-mask" @tap.self="closePageMenu">
			<view class="sheet manage-sheet" @tap.stop>
				<view class="sheet-handle"></view>
				<view class="sheet-heading"><view><text>管理待办</text><text>查看、整理和导出</text></view><button @tap="closePageMenu">关闭</button></view>
				<text class="manage-section-label">切换视图</text>
				<view class="manage-grid">
					<button @tap="selectManagedView('all')"><text>全部待办</text><text>查看所有未删除的行动</text></button>
					<button @tap="selectManagedView('completed')"><text>已完成</text><text>回看结果和完成时间</text></button>
				</view>
				<text class="manage-section-label">组织方式</text>
				<view class="manage-list">
					<button @tap="selectManagedView('projects')"><view><text>按项目查看</text><text>查看每个项目的目标与未完成行动</text></view><text>›</text></button>
				</view>
				<text class="manage-section-label">整理与数据</text>
				<view class="manage-list">
					<button @tap="startSelection"><view><text>批量整理</text><text>批量安排日期、加入项目或取消</text></view><text>›</text></button>
					<button @tap="exportFromMenu"><view><text>导出 Markdown</text><text>复制一份可保存的待办记录</text></view><text>›</text></button>
				</view>
			</view>
		</view>

		<view v-if="showQuickSheet" class="sheet-mask" @tap.self="closeQuickAdd">
			<view class="sheet" @tap.stop>
				<view class="sheet-handle"></view>
				<view class="sheet-heading"><text>{{ editingTask ? '调整待办' : '新增待办' }}</text><button @tap="closeQuickAdd">关闭</button></view>
				<textarea v-model="draft.title" class="title-input" maxlength="500" auto-height placeholder="要做什么？" :focus="!editingTask" />
				<view class="quick-fields">
					<picker :range="projectOptions" range-key="name" :value="projectIndex" @change="chooseProject"><button>{{ selectedProjectName || '项目' }}</button></picker>
					<button :class="{ active: !!draft.scheduledDate }" @tap="showDateChoices">{{ draft.scheduledDate ? shortDate(draft.scheduledDate) : '安排日期' }}</button>
					<picker :range="repeatLabels" :value="repeatIndex" @change="chooseRepeat"><button :class="{ active: repeatIndex > 0 }">{{ repeatLabels[repeatIndex] }}</button></picker>
				</view>

				<view v-if="repeatIndex > 0" class="repeat-panel">
					<view class="field-line"><text>开始日期</text><picker mode="date" :value="draft.recurrence.startsOn" @change="draft.recurrence.startsOn = $event.detail.value"><text>{{ draft.recurrence.startsOn }}</text></picker></view>
					<view v-if="draft.recurrence.frequency === 'WEEKLY'" class="week-days"><button v-for="day in weekDayOptions" :key="day.value" :class="{ active: draft.recurrence.weekDays.includes(day.value) }" @tap="toggleWeekday(day.value)">{{ day.label }}</button></view>
					<view v-if="draft.recurrence.frequency === 'MONTHLY'" class="field-line"><text>每月日期</text><input v-model.number="draft.recurrence.monthDay" type="number" maxlength="2" /></view>
					<view class="field-line"><text>结束日期（可选）</text><picker mode="date" :value="draft.recurrence.endsOn || draft.recurrence.startsOn" @change="draft.recurrence.endsOn = $event.detail.value"><text>{{ draft.recurrence.endsOn || '不设置' }}</text></picker><button v-if="draft.recurrence.endsOn" @tap="draft.recurrence.endsOn = ''">清除</button></view>
				</view>

				<button class="text-toggle" @tap="showDetails = !showDetails">{{ showDetails ? '收起设置' : '添加说明 · 更多设置' }}　›</button>
				<view v-if="showDetails" class="detail-fields">
					<textarea v-model="draft.description" maxlength="5000" auto-height placeholder="任务说明、完成标准或本次边界（可选）" />
					<view class="field-line"><text>截止日期</text><picker mode="date" :value="draft.deadline || today" @change="draft.deadline = $event.detail.value"><text>{{ draft.deadline || '未设置' }}</text></picker><button v-if="draft.deadline" @tap="draft.deadline = ''">清除</button></view>
					<picker :range="directionOptions" range-key="name" :value="directionIndex" @change="chooseDirection"><view class="field-line"><text>复利方向</text><text>{{ selectedDirectionName || '不关联' }}　›</text></view></picker>
				</view>
				<view v-if="draft.sourceType === 'COMPOUND'" class="source-note">来自复利系统 · 保存后仍是同一套待办</view>
				<button class="save-button" :disabled="saving || !draft.title.trim()" @tap="saveTask">{{ saving ? '保存中…' : '保存' }}</button>
			</view>
		</view>

		<view v-if="showProjectSheet" class="sheet-mask" @tap.self="closeProjectSheet">
			<view class="sheet small project-sheet" @tap.stop>
				<view class="sheet-handle"></view><view class="sheet-heading"><view><text>新建项目</text><text>为一个需要多步完成的结果命名</text></view><button @tap="closeProjectSheet">关闭</button></view>
				<label class="project-field" @tap.stop>
					<text>项目名称</text>
					<input v-model="projectDraft.name" data-testid="project-name" maxlength="160" :focus="projectNameFocused" cursor-spacing="24" placeholder="例如：发布 Shroom iOS 版" @focus="projectNameFocused = true" />
				</label>
				<label class="project-field goal-field" @tap.stop>
					<text>要做成的结果 <text>可选</text></text>
					<textarea v-model="projectDraft.goal" maxlength="2000" auto-height cursor-spacing="24" placeholder="写清什么发生后，这个项目才算完成" />
				</label>
				<button class="save-button" :disabled="!projectDraft.name.trim() || savingProject" @tap="saveProject">{{ savingProject ? '创建中…' : '创建项目' }}</button>
			</view>
		</view>

		<view v-if="showCoordinationSheet" class="sheet-mask" @tap.self="closeCoordination">
			<view class="sheet coordination-sheet" @tap.stop>
				<view class="sheet-handle"></view>
				<view class="sheet-heading"><view><text>一起处理</text><text>先看系统为什么这样分。不对就移动，下次会更准。</text></view><button @tap="closeCoordination">关闭</button></view>
				<view v-for="group in coordinationGroups" :key="group.key" class="coordination-group">
					<view class="coordination-group-head">
						<view><text>{{ group.label }}</text><text>{{ group.reason }} · 约 {{ group.estimatedMinutes }} 分钟</text></view>
						<button :disabled="group.adopted || adoptingGroupKey === group.key || group.tasks.length < 1" @tap="adoptCoordinationGroup(group)">{{ group.adopted ? '执行中' : (adoptingGroupKey === group.key ? '处理中…' : '按这组执行') }}</button>
					</view>
					<view v-for="task in group.tasks" :key="task.id" class="coordination-task">
						<view><text>{{ task.title }}</text><text v-if="task.projectName">{{ task.projectName }}</text></view>
						<button v-if="!group.adopted" @tap="moveCoordinationTask(task, group)">移动到其他组</button>
					</view>
					<text v-if="group.personalization && group.personalization.adjustmentCount" class="learned-note">{{ group.personalization.explanation }}</text>
				</view>
				<text class="coordination-footnote">你移动的每一项都会记住这次调整；待办原始内容和项目不会被改写。</text>
			</view>
		</view>

		<view v-if="selectionMode" class="bulk-bar"><text>已选 {{ selectedIds.length }} 项</text><button @tap="bulkSchedule">安排日期</button><button @tap="bulkMove">加入项目</button><button @tap="bulkCancel">取消</button><button @tap="exitSelection">完成</button></view>
		<view v-if="undoTask" class="undo-bar"><text>已完成“{{ undoTask.title }}”</text><button @tap="undoComplete">撤销</button></view>
	</view>
</template>

<script>
import TodoRow from '@/components/TodoRow.vue';
import { todoBulk, todoCreate, todoDelete, todoExport, todoHome, todoProjects, todoStatus } from '@/api/todo';

const emptyDraft = today => ({
	title: '', description: '', projectId: '', scheduledDate: '', deadline: '', compoundItemId: '',
	sourceType: 'MANUAL', sourceRefId: '', sourceDiaryId: '', sourceCompoundThreadId: '',
	clientRequestId: '',
	recurrence: { frequency: '', startsOn: today, endsOn: '', weekDays: [], monthDay: Number(today.slice(8, 10)) }
});

export default {
	components: { TodoRow },
	data() {
		return {
			statusBarHeight: 0, customBarHeight: 0, currentView: 'current', loading: false, loaded: false, refreshing: false,
			groups: [], projects: [], directions: [], unscheduledCount: 0, today: this.localToday(), timeZone: this.localTimeZone(),
			searchVisible: false, searchQuery: '', historyExpanded: false, historyLimit: 5,
			showQuickSheet: false, showProjectSheet: false, showPageMenu: false, showDetails: false, saving: false, editingTask: null,
			draft: emptyDraft(this.localToday()), repeatIndex: 0,
			projectDraft: { name: '', goal: '' }, projectNameFocused: false, savingProject: false,
			selectionMode: false, selectedIds: [], undoTask: null, undoTimer: null,
			coordinationGroups: [], adjustmentCount: 0, coordinationLoading: false, showCoordinationSheet: false, adoptingGroupKey: '',
			timeViews: [{ key: 'current', label: '现在要做' }, { key: 'upcoming', label: '未来安排' }, { key: 'unscheduled', label: '待安排' }],
			repeatLabels: ['不重复', '每天', '每周', '每月'],
			weekDayOptions: [{ value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' }, { value: 4, label: '四' }, { value: 5, label: '五' }, { value: 6, label: '六' }, { value: 7, label: '日' }]
		};
	},
	computed: {
		navPadding() { return Math.max(22, (this.customBarHeight - this.statusBarHeight) * 2 + 14); },
		taskCount() { return this.groups.reduce((count, group) => count + group.items.length, 0); },
		coordinationTaskCount() { return this.coordinationGroups.reduce((count, group) => count + group.tasks.length, 0); },
		visibleGroups() { return this.groups.filter(group => group.items && group.items.length); },
		projectOptions() { return [{ id: '', name: '不属于项目' }, ...this.projects]; },
		directionOptions() { return [{ id: '', name: '不关联复利方向' }, ...this.directions]; },
		projectIndex() { return Math.max(0, this.projectOptions.findIndex(item => item.id === this.draft.projectId)); },
		directionIndex() { return Math.max(0, this.directionOptions.findIndex(item => item.id === this.draft.compoundItemId)); },
		selectedProjectName() { const item = this.projectOptions[this.projectIndex]; return item && item.id ? item.name : ''; },
		selectedDirectionName() { const item = this.directionOptions[this.directionIndex]; return item && item.id ? item.name : ''; },
		viewLabel() {
			return { current: '现在要做', upcoming: '未来安排', unscheduled: '待安排', all: '全部待办', completed: '已完成' }[this.currentView] || '';
		},
		emptyTitle() { return this.currentView === 'completed' ? '还没有已完成的行动' : '这里暂时是空的'; },
		emptyHint() { return this.currentView === 'completed' ? '完成的任务会保留结果和发生时间。' : '只写标题就能保存，日期和项目都可以以后再加。'; }
	},
	onLoad(options) {
		const info = uni.getSystemInfoSync(); this.statusBarHeight = info.statusBarHeight || 0; this.customBarHeight = this.statusBarHeight + 44;
		if (options && ['current', 'upcoming', 'unscheduled', 'projects', 'all', 'completed'].includes(options.view)) this.currentView = options.view;
	},
	onShow() {
		this.consumeCompoundPrefill();
		this.load();
	},
	onUnload() { if (this.undoTimer) clearTimeout(this.undoTimer); },
	methods: {
		localTimeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; } catch (_) { return 'Asia/Shanghai'; } },
		localToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
		requestId() { return `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`; },
		async load() {
			if (!this.$mStore.getters.hasLogin) return;
			this.loading = true;
			try {
				const res = await this.$http.get(todoHome, { view: this.currentView, q: this.searchQuery.trim(), timeZone: this.timeZone });
				if (res.code !== 200) throw new Error(res.message);
				this.groups = res.data.groups || []; this.projects = res.data.projects || []; this.today = res.data.today || this.today;
				this.unscheduledCount = res.data.unscheduledCount || 0;
				if (this.currentView === 'current' || this.currentView === 'all') await this.loadCoordination();
				else this.coordinationGroups = [];
				if (!this.directions.length) await this.loadDirections();
				this.loaded = true;
			} catch (error) { uni.showToast({ title: typeof error === 'string' ? error : '待办加载失败', icon: 'none' }); }
			finally { this.loading = false; this.refreshing = false; }
		},
		async loadCoordination() {
			if (this.coordinationLoading) return;
			this.coordinationLoading = true;
			try {
				const [res, bags] = await Promise.all([
					this.$http.get('/todos/v1/smart-groups'),
					this.$http.get('/bags/v1', { status: 'adopted' })
				]);
				const active = [];
				if (bags.code === 200) {
					const details = await Promise.all((bags.data.bags || []).map(item => this.$http.get(`/bags/v1/${item.id}`)));
					for (const detail of details) if (detail.code === 200) active.push({
						key: `bag:${detail.data.bag.id}`, bagId: detail.data.bag.id, label: detail.data.bag.name,
						reason: '你已确认的统筹', estimatedMinutes: detail.data.bag.durationMinutes,
						taskCount: detail.data.tasks.length, tasks: detail.data.tasks, adopted: true
					});
				}
				if (res.code === 200) {
					this.coordinationGroups = [...active, ...(res.data.groups || [])];
					this.adjustmentCount = res.data.adjustmentCount || 0;
				}
			} catch (_) { this.coordinationGroups = []; }
			finally { this.coordinationLoading = false; }
		},
		openCoordination() { this.showCoordinationSheet = true; },
		closeCoordination() { if (!this.adoptingGroupKey) this.showCoordinationSheet = false; },
		moveCoordinationTask(task, sourceGroup) {
			const targets = this.coordinationGroups.filter(group => group.key !== sourceGroup.key && !group.adopted);
			if (!targets.length) return uni.showToast({ title: '暂时没有其他可移入的组', icon: 'none' });
			uni.showActionSheet({ itemList: targets.map(group => group.label), success: async ({ tapIndex }) => {
				const target = targets[tapIndex];
				const originalState = { taskId: task.id, taskTitle: task.title, taskTags: task.tags || [], fromGroupKey: sourceGroup.key, fromGroupLabel: sourceGroup.label };
				const newState = { taskId: task.id, taskTitle: task.title, taskTags: task.tags || [], toGroupKey: target.key, toGroupLabel: target.label };
				try {
					const res = await this.$http.post('/correction-events/v1', { eventType: 'drag_reclassify', originalState, newState });
					if (res.code !== 200) throw new Error(res.message);
					sourceGroup.tasks = sourceGroup.tasks.filter(item => item.id !== task.id); sourceGroup.taskCount = sourceGroup.tasks.length;
					target.tasks.push(task); target.taskCount = target.tasks.length;
					this.adjustmentCount += 1;
					uni.showToast({ title: '已移动，记住这次调整', icon: 'none' });
				} catch (error) { uni.showToast({ title: error.message || '移动失败', icon: 'none' }); }
			} });
		},
		async adoptCoordinationGroup(group) {
			if (this.adoptingGroupKey || !group.tasks.length) return;
			this.adoptingGroupKey = group.key;
			try {
				const res = await this.$http.post('/bags/v1', { name: group.label, scheduledAt: new Date().toISOString(), durationMinutes: Math.min(90, Math.max(15, group.estimatedMinutes || group.tasks.length * 15)), taskIds: group.tasks.map(task => task.id), groupingReason: group.reason, adopt: true });
				if (res.code !== 200) throw new Error(res.message);
				group.key = `bag:${res.data.id}`; group.bagId = res.data.id; group.adopted = true;
				uni.showToast({ title: '已统筹，现在可以集中执行', icon: 'none' });
				if (!this.coordinationGroups.length) this.showCoordinationSheet = false;
			} catch (error) { uni.showToast({ title: error.message || '采纳失败', icon: 'none' }); }
			finally { this.adoptingGroupKey = ''; }
		},
		async loadDirections() {
			try { const res = await this.$http.get('/todos/v1/options'); if (res.code === 200) this.directions = res.data.directions || []; } catch (_) {}
		},
		refresh() { this.refreshing = true; this.load(); },
		setView(view) { this.currentView = view; this.historyExpanded = false; this.load(); },
		limitedItems(group) { return group.collapsible && !this.historyExpanded ? group.items.slice(0, this.historyLimit) : group.items; },
		toggleSearch() { this.searchVisible = !this.searchVisible; if (!this.searchVisible) this.clearSearch(); },
		searchAll() { this.currentView = 'all'; this.load(); },
		clearSearch() { this.searchQuery = ''; this.searchVisible = false; if (this.currentView === 'all') this.currentView = 'current'; this.load(); },
		openPageMenu() {
			this.showPageMenu = true;
		},
		closePageMenu() { this.showPageMenu = false; },
		selectManagedView(view) { this.closePageMenu(); this.setView(view); },
		startSelection() { this.closePageMenu(); this.selectionMode = true; this.selectedIds = []; },
		exportFromMenu() { this.closePageMenu(); this.exportTasks(); },
		consumeCompoundPrefill() {
			const value = uni.getStorageSync('todoPrefill'); if (!value) return;
			uni.removeStorageSync('todoPrefill'); this.openQuickAdd(value);
		},
		openQuickAdd(prefill = {}) {
			this.editingTask = null; this.draft = { ...emptyDraft(this.today), ...prefill, recurrence: { ...emptyDraft(this.today).recurrence, ...(prefill.recurrence || {}) } };
			if (!this.draft.clientRequestId) this.draft.clientRequestId = this.requestId();
			this.repeatIndex = { DAILY: 1, WEEKLY: 2, MONTHLY: 3 }[this.draft.recurrence.frequency] || 0;
			this.showDetails = Boolean(this.draft.description || this.draft.deadline || this.draft.compoundItemId); this.showQuickSheet = true;
		},
		closeQuickAdd() { if (!this.saving) { this.showQuickSheet = false; this.editingTask = null; } },
		chooseProject(e) { const item = this.projectOptions[Number(e.detail.value)]; this.draft.projectId = item ? item.id : ''; },
		chooseDirection(e) { const item = this.directionOptions[Number(e.detail.value)]; this.draft.compoundItemId = item ? item.id : ''; },
		chooseRepeat(e) {
			this.repeatIndex = Number(e.detail.value); this.draft.recurrence.frequency = ['', 'DAILY', 'WEEKLY', 'MONTHLY'][this.repeatIndex];
			if (this.draft.recurrence.frequency === 'WEEKLY' && !this.draft.recurrence.weekDays.length) this.draft.recurrence.weekDays = [((new Date(`${this.draft.recurrence.startsOn}T00:00:00`).getDay() + 6) % 7) + 1];
		},
		toggleWeekday(value) { const days = this.draft.recurrence.weekDays; this.draft.recurrence.weekDays = days.includes(value) ? days.filter(day => day !== value) : [...days, value].sort(); },
		showDateChoices() {
			uni.showActionSheet({ itemList: ['今天', '明天', '选择日期', '清除日期'], success: ({ tapIndex }) => {
				if (tapIndex === 0) this.draft.scheduledDate = this.today;
				else if (tapIndex === 1) { const d = new Date(`${this.today}T12:00:00`); d.setDate(d.getDate() + 1); this.draft.scheduledDate = this.localDate(d); }
				else if (tapIndex === 2) this.pickCustomDate(); else this.draft.scheduledDate = '';
			} });
		},
		pickCustomDate() { uni.showModal({ title: '选择日期', editable: true, placeholderText: 'YYYY-MM-DD', success: res => { if (res.confirm && /^\d{4}-\d{2}-\d{2}$/.test(res.content || '')) this.draft.scheduledDate = res.content; } }); },
		localDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
		shortDate(value) { return value ? String(value).slice(5).replace('-', '月') + '日' : ''; },
		async saveTask() {
			if (!this.draft.title.trim() || this.saving) return; this.saving = true;
			if (!this.draft.clientRequestId) this.draft.clientRequestId = this.requestId();
			const payload = { ...this.draft, title: this.draft.title.trim(), timeZone: this.timeZone, recurrence: this.repeatIndex ? this.draft.recurrence : null };
			try {
				const res = await this.$http.post(todoCreate, payload); if (res.code !== 200) throw new Error(res.message);
				this.showQuickSheet = false; uni.showToast({ title: this.taskFitsCurrent(res.data) ? '已保存' : '已保存，可在相应视图查看', icon: 'none' });
				this.load();
			} catch (error) { uni.showToast({ title: error.message || '保存失败，请重试', icon: 'none' }); }
			finally { this.saving = false; }
		},
		taskFitsCurrent(task) { if (this.currentView === 'unscheduled') return !task.scheduledDate; if (this.currentView === 'current') return task.status === 'in_progress' || Boolean(task.scheduledDate && task.scheduledDate <= this.today) || Boolean(task.deadline && task.deadline <= this.today); return true; },
		async toggleTask(task) {
			if (this.selectionMode) { this.selectedIds = this.selectedIds.includes(task.id) ? this.selectedIds.filter(id => id !== task.id) : [...this.selectedIds, task.id]; return; }
			const action = task.status === 'completed' ? 'RESTORE' : 'COMPLETE';
			const oldGroups = JSON.parse(JSON.stringify(this.groups));
			this.groups.forEach(group => { group.items = group.items.filter(item => item.id !== task.id); });
			try {
				const res = await this.$http.patch(todoStatus, { id: task.id, action, version: task.version, operationId: this.requestId(), timeZone: this.timeZone });
				if (res.code !== 200) throw new Error(res.message);
				if (action === 'COMPLETE') { this.undoTask = res.data; if (this.undoTimer) clearTimeout(this.undoTimer); this.undoTimer = setTimeout(() => { this.undoTask = null; }, 6000); }
				else uni.showToast({ title: '已恢复为待做', icon: 'none' });
				this.load();
			} catch (error) { this.groups = oldGroups; uni.showToast({ title: error.message || '操作失败，状态已恢复', icon: 'none' }); }
		},
		async undoComplete() { if (!this.undoTask) return; const task = this.undoTask; this.undoTask = null; try { await this.$http.patch(todoStatus, { id: task.id, action: 'RESTORE', version: task.version, operationId: this.requestId(), timeZone: this.timeZone }); this.load(); } catch (_) { uni.showToast({ title: '撤销失败，请进入详情重试', icon: 'none' }); } },
		openTask(task) { if (this.selectionMode) return this.toggleTask(task); uni.navigateTo({ url: `/pages/todo/detail?id=${task.id}` }); },
		openTaskMenu(task) {
			if (this.selectionMode) return this.toggleTask(task);
			const items = task.status === 'in_progress' ? ['打开详情', '调整设置', '取消待办', '删除'] : ['开始推进', '打开详情', '调整设置', task.recurrenceRuleId ? '跳过本次' : '取消待办', '删除'];
			uni.showActionSheet({ itemList: items, success: async ({ tapIndex }) => {
				const label = items[tapIndex];
				if (label === '开始推进') return this.changeStatus(task, 'START');
				if (label === '打开详情') return this.openTask(task);
				if (label === '调整设置') return uni.navigateTo({ url: `/pages/todo/edit?id=${task.id}` });
				if (label === '取消待办') return this.changeStatus(task, 'CANCEL');
				if (label === '跳过本次') return this.changeStatus(task, 'SKIP');
				if (label === '删除') return this.confirmDelete(task);
			} });
		},
		async changeStatus(task, action) { try { const res = await this.$http.patch(todoStatus, { id: task.id, action, version: task.version, operationId: this.requestId(), timeZone: this.timeZone }); if (res.code !== 200) throw new Error(res.message); this.load(); } catch (e) { uni.showToast({ title: e.message || '操作失败', icon: 'none' }); } },
		confirmDelete(task) { uni.showModal({ title: '删除待办？', content: '删除后不会影响用户自己写下的日记。', confirmColor: '#a44f48', success: async res => { if (!res.confirm) return; try { const out = await this.$http.delete(`${todoDelete}?id=${task.id}`, {}); if (out.code !== 200) throw new Error(out.message); this.load(); } catch (e) { uni.showToast({ title: e.message || '删除失败', icon: 'none' }); } } }); },
		openProject(project) { uni.navigateTo({ url: `/pages/todo/project?id=${project.id}` }); },
		openProjectSheet() {
			this.projectDraft = { name: '', goal: '' };
			this.projectNameFocused = false;
			this.showProjectSheet = true;
			this.$nextTick(() => { this.projectNameFocused = true; });
		},
		closeProjectSheet() { if (!this.savingProject) { this.projectNameFocused = false; this.showProjectSheet = false; } },
		async saveProject() { if (!this.projectDraft.name.trim() || this.savingProject) return; this.savingProject = true; try { const res = await this.$http.post(todoProjects, this.projectDraft); if (res.code !== 200) throw new Error(res.message); this.projectNameFocused = false; this.showProjectSheet = false; this.projectDraft = { name: '', goal: '' }; this.load(); } catch (e) { uni.showToast({ title: e.message || '项目创建失败', icon: 'none' }); } finally { this.savingProject = false; } },
		exitSelection() { this.selectionMode = false; this.selectedIds = []; },
		bulkSchedule() { if (!this.selectedIds.length) return; uni.showModal({ title: '批量安排日期', editable: true, placeholderText: 'YYYY-MM-DD，留空清除', success: res => { if (res.confirm) this.runBulk('SCHEDULE', { scheduledDate: res.content || null }); } }); },
		bulkMove() { if (!this.selectedIds.length) return; uni.showActionSheet({ itemList: this.projectOptions.map(item => item.name), success: ({ tapIndex }) => this.runBulk('MOVE_PROJECT', { projectId: this.projectOptions[tapIndex].id || null }) }); },
		bulkCancel() { if (this.selectedIds.length) this.runBulk('CANCEL'); },
		async runBulk(action, extra = {}) { try { const res = await this.$http.post(todoBulk, { ids: this.selectedIds, action, ...extra }); if (res.code !== 200) throw new Error(res.message); this.exitSelection(); this.load(); } catch (e) { uni.showToast({ title: e.message || '批量操作失败', icon: 'none' }); } },
		async exportTasks() { try { const res = await this.$http.get(todoExport, { format: 'markdown' }); if (res.code !== 200) throw new Error(res.message); uni.setClipboardData({ data: res.data.markdown, success: () => uni.showToast({ title: '已复制 Markdown', icon: 'none' }) }); } catch (e) { uni.showToast({ title: e.message || '导出失败', icon: 'none' }); } },
		goBack() { const pages = getCurrentPages(); if (pages.length > 1) uni.navigateBack(); else uni.switchTab({ url: '/pages/diary/index' }); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; border: 0; background: transparent; line-height: 1; }
button::after { border: 0; }
.todo-page { min-height: 100vh; background: #f3f1e9; color: #273129; }
.status-bar { background: #f3f1e9; }
.workspace { min-height: calc(100vh - env(safe-area-inset-top)); }
.desktop-sidebar { display: none; }
.main-panel { min-height: 100vh; }
.navbar { display: flex; align-items: center; gap: 18rpx; padding: 0 30rpx 20rpx; }
.back { width: 44rpx; color: #4d5850; font-size: 48rpx; }
.page-title { flex: 1; font: 700 38rpx/1.2 Georgia, 'Songti SC', serif; }
.nav-actions { display: flex; align-items: center; gap: 10rpx; }
.nav-actions > button { display: flex; height: 64rpx; min-width: 58rpx; align-items: center; justify-content: center; color: #59645c; font-size: 28rpx; }
.nav-actions .search-button { width: 64rpx; border-radius: 50%; background: rgba(255,255,255,.65); }
.nav-actions .manage-button { min-width: 82rpx; padding: 0 16rpx; border-radius: 21rpx; background: #e4e5dd; color: #4d5a50; font-size: 20rpx; font-weight: 680; }
.nav-actions .new-button { gap: 3rpx; padding: 0 19rpx; border-radius: 22rpx; background: #25352a; color: #f7f6ef; font-size: 25rpx; }
.new-button text { font-size: 21rpx; }
.search-row { display: flex; gap: 12rpx; padding: 0 30rpx 18rpx; }
.search-row input { min-width: 0; flex: 1; padding: 17rpx 21rpx; border-radius: 19rpx; background: #fffdf7; font-size: 23rpx; }
.search-row button { padding: 0 8rpx; color: #526057; font-size: 21rpx; }
.mobile-tabs { width: 100%; white-space: nowrap; border-bottom: 1rpx solid rgba(40,54,44,.1); }
.tab-row { display: flex; padding: 0 30rpx; }
.tab-row button { position: relative; flex: 1; min-width: 130rpx; padding: 20rpx 10rpx 22rpx; color: #7a827c; font-size: 23rpx; }
.tab-row button.active { color: #25352a; font-weight: 700; }
.tab-row button.active::after { position: absolute; right: 26rpx; bottom: 0; left: 26rpx; height: 4rpx; border-radius: 4rpx; background: #617244; content: ''; }
.content-scroll { height: calc(100vh - 205rpx - env(safe-area-inset-top)); }
.loading, .empty-copy { display: flex; flex-direction: column; align-items: center; padding: 100rpx 50rpx; color: #7a847d; font-size: 23rpx; text-align: center; }
.empty-copy > text:first-child { margin-bottom: 14rpx; color: #3e4a41; font: 600 29rpx/1.3 Georgia, 'Songti SC', serif; }
.empty-copy > text:last-of-type { max-width: 540rpx; line-height: 1.55; }
.empty-copy button { margin-top: 28rpx; padding: 17rpx 24rpx; border-radius: 20rpx; background: #dfe8bd; color: #3f5031; font-size: 22rpx; }
.coordination-card { display: flex; align-items: center; gap: 22rpx; margin: 28rpx 30rpx 4rpx; padding: 27rpx 25rpx; border: 1rpx solid rgba(76,96,55,.16); border-radius: 25rpx; background: linear-gradient(135deg, #e5ebcf, #f6f3e5); box-shadow: 0 12rpx 34rpx rgba(48,64,42,.07); }
.coordination-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 8rpx; }
.coordination-kicker { color: #617047; font-size: 16rpx; font-weight: 760; letter-spacing: 2rpx; }
.coordination-title { color: #29372c; font: 700 29rpx/1.25 Georgia, 'Songti SC', serif; }
.coordination-copy > text:last-child { color: #68736b; font-size: 19rpx; line-height: 1.5; }
.coordination-arrow { color: #637253; font-size: 44rpx; }
.task-section { margin: 28rpx 30rpx 0; padding: 0 24rpx; border: 1rpx solid rgba(38,52,42,.08); border-radius: 25rpx; background: rgba(255,253,247,.74); }
.section-heading { display: flex; align-items: center; justify-content: space-between; padding: 23rpx 0 9rpx; }
.section-heading > text { color: #606b63; font-size: 20rpx; font-weight: 700; letter-spacing: 1rpx; }
.section-heading button { color: #6a755f; font-size: 20rpx; }
.unscheduled-nudge { display: flex; align-items: center; gap: 18rpx; margin: 34rpx 30rpx; padding: 26rpx; border-radius: 24rpx; background: #e2e8d2; }
.unscheduled-nudge text { flex: 1; font-size: 23rpx; line-height: 1.5; }
.unscheduled-nudge button { padding: 14rpx 18rpx; border-radius: 16rpx; background: #52643d; color: #fff; font-size: 20rpx; }
.project-intro { display: flex; align-items: center; justify-content: space-between; gap: 24rpx; padding: 32rpx 30rpx 18rpx; color: #6d776f; font-size: 21rpx; line-height: 1.4; }
.project-intro button { flex: 0 0 auto; padding: 15rpx 18rpx; border-radius: 18rpx; background: #26372b; color: #fff; font-size: 20rpx; }
.project-row { display: flex; align-items: center; gap: 20rpx; margin: 14rpx 30rpx; padding: 26rpx; border-bottom: 1rpx solid rgba(39,52,42,.09); }
.project-row > view:first-child { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.project-name { color: #29352c; font-size: 27rpx; font-weight: 650; }
.project-goal { display: -webkit-box; margin-top: 10rpx; overflow: hidden; color: #7d867f; font-size: 20rpx; line-height: 1.45; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.project-counts { display: flex; flex-direction: column; align-items: flex-end; gap: 7rpx; color: #69756c; font-size: 18rpx; }
.safe-bottom { height: calc(150rpx + env(safe-area-inset-bottom)); }
.sheet-mask { position: fixed; z-index: 500; inset: 0; display: flex; align-items: flex-end; justify-content: center; background: rgba(18,26,20,.34); }
.sheet { width: 100%; max-height: 88vh; overflow-y: auto; padding: 13rpx 30rpx calc(28rpx + env(safe-area-inset-bottom)); box-sizing: border-box; border-radius: 34rpx 34rpx 0 0; background: #fbfaf4; box-shadow: 0 -20rpx 60rpx rgba(22,31,24,.16); }
.sheet.small { max-width: 760rpx; }
.sheet-handle { width: 66rpx; height: 6rpx; margin: 0 auto 22rpx; border-radius: 4rpx; background: #c8cec6; }
.sheet-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }
.sheet-heading > text, .sheet-heading > view > text:first-child { font: 700 31rpx/1.3 Georgia, 'Songti SC', serif; }
.sheet-heading > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }
.sheet-heading > view > text:last-child { color: #7b847d; font-size: 18rpx; line-height: 1.45; }
.sheet-heading button { padding: 12rpx; color: #768077; font-size: 21rpx; }
.manage-sheet { padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); }
.manage-section-label { display: block; margin: 29rpx 0 12rpx; color: #79837c; font-size: 16rpx; font-weight: 720; letter-spacing: 1.6rpx; }
.manage-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 13rpx; }
.manage-grid > button { display: flex; min-height: 118rpx; padding: 20rpx; flex-direction: column; align-items: flex-start; justify-content: center; gap: 8rpx; border-radius: 21rpx; background: #edf0e6; text-align: left; }
.manage-grid > button text:first-child, .manage-list > button view text:first-child { color: #29362d; font-size: 21rpx; font-weight: 700; }
.manage-grid > button text:last-child, .manage-list > button view text:last-child { color: #758078; font-size: 16rpx; line-height: 1.45; }
.manage-list { overflow: hidden; border-radius: 21rpx; background: #fff; }
.manage-list > button { display: flex; box-sizing: border-box; width: 100%; min-height: 103rpx; padding: 20rpx 22rpx; align-items: center; justify-content: space-between; gap: 18rpx; border-bottom: 1rpx solid #eaede7; text-align: left; }
.manage-list > button:last-child { border-bottom: 0; }.manage-list > button > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }.manage-list > button > text { color: #768078; font-size: 28rpx; }
.title-input { width: 100%; max-width: 100%; min-height: 90rpx; margin-top: 24rpx; box-sizing: border-box; color: #263129; font-size: 31rpx; line-height: 1.5; overflow-wrap: anywhere; }
.quick-fields { display: flex; flex-wrap: wrap; gap: 12rpx; margin: 17rpx 0; }
.quick-fields button { padding: 14rpx 18rpx; border: 1rpx solid #d9ddd5; border-radius: 18rpx; background: #fff; color: #68736b; font-size: 20rpx; }
.quick-fields button.active { border-color: #aab695; background: #e9eedb; color: #455438; }
.text-toggle { padding: 15rpx 0; color: #68746b; font-size: 21rpx; }
.detail-fields, .repeat-panel { padding: 19rpx; border-radius: 20rpx; background: #f0f0e9; }
.detail-fields textarea, .description-input { width: 100%; max-width: 100%; min-height: 110rpx; padding: 15rpx; box-sizing: border-box; border-radius: 15rpx; background: #fff; font-size: 22rpx; line-height: 1.55; overflow-wrap: anywhere; }
.field-line { display: flex; align-items: center; gap: 14rpx; min-height: 61rpx; border-bottom: 1rpx solid rgba(45,58,48,.08); color: #59655c; font-size: 21rpx; }
.field-line:last-child { border-bottom: 0; }
.field-line > text:first-child { flex: 1; }
.field-line input { width: 80rpx; text-align: right; }
.field-line button { color: #9b5b55; font-size: 18rpx; }
.week-days { display: flex; justify-content: space-between; padding: 15rpx 0; }
.week-days button { display: flex; width: 50rpx; height: 50rpx; align-items: center; justify-content: center; border-radius: 50%; background: #fff; color: #69736b; font-size: 19rpx; }
.week-days button.active { background: #52643d; color: #fff; }
.source-note { margin-top: 14rpx; color: #6f795e; font-size: 19rpx; }
.save-button { display: flex; width: 100%; height: 82rpx; align-items: center; justify-content: center; margin-top: 24rpx; border-radius: 23rpx; background: #26372b; color: #fff; font-size: 24rpx; font-weight: 700; }
.save-button[disabled] { opacity: .42; }
.project-sheet { padding-top: 13rpx; }
.project-field { display: flex; margin-top: 22rpx; padding: 20rpx 22rpx; flex-direction: column; gap: 10rpx; border: 1rpx solid rgba(42,57,46,.08); border-radius: 21rpx; background: #fff; }
.project-field > text { color: #59665d; font-size: 17rpx; font-weight: 700; }.project-field > text > text { color: #98a098; font-size: 15rpx; font-weight: 500; }
.project-field input { box-sizing: border-box; width: 100%; min-height: 60rpx; color: #263229; font-size: 27rpx; line-height: 1.4; }
.project-field textarea { box-sizing: border-box; width: 100%; min-height: 105rpx; color: #263229; font-size: 22rpx; line-height: 1.55; overflow-wrap: anywhere; }
.goal-field { margin-top: 13rpx; }
.coordination-sheet { max-width: 820rpx; }
.coordination-group { margin-top: 22rpx; padding: 22rpx; border: 1rpx solid rgba(45,61,48,.09); border-radius: 23rpx; background: #f2f2e9; }
.coordination-group-head { display: flex; align-items: flex-start; gap: 18rpx; padding-bottom: 15rpx; }
.coordination-group-head > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }
.coordination-group-head > view > text:first-child { color: #26352b; font-size: 25rpx; font-weight: 720; }
.coordination-group-head > view > text:last-child { color: #737d75; font-size: 17rpx; line-height: 1.45; }
.coordination-group-head > button { flex: 0 0 auto; padding: 14rpx 17rpx; border-radius: 17rpx; background: #52643d; color: #fff; font-size: 18rpx; }
.coordination-group-head > button[disabled] { opacity: .45; }
.coordination-task { display: flex; align-items: center; gap: 15rpx; padding: 17rpx 0; border-top: 1rpx solid rgba(45,61,48,.08); }
.coordination-task > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }
.coordination-task > view > text:first-child { color: #303d33; font-size: 21rpx; line-height: 1.4; }
.coordination-task > view > text:last-child { color: #899087; font-size: 16rpx; }
.coordination-task > button { flex: 0 0 auto; padding: 12rpx 0 12rpx 12rpx; color: #657456; font-size: 17rpx; }
.learned-note { display: block; padding-top: 12rpx; color: #68794f; font-size: 16rpx; }
.coordination-footnote { display: block; padding: 22rpx 8rpx 4rpx; color: #7c857e; font-size: 17rpx; line-height: 1.55; }
.undo-bar, .bulk-bar { position: fixed; right: 22rpx; bottom: calc(24rpx + env(safe-area-inset-bottom)); left: 22rpx; z-index: 600; display: flex; align-items: center; gap: 15rpx; padding: 20rpx 22rpx; border-radius: 22rpx; background: #1f2b23; color: #fff; box-shadow: 0 10rpx 36rpx rgba(20,28,22,.24); }
.undo-bar text, .bulk-bar text { min-width: 0; flex: 1; overflow: hidden; font-size: 21rpx; text-overflow: ellipsis; white-space: nowrap; }
.undo-bar button, .bulk-bar button { color: #dce9b9; font-size: 20rpx; }

@media (min-width: 900px) {
	.workspace { display: grid; grid-template-columns: 250px minmax(0, 760px); justify-content: center; gap: 38px; padding: 40px; box-sizing: border-box; }
	.desktop-sidebar { display: flex; position: sticky; top: 40px; height: fit-content; flex-direction: column; padding: 29px 20px; border: 1px solid rgba(38,52,42,.08); border-radius: 24px; background: rgba(255,253,247,.74); }
	.brand { color: #78827a; font-size: 11px; letter-spacing: 2px; }
	.sidebar-title { margin: 13px 0 24px; font: 700 31px/1.2 Georgia, serif; }
	.sidebar-section-label { margin: 5px 15px 7px; color: #929a93; font-size: 10px; font-weight: 700; letter-spacing: 1.4px; }
	.desktop-sidebar button { padding: 13px 15px; border-radius: 13px; color: #657067; font-size: 15px; text-align: left; }
	.desktop-sidebar button.active { background: #e2e8d2; color: #2e3c31; font-weight: 700; }
	.sidebar-divider { height: 1px; margin: 15px 8px; background: rgba(38,52,42,.09); }
	.main-panel { max-height: calc(100vh - 80px); border: 1px solid rgba(38,52,42,.08); border-radius: 28px; background: rgba(255,253,247,.46); overflow: hidden; }
	.mobile-tabs { display: none; }
	.navbar { padding: 28px 30px 20px !important; }
	.back { display: none; }
	.content-scroll { height: calc(100vh - 170px); }
	.sheet { max-width: 720px; margin-bottom: 28px; border-radius: 28px; }
}
</style>
