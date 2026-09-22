<template>
	<view class="diary-page">
		<!-- 状态栏占位 -->
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

		<!-- 紧凑日期控制区：保留菇的颜色，学习 aDiary 的信息密度。 -->
		<view class="title-row" :style="{ paddingTop: (customBarHeightRpx + 10) + 'rpx' }">
			<view class="selected-date-label" @tap="showFullCalendar">
				<text class="selected-date-text">{{ isSelectedToday ? '菇日记' : selectedDateHeaderTitle }}</text>
				<view class="date-dropdown-arrow" aria-hidden="true"></view>
				<text class="today-jump" v-if="!isSelectedToday" @tap.stop="goToday">回到今天</text>
			</view>
			<view class="home-top-controls" aria-label="首页控制">
				<button data-testid="home-open-view-panel" class="home-top-control view-trigger" :class="{ active: activeHomePanel === 'view' }" aria-label="视图" @tap.stop="openHomePanel('view')">
					<view class="view-control-glyph"><text></text><text></text><text></text></view>
				</button>
				<button data-testid="home-open-options-panel" class="home-top-control" :class="{ active: activeHomePanel === 'options' }" aria-label="选项" @tap.stop="openHomePanel('options')">
					<view class="options-control-glyph"><text></text><text></text><text></text></view>
				</button>
				<button data-testid="home-open-settings" class="home-top-control" :class="{ active: activeHomePanel === 'settings' }" aria-label="首页设置" @tap.stop="openHomePanel('settings')"><text class="settings-control-glyph">⚙</text></button>
			</view>
		</view>

		<swiper class="week-swiper" v-if="periodView === 'day' && homePreferences.showWeekStrip" :key="weekAnchorKey" :current="weekSwipeIndex" :duration="260" @change="onWeekSwipeChange">
			<swiper-item v-for="week in weekPages" :key="week.key">
				<view class="date-selector">
					<view
					class="date-cell"
					v-for="(date, index) in week.dates"
					:key="date.date"
					:data-date="date.date"
						:class="{ active: date.isSelected, 'has-diary': date.hasDiary }"
						@tap="selectDate(date.date)"
					>
						<text class="weekday-item">{{ weekdays[index] }}</text>
						<text class="date-number">{{ date.day }}</text>
						<text class="date-dot"></text>
					</view>
				</view>
			</swiper-item>
		</swiper>

		<view class="home-discovery" v-if="periodView === 'day'">
			<button class="home-search-entry" data-testid="home-search-diary" @tap="goToSearch">
				<text class="home-search-icon">⌕</text>
				<text>搜索日记</text>
			</button>
			<view class="home-pending-review" data-testid="home-pending-wellbeing" v-if="isSelectedToday && hasPendingWellbeingChanges" @tap="openWellbeing">
				<view><text>最近有变化待确认</text><text>{{ pendingWellbeingPreview }}</text></view>
				<view><text>{{ pendingWellbeingCount }} 条</text><text>›</text></view>
			</view>
		</view>

		<view v-if="periodView === 'day'" :key="selectedDate" class="day-content" :class="dateMotionClass" @animationend="dateMotionClass = ''">

		<view class="day-flow-view" v-if="dayViewMode === 'flow'">
			<view class="stream-day-header">
				<view><text>{{ streamDayNumber }}</text><text>{{ streamWeekday }}</text><text>{{ streamMonthYear }}</text></view>
				<text>{{ dayStreamEntries.length }} 条</text>
			</view>
			<view class="day-stream" v-if="dayStreamEntries.length">
				<view
					class="stream-entry"
					v-for="entry in dayStreamEntries"
					:key="entry.key"
					:class="'entry-' + entry.tone"
					@tap="openDayEntry(entry)"
				>
					<view class="stream-time" :class="{ 'time-open': !entry.endLabel }">
						<text>{{ entry.startLabel }}</text>
						<text v-if="entry.durationLabel">{{ entry.durationLabel }}</text>
						<text v-if="entry.endLabel">{{ entry.endLabel }}</text>
					</view>
					<view class="stream-entry-body">
						<view class="stream-media" v-if="entry.images && entry.images.length">
							<image v-for="(image, imageIndex) in entry.images.slice(0, 3)" :key="imageIndex" :src="image" mode="aspectFill"></image>
						</view>
						<text class="stream-entry-title">{{ entry.title }}</text>
						<text class="stream-entry-copy" v-if="entry.copy">{{ entry.copy }}</text>
						<view class="stream-entry-footer">
							<text class="entry-badge">{{ entry.badge }}</text>
							<text v-if="entry.meta && homePreferences.showFlowMeta">{{ entry.meta }}</text>
						</view>
					</view>
					<button v-if="entry.kind === 'plan'" class="todo-complete" :disabled="completingTodoId === entry.payload.id" @tap.stop="completeTodoFromHome(entry.payload)" aria-label="完成待办">{{ completingTodoId === entry.payload.id ? '…' : '○' }}</button>
				</view>
			</view>

			<view class="flow-empty" v-if="!dayStreamEntries.length">
				<text>这一天还没有留下内容</text>
				<text>{{ isSelectedToday ? '点“记录”，用录音或文字留下第一条真实记录。' : (isSelectedPast ? '今天可以补充当下，过去的日记只能查看。' : '这一天还没有安排或记录。') }}</text>
			</view>

		</view>

		<view class="timeline-view" v-else>
			<view class="timeline-toolbar">
				<text>按真实时间排列 · 拖动下方入口到时间轴</text>
			</view>
			<view class="timeline-untimed" v-if="untimedSelectedPlans.length">
				<text>未安排时间 · {{ untimedSelectedPlans.length }} 项计划</text>
				<text>计划不代表已经发生</text>
			</view>
			<view
				class="timeline-stage"
				:class="{ 'capture-drop-active': captureDrag.moved, 'capture-drop-ready': captureDrag.overTimeline }"
				:style="{ height: timelineStageHeight + 'rpx' }"
			>
				<view class="timeline-hour" v-for="hour in timelineHours" :key="hour" :style="{ top: timelineHourTop(hour) }">
					<text>{{ timelineHourLabel(hour) }}</text><view></view>
				</view>
				<view
					class="timeline-gap-marker"
					v-for="gap in timelineGaps"
					:key="gap.key"
					:class="{ collapsed: gap.collapsed, expanded: !gap.collapsed, locked: isSelectedPast }"
					:style="{ top: gap.top + 'rpx', height: gap.height + 'rpx' }"
				>
					<button
						:disabled="isSelectedPast"
						:aria-label="timelineGapLabel(gap)"
						@tap.stop="toggleTimelineGap(gap)"
					><text>↕</text><text>{{ gap.hours }}h</text></button>
				</view>
				<view class="timeline-events-layer">
					<view
						class="timeline-event"
						v-for="entry in timelineEntries"
						:key="entry.key"
						:class="['entry-' + entry.tone, { 'is-compact': entry.layoutColumnCount > 1 }]"
						:style="entry.timelineStyle"
						@tap.stop="openDayEntry(entry)"
					>
						<view class="timeline-event-main"><text class="timeline-source-icon">{{ entry.sourceIcon }}</text><text>{{ entry.title }}</text></view>
						<view class="timeline-event-meta"><text>{{ timelineRangeLabel(entry) }}</text><text>{{ entry.badge }}</text></view>
						<button v-if="entry.kind === 'plan'" class="timeline-todo-complete" :disabled="completingTodoId === entry.payload.id" @tap.stop="completeTodoFromHome(entry.payload)" aria-label="完成待办">○</button>
					</view>
					<view v-if="timelineSelection.active" class="timeline-selection" :class="'selection-' + captureDrag.kind" :style="timelineSelectionStyle"><text>{{ timelineSelectionLabel }}</text></view>
				</view>
			</view>
			<view class="timeline-empty" v-if="!timelineEntries.length">
				<text class="timeline-empty-title">这一天没有带时间的记录</text>
				<text class="timeline-empty-copy">全天日记仍会保留在列表视图；计划没有具体时间时也不会被伪造到时间轴。</text>
			</view>
		</view>
		</view>

		<view v-if="periodView !== 'day'" class="period-overview-shell">
			<view class="period-navigation">
				<button @tap="movePeriod(-1)" aria-label="上一个时间段">‹</button>
				<view><text>{{ periodViewTitle }}</text><text>{{ periodSummary }}</text></view>
				<button @tap="movePeriod(1)" aria-label="下一个时间段">›</button>
			</view>
			<view v-if="periodLoading" class="period-loading"><view></view><text>正在整理这段时间…</text></view>

			<scroll-view v-else-if="periodView === 'week'" class="week-overview" scroll-x :show-scrollbar="false">
				<view class="week-columns">
					<view v-for="day in weekOverviewDays" :key="day.date" class="week-column" :class="{ today: day.isToday }">
						<view class="week-day-heading" @tap="openPeriodDay(day.date)">
							<text>{{ day.weekday }}</text><text>{{ day.day }}</text><text>{{ day.totalCount }} 项</text>
						</view>
						<view v-if="!day.entries.length" class="week-day-empty">留白</view>
						<view v-for="entry in day.entries" :key="entry.key" class="period-entry" :class="'entry-' + entry.tone" @tap="openPeriodEntry(entry)">
							<view><text class="period-source-icon">{{ entry.sourceIcon }}</text><text>{{ periodEntryTime(entry) }}</text></view>
							<text class="period-entry-title">{{ entry.title }}</text><text class="period-entry-badge">{{ entry.badge }}</text>
						</view>
					</view>
				</view>
			</scroll-view>

			<view v-else-if="periodView === 'month'" class="month-overview">
				<view class="month-weekdays"><text v-for="weekday in weekdays" :key="weekday">{{ weekday }}</text></view>
				<view class="month-grid">
					<view v-for="day in monthGridDays" :key="day.date" class="month-day" :class="{ outside: !day.inMonth, selected: day.isSelected, today: day.isToday }" @tap="selectMonthDay(day.date)">
						<text class="month-day-number">{{ day.day }}</text>
						<view class="month-day-count" v-if="day.totalCount">{{ day.totalCount }}</view>
						<view class="month-day-signals">
							<text v-if="day.diaryCount" class="signal-diary"></text><text v-if="day.planCount" class="signal-plan"></text><text v-if="day.completedCount" class="signal-action"></text><text v-if="day.sourceCount" class="signal-source"></text>
						</view>
					</view>
				</view>
				<view class="period-legend"><view><text class="signal-diary"></text><text>日记</text></view><view><text class="signal-plan"></text><text>计划</text></view><view><text class="signal-action"></text><text>完成</text></view><view><text class="signal-source"></text><text>数据源</text></view></view>
				<view class="month-selected-day">
					<view class="selected-day-heading"><text>{{ selectedDateMonthLabel }}</text><button @tap="openPeriodDay(selectedDate)">进入日视图</button></view>
					<text v-if="!selectedPeriodEntries.length" class="selected-day-empty">这一天没有记录或安排</text>
					<view v-for="entry in selectedPeriodEntries" :key="entry.key" class="month-agenda-entry" @tap="openPeriodEntry(entry)"><text>{{ entry.sourceIcon }}</text><view><text>{{ entry.title }}</text><text>{{ periodEntryTime(entry) }} · {{ entry.badge }}</text></view></view>
					<text v-if="selectedPeriodEntries.some(entry => entry.kind === 'PLAN')" class="plan-boundary">计划不代表已经发生</text>
				</view>
			</view>

			<view v-else class="year-overview">
				<view class="year-summary"><text>{{ momentYear }} 年</text><text>{{ activeYearDays }} 个有内容的日子 · {{ periodOverview.entries.length }} 项记录与计划</text></view>
				<view class="year-months">
					<view v-for="month in yearMonths" :key="month.key" class="year-month" @tap="openYearMonth(month)">
						<view class="year-month-heading"><text>{{ month.label }}</text><text>{{ month.activeDays }} 天</text></view>
						<view class="mini-weekdays"><text v-for="weekday in weekdays" :key="weekday">{{ weekday }}</text></view>
						<view class="mini-days"><text v-for="day in month.days" :key="day.key" :class="['level-' + day.activityLevel, { blank: day.blank }]">{{ day.blank ? '' : day.day }}</text></view>
					</view>
				</view>
			</view>
		</view>

		<view class="capture-dock" v-if="periodView === 'day' && isSelectedToday">
			<button class="record-capture" data-testid="home-create-diary" @tap="handleCaptureTap('record')" @touchstart="beginCaptureDrag('record', $event)" @touchmove.stop.prevent="updateCaptureDrag" @touchend.stop="finishCaptureDrag" @touchcancel="cancelCaptureDrag" @mousedown="beginCaptureDrag('record', $event)"><text>□</text><text>记录</text><text class="capture-grip">≡</text></button>
			<button class="todo-capture" data-testid="home-create-todo" @tap="handleCaptureTap('todo')" @touchstart="beginCaptureDrag('todo', $event)" @touchmove.stop.prevent="updateCaptureDrag" @touchend.stop="finishCaptureDrag" @touchcancel="cancelCaptureDrag" @mousedown="beginCaptureDrag('todo', $event)"><text>○</text><text>待办</text><text class="capture-grip">≡</text></button>
		</view>
		<view v-if="captureDrag.moved" class="capture-drag-ghost" :class="'ghost-' + captureDrag.kind" :style="captureDragGhostStyle"><text>{{ captureDrag.label }}</text><text>{{ captureDrag.overTimeline ? formatMinutes(captureDrag.minutes) : '拖到时间轴' }}</text></view>

		<view class="view-popover-mask" v-if="activeHomePanel === 'view'" @tap="closeHomePanel">
			<view class="view-popover" :style="viewPopoverStyle" data-testid="home-view-panel" @tap.stop>
				<text class="view-popover-label">视图</text>
				<button data-testid="home-day-flow" :class="{ active: periodView === 'day' && dayViewMode === 'flow' }" @tap="selectHomeView('day', 'flow')">
					<text class="popover-check">✓</text><view class="list-view-icon"><text></text><text></text><text></text></view><text>列表</text>
				</button>
				<button data-testid="home-day-timeline" :class="{ active: periodView === 'day' && dayViewMode === 'timeline' }" @tap="selectHomeView('day', 'timeline')">
					<text class="popover-check">✓</text><view class="timeline-view-icon"><text></text><text></text><text></text></view><text>时间轴</text>
				</button>
				<view class="popover-divider"></view>
				<button data-testid="home-view-week" :class="{ active: periodView === 'week' }" @tap="selectHomeView('week')"><text class="popover-check">✓</text><text class="popover-period-icon">▥</text><text>周视图</text></button>
				<button data-testid="home-view-month" :class="{ active: periodView === 'month' }" @tap="selectHomeView('month')"><text class="popover-check">✓</text><text class="popover-period-icon">▦</text><text>月视图</text></button>
				<button data-testid="home-view-year" :class="{ active: periodView === 'year' }" @tap="selectHomeView('year')"><text class="popover-check">✓</text><text class="popover-period-icon">▦</text><text>年视图</text></button>
			</view>
		</view>

		<view class="home-panel-mask" v-if="activeHomePanel === 'options' || activeHomePanel === 'settings'" @tap="closeHomePanel">
			<view class="home-control-sheet" @tap.stop>
				<view class="sheet-handle"></view>
				<view class="sheet-header">
					<text>{{ activeHomePanel === 'settings' ? '首页设置' : '选项' }}</text>
					<button @tap="closeHomePanel">完成</button>
				</view>

				<scroll-view v-if="activeHomePanel === 'options'" scroll-y class="sheet-body options-sheet-body" data-testid="home-options-panel">
					<text class="sheet-section-label">显示内容</text>
					<view class="panel-source-options">
						<button class="panel-source-option" v-for="option in sourceFilterOptions" :key="option.key" :class="{ active: activeSourceFilter === option.key }" @tap="selectSourceFilter(option.key)">
							<text class="panel-source-icon">{{ option.icon }}</text><view><text>{{ option.label }}</text><text>{{ option.count }} 条</text></view><text class="choice-check">✓</text>
						</button>
					</view>
					<text class="sheet-section-label">快捷入口</text>
					<view class="sheet-quick-actions">
						<button @tap="goToSearch"><text>⌕</text><view><text>搜索与回看</text><text>查找日记和过去的记录</text></view><text>›</text></button>
						<button data-testid="home-open-todos" @tap="goToTodoList"><text>✓</text><view><text>全部待办</text><text>{{ pendingTodoCount ? pendingTodoCount + ' 项待完成' : '没有待完成事项' }}</text></view><text>›</text></button>
					</view>
				</scroll-view>

				<scroll-view v-else scroll-y class="sheet-body settings-sheet-body" data-testid="home-settings-panel">
					<text class="sheet-setting-note">这里只调整日记首页，不影响应用其他页面。</text>
					<text class="sheet-section-label">进入首页时</text>
					<view class="default-view-options" data-testid="home-default-view-options">
						<button v-for="option in defaultHomeViewOptions" :key="option.key" :class="{ active: homePreferences.defaultView === option.key }" @tap="selectDefaultHomeView(option.key)">
							<text>{{ option.label }}</text><text>✓</text>
						</button>
					</view>
					<text class="default-view-note">下次进入菇日记时，自动打开这里选择的视图。</text>
					<text class="sheet-section-label">显示细节</text>
					<view class="home-setting-options">
						<view class="home-setting-row">
							<view><text>显示一周日期</text><text>在标题下方保留七天切换</text></view>
							<switch :checked="homePreferences.showWeekStrip" color="#42634A" @change="updateHomePreference('showWeekStrip', $event)" />
						</view>
						<view class="home-setting-row">
							<view><text>显示列表来源说明</text><text>在标签后展示数据来源与状态</text></view>
							<switch :checked="homePreferences.showFlowMeta" color="#42634A" @change="updateHomePreference('showFlowMeta', $event)" />
						</view>
					</view>
				</scroll-view>
			</view>
		</view>

		<!-- #ifdef H5 -->
		<view class="icp-footer" @tap="openIcpRecord">琼ICP备2020004041号-1</view>
		<!-- #endif -->


		<!-- 全屏日历弹窗 -->
		<view class="full-calendar-mask" v-if="showFullCalendarView" @click="closeFullCalendar">
			<view class="full-calendar-content" @click.stop>
				<view class="full-calendar-header">
					<text class="full-calendar-title">选择日期</text>
					<text class="full-calendar-close" @click="closeFullCalendar">×</text>
				</view>
				<view class="full-calendar-body">
					<uni-calendar
						ref="fullCalendar"
						:insert="true"
						:show-month="false"
						:date="selectedDate"
						:selected="diaryDates"
						@confirm="onFullCalendarConfirm"
						@change="onFullCalendarChange"
						@monthSwitch="onFullCalendarMonthSwitch"
					/>
				</view>
			</view>
		</view>

	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { diaryCalendar, diaryList, diaryOverview } from '@/api/diary';
