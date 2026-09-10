<template>
	<view class="cards-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="cards-shell">
			<view class="page-header">
				<view>
					<text class="eyebrow">MY SHROOM CARDS</text>
					<text class="page-title">菇卡</text>
					<text class="page-subtitle">{{ librarySubtitle }}</text>
				</view>
				<view class="create-button" v-if="hasLogin && activeLibrary === 'mine'" @tap="createCard">
					<text class="create-plus">+</text>
					<text>新建菇卡</text>
				</view>
			</view>

			<view class="library-switch" v-if="hasLogin">
				<button :class="{ active: activeLibrary === 'mine' }" @tap="switchLibrary('mine')">我的菇卡</button>
				<button :class="{ active: activeLibrary === 'favorites' }" @tap="switchLibrary('favorites')">我的收藏</button>
			</view>

			<view class="guest-panel" v-if="!hasLogin">
				<view class="guest-illustration" aria-hidden="true">
					<view class="mushroom-cap"></view>
					<view class="mushroom-stem"></view>
					<view class="growth-line line-one"></view>
					<view class="growth-line line-two"></view>
				</view>
				<view class="guest-copy">
					<text class="guest-kicker">YOUR LIVING NOTES</text>
					<text class="guest-title">让日记不止停在“写过”</text>
					<text class="guest-description">菇卡会保留你的觉察句、个人理解和真实练习。登录后才会读取你的私人内容。</text>
					<view class="guest-actions">
						<view class="primary-button" @tap="goLogin">登录 / 注册</view>
						<view class="secondary-button" @tap="openDiscover">先看看发现</view>
					</view>
				</view>
			</view>

			<view class="loading-state" v-else-if="loading">
				<view class="loading-ring"></view>
				<text>正在找回你的理解…</text>
			</view>

			<view class="empty-state" v-else-if="allCards.length === 0">
				<text class="empty-number">{{ activeLibrary === 'mine' ? '01' : '◇' }}</text>
				<text class="empty-title">{{ activeLibrary === 'mine' ? '从一句真话开始' : '还没有收藏的菇卡' }}</text>
				<text class="empty-copy">{{ activeLibrary === 'mine' ? '你不需要总结人生。只要写下此刻真正意识到的事，再为它设计一个能实践的动作。' : '收藏只是稍后再看；当你想真正使用别人的理解时，再把它引用为自己的私密菇卡。' }}</text>
				<view class="primary-button" v-if="activeLibrary === 'mine'" @tap="createCard">创建第一张菇卡</view>
				<view class="primary-button" v-else @tap="openDiscover">去发现广场看看</view>
			</view>

			<view v-else>
				<view class="mobile-deck">
					<view class="deck-hint"><text>左右滑动</text><text>点开查看、练习或引用到日记</text></view>
					<swiper class="cards-swiper" :current="currentCardIndex" @change="onSwiperChange" :circular="false" previous-margin="10rpx" next-margin="42rpx">
						<swiper-item v-for="card in allCards" :key="card.id" class="swiper-item">
							<view class="shroom-card" @tap="viewCardDetail(card.id)">
							<view class="card-hero" :class="card._tone">
									<view class="card-sequence">
									<text>{{ card._displayIndex }}</text>
									<text class="sequence-total">/ {{ totalDisplay }}</text>
									</view>
									<text class="seed-sentence">{{ card.seedSentence || '暂无觉察句' }}</text>
									<text class="understanding-preview" v-if="card.myUnderstanding">{{ card.myUnderstanding }}</text>
								</view>
								<view class="card-body">
								<view class="usage-list" v-if="card._usageItems.length">
										<text class="section-label">我要怎么去用</text>
									<view class="usage-row" v-for="(item, itemIndex) in card._usageItems" :key="itemIndex">
											<text class="usage-dot"></text>
											<text>{{ item }}</text>
										</view>
									</view>
									<view class="card-footer">
										<view class="tag-list">
										<text class="tag" v-for="tag in card._tags" :key="tag">#{{ tag }}</text>
										</view>
									<text class="practice-count">{{ card._practiceCount }} 次练习 ↗</text>
									</view>
								</view>
							</view>
						</swiper-item>
					</swiper>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import { shroomCardFavorites, shroomCardList } from '@/api/shroomCard';

export default {
	name: 'shroomCards',
	data() {
		return {
			statusBarHeight: 0,
			shroomCards: [],
			favoriteCards: [],
			activeLibrary: 'mine',
			loading: false,
			currentCardIndex: 0
		};
	},
	computed: {
		hasLogin() {
			return this.$mStore.getters.hasLogin;
		},
		allCards() {
			return this.activeLibrary === 'favorites' ? (this.favoriteCards || []) : (this.shroomCards || []);
		},
		librarySubtitle() {
			if (!this.hasLogin) return '把一次觉察，变成可以练习的理解。';
			if (this.activeLibrary === 'favorites') return this.allCards.length ? `${this.allCards.length} 张想再回来的理解` : '收藏和引用是两件不同的事。';
			return this.allCards.length ? `${this.allCards.length} 个正在生长的理解` : '把一次觉察，变成可以练习的理解。';
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
				const endpoint = this.activeLibrary === 'favorites' ? shroomCardFavorites : shroomCardList;
				const res = await this.$http.get(endpoint, { page: 1, pageSize: 100 });
				const cards = res && res.code === 200 ? this.normalizeList(res.data) : [];
				if (this.activeLibrary === 'favorites') this.favoriteCards = cards;
				else this.shroomCards = cards;
			} catch (error) {
				console.error('加载菇卡失败', error);
			} finally {
				this.loading = false;
			}
		},
		switchLibrary(library) {
			if (this.activeLibrary === library || this.loading) return;
			this.activeLibrary = library;
			this.currentCardIndex = 0;
			this.loadShroomCards();
		},
		onSwiperChange(e) {
			this.currentCardIndex = e.detail.current;
		},
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

.library-switch {
	display: flex;
	width: 100%;
	max-width: 520rpx;
	margin: -16rpx 0 28rpx;
	padding: 6rpx;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, .58);
}

.library-switch button {
	height: 64rpx;
	margin: 0;
	padding: 0 26rpx;
	border-radius: 999rpx;
	background: transparent;
	font-size: 22rpx;
	line-height: 64rpx;
	color: #69776b;
	flex: 1;
}

.library-switch button::after { border: 0; }
.library-switch button.active { background: #172019; color: #fff; }

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
</style>
