<template>
	<view class="discover-page">
		<shroom-page-top-spacer />

		<view class="discover-shell">
			<view class="discover-header">
				<view>
					<text class="eyebrow">SHROOM COMMUNITY</text>
					<text class="page-title">发现</text>
					<text class="page-subtitle">看见别人如何理解自己，也让你的经验成为回声。</text>
				</view>
			</view>

			<view class="memory-entry">
				<view class="memory-entry-copy" @tap="openMemory()">
					<text class="memory-kicker">PRIVATE MEMORY</text>
					<text class="memory-title">问问过去的自己</text>
					<text class="memory-description">从日记与已授权的数据源中找证据、看变化。每个结论都保留可核对的来源。</text>
				</view>
				<view class="memory-search-row">
					<input
						class="memory-input"
						v-model="memoryQuestion"
						placeholder="例如：这些年，我对工作的看法有什么变化？"
						confirm-type="search"
						@confirm="askMemory"
					/>
					<button class="memory-submit" @tap="askMemory" aria-label="开始回看">↗</button>
				</view>
				<view class="memory-prompts">
					<button v-for="prompt in memoryPrompts" :key="prompt" @tap="useMemoryPrompt(prompt)">{{ prompt }}</button>
				</view>
			</view>

			<view class="control-row">
				<scroll-view class="filter-scroll" scroll-x :show-scrollbar="false">
					<view class="filter-list">
						<view
							class="filter-chip"
							:class="{ active: activeTag === item.value }"
							v-for="item in filters"
							:key="item.value"
							@tap="selectTag(item.value)"
						>
							{{ item.label }}
						</view>
					</view>
				</scroll-view>
				<view class="sort-switch" @tap="toggleSort">
					<text class="sort-dot"></text>
					<text>{{ sortLabel }}</text>
				</view>
			</view>

			<view class="card-deck" v-if="cards.length">
				<view class="deck-heading">
					<text>PUBLIC SHROOM CARDS</text>
					<text>左右滑动看下一张 · 点卡片打开</text>
				</view>
				<swiper
					class="cards-swiper"
					:current="currentCardIndex"
					:circular="false"
					previous-margin="12rpx"
					next-margin="44rpx"
					@change="onCardChange"
				>
					<swiper-item class="card-slide" v-for="card in cards" :key="card.id">
						<view class="discovery-card" @tap="openCard(card)">
							<view class="card-topline">
						<view class="author-row">
							<view class="author-avatar">{{ card._authorInitial }}</view>
							<view class="author-copy">
								<text class="author-name">{{ card._authorName }}</text>
										<text class="publish-time">{{ card._formattedTime }}</text>
									</view>
								</view>
								<view class="card-index-copy">
									<text class="card-index">{{ card._displayIndex }}</text>
								</view>
							</view>

					<text class="seed-sentence">{{ card._seed }}</text>
					<text class="understanding" v-if="card._understanding">
						{{ card._understanding }}
					</text>

					<view class="usage-block" v-if="card._usageItems.length">
						<text class="usage-label">尝试这样做</text>
						<view class="usage-item" v-for="(item, usageIndex) in card._usageItems" :key="usageIndex">
							<text class="usage-mark"></text>
							<text>{{ item }}</text>
						</view>
					</view>

					<view class="tag-row" v-if="card._tags.length">
						<text class="tag" v-for="tag in card._tags" :key="tag">#{{ tag }}</text>
					</view>

					<view class="card-actions">
						<view class="action" :class="{ active: card._resonated }" v-if="!card.isOwner" @tap.stop="resonate(card)">
							<text class="heart">{{ card._resonated ? '♥' : '♡' }}</text>
							<text>{{ card._resonanceCount }}</text>
							<text>{{ card._resonated ? '已共鸣' : '共鸣' }}</text>
						</view>
						<view class="action owner-mark" v-else>我的公开菇卡</view>
						<view class="action quote-action" @tap.stop="openCard(card)">
							<text>打开并使用</text>
							<text class="arrow">↗</text>
						</view>
					</view>
						</view>
					</swiper-item>
				</swiper>
			</view>

			<view class="state-panel" v-else-if="loading">
				<view class="loading-ring"></view>
				<text class="state-title">正在找寻新的回声</text>
			</view>

			<view class="state-panel" v-else-if="loadError">
				<text class="state-symbol">!</text>
				<text class="state-title">这次没有连上发现广场</text>
				<text class="state-copy">检查网络后再试一次，你的私密日记不会受影响。</text>
				<view class="state-button" @tap="reload">重新加载</view>
			</view>

			<view class="state-panel" v-else>
				<text class="state-symbol">◌</text>
				<text class="state-title">这里还很安静</text>
				<text class="state-copy">公开的菇卡会在这里出现，等待下一次回声。</text>
			</view>

			<view class="list-footer" v-if="cards.length && loading">正在加载…</view>
			<view class="list-footer" v-if="cards.length && !hasMore">今天的回声就到这里</view>
		</view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { shroomCardDiscover, shroomCardResonate, shroomCardUnresonate } from '@/api/shroomCard';