import { todoList, todoStatus } from '@/api/todo';
import { wellbeingSummary } from '@/api/wellbeing';
import diaryTime from '@/utils/diary-time.js';
import diaryPreviewUtils from '@/utils/diary-preview.js';
import dayTimeline from '@/utils/day-timeline.js';

const { diaryLocalDate, diaryTimeLabel, hasExplicitDiaryTime, isFullDayDiary } = diaryTime;
const { diaryPreview } = diaryPreviewUtils;
const { buildTimelineLayout, minutesForTimelineOffset, timelineOffsetForMinutes } = dayTimeline;
const HOME_PREFERENCES_STORAGE_KEY = 'shroom_home_preferences_v1';
const DEFAULT_HOME_VIEW = 'timeline';
const DEFAULT_HOME_VIEW_KEYS = ['flow', 'timeline', 'week', 'month', 'year'];

export default {
	data() {
		return {
			statusBarHeight: 0,
			customBarHeight: 0,
			currentMonthText: '',
			currentDay: '',
			selectedDate: moment().format('YYYY-MM-DD'),
			selectedMonth: moment().format('YYYY-MM'),
			calendarDisplayMonth: moment().format('YYYY-MM'),
			weekdays: ['日', '一', '二', '三', '四', '五', '六'],
			visibleDates: [],
			diaryList: [],
			calendarDateCounts: [],
			refreshing: false,
			diaryRequestSequence: 0,
			calendarRequestSequence: 0,
			periodRequestSequence: 0,
			dayViewMode: 'timeline',
			periodView: 'day',
			periodLoading: false,
			periodOverview: { days: [], entries: [] },
			activeSourceFilter: 'all',
			activeHomePanel: '',
			viewPopoverStyle: { top: '110px', right: '28px' },
			homePreferences: { defaultView: DEFAULT_HOME_VIEW, showWeekStrip: true, showFlowMeta: true },
			weekSwipeIndex: 1,
			weekSwipeResetting: false,
			dateMotionClass: '',
			completingTodoId: '',
			timelineSelection: { active: false, startMinutes: 0, endMinutes: 0 },
			expandedTimelineGapKeys: [],
			timelineStageRect: null,
			captureDrag: { active: false, moved: false, kind: '', label: '', startX: 0, startY: 0, clientX: 0, clientY: 0, overTimeline: false, minutes: null },
			captureTapSuppressedUntil: 0,
			timeSlots: [],
			actionRecords: [],
			activityRecords: [],
			pendingTodos: [],
			visitorCount: 0,
			showFullCalendarView: false,
			pendingTodoCount: 0, // 待完成待办数量
			wellbeingOverview: null,
			// 默认图片URL
			defaultImageUrl: 'https://images.unsplash.com/photo-1493612276216-ee3925520721?w=800&h=600&fit=crop'
		};
	},
		computed: {
			isSelectedToday() {
				return this.selectedDate === moment().format('YYYY-MM-DD');
			},
			isSelectedPast() {
				return this.selectedDate < moment().format('YYYY-MM-DD');
			},
			isSelectedFuture() {
				return this.selectedDate > moment().format('YYYY-MM-DD');
			},
			defaultHomeViewOptions() {
				return [
					{ key: 'timeline', label: '时间轴' },
					{ key: 'flow', label: '列表' },
					{ key: 'week', label: '周' },
					{ key: 'month', label: '月' },
					{ key: 'year', label: '年' }
				];
			},
			weekPages() {
				return [-7, 0, 7].map(offset => {
					const anchor = moment(this.selectedDate).add(offset, 'days');
					const start = moment(anchor).startOf('week');
					const dates = Array.from({ length: 7 }, (_, index) => {
						const date = moment(start).add(index, 'days');
						const dateString = date.format('YYYY-MM-DD');
						return { date: dateString, day: date.format('D'), isSelected: dateString === this.selectedDate, hasDiary: this.hasDiaryOnDate(dateString) };
					});
					return { key: `${start.format('YYYY-MM-DD')}-${offset}`, dates };
				});
			},
			selectedDateTitle() {
				const date = moment(this.selectedDate);
				const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
				return `${date.format('YYYY/MM/DD')} ${weekdays[date.day()]}`;
			},
			selectedDateHeaderTitle() {
				return moment(this.selectedDate).format('YYYY/MM/DD');
			},
			weekAnchorKey() {
				return moment(this.selectedDate).startOf('week').format('YYYY-MM-DD');
			},
			displayPeriodTitle() {
				return this.periodView === 'day' ? this.selectedDateTitle : this.periodViewTitle;
			},
			periodRange() {
				const anchor = moment(this.selectedDate);
				if (this.periodView === 'week') {
					const start = moment(anchor).startOf('week');
					return { start: start.format('YYYY-MM-DD'), end: moment(start).add(6, 'days').format('YYYY-MM-DD') };
				}
				if (this.periodView === 'year') return { start: anchor.format('YYYY-01-01'), end: anchor.format('YYYY-12-31') };
				return { start: moment(anchor).startOf('month').format('YYYY-MM-DD'), end: moment(anchor).endOf('month').format('YYYY-MM-DD') };
			},
			periodViewTitle() {
				const anchor = moment(this.selectedDate);
				if (this.periodView === 'week') {
					const start = moment(anchor).startOf('week');
					const end = moment(start).add(6, 'days');
					return start.format('YYYY') === end.format('YYYY')
						? `${start.format('YYYY/M/D')} — ${end.format('M/D')}`
						: `${start.format('YYYY/M/D')} — ${end.format('YYYY/M/D')}`;
				}
				if (this.periodView === 'year') return `${anchor.format('YYYY')} 年`;
				return anchor.format('YYYY 年 M 月');
			},
			periodDayMap() {
				const map = {};
				;(this.periodOverview.days || []).forEach(day => { map[day.date] = day; });
				return map;
			},
			periodEntriesMap() {
				const map = {};
				;(this.periodOverview.entries || []).forEach(entry => {
					if (!map[entry.date]) map[entry.date] = [];
					map[entry.date].push(entry);
				});
				return map;
			},
			periodSummary() {
				const days = this.periodOverview.days || [];
				const entries = this.periodOverview.entries || [];
				return `${days.length} 个有内容的日子 · ${entries.length} 项`;
			},
			weekOverviewDays() {
				const start = moment(this.selectedDate).startOf('week');
				return Array.from({ length: 7 }, (_, index) => {
					const date = moment(start).add(index, 'days');
					const dateString = date.format('YYYY-MM-DD');
					const stats = this.periodDayMap[dateString] || {};
					return {
						date: dateString,
						day: date.format('D'),
						weekday: `周${this.weekdays[date.day()]}`,
						isToday: dateString === moment().format('YYYY-MM-DD'),
						entries: this.periodEntriesMap[dateString] || [],
						totalCount: Number(stats.totalCount || 0)
					};
				});
			},
			monthGridDays() {
				const month = moment(this.selectedDate).startOf('month');
				const gridStart = moment(month).startOf('week');
				return Array.from({ length: 42 }, (_, index) => {
					const date = moment(gridStart).add(index, 'days');
					const dateString = date.format('YYYY-MM-DD');
					const stats = this.periodDayMap[dateString] || {};
					return {
						date: dateString, day: date.format('D'), inMonth: date.format('YYYY-MM') === month.format('YYYY-MM'),
						isSelected: dateString === this.selectedDate, isToday: dateString === moment().format('YYYY-MM-DD'),
						diaryCount: Number(stats.diaryCount || 0), planCount: Number(stats.planCount || 0),
						completedCount: Number(stats.completedCount || 0), sourceCount: Number(stats.sourceCount || 0),
						totalCount: Number(stats.totalCount || 0)
					};
				});
			},
			selectedPeriodEntries() {
				return this.periodEntriesMap[this.selectedDate] || [];
			},
			selectedDateMonthLabel() {
				const date = moment(this.selectedDate);
				return `${date.format('M月D日')} · 周${this.weekdays[date.day()]}`;
			},
			momentYear() { return moment(this.selectedDate).format('YYYY'); },
			activeYearDays() { return (this.periodOverview.days || []).length; },
			yearMonths() {
				const year = Number(moment(this.selectedDate).format('YYYY'));
				return Array.from({ length: 12 }, (_, monthIndex) => {
					const month = moment(`${year}-${String(monthIndex + 1).padStart(2, '0')}-01`);
					const count = Number(moment(month).endOf('month').format('D'));
					const leading = month.day();
					const days = [];
					for (let index = 0; index < leading; index++) days.push({ key: `blank-${index}`, blank: true, day: '', activityLevel: 0 });
					let activeDays = 0;
					for (let day = 1; day <= count; day++) {
						const dateString = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
						const total = Number(this.periodDayMap[dateString] && this.periodDayMap[dateString].totalCount || 0);
						if (total) activeDays += 1;
						days.push({ key: dateString, blank: false, day, activityLevel: Math.min(3, total) });
					}
					while (days.length % 7) days.push({ key: `tail-${days.length}`, blank: true, day: '', activityLevel: 0 });
					return { key: month.format('YYYY-MM'), label: `${monthIndex + 1}月`, date: month.format('YYYY-MM-DD'), activeDays, days };
				});
			},
			streamDayNumber() {
				return moment(this.selectedDate).format('D');
			},
			streamWeekday() {
				return `周${this.weekdays[moment(this.selectedDate).day()]}`;
			},
			streamMonthYear() {
				return moment(this.selectedDate).format('YYYY年M月');
			},
		dayName() {
			const date = moment(this.selectedDate);
			const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
			return `${date.format('M月D日')} · ${weekdays[date.day()]}`;
		},
		timedDiarySlots() {
			return this.timeSlots;
		},
		timedDiaryCount() {
			return this.timeSlots.filter(slot => slot.diary).length;
		},
		timedDiarySummary() {
			if (this.isSelectedToday) return `${this.timedDiaryCount} 条已记录 · 28 个时段`;
			return this.timedDiaryCount ? `${this.timedDiaryCount} 条时刻记录 · 只读` : '这一天没有时刻记录';
		},
		fullDayEmptyText() {
			return this.isSelectedToday ? '今天还没有整篇日记' : '这一天没有整篇日记';
		},
		selectedDiaries() {
			return this.diaryList.filter(diary => diaryLocalDate(diary) === this.selectedDate).sort((left, right) => {
				const leftMinutes = hasExplicitDiaryTime(left) ? Number(left.hour) * 60 + Number(left.minute) : -1;
				const rightMinutes = hasExplicitDiaryTime(right) ? Number(right.hour) * 60 + Number(right.minute) : -1;
				return rightMinutes - leftMinutes;
			});
		},
		selectedDiaryCount() {
			return this.selectedDiaries.length;
		},
			selectedPlans() {
				return this.pendingTodos.filter(todo => todo.scheduledDate === this.selectedDate && ['pending', 'in_progress'].includes(todo.status));
			},
			untimedSelectedPlans() {
				return this.selectedPlans.filter(todo => this.clockMinutes(todo.scheduledStartTime) === null);
			},
			allDayStreamEntries() {
				const entries = [];
				this.selectedPlans.forEach((plan, index) => {
					const startMinutes = this.clockMinutes(plan.scheduledStartTime);
					const endMinutes = this.clockMinutes(plan.scheduledEndTime);
					entries.push({
					key: `plan-${plan.id || index}`,
					kind: 'plan',
					tone: 'plan',
					filterKey: 'todo', sourceLabel: '待办', sourceIcon: '○',
					startLabel: startMinutes === null ? '计划' : this.formatMinutes(startMinutes),
					endLabel: endMinutes === null ? '' : this.formatMinutes(endMinutes),
					durationLabel: startMinutes !== null && endMinutes !== null ? `${Math.max(15, endMinutes - startMinutes)}m` : '',
					title: plan.title || plan.content || '未命名计划',
					copy: plan.projectName || '计划，不代表已经发生',
					badge: '计划',
					meta: '未发生',
					images: [],
					actualMinutes: startMinutes,
					sortMinutes: startMinutes === null ? 1500 - index : startMinutes,
					durationMinutes: startMinutes !== null && endMinutes !== null ? endMinutes - startMinutes : 0,
					payload: plan
					});
				});
				this.selectedDiaries.forEach((diary, index) => {
					const minutes = this.diaryEntryMinutes(diary);
					const voiceMinutes = diary.voice && diary.voice.duration ? Math.max(1, Math.ceil(Number(diary.voice.duration) / 60)) : 0;
					entries.push({
						key: `diary-${diary.id || index}`,
						kind: 'diary',
						tone: diary.voice ? 'voice' : 'diary',
						filterKey: 'diary', sourceLabel: diary.voice ? '语音日记' : '日记', sourceIcon: diary.voice ? '声' : '文',
						startLabel: minutes === null ? '全天' : this.formatMinutes(minutes),
						endLabel: voiceMinutes && minutes !== null ? this.formatMinutes(minutes + voiceMinutes) : '',
						durationLabel: voiceMinutes ? `${voiceMinutes}m` : '',
						title: this.getDiaryPreview(diary),
						copy: diary.voice ? '原始语音已保留' : '',
						badge: diary.voice ? '语音日记' : '日记',
						meta: diary.mood || '',
						images: Array.isArray(diary.images) ? diary.images : [],
						actualMinutes: minutes,
						sortMinutes: minutes === null ? 720 - index : minutes,
						durationMinutes: voiceMinutes,
						payload: diary
					});
				});
				this.actionRecords.forEach((record, index) => {
					const minutes = this.timestampMinutes(record.completedAt);
					entries.push({
						key: `action-${record.id || index}`,
						kind: 'action', tone: 'action',
						filterKey: 'todo', sourceLabel: '待办', sourceIcon: '✓',
						startLabel: minutes === null ? '完成' : this.formatMinutes(minutes),
						endLabel: '', durationLabel: '',
						title: record.title || '已完成行动',
						copy: record.result ? `结果：${record.result}` : '',
						badge: '完成记录', meta: record.projectName || '', images: [],
						actualMinutes: minutes,
						sortMinutes: minutes === null ? 710 - index : minutes,
						payload: record
					});
				});
				this.activityRecords.forEach((record, index) => {
					const minutes = this.timestampMinutes(record.completedAt);
					const provider = String(record.source || 'external').toLowerCase();
					const isCodex = provider === 'codex';
					entries.push({
						key: `source-${record.id || index}`,
						kind: 'source', tone: isCodex ? 'codex' : 'source',
						filterKey: provider, sourceLabel: isCodex ? 'Codex' : (record.sourceName || '数据源'), sourceIcon: isCodex ? 'C' : '◇',
						startLabel: minutes === null ? '外部' : this.formatMinutes(minutes),
						endLabel: '', durationLabel: '',
						title: record.title || '外部活动',
						copy: this.activityMeta(record),
						badge: isCodex ? 'Codex 任务' : '外部观测', meta: '来自已连接的数据源 · 不代表现实结果', images: [],
						actualMinutes: minutes,
						sortMinutes: minutes === null ? 700 - index : minutes,
						payload: record
					});
				});
				const wellbeingRecords = this.wellbeingOverview && this.wellbeingOverview.records || [];
				wellbeingRecords.filter(record => record.recordedOn === this.selectedDate).forEach((record, index) => entries.push({
					key: `wellbeing-${record.id || index}`,
					kind: 'wellbeing', tone: 'wellbeing',
					filterKey: 'wellbeing', sourceLabel: '身心', sourceIcon: '◇',
					startLabel: '全天', endLabel: '', durationLabel: '',
					title: this.wellbeingRecordPreview(record), copy: '',
					badge: '身心记录', meta: record.status === 'PENDING' ? '等待你确认' : '已确认', images: [],
					actualMinutes: null, sortMinutes: 690 - index, payload: record
				}));
				return entries.sort((left, right) => right.sortMinutes - left.sortMinutes);
			},
			dayStreamEntries() {
				return this.activeSourceFilter === 'all'
					? this.allDayStreamEntries
					: this.allDayStreamEntries.filter(entry => entry.filterKey === this.activeSourceFilter);
			},
			sourceFilterOptions() {
				const groups = new Map();
				this.allDayStreamEntries.forEach(entry => {
					if (!groups.has(entry.filterKey)) groups.set(entry.filterKey, { key: entry.filterKey, label: entry.sourceLabel, icon: entry.sourceIcon, count: 0 });
					groups.get(entry.filterKey).count += 1;
				});
				return [{ key: 'all', label: '全部', icon: '◉', count: this.allDayStreamEntries.length }, ...groups.values()];
			},
			timelineStartHour() {
				return 0;
			},
			timelineEndHour() {
				return 24;
			},
			timelineHours() {
				return this.timelineLayout.visibleHours || [];
			},
			timelineLayout() {
				return buildTimelineLayout(this.dayStreamEntries, this.timelineStartHour, this.timelineEndHour, {
					collapseEmptyGaps: !this.isSelectedFuture,
					expandedGapKeys: this.isSelectedToday ? this.expandedTimelineGapKeys : []
				});
			},
			timelineStageHeight() { return this.timelineLayout.stageHeight; },
			timelineEntries() { return this.timelineLayout.entries; },
			timelineGaps() { return this.timelineLayout.gaps || []; },
			timelineSelectionStyle() {
				const start = Math.min(this.timelineSelection.startMinutes, this.timelineSelection.endMinutes);
				const end = Math.max(this.timelineSelection.startMinutes, this.timelineSelection.endMinutes);
				const top = timelineOffsetForMinutes(this.timelineLayout, start);
				const bottom = timelineOffsetForMinutes(this.timelineLayout, Math.max(start + 30, end));
				return { top: `${top}rpx`, height: `${Math.max(44, bottom - top)}rpx` };
			},
			timelineSelectionLabel() {
				const start = Math.min(this.timelineSelection.startMinutes, this.timelineSelection.endMinutes);
				const end = Math.max(start + 30, Math.max(this.timelineSelection.startMinutes, this.timelineSelection.endMinutes));
				return `${this.captureDrag.label || '新建'} · ${this.formatMinutes(start)} – ${this.formatMinutes(end)}`;
			},
			captureDragGhostStyle() {
				return {
					left: `${Math.max(12, this.captureDrag.clientX + 12)}px`,
					top: `${Math.max(12, this.captureDrag.clientY - 28)}px`
				};
			},
			dayEntrySummary() {
			const total = this.selectedDiaryCount + this.selectedPlans.length + this.actionRecords.length + this.activityRecords.length;
			return total ? `${total} 项记录与计划` : '还没有内容';
		},
		diaryDates() {
			return this.calendarDateCounts.map(item => {
				const diaryCount = Number(item.count || 0);
				const sourceCount = Number(item.source_count || item.sourceCount || 0);
				return {
					date: item.date,
					info: diaryCount > 1 ? `${diaryCount}篇` : '',
					data: { hasDiary: diaryCount > 0, hasSource: sourceCount > 0, count: diaryCount, sourceCount }
				};
			}).filter(item => item.data.hasDiary || item.data.hasSource);
		},
		customBarHeightRpx() {
			// 将 px 转换为 rpx (1px ≈ 2rpx，基于 750rpx 设计稿)
			return this.customBarHeight * 2;
		},
		fullDayDiaries() {
			// 获取今天整篇的日记（没有特定时间段的日记）
			// 这些日记没有关联到具体的时间段，是整天的日记
			return this.diaryList.filter(diary => {
				const diaryDate = diaryLocalDate(diary);
				if (diaryDate !== this.selectedDate) {
					return false;
				}
				// 判断是否为整篇日记（没有时间段标记的）
				// 如果日记没有 hour 和 minute 属性，或者 hour 为 null，则认为是整篇日记
				return isFullDayDiary(diary);
			});
		},
		wellbeingCardTitle() {
			const records = this.wellbeingOverview && this.wellbeingOverview.records || [];
			const period = records[0] && records[0].recordedOn !== this.selectedDate ? '最近' : '这一天';
			return records.some(item => item.status === 'PENDING') ? `${period}有变化待确认` : `${period}留下的身心变化`;
		},
		pendingWellbeingCount() {
			return Number(this.wellbeingOverview && this.wellbeingOverview.pendingCount || 0);
		},
		hasPendingWellbeingChanges() {
			return this.pendingWellbeingCount > 0;
		},
		pendingWellbeingRecord() {
			const records = this.wellbeingOverview && this.wellbeingOverview.records || [];
			return records.find(item => item.status === 'PENDING') || null;
		},
		pendingWellbeingPreview() {
			return this.pendingWellbeingRecord
				? this.wellbeingRecordPreview(this.pendingWellbeingRecord)
				: `有 ${this.pendingWellbeingCount} 条来自日记的变化等待你确认`;
		}
	},
	onLoad() {
		// 获取状态栏高度和自定义导航栏高度
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;

		// #ifdef MP-WEIXIN
		// 获取小程序菜单按钮位置
		// eslint-disable-next-line
		const custom = wx.getMenuButtonBoundingClientRect();
		if (custom) {
			// CustomBar = 菜单按钮顶部到状态栏的距离 + 菜单按钮高度 + 底部间距
			this.customBarHeight = custom.top - this.statusBarHeight + custom.height + 8;
		} else {
			this.customBarHeight = this.statusBarHeight + 44;
		}
		// #endif

		// #ifdef MP-WEIXIN
		if (this.redirectGuestToLogin()) return;
		// #endif

		// #ifndef MP-WEIXIN
		// 非小程序环境，使用默认值
		this.customBarHeight = this.statusBarHeight + 44;
		// #endif

		this.loadHomePreferences();
		this.initDates();
	},
	onShow() {
		// #ifdef MP-WEIXIN
		if (this.redirectGuestToLogin()) return;
		// #endif
		// 首次进入以及从编辑页返回时，都同步当前日期、月份标记和待办。
		if (this.periodView === 'day') this.loadDiaries();
		else this.loadPeriodOverview();
		this.loadCalendarDates(this.selectedMonth);
		this.loadPendingTodoCount();
		this.loadWellbeingOverview();
	},
	onUnload() {
		this.removeCaptureMouseListeners();
	},
		methods: {
			openHomePanel(panel) {
				if (!['view', 'options', 'settings'].includes(panel)) return;
				this.cancelCaptureDrag();
				if (this.activeHomePanel === panel) {
					this.closeHomePanel();
					return;
				}
				this.activeHomePanel = panel;
				if (panel === 'view') this.positionViewPopover();
			},
			closeHomePanel() {
				this.activeHomePanel = '';
			},
			positionViewPopover() {
				this.$nextTick(() => {
					const query = uni.createSelectorQuery().in(this);
					query.select('.view-trigger').boundingClientRect(rect => {
						if (!rect) return;
						const systemInfo = uni.getSystemInfoSync();
						const windowWidth = Number(systemInfo.windowWidth) || 375;
						this.viewPopoverStyle = {
							top: `${Math.round(rect.bottom + 9)}px`,
							right: `${Math.max(12, Math.round(windowWidth - rect.right))}px`
						};
					}).exec();
				});
			},
			selectHomeView(period, mode) {
				if (period === 'day') {
					if (this.periodView !== 'day') this.setPeriodView('day');
					if (mode) this.setDayViewMode(mode);
				} else this.setPeriodView(period);
				this.closeHomePanel();
			},
			selectSourceFilter(key) {
				this.activeSourceFilter = key;
				this.closeHomePanel();
			},
			loadHomePreferences() {
				const stored = uni.getStorageSync(HOME_PREFERENCES_STORAGE_KEY);
				const defaultView = stored && typeof stored === 'object' && DEFAULT_HOME_VIEW_KEYS.includes(stored.defaultView)
					? stored.defaultView
					: DEFAULT_HOME_VIEW;
				this.homePreferences = {
					defaultView,
					showWeekStrip: !stored || typeof stored !== 'object' || stored.showWeekStrip !== false,
					showFlowMeta: !stored || typeof stored !== 'object' || stored.showFlowMeta !== false
				};
				this.applyDefaultHomeView(defaultView);
			},
			updateHomePreference(key, event) {
				if (!['showWeekStrip', 'showFlowMeta'].includes(key)) return;
				this.homePreferences = { ...this.homePreferences, [key]: Boolean(event && event.detail && event.detail.value) };
				uni.setStorageSync(HOME_PREFERENCES_STORAGE_KEY, this.homePreferences);
			},
			selectDefaultHomeView(view) {
				if (!DEFAULT_HOME_VIEW_KEYS.includes(view)) return;
				this.homePreferences = { ...this.homePreferences, defaultView: view };
				uni.setStorageSync(HOME_PREFERENCES_STORAGE_KEY, this.homePreferences);
			},
			applyDefaultHomeView(view) {
				if (!DEFAULT_HOME_VIEW_KEYS.includes(view)) view = DEFAULT_HOME_VIEW;
				if (view === 'flow' || view === 'timeline') {
					this.periodView = 'day';
					this.dayViewMode = view;
					return;
				}
				this.periodView = view;
			},
			setPeriodView(view) {
				if (!['day', 'week', 'month', 'year'].includes(view) || view === this.periodView) return;
				this.cancelCaptureDrag();
				this.periodView = view;
				if (view === 'day') {
					this.loadDiaries();
					this.loadPendingTodoCount();
					this.loadWellbeingOverview();
				} else this.loadPeriodOverview();
			},
			movePeriod(direction) {
				const units = { week: 'week', month: 'month', year: 'year' };
				const unit = units[this.periodView];
				if (!unit) return;
				this.selectedDate = moment(this.selectedDate).add(direction, unit).format('YYYY-MM-DD');
				this.initDates();
				this.loadPeriodOverview();
				if (this.periodView === 'month') this.loadCalendarDates(this.selectedMonth);
			},
			async loadPeriodOverview() {
				if (!this.$mStore.getters.hasLogin || this.periodView === 'day') {
					this.periodOverview = { days: [], entries: [] };
					return;
				}
				const requestSequence = ++this.periodRequestSequence;
				const range = this.periodRange;
				this.periodLoading = true;
				try {
					const response = await this.$http.get(diaryOverview, range);
					if (requestSequence !== this.periodRequestSequence) return;
					this.periodOverview = response.data || { days: [], entries: [] };
				} catch (error) {
					if (requestSequence === this.periodRequestSequence) this.periodOverview = { days: [], entries: [] };
					console.error('加载周期视图失败', error);
				} finally {
					if (requestSequence === this.periodRequestSequence) this.periodLoading = false;
				}
			},
			periodEntryTime(entry) {
				if (!entry || entry.startMinutes === null || entry.startMinutes === undefined) return '全天';
				const start = this.formatMinutes(entry.startMinutes);
				return entry.endMinutes === null || entry.endMinutes === undefined ? start : `${start}–${this.formatMinutes(entry.endMinutes)}`;
			},
			openPeriodEntry(entry) {
				if (!entry) return;
				if (entry.kind === 'DIARY') return uni.navigateTo({ url: `/pages/diary/edit?id=${entry.id}&date=${entry.date}` });
				if (entry.kind === 'PLAN' || entry.kind === 'ACTION') return uni.navigateTo({ url: `/pages/todo/detail?id=${entry.id}` });
				if (entry.kind === 'SOURCE') return uni.navigateTo({ url: `/pages/shroom/data-sources/activity?id=${entry.id}` });
			},
			openPeriodDay(date) {
				this.periodView = 'day';
				if (date === this.selectedDate) {
					this.loadDiaries();
					this.loadPendingTodoCount();
					this.loadWellbeingOverview();
					return;
				}
				this.changeSelectedDate(date, false);
			},
			selectMonthDay(date) {
				if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return;
				const monthChanged = moment(date).format('YYYY-MM') !== moment(this.selectedDate).format('YYYY-MM');
				this.selectedDate = date;
				this.initDates();
				if (monthChanged) this.loadPeriodOverview();
			},
			openYearMonth(month) {
				if (!month || !month.date) return;
				this.selectedDate = month.date;
				this.periodView = 'month';
				this.initDates();
				this.loadPeriodOverview();
				this.loadCalendarDates(this.selectedMonth);
			},
			setDayViewMode(mode) {
				if (!['flow', 'timeline'].includes(mode)) return;
				this.cancelCaptureDrag();
				this.dayViewMode = mode;
			},
			goToday() {
				this.changeSelectedDate(moment().format('YYYY-MM-DD'), false);
			},
			timestampMinutes(value) {
				if (!value) return null;
				const parsed = moment(value);
				if (!parsed || !parsed.isValid || !parsed.isValid()) return null;
				return parsed.hour() * 60 + parsed.minute();
			},
			clockMinutes(value) {
				const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)/);
				return match ? Number(match[1]) * 60 + Number(match[2]) : null;
			},
			localTimeZone() {
				try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; } catch (_) { return 'Asia/Shanghai'; }
			},
			diaryEntryMinutes(diary) {
				if (hasExplicitDiaryTime(diary)) return Number(diary.hour) * 60 + Number(diary.minute);
				return this.timestampMinutes(diary && diary.createdAt);
			},
			formatMinutes(value) {
				const minutes = ((Number(value) % 1440) + 1440) % 1440;
				return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
			},
			timelineHourTop(hour) {
				return `${this.timelineLayout.hourTops[hour] || 0}rpx`;
			},
			timelineHourLabel(hour) {
				return hour === 24 ? '00:00+1' : `${String(hour).padStart(2, '0')}:00`;
			},
			timelineGapLabel(gap) {
				if (this.isSelectedPast) return `${gap.hours} 小时空白已收起`;
				return gap.collapsed ? `展开 ${gap.hours} 小时空白` : `收起 ${gap.hours} 小时空白`;
			},
			toggleTimelineGap(gap) {
				if (!this.isSelectedToday || !gap || !gap.key) return;
				const keys = new Set(this.expandedTimelineGapKeys);
				if (keys.has(gap.key)) keys.delete(gap.key);
				else keys.add(gap.key);
				this.expandedTimelineGapKeys = Array.from(keys);
			},
			timelineRangeLabel(entry) {
				return entry && entry.endLabel ? `${entry.startLabel} – ${entry.endLabel}` : entry.startLabel;
			},
			openDayEntry(entry) {
				if (!entry) return;
				if (entry.kind === 'diary') return this.viewFullDayDiary(entry.payload);
				if (entry.kind === 'plan') return this.openPlannedTodo(entry.payload);
				if (entry.kind === 'action') return this.openActionRecord(entry.payload);
				if (entry.kind === 'wellbeing') return this.openWellbeing();
				if (entry.kind === 'source' && entry.payload && entry.payload.id) {
					uni.navigateTo({ url: `/pages/shroom/data-sources/activity?id=${entry.payload.id}` });
				}
			},
			onWeekSwipeChange(event) {
				const nextIndex = Number(event && event.detail && event.detail.current);
				if (nextIndex === 1) { this.weekSwipeResetting = false; return; }
				if (this.weekSwipeResetting) return;
				this.weekSwipeResetting = true;
				const amount = nextIndex === 0 ? -7 : 7;
				// 先把新 swiper 的受控页归中，再切换周锚点，避免 Safari/UniApp
				// 在三个子页整体换 key 时短暂停留在已经移除的边缘页。
				this.weekSwipeIndex = 1;
				this.changeSelectedDate(moment(this.selectedDate).add(amount, 'days').format('YYYY-MM-DD'), false);
				this.$nextTick(() => { this.weekSwipeResetting = false; });
			},
		redirectGuestToLogin() {
			const hasStoredSession = this.$mStore.getters.hasLogin || Boolean(uni.getStorageSync('refreshToken'));
			if (hasStoredSession) return false;
			uni.reLaunch({ url: '/pages/public/login' });
			return true;
		},
		openIcpRecord() {
			// #ifdef H5
			window.location.href = 'https://beian.miit.gov.cn/';
			// #endif
		},
		// 初始化日期选择器
		initDates() {
			const selected = moment(this.selectedDate);
			this.selectedMonth = selected.format('YYYY-MM');
			this.currentMonthText = selected.format('MMMM');
			this.currentDay = selected.format('D');

			// 生成当前周可见的日期
			const startOfWeek = moment(this.selectedDate).startOf('week');
			const dates = [];

			for (let i = 0; i < 7; i++) {
				const date = moment(startOfWeek).add(i, 'days');
				const dateStr = date.format('YYYY-MM-DD');
				dates.push({
					date: dateStr,
					day: date.format('D'),
					isSelected: dateStr === this.selectedDate,
					hasDiary: this.hasDiaryOnDate(dateStr)
				});
			}

			this.visibleDates = dates;
		},

		// 检查某天是否有日记
		hasDiaryOnDate(dateStr) {
			return this.calendarDateCounts.some(item => item.date === dateStr && Number(item.count || 0) > 0);
		},

		// 选择日期
		selectDate(date) {
			this.changeSelectedDate(date, false);
		},

		changeSelectedDate(date, closeCalendar) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return;
			if (date === this.selectedDate) { if (closeCalendar) this.closeFullCalendar(); return; }
			const previousMonth = this.selectedMonth;
			this.dateMotionClass = date > this.selectedDate ? 'day-slide-forward' : 'day-slide-backward';
			this.selectedDate = date;
			this.activeSourceFilter = 'all';
			this.expandedTimelineGapKeys = [];
			this.cancelCaptureDrag();
			this.initDates();
			this.initTimeSlots();
			if (this.periodView === 'day') {
				this.loadDiaries();
				this.loadWellbeingOverview();
			} else this.loadPeriodOverview();
			if (previousMonth !== this.selectedMonth && this.calendarDisplayMonth !== this.selectedMonth) {
				this.loadCalendarDates(this.selectedMonth);
			}
			if (closeCalendar) this.closeFullCalendar();
		},


		// 今天生成 08:00-21:30 的 28 个可写时段；历史日期只展示真实记录。
		initTimeSlots() {
			const entries = this.diaryList.filter(diary => {
				return diaryLocalDate(diary) === this.selectedDate && hasExplicitDiaryTime(diary);
			}).map((diary, index) => {
				const hour = Number(diary.hour);
				const minute = Number(diary.minute);
				return {
					key: `diary-${diary.id || index}`,
					time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
					hour: hour,
					minute: minute,
					diary: diary,
					type: diary.type || 'default'
				};
			});
			if (!this.isSelectedToday) {
				entries.sort((a, b) => a.hour === b.hour ? a.minute - b.minute : a.hour - b.hour);
				this.timeSlots = entries;
				return;
			}

			const buckets = new Map();
			entries.forEach(entry => {
				const alignedMinute = Math.floor(entry.minute / 30) * 30;
				const key = `${entry.hour}_${alignedMinute}`;
				if (!buckets.has(key)) buckets.set(key, []);
				buckets.get(key).push(entry);
			});

			const slots = [];
			for (let hour = 8; hour < 22; hour++) {
				for (let minute = 0; minute < 60; minute += 30) {
					const key = `${hour}_${minute}`;
					const bucket = buckets.get(key) || [];
					const entry = bucket.shift() || null;
					slots.push({
						key: entry ? entry.key : `empty-${key}`,
						time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
						hour,
						minute,
						diary: entry ? entry.diary : null,
						type: entry ? entry.type : null
					});
				}
			}
			buckets.forEach(bucket => slots.push(...bucket));
			slots.sort((a, b) => {
				if (a.hour !== b.hour) {
					return a.hour - b.hour;
				}
				return a.minute - b.minute;
			});
			this.timeSlots = slots;
		},

		// 根据时间查找日记（已废弃，现在在initTimeSlots中直接处理）
		findDiaryByTime(hour, minute) {
			return this.diaryList.find(diary => {
				if (diaryLocalDate(diary) !== this.selectedDate || !hasExplicitDiaryTime(diary)) {
					return false;
				}
				const diaryHour = Number(diary.hour);
				const diaryMinute = Number(diary.minute);
				// 匹配到30分钟的时间段内
				return diaryHour === hour && Math.floor(diaryMinute / 30) === Math.floor(minute / 30);
			});
		},

		// 加载日记列表
		async loadDiaries() {
			if (!this.$mStore.getters.hasLogin) {
				this.diaryList = [];
				this.actionRecords = [];
				this.activityRecords = [];
				this.initDates();
				this.initTimeSlots();
				return;
			}
			const requestSequence = ++this.diaryRequestSequence;
			const requestedDate = this.selectedDate;
			try {
				const res = await this.$http.get(diaryList, {
					date: requestedDate,
					page: 1,
					pageSize: 100
				});

				if (requestSequence !== this.diaryRequestSequence || requestedDate !== this.selectedDate) return;
				if (res.code === 200) {
					this.diaryList = res.data.list || [];
					this.actionRecords = res.data.actionRecords || [];
					this.activityRecords = res.data.activityRecords || [];
					this.initDates();
					this.initTimeSlots();
				} else {
					uni.showToast({
						title: res.message || '加载失败',
						icon: 'none'
					});
				}
			} catch (error) {
				console.error('加载日记失败', error);
				this.actionRecords = [];
				this.activityRecords = [];
				uni.showToast({
					title: '加载失败',
					icon: 'none'
				});
			}
		},

		activityMeta(record) {
			const parts = [];
			if (record.projectName) parts.push(record.projectName);
			if (record.turnCount) parts.push(`${record.turnCount} 个对话轮次`);
			parts.push({ COMPLETED: '最近轮次已结束', INTERRUPTED: '最近轮次被中断', FAILED: '最近轮次失败' }[record.outcomeStatus] || '已记录');
			return parts.join(' · ');
		},

		async loadCalendarDates(month = moment(this.selectedDate).format('YYYY-MM')) {
			if (!this.$mStore.getters.hasLogin) {
				this.calendarDateCounts = [];
				this.initDates();
				return;
			}
			if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) return;
			this.calendarDisplayMonth = month;
			const requestSequence = ++this.calendarRequestSequence;
			const requestedMonth = month;
			try {
				const res = await this.$http.get(diaryCalendar, { month: requestedMonth });
				if (requestSequence !== this.calendarRequestSequence || requestedMonth !== this.calendarDisplayMonth) return;
				if (res.code === 200) {
					const data = res.data || {};
					this.calendarDateCounts = Array.isArray(data.list) ? data.list : [];
					this.initDates();
				}
			} catch (error) {
				console.error('加载日记日期失败', error);
			}
		},

		// 下拉刷新
		onRefresh() {
			this.refreshing = true;
			this.loadDiaries().finally(() => {
				this.refreshing = false;
			});
		},

		// 编辑计划
		editSchedule(slot) {
			if (!this.requireLogin()) return;
			if (!slot.diary && !this.ensureSelectedDateWritable()) return;
			const timeStr = `${slot.hour.toString().padStart(2, '0')}:${slot.minute.toString().padStart(2, '0')}`;
			if (slot.diary) {
				// 编辑已有日记
				uni.navigateTo({
					url: `/pages/diary/edit?id=${slot.diary.id}&time=${timeStr}&date=${this.selectedDate}`
				});
			} else {
				// 新建日记
				uni.navigateTo({
					url: `/pages/diary/edit?time=${timeStr}&date=${this.selectedDate}`
				});
			}
		},

		getDiaryTimeLabel(diary) {
			return diaryTimeLabel(diary);
		},

		// 获取日记图片（有图用第一张，没图用默认图）
		getDiaryImage(diary) {
			// 优先使用 images 数组的第一张图片
			if (diary.images && Array.isArray(diary.images) && diary.images.length > 0) {
				return diary.images[0];
			}
			// 其次使用 image 字段
			if (diary.image) {
				return diary.image;
			}
			// 都没有则使用默认图片
			return this.defaultImageUrl;
		},
		
		// 获取日记预览文本（显示正文的前几个字）
		getDiaryPreview(diary) {
			return diaryPreview(diary, 30);
		},

		getTimeSlotPreview(diary) {
			return diaryPreview(diary, 42);
		},

		// 查看整篇日记
		viewFullDayDiary(diary) {
			uni.navigateTo({
				url: `/pages/diary/edit?id=${diary.id}&date=${this.selectedDate}`
			});
		},

		openActionRecord(record) {
			if (record && record.taskId) uni.navigateTo({ url: `/pages/todo/detail?id=${record.taskId}` });
		},

		openPlannedTodo(plan) {
			if (plan && plan.id) uni.navigateTo({ url: `/pages/todo/detail?id=${plan.id}` });
		},

		async completeTodoFromHome(plan) {
			if (!plan || !plan.id || this.completingTodoId) return;
			this.completingTodoId = plan.id;
			try {
				const res = await this.$http.patch(todoStatus, {
					id: plan.id,
					action: 'COMPLETE',
					version: plan.version,
					operationId: `home-complete-${plan.id}-${Date.now()}`,
					timeZone: this.localTimeZone()
				});
				if (res.code !== 200) throw new Error(res.message);
				this.pendingTodos = this.pendingTodos.filter(item => item.id !== plan.id);
				this.pendingTodoCount = Math.max(0, this.pendingTodoCount - 1);
				uni.showToast({ title: '已完成并留下行动记录', icon: 'none' });
				if (this.isSelectedToday) this.loadDiaries();
			} catch (error) {
				uni.showToast({ title: error.message || '完成失败', icon: 'none' });
			} finally { this.completingTodoId = ''; }
		},

		capturePoint(event) {
			const point = event && event.touches && event.touches[0]
				? event.touches[0]
				: event && event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : event;
			return {
				x: Number(point && (point.clientX !== undefined ? point.clientX : point.pageX)),
				y: Number(point && (point.clientY !== undefined ? point.clientY : point.pageY))
			};
		},
		timelineMinutesFromClientY(clientY) {
			if (!this.timelineStageRect || !Number.isFinite(clientY)) return null;
			const relativePixels = Math.max(0, Math.min(this.timelineStageRect.height, clientY - this.timelineStageRect.top));
			const relativeRpx = relativePixels / Math.max(1, this.timelineStageRect.height) * this.timelineStageHeight;
			const rawMinutes = minutesForTimelineOffset(this.timelineLayout, relativeRpx);
			return Math.max(this.timelineStartHour * 60, Math.min(this.timelineEndHour * 60 - 15, Math.round(rawMinutes / 15) * 15));
		},
		beginCaptureDrag(kind, event) {
			if (this.dayViewMode !== 'timeline' || this.isSelectedPast) return;
			if (event && Number.isFinite(event.button) && event.button !== 0) return;
			const point = this.capturePoint(event);
			if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
			const labels = { record: '记录', todo: '待办' };
			this.captureDrag = {
				active: true,
				moved: false,
				kind,
				label: labels[kind] || '新建',
				startX: point.x,
				startY: point.y,
				clientX: point.x,
				clientY: point.y,
				overTimeline: false,
				minutes: null
			};
			uni.createSelectorQuery().in(this).select('.timeline-stage').boundingClientRect(rect => {
				if (!rect) return;
				this.timelineStageRect = rect;
			}).exec();
			// #ifdef H5
			if (event && event.type === 'mousedown' && typeof document !== 'undefined') {
				document.addEventListener('mousemove', this.updateCaptureDrag);
				document.addEventListener('mouseup', this.finishCaptureDrag);
			}
			// #endif
		},
		updateCaptureDrag(event) {
			if (!this.captureDrag.active) return;
			const point = this.capturePoint(event);
			if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
			const moved = this.captureDrag.moved || Math.hypot(point.x - this.captureDrag.startX, point.y - this.captureDrag.startY) >= 8;
			if (!moved) return;
			if (event && typeof event.preventDefault === 'function') event.preventDefault();
			const rect = this.timelineStageRect;
			const right = rect ? (Number(rect.right) || Number(rect.left) + Number(rect.width)) : 0;
			const bottom = rect ? (Number(rect.bottom) || Number(rect.top) + Number(rect.height)) : 0;
			const overTimeline = Boolean(rect && point.x >= rect.left && point.x <= right && point.y >= rect.top && point.y <= bottom);
			const minutes = overTimeline ? this.timelineMinutesFromClientY(point.y) : null;
			this.captureDrag = { ...this.captureDrag, moved, clientX: point.x, clientY: point.y, overTimeline, minutes };
			this.timelineSelection = minutes === null
				? { ...this.timelineSelection, active: false }
				: { active: true, startMinutes: minutes, endMinutes: Math.min(this.timelineEndHour * 60, minutes + 30) };
		},
		finishCaptureDrag(event) {
			if (!this.captureDrag.active) return;
			this.updateCaptureDrag(event);
			const dropped = this.captureDrag.moved && this.captureDrag.overTimeline && this.captureDrag.minutes !== null;
			const kind = this.captureDrag.kind;
			const minutes = this.captureDrag.minutes;
			if (this.captureDrag.moved) this.captureTapSuppressedUntil = Date.now() + 450;
			this.resetCaptureDrag();
			if (dropped) this.openCaptureAt(kind, minutes);
		},
		removeCaptureMouseListeners() {
			// #ifdef H5
			if (typeof document !== 'undefined') {
				document.removeEventListener('mousemove', this.updateCaptureDrag);
				document.removeEventListener('mouseup', this.finishCaptureDrag);
			}
			// #endif
		},
		resetCaptureDrag() {
			this.removeCaptureMouseListeners();
			this.captureDrag = { active: false, moved: false, kind: '', label: '', startX: 0, startY: 0, clientX: 0, clientY: 0, overTimeline: false, minutes: null };
			this.timelineSelection = { ...this.timelineSelection, active: false };
			this.timelineStageRect = null;
		},
		cancelCaptureDrag() {
			if (this.captureDrag.moved) this.captureTapSuppressedUntil = Date.now() + 450;
			this.resetCaptureDrag();
		},
		handleCaptureTap(kind) {
			if (Date.now() < this.captureTapSuppressedUntil) return;
			const now = moment();
			const minutes = now.hour() * 60 + Math.floor(now.minute() / 15) * 15;
			this.openCaptureAt(kind, minutes);
		},
		openCaptureAt(kind, minutes) {
			if (!this.requireLogin()) return;
			if (!this.ensureSelectedDateWritable()) return;
			const start = Math.max(0, Math.min(1425, Number(minutes) || 0));
			const time = this.formatMinutes(start);
			if (kind === 'todo') {
				const end = this.formatMinutes(Math.min(1439, start + 30));
				uni.navigateTo({ url: `/pages/todo/edit?scheduledDate=${this.selectedDate}&startTime=${time}&endTime=${end}&from=timeline` });
				return;
			}
			uni.navigateTo({ url: `/pages/diary/edit?time=${time}&date=${this.selectedDate}&from=timeline` });
		},

		// 创建整篇日记
		createFullDayDiary() {
			if (!this.requireLogin()) return;
			if (!this.ensureSelectedDateWritable()) return;
			// 新建日记，不传递time参数，编辑页面会默认选择"当天日记"
			uni.navigateTo({
				url: `/pages/diary/edit?date=${this.selectedDate}`
			});
		},

		createTimedDiary() {
			if (!this.requireLogin()) return;
			if (!this.ensureSelectedDateWritable()) return;
			const now = moment();
			const time = now.minute(Math.floor(now.minute() / 30) * 30).format('HH:mm');
			uni.navigateTo({ url: `/pages/diary/edit?time=${time}&date=${this.selectedDate}` });
		},

		createDiaryWithMode(mode) {
			const now = moment();
			this.openCaptureAt(mode, now.hour() * 60 + Math.floor(now.minute() / 15) * 15);
		},

		ensureSelectedDateWritable() {
			if (this.isSelectedToday) return true;
			uni.showToast({ title: '过去的日记不能修改或补写', icon: 'none' });
			return false;
		},

		// 显示全屏日历
		showFullCalendar() {
			this.showFullCalendarView = true;
			this.loadCalendarDates(this.selectedMonth);
		},

		// 关闭全屏日历
		closeFullCalendar() {
			this.showFullCalendarView = false;
		},

		// 全屏日历确认选择
		onFullCalendarConfirm(e) {
			const selectedDate = e.fulldate || e;
			if (selectedDate) this.changeSelectedDate(selectedDate, true);
		},

		// 全屏日历日期变化（insert模式下的change事件）
		onFullCalendarChange(e) {
			const selectedDate = e.fulldate || e;
			if (selectedDate) this.changeSelectedDate(selectedDate, true);
		},

		// 切换月份时立即加载该月标记，不要等用户先点一天。
		onFullCalendarMonthSwitch(e) {
			const year = Number(e && e.year);
			const month = Number(e && e.month);
			if (!year || month < 1 || month > 12) return;
			this.loadCalendarDates(`${year}-${String(month).padStart(2, '0')}`);
		},

		// 加载待完成待办数量
		async loadPendingTodoCount() {
			if (!this.$mStore.getters.hasLogin) {
				this.pendingTodoCount = 0;
				return;
			}
			try {
				const res = await this.$http.get(todoList, {
					page: 1,
					pageSize: 100, // 获取足够多的数据来计算总数
					status: 'open'
				});

				if (res.code === 200 && res.data) {
					let todos = [];
					if (Array.isArray(res.data)) {
						todos = res.data;
					} else if (res.data.list && Array.isArray(res.data.list)) {
						todos = res.data.list;
					} else if (res.data.data && Array.isArray(res.data.data)) {
						todos = res.data.data;
					}

					this.pendingTodos = todos;
					this.pendingTodoCount = res.data.total !== undefined ? (res.data.total || 0) : todos.length;
				}
			} catch (error) {
				console.error('加载待办数量失败', error);
				// 失败时不影响页面显示，数量保持为0
				this.pendingTodoCount = 0;
				this.pendingTodos = [];
			}
		},

		async loadWellbeingOverview() {
			if (!this.$mStore.getters.hasLogin) { this.wellbeingOverview = null; return; }
			const requestedDate = this.selectedDate;
			try {
				const res = await this.$http.get(wellbeingSummary, { date: requestedDate });
				if (requestedDate === this.selectedDate) this.wellbeingOverview = res.data || null;
			} catch (error) { this.wellbeingOverview = null; }
		},

		wellbeingRecordPreview(item) {
			const value = item && item.observation || {};
			const parts = [];
			const add = values => { if (Array.isArray(values) && values.length) parts.push(values.join('、')); };
			add(value.psychologicalFeelings);
			add(value.physicalSymptoms);
			if (value.sleep && value.sleep.note) parts.push(value.sleep.note);
			if (value.sleep && value.sleep.hours !== null && value.sleep.hours !== undefined) parts.push(`睡眠 ${value.sleep.hours} 小时`);
			add(value.behaviors); add(value.measurements); add(value.testResults);
			return parts.join(' · ') || item.sourceExcerpt || '查看这条身心记录';
		},

		openWellbeing() {
			if (!this.requireLogin()) return;
			uni.navigateTo({ url: '/pages/shroom/wellbeing' });
		},

		// 跳转到待办列表
		goToTodoList(e) {
			if (e) {
				e.stopPropagation && e.stopPropagation();
			}
			if (!this.requireLogin()) return;
			this.closeHomePanel();
			uni.navigateTo({
				url: '/pages/todo/list',
				fail: (err) => {
					console.error('跳转失败', err);
					uni.showToast({
						title: '页面不存在',
						icon: 'none'
					});
				}
			});
		},

		// 跳转到搜索页面
		goToSearch() {
			if (!this.requireLogin()) return;
			this.closeHomePanel();
			uni.navigateTo({
				url: '/pages/common/diary/search'
			});
		},

		requireLogin() {
			if (this.$mStore.getters.hasLogin) return true;
			uni.showModal({
				title: '登录后开始记录',
				content: '日记默认只属于你，登录后才会保存和同步。',
				confirmText: '去登录',
				success: res => {
					if (res.confirm) uni.navigateTo({ url: '/pages/public/login' });
				}
			});
			return false;
		},

		// 模拟数据
		getMockDiaries() {
			const today = moment(this.selectedDate);
			const diaries = [];

			// 为今天生成几个时间段的计划（按照设计图）
			const scheduleItems = [
				{ hour: 7, minute: 30, title: 'Morning Exercise', type: 'blue', timeRange: '7:30 - 8:00 am', avatar: null },
				{ hour: 8, minute: 0, title: 'Floyd Miles', type: 'pink', timeRange: '8:00 - 8:15 am', avatar: null },
				{ hour: 8, minute: 15, title: 'Logan Anderson', type: 'yellow', timeRange: '8:15 - 8:30 am', avatar: null },
				{ hour: 8, minute: 30, title: 'Having breakfast', type: 'purple', timeRange: '8:30 - 9:00 am', avatar: null },
				{ hour: 9, minute: 0, title: 'Meeting Client', type: 'gray', timeRange: '9:00 - 10:00 am', avatar: null },
				{ hour: 10, minute: 0, title: 'Daily Meeting', type: 'blue', timeRange: '10:00 - 11:00 am', avatar: null },
				{ hour: 10, minute: 30, title: 'Coffee Break', type: 'yellow', timeRange: '10:30 - 11:00 am', avatar: null },
				{ hour: 22, minute: 30, title: 'Night Reading', type: 'purple', timeRange: '10:30 - 11:00 pm', avatar: null }
			];

			scheduleItems.forEach((item, index) => {
				const time = moment(today).hour(item.hour).minute(item.minute).second(0);
				diaries.push({
					id: `diary-${index}`,
					title: item.title,
					content: item.title,
					type: item.type,
					timeRange: item.timeRange,
					hour: item.hour,
					minute: item.minute,
					createdAt: time.format('YYYY-MM-DD HH:mm:ss'),
					avatar: item.avatar
				});
			});

			// 为今天生成一些整篇日记（没有时间段的）
			const fullDayDiaries = [
				{
					id: 'full-day-1',
					title: 'First day at work',
					content: 'First day at work',
					emoji: '😊',
					image: null,
					createdAt: today.format('YYYY-MM-DD 12:14:00')
				},
				{
					id: 'full-day-2',
					title: '周末时光',
					content: '周末时光',
					emoji: '☀️',
					image: null,
					createdAt: today.format('YYYY-MM-DD 14:30:00')
				}
			];

			fullDayDiaries.forEach(diary => {
				diaries.push({
					...diary,
					hour: null,
					minute: null
				});
			});

			// 为前几天生成一些日记
			for (let i = 1; i <= 7; i++) {
				const date = moment(today).subtract(i, 'days');
				if (Math.random() > 0.3) {
					const hour = 8 + Math.floor(Math.random() * 10);
					const minute = Math.random() > 0.5 ? 0 : 30;
					const time = moment(date).hour(hour).minute(minute).second(0);
					diaries.push({
						id: `diary-past-${i}`,
						title: '日记',
						content: `${i}天前的日记内容`,
						type: 'default',
						hour: hour,
						minute: minute,
						createdAt: time.format('YYYY-MM-DD HH:mm:ss'),
						avatar: null
					});
				}
			}

			return diaries;
		}
	}
};
</script>

