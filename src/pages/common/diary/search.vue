<template>
	<view class="archive-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

		<view class="archive-shell">
			<view class="archive-header">
				<view class="back-button" @tap="goBack">
					<text class="back-icon">‹</text>
				</view>
				<view class="header-copy">
					<text class="header-kicker">PRIVATE ARCHIVE</text>
					<text class="header-title">日记归档</text>
					<text class="header-subtitle">从写过的字里，重新遇见当时的自己。</text>
				</view>
				<view class="privacy-badge">
					<view class="privacy-dot"></view>
					<text>仅自己</text>
				</view>
			</view>

			<view class="search-panel">
				<text class="search-label">SEARCH YOUR DAYS</text>
				<view class="search-input-shell" :class="{ disabled: !hasLogin }">
					<view class="search-glyph"></view>
					<input
						class="search-input"
						v-model="searchKeyword"
						:disabled="!hasLogin"
						placeholder="输入一件事、一个人或一种感受"
						placeholder-class="search-placeholder"
						confirm-type="search"
						@input="onSearchInput"
						@confirm="doSearch"
					/>
					<view class="clear-button" v-if="searchKeyword" @tap="clearKeyword">
						<text>×</text>
					</view>
				</view>
				<text class="search-helper">搜索正文与语音转写，结果只在你的私密空间中呈现。</text>
			</view>

			<view class="login-gate" v-if="!hasLogin">
				<view class="gate-symbol">
					<view class="gate-cap"></view>
					<view class="gate-stem"></view>
				</view>
				<view class="gate-copy">
					<text class="gate-kicker">YOUR WORDS STAY YOURS</text>
					<text class="gate-title">登录后，找回你写过的每一天</text>
					<text class="gate-description">归档内容默认私密，并会在你的设备之间同步。</text>
				</view>
				<view class="gate-action" @tap="goLogin">登录 / 注册</view>
			</view>

			<view class="results-section" v-else-if="searchKeyword.trim()">
				<view class="section-heading">
					<view>
						<text class="section-eyebrow">SEARCH RESULTS</text>
						<text class="section-title">关于“{{ searchKeyword.trim() }}”</text>
					</view>
					<text class="result-count" v-if="hasSearched && !isSearching">{{ searchResults.length }} 篇</text>
				</view>

				<view class="loading-state" v-if="isSearching">
					<view class="loading-dot"></view>
					<text>正在翻阅你的记录…</text>
				</view>

				<view class="result-grid" v-else-if="searchResults.length">
					<view
						class="result-card"
						v-for="diary in searchResults"
						:key="diary.id"
						@tap="viewDiary(diary)"
					>
						<view class="result-meta">
							<text class="result-date">{{ formatDate(getDiaryDate(diary)) }}</text>
							<text class="result-weekday">{{ formatWeekday(getDiaryDate(diary)) }}</text>
						</view>
						<text class="result-content">{{ getDiaryPreview(diary) }}</text>
						<view class="result-footer">
							<text class="result-origin">正文匹配</text>
							<text class="result-arrow">↗</text>
						</view>
					</view>
				</view>

				<view class="empty-result" v-else-if="hasSearched">
					<text class="empty-index">00</text>
					<text class="empty-title">这次没有找到</text>
					<text class="empty-copy">换一个更短的词，也许会遇见另一段记忆。</text>
				</view>
			</view>

			<view class="browse-section" v-else-if="hasLogin">
				<view class="history-block" v-if="searchHistory.length">
					<view class="section-heading compact">
						<view>
							<text class="section-eyebrow">RECENT SEARCHES</text>
							<text class="section-title">最近找过</text>
						</view>
						<text class="clear-history" @tap="clearHistory">清除</text>
					</view>
					<view class="keyword-list">
						<view class="keyword-chip history" v-for="keyword in searchHistory" :key="keyword" @tap="selectKeyword(keyword)">
							<text>{{ keyword }}</text>
						</view>
					</view>
				</view>

				<view class="theme-block">
					<view class="section-heading compact">
						<view>
							<text class="section-eyebrow">WAYS BACK IN</text>
							<text class="section-title">从一个主题开始回看</text>
						</view>
					</view>
					<view class="keyword-list">
						<view class="keyword-chip" :class="{ loading: openingThemeKey === theme.key }" v-for="theme in themes" :key="theme.key" @tap="openTheme(theme)">
							<text>{{ theme.title }}</text>
							<text class="chip-arrow">{{ openingThemeKey === theme.key ? '…' : '↗' }}</text>
						</view>
					</view>
				</view>

				<view class="archive-note">
					<text class="note-number">01</text>
					<view class="note-copy">
						<text class="note-title">主题不需要提前标注。</text>
						<text class="note-description">第一次回看会理解正文；以后只增量核对新写或修改过的日记。</text>
					</view>
				</view>

				<view class="archive-list-block">
					<view class="section-heading compact">
						<view>
							<text class="section-eyebrow">ALL ENTRIES</text>
							<text class="section-title">全部日记</text>
						</view>
						<text class="result-count">{{ archiveTotal }} 篇</text>
					</view>

					<view class="loading-state" v-if="isLoadingArchive && recentDiaries.length === 0">
						<view class="loading-dot"></view>
						<text>正在整理你的时间线…</text>
					</view>

					<view class="result-grid" v-else-if="recentDiaries.length">
						<view
							class="result-card"
							v-for="diary in recentDiaries"
							:key="diary.id"
							@tap="viewDiary(diary)"
						>
							<view class="result-meta">
								<text class="result-date">{{ formatDate(getDiaryDate(diary)) }}</text>
								<text class="result-weekday">{{ formatWeekday(getDiaryDate(diary)) }}</text>
							</view>
							<text class="result-content">{{ getDiaryPreview(diary) }}</text>
							<view class="result-footer">
								<text class="result-origin">{{ diary.voice && diary.voice.transcript && !diary.content ? '语音日记' : '日记' }}</text>
								<text class="result-arrow">↗</text>
							</view>
						</view>
					</view>

					<view class="empty-result" v-else-if="!isLoadingArchive">
						<text class="empty-index">00</text>
						<text class="empty-title">还没有留下文字</text>
						<text class="empty-copy">从今天的一句话开始，时间线会在这里慢慢生长。</text>
					</view>

					<view class="archive-progress" v-if="recentDiaries.length">
						<text v-if="archiveHasMore">已显示 {{ recentDiaries.length }} 篇，继续下滑加载</text>
						<text v-else>已经看到全部 {{ archiveTotal }} 篇</text>
					</view>
					<view class="archive-more" v-if="archiveHasMore" @tap="loadMoreArchive">
						<text>{{ isLoadingArchive ? '正在加载…' : '继续翻阅' }}</text>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { diaryList, diarySearch } from '@/api/diary';