export default {
	data() {
		return {
			statusBarHeight: 0,
			cards: [],
			loading: false,
			loadError: false,
			page: 1,
			pageSize: 12,
			hasMore: true,
			currentCardIndex: 0,
			activeTag: '',
			sort: 'latest',
			filters: [
				{ label: '全部', value: '' },
				{ label: '情绪', value: '情绪' },
				{ label: '成长', value: '成长' },
				{ label: '关系', value: '关系' },
				{ label: '行动', value: '行动' }
			],
			memoryQuestion: '',
			memoryPrompts: ['最近反复出现什么？', '我处理关系的方式变了吗？', '过去我有哪些做得不好的地方？']
		};
	},
	computed: {
		sortLabel() {
			if (this.sort === 'popular') return '共鸣';
			return '最新';
		}
	},
	onLoad() {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
		this.loadCards(true);
	},
	onPullDownRefresh() {
		this.loadCards(true).finally(() => uni.stopPullDownRefresh());
	},
	onReachBottom() {
		this.loadCards(false);
	},
	methods: {
		normalizeList(data, startIndex = 0) {
			let cards = [];
			if (Array.isArray(data)) cards = data;
			else if (data && Array.isArray(data.list)) cards = data.list;
			else if (data && Array.isArray(data.data)) cards = data.data;
			return cards.map((card, index) => {
				const stats = card.stats || {};
				const authorName = this.resolveAuthorName(card);
				return Object.assign({}, card, {
					_displayIndex: startIndex + index + 1 < 10 ? `0${startIndex + index + 1}` : String(startIndex + index + 1),
					_seed: card.seedSentence || card.seed_sentence || '一条正在生长的觉察',
					_understanding: card.myUnderstanding || card.my_understanding || '',
					_usageItems: this.resolveUsageItems(card).slice(0, 2),
					_tags: Array.isArray(card.tags) ? card.tags.slice(0, 4) : [],
					_resonanceCount: stats.resonanceCount || stats.resonance_count || 0,
					_resonated: Boolean(card.viewerState && card.viewerState.resonated),
					_authorName: authorName,
					_authorInitial: authorName.slice(0, 1),
					_formattedTime: this.resolveTime(card.createdAt || card.created_at)
				});
			});
		},
		async loadCards(reset) {
			if (this.loading || (!reset && !this.hasMore)) return;
			if (reset) {
				this.page = 1;
				this.hasMore = true;
				this.loadError = false;
				this.currentCardIndex = 0;
			}
			this.loading = true;
			try {
				const params = {
					sort: this.sort,
					page: this.page,
					pageSize: this.pageSize
				};
				if (this.activeTag) params.tags = this.activeTag;
				const res = await this.$http.get(shroomCardDiscover, params);
				const nextCards = res && res.code === 200 ? this.normalizeList(res.data, reset ? 0 : this.cards.length) : [];
				this.cards = reset ? nextCards : this.cards.concat(nextCards);
				this.hasMore = nextCards.length >= this.pageSize;
				if (this.hasMore) this.page += 1;
			} catch (error) {
				console.error('加载发现广场失败', error);
				this.loadError = this.cards.length === 0;
			} finally {
				this.loading = false;
			}
		},
		reload() {
			this.loadCards(true);
		},
		selectTag(tag) {
			if (this.activeTag === tag) return;
			this.activeTag = tag;
			this.loadCards(true);
		},
		toggleSort() {
			this.sort = this.sort === 'latest' ? 'popular' : 'latest';
			this.loadCards(true);
		},
		onCardChange(event) {
			this.currentCardIndex = Number(event.detail.current) || 0;
			if (this.currentCardIndex >= this.cards.length - 3) this.loadCards(false);
		},
		openCard(card) {
			if (!card || !card.id) return;
			uni.navigateTo({ url: `/pages/common/cards/detail?id=${card.id}&from=discover` });
		},
		resolveUsageItems(card) {
			const value = card.usageItems || card.usage_items || [];
			return Array.isArray(value) ? value : [];
		},
		resolveAuthorName(card) {
			if (card.visibility === 'PUBLIC_ANON' || card.visibility === 'public_anon') return '匿名记录者';
			const author = card.author || card.member || {};
			return author.nickname || author.realname || card.authorName || '一位记录者';
		},
		resolveTime(time) {
			if (!time) return '刚刚';
			return moment(time).fromNow();
		},
		requireLogin() {
			if (this.$mStore.getters.hasLogin) return true;
			uni.showModal({
				title: '登录后继续',
				content: '共鸣、收藏和私密回看会保存到你的 Shroom 空间。',
				confirmText: '去登录',
				success: res => {
					if (res.confirm) uni.navigateTo({ url: '/pages/public/login' });
				}
			});
			return false;
		},
		openMemory(question = '') {
			if (!this.requireLogin()) return;
			const query = question ? `?q=${encodeURIComponent(question)}` : '';
			uni.navigateTo({ url: `/pages/shroom/memory${query}` });
		},
		askMemory() {
			const question = this.memoryQuestion.trim();
			if (!question) {
				this.openMemory();
				return;
			}
			this.openMemory(question);
		},
		useMemoryPrompt(prompt) {
			this.memoryQuestion = prompt;
			this.openMemory(prompt);
		},
		async resonate(card) {
			if (!this.requireLogin() || card.resonating) return;
			this.$set(card, 'resonating', true);
			try {
				const wasResonated = card._resonated;
				const endpoint = wasResonated ? shroomCardUnresonate : shroomCardResonate;
				const res = await this.$http.post(endpoint, { id: card.id });
				const nextCount = res && res.data && Number(res.data.resonanceCount);
				this.$set(card, '_resonated', !wasResonated);
				this.$set(card, '_resonanceCount', Number.isFinite(nextCount) ? nextCount : Math.max(0, card._resonanceCount + (wasResonated ? -1 : 1)));
				uni.showToast({ title: wasResonated ? '已取消共鸣' : '已记录共鸣', icon: 'none' });
			} catch (error) {
				console.error('共鸣失败', error);
			} finally {
				this.$set(card, 'resonating', false);
			}
		}
	}
};
</script>

