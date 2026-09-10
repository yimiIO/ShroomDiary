<template>
	<view class="friends-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="friends-shell">
			<view class="page-header">
				<view class="back-button" @tap="goBack"><text>‹</text></view>
				<view class="header-copy">
					<text class="header-kicker">RELATIONSHIP MEMORY</text>
					<text class="header-title">{{ selectedFriend ? selectedFriend.name : '人脉资产' }}</text>
					<text class="header-subtitle">{{ selectedFriend ? selectedFriend.relationship || selectedFriend.description || '一段仍在生长的关系' : '记住相遇、信任与那些答应过的事。' }}</text>
				</view>
				<view class="private-badge" v-if="selectedFriend" @tap="editFriend"><text>编辑</text></view>
				<view class="private-badge" v-else><view class="private-dot"></view><text>仅自己</text></view>
			</view>

			<view v-if="!selectedFriend">
				<view class="overview-panel">
					<view>
						<text class="overview-label">PEOPLE IN MEMORY</text>
						<text class="overview-number">{{ total }}</text>
						<text class="overview-copy">位被认真记住的人</text>
					</view>
					<view class="score-legend">
						<text>9–10 核心</text><text>7–8 重要</text><text>5–6 一般</text>
					</view>
				</view>

				<view class="search-shell">
					<view class="search-glyph"></view>
					<input class="search-input" v-model="keyword" placeholder="搜索姓名、关系或标签" placeholder-class="search-placeholder" @input="onSearchInput" />
					<text class="search-clear" v-if="keyword" @tap="clearSearch">×</text>
				</view>
				<view class="create-row" @tap="createFriend"><text class="create-plus">＋</text><text>记住一个新的人</text><text class="create-arrow">›</text></view>

				<view class="loading-state" v-if="loading && !friends.length"><view class="loading-dot"></view><text>正在整理关系记忆…</text></view>
				<view class="friend-grid" v-else-if="friends.length">
					<view class="friend-card" v-for="friend in friends" :key="friend.id" @tap="openFriend(friend)">
						<view class="friend-topline">
						<view class="friend-avatar">{{ friend.initial }}</view>
							<view class="friend-heading">
								<text class="friend-name">{{ friend.name }}</text>
								<text class="friend-category">{{ friend.category || '朋友' }}</text>
							</view>
						<view class="score-badge" :class="friend.scoreTone">
								<text class="score-value">{{ friend.relationScore }}</text>
								<text class="score-label">{{ friend.level && friend.level.label }}</text>
							</view>
						</view>
						<text class="friend-relation">{{ friend.relationship || friend.description || '还没有补充关系描述' }}</text>
						<view class="friend-footer">
							<view class="friend-tags"><text v-for="tag in friend.visibleTags" :key="tag">{{ tag }}</text></view>
							<text class="last-contact">{{ formatLastInteraction(friend.lastInteraction) }}</text>
						</view>
					</view>
				</view>
				<view class="empty-state" v-else-if="!loading">
					<text class="empty-index">00</text>
					<text class="empty-title">{{ keyword ? '没有找到这个人' : '人脉资产还没有同步' }}</text>
					<text class="empty-copy">{{ keyword ? '换一个姓名、关系或标签试试。' : '龙虾端的人脉文件导入后，会连同互动、分值和承诺一起出现在这里。' }}</text>
				</view>
				<view class="load-more" v-if="hasMore" @tap="loadMore">{{ loading ? '正在加载…' : '继续查看' }}</view>
			</view>

			<view class="detail-layout" v-else>
				<view class="detail-summary">
					<view class="summary-score" :class="selectedFriend.scoreTone">
						<text class="summary-score-value">{{ selectedFriend.relationScore }}</text>
						<text class="summary-score-label">{{ selectedFriend.level && selectedFriend.level.label }}</text>
					</view>
					<view class="summary-copy">
						<text class="summary-category">{{ selectedFriend.category || '朋友' }}</text>
						<text class="summary-contact">最近互动 · {{ formatDate(selectedFriend.lastInteraction) }}</text>
						<view class="summary-tags"><text v-for="tag in selectedFriend.tags" :key="tag">{{ tag }}</text></view>
					</view>
				</view>
				<view class="action-strip">
					<view @tap="openAction('interaction')"><text class="action-symbol">○</text><text>记互动</text></view>
					<view @tap="openAction('score')"><text class="action-symbol">±</text><text>调关系</text></view>
					<view @tap="openAction('todo')"><text class="action-symbol">✓</text><text>记承诺</text></view>
				</view>

				<view class="detail-section">
					<view class="section-heading"><text class="section-kicker">INTERACTIONS</text><text class="section-title">互动时间线</text></view>
					<view class="timeline" v-if="selectedFriend.interactions && selectedFriend.interactions.length">
						<view class="timeline-item" v-for="item in selectedFriend.interactions" :key="item.id">
							<view class="timeline-dot"></view>
							<view class="timeline-copy">
								<view class="timeline-meta"><text>{{ formatDate(item.date) }}</text><text>{{ item.type }}</text></view>
								<text class="timeline-topic">{{ item.topic || item.notes || '一次互动' }}</text>
								<text class="timeline-notes" v-if="item.notes && item.notes !== item.topic">{{ item.notes }}</text>
							</view>
						</view>
					</view>
					<text class="section-empty" v-else>还没有互动记录</text>
				</view>

				<view class="detail-section score-history-section">
					<view class="section-heading"><text class="section-kicker">SCORE HISTORY</text><text class="section-title">关系变化</text></view>
					<view class="history-list" v-if="selectedFriend.scoreHistory && selectedFriend.scoreHistory.length">
						<view class="history-item" v-for="item in selectedFriend.scoreHistory" :key="item.id">
							<text class="history-change" :class="{ minus: item.change < 0 }">{{ item.change > 0 ? '+' : '' }}{{ item.change }}</text>
							<view class="history-copy"><text>{{ item.reason }}</text><text>{{ formatDate(item.date) }}</text></view>
						</view>
					</view>
					<text class="section-empty" v-else>还没有加减分记录</text>
				</view>

				<view class="detail-section commitments-section">
					<view class="section-heading"><text class="section-kicker">COMMITMENTS</text><text class="section-title">对彼此答应过的事</text></view>
					<view class="commitment-list" v-if="selectedFriend.todos && selectedFriend.todos.length">
						<view class="commitment-item" v-for="item in selectedFriend.todos" :key="item.id" @tap="completeTodo(item)">
							<view class="commitment-state" :class="item.status"></view>
							<view><text class="commitment-task">{{ item.task }}</text><text class="commitment-date">{{ item.dueDate ? '截止 ' + formatDate(item.dueDate) : '未设置截止日期' }}</text></view>
						</view>
					</view>
					<text class="section-empty" v-else>还没有未完成承诺</text>
				</view>
			</view>

			<view class="sheet-mask" v-if="actionMode" @tap="closeAction"></view>
			<view class="action-sheet" v-if="actionMode">
				<view class="sheet-handle"></view>
				<view class="sheet-header"><text>{{ actionTitle }}</text><text class="sheet-close" @tap="closeAction">×</text></view>
				<view v-if="actionMode === 'interaction'">
					<view class="sheet-field"><text>日期</text><input v-model="interactionForm.date" maxlength="10" placeholder="YYYY-MM-DD" /></view>
					<view class="sheet-field"><text>互动类型</text><input v-model="interactionForm.type" maxlength="48" placeholder="聊天 / 聚餐 / 合作" /></view>
					<view class="sheet-field"><text>发生了什么 *</text><textarea v-model="interactionForm.topic" maxlength="2000" placeholder="记录这次互动的主题与感受" /></view>
				</view>
				<view v-if="actionMode === 'score'">
					<picker :range="scoreRuleLabels" :value="scoreRuleIndex" @change="changeScoreRule"><view class="sheet-field picker-field"><text>关系变化</text><text>{{ scoreRuleLabels[scoreRuleIndex] }}　›</text></view></picker>
					<view class="sheet-field"><text>理由 *</text><textarea v-model="scoreForm.reason" maxlength="2000" placeholder="写清这次变化的事实依据" /></view>
				</view>
				<view v-if="actionMode === 'todo'">
					<view class="sheet-field"><text>我答应的事 *</text><textarea v-model="todoForm.task" maxlength="2000" placeholder="具体、可完成的承诺" /></view>
					<view class="sheet-field"><text>截止日期</text><input v-model="todoForm.dueDate" maxlength="10" placeholder="YYYY-MM-DD（可不填）" /></view>
				</view>
				<view class="sheet-submit" :class="{ disabled: submitting }" @tap="submitAction">{{ submitting ? '正在保存…' : '保存记录' }}</view>
			</view>
		</view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { friendDetail, friendList } from '@/api/friend';

