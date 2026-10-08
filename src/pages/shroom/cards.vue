<template>
	<view class="cards-page">
		<shroom-page-top-spacer />
		<view class="cards-shell">
			<view class="page-header">
				<text class="page-title">菇卡</text>
				<view class="header-actions"><button class="favorites-entry" @tap="openFavorites"><text class="favorites-icon">☆</text><text>收藏</text></button><button class="create-entry" v-if="hasLogin" @tap="createCard" aria-label="创建菇卡">＋</button></view>
			</view>


			<view class="shroom-home">
				<view class="shroom-manifesto">
					<view class="manifesto-copy">
						<text class="manifesto-title">过去的自己，<br>保护未来的自己。</text>
						<text class="manifesto-subtitle">那些付过代价才明白的事，<br>别让未来的你再经历一次。</text>
						<text class="manifesto-note">记住，<br>是为了走更远的路。</text>
					</view>
					<image class="manifesto-mascot" src="/static/images/shroom-card-mascot-v2.webp" mode="widthFix" />
				</view>

				<view class="review-panel">
					<view>
						<text class="review-label">今天待复习</text>
						<text class="review-number">{{ hasLogin ? reviewDueCount : 3 }} 张菇卡 <text v-if="!hasLogin" class="sample-note">示例</text></text>
					</view>
					<button class="review-button" @tap="startReview">开始复习 <text>→</text></button>
				</view>

				<view class="library-stats">
					<view><text>{{ hasLogin ? allCards.length : '—' }}</text><text>全部菇卡</text></view>
					<view><text class="stat-red">{{ hasLogin ? reviewDueCount : '—' }}</text><text>待复习</text></view>
					<view><text class="stat-green">{{ hasLogin ? reviewedCount : '—' }}</text><text>正在记忆</text></view>
					<view><text class="stat-green">{{ hasLogin ? practicedCount : '—' }}</text><text>真实用过</text></view>
				</view>

				<view class="recent-heading">
					<text>最近回顾</text>
					<text @tap="toggleAll">{{ showAll ? '收起' : '查看全部' }} ›</text>
				</view>
			</view>
			<view class="guest-recent" v-if="!hasLogin">
				<view class="recent-row" v-for="(item, index) in sampleCards" :key="item.title" @tap="openPreviewDetail">
					<view class="recent-thumb" :class="'thumb-' + index"><image v-if="index !== 2" src="/static/images/shroom-card-mascot-v2.webp" mode="aspectFit" /><text v-else>☀</text></view>
					<view class="recent-copy"><text>{{ item.title }}</text><text>示例 · {{ item.tag }}</text></view>
				</view>
				<button class="guest-login" @tap="goLogin">登录后查看我的菇卡 →</button>
			</view>

			<view class="loading-state" v-else-if="loading">
				<view class="loading-ring"></view>
				<text>正在找回你的理解…</text>
			</view>

			<view class="empty-state" v-else-if="hasLogin && allCards.length === 0">
				<text class="empty-number">01</text>
				<text class="empty-title">从一句真话开始</text>
				<text class="empty-copy">你不需要总结人生。只要写下此刻真正意识到的事，再为它设计一个能实践的动作。</text>
				<view class="primary-button" @tap="createCard">创建第一张菇卡</view>
			</view>

			<view class="recent-list" v-else>
				<view class="recent-row" v-for="(card, index) in visibleCards" :key="card.id" @tap="viewCardDetail(card.id)">
					<view class="recent-thumb" :class="'thumb-' + index % 3"><image v-if="index % 3 !== 2" src="/static/images/shroom-card-mascot-v2.webp" mode="aspectFit" /><text v-else>☀</text></view>
					<view class="recent-copy"><text>{{ card.seedSentence || '暂无觉察句' }}</text><text>{{ relativeTime(card.lastReviewedAt || card.createdAt) }} · {{ firstTag(card) }}</text></view><text class="recent-arrow">›</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import { shroomCardList } from '@/api/shroomCard';