<style lang="scss" scoped>
.discover-page {
	display: block;
	min-height: 100vh;
	background: #f1f8e9;
	color: #172019;
}

.status-bar {
	display: block;
	background: #f1f8e9;
}

.discover-shell {
	display: block;
	box-sizing: border-box;
	padding: 54rpx 36rpx 180rpx;
}

.discover-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 28rpx;
	margin-bottom: 50rpx;
}

.memory-entry {
	box-sizing: border-box;
	margin: -8rpx 0 34rpx;
	padding: 34rpx;
	border-radius: 38rpx;
	background: #172019;
	color: #fff;
	box-shadow: 0 24rpx 64rpx rgba(23, 32, 25, .16);
}

.memory-entry-copy,
.memory-kicker,
.memory-title,
.memory-description { display: block; }

.memory-kicker {
	font-size: 18rpx;
	font-weight: 700;
	letter-spacing: 3rpx;
	color: #a9c6a2;
}

.memory-title {
	margin-top: 14rpx;
	font-size: 39rpx;
	font-weight: 720;
	letter-spacing: -1rpx;
}

.memory-description {
	max-width: 590rpx;
	margin-top: 14rpx;
	font-size: 23rpx;
	line-height: 1.65;
	color: rgba(255, 255, 255, .66);
}

.memory-search-row {
	display: flex;
	align-items: center;
	gap: 12rpx;
	margin-top: 28rpx;
}