export default {
	data() {
		return {
			statusBarHeight: 0,
			friends: [],
			selectedFriend: null,
			keyword: '',
			page: 1,
			pageSize: 16,
			total: 0,
			hasMore: false,
			loading: false,
			searchTimer: null,
			actionMode: '',
			submitting: false,
			interactionForm: { date: '', type: '聊天', topic: '' },
			scoreRuleIndex: 0,
			scoreRules: [
				{ code: 'R_PLUS_ACTIVE_CONTACT', label: '+1 对方主动联系' },
				{ code: 'R_PLUS_INFO', label: '+2 有价值的信息或建议' },
				{ code: 'R_PLUS_HELP', label: '+2 主动帮忙或介绍资源' },
				{ code: 'R_PLUS_COWORK', label: '+3 一起合作做事' },
				{ code: 'R_PLUS_KEY_SUPPORT', label: '+3 关键时刻支持' },
				{ code: 'R_PLUS_RETURN', label: '+2 主动回报或感谢' },
				{ code: 'R_MINUS_FREELOAD', label: '-1 频繁占便宜' },
				{ code: 'R_MINUS_TAKE_ONLY', label: '-2 只索取不回报' },
				{ code: 'R_MINUS_BACKBITE', label: '-3 背后伤害或诋毁' },
				{ code: 'R_MINUS_BREAK_PROMISE', label: '-2 失信或爽约' },
				{ code: 'R_MINUS_ENERGY', label: '-1 持续消耗精力' },
				{ code: 'R_MINUS_MISMATCH', label: '-1 价值观不合' }
			],
			scoreForm: { reason: '' },
			todoForm: { task: '', dueDate: '' }
		};
	},
	computed: {
		scoreRuleLabels() {
			return this.scoreRules.map(item => item.label);
		},
		actionTitle() {
			return { interaction: '记录一次互动', score: '调整关系分值', todo: '记下一项承诺' }[this.actionMode] || '';
		}
	},
	onLoad(options) {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		if (!this.$mStore.getters.hasLogin) {
			uni.navigateTo({ url: '/pages/public/login' });
			return;
		}
		if (options && options.friendId) this.loadFriend(options.friendId);
		else this.loadFriends(true);
	},
	onReachBottom() {
		if (!this.selectedFriend) this.loadMore();
	},
	async onPullDownRefresh() {
		try {
			if (this.selectedFriend) await this.loadFriend(this.selectedFriend.id);
			else await this.loadFriends(true);
		} finally {
			uni.stopPullDownRefresh();
		}
	},
	beforeDestroy() {
		if (this.searchTimer) clearTimeout(this.searchTimer);
	},
	methods: {
		today() {
			return moment().format('YYYY-MM-DD');
		},
		async loadFriends(reset) {
			if (this.loading || (!reset && !this.hasMore)) return;
			const requestedPage = reset ? 1 : this.page + 1;
			this.loading = true;
			try {
				const res = await this.$http.get(friendList, {
					page: requestedPage,
					pageSize: this.pageSize,
					keyword: this.keyword.trim(),
					sort: 'score'
				});
				if (res.code !== 200) throw new Error(res.message || '加载失败');
				const data = res.data || {};
				const list = Array.isArray(data.list) ? data.list.map(this.decorateFriend) : [];
				this.friends = reset ? list : this.friends.concat(list);
				this.page = requestedPage;
				this.total = Number(data.total || this.friends.length);
				this.hasMore = this.friends.length < this.total;
			} catch (error) {
				console.error('加载人脉资产失败', error);
				uni.showToast({ title: '人脉资产加载失败', icon: 'none' });
			} finally {
				this.loading = false;
			}
		},
		loadMore() {
			this.loadFriends(false);
		},
		onSearchInput() {
			if (this.searchTimer) clearTimeout(this.searchTimer);
			this.searchTimer = setTimeout(() => this.loadFriends(true), 280);
		},
		clearSearch() {
			this.keyword = '';
			this.loadFriends(true);
		},
		async openFriend(friend) {
			await this.loadFriend(friend.id);
		},
		async loadFriend(id) {
			this.loading = true;
			try {
				const res = await this.$http.get(`${friendDetail}/${id}`);
				if (res.code !== 200) throw new Error(res.message || '加载失败');
				this.selectedFriend = this.decorateFriend(res.data);
			} catch (error) {
				console.error('加载人脉详情失败', error);
				uni.showToast({ title: '人脉详情加载失败', icon: 'none' });
			} finally {
				this.loading = false;
			}
		},
		createFriend() {
			uni.navigateTo({ url: '/pages/shroom/friend-edit' });
		},
		editFriend() {
			if (this.selectedFriend) uni.navigateTo({ url: `/pages/shroom/friend-edit?id=${this.selectedFriend.id}` });
		},
		openAction(mode) {
			this.actionMode = mode;
			if (mode === 'interaction') this.interactionForm = { date: this.today(), type: '聊天', topic: '' };
			if (mode === 'score') { this.scoreRuleIndex = 0; this.scoreForm = { reason: '' }; }
			if (mode === 'todo') this.todoForm = { task: '', dueDate: '' };
		},
		closeAction() {
			if (!this.submitting) this.actionMode = '';
		},
		changeScoreRule(event) {
			this.scoreRuleIndex = Number(event.detail.value) || 0;
		},
		async submitAction() {
			if (this.submitting || !this.selectedFriend) return;
			const friendId = this.selectedFriend.id;
			if (this.actionMode === 'interaction' && !this.interactionForm.topic.trim()) return uni.showToast({ title: '请写下互动内容', icon: 'none' });
			if (this.actionMode === 'score' && !this.scoreForm.reason.trim()) return uni.showToast({ title: '请写下变化理由', icon: 'none' });
			if (this.actionMode === 'todo' && !this.todoForm.task.trim()) return uni.showToast({ title: '请写下承诺内容', icon: 'none' });
			this.submitting = true;
			try {
				if (this.actionMode === 'interaction') {
					await this.$http.post(`${friendDetail}/${friendId}/interactions`, { ...this.interactionForm, sentiment: 'neutral' });
				} else if (this.actionMode === 'score') {
					await this.$http.post(`${friendDetail}/${friendId}/score`, { ruleCode: this.scoreRules[this.scoreRuleIndex].code, reason: this.scoreForm.reason, date: this.today() });
				} else {
					await this.$http.post(`${friendDetail}/${friendId}/todos`, this.todoForm);
				}
				this.actionMode = '';
				await this.loadFriend(friendId);
				uni.showToast({ title: '已记下', icon: 'success' });
			} catch (error) {
				console.error('保存关系记录失败', error);
			} finally {
				this.submitting = false;
			}
		},
		completeTodo(item) {
			if (!item || ['done', 'completed', 'cancelled'].includes(item.status)) return;
			uni.showModal({
				title: '这项承诺完成了吗？', content: item.task, confirmText: '已完成',
				success: async result => {
					if (!result.confirm) return;
					try {
						await this.$http.put(`${friendDetail}/${this.selectedFriend.id}/todos/${item.id}`, { status: 'done' });
						await this.loadFriend(this.selectedFriend.id);
					} catch (error) { console.error('更新承诺失败', error); }
				}
			});
		},
		goBack() {
			if (this.selectedFriend) {
				this.selectedFriend = null;
				return;
			}
			const pages = getCurrentPages();
			if (pages.length > 1) uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/me' }) });
			else uni.switchTab({ url: '/pages/shroom/me' });
		},
		scoreClass(value) {
			if (value >= 9) return 'core';
			if (value >= 7) return 'important';
			if (value >= 5) return 'general';
			if (value >= 3) return 'edge';
			return 'draining';
		},
		decorateFriend(friend) {
			const value = friend || {};
			const numericScore = Number(value.relationScore);
			return {
				...value,
				initial: String(value.name || '?').slice(0, 1),
				visibleTags: Array.isArray(value.tags) ? value.tags.slice(0, 3) : [],
				tags: Array.isArray(value.tags) ? value.tags : [],
				scoreTone: this.scoreClass(Number.isFinite(numericScore) ? numericScore : 4)
			};
		},
		formatDate(value) {
			return value ? moment(value).format('YYYY.MM.DD') : '尚未记录';
		},
		formatLastInteraction(value) {
			return value ? `最近互动 ${moment(value).format('MM.DD')}` : '等待第一次记录';
		}
	}
};
</script>