export default {
	name: 'shroomCards',
	data() {
		return {
			statusBarHeight: 0,
			shroomCards: [],
			loading: false,
			showAll: false,
			sampleCards: [
				{ title: '情绪上头时，先暂停。', tag: '情绪管理' },
				{ title: '好的身体状态，是长期自由。', tag: '健康' },
				{ title: '重要决定前，先核对事实。', tag: '决策' }
			]
		};
	},
	computed: {
		hasLogin() {
			return this.$mStore.getters.hasLogin;
		},
		allCards() {
			return this.shroomCards || [];
		},
		visibleCards() { return this.showAll ? this.allCards : this.allCards.slice(0, 3); },

		reviewDueCount() {
			return Math.min(3, this.shroomCards.filter(card => !card.lastReviewedAt || Date.now() - new Date(card.lastReviewedAt).getTime() >= 86400000).length);
		},
		reviewedCount() {
			return this.shroomCards.filter(card => card.lastReviewedAt).length;
		},
		practicedCount() {
			return this.shroomCards.filter(card => card._practiceCount > 0).length;
		},
		publicCount() {
			return this.allCards.filter(card => card.visibility && card.visibility !== 'PRIVATE').length;
		},
		totalDisplay() {
			return this.allCards.length < 10 ? `0${this.allCards.length}` : String(this.allCards.length);
		}
	},
	onLoad() {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
	},
	onShow() {
		this.loadShroomCards();
	},
	onPullDownRefresh() {
		this.loadShroomCards().finally(() => uni.stopPullDownRefresh());
	},
	methods: {
		firstTag(card) { return card._tags && card._tags.length ? card._tags[0] : '菇卡'; },
		relativeTime(value) {
			if (!value) return '刚刚';
			const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
			return !Number.isFinite(days) ? '最近' : days <= 0 ? '今天' : days === 1 ? '昨天' : `${days} 天前`;
		},
		toggleAll() { this.showAll = !this.showAll; },
		openFavorites() { if (!this.hasLogin) return this.goLogin(); uni.navigateTo({ url: '/pages/shroom/cards-favorites' }); },
		normalizeList(data) {
			let cards = [];
			if (Array.isArray(data)) cards = data;
			else if (data && Array.isArray(data.list)) cards = data.list;
			else if (data && Array.isArray(data.data)) cards = data.data;
			const tones = ['green', 'yellow', 'blue', 'rose'];
			return cards.map((card, index) => Object.assign({}, card, {
				_displayIndex: index + 1 < 10 ? `0${index + 1}` : String(index + 1),
				_tone: tones[index % tones.length],
				_usageItems: Array.isArray(card.usageItems) ? card.usageItems.slice(0, 3) : [],
					_tags: Array.isArray(card.tags) ? card.tags.slice(0, 3) : [],
					_practiceCount: card.stats && card.stats.practiceCount ? card.stats.practiceCount : 0
				}));
		},
		async loadShroomCards() {
			if (!this.hasLogin) {
				this.shroomCards = [];
				this.loading = false;
				return;
			}
			this.loading = true;
			try {
				const res = await this.$http.get(shroomCardList, { page: 1, pageSize: 100 });
				const cards = res && res.code === 200 ? this.normalizeList(res.data) : [];
				this.shroomCards = cards;
			} catch (error) {
				console.error('加载菇卡失败', error);
			} finally {
				this.loading = false;
			}
		},
		startReview() {
			uni.navigateTo({ url: this.hasLogin ? '/pages/shroom/cards-review' : '/pages/shroom/cards-review?preview=1' });
		},
		openPreviewDetail() { uni.navigateTo({ url: '/pages/common/cards/detail?preview=1' }); },
		viewCardDetail(cardId) {
			uni.navigateTo({ url: `/pages/common/cards/detail?id=${cardId}` });
		},
		createCard() {
			uni.navigateTo({ url: '/pages/common/cards/edit' });
		},
		goLogin() {
			uni.navigateTo({ url: '/pages/public/login' });
		},
		openDiscover() {
			uni.switchTab({ url: '/pages/shroom/discover' });
		}
	}
};
</script>

<style scoped lang="scss">
.cards-page {
	display: block;
	min-height: 100vh;
	background: #f1f8e9;
	color: #172019;
}

.status-bar {
	display: block;
	background: #f1f8e9;
}

.cards-shell {
	display: block;
	box-sizing: border-box;
	padding: 54rpx 36rpx 180rpx;
}

.page-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 24rpx;
	margin-bottom: 44rpx;
}




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
	margin-top: 18rpx;
	font-size: 23rpx;
	color: #69776b;
}

.create-button,
.primary-button,
.secondary-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 999rpx;
	font-size: 23rpx;
	font-weight: 680;
}

.create-button {
	gap: 8rpx;
	flex-shrink: 0;
	padding: 18rpx 25rpx;
	background: #172019;
	color: #fff;
}

.create-plus {
	font-size: 34rpx;
	font-weight: 300;
	line-height: .7;
}