<style lang="scss" scoped>
.icp-footer {
	box-sizing: border-box;
	width: 100%;
	padding: 30rpx 24rpx calc(154rpx + env(safe-area-inset-bottom));
	font-size: 20rpx;
	line-height: 1.5;
	text-align: center;
	color: #7d887f;
}

.diary-page {
	display: block;
	min-height: 100vh;
	background-color: #F1F8E9; // 整体背景淡绿色
	position: relative;
}

.diary-content-layout,
.diary-overview-column {
	display: block;
}

.status-bar {
	display: block;
	background-color: #F1F8E9;
}

.title-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 40rpx 30rpx 40rpx; // padding-top通过动态style设置

	.title-text {
		font-size: 48rpx;
		font-weight: 700;
		color: #000000; // 标题是黑色
		line-height: 1.2;
		cursor: pointer;
	}

	.month-picker {
		display: flex;
		align-items: center;
		gap: 12rpx;
		padding: 12rpx 24rpx;
		background-color: #f5f5f5;
		border-radius: 40rpx;
		margin-left: auto; // 确保靠右对齐

		.month-text {
			font-size: 28rpx;
			color: #333;
			font-weight: 500;
		}

		.calendar-icon {
			width: 40rpx;
			height: 40rpx;
			background-color: #000;
			border-radius: 8rpx;
			display: flex;
			align-items: center;
			justify-content: center;

			.calendar-day {
				font-size: 20rpx;
				color: #fff;
				font-weight: 600;
			}
		}
	}
}