<style lang="scss" scoped>
.friends-page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: #f1f8e9; }
.friends-shell { box-sizing: border-box; padding: 34rpx 34rpx 130rpx; }
.page-header { display: flex; align-items: flex-start; gap: 22rpx; }
.back-button { display: flex; align-items: center; justify-content: center; width: 70rpx; height: 70rpx; flex: 0 0 70rpx; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.72); }
.back-button text { margin-top: -5rpx; font-size: 51rpx; font-weight: 300; line-height: 1; }
.header-copy { display: block; min-width: 0; flex: 1; }
.header-kicker, .header-title, .header-subtitle { display: block; }
.header-kicker, .overview-label, .section-kicker { font-size: 18rpx; font-weight: 720; letter-spacing: 2.6rpx; color: #718075; }
.header-title { margin-top: 13rpx; font-size: 48rpx; font-weight: 740; line-height: 1.15; }
.header-subtitle { margin-top: 14rpx; font-size: 22rpx; line-height: 1.65; color: #728075; }
.private-badge { display: flex; align-items: center; gap: 8rpx; padding: 11rpx 15rpx; flex: 0 0 auto; border-radius: 999rpx; background: #e3eadc; font-size: 18rpx; color: #536357; }
.private-dot { width: 8rpx; height: 8rpx; border-radius: 50%; background: #59725e; }
.overview-panel { display: flex; box-sizing: border-box; justify-content: space-between; gap: 30rpx; margin-top: 47rpx; padding: 36rpx; border-radius: 34rpx; background: #172019; color: #fff; }
.overview-label { display: block; color: #a8b8a9; }
.overview-number { display: inline-block; margin-top: 17rpx; font-size: 70rpx; font-weight: 740; line-height: 1; }
.overview-copy { margin-left: 14rpx; font-size: 21rpx; color: #becabd; }
.score-legend { display: flex; align-self: center; flex-direction: column; gap: 10rpx; font-size: 19rpx; color: #aebcac; text-align: right; }
.search-shell { display: flex; align-items: center; box-sizing: border-box; height: 92rpx; margin-top: 24rpx; padding: 0 27rpx; border: 1rpx solid rgba(23,32,25,.07); border-radius: 28rpx; background: #fff; }
.search-glyph { position: relative; width: 24rpx; height: 24rpx; margin-right: 19rpx; flex: 0 0 24rpx; border: 3rpx solid #29342c; border-radius: 50%; }
.search-glyph::after { content: ''; position: absolute; right: -9rpx; bottom: -6rpx; width: 12rpx; height: 3rpx; background: #29342c; transform: rotate(45deg); }
.search-input { min-width: 0; height: 92rpx; flex: 1; font-size: 25rpx; color: #172019; }
.search-placeholder { color: #9ba39d; }
.search-clear { font-size: 32rpx; color: #78847a; }
.create-row { display: flex; align-items: center; gap: 14rpx; margin-top: 17rpx; padding: 21rpx 25rpx; border-radius: 24rpx; background: #dfead7; font-size: 22rpx; font-weight: 680; color: #405646; }
.create-plus { font-size: 29rpx; font-weight: 400; }
.create-arrow { margin-left: auto; font-size: 31rpx; }
.loading-state { display: flex; align-items: center; justify-content: center; gap: 15rpx; min-height: 300rpx; font-size: 22rpx; color: #748078; }
.loading-dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: #5d7562; box-shadow: 22rpx 0 0 rgba(93,117,98,.45), 44rpx 0 0 rgba(93,117,98,.2); }
.friend-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 18rpx; margin-top: 30rpx; }
.friend-card { box-sizing: border-box; padding: 29rpx; border: 1rpx solid rgba(23,32,25,.06); border-radius: 29rpx; background: #fff; box-shadow: 0 16rpx 42rpx rgba(59,77,62,.05); }
.friend-topline { display: flex; align-items: center; gap: 17rpx; }
.friend-avatar { display: flex; align-items: center; justify-content: center; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; border-radius: 23rpx; background: #e5efd9; font-size: 27rpx; font-weight: 720; color: #526b55; }
.friend-heading { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }
.friend-name { font-size: 28rpx; font-weight: 700; }
.friend-category { font-size: 19rpx; color: #7b877e; }
.score-badge { display: flex; align-items: baseline; gap: 7rpx; padding: 10rpx 14rpx; border-radius: 18rpx; background: #edf1e8; }
.score-badge.core, .summary-score.core { background: #6d3e31; color: #fff; }
.score-badge.important, .summary-score.important { background: #6a7444; color: #fff; }
.score-badge.general, .summary-score.general { background: #dfe9d7; color: #405548; }
.score-badge.edge, .summary-score.edge { background: #ecebdd; color: #6b6955; }
.score-badge.draining, .summary-score.draining { background: #eee1dd; color: #874f45; }
.score-value { font-size: 28rpx; font-weight: 760; }
.score-label { font-size: 17rpx; }
.friend-relation { display: block; min-height: 64rpx; margin-top: 24rpx; font-size: 23rpx; line-height: 1.55; color: #3d4940; }
.friend-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 16rpx; margin-top: 22rpx; padding-top: 18rpx; border-top: 1rpx solid #eef1ed; }
.friend-tags, .summary-tags { display: flex; flex-wrap: wrap; gap: 8rpx; }
.friend-tags text, .summary-tags text { padding: 6rpx 10rpx; border-radius: 999rpx; background: #edf2e8; font-size: 17rpx; color: #607063; }
.last-contact { flex: 0 0 auto; font-size: 18rpx; color: #879188; }
.empty-state { display: flex; min-height: 420rpx; margin-top: 30rpx; padding: 44rpx 34rpx; box-sizing: border-box; flex-direction: column; justify-content: flex-end; border: 1rpx dashed rgba(23,32,25,.17); border-radius: 34rpx; background: rgba(255,255,255,.36); }
.empty-index { font-size: 72rpx; font-weight: 750; color: #d5ddd1; }
.empty-title { margin-top: 25rpx; font-size: 29rpx; font-weight: 700; }
.empty-copy { margin-top: 12rpx; font-size: 21rpx; line-height: 1.65; color: #78847a; }
.load-more { margin-top: 22rpx; padding: 24rpx; border-radius: 999rpx; background: rgba(255,255,255,.66); text-align: center; font-size: 22rpx; color: #4f6253; }
.detail-layout { display: grid; grid-template-columns: minmax(0,1fr); gap: 24rpx; margin-top: 44rpx; }
.detail-summary, .detail-section { box-sizing: border-box; border-radius: 30rpx; }
.detail-summary { display: flex; align-items: center; gap: 25rpx; padding: 32rpx; background: #172019; color: #fff; }
.action-strip { display: grid; grid-column: 1 / -1; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12rpx; }
.action-strip > view { display: flex; min-width: 0; padding: 24rpx 10rpx; flex-direction: column; align-items: center; gap: 9rpx; border-radius: 24rpx; background: #dfead7; font-size: 20rpx; font-weight: 680; color: #455b49; }
.action-symbol { font-size: 29rpx; }
.summary-score { display: flex; width: 108rpx; height: 108rpx; flex: 0 0 108rpx; align-items: center; justify-content: center; flex-direction: column; border-radius: 32rpx; }
.summary-score-value { font-size: 45rpx; font-weight: 760; line-height: 1; }
.summary-score-label { margin-top: 8rpx; font-size: 18rpx; }
.summary-copy { display: flex; min-width: 0; flex-direction: column; gap: 10rpx; }
.summary-category { font-size: 27rpx; font-weight: 700; }
.summary-contact { font-size: 20rpx; color: #b8c4b8; }
.summary-tags { margin-top: 6rpx; }
.summary-tags text { background: rgba(255,255,255,.1); color: #d8e0d7; }
.detail-section { padding: 32rpx; background: #fff; }
.section-heading { display: flex; flex-direction: column; gap: 10rpx; margin-bottom: 27rpx; }
.section-title { font-size: 29rpx; font-weight: 720; }
.timeline-item { display: grid; grid-template-columns: 18rpx minmax(0,1fr); gap: 18rpx; padding-bottom: 29rpx; }
.timeline-item:last-child { padding-bottom: 0; }
.timeline-dot { width: 12rpx; height: 12rpx; margin-top: 8rpx; border: 3rpx solid #dce8d7; border-radius: 50%; background: #59725e; }
.timeline-copy { display: flex; flex-direction: column; }
.timeline-meta { display: flex; justify-content: space-between; gap: 20rpx; font-size: 18rpx; color: #7d8980; }
.timeline-topic { margin-top: 11rpx; font-size: 24rpx; line-height: 1.55; }
.timeline-notes { margin-top: 9rpx; font-size: 20rpx; line-height: 1.65; color: #748078; }
.history-list, .commitment-list { display: flex; flex-direction: column; gap: 13rpx; }
.history-item, .commitment-item { display: flex; align-items: flex-start; gap: 17rpx; padding: 19rpx; border-radius: 20rpx; background: #f3f7ef; }
.history-change { display: flex; align-items: center; justify-content: center; min-width: 55rpx; height: 44rpx; border-radius: 15rpx; background: #dcebd6; font-size: 22rpx; font-weight: 740; color: #477050; }
.history-change.minus { background: #f1e2de; color: #99584d; }
.history-copy { display: flex; flex-direction: column; gap: 8rpx; font-size: 22rpx; line-height: 1.5; }
.history-copy text:last-child { font-size: 18rpx; color: #849087; }
.commitment-state { width: 20rpx; height: 20rpx; margin-top: 6rpx; flex: 0 0 20rpx; border: 3rpx solid #708071; border-radius: 50%; }
.commitment-state.done { background: #708071; }
.commitment-state.completed { background: #708071; }
.commitment-state.overdue { border-color: #a65c50; background: #a65c50; }
.commitment-task, .commitment-date { display: block; }
.commitment-task { font-size: 23rpx; line-height: 1.5; }
.commitment-date { margin-top: 7rpx; font-size: 18rpx; color: #7e8b81; }
.section-empty { display: block; padding: 25rpx 0; font-size: 21rpx; color: #839087; }
.sheet-mask { position: fixed; z-index: 90; inset: 0; background: rgba(10,16,12,.4); }
.action-sheet { position: fixed; z-index: 91; right: 0; bottom: 0; left: 0; box-sizing: border-box; max-height: 82vh; padding: 17rpx 32rpx calc(37rpx + env(safe-area-inset-bottom)); border-radius: 38rpx 38rpx 0 0; background: #f8fbf5; }
.sheet-handle { width: 70rpx; height: 7rpx; margin: 0 auto 21rpx; border-radius: 99rpx; background: #cad3c8; }
.sheet-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; font-size: 31rpx; font-weight: 730; }
.sheet-close { padding: 7rpx 12rpx; font-size: 38rpx; font-weight: 300; color: #718075; }
.sheet-field { padding: 21rpx 3rpx; border-bottom: 1rpx solid #e3e9df; }
.sheet-field > text:first-child { display: block; margin-bottom: 10rpx; font-size: 18rpx; font-weight: 680; color: #6e7d71; }
.sheet-field input { height: 50rpx; font-size: 24rpx; color: #172019; }
.sheet-field textarea { width: 100%; height: 125rpx; font-size: 23rpx; line-height: 1.6; color: #172019; }
.picker-field { display: flex; align-items: center; justify-content: space-between; }
.picker-field > text:first-child { margin-bottom: 0; }
.picker-field > text:last-child { font-size: 22rpx; color: #334438; }
.sheet-submit { margin-top: 28rpx; padding: 24rpx; border-radius: 999rpx; background: #172019; text-align: center; font-size: 23rpx; font-weight: 680; color: #fff; }
.sheet-submit.disabled { opacity: .55; }
/* #ifdef H5 */
@media (min-width: 1024px) {
	.friends-page { box-sizing: border-box; padding-left: 96px; }
	.status-bar { display: none; }
	.friends-shell { max-width: 1120px; margin: 0 auto; padding: 68px 56px 96px; }
	.friend-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
	.detail-layout { grid-template-columns: minmax(0,1.15fr) minmax(320px,.85fr); align-items: start; }
	.detail-summary { grid-column: 1 / -1; }
	.commitments-section { grid-column: 2; }
	.score-history-section { grid-column: 2; grid-row: 2; }
}
/* #endif */
</style>