.memory-input {
	box-sizing: border-box;
	min-width: 0;
	height: 82rpx;
	flex: 1;
	padding: 0 24rpx;
	border-radius: 24rpx;
	background: rgba(255, 255, 255, .1);
	font-size: 24rpx;
	color: #fff;
}

.memory-submit {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 82rpx;
	height: 82rpx;
	margin: 0;
	padding: 0;
	border-radius: 24rpx;
	background: #ddec8c;
	font-size: 34rpx;
	line-height: 1;
	color: #172019;
}

.memory-submit::after,
.memory-prompts button::after { border: 0; }

.memory-prompts {
	display: flex;
	flex-wrap: wrap;
	gap: 10rpx;
	margin-top: 17rpx;
}

.memory-prompts button {
	margin: 0;
	padding: 12rpx 18rpx;
	border: 1rpx solid rgba(255, 255, 255, .13);
	border-radius: 999rpx;
	background: transparent;
	font-size: 20rpx;
	line-height: 1.2;
	color: rgba(255, 255, 255, .72);
}

.filter-scroll::-webkit-scrollbar { display: none; }

.eyebrow,
.page-title,
.page-subtitle {
	display: block;
}

.eyebrow {
	margin-bottom: 14rpx;
	font-size: 19rpx;
	font-weight: 700;
	letter-spacing: 3rpx;
	color: #69806c;
}

.page-title {
	font-size: 62rpx;
	font-weight: 760;
	letter-spacing: -2rpx;
	line-height: 1;
}

.page-subtitle {
	max-width: 480rpx;
	margin-top: 22rpx;
	font-size: 25rpx;
	line-height: 1.75;
	color: #607063;
}

.control-row {
	display: flex;
	align-items: center;
	gap: 16rpx;
	margin-bottom: 32rpx;
}

.filter-scroll {
	min-width: 0;
	flex: 1;
	white-space: nowrap;
	scrollbar-width: none;
}

.filter-list {
	display: inline-flex;
	gap: 12rpx;
	padding-right: 20rpx;
}

.filter-chip,
.sort-switch {
	box-sizing: border-box;
	border: 1rpx solid rgba(23, 32, 25, .12);
	background: rgba(255, 255, 255, .58);
	color: #5a685c;
}

.filter-chip {
	padding: 15rpx 25rpx;
	border-radius: 999rpx;
	font-size: 23rpx;
}

.filter-chip.active {
	border-color: #172019;
	background: #172019;
	color: #fff;
}

.sort-switch {
	display: flex;
	align-items: center;
	gap: 10rpx;
	flex-shrink: 0;
	padding: 15rpx 20rpx;
	border-radius: 999rpx;
	font-size: 22rpx;
}

.sort-dot {
	width: 10rpx;
	height: 10rpx;
	border-radius: 50%;
	background: #82aa77;
}

.card-deck {
	display: block;
	max-width: 860rpx;
	margin: 0 auto;
}

.deck-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.deck-heading {
	margin: 0 8rpx 18rpx;
	font-size: 18rpx;
	font-weight: 700;
	letter-spacing: 2rpx;
	color: #758477;
}

.deck-heading text:last-child {
	font-weight: 500;
	letter-spacing: 0;
	color: #849087;
}

.cards-swiper {
	height: 860rpx;
}

.card-slide {
	box-sizing: border-box;
	padding: 0 12rpx 0 0;
}

.discovery-card {
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	height: 100%;
	padding: 32rpx;
	border: 1rpx solid rgba(23, 32, 25, .06);
	border-radius: 38rpx;
	background: #fff;
	box-shadow: 0 18rpx 55rpx rgba(58, 80, 60, .075);
	overflow: hidden;
}

.card-topline,
.author-row,
.card-actions,
.action {
	display: flex;
	align-items: center;
}

.card-topline,
.card-actions {
	justify-content: space-between;
}

.author-avatar {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 62rpx;
	height: 62rpx;
	margin-right: 16rpx;
	border-radius: 50%;
	background: #e5efd9;
	font-size: 24rpx;
	font-weight: 700;
	color: #48634c;
}

.author-copy {
	display: flex;
	flex-direction: column;
	gap: 4rpx;
}

.author-name {
	font-size: 23rpx;
	font-weight: 650;
}