.guest-panel {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	overflow: hidden;
	border-radius: 42rpx;
	background: #172019;
	box-shadow: 0 24rpx 70rpx rgba(35, 58, 39, .14);
}

.guest-illustration {
	position: relative;
	min-height: 390rpx;
	background: #dfeace;
	overflow: hidden;
}

.guest-illustration::before,
.guest-illustration::after {
	content: '';
	position: absolute;
	border: 1rpx solid rgba(46, 74, 51, .16);
	border-radius: 50%;
}

.guest-illustration::before {
	right: -110rpx;
	top: -150rpx;
	width: 470rpx;
	height: 470rpx;
	box-shadow: 0 0 0 70rpx rgba(255, 255, 255, .16), 0 0 0 140rpx rgba(255, 255, 255, .1);
}

.guest-illustration::after {
	left: -85rpx;
	bottom: -190rpx;
	width: 410rpx;
	height: 410rpx;
}

.mushroom-cap {
	position: absolute;
	left: 50%;
	top: 82rpx;
	z-index: 2;
	width: 235rpx;
	height: 126rpx;
	transform: translateX(-50%);
	border-radius: 180rpx 180rpx 48rpx 48rpx;
	background: #172019;
}

.mushroom-stem {
	position: absolute;
	left: 50%;
	top: 185rpx;
	z-index: 1;
	width: 66rpx;
	height: 145rpx;
	transform: translateX(-50%);
	border-radius: 0 0 50rpx 50rpx;
	background: #172019;
}

.growth-line {
	position: absolute;
	bottom: 54rpx;
	height: 2rpx;
	background: rgba(23, 32, 25, .28);
}

.line-one { left: 70rpx; width: 185rpx; transform: rotate(-8deg); }
.line-two { right: 55rpx; width: 205rpx; transform: rotate(11deg); }

.guest-copy {
	padding: 42rpx 36rpx 46rpx;
	color: #fff;
}

.guest-kicker,
.guest-title,
.guest-description {
	display: block;
}

.guest-kicker {
	font-size: 18rpx;
	font-weight: 700;
	letter-spacing: 3rpx;
	color: #9eaf9e;
}

.guest-title {
	margin-top: 17rpx;
	font-size: 39rpx;
	font-weight: 720;
	line-height: 1.35;
}

.guest-description {
	margin-top: 19rpx;
	font-size: 23rpx;
	line-height: 1.75;
	color: #bdc9bd;
}

.guest-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 13rpx;
	margin-top: 30rpx;
}

.primary-button,
.secondary-button {
	padding: 18rpx 26rpx;
}

.primary-button {
	background: #e5efd9;
	color: #172019;
}

.secondary-button {
	border: 1rpx solid rgba(255, 255, 255, .2);
	color: #d6ded5;
}

.loading-state,
.empty-state {
	display: flex;
	align-items: center;
	flex-direction: column;
	justify-content: center;
	min-height: 700rpx;
	text-align: center;
}

.loading-state {
	gap: 23rpx;
	font-size: 23rpx;
	color: #718073;
}

.loading-ring {
	width: 46rpx;
	height: 46rpx;
	border: 4rpx solid rgba(91, 122, 91, .2);
	border-top-color: #668166;
	border-radius: 50%;
	animation: spin .8s linear infinite;
}

.empty-number {
	font-size: 22rpx;
	font-weight: 700;
	letter-spacing: 4rpx;
	color: #799078;
}

.empty-title {
	margin-top: 28rpx;
	font-size: 43rpx;
	font-weight: 720;
}

.empty-copy {
	max-width: 550rpx;
	margin: 20rpx 0 34rpx;
	font-size: 24rpx;
	line-height: 1.75;
	color: #728075;
}

.desktop-card-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 24rpx;
}

.mobile-deck {
	height: calc(100vh - 270rpx);
	min-height: 850rpx;
}

.deck-hint {
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 48rpx;
	padding: 0 8rpx;
	font-size: 18rpx;
	font-weight: 700;
	letter-spacing: 2rpx;
	color: #718074;
}

.deck-hint text:last-child {
	font-weight: 500;
	letter-spacing: 0;
	color: #879289;
}

.cards-swiper {
	height: calc(100% - 48rpx);
}

.swiper-item {
	box-sizing: border-box;
	padding: 0 12rpx 0 0;
}

.shroom-card {
	display: block;
	overflow: hidden;
	border-radius: 39rpx;
	background: #fff;
	box-shadow: 0 20rpx 60rpx rgba(50, 73, 52, .09);
}