.date-selector {
	display: block;
	padding: 0 40rpx 40rpx;
	cursor: pointer; // 提示可点击

	.weekdays-row {
		display: flex;
		justify-content: space-between;
		margin-bottom: 30rpx;

		.weekday-item {
			flex: 1;
			text-align: center;
			font-size: 24rpx;
			color: #666;
			font-weight: 500;
		}
	}

	.dates-row {
		display: flex;
		justify-content: space-between;

		.date-circle {
			width: 80rpx;
			height: 80rpx;
			border-radius: 50%;
			background-color: #ffffff;
			display: flex;
			align-items: center;
			justify-content: center;
			position: relative;

			.date-number {
				font-size: 28rpx;
				color: #666;
				font-weight: 500;
			}

			&.active {
				background-color: #000000; // 选中日期是黑色填充

				.date-number {
					color: #fff;
					font-weight: 600;
				}
			}

			&.has-diary::after {
				content: '';
				position: absolute;
				bottom: 8rpx;
				left: 50%;
				transform: translateX(-50%);
				width: 8rpx;
				height: 8rpx;
				border-radius: 50%;
				background-color: #4CAF50;
			}

			&.active.has-diary::after {
				background-color: #fff;
			}
		}
	}
}

.day-view-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 24rpx;
	margin: 0 40rpx 18rpx;
	padding-bottom: 18rpx;
	border-bottom: 1rpx solid rgba(23, 32, 25, .09);
}

