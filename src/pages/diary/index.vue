<template>
	<view class="diary-page">
		<!-- 状态栏占位 -->
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

		<!-- 主标题和月份选择器 -->
		<view class="title-row" :style="{ paddingTop: (customBarHeightRpx + 20) + 'rpx' }">
			<text class="title-text" @click="showFullCalendar">日记</text>
			<view class="month-picker" @click.stop="goToTodoList">
				<text class="month-text">我的待办</text>
				<view class="calendar-icon" v-if="pendingTodoCount > 0">
					<text class="calendar-day">{{ pendingTodoCount > 99 ? '99+' : pendingTodoCount }}</text>
				</view>
			</view>
		</view>

		<!-- 日期选择器 -->
		<view class="date-selector" @click="showFullCalendar">
			<!-- 星期行 -->
			<view class="weekdays-row">
				<text
					class="weekday-item"
					v-for="(day, index) in weekdays"
					:key="index"
				>{{ day }}</text>
			</view>
			<!-- 日期行 -->
			<view class="dates-row">
				<view
					class="date-circle"
					v-for="date in visibleDates"
					:key="date.date"
					:class="{ 'active': date.isSelected, 'has-diary': date.hasDiary }"
					@click.stop="selectDate(date.date)"
				>
					<text class="date-number">{{ date.day }}</text>
				</view>
			</view>
		</view>

		<view class="diary-content-layout">
			<view class="diary-overview-column">
		<!-- 搜索组件 -->
		<view class="search-container">
			<view class="search-box" @click="goToSearch">
				<text class="search-icon">🔍</text>
				<text class="search-placeholder">搜索日记...</text>
			</view>
		</view>

		<!-- 今天整篇日记横向列表 -->
		<view class="full-day-diaries-container">
			<scroll-view class="full-day-diaries-scroll" scroll-x>
				<view class="full-day-diaries-list">
					<!-- 日记卡片 -->
					<view
						class="full-day-diary-card"
						v-for="diary in fullDayDiaries"
						:key="diary.id"
						@click="viewFullDayDiary(diary)"
					>
						<view class="diary-card-image">
							<image :src="getDiaryImage(diary)" mode="aspectFill"></image>
							<view class="diary-overlay">
								<view class="diary-card-emoji" v-if="diary.emoji">{{ diary.emoji }}</view>
								<view class="diary-card-text">
									<text class="diary-card-title">{{ getDiaryPreview(diary) }}</text>
									<text class="diary-card-time">{{ getDiaryTimeLabel(diary) }}</text>
								</view>
							</view>
						</view>
					</view>

					<!-- 默认卡片（当没有日记时显示） -->
					<view
						class="full-day-diary-card default-card"
						v-if="fullDayDiaries.length === 0"
					>
						<view class="default-card-bg">
							<image :src="defaultImageUrl" mode="aspectFill"></image>
						</view>
						<view class="default-card-content">
							<text class="default-card-text">今天还没有整篇日记</text>
						</view>
					</view>

					<!-- 加号卡片 -->
					<view
						class="full-day-diary-card add-card"
						@click="createFullDayDiary"
					>
						<view class="add-card-content">
							<text class="add-icon">+</text>
						</view>
					</view>
				</view>
			</scroll-view>
		</view>

		<view class="action-records" v-if="actionRecords.length">
			<view class="action-records-heading"><text>ACTIONS</text><text>当天完成 · {{ actionRecords.length }}</text></view>
			<button v-for="record in actionRecords" :key="record.id" @tap="openActionRecord(record)">
				<text class="action-mark">✓</text><view><text>{{ record.title }}</text><text v-if="record.result">结果：{{ record.result }}</text><text v-else-if="record.projectName">{{ record.projectName }}</text></view><text>›</text>
			</button>
		</view>

		<view class="wellbeing-glimpse" v-if="wellbeingOverview && wellbeingOverview.records && wellbeingOverview.records.length" @tap="openWellbeing">
			<view class="wellbeing-glimpse-top"><view><text>BODY & MIND</text><text>{{ wellbeingCardTitle }}</text></view><text>›</text></view>
			<text class="wellbeing-glimpse-copy">{{ wellbeingRecordPreview(wellbeingOverview.records[0]) }}</text>
			<view class="wellbeing-glimpse-meta"><text>{{ wellbeingOverview.records[0].recordedOn }}</text><text v-if="wellbeingOverview.records[0].status === 'PENDING'">等待你确认</text><text v-else>已沉淀为独立记录</text></view>
		</view>
			</view>

		<!-- 日记详情卡片 -->
		<view class="diary-detail-card">
			<!-- 卡片头部 -->
			<view class="card-header">
				<text class="day-name">{{ dayName }}</text>
				<text class="visitor-count" v-if="false">{{ visitorCount }} Visitors</text>
			</view>

			<!-- 计划表时间线 -->
			<scroll-view
				class="timeline-scroll"
				scroll-y
				:refresher-enabled="true"
				:refresher-triggered="refreshing"
				@refresherrefresh="onRefresh"
			>
				<view class="timeline-container">
					<view
						class="schedule-item"
					v-for="slot in timeSlots"
						:key="slot.time"
						@click="editSchedule(slot)"
					>
						<!-- 时间标记 -->
						<view class="time-marker">
							<text class="time-text">{{ slot.time }}</text>
						</view>
						<!-- 计划卡片 -->
						<view class="schedule-card" :class="slot.type" v-if="slot.diary">
							<view class="schedule-header">
								<view class="schedule-avatar" v-if="slot.diary.avatar">
									<image :src="slot.diary.avatar" mode="aspectFill"></image>
								</view>
								<view class="schedule-title">{{ getTimeSlotPreview(slot.diary) }}</view>
							</view>
							<view class="schedule-time-range" v-if="slot.diary.timeRange">
								<text class="time-icon">🕐</text>
								<text class="time-range">{{ slot.diary.timeRange }}</text>
							</view>
						</view>
						<!-- 空时间段 -->
						<view class="schedule-empty" v-else>
							<text class="empty-hint">点击添加计划</text>
						</view>
					</view>

					<!-- 空状态 -->
					<view class="empty-state" v-if="timeSlots.filter(s => s.diary).length === 0">
						<text class="empty-text">今天还没有计划，开始记录吧~</text>
					</view>
				</view>
			</scroll-view>
		</view>
		</view>


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
import { diaryCalendar, diaryList } from '@/api/diary';
import { todoList } from '@/api/todo';
import { wellbeingSummary } from '@/api/wellbeing';
import diaryTime from '@/utils/diary-time.js';
import diaryPreviewUtils from '@/utils/diary-preview.js';