import { memoryThemeOpen } from '@/api/memory';

export default {
	data() {
		return {
			statusBarHeight: 0,
			searchKeyword: '',
			searchResults: [],
			recentDiaries: [],
			archiveTotal: 0,
			archivePage: 1,
			archivePageSize: 12,
			archiveHasMore: false,
			isLoadingArchive: false,
			hasSearched: false,
			isSearching: false,
			searchHistory: [],
			themes: [
				{ key: 'growth', title: '成长' },
				{ key: 'emotion', title: '情绪' },
				{ key: 'relationship', title: '关系' },
				{ key: 'work', title: '工作' },
				{ key: 'travel', title: '旅行' },
				{ key: 'inspiration', title: '灵感' }
			],
			openingThemeKey: '',
			searchTimer: null,
			searchSequence: 0
		};
	},
	computed: {
		hasLogin() {
			return this.$mStore.getters.hasLogin;
		}
	},
	onLoad() {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
		this.loadSearchHistory();
	},
	onShow() {
		this.loadArchive(true);
	},
	onReachBottom() {
		if (!this.searchKeyword.trim()) this.loadMoreArchive();
	},
	async onPullDownRefresh() {
		try {
			await this.loadArchive(true);
		} finally {
			uni.stopPullDownRefresh();
		}
	},
	beforeDestroy() {
		if (this.searchTimer) clearTimeout(this.searchTimer);
	},
	methods: {
		async loadArchive(reset) {
			if (!this.hasLogin) {
				this.recentDiaries = [];
				this.archiveTotal = 0;
				this.archiveHasMore = false;
				return;
			}
			if (this.isLoadingArchive || (!reset && !this.archiveHasMore)) return;
			const requestedPage = reset ? 1 : this.archivePage + 1;
			this.isLoadingArchive = true;
			try {
				const res = await this.$http.get(diaryList, {
					page: requestedPage,
					pageSize: this.archivePageSize
				});
				if (res.code === 200) {
					const data = res.data || {};
					const list = Array.isArray(data.list) ? data.list : [];
					this.recentDiaries = reset ? list : this.recentDiaries.concat(list);
					this.archiveTotal = Number(data.total || this.recentDiaries.length);
					this.archivePage = requestedPage;
					this.archiveHasMore = this.recentDiaries.length < this.archiveTotal;
				}
			} catch (error) {
				console.error('加载日记归档失败', error);
				uni.showToast({ title: '日记归档加载失败', icon: 'none' });
			} finally {
				this.isLoadingArchive = false;
			}
		},
		loadMoreArchive() {
			this.loadArchive(false);
		},
		onSearchInput(e) {
			this.searchKeyword = e.detail.value;
			if (this.searchTimer) clearTimeout(this.searchTimer);

			if (!this.searchKeyword.trim()) {
				this.searchResults = [];
				this.hasSearched = false;
				this.isSearching = false;
				return;
			}

			this.searchTimer = setTimeout(() => this.doSearch(), 320);
		},
		async doSearch() {
			const keyword = this.searchKeyword.trim();
			if (!keyword || !this.hasLogin) return;
			if (this.searchTimer) clearTimeout(this.searchTimer);

			const requestSequence = ++this.searchSequence;
			this.isSearching = true;
			this.hasSearched = false;
			this.saveSearchHistory(keyword);

			try {
				const res = await this.$http.get(diarySearch, {
					keyword,
					page: 1,
					pageSize: 50
				});

				if (requestSequence !== this.searchSequence) return;
				if (res.code === 200) {
					const data = res.data || {};
					this.searchResults = Array.isArray(data) ? data : (data.list || []);
				} else {
					this.searchResults = [];
					uni.showToast({ title: res.message || '暂时无法搜索', icon: 'none' });
				}
			} catch (error) {
				if (requestSequence !== this.searchSequence) return;
				console.error('搜索日记失败', error);
				this.searchResults = [];
				uni.showToast({ title: '暂时无法搜索，请稍后再试', icon: 'none' });
			} finally {
				if (requestSequence === this.searchSequence) {
					this.isSearching = false;
					this.hasSearched = true;
				}
			}
		},
		clearKeyword() {
			if (this.searchTimer) clearTimeout(this.searchTimer);
			this.searchSequence += 1;
			this.searchKeyword = '';
			this.searchResults = [];
			this.hasSearched = false;
			this.isSearching = false;
		},
		selectKeyword(keyword) {
			this.searchKeyword = keyword;
			this.doSearch();
		},
		async openTheme(theme) {
			if (!theme || !theme.key || this.openingThemeKey) return;
			this.openingThemeKey = theme.key;
			try {
				const res = await this.$http.post(memoryThemeOpen(theme.key), {});
				if (res.code !== 200 || !res.data || !res.data.id) throw new Error(res.message || '主题回看暂时不可用');
				uni.navigateTo({ url: `/pages/shroom/memory?id=${res.data.id}` });
			} catch (error) {
				console.error('打开主题回看失败', error);
				uni.showToast({ title: typeof error === 'string' ? error : '主题回看暂时不可用', icon: 'none' });
			} finally {
				this.openingThemeKey = '';
			}
		},
		viewDiary(diary) {
			if (!diary.id) return;
			uni.navigateTo({ url: `/pages/diary/edit?id=${diary.id}` });
		},
		getDiaryDate(diary) {
			return diary.createdAt || diary.created_at || diary.date || '';
		},
		formatDate(date) {
			return date ? moment(date).format('YYYY.MM.DD') : '未标注日期';
		},
		formatWeekday(date) {
			const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
			return date ? weekdays[moment(date).day()] : '';
		},
		getDiaryPreview(diary) {
			const content = diary.content || (diary.voice && diary.voice.transcript) || diary.title || (diary.voice ? '一段语音日记' : '一段未命名的记录');
			return String(content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
		},
		loadSearchHistory() {
			const history = uni.getStorageSync('diary_search_history') || [];
			this.searchHistory = Array.isArray(history) ? history.slice(0, 8) : [];
		},
		saveSearchHistory(keyword) {
			let history = uni.getStorageSync('diary_search_history') || [];
			if (!Array.isArray(history)) history = [];
			history = history.filter(item => item !== keyword);
			history.unshift(keyword);
			uni.setStorageSync('diary_search_history', history.slice(0, 20));
			this.loadSearchHistory();
		},
		clearHistory() {
			uni.removeStorageSync('diary_search_history');
			this.searchHistory = [];
		},
		goLogin() {
			uni.navigateTo({ url: '/pages/public/login' });
		},
		goBack() {
			uni.navigateBack({
				fail: () => uni.switchTab({ url: '/pages/shroom/me' })
			});
		}
	}
};
</script>

<style lang="scss" scoped>
.archive-page {
	display: block;
	min-height: 100vh;
	background: #f2f6ec;
	color: #172019;
}

.status-bar,
.archive-shell,
.header-copy,
.search-panel,
.results-section,
.browse-section,
.archive-list-block,
.history-block,
.theme-block,
.result-card,
.gate-copy,
.note-copy {
	display: block;
}

.status-bar {
	background: #f2f6ec;
}

.archive-shell {
	box-sizing: border-box;
	padding: 34rpx 34rpx 120rpx;
}

.archive-header {
	display: flex;
	align-items: flex-start;
	gap: 23rpx;
}

.back-button {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 70rpx;
	height: 70rpx;
	flex: 0 0 70rpx;
	border: 1rpx solid rgba(23, 32, 25, .1);
	border-radius: 50%;
	background: rgba(255, 255, 255, .75);
}

.back-icon {
	margin-top: -5rpx;
	font-size: 51rpx;
	font-weight: 300;
	line-height: 1;
}

.header-copy {
	min-width: 0;
	flex: 1;
}

.header-kicker,
.search-label,
.section-eyebrow,
.gate-kicker {
	display: block;
	font-size: 18rpx;
	font-weight: 700;
	letter-spacing: 2.6rpx;
}

.header-kicker {
	margin-top: 5rpx;
	color: #718075;
}

.header-title {
	display: block;
	margin-top: 13rpx;
	font-size: 48rpx;
	font-weight: 740;
	line-height: 1.15;
}

.header-subtitle {
	display: block;
	margin-top: 15rpx;
	font-size: 22rpx;
	line-height: 1.65;
	color: #728075;
}

.privacy-badge {
	display: flex;
	align-items: center;
	gap: 8rpx;
	margin-top: 4rpx;
	padding: 11rpx 15rpx;
	flex: 0 0 auto;
	border-radius: 999rpx;
	background: #e3eadc;
	font-size: 18rpx;
	font-weight: 650;
	color: #536357;
}

.privacy-dot {
	width: 8rpx;
	height: 8rpx;
	border-radius: 50%;
	background: #59725e;
}

.search-panel {
	box-sizing: border-box;
	margin-top: 47rpx;
	padding: 34rpx;
	border-radius: 38rpx;
	background: #172019;
	box-shadow: 0 28rpx 70rpx rgba(30, 47, 34, .12);
}

.search-label {
	color: #a8b8a9;
}

.search-input-shell {
	display: flex;
	align-items: center;
	box-sizing: border-box;
	height: 92rpx;
	margin-top: 21rpx;
	padding: 0 24rpx;
	border-radius: 28rpx;
	background: #fff;
}

.search-input-shell.disabled {
	opacity: .72;
}

.search-glyph {
	position: relative;
	width: 25rpx;
	height: 25rpx;
	margin-right: 19rpx;
	flex: 0 0 25rpx;
	border: 3rpx solid #29342c;
	border-radius: 50%;
}

.search-glyph::after {
	content: '';
	position: absolute;
	right: -10rpx;
	bottom: -7rpx;
	width: 13rpx;
	height: 3rpx;
	border-radius: 3rpx;
	background: #29342c;
	transform: rotate(45deg);
}

.search-input {
	min-width: 0;
	height: 92rpx;
	flex: 1;
	font-size: 25rpx;
	color: #172019;
}

.search-placeholder {
	color: #9ba39d;
}

.clear-button {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 43rpx;
	height: 43rpx;
	margin-left: 12rpx;
	border-radius: 50%;
	background: #edf0ec;
	font-size: 30rpx;
	color: #667168;
}

.search-helper {
	display: block;
	margin-top: 18rpx;
	font-size: 19rpx;
	line-height: 1.6;
	color: #9dab9f;
}

.login-gate {
	display: grid;
	box-sizing: border-box;
	grid-template-columns: 92rpx minmax(0, 1fr);
	gap: 24rpx;
	margin-top: 28rpx;
	padding: 39rpx 34rpx;
	border: 1rpx solid rgba(93, 83, 45, .07);
	border-radius: 36rpx;
	background: #f5ecc8;
}

.gate-symbol {
	position: relative;
	width: 84rpx;
	height: 78rpx;
}

.gate-cap {
	position: absolute;
	top: 7rpx;
	left: 2rpx;
	width: 80rpx;
	height: 42rpx;
	border-radius: 52rpx 52rpx 19rpx 19rpx;
	background: #7f7446;
}

.gate-stem {
	position: absolute;
	top: 42rpx;
	left: 34rpx;
	width: 21rpx;
	height: 34rpx;
	border-radius: 0 0 14rpx 14rpx;
	background: #7f7446;
}

.gate-kicker {
	color: #85794d;
}

.gate-title {
	display: block;
	margin-top: 13rpx;
	font-size: 29rpx;
	font-weight: 700;
	line-height: 1.45;
}

.gate-description {
	display: block;
	margin-top: 12rpx;
	font-size: 21rpx;
	line-height: 1.65;
	color: #736c50;
}

.gate-action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	grid-column: 2;
	justify-self: start;
	margin-top: 3rpx;
	padding: 17rpx 27rpx;
	border-radius: 999rpx;
	background: #172019;
	font-size: 22rpx;
	font-weight: 700;
	color: #fff;
}