.mobile-deck .shroom-card {
	display: flex;
	height: 100%;
	flex-direction: column;
}

.card-hero {
	display: block;
	box-sizing: border-box;
	min-height: 350rpx;
	padding: 34rpx;
	color: #172019;
}

.card-hero.green { background: #dfeace; }
.card-hero.yellow { background: #f5ebc4; }
.card-hero.blue { background: #dceceb; }
.card-hero.rose { background: #f2ded8; }

.card-sequence {
	display: flex;
	align-items: baseline;
	font-size: 34rpx;
	font-weight: 720;
}

.sequence-total {
	margin-left: 7rpx;
	font-size: 19rpx;
	font-weight: 600;
	color: rgba(23, 32, 25, .48);
}

.seed-sentence {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 4;
	overflow: hidden;
	margin-top: 64rpx;
	font-size: 37rpx;
	font-weight: 730;
	line-height: 1.5;
}

.understanding-preview {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
	margin-top: 20rpx;
	font-size: 23rpx;
	line-height: 1.65;
	color: rgba(23, 32, 25, .64);
}

.card-body {
	display: flex;
	box-sizing: border-box;
	padding: 31rpx 34rpx 34rpx;
	flex: 1;
	flex-direction: column;
}

.section-label {
	display: block;
	margin-bottom: 20rpx;
	font-size: 19rpx;
	font-weight: 700;
	letter-spacing: 2rpx;
	color: #758178;
}

.usage-row {
	display: flex;
	align-items: flex-start;
	gap: 15rpx;
	margin-top: 15rpx;
	font-size: 24rpx;
	line-height: 1.65;
	color: #465049;
}

.usage-row text:last-child {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

.usage-dot {
	width: 10rpx;
	height: 10rpx;
	margin-top: 15rpx;
	border-radius: 50%;
	background: #789275;
	flex-shrink: 0;
}

.card-footer {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 20rpx;
	margin-top: auto;
	padding-top: 30rpx;
}

.tag-list {
	display: flex;
	flex-wrap: wrap;
	gap: 9rpx;
}

.tag {
	padding: 8rpx 13rpx;
	border-radius: 999rpx;
	background: #edf4e8;
	font-size: 19rpx;
	color: #607762;
}

.practice-count {
	flex-shrink: 0;
	font-size: 20rpx;
	font-weight: 650;
	color: #3e5141;
}

.shroom-home {
	display: flex;
	flex-direction: column;
	gap: 22rpx;
	margin-bottom: 26rpx;
}

.shroom-manifesto {
	position: relative;
	display: flex;
	box-sizing: border-box;
	min-height: 330rpx;
	align-items: stretch;
	overflow: hidden;
	padding: 38rpx 24rpx 30rpx 34rpx;
	border: 1rpx solid rgba(91, 116, 82, .12);
	border-radius: 34rpx;
	background: linear-gradient(140deg, #fffdf6 0%, #f1f4e7 100%);
	box-shadow: 0 20rpx 54rpx rgba(48, 63, 45, .08);
}

.shroom-manifesto::after {
	position: absolute;
	inset: 0;
	background: linear-gradient(90deg, rgba(255, 253, 246, .98) 0%, rgba(255, 253, 246, .9) 44%, rgba(255, 253, 246, .22) 70%, transparent 84%);
	content: '';
	pointer-events: none;
}

.manifesto-copy {
	position: relative;
	z-index: 2;
	display: flex;
	width: 62%;
	flex-direction: column;
	justify-content: center;
}

.manifesto-title,
.manifesto-subtitle,
.manifesto-note { display: block; }

.manifesto-title {
	font-size: 38rpx;
	font-weight: 790;
	line-height: 1.28;
	letter-spacing: -1rpx;
}

.manifesto-subtitle {
	margin-top: 17rpx;
	font-size: 21rpx;
	line-height: 1.65;
	color: #687168;
}

.manifesto-note {
	margin-top: 24rpx;
	font-size: 18rpx;
	font-weight: 680;
	color: #5d794f;
}

.manifesto-mascot {
	position: absolute;
	z-index: 1;
	right: -56rpx;
	bottom: -14rpx;
	width: 385rpx;
}

.review-panel {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 24rpx;
	padding: 28rpx 30rpx;
	border-radius: 30rpx;
	background: #192027;
	color: #fff;
	box-shadow: 0 18rpx 40rpx rgba(25, 32, 39, .16);
}

.review-panel > view { display: flex; flex-direction: column; gap: 7rpx; }
.review-label { font-size: 19rpx; color: #abb5ac; }
.review-number { font-size: 31rpx; font-weight: 760; }

.review-button {
	display: flex;
	height: 70rpx;
	align-items: center;
	gap: 16rpx;
	margin: 0;
	padding: 0 25rpx;
	border-radius: 999rpx;
	background: #fff;
	color: #192027;
	font-size: 22rpx;
	font-weight: 720;
	line-height: 1;
}
.review-button::after { border: 0; }
.review-button text { font-size: 28rpx; }

.library-stats {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10rpx;
}

.library-stats view {
	display: flex;
	min-width: 0;
	align-items: center;
	padding: 19rpx 5rpx;
	border-radius: 22rpx;
	background: rgba(255, 255, 255, .62);
	flex-direction: column;
	box-shadow: 0 8rpx 24rpx rgba(53, 72, 55, .04);
}

.library-stats text:first-child { font-size: 28rpx; font-weight: 790; color: #243129; }
.library-stats text:last-child { margin-top: 5rpx; font-size: 17rpx; color: #7a867c; }

.recent-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 7rpx 5rpx 0;
}
.recent-heading text:first-child { font-size: 29rpx; font-weight: 750; }
.recent-heading text:last-child { font-size: 18rpx; color: #849087; }

@keyframes spin {
	to { transform: rotate(360deg); }
}

/* #ifdef H5 */
@media (min-width: 1024px) {
	.cards-page {
		padding-left: 96px;
	}

	.cards-shell {
		max-width: 1240px;
		margin: 0 auto;
		padding: 70px 56px 90px;
	}

	.page-title {
		font-size: 54px;
	}

	.guest-panel {
		grid-template-columns: .85fr 1.15fr;
		border-radius: 34px;
	}

	.guest-illustration {
		min-height: 470px;
	}

	.guest-copy {
		display: flex;
		padding: 62px;
		flex-direction: column;
		justify-content: center;
	}

	.guest-title {
		font-size: 35px;
	}

	.mobile-deck {
		max-width: 820px;
		height: 610px;
		margin: 0 auto;
	}

	.shroom-card {
		border-radius: 28px;
	}

	.card-hero {
		min-height: 280px;
		padding: 28px;
	}

	.seed-sentence {
		margin-top: 48px;
		font-size: 25px;
	}

	.card-body {
		min-height: 235px;
		padding: 25px 28px 28px;
	}
}
/* #endif */
.cards-page { background: #fffefa; color: #15191f; }
.cards-shell { box-sizing: border-box; width: 100%; max-width: 750rpx; margin: 0 auto; padding: 18rpx 27rpx 150rpx; }
.page-header { align-items: center; height: 66rpx; margin-bottom: 10rpx; }
.page-title { font-size: 43rpx; line-height: 1; font-weight: 800; color: #15191f; }
.header-actions { display: flex; align-items: center; gap: 22rpx; font-size: 42rpx; line-height: 1; }
.header-actions button { display: flex; align-items: center; justify-content: center; margin: 0; height: 64rpx; padding: 0; background: transparent; color: #26352a; }
.header-actions button::after { border: 0; }
.favorites-entry { gap: 8rpx; min-width: 108rpx; font-size: 23rpx; line-height: 1; }
.favorites-icon { font-size: 34rpx; }
.create-entry { width: 54rpx; font-size: 38rpx; line-height: 1; }
.shroom-home { gap: 14rpx; margin-bottom: 0; }
.shroom-manifesto { height: 350rpx; min-height: 0; padding: 33rpx 26rpx; border: 0; border-radius: 23rpx; background: radial-gradient(circle at 70% 66%, #f1f4df, #fbfbf2 72%); box-shadow: none; }
.shroom-manifesto::after { display: none; }
.manifesto-copy { width: 100%; justify-content: flex-start; }
.manifesto-title { font-size: 39rpx; line-height: 1.36; color: #15191f; }
.manifesto-subtitle { margin-top: 8rpx; font-size: 22rpx; line-height: 1.52; color: #4b5260; }
.manifesto-note { position: absolute; left: 0; bottom: 16rpx; margin: 0; transform: rotate(-13deg); font-size: 18rpx; line-height: 1.5; color: #29333c; }
.manifesto-mascot { right: -25rpx; bottom: -25rpx; width: 430rpx; }
.review-panel { display: flex; height: 194rpx; box-sizing: border-box; align-items: stretch; flex-direction: column; gap: 0; padding: 19rpx 21rpx 16rpx; border-radius: 22rpx; background: #20262b; box-shadow: none; }
.review-panel > view { gap: 2rpx; }.review-label { font-size: 23rpx; color: #fff; }.review-number { font-size: 34rpx; line-height: 1.1; color: #fff; }
.sample-note { margin-left: 8rpx; font-size: 17rpx; font-weight: 400; color: #b7bfc0; }
.review-button { width: 100%; height: 66rpx; margin-top: auto; justify-content: center; border-radius: 999rpx; background: #fff; color: #15191f; font-size: 24rpx; }
.library-stats { gap: 8rpx; }.library-stats view { height: 81rpx; box-sizing: border-box; padding: 8rpx 2rpx; border: 1rpx solid #eef0eb; border-radius: 13rpx; background: #fff; box-shadow: 0 5rpx 14rpx rgba(38,47,38,.04); }
.library-stats text:first-child { font-size: 27rpx; color: #15191f; }.library-stats text:first-child.stat-red { color: #ef5951; }.library-stats text:first-child.stat-green { color: #4e9951; }.library-stats text:last-child { font-size: 16rpx; color: #868c95; }
.recent-heading { padding: 9rpx 2rpx 0; }.recent-heading text:first-child { font-size: 25rpx; }.recent-heading text:last-child { font-size: 18rpx; }
.recent-list, .guest-recent { margin-top: 8rpx; }.recent-row { display: flex; align-items: center; gap: 14rpx; min-height: 78rpx; border-bottom: 1rpx solid #f0f1ed; }
.recent-thumb { display: flex; width: 67rpx; height: 64rpx; flex-shrink: 0; align-items: center; justify-content: center; overflow: hidden; border-radius: 11rpx; background: #f3eadf; }.recent-thumb image { width: 86rpx; height: 72rpx; }.recent-thumb text { font-size: 42rpx; color: #dca968; }.thumb-1 { background: #e4eee5; }.thumb-2 { background: #e1edf3; }
.recent-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4rpx; }.recent-copy text:first-child { overflow: hidden; font-size: 21rpx; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }.recent-copy text:last-child { font-size: 17rpx; color: #8c939a; }.recent-arrow { font-size: 28rpx; color: #a5aaa7; }
.guest-login { width: 100%; margin: 20rpx 0 0; height: 68rpx; border-radius: 999rpx; background: #20262b; color: #fff; font-size: 22rpx; line-height: 68rpx; }.guest-login::after { border: 0; }
.empty-state { min-height: 280rpx; }
@media (max-width: 750px) {
	.cards-shell { padding: 30rpx 46rpx 180rpx; }
	.page-header { height: 100rpx; margin-bottom: 10rpx; }
	.page-title { font-size: 58rpx; }
	.header-actions { font-size: 58rpx; }
	.shroom-manifesto { height: 660rpx; padding: 45rpx 35rpx; border-radius: 26rpx; }
	.manifesto-title { font-size: 60rpx; }
	.manifesto-subtitle { margin-top: 13rpx; font-size: 35rpx; }
	.manifesto-note { bottom: 40rpx; font-size: 28rpx; }
	.manifesto-mascot { width: 545rpx; right: -65rpx; bottom: -35rpx; }
	.review-panel { height: 295rpx; margin-top: 20rpx; padding: 25rpx 25rpx 18rpx; border-radius: 22rpx; }
	.review-label { font-size: 33rpx; }.review-number { font-size: 45rpx; }.sample-note { font-size: 22rpx; }
	.review-button { height: 102rpx; font-size: 32rpx; }
	.library-stats { gap: 10rpx; }.library-stats view { height: 125rpx; }.library-stats text:first-child { font-size: 40rpx; }.library-stats text:last-child { font-size: 23rpx; }
	.recent-heading { padding-top: 26rpx; }.recent-heading text:first-child { font-size: 36rpx; }.recent-heading text:last-child { font-size: 24rpx; }
	.recent-row { min-height: 125rpx; gap: 15rpx; }.recent-thumb { width: 100rpx; height: 95rpx; }.recent-thumb image { width: 122rpx; height: 105rpx; }.recent-copy text:first-child { font-size: 28rpx; }.recent-copy text:last-child { font-size: 22rpx; }
	.guest-login { height: 100rpx; line-height: 100rpx; font-size: 29rpx; }
}
</style>