.publish-time,
.card-index {
	font-size: 19rpx;
	color: #8b978d;
}

.card-index {
	letter-spacing: 2rpx;
}

.card-index-copy {
	display: flex;
	align-items: flex-end;
	flex-direction: column;
	gap: 7rpx;
	flex-shrink: 0;
}

.seed-sentence {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 4;
	overflow: hidden;
	margin-top: 27rpx;
	font-size: 36rpx;
	font-weight: 720;
	line-height: 1.52;
	letter-spacing: -.5rpx;
}

.understanding {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
	overflow: hidden;
	margin-top: 20rpx;
	font-size: 25rpx;
	line-height: 1.75;
	color: #647066;
}

.usage-block {
	margin-top: 30rpx;
	padding: 24rpx;
	border-radius: 25rpx;
	background: #f6f3e6;
}

.usage-label {
	display: block;
	margin-bottom: 15rpx;
	font-size: 19rpx;
	font-weight: 700;
	letter-spacing: 1rpx;
	color: #7c7453;
}

.usage-item {
	display: flex;
	align-items: flex-start;
	gap: 13rpx;
	margin-top: 10rpx;
	font-size: 23rpx;
	line-height: 1.55;
	color: #504d3e;
}

.usage-item text:last-child {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

.usage-mark {
	width: 9rpx;
	height: 9rpx;
	margin-top: 13rpx;
	border-radius: 50%;
	background: #b0a36e;
	flex-shrink: 0;
}

.tag-row {
	display: flex;
	flex-wrap: wrap;
	gap: 10rpx;
	margin-top: 27rpx;
}

.tag {
	padding: 8rpx 14rpx;
	border-radius: 999rpx;
	background: #edf4e8;
	font-size: 20rpx;
	color: #607762;
}

.card-actions {
	margin-top: auto;
	padding-top: 23rpx;
	border-top: 1rpx solid #edf0ec;
}

.action {
	gap: 8rpx;
	font-size: 21rpx;
	color: #667168;
}

.action.active,
.action.active .heart { color: #8c4f50; }

.owner-mark {
	font-size: 20rpx;
	color: #7c897e;
}

.heart {
	font-size: 30rpx;
	color: #738a70;
}

.quote-action {
	font-weight: 650;
	color: #263329;
}

.arrow {
	font-size: 26rpx;
}

.state-panel {
	display: flex;
	align-items: center;
	flex-direction: column;
	justify-content: center;
	min-height: 620rpx;
	padding: 50rpx;
	text-align: center;
}

.state-symbol {
	font-size: 70rpx;
	font-weight: 300;
	color: #7f9c7c;
}

.state-title {
	margin-top: 25rpx;
	font-size: 30rpx;
	font-weight: 680;
}

.state-copy {
	max-width: 480rpx;
	margin-top: 15rpx;
	font-size: 23rpx;
	line-height: 1.7;
	color: #728075;
}

.state-button {
	margin-top: 30rpx;
	padding: 17rpx 27rpx;
	border-radius: 999rpx;
	background: #172019;
	font-size: 22rpx;
	color: #fff;
}

.loading-ring {
	width: 46rpx;
	height: 46rpx;
	border: 4rpx solid rgba(91, 122, 91, .2);
	border-top-color: #668166;
	border-radius: 50%;
	animation: spin .8s linear infinite;
}

.list-footer {
	padding: 38rpx 0 10rpx;
	text-align: center;
	font-size: 21rpx;
	color: #839086;
}

@keyframes spin {
	to { transform: rotate(360deg); }
}

/* #ifdef H5 */
@media (min-width: 1024px) {
	.discover-page {
		padding-left: 96px;
	}

	.discover-shell {
		max-width: 1240px;
		margin: 0 auto;
		padding: 70px 56px 90px;
	}

	.discover-header {
		margin-bottom: 44px;
	}

	.page-title {
		font-size: 54px;
	}

	.page-subtitle {
		max-width: 520px;
		font-size: 15px;
	}

	.card-deck {
		max-width: 820px;
	}

	.cards-swiper { height: 520px; }

	.card-slide { padding-right: 18px; }

	.discovery-card {
		padding: 28px;
		border-radius: 28px;
	}

	.seed-sentence {
		font-size: 24px;
	}
}
/* #endif */
</style>