.results-section,
.browse-section {
	margin-top: 52rpx;
}

.section-heading {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 20rpx;
	margin: 0 6rpx 25rpx;
}

.section-heading.compact {
	margin-bottom: 22rpx;
}

.section-eyebrow {
	color: #78877b;
}

.section-title {
	display: block;
	margin-top: 11rpx;
	font-size: 31rpx;
	font-weight: 700;
	line-height: 1.35;
}

.result-count,
.clear-history {
	flex: 0 0 auto;
	font-size: 21rpx;
	color: #758078;
}

.loading-state {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 15rpx;
	min-height: 220rpx;
	font-size: 22rpx;
	color: #748078;
}

.loading-dot {
	width: 14rpx;
	height: 14rpx;
	border-radius: 50%;
	background: #5d7562;
	box-shadow: 22rpx 0 0 rgba(93, 117, 98, .45), 44rpx 0 0 rgba(93, 117, 98, .2);
}

.result-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 18rpx;
}

.result-card {
	box-sizing: border-box;
	padding: 31rpx;
	border: 1rpx solid rgba(23, 32, 25, .065);
	border-radius: 31rpx;
	background: #fff;
	box-shadow: 0 16rpx 42rpx rgba(59, 77, 62, .055);
}

.result-meta,
.result-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 15rpx;
}