const { diaryLocalDate, diaryTimeLabel, hasExplicitDiaryTime, isFullDayDiary } = diaryTime;
const { diaryPreview } = diaryPreviewUtils;

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
			weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
			visibleDates: [],
			diaryList: [],
			calendarDateCounts: [],
			refreshing: false,
			diaryRequestSequence: 0,
			calendarRequestSequence: 0,
			timeSlots: [],
			actionRecords: [],
			visitorCount: 0,
			showFullCalendarView: false,
			pendingTodoCount: 0, // 待完成待办数量
			wellbeingOverview: null,
			// 默认图片URL
			defaultImageUrl: 'https://images.unsplash.com/photo-1493612276216-ee3925520721?w=800&h=600&fit=crop'
		};
	},
	computed: {
		dayName() {
			const date = moment(this.selectedDate);
			const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
			return weekdays[date.day()];
		},
		diaryDates() {
			return this.calendarDateCounts.map(item => ({
				date: item.date,
				info: item.count > 1 ? `${item.count} 篇` : '有日记',
				data: { hasDiary: true, count: item.count }
			}));
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

		// #ifndef MP-WEIXIN
		// 非小程序环境，使用默认值
		this.customBarHeight = this.statusBarHeight + 44;
		// #endif

		this.initDates();
	},
	onShow() {
		// 首次进入以及从编辑页返回时，都同步当前日期、月份标记和待办。
		this.loadDiaries();
		this.loadCalendarDates(this.selectedMonth);
		this.loadPendingTodoCount();
		this.loadWellbeingOverview();
	},
	methods: {
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
			return this.calendarDateCounts.some(item => item.date === dateStr);
		},

		// 选择日期
		selectDate(date) {
			this.changeSelectedDate(date, false);
		},

		changeSelectedDate(date, closeCalendar) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return;
			const previousMonth = this.selectedMonth;
			this.selectedDate = date;
			this.initDates();
			this.loadDiaries();
			this.loadWellbeingOverview();
			if (previousMonth !== this.selectedMonth && this.calendarDisplayMonth !== this.selectedMonth) {
				this.loadCalendarDates(this.selectedMonth);
			}
			if (closeCalendar) this.closeFullCalendar();
		},


		// 初始化时间段
		initTimeSlots() {
			// 首先收集所有有日记的时间段
			const diaryTimeMap = new Map();
			this.diaryList.forEach(diary => {
				const diaryDate = diaryLocalDate(diary);
				if (diaryDate === this.selectedDate) {
					// 只处理有时间段的日记（有hour和minute属性）
					if (hasExplicitDiaryTime(diary)) {
						const hour = Number(diary.hour);
						const minute = Number(diary.minute);
						// 将分钟数对齐到30分钟单位
						const alignedMinute = Math.floor(minute / 30) * 30;
						const timeKey = `${hour}_${alignedMinute}`;

						if (!diaryTimeMap.has(timeKey)) {
							diaryTimeMap.set(timeKey, diary);
						}
					}
				}
			});

			// 生成默认时间段（8:00-22:00，每30分钟）
			const defaultSlots = [];
			for (let hour = 8; hour < 22; hour++) {
				for (let minute = 0; minute < 60; minute += 30) {
					const timeKey = `${hour}_${minute}`;
					const diary = diaryTimeMap.get(timeKey);

					const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
					const timeDisplay = moment(`${timeStr}`, 'HH:mm').format('hh:mm A');

					defaultSlots.push({
						time: timeDisplay,
						hour: hour,
						minute: minute,
						diary: diary || null,
						type: diary ? diary.type || 'default' : null
					});

					// 如果这个时间段有日记，从map中移除，避免重复
					if (diary) {
						diaryTimeMap.delete(timeKey);
					}
				}
			}

			// 添加自定义时间段（不在默认范围内的）
			const customSlots = [];
			diaryTimeMap.forEach((diary, timeKey) => {
				const [hour, minute] = timeKey.split('_').map(Number);
				const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
				const timeDisplay = moment(`${timeStr}`, 'HH:mm').format('hh:mm A');

				customSlots.push({
					time: timeDisplay,
					hour: hour,
					minute: minute,
					diary: diary,
					type: diary.type || 'default'
				});
			});

			// 合并并排序所有时间段
			const allSlots = [...defaultSlots, ...customSlots];
			allSlots.sort((a, b) => {
				if (a.hour !== b.hour) {
					return a.hour - b.hour;
				}
				return a.minute - b.minute;
			});

			this.timeSlots = allSlots;
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
				uni.showToast({
					title: '加载失败',
					icon: 'none'
				});
			}
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

		// 创建整篇日记
		createFullDayDiary() {
			if (!this.requireLogin()) return;
			// 新建日记，不传递time参数，编辑页面会默认选择"当天日记"
			uni.navigateTo({
				url: `/pages/diary/edit?date=${this.selectedDate}`
			});
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
					// 优先使用total字段
					if (res.data.total !== undefined) {
						this.pendingTodoCount = res.data.total || 0;
						return;
					}

					// 如果没有total，计算list长度
					let todos = [];
					if (Array.isArray(res.data)) {
						todos = res.data;
					} else if (res.data.list && Array.isArray(res.data.list)) {
						todos = res.data.list;
					} else if (res.data.data && Array.isArray(res.data.data)) {
						todos = res.data.data;
					}

					this.pendingTodoCount = todos.length;
				}
			} catch (error) {
				console.error('加载待办数量失败', error);
				// 失败时不影响页面显示，数量保持为0
				this.pendingTodoCount = 0;
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
		align-items: center;
		justify-content: space-between;
		margin-bottom: 30rpx;

		.day-name {
			font-size: 32rpx;
			font-weight: 600;
			color: #333;
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

</style>