.day-view-heading { display: flex; min-width: 0; flex-direction: column; gap: 5rpx; }
.day-view-heading text:first-child { overflow: hidden; color: #172019; font-size: 25rpx; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.day-view-heading text:last-child { color: #718075; font-size: 16rpx; }
.day-view-actions { display: flex; align-items: center; gap: 12rpx; flex: 0 0 auto; }
.day-search-button { display: flex; width: 54rpx; height: 54rpx; margin: 0; padding: 0; align-items: center; justify-content: center; color: #172019; border: 1rpx solid #dfead7; border-radius: 16rpx; background: #fffdf7; font-size: 26rpx; line-height: 54rpx; }
.day-search-button::after { border: 0; }
.day-view-switch { display: flex; padding: 5rpx; flex: 0 0 auto; border: 1rpx solid #dfead7; border-radius: 999rpx; background: rgba(255, 253, 247, .78); }
.day-view-switch button { height: 44rpx; margin: 0; padding: 0 17rpx; color: #59655c; border: 0; border-radius: 999rpx; background: transparent; font-size: 18rpx; line-height: 44rpx; }
.day-view-switch button::after { border: 0; }
.day-view-switch button.active { color: #fffdf7; background: #172019; }

.day-flow-view { display: block; }
.day-stream { display: flex; margin: 0 40rpx 24rpx; flex-direction: column; gap: 16rpx; }
.planned-panel { display: flex; padding: 20rpx 22rpx; flex-direction: column; border: 1rpx solid #dfead7; border-radius: 18rpx; background: #fffdf7; }
.stream-card-heading { display: flex; align-items: center; justify-content: space-between; padding-bottom: 11rpx; }
.stream-card-heading text:first-child { color: #172019; font-size: 20rpx; font-weight: 700; }
.stream-card-heading text:last-child { color: #718075; font-size: 15rpx; }
.planned-panel button { display: flex; min-height: 72rpx; margin: 0; padding: 10rpx 0; align-items: center; gap: 14rpx; border: 0; border-top: 1rpx solid rgba(23, 32, 25, .07); background: transparent; text-align: left; }
.planned-panel button::after { border: 0; }
.planned-panel button > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5rpx; }
.planned-panel button > view text:first-child { color: #172019; font-size: 21rpx; }
.planned-panel button > view text:last-child { color: #59655c; font-size: 16rpx; }
.planned-panel button > text:last-child { color: #718075; font-size: 16rpx; letter-spacing: 2rpx; }
.plan-mark { width: 22rpx; height: 22rpx; flex: 0 0 22rpx; border: 2rpx solid #42634a; border-radius: 50%; }
.plan-caveat { padding-top: 13rpx; border-top: 1rpx solid rgba(23, 32, 25, .07); color: #59655c; font-size: 16rpx; line-height: 1.55; }

.flow-diary-card { overflow: hidden; border: 1rpx solid #dfead7; border-radius: 25rpx; background: #fffdf7; box-shadow: 0 10rpx 26rpx rgba(23, 32, 25, .055); }
.flow-diary-body { display: flex; padding: 22rpx; flex-direction: column; gap: 12rpx; }
.flow-diary-body > image { display: block; width: 100%; max-height: 680rpx; border-radius: 12rpx; background: #e5efd9; }
.flow-diary-meta { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; color: #718075; font-size: 15rpx; }
.flow-diary-meta text:last-child { color: #59655c; }
.flow-diary-copy { color: #172019; font-size: 22rpx; line-height: 1.65; word-break: break-all; }
.flow-diary-evidence { color: #59655c; font-size: 15rpx; }
.flow-empty { display: flex; margin: 0 40rpx 25rpx; padding: 46rpx 30rpx; align-items: center; flex-direction: column; gap: 10rpx; border: 1rpx solid #dfead7; border-radius: 18rpx; background: #fffdf7; text-align: center; }
.flow-empty text:first-child { color: #172019; font-size: 27rpx; font-weight: 700; }
.flow-empty text:last-child { max-width: 510rpx; color: #4f5c52; font-size: 23rpx; line-height: 1.55; }

.capture-dock { position: fixed; right: 0; bottom: calc(118rpx + env(safe-area-inset-bottom)); left: 0; z-index: 90; display: flex; width: 310rpx; margin: 0 auto; padding: 8rpx; gap: 8rpx; border: 1rpx solid rgba(23, 32, 25, .12); border-radius: 999rpx; background: rgba(255, 253, 247, .94); box-shadow: 0 16rpx 44rpx rgba(23, 32, 25, .17); backdrop-filter: blur(12px); }
.capture-dock button { display: flex; height: 66rpx; margin: 0; padding: 0 22rpx; align-items: center; justify-content: center; gap: 10rpx; border: 0; border-radius: 999rpx; font-size: 20rpx; font-weight: 700; line-height: 66rpx; }
.capture-dock button::after { border: 0; }
.capture-dock button text:first-child { font-family: Georgia, serif; font-size: 16rpx; }
.capture-dock .record-capture { flex: 1; color: #fffdf7; background: #172019; }
.capture-dock .todo-capture { flex: 1; color: #172019; background: #e5efd9; }

// 搜索组件
.search-container {
	display: block;
	padding: 0 40rpx 30rpx;

	.search-box {
		display: flex;
		align-items: center;
		padding: 20rpx 24rpx;
		background-color: #ffffff;
		border-radius: 50rpx;
		box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);

		.search-icon {
			font-size: 32rpx;
			margin-right: 16rpx;
			color: #999;
		}

		.search-placeholder {
			font-size: 28rpx;
			color: #999;
			flex: 1;
		}
	}
}

.action-records {
	display: flex;
	flex-direction: column;
	margin: 0 40rpx 25rpx;
	padding: 20rpx 22rpx;
	border: 1rpx solid rgba(47,64,51,.08);
	border-radius: 22rpx;
	background: rgba(255,253,247,.72);
}
.action-records-heading { display: flex; justify-content: space-between; margin-bottom: 7rpx; color: #78827a; font-size: 15rpx; font-weight: 700; letter-spacing: 2rpx; }
.action-records button { display: flex; align-items: center; gap: 13rpx; min-height: 67rpx; border-top: 1rpx solid rgba(47,64,51,.07); background: transparent; text-align: left; }
.action-records button::after { border: 0; }
.action-records button > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }
.action-records button > view text:first-child { overflow: hidden; color: #354139; font-size: 21rpx; text-overflow: ellipsis; white-space: nowrap; }
.action-records button > view text:last-child { overflow: hidden; color: #7d867e; font-size: 17rpx; text-overflow: ellipsis; white-space: nowrap; }
.action-mark { display: flex; width: 34rpx; height: 34rpx; align-items: center; justify-content: center; border-radius: 50%; background: #dfe8bd; color: #435334; font-size: 17rpx; }
.action-records button > text:last-child { color: #879088; font-size: 25rpx; }

.source-activities { display: flex; margin: 0 40rpx 25rpx; padding: 22rpx; flex-direction: column; border: 1rpx solid rgba(47,64,51,.08); border-radius: 22rpx; background: #edf2e8; }
.source-activities-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18rpx; }
.source-activities-heading > view { display: flex; flex-direction: column; gap: 5rpx; }
.source-activities-heading > view text:first-child { color: #75816f; font-size: 14rpx; font-weight: 750; letter-spacing: 2rpx; }
.source-activities-heading > view text:last-child { color: #354139; font-size: 21rpx; font-weight: 680; }
.source-activities-heading > text { color: #79847b; font-size: 16rpx; }
.source-activity { display: flex; align-items: center; gap: 13rpx; min-height: 72rpx; border-top: 1rpx solid rgba(47,64,51,.08); }
.source-activity > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5rpx; }
.source-activity > view text:first-child { overflow: hidden; color: #354139; font-size: 20rpx; text-overflow: ellipsis; white-space: nowrap; }
.source-activity > view text:last-child { color: #7b857d; font-size: 16rpx; }
.source-activity > text:last-child { color: #778272; font-size: 13rpx; font-weight: 750; letter-spacing: 1rpx; }
.source-mark { display: flex; width: 34rpx; height: 34rpx; flex: 0 0 34rpx; align-items: center; justify-content: center; border-radius: 10rpx; background: #172019; color: #edf4e8; font-family: Georgia, serif; font-size: 17rpx; }
.source-caveat { margin-top: 8rpx; padding-top: 13rpx; border-top: 1rpx solid rgba(47,64,51,.08); color: #858c83; font-size: 15rpx; line-height: 1.5; }
.collapsed-count { display: block; padding: 15rpx 0 6rpx; border-top: 1rpx solid rgba(47,64,51,.07); color: #69766c; font-size: 17rpx; line-height: 1.5; }

.wellbeing-glimpse {
	margin: 0 40rpx 28rpx;
	padding: 25rpx 27rpx;
	border: 1rpx solid rgba(23, 32, 25, .08);
	border-radius: 25rpx;
	background: #e5ecd4;
	box-shadow: 0 10rpx 30rpx rgba(50, 67, 49, .07);
}

.wellbeing-glimpse-top { display: flex; align-items: flex-start; justify-content: space-between; }
.wellbeing-glimpse-top > view { display: flex; flex-direction: column; }
.wellbeing-glimpse-top > view text:first-child { color: #788554; font-size: 14rpx; font-weight: 750; letter-spacing: 2rpx; }
.wellbeing-glimpse-top > view text:last-child { margin-top: 6rpx; font-family: Georgia, 'Songti SC', serif; font-size: 25rpx; }
.wellbeing-glimpse-top > text { font-size: 29rpx; }
.wellbeing-glimpse-copy { display: -webkit-box; margin-top: 15rpx; overflow: hidden; color: #4f594e; font-size: 20rpx; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.wellbeing-glimpse-meta { display: flex; justify-content: space-between; margin-top: 16rpx; color: #7b8378; font-size: 16rpx; }

// 今天整篇日记横向列表
.full-day-diaries-container {
	display: block;
	padding: 0 40rpx 30rpx;

	.full-day-diaries-scroll {
		display: block;
		white-space: nowrap;
		width: 100%;

		.full-day-diaries-list {
			display: flex;
			gap: 20rpx;
			padding-right: 20rpx;

			.full-day-diary-card {
				flex-shrink: 0;
				width: 400rpx;
				height: 300rpx;
				border-radius: 40rpx; // 大圆角
				overflow: hidden;
				position: relative;
				box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
				background-color: #ffffff;

				.diary-card-image {
					width: 100%;
					height: 100%;
					position: relative;

					image {
						width: 100%;
						height: 100%;
					}

					.diary-overlay {
						position: absolute;
						top: 0;
						left: 0;
						right: 0;
						bottom: 0;
						background: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.4) 100%);
						display: flex;
						flex-direction: column;
						justify-content: space-between;
						padding: 24rpx;

						.diary-card-emoji {
							width: 60rpx;
							height: 60rpx;
							background-color: rgba(255, 255, 255, 0.9);
							border-radius: 50%;
							display: flex;
							align-items: center;
							justify-content: center;
							font-size: 32rpx;
						}

						.diary-card-text {
							display: flex;
							flex-direction: column;
							gap: 8rpx;

							.diary-card-title {
								font-size: 32rpx;
								font-weight: 600;
								color: #ffffff;
								line-height: 1.4;
								display: -webkit-box;
								-webkit-box-orient: vertical;
								-webkit-line-clamp: 2;
								overflow: hidden;
								text-overflow: ellipsis;
								word-break: break-all;
							}

							.diary-card-time {
								font-size: 24rpx;
								color: rgba(255, 255, 255, 0.9);
							}
						}
					}
				}

				.diary-card-content {
					width: 100%;
					height: 100%;
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					display: flex;
					flex-direction: column;
					justify-content: space-between;
					padding: 24rpx;
					position: relative;

					.diary-card-emoji {
						width: 60rpx;
						height: 60rpx;
						background-color: rgba(255, 255, 255, 0.9);
						border-radius: 50%;
						display: flex;
						align-items: center;
						justify-content: center;
						font-size: 32rpx;
						position: absolute;
						top: 24rpx;
						left: 24rpx;
					}

					.diary-card-text {
						display: flex;
						flex-direction: column;
						gap: 8rpx;
						position: absolute;
						bottom: 24rpx;
						left: 24rpx;
						right: 24rpx;

						.diary-card-title {
							font-size: 32rpx;
							font-weight: 600;
							color: #ffffff;
							line-height: 1.4;
							display: -webkit-box;
							-webkit-box-orient: vertical;
							-webkit-line-clamp: 2;
							overflow: hidden;
							text-overflow: ellipsis;
							word-break: break-all;
						}

						.diary-card-time {
							font-size: 24rpx;
							color: rgba(255, 255, 255, 0.9);
						}
					}
				}

				// 默认卡片样式（空状态）
				&.default-card {
					background-color: #ffffff;
					border: 2rpx solid #e0e0e0;
					position: relative;
					overflow: hidden;

					.default-card-bg {
						position: absolute;
						top: 0;
						left: 0;
						width: 100%;
						height: 100%;
						z-index: 0;

						image {
							width: 100%;
							height: 100%;
							opacity: 0.6;
						}
					}

					.default-card-content {
						position: relative;
						z-index: 1;
						display: flex;
						align-items: center;
						justify-content: center;
						width: 100%;
						height: 100%;
						background: linear-gradient(to bottom, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.3) 100%);

						.default-card-text {
							font-size: 28rpx;
							color: #ffffff;
							text-align: center;
							padding: 0 40rpx;
							font-weight: 500;
						}
					}
				}

				// 加号卡片样式
				&.add-card {
					background-color: #f5f5f5;
					border: 2rpx dashed #d0d0d0;
					display: flex;
					align-items: center;
					justify-content: center;

					.add-card-content {
						display: flex;
						align-items: center;
						justify-content: center;
						width: 100%;
						height: 100%;

						.add-icon {
							font-size: 80rpx;
							color: #999;
							font-weight: 300;
							line-height: 1;
						}
					}

					&:active {
						background-color: #e8e8e8;
						border-color: #b0b0b0;
					}
				}
			}
		}
	}
}

// 全屏日历弹窗
.full-calendar-mask {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: rgba(16, 24, 18, 0.56);
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	backdrop-filter: blur(5px);
}

.full-calendar-content {
	display: block;
	box-sizing: border-box;
	width: calc(100% - 40rpx);
	max-width: 720rpx;
	background-color: #ffffff;
	border: 1rpx solid rgba(23, 32, 25, .07);
	border-radius: 38rpx;
	padding: 30rpx 22rpx 25rpx;
	max-height: 80vh;
	overflow: hidden;
	box-shadow: 0 36rpx 100rpx rgba(14, 24, 17, .22);

	.full-calendar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12rpx;
		padding: 0 11rpx 16rpx;

		.full-calendar-title {
			font-size: 31rpx;
			font-weight: 700;
			color: #172019;
		}

		.full-calendar-close {
			font-size: 37rpx;
			color: #657168;
			line-height: 1;
			width: 54rpx;
			height: 54rpx;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 50%;
			background: #f0f3ee;
		}
	}

	.full-calendar-body {
		display: block;
		max-height: calc(80vh - 120rpx);
		overflow: hidden;
	}
}

::v-deep .uni-calendar__content {
	overflow: hidden;
	border-radius: 24rpx;
}

::v-deep .uni-calendar__header {
	height: 92rpx;
	border-bottom-color: #edf0eb;
}

::v-deep .uni-calendar__header-text {
	font-size: 25rpx;
	font-weight: 700;
	color: #273129;
}

::v-deep .uni-calendar__header-btn-box {
	width: 82rpx;
	height: 82rpx;
}

::v-deep .uni-calendar__header-btn {
	border-left-color: #647168;
	border-top-color: #647168;
}

::v-deep .uni-calendar__weeks-day {
	height: 70rpx;
	border-bottom-color: #f0f2ee;
}

::v-deep .uni-calendar__weeks-day-text {
	font-size: 21rpx;
	font-weight: 650;
	color: #7a857c;
}

::v-deep .uni-calendar-item__weeks-box-item {
	width: 76rpx;
	height: 76rpx;
	border-radius: 50%;
}

::v-deep .uni-calendar-item__weeks-box-text {
	font-size: 23rpx;
	color: #263028;
}

::v-deep .uni-calendar-item__weeks-lunar-text {
	font-size: 17rpx;
}

::v-deep .uni-calendar-item__weeks-box.uni-calendar-item--isDay,
::v-deep .uni-calendar-item__weeks-box.uni-calendar-item--checked {
	background-color: transparent !important;
	opacity: 1;
}

::v-deep .uni-calendar-item__weeks-box.uni-calendar-item--isDay .uni-calendar-item__weeks-box-item,
::v-deep .uni-calendar-item__weeks-box.uni-calendar-item--checked .uni-calendar-item__weeks-box-item {
	border-radius: 50%;
	background-color: #172019;
}

::v-deep .uni-calendar-item__weeks-box-text.uni-calendar-item--isDay,
::v-deep .uni-calendar-item__weeks-box-text.uni-calendar-item--checked,
::v-deep .uni-calendar-item__weeks-lunar-text.uni-calendar-item--isDay,
::v-deep .uni-calendar-item__weeks-lunar-text.uni-calendar-item--checked {
	background-color: transparent !important;
	opacity: 1;
	color: #ffffff !important;
}

::v-deep .uni-calendar-item--disable {
	background-color: transparent;
	color: #bbc2bc;
}

// 日记详情卡片（白色背景）
.diary-detail-card {
	display: block;
	margin: 0 40rpx 40rpx;
	padding: 30rpx;
	background-color: #ffffff;
	border-radius: 24rpx;
	box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);

	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24rpx;
		margin-bottom: 30rpx;

		.day-heading {
			display: flex;
			min-width: 0;
			flex: 1;
			flex-direction: column;
			gap: 8rpx;
		}

		.day-name {
			font-size: 32rpx;
			font-weight: 600;
			color: #333;
		}

		.day-summary {
			font-size: 21rpx;
			line-height: 1.5;
			color: #7b857d;
		}

		.add-moment-button {
			box-sizing: border-box;
			height: 62rpx;
			margin: 0;
			padding: 0 22rpx;
			flex: 0 0 auto;
			font-size: 22rpx;
			font-weight: 650;
			line-height: 62rpx;
			color: #f5f8f1;
			border: 0;
			border-radius: 999rpx;
			background: #253228;
		}

		.add-moment-button::after {
			border: 0;
		}

		.visitor-count {
			font-size: 26rpx;
			color: #999;
		}
	}
}

.timeline-scroll {
	display: block;
	overflow: hidden;
	height: calc(100vh - 600rpx);
	max-height: 800rpx;
}

.timeline-container {
	padding-bottom: 20rpx;
}

.timeline-rule {
	display: block;
	margin: -12rpx 0 28rpx;
	color: #7b857d;
	font-size: 20rpx;
	line-height: 1.6;
}

.timeline-empty {
	display: flex;
	align-items: center;
	padding: 42rpx 26rpx 30rpx;
	flex-direction: column;
	border: 1rpx solid rgba(42, 59, 45, .08);
	border-radius: 22rpx;
	background: #f7f9f4;
	text-align: center;
}

.timeline-empty-mark {
	display: flex;
	width: 54rpx;
	height: 54rpx;
	align-items: center;
	justify-content: center;
	border-radius: 50%;
	background: #e4ecd8;
	font-family: Georgia, serif;
	font-size: 48rpx;
	line-height: 32rpx;
	color: #55644e;
}

.timeline-empty-title {
	margin-top: 20rpx;
	font-size: 30rpx;
	font-weight: 680;
	color: #313d34;
}

.timeline-empty-copy {
	max-width: 500rpx;
	margin-top: 12rpx;
	font-size: 24rpx;
	line-height: 1.65;
	color: #556158;
}

.timeline-empty button {
	height: 62rpx;
	margin: 28rpx 0 0;
	padding: 0 28rpx;
	font-size: 22rpx;
	font-weight: 650;
	line-height: 62rpx;
	color: #304033;
	border: 1rpx solid #cdd9c6;
	border-radius: 999rpx;
	background: #edf3e5;
}

.timeline-empty button::after {
	border: 0;
}

/* #ifdef H5 */
@media (min-width: 1024px) {
	.diary-page {
		box-sizing: border-box;
		padding: 0 54px 70px 150px;
	}

	.status-bar {
		display: none;
	}

	.title-row,
	.date-selector,
	.diary-content-layout {
		max-width: 1180px;
		margin-right: auto;
		margin-left: auto;
	}

	.title-row {
		box-sizing: border-box;
		padding: 68px 0 36px !important;
	}

	.title-row .title-text {
		font-size: 54px;
		letter-spacing: -2px;
	}

	.title-row .month-picker {
		padding: 10px 17px;
	}

	.date-selector {
		box-sizing: border-box;
		padding: 0 0 38px;
	}

	.date-selector .weekdays-row {
		margin-bottom: 15px;
	}

	.date-selector .date-circle {
		width: 48px;
		height: 48px;
	}

	.diary-content-layout {
		display: grid;
		grid-template-columns: minmax(0, .78fr) minmax(460px, 1.22fr);
		gap: 24px;
		align-items: start;
	}

	.diary-overview-column {
		min-width: 0;
	}

	.search-container,
	.full-day-diaries-container {
		padding-right: 0;
		padding-left: 0;
	}

	.full-day-diaries-container {
		padding-bottom: 0;
	}

	.full-day-diaries-container .full-day-diaries-scroll .full-day-diaries-list {
		box-sizing: border-box;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 105px;
		gap: 14px;
		padding-right: 0;
	}

	.full-day-diaries-container .full-day-diaries-scroll .full-day-diaries-list .full-day-diary-card {
		width: 100%;
		height: 270px;
		border-radius: 28px;
	}

	.diary-detail-card {
		box-sizing: border-box;
		margin: 0;
		padding: 28px;
		border-radius: 30px;
		box-shadow: 0 18px 55px rgba(58, 80, 60, .075);
	}

	.timeline-scroll {
		height: 590px;
		max-height: none;
	}
}
/* #endif */

.schedule-item {
	display: flex;
	margin-bottom: 20rpx;

	.time-marker {
		width: 120rpx;
		padding-right: 20rpx;
		flex-shrink: 0;

		.time-text {
			font-size: 24rpx;
			color: #999;
			font-weight: 500;
		}
	}

	.schedule-card {
		flex: 1;
		padding: 20rpx 24rpx;
		border-radius: 50rpx; // 左右半圆的pill形状
		box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);

		&.pink {
			background-color: #FFE4E1; // 降低饱和度的粉色
		}
		&.yellow {
			background-color: #FFF8DC; // 降低饱和度的黄色
		}
		&.purple {
			background: repeating-linear-gradient(
				45deg,
				#E6D9EC,
				#E6D9EC 10rpx,
				#E8D5E8 10rpx,
				#E8D5E8 20rpx
			); // 降低饱和度的紫色
		}
		&.gray {
			background-color: #E0E0E0;
		}
		&.blue {
			background-color: #E0F2F7; // 降低饱和度的蓝色
		}
		&.default {
			background-color: #F5F5F5;
		}

		.schedule-header {
			display: flex;
			align-items: center;
			margin-bottom: 12rpx;

			.schedule-avatar {
				width: 60rpx;
				height: 60rpx;
				border-radius: 50%;
				overflow: hidden;
				margin-right: 16rpx;

				image {
					width: 100%;
					height: 100%;
				}
			}

			.schedule-title {
				display: -webkit-box;
				min-width: 0;
				max-width: 100%;
				overflow: hidden;
				font-size: 28rpx;
				font-weight: 600;
				line-height: 1.45;
				color: #333;
				word-break: break-word;
				-webkit-box-orient: vertical;
				-webkit-line-clamp: 2;
			}
		}

		.schedule-time-range {
			display: flex;
			align-items: center;
			gap: 8rpx;

			.time-icon {
				font-size: 24rpx;
			}

			.time-range {
				font-size: 22rpx;
				color: #666;
			}
		}
	}

	.schedule-empty {
		flex: 1;
		padding: 20rpx 24rpx;
		border-radius: 50rpx; // 左右半圆的pill形状
		background-color: transparent;
		border: 2rpx dashed #ddd;

		.empty-hint {
			font-size: 24rpx;
			color: #999;
		}
	}
}

.empty-state {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 100rpx 0;

	.empty-text {
		font-size: 28rpx;
		color: #999;
	}
}

/* 2026-09 首页第三版：连续事件流 + 整日时间轴。 */
.diary-page {
	box-sizing: border-box;
	padding-bottom: calc(112rpx + env(safe-area-inset-bottom));
	background: #fbfcf8;
}

.status-bar { background: #fbfcf8; }

.title-row {
	box-sizing: border-box;
	min-height: 96rpx;
	padding: 0 28rpx 14rpx;
}

.selected-date-label {
	display: flex;
	min-width: 0;
	flex: 1;
	align-items: center;
	gap: 12rpx;
}

.selected-date-text {
	overflow: hidden;
	color: #172019;
	font-size: 30rpx;
	font-weight: 700;
	letter-spacing: -.5rpx;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.date-dropdown-arrow {
	position: relative;
	display: block;
	width: 24rpx;
	height: 30rpx;
	margin-left: -5rpx;
	flex: 0 0 auto;
	align-self: center;
}

.date-dropdown-arrow::after {
	position: absolute;
	top: 7rpx;
	left: 5rpx;
	box-sizing: border-box;
	width: 12rpx;
	height: 12rpx;
	border-right: 3rpx solid #6e7a70;
	border-bottom: 3rpx solid #6e7a70;
	content: '';
	transform: rotate(45deg);
}

.selected-date-label .today-jump {
	padding: 8rpx 12rpx;
	flex: 0 0 auto;
	color: #526158;
	border-radius: 999rpx;
	background: #edf3e8;
	font-size: 20rpx;
}

.home-top-controls { display: flex; flex: 0 0 auto; align-items: center; gap: 8rpx; }
.home-top-control { display: flex; box-sizing: border-box; width: 62rpx; height: 62rpx; margin: 0; padding: 0; align-items: center; justify-content: center; border: 0; border-radius: 50%; background: transparent; color: #4c5a50; line-height: 62rpx; }
.home-top-control::after { border: 0; }
.home-top-control.active { background: #e5eee0; color: #172019; }
.view-control-glyph { position: relative; width: 34rpx; height: 30rpx; border: 3rpx solid currentColor; border-radius: 6rpx; }
.view-control-glyph::before { position: absolute; top: -3rpx; bottom: -3rpx; left: 7rpx; width: 3rpx; background: currentColor; content: ''; }
.view-control-glyph text { position: absolute; left: -10rpx; display: block; width: 5rpx; height: 5rpx; border-radius: 50%; background: currentColor; }
.view-control-glyph text:first-child { top: 1rpx; }.view-control-glyph text:nth-child(2) { top: 10rpx; }.view-control-glyph text:last-child { top: 19rpx; }
.options-control-glyph { display: flex; width: 34rpx; height: 29rpx; flex-direction: column; justify-content: space-between; }
.options-control-glyph text { position: relative; display: block; height: 3rpx; margin-left: 8rpx; border-radius: 3rpx; background: currentColor; }
.options-control-glyph text::before { position: absolute; top: -2rpx; left: -9rpx; width: 7rpx; height: 7rpx; border: 2rpx solid currentColor; border-radius: 50%; background: #fbfcf8; content: ''; }
.options-control-glyph text:nth-child(2)::before { left: 9rpx; }.options-control-glyph text:nth-child(2) { margin-right: 8rpx; margin-left: 0; }
.settings-control-glyph { font-size: 39rpx; font-weight: 400; line-height: 1; }

.list-view-icon,
.timeline-view-icon { display: flex; width: 24rpx; height: 24rpx; flex-direction: column; justify-content: space-between; }
.list-view-icon text { display: block; width: 24rpx; height: 3rpx; border-radius: 3rpx; background: currentColor; }
.timeline-view-icon { border: 2rpx solid currentColor; border-radius: 4rpx; }
.timeline-view-icon text { display: block; width: 100%; height: 2rpx; background: currentColor; }
.calendar-view-button { font-size: 25rpx !important; }

.week-swiper { height: 118rpx; }

.home-discovery {
	display: flex;
	box-sizing: border-box;
	width: 100%;
	padding: 12rpx 28rpx 8rpx;
	flex-direction: column;
	gap: 12rpx;
}

.home-search-entry {
	display: flex;
	box-sizing: border-box;
	width: 100%;
	height: 76rpx;
	margin: 0;
	padding: 0 22rpx;
	align-items: center;
	gap: 14rpx;
	border: 1rpx solid rgba(23, 32, 25, .08);
	border-radius: 22rpx;
	background: #f0f3ed;
	box-shadow: none;
	color: #68746b;
	font-size: 25rpx;
	line-height: 76rpx;
	text-align: left;
}

.home-search-entry::after { border: 0; }
.home-search-icon { color: #35453a; font-size: 31rpx; font-weight: 700; line-height: 1; }

.home-pending-review {
	display: grid;
	box-sizing: border-box;
	width: 100%;
	min-height: 96rpx;
	padding: 17rpx 18rpx 17rpx 20rpx;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 16rpx;
	align-items: center;
	border: 1rpx solid #dce6c8;
	border-radius: 20rpx;
	background: #eef3df;
}

.home-pending-review > view:first-child { display: flex; min-width: 0; flex-direction: column; gap: 6rpx; }
.home-pending-review > view:first-child text:first-child { color: #263429; font-size: 25rpx; font-weight: 720; }
.home-pending-review > view:first-child text:last-child { overflow: hidden; color: #5d695e; font-size: 20rpx; text-overflow: ellipsis; white-space: nowrap; }
.home-pending-review > view:last-child { display: flex; align-items: center; gap: 10rpx; color: #526158; font-size: 21rpx; }
.home-pending-review > view:last-child text:last-child { font-size: 32rpx; line-height: 1; }

.date-selector {
	display: flex;
	box-sizing: border-box;
	padding: 0 24rpx 12rpx;
	justify-content: space-between;
	border-bottom: 1rpx solid rgba(23, 32, 25, .08);
}

.date-cell {
	display: flex;
	box-sizing: border-box;
	width: 82rpx;
	height: 106rpx;
	padding: 12rpx 0 9rpx;
	align-items: center;
	flex-direction: column;
	justify-content: space-between;
	border-radius: 18rpx;
}
.date-cell .weekday-item { color: #667269; font-size: 22rpx; line-height: 1; }
.date-cell .date-number { color: #303a32; font-size: 30rpx; font-weight: 680; line-height: 1; }
.date-cell .date-dot { display: block; width: 6rpx; height: 6rpx; border-radius: 50%; background: transparent; }
.date-cell.has-diary .date-dot { background: #5c7558; }
.date-cell.active { background: #e3e8e0; }
.date-cell.active .weekday-item,
.date-cell.active .date-number { color: #172019; font-weight: 750; }

.day-content.day-slide-forward { animation: day-slide-forward .24s ease-out; }.day-content.day-slide-backward { animation: day-slide-backward .24s ease-out; }
@keyframes day-slide-forward { from { opacity: .35; transform: translateX(36rpx); } to { opacity: 1; transform: translateX(0); } }
@keyframes day-slide-backward { from { opacity: .35; transform: translateX(-36rpx); } to { opacity: 1; transform: translateX(0); } }

.day-flow-view { display: block; padding: 0 28rpx; }
.stream-day-header { display: flex; min-height: 76rpx; padding: 15rpx 0 5rpx; align-items: center; justify-content: space-between; }
.stream-day-header > view { display: flex; align-items: baseline; gap: 9rpx; }
.stream-day-header > view text:first-child { color: #172019; font-size: 38rpx; font-weight: 800; }
.stream-day-header > view text:nth-child(2) { color: #172019; font-size: 27rpx; font-weight: 700; }
.stream-day-header > view text:last-child,
.stream-day-header > text { color: #5f6b62; font-size: 21rpx; }

.day-stream { display: flex; margin: 0; flex-direction: column; gap: 0; }
.stream-entry { position: relative; display: flex; width: 100%; min-height: 116rpx; margin: 0; padding: 12rpx 0; align-items: flex-start; gap: 12rpx; border: 0; border-radius: 0; background: transparent; text-align: left; line-height: 1.45; }
.stream-entry::after { border: 0; }
.stream-entry + .stream-entry { border-top: 1rpx solid rgba(23, 32, 25, .065); }
.stream-time { display: flex; box-sizing: border-box; width: 92rpx; min-height: 108rpx; padding: 11rpx 6rpx; align-items: center; flex: 0 0 92rpx; flex-direction: column; justify-content: space-between; border-left: 0; border-radius: 16rpx; background: #e8ece8; color: #172019; }
.stream-time text:first-child,
.stream-time text:last-child { font-size: 22rpx; font-weight: 720; line-height: 1; }
.stream-time text:nth-child(2) { color: #5e6a61; font-size: 20rpx; line-height: 1; }
.stream-time.time-open { justify-content: flex-start; gap: 17rpx; }
.stream-entry-body { display: flex; min-width: 0; padding: 2rpx 0 11rpx; flex: 1; flex-direction: column; gap: 7rpx; }
.stream-media { display: flex; margin-bottom: 2rpx; gap: 9rpx; }
.stream-media image { width: 112rpx; height: 112rpx; border-radius: 13rpx; background: #e7ece3; }
.stream-entry-title { display: -webkit-box; overflow: hidden; color: #172019; font-size: 29rpx; font-weight: 680; line-height: 1.4; word-break: break-word; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.stream-entry-copy { display: -webkit-box; overflow: hidden; color: #4f5c52; font-size: 23rpx; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.stream-entry-footer { display: flex; margin-top: 2rpx; align-items: center; gap: 9rpx; color: #59665c; font-size: 21rpx; }
.entry-badge { padding: 6rpx 11rpx; color: #405444; border: 1rpx solid #dbe5d5; border-radius: 9rpx; background: #f7faf4; font-size: 20rpx; line-height: 1; }
.entry-plan .entry-badge { color: #66733c; border-color: #dce6bc; background: #f3f7e5; }
.entry-source .entry-badge { color: #505b53; border-color: #d7ddd8; background: #f0f2f0; }
.entry-codex .entry-badge { color: #172019; border-color: #cddc7c; background: #eef4c7; }
.todo-complete { display: flex; width: 48rpx; height: 48rpx; margin: 2rpx 0 0; padding: 0; flex: 0 0 48rpx; align-items: center; justify-content: center; border: 2rpx solid #6f805a; border-radius: 50%; background: #fffdf7; color: #52643d; font-size: 26rpx; line-height: 48rpx; }.todo-complete::after { border: 0; }

.flow-empty { margin: 28rpx 0; border: 0; border-radius: 22rpx; background: #f0f4ec; box-shadow: none; }

.timeline-view { display: block; padding: 15rpx 28rpx 30rpx; }
.timeline-toolbar { display: flex; margin-bottom: 12rpx; align-items: center; justify-content: flex-end; }
.timeline-toolbar > text { color: #526158; font-size: 22rpx; }
.timeline-untimed { display: flex; margin-bottom: 12rpx; padding: 14rpx 18rpx; align-items: center; justify-content: space-between; border: 1rpx solid #dfe7cf; border-radius: 14rpx; background: #f1f5e7; }
.timeline-untimed text:first-child { color: #3d493f; font-size: 23rpx; font-weight: 650; }
.timeline-untimed text:last-child { color: #5d6958; font-size: 19rpx; }
.timeline-stage { position: relative; overflow: hidden; border-radius: 12rpx; transition: background .16s ease; }
.timeline-stage.capture-drop-active { background: rgba(221, 236, 140, .08); }
.timeline-stage.capture-drop-ready { background: rgba(221, 236, 140, .18); }
.timeline-hour { position: absolute; right: 0; left: 0; z-index: 0; display: flex; height: 112rpx; align-items: flex-start; }
.timeline-hour > text { width: 82rpx; padding-top: 1rpx; flex: 0 0 82rpx; color: #667269; font-size: 24rpx; line-height: 1; }
.timeline-hour > view { height: 1rpx; margin-top: 8rpx; flex: 1; background: rgba(23, 32, 25, .13); }
.timeline-gap-marker { position: absolute; right: 0; left: 82rpx; z-index: 4; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.timeline-gap-marker button { display: flex; height: 48rpx; min-width: 112rpx; margin: 0; padding: 0 18rpx; align-items: center; justify-content: center; gap: 9rpx; border: 1rpx solid rgba(23, 32, 25, .15); border-radius: 999rpx; background: rgba(245, 247, 241, .96); box-shadow: 0 5rpx 14rpx rgba(23, 32, 25, .09); color: #526158; font-size: 22rpx; font-weight: 700; line-height: 48rpx; pointer-events: auto; }
.timeline-gap-marker button::after { border: 0; }
.timeline-gap-marker button[disabled] { opacity: .82; pointer-events: none; }
.timeline-gap-marker.expanded button { background: rgba(255, 253, 247, .9); }
.timeline-gap-marker.locked button text:first-child { display: none; }
.timeline-events-layer { position: absolute; top: 0; right: 0; bottom: 0; left: 92rpx; z-index: 1; }
.timeline-event { position: absolute; z-index: 2; display: flex; box-sizing: border-box; margin: 0; padding: 8rpx 11rpx; overflow: hidden; align-items: stretch; flex-direction: column; justify-content: flex-start; border: 1rpx solid #d7e0d2; border-left: 6rpx solid #647867; border-radius: 10rpx; background: rgba(255, 255, 255, .97); text-align: left; box-shadow: 0 3rpx 10rpx rgba(23, 32, 25, .07); }
.timeline-event::after { border: 0; }
.timeline-event-main { display: flex; min-width: 0; align-items: center; gap: 8rpx; }.timeline-event.entry-plan .timeline-event-main { padding-right: 38rpx; }.timeline-event-main > text:last-child { min-width: 0; overflow: hidden; color: #172019; font-size: 24rpx; font-weight: 720; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }.timeline-source-icon { display: flex; width: 28rpx; height: 28rpx; flex: 0 0 28rpx; align-items: center; justify-content: center; border-radius: 7rpx; background: #e5efd9; color: #42634a; font-size: 18rpx; font-weight: 800; }.timeline-event-meta { display: flex; min-width: 0; margin-top: 4rpx; gap: 8rpx; color: #56635a; font-size: 19rpx; line-height: 1; }.timeline-event-meta text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.timeline-event-meta text:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timeline-event.is-compact { padding-right: 7rpx; padding-left: 7rpx; }
.timeline-event.is-compact .timeline-event-main { gap: 5rpx; }
.timeline-event.is-compact .timeline-source-icon { width: 24rpx; height: 24rpx; flex-basis: 24rpx; font-size: 14rpx; }
.timeline-event.is-compact .timeline-event-main > text:last-child { font-size: 22rpx; }
.timeline-event.is-compact .timeline-event-meta { font-size: 19rpx; }
.timeline-event.is-compact .timeline-event-meta text:last-child { display: none; }
.timeline-event.entry-voice { border-left-color: #8d7599; background: #f2edf4; }
.timeline-event.entry-action { border-left-color: #678d60; background: #edf5e9; }
.timeline-event.entry-source { border-left-color: #5e6961; background: #f0f2ef; }
.timeline-event.entry-plan { border-left-color: #9aac5c; background: #f1f6df; }.timeline-event.entry-codex { border-left-color: #172019; background: #eef4e8; }.timeline-event.entry-codex .timeline-source-icon { background: #172019; color: #ddec8c; }
.timeline-todo-complete { position: absolute; top: 8rpx; right: 8rpx; display: flex; width: 34rpx; height: 34rpx; margin: 0; padding: 0; align-items: center; justify-content: center; border: 2rpx solid #6f805a; border-radius: 50%; background: #fffdf7; color: #52643d; font-size: 21rpx; line-height: 34rpx; }.timeline-todo-complete::after { border: 0; }
.timeline-selection { position: absolute; right: 8rpx; left: 0; z-index: 5; box-sizing: border-box; padding: 10rpx 14rpx; border: 2rpx solid #789241; border-radius: 12rpx; background: rgba(221, 236, 140, .76); color: #172019; font-size: 22rpx; font-weight: 750; pointer-events: none; }
.timeline-selection.selection-voice { border-color: #8d7599; background: rgba(226, 210, 232, .82); }
.timeline-selection.selection-todo { border-color: #789241; background: rgba(229, 239, 190, .88); }
.timeline-empty { margin-top: 18rpx; }

.view-popover-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 500; background: rgba(23, 32, 25, .08); }
.view-popover { position: fixed; z-index: 501; box-sizing: border-box; width: 500rpx; max-width: calc(100vw - 32px); padding: 22rpx 18rpx; border: 1rpx solid rgba(23, 32, 25, .12); border-radius: 24rpx; background: #fffdf7; box-shadow: 0 18rpx 48rpx rgba(23, 32, 25, .22); }
.view-popover::before { position: absolute; top: -14rpx; right: 22rpx; width: 28rpx; height: 28rpx; border-top: 1rpx solid rgba(23, 32, 25, .12); border-left: 1rpx solid rgba(23, 32, 25, .12); background: #fffdf7; content: ''; transform: rotate(45deg); }
.view-popover-label { display: block; padding: 4rpx 14rpx 9rpx; color: #667269; font-size: 21rpx; }
.view-popover button { position: relative; z-index: 1; display: grid; box-sizing: border-box; width: 100%; height: 82rpx; margin: 0; padding: 0 14rpx; grid-template-columns: 34rpx 42rpx minmax(0, 1fr); gap: 14rpx; align-items: center; border: 0; border-radius: 13rpx; background: transparent; color: #46534a; font-size: 27rpx; text-align: left; line-height: 82rpx; }
.view-popover button::after { border: 0; }
.view-popover button.active { background: #edf3e8; color: #172019; font-weight: 720; }
.view-popover .popover-check { visibility: hidden; color: #42634a; font-size: 28rpx; font-weight: 800; }
.view-popover button.active .popover-check { visibility: visible; }
.view-popover .list-view-icon,
.view-popover .timeline-view-icon { width: 32rpx; height: 29rpx; color: currentColor; }
.view-popover .list-view-icon text { width: 32rpx; }
.popover-period-icon { color: #56635a; font-size: 29rpx; line-height: 1; }
.popover-divider { height: 1rpx; margin: 10rpx 14rpx; background: #dfe7db; }

.home-panel-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 500; display: flex; align-items: flex-end; background: rgba(23, 32, 25, .42); }
.home-control-sheet { box-sizing: border-box; width: 100%; max-width: 780px; margin: 0 auto; padding: 12rpx 28rpx calc(26rpx + env(safe-area-inset-bottom)); overflow: hidden; border-radius: 34rpx 34rpx 0 0; background: #f8faf5; box-shadow: 0 -16rpx 48rpx rgba(23, 32, 25, .15); }
.sheet-handle { width: 70rpx; height: 8rpx; margin: 0 auto 12rpx; border-radius: 999rpx; background: #b8c1b8; }
.sheet-header { display: grid; min-height: 72rpx; grid-template-columns: 92rpx 1fr 92rpx; align-items: center; }
.sheet-header::before { content: ''; }
.sheet-header > text { color: #172019; font-size: 32rpx; font-weight: 760; text-align: center; }
.sheet-header button { height: 62rpx; margin: 0; padding: 0; background: transparent; color: #42634a; font-size: 25rpx; font-weight: 720; line-height: 62rpx; }
.sheet-header button::after { border: 0; }
.sheet-body { box-sizing: border-box; width: 100%; }
.options-sheet-body { height: 930rpx; max-height: 72vh; }
.settings-sheet-body { height: 780rpx; max-height: 68vh; }
.sheet-section-label { display: block; margin: 24rpx 8rpx 12rpx; color: #59655c; font-size: 22rpx; font-weight: 650; }
.panel-source-options,
.sheet-quick-actions { overflow: hidden; border: 1rpx solid #e1e8de; border-radius: 22rpx; background: #fffdf7; }
.panel-source-option,
.sheet-quick-actions button { position: relative; display: grid; box-sizing: border-box; width: 100%; min-height: 104rpx; margin: 0; padding: 16rpx 20rpx; grid-template-columns: 48rpx minmax(0, 1fr) 36rpx; gap: 15rpx; align-items: center; border: 0; border-radius: 0; background: transparent; color: #172019; text-align: left; line-height: 1.25; }
.panel-source-option::after,
.sheet-quick-actions button::after { border: 0; }
.panel-source-option + .panel-source-option,
.sheet-quick-actions button + button { border-top: 1rpx solid #e5ebe2; }
.panel-source-option > view,
.sheet-quick-actions button > view { display: flex; min-width: 0; flex-direction: column; gap: 6rpx; }
.panel-source-option > view text:first-child,
.sheet-quick-actions button > view text:first-child { color: #172019; font-size: 26rpx; font-weight: 700; }
.panel-source-option > view text:last-child,
.sheet-quick-actions button > view text:last-child { color: #59655c; font-size: 21rpx; }
.choice-check { display: none; color: #42634a; font-size: 27rpx; font-weight: 800; text-align: right; }
.panel-source-option.active { background: #edf3e8; }
.panel-source-option.active .choice-check { display: block; }
.panel-source-icon { display: flex; width: 42rpx; height: 42rpx; align-items: center; justify-content: center; border-radius: 11rpx; background: #e8eee4; color: #35483a; font-size: 21rpx; font-weight: 800; }
.panel-source-option:first-child .panel-source-icon { background: #172019; color: #ddec8c; }
.sheet-quick-actions button > text:first-child { display: flex; width: 42rpx; height: 42rpx; align-items: center; justify-content: center; border: 2rpx solid #718075; border-radius: 50%; color: #46554a; font-size: 23rpx; font-weight: 760; }
.sheet-quick-actions button > text:last-child { color: #718075; font-size: 34rpx; text-align: right; }
.sheet-setting-note { display: block; margin: 18rpx 8rpx 16rpx; color: #59655c; font-size: 22rpx; }
.default-view-options { display: grid; overflow: hidden; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1rpx solid #e1e8de; border-radius: 20rpx; background: #fffdf7; }
.default-view-options button { display: flex; height: 76rpx; margin: 0; padding: 0; align-items: center; justify-content: center; gap: 5rpx; border: 0; border-radius: 0; background: transparent; color: #59655c; font-size: 22rpx; line-height: 76rpx; }
.default-view-options button::after { border: 0; }
.default-view-options button + button { border-left: 1rpx solid #e5ebe2; }
.default-view-options button text:last-child { display: none; color: #42634a; font-size: 20rpx; font-weight: 800; }
.default-view-options button.active { background: #e8efe3; color: #172019; font-weight: 720; }
.default-view-options button.active text:last-child { display: inline; }
.default-view-note { display: block; margin: 11rpx 8rpx 8rpx; color: #667269; font-size: 20rpx; line-height: 1.4; }
.home-setting-options { overflow: hidden; border: 1rpx solid #e1e8de; border-radius: 22rpx; background: #fffdf7; }
.home-setting-row { display: grid; min-height: 112rpx; padding: 18rpx 20rpx; grid-template-columns: minmax(0, 1fr) auto; gap: 18rpx; align-items: center; }
.home-setting-row + .home-setting-row { border-top: 1rpx solid #e5ebe2; }
.home-setting-row > view { display: flex; min-width: 0; flex-direction: column; gap: 7rpx; }
.home-setting-row > view text:first-child { color: #172019; font-size: 26rpx; font-weight: 700; }
.home-setting-row > view text:last-child { color: #59655c; font-size: 21rpx; line-height: 1.35; }

.capture-dock { right: 0; bottom: calc(130rpx + env(safe-area-inset-bottom)); left: 0; width: 430rpx; max-width: calc(100vw - 48rpx); padding: 0; gap: 10rpx; border: 0; border-radius: 0; background: transparent; box-shadow: none; backdrop-filter: none; }
.capture-dock button { height: 76rpx; min-width: 0; padding: 0 15rpx; flex: 1; color: #172019 !important; border: 1rpx solid rgba(23, 32, 25, .13); border-radius: 999rpx; background: rgba(255, 255, 255, .96) !important; box-shadow: 0 9rpx 24rpx rgba(23, 32, 25, .13); font-size: 28rpx; font-weight: 700; line-height: 76rpx; touch-action: none; user-select: none; }
.capture-dock button text:first-child { font-family: inherit; font-size: 24rpx; }
.capture-dock .capture-grip { margin-left: 2rpx; color: #727e75; font-size: 21rpx; }
.capture-drag-ghost { position: fixed; z-index: 130; display: flex; min-width: 150rpx; padding: 12rpx 16rpx; flex-direction: column; gap: 3rpx; border: 1rpx solid rgba(23, 32, 25, .16); border-radius: 13rpx; background: rgba(255, 253, 247, .96); box-shadow: 0 12rpx 32rpx rgba(23, 32, 25, .18); color: #172019; pointer-events: none; transform: translateY(-100%); }
.capture-drag-ghost text:first-child { font-size: 22rpx; font-weight: 750; }
.capture-drag-ghost text:last-child { color: #56635a; font-size: 19rpx; }
.capture-drag-ghost.ghost-record { border-color: #b8c6b2; background: #f4f7f0; }
.capture-drag-ghost.ghost-todo { border-color: #cfdc9f; background: #f2f6df; }

.period-overview-shell { box-sizing: border-box; width: 100%; padding: 4rpx 28rpx 210rpx; }
.period-navigation { display: grid; grid-template-columns: 64rpx minmax(0, 1fr) 64rpx; gap: 16rpx; align-items: center; margin: 6rpx 0 22rpx; }
.period-navigation button { display: flex; width: 64rpx; height: 64rpx; margin: 0; padding: 0; align-items: center; justify-content: center; border: 1rpx solid rgba(23, 32, 25, .09); border-radius: 50%; background: rgba(255, 255, 255, .72); color: #172019; font-size: 38rpx; line-height: 64rpx; }
.period-navigation button::after { border: 0; }
.period-navigation > view { min-width: 0; text-align: center; }
.period-navigation > view text { display: block; }
.period-navigation > view text:first-child { font-size: 31rpx; font-weight: 740; }
.period-navigation > view text:last-child { margin-top: 5rpx; color: #5f6b62; font-size: 21rpx; }
.period-loading { display: flex; min-height: 360rpx; align-items: center; justify-content: center; gap: 14rpx; color: #5d6960; font-size: 23rpx; }
.period-loading view { width: 28rpx; height: 28rpx; border: 3rpx solid #d8e1d4; border-top-color: #42634a; border-radius: 50%; animation: period-spin 1s linear infinite; }
@keyframes period-spin { to { transform: rotate(360deg); } }
.week-overview { width: 100%; }
.week-columns { display: flex; box-sizing: border-box; min-width: 100%; gap: 14rpx; padding-bottom: 12rpx; }
.week-column { box-sizing: border-box; width: 248rpx; min-height: 650rpx; padding: 13rpx; flex: 0 0 248rpx; border: 1rpx solid rgba(23, 32, 25, .07); border-radius: 24rpx; background: rgba(255, 255, 255, .58); }
.week-column.today { border-color: #a7bc80; background: #f7faee; }
.week-day-heading { display: grid; min-height: 114rpx; padding: 12rpx 8rpx 16rpx; grid-template-columns: 1fr auto; align-items: end; border-bottom: 1rpx solid rgba(23, 32, 25, .08); }
.week-day-heading text:first-child { color: #5f6b62; font-size: 21rpx; }
.week-day-heading text:nth-child(2) { grid-row: 1 / 3; grid-column: 2; font-size: 43rpx; font-weight: 740; }
.week-day-heading text:last-child { margin-top: 6rpx; color: #667269; font-size: 20rpx; }
.week-day-empty { padding: 46rpx 8rpx; text-align: center; color: #6d786f; font-size: 21rpx; }
.period-entry { position: relative; box-sizing: border-box; margin-top: 12rpx; padding: 14rpx 14rpx 13rpx; overflow: hidden; border-left: 6rpx solid #708273; border-radius: 14rpx; background: #fff; box-shadow: 0 4rpx 12rpx rgba(23, 32, 25, .06); }
.period-entry.entry-plan { border-left-color: #9aac5c; background: #f1f6df; }
.period-entry.entry-voice { border-left-color: #8d7599; background: #f2edf4; }
.period-entry.entry-action { border-left-color: #678d60; background: #edf5e9; }
.period-entry.entry-codex { border-left-color: #172019; background: #eef4e8; }
.period-entry > view { display: flex; align-items: center; gap: 7rpx; color: #59665d; font-size: 19rpx; }
.period-source-icon { display: flex; width: 29rpx; height: 29rpx; align-items: center; justify-content: center; border-radius: 7rpx; background: rgba(23, 32, 25, .08); color: #314435; font-size: 16rpx; font-weight: 800; }
.period-entry-title, .period-entry-badge { display: block; }
.period-entry-title { margin-top: 9rpx; overflow: hidden; color: #172019; font-size: 24rpx; font-weight: 690; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.period-entry-badge { margin-top: 7rpx; color: #56635a; font-size: 18rpx; }
.month-overview { overflow: hidden; border: 1rpx solid rgba(23, 32, 25, .07); border-radius: 26rpx; background: rgba(255, 255, 255, .64); }
.month-weekdays, .month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.month-weekdays { padding: 16rpx 10rpx 10rpx; }
.month-weekdays text { text-align: center; color: #5f6b62; font-size: 20rpx; }
.month-grid { padding: 0 10rpx 10rpx; }
.month-day { position: relative; box-sizing: border-box; min-height: 94rpx; padding: 11rpx 8rpx 8rpx; border-top: 1rpx solid rgba(23, 32, 25, .06); }
.month-day.outside { opacity: .3; }
.month-day.selected { border-radius: 16rpx; background: #172019; color: #fff; }
.month-day.today:not(.selected) .month-day-number { color: #42634a; font-weight: 800; text-decoration: underline; text-underline-offset: 5rpx; }
.month-day-number { font-size: 23rpx; }
.month-day-count { position: absolute; top: 9rpx; right: 7rpx; min-width: 25rpx; color: #59665d; font-size: 17rpx; text-align: right; }
.month-day.selected .month-day-count { color: #d7e1d3; }
.month-day-signals { position: absolute; right: 8rpx; bottom: 10rpx; left: 8rpx; display: flex; flex-wrap: wrap; gap: 4rpx; }
.month-day-signals text, .period-legend .signal-diary, .period-legend .signal-plan, .period-legend .signal-action, .period-legend .signal-source { display: block; width: 9rpx; height: 9rpx; border-radius: 50%; }
.signal-diary { background: #7aa374; }.signal-plan { background: #a7b962; }.signal-action { background: #4f7256; }.signal-source { background: #343e37; }
.period-legend { display: flex; padding: 15rpx 20rpx; justify-content: flex-end; flex-wrap: wrap; gap: 16rpx; border-top: 1rpx solid rgba(23, 32, 25, .06); }
.period-legend > view { display: flex; align-items: center; gap: 6rpx; color: #556158; font-size: 19rpx; }
.month-selected-day { margin-top: 18rpx; padding: 24rpx; border-radius: 24rpx; background: rgba(255,255,255,.72); }
.selected-day-heading { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.selected-day-heading > text { font-size: 29rpx; font-weight: 720; }
.selected-day-heading button { margin: 0; padding: 0 18rpx; border-radius: 999rpx; background: #e8efe3; color: #36593e; font-size: 21rpx; line-height: 54rpx; }
.selected-day-heading button::after { border: 0; }
.selected-day-empty { display: block; padding: 28rpx 0 12rpx; color: #68746b; font-size: 22rpx; }
.month-agenda-entry { display: grid; padding: 17rpx 0; grid-template-columns: 40rpx minmax(0, 1fr); gap: 12rpx; border-bottom: 1rpx solid rgba(23, 32, 25, .07); }
.month-agenda-entry > text { display: flex; width: 40rpx; height: 40rpx; align-items: center; justify-content: center; border-radius: 10rpx; background: #e9f0e4; color: #42634a; font-size: 19rpx; font-weight: 800; }
.month-agenda-entry view text { display: block; }.month-agenda-entry view text:first-child { font-size: 25rpx; font-weight: 650; }.month-agenda-entry view text:last-child { margin-top: 5rpx; color: #58655b; font-size: 20rpx; }
.plan-boundary { display: block; margin-top: 15rpx; color: #5e6b54; font-size: 20rpx; }
.year-summary { display: flex; margin-bottom: 18rpx; align-items: flex-end; justify-content: space-between; gap: 16rpx; }
.year-summary text:first-child { font-size: 36rpx; font-weight: 760; }.year-summary text:last-child { color: #59665d; font-size: 21rpx; text-align: right; }
.year-months { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14rpx; }
.year-month { padding: 18rpx 16rpx; border: 1rpx solid rgba(23, 32, 25, .07); border-radius: 22rpx; background: rgba(255,255,255,.66); }
.year-month-heading { display: flex; margin-bottom: 11rpx; align-items: center; justify-content: space-between; }.year-month-heading text:first-child { font-size: 25rpx; font-weight: 720; }.year-month-heading text:last-child { color: #647068; font-size: 18rpx; }
.mini-weekdays, .mini-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4rpx; }
.mini-weekdays { margin-bottom: 5rpx; }.mini-weekdays text { text-align: center; color: #626e65; font-size: 16rpx; }
.mini-days text { display: flex; aspect-ratio: 1; align-items: center; justify-content: center; border-radius: 5rpx; background: #edf1e9; color: #4f5c52; font-size: 16rpx; }
.mini-days text.blank { background: transparent; }.mini-days text.level-1 { background: #dce9d4; color: #526a55; }.mini-days text.level-2 { background: #aeca9f; color: #28412d; }.mini-days text.level-3 { background: #42634a; color: #fff; }

/* #ifdef H5 */
@media (min-width: 1024px) {
	.title-row,
	.period-view-switch,
		.period-overview-shell,
		.week-swiper,
		.home-discovery,
		.date-selector,
	.source-filter-scroll,
	.day-flow-view,
	.timeline-view,
	.icp-footer { box-sizing: border-box; max-width: 780px; margin-right: auto; margin-left: auto; }
	.title-row { padding: 62px 10px 14px !important; }
	.date-selector { padding-right: 10px; padding-left: 10px; }
	.capture-dock { transform: translateX(48px); }
}
/* #endif */

</style>