.result-date {
	font-size: 21rpx;
	font-weight: 720;
	letter-spacing: 1rpx;
}

.result-weekday {
	font-size: 19rpx;
	color: #879188;
}

.result-content {
	display: -webkit-box;
	margin-top: 25rpx;
	overflow: hidden;
	font-size: 27rpx;
	line-height: 1.75;
	color: #29342c;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 4;
}

.result-footer {
	align-items: flex-end;
	margin-top: 27rpx;
	padding-top: 19rpx;
	border-top: 1rpx solid #eef1ed;
}

.result-origin { color: #879188; font-size: 18rpx; }

.result-arrow {
	margin-left: auto;
	font-size: 27rpx;
	color: #617063;
}

.empty-result {
	display: flex;
	box-sizing: border-box;
	min-height: 320rpx;
	padding: 48rpx 36rpx;
	flex-direction: column;
	justify-content: flex-end;
	border: 1rpx dashed rgba(23, 32, 25, .18);
	border-radius: 36rpx;
	background: rgba(255, 255, 255, .38);
}

.empty-index {
	font-size: 72rpx;
	font-weight: 750;
	line-height: 1;
	color: #d5ddd1;
}

.empty-title {
	margin-top: 26rpx;
	font-size: 29rpx;
	font-weight: 700;
}

.empty-copy {
	margin-top: 12rpx;
	font-size: 21rpx;
	line-height: 1.65;
	color: #78847a;
}

.history-block + .theme-block,
.theme-block + .archive-note,
.archive-note + .archive-list-block {
	margin-top: 47rpx;
}

.archive-progress {
	display: block;
	margin-top: 24rpx;
	text-align: center;
	font-size: 19rpx;
	color: #7b887d;
}

.archive-more {
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	min-height: 86rpx;
	margin-top: 22rpx;
	border: 1rpx solid rgba(23, 32, 25, .09);
	border-radius: 999rpx;
	background: rgba(255, 255, 255, .66);
	font-size: 22rpx;
	font-weight: 680;
	color: #4f6253;
}

.keyword-list {
	display: flex;
	flex-wrap: wrap;
	gap: 13rpx;
}

.keyword-chip {
	display: flex;
	align-items: center;
	gap: 18rpx;
	padding: 17rpx 21rpx;
	border: 1rpx solid rgba(23, 32, 25, .07);
	border-radius: 999rpx;
	background: #fff;
	font-size: 22rpx;
	font-weight: 620;
	box-shadow: 0 8rpx 22rpx rgba(55, 74, 59, .04);
}

.keyword-chip.history {
	background: #e5ecdf;
}

.keyword-chip.loading { opacity: .58; }

.chip-arrow {
	font-size: 20rpx;
	color: #839087;
}

.archive-note {
	display: flex;
	align-items: flex-start;
	gap: 26rpx;
	box-sizing: border-box;
	margin-top: 0;
	padding: 32rpx 29rpx;
	border-radius: 31rpx;
	background: #e2eee9;
}

.note-number {
	font-size: 22rpx;
	font-weight: 750;
	letter-spacing: 1rpx;
	color: #6a827c;
}

.note-title {
	display: block;
	font-size: 25rpx;
	font-weight: 700;
	line-height: 1.45;
}

.note-description {
	display: block;
	margin-top: 10rpx;
	font-size: 20rpx;
	line-height: 1.65;
	color: #647872;
}

/* #ifdef H5 */
@media (min-width: 1024px) {
	.archive-page {
		padding-left: 96px;
	}

	.archive-shell {
		max-width: 1080px;
		margin: 0 auto;
		padding: 68px 56px 96px;
	}

	.archive-header {
		gap: 22px;
	}

	.back-button {
		width: 46px;
		height: 46px;
		flex-basis: 46px;
	}

	.back-icon {
		font-size: 34px;
	}

	.header-title {
		font-size: 43px;
	}

	.header-subtitle {
		font-size: 15px;
	}

	.search-panel {
		margin-top: 42px;
		padding: 31px;
		border-radius: 30px;
	}

	.search-input-shell {
		height: 62px;
		border-radius: 20px;
	}

	.search-input {
		height: 62px;
		font-size: 16px;
	}

	.login-gate {
		grid-template-columns: 72px minmax(0, 1fr) auto;
		align-items: center;
		gap: 28px;
		margin-top: 22px;
		padding: 34px;
		border-radius: 28px;
	}

	.gate-action {
		grid-column: 3;
		grid-row: 1;
		margin: 0;
		justify-self: end;
	}

	.results-section,
	.browse-section {
		margin-top: 46px;
	}

	.result-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}

	.result-card {
		padding: 26px;
		border-radius: 25px;
	}

	.keyword-list {
		gap: 10px;
	}

	.archive-note {
		max-width: 720px;
		margin-top: 42px;
		padding: 27px;
	}
}
/* #endif */
</style>
