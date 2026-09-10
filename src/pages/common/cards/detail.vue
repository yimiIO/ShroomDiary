<template>
	<view class="card-detail-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="navbar">
			<button class="nav-back" @tap="goBack" aria-label="返回">‹</button>
			<text class="nav-title">{{ isOwner ? '我的菇卡' : '公开菇卡' }}</text>
			<button class="nav-edit" v-if="isOwner" @tap="editCard">编辑</button>
			<view class="nav-space" v-else></view>
		</view>

		<scroll-view class="content-scroll" scroll-y>
			<view class="loading-state" v-if="loading">
				<view class="loading-ring"></view>
				<text>正在打开这张菇卡…</text>
			</view>

			<view class="error-state" v-else-if="loadError">
				<text class="error-mark">!</text>
				<text class="error-title">这张菇卡暂时打不开</text>
				<text class="error-copy">它可能已被作者改为私密，也可能只是网络短暂中断。</text>
				<button class="retry-button" @tap="loadCardDetail(cardId)">重新加载</button>
			</view>

			<view class="detail-shell" v-else-if="cardData.id">
				<view class="card-hero">
					<view class="hero-meta">
						<view class="author-avatar">{{ authorInitial }}</view>
						<view class="author-copy">
							<text class="author-name">{{ authorName }}</text>
							<text class="publish-time">{{ visibilityLabel }} · {{ formatRelativeTime(cardData.createdAt) }}</text>
						</view>
					<text class="card-mark">SHROOM</text>
					</view>
					<text class="hero-kicker">{{ heroKicker }}</text>
					<text class="seed-sentence">{{ cardData.seedSentence }}</text>
					<view class="tag-row" v-if="cardTags.length">
						<text v-for="tag in cardTags" :key="tag">#{{ tag }}</text>
					</view>
				</view>

				<view class="source-note" v-if="isOwner && cardData.copiedFromId">
					<text class="source-note-title">来自一张公开菇卡</text>
					<text>这份副本保留原始来源；之后的修改、日记引用和练习只属于你。</text>
				</view>

				<view class="editorial-source" v-if="isEditorial">
					<view class="source-heading">
						<view>
							<text class="source-badge">{{ editorialSource.provenanceLabel }}</text>
							<text class="source-person">{{ editorialSource.personName }}<text v-if="editorialSource.personYears"> · {{ editorialSource.personYears }}</text></text>
						</view>
						<text class="source-verified">已核源</text>
					</view>
					<view class="source-field">
						<text>材料</text>
						<text>{{ editorialSource.workTitle }}</text>
					</view>
					<view class="source-field" v-if="editorialSource.locator">
						<text>位置</text>
						<text>{{ editorialSource.locator }}</text>
					</view>
					<text class="source-disclaimer">{{ editorialSource.editorialNote }}</text>
					<view class="source-footer">
						<text>{{ editorialSource.sourceInstitution }}</text>
						<button @tap="openEditorialSource">查看来源 ↗</button>
					</view>
				</view>

				<view class="content-section" v-if="cardData.myUnderstanding">
					<text class="section-index">01 / 理解</text>
					<text class="section-title">{{ understandingTitle }}</text>
					<text class="understanding-text">{{ cardData.myUnderstanding }}</text>
				</view>

				<view class="content-section" v-if="usageItems.length">
					<text class="section-index">02 / 使用</text>
					<text class="section-title">在相似时刻，可以怎样带着它</text>
					<view class="usage-list">
						<view class="usage-item" v-for="(item, index) in usageItems" :key="index">
							<text class="usage-number">{{ index + 1 }}</text>
							<text class="usage-text">{{ item }}</text>
						</view>
					</view>
				</view>

				<view class="privacy-boundary" v-if="!isOwner">
					<text class="boundary-title">公开边界</text>
					<text>{{ publicBoundaryCopy }}</text>
				</view>

				<view class="public-actions" v-if="!isOwner">
				<text class="section-index">回应这份理解</text>
					<view class="reaction-grid">
						<button class="reaction-button" :class="{ active: viewerState.resonated }" :disabled="actionBusy" @tap="toggleResonance">
							<text class="reaction-symbol">{{ viewerState.resonated ? '♥' : '♡' }}</text>
							<text>{{ viewerState.resonated ? '已共鸣' : '共鸣' }}</text>
							<text class="reaction-count">{{ stats.resonanceCount }}</text>
						</button>
						<button class="reaction-button" :class="{ active: viewerState.favorited }" :disabled="actionBusy" @tap="toggleFavorite">
							<text class="reaction-symbol">{{ viewerState.favorited ? '◆' : '◇' }}</text>
							<text>{{ viewerState.favorited ? '已收藏' : '收藏' }}</text>
							<text class="reaction-count">{{ stats.favoriteCount }}</text>
						</button>
					</view>

					<button class="copy-button" :disabled="actionBusy" @tap="copyPublicCard(false)">
					{{ viewerState.copiedCardId ? '已引用 · 查看我的副本' : '引用到我的菇卡' }}
					</button>
					<button class="practice-button" :disabled="actionBusy" @tap="practicePublicCard">
					{{ viewerState.copiedCardId ? '用我的副本开始练习' : '引用并开始练习' }}
				</button>
				<text class="copy-explanation">引用会保存一份私密副本并保留来源。你可以修改自己的理解，也可以把它关联到日记；原作者的卡不会被改动。</text>
				</view>

				<view class="owner-actions" v-if="isOwner">
					<button class="owner-primary" @tap="addPractice">记录一次练习</button>
					<button class="owner-secondary" @tap="writeDiaryWithCard">写日记并引用这张卡</button>
				</view>

				<view class="practice-section" v-if="isOwner">
					<view class="practice-heading">
						<view>
							<text class="section-index">03 / 使用记录</text>
							<text class="section-title">我在哪些真实时刻用过它</text>
						</view>
						<text class="practice-total">{{ practiceCases.length }}</text>
					</view>
					<view class="practice-list" v-if="practiceCases.length">
						<view class="practice-item" v-for="practice in practiceCases" :key="practice.id">
							<text class="practice-time">{{ formatTime(practice.createdAt) }}</text>
							<text class="practice-context">{{ practice.context }}</text>
							<view class="practice-field" v-if="practice.action"><text>我怎么做</text><text>{{ practice.action }}</text></view>
							<view class="practice-field" v-if="practice.feeling"><text>我的感受</text><text>{{ practice.feeling }}</text></view>
							<view class="practice-field" v-if="practice.result"><text>发生了什么</text><text>{{ practice.result }}</text></view>
							<view class="practice-field" v-if="practice.reflection"><text>这次学到</text><text>{{ practice.reflection }}</text></view>
						</view>
					</view>
					<view class="practice-empty" v-else>
						<text>还没有使用记录。</text>
						<text>练习不是打卡，而是记录这份理解在真实生活里是否真的有用。</text>
					</view>
				</view>

				<view class="stats-strip">
					<view v-if="isOwner"><text>{{ stats.practiceCount }}</text><text>次练习</text></view>
					<view><text>{{ stats.resonanceCount }}</text><text>份共鸣</text></view>
					<view><text>{{ stats.favoriteCount }}</text><text>人收藏</text></view>
					<view><text>{{ stats.quoteCount }}</text><text>次引用</text></view>
				</view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import {
	shroomCardCopy,
	shroomCardDetail,
	shroomCardFavorite,
	shroomCardResonate,
	shroomCardUnfavorite,
	shroomCardUnresonate
} from '@/api/shroomCard';

export default {
	data() {
		return {
			statusBarHeight: 0,
			cardId: '',
			cardData: {},
			loading: true,
			loadError: false,
			actionBusy: false,
			hasLoadedOnce: false
		};
	},
	computed: {
		editorialSource() {
			return this.cardData && this.cardData.editorialSource ? this.cardData.editorialSource : {};
		},
		isEditorial() {
			return Boolean(this.editorialSource && this.editorialSource.personName);
		},
		isOwner() {
			return Boolean(this.cardData && this.cardData.isOwner);
		},
		viewerState() {
			return Object.assign({ resonated: false, favorited: false, copiedCardId: null }, this.cardData.viewerState || {});
		},
		stats() {
			return Object.assign({ practiceCount: 0, resonanceCount: 0, favoriteCount: 0, quoteCount: 0 }, this.cardData.stats || {});
		},
		usageItems() {
			return Array.isArray(this.cardData.usageItems) ? this.cardData.usageItems : [];
		},
		practiceCases() {
			return Array.isArray(this.cardData.practiceCases) ? this.cardData.practiceCases : [];
		},
		cardTags() {
			return Array.isArray(this.cardData.tags) ? this.cardData.tags.slice(0, 4) : [];
		},
		authorName() {
			if (this.isOwner) return '我的理解';
			if (this.cardData.visibility === 'PUBLIC_ANON') return '匿名记录者';
			return (this.cardData.author && this.cardData.author.nickname) || '一位记录者';
		},
		authorInitial() {
			return this.authorName.slice(0, 1);
		},
		visibilityLabel() {
			if (this.cardData.visibility === 'PRIVATE') return '仅自己可见';
			if (this.cardData.visibility === 'PUBLIC_ANON') return '匿名公开';
			return '公开署名';
		},
		heroKicker() {
			return '带到下一次相似时刻';
		},
		understandingTitle() {
			return '这份理解意味着什么';
		},
		publicBoundaryCopy() {
			if (this.isEditorial) return '这是基于人物真实记录建立的只读人物档案。卡片与其他公开菇卡使用同一套功能，同时保留材料来源与 Shroom 转译说明，不把现代改写冒充人物原话。';
			return '公开的是觉察句、理解与使用提示。原始日记、练习记录、关联内容始终不会在这里公开。';
		}
	},
	onLoad(options) {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
		this.cardId = options && options.id ? String(options.id) : '';
		if (this.cardId) this.loadCardDetail(this.cardId);
		else {
			this.loading = false;
			this.loadError = true;
		}
	},
	onShow() {
		if (this.cardId && this.hasLoadedOnce) this.loadCardDetail(this.cardId, false);
	},
	methods: {
		async loadCardDetail(id, showLoading = true) {
			if (showLoading) this.loading = true;
			this.loadError = false;
			try {
				const res = await this.$http.get(shroomCardDetail, { id });
				if (!res || res.code !== 200 || !res.data) throw new Error((res && res.message) || '加载失败');
				this.cardData = res.data;
				this.hasLoadedOnce = true;
			} catch (error) {
				console.error('加载菇卡详情失败', error);
				this.loadError = !this.cardData.id;
			} finally {
				this.loading = false;
			}
		},
		goBack() {
			uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/discover' }) });
		},
		requireLogin() {
			if (this.$mStore.getters.hasLogin) return true;
			uni.showModal({
				title: '登录后回应',
				content: '共鸣、收藏和引用都只会保存到你的 Shroom 空间。',
				confirmText: '去登录',
				success: result => {
					if (result.confirm) uni.navigateTo({ url: '/pages/public/login' });
				}
			});
			return false;
		},
		setViewerState(change) {
			this.$set(this.cardData, 'viewerState', Object.assign({}, this.viewerState, change));
		},
		setStats(change) {
			this.$set(this.cardData, 'stats', Object.assign({}, this.stats, change));
		},
		async toggleResonance() {
			if (!this.requireLogin() || this.actionBusy) return;
			this.actionBusy = true;
			const wasResonated = this.viewerState.resonated;
			try {
				const endpoint = wasResonated ? shroomCardUnresonate : shroomCardResonate;
				const res = await this.$http.post(endpoint, { id: this.cardId });
				const count = res && res.data && Number(res.data.resonanceCount);
				this.setViewerState({ resonated: !wasResonated });
				this.setStats({ resonanceCount: Number.isFinite(count) ? count : Math.max(0, this.stats.resonanceCount + (wasResonated ? -1 : 1)) });
			} catch (error) {
				console.error('更新共鸣失败', error);
			} finally {
				this.actionBusy = false;
			}
		},
		async toggleFavorite() {
			if (!this.requireLogin() || this.actionBusy) return;
			this.actionBusy = true;
			const wasFavorited = this.viewerState.favorited;
			try {
				const endpoint = wasFavorited ? shroomCardUnfavorite : shroomCardFavorite;
				const res = await this.$http.post(endpoint, { id: this.cardId });
				const count = res && res.data && Number(res.data.favoriteCount);
				this.setViewerState({ favorited: !wasFavorited });
				this.setStats({ favoriteCount: Number.isFinite(count) ? count : Math.max(0, this.stats.favoriteCount + (wasFavorited ? -1 : 1)) });
			} catch (error) {
				console.error('更新收藏失败', error);
			} finally {
				this.actionBusy = false;
			}
		},
		async ensurePrivateCopy() {
			if (this.viewerState.copiedCardId) return this.viewerState.copiedCardId;
			const res = await this.$http.post(shroomCardCopy, { id: this.cardId });
			if (!res || res.code !== 200 || !res.data || !res.data.id) throw new Error((res && res.message) || '引用失败');
			this.setViewerState({ copiedCardId: res.data.id });
			this.setStats({ quoteCount: this.stats.quoteCount + 1 });
			return res.data.id;
		},
		async copyPublicCard() {
			if (!this.requireLogin() || this.actionBusy) return;
			if (this.viewerState.copiedCardId) {
				uni.navigateTo({ url: `/pages/common/cards/detail?id=${this.viewerState.copiedCardId}` });
				return;
			}
			this.actionBusy = true;
			try {
				await this.ensurePrivateCopy();
				uni.showToast({ title: '已引用为私密菇卡', icon: 'success' });
			} catch (error) {
				console.error('引用公开菇卡失败', error);
				uni.showToast({ title: '引用失败，请稍后再试', icon: 'none' });
			} finally {
				this.actionBusy = false;
			}
		},
		async practicePublicCard() {
			if (!this.requireLogin() || this.actionBusy) return;
			this.actionBusy = true;
			try {
				const copyId = await this.ensurePrivateCopy();
				uni.navigateTo({ url: `/pages/common/cards/practice?cardId=${copyId}` });
			} catch (error) {
				console.error('开始公开菇卡练习失败', error);
				uni.showToast({ title: '暂时无法开始练习', icon: 'none' });
			} finally {
				this.actionBusy = false;
			}
		},
		editCard() {
			uni.navigateTo({ url: `/pages/common/cards/edit?id=${this.cardId}` });
		},
		addPractice() {
			uni.navigateTo({ url: `/pages/common/cards/practice?cardId=${this.cardId}` });
		},
		writeDiaryWithCard() {
			uni.navigateTo({ url: `/pages/diary/edit?cardId=${this.cardId}` });
		},
		openEditorialSource() {
			const url = this.editorialSource && this.editorialSource.sourceUrl;
			if (!url) return;
			// #ifdef H5
			window.open(url, '_blank', 'noopener,noreferrer');
			return;
			// #endif
			// #ifdef APP-PLUS
			plus.runtime.openURL(url);
			return;
			// #endif
			// #ifndef H5
			uni.setClipboardData({ data: url, success: () => uni.showToast({ title: '来源链接已复制', icon: 'none' }) });
			// #endif
		},
		formatTime(time) {
			return time ? moment(time).format('YYYY年M月D日 HH:mm') : '';
		},
		formatRelativeTime(time) {
			return time ? moment(time).fromNow() : '刚刚';
		}
	}
};
</script>

<style lang="scss" scoped>
.card-detail-page {
	min-height: 100vh;
	background: #f1f8e9;
	color: #172019;
}

.status-bar { background: #f1f8e9; }

.navbar {
	display: flex;
	align-items: center;
	padding: 20rpx 30rpx 22rpx;
	background: rgba(241, 248, 233, .96);
}

.nav-back,
.nav-edit {
	display: flex;
	align-items: center;
	width: 96rpx;
	height: 64rpx;
	margin: 0;
	padding: 0;
	border: 0;
	background: transparent;
	color: #263329;
}

.nav-back { justify-content: flex-start; font-size: 54rpx; font-weight: 300; line-height: 1; }
.nav-edit { justify-content: flex-end; font-size: 24rpx; font-weight: 650; }
.nav-back::after,
.nav-edit::after,
.reaction-button::after,
.copy-button::after,
.practice-button::after,
.owner-primary::after,
.owner-secondary::after,
.source-footer button::after,
.retry-button::after { border: 0; }
.nav-title { flex: 1; text-align: center; font-size: 28rpx; font-weight: 700; }
.nav-space { width: 96rpx; }

.content-scroll { height: calc(100vh - 108rpx); }

.detail-shell {
	box-sizing: border-box;
	max-width: 900rpx;
	margin: 0 auto;
	padding: 18rpx 34rpx 150rpx;
}

.card-hero {
	box-sizing: border-box;
	padding: 38rpx 36rpx 42rpx;
	border-radius: 40rpx;
	background: #172019;
	color: #fff;
	box-shadow: 0 26rpx 70rpx rgba(23, 32, 25, .18);
}

.hero-meta { display: flex; align-items: center; }
.author-avatar { display: flex; align-items: center; justify-content: center; width: 64rpx; height: 64rpx; margin-right: 16rpx; border-radius: 50%; background: #ddec8c; color: #172019; font-size: 24rpx; font-weight: 800; }
.author-copy { display: flex; flex-direction: column; gap: 4rpx; min-width: 0; flex: 1; }
.author-name { font-size: 24rpx; font-weight: 680; }
.publish-time { font-size: 19rpx; color: rgba(255, 255, 255, .52); }
.card-mark { font-size: 17rpx; font-weight: 800; letter-spacing: 3rpx; color: rgba(255, 255, 255, .35); }
.hero-kicker { display: block; margin-top: 56rpx; font-size: 18rpx; font-weight: 700; letter-spacing: 2rpx; color: #b6c8ae; }
.seed-sentence { display: block; margin-top: 17rpx; font-size: 42rpx; font-weight: 730; line-height: 1.52; letter-spacing: -1rpx; word-break: break-word; overflow-wrap: anywhere; }
.tag-row { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 32rpx; }
.tag-row text { padding: 8rpx 14rpx; border: 1rpx solid rgba(255, 255, 255, .13); border-radius: 999rpx; font-size: 18rpx; color: rgba(255, 255, 255, .62); }

.source-note,
.privacy-boundary {
	display: flex;
	flex-direction: column;
	gap: 8rpx;
	margin-top: 24rpx;
	padding: 24rpx 26rpx;
	border-radius: 25rpx;
	font-size: 21rpx;
	line-height: 1.65;
}
.source-note { background: #e7efdc; color: #5d6e5e; }
.source-note-title,
.boundary-title { font-size: 20rpx; font-weight: 750; letter-spacing: 1rpx; color: #344638; }

.editorial-source {
	box-sizing: border-box;
	margin-top: 24rpx;
	padding: 29rpx 29rpx 27rpx;
	border: 1rpx solid rgba(85, 82, 50, .12);
	border-radius: 30rpx;
	background: linear-gradient(145deg, #f7f1d8 0%, #eaefd5 100%);
}

.source-heading,
.source-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 20rpx;
}

.source-heading > view {
	display: flex;
	align-items: flex-start;
	flex-direction: column;
	gap: 12rpx;
	min-width: 0;
}

.source-badge {
	padding: 7rpx 12rpx;
	border-radius: 999rpx;
	background: #24362b;
	font-size: 17rpx;
	font-weight: 800;
	letter-spacing: 1rpx;
	color: #e7efc1;
}

.source-person {
	font-size: 28rpx;
	font-weight: 740;
	line-height: 1.4;
	color: #29362d;
}

.source-person text { font-size: 19rpx; font-weight: 500; color: #77806c; }

.source-verified {
	flex-shrink: 0;
	font-size: 18rpx;
	font-weight: 700;
	color: #78825e;
}

.source-field {
	display: flex;
	align-items: flex-start;
	gap: 12rpx;
	margin-top: 20rpx;
	font-size: 21rpx;
	line-height: 1.65;
}

.source-field > text:first-child { width: 82rpx; flex-shrink: 0; color: #8a8c73; }
.source-field > text:last-child { min-width: 0; flex: 1; color: #3f4a41; word-break: break-word; overflow-wrap: anywhere; }

.source-disclaimer {
	display: block;
	margin-top: 22rpx;
	padding-top: 20rpx;
	border-top: 1rpx solid rgba(75, 75, 49, .1);
	font-size: 21rpx;
	line-height: 1.7;
	color: #616956;
}

.source-footer {
	align-items: flex-end;
	margin-top: 22rpx;
}

.source-footer > text {
	min-width: 0;
	font-size: 18rpx;
	line-height: 1.55;
	color: #858a73;
	flex: 1;
}

.source-footer button {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	height: 62rpx;
	margin: 0;
	padding: 0 19rpx;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, .65);
	font-size: 19rpx;
	font-weight: 700;
	line-height: 1;
	color: #344238;
}

.content-section,
.practice-section,
.public-actions {
	margin-top: 28rpx;
	padding: 34rpx;
	border-radius: 34rpx;
	background: rgba(255, 255, 255, .9);
	box-shadow: 0 16rpx 52rpx rgba(58, 80, 60, .065);
}
.section-index { display: block; font-size: 18rpx; font-weight: 750; letter-spacing: 2rpx; color: #718374; }
.section-title { display: block; margin-top: 12rpx; font-size: 29rpx; font-weight: 710; line-height: 1.45; }
.understanding-text { display: block; margin-top: 23rpx; font-size: 26rpx; line-height: 1.85; color: #536157; word-break: break-word; overflow-wrap: anywhere; }
.usage-list { display: flex; flex-direction: column; gap: 16rpx; margin-top: 25rpx; }
.usage-item { display: flex; align-items: flex-start; gap: 16rpx; padding: 20rpx; border-radius: 22rpx; background: #f5f2e5; }
.usage-number { display: flex; align-items: center; justify-content: center; width: 40rpx; height: 40rpx; border-radius: 50%; background: #d9cf93; color: #403d2b; font-size: 19rpx; font-weight: 800; flex-shrink: 0; }
.usage-text { min-width: 0; flex: 1; padding-top: 2rpx; font-size: 24rpx; line-height: 1.7; color: #4e4b3c; word-break: break-word; overflow-wrap: anywhere; }

.privacy-boundary { background: transparent; border: 1rpx solid rgba(23, 32, 25, .12); color: #637166; }
.reaction-grid { display: flex; gap: 14rpx; margin-top: 24rpx; }
.reaction-button { display: flex; align-items: center; justify-content: center; gap: 8rpx; min-width: 0; height: 86rpx; margin: 0; padding: 0 18rpx; border: 1rpx solid rgba(23, 32, 25, .1); border-radius: 24rpx; background: #f5f8f1; color: #526056; font-size: 23rpx; line-height: 1; flex: 1; }
.reaction-button.active { border-color: #a97970; background: #f2e4de; color: #7e4a45; }
.reaction-symbol { font-size: 29rpx; }
.reaction-count { color: #8b978e; }
.copy-button,
.practice-button,
.owner-primary,
.owner-secondary,
.retry-button { display: flex; align-items: center; justify-content: center; box-sizing: border-box; margin: 14rpx 0 0; border-radius: 999rpx; font-size: 24rpx; font-weight: 700; line-height: 1.2; }
.copy-button { height: 90rpx; margin-top: 22rpx; background: #172019; color: #fff; }
.practice-button { height: 84rpx; border: 1rpx solid #172019; background: transparent; color: #172019; }
.copy-explanation { display: block; margin-top: 20rpx; font-size: 20rpx; line-height: 1.65; color: #77837a; }

.owner-actions { display: flex; gap: 14rpx; margin-top: 28rpx; }
.owner-primary,
.owner-secondary { min-width: 0; height: 86rpx; margin: 0; flex: 1; }
.owner-primary { background: #172019; color: #fff; }
.owner-secondary { border: 1rpx solid rgba(23, 32, 25, .18); background: rgba(255, 255, 255, .6); color: #172019; }

.practice-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }
.practice-total { display: flex; align-items: center; justify-content: center; width: 58rpx; height: 58rpx; border-radius: 50%; background: #e3ecd9; font-size: 22rpx; font-weight: 800; }
.practice-list { display: flex; flex-direction: column; gap: 18rpx; margin-top: 28rpx; }
.practice-item { padding: 24rpx; border-radius: 24rpx; background: #f6f8f3; }
.practice-time { display: block; font-size: 19rpx; color: #88938b; }
.practice-context { display: block; margin-top: 10rpx; font-size: 26rpx; font-weight: 680; line-height: 1.55; }
.practice-field { display: flex; gap: 12rpx; margin-top: 18rpx; font-size: 22rpx; line-height: 1.65; color: #536157; }
.practice-field text:first-child { width: 120rpx; font-weight: 700; color: #738077; flex-shrink: 0; }
.practice-field text:last-child { min-width: 0; flex: 1; }
.practice-empty { display: flex; flex-direction: column; gap: 8rpx; margin-top: 26rpx; padding: 24rpx; border-radius: 22rpx; background: #f6f8f3; font-size: 22rpx; line-height: 1.65; color: #768278; }

.stats-strip { display: flex; justify-content: space-around; gap: 12rpx; margin-top: 28rpx; padding: 27rpx 18rpx; border-top: 1rpx solid rgba(23, 32, 25, .1); }
.stats-strip view { display: flex; align-items: baseline; gap: 6rpx; color: #77837a; }
.stats-strip view text:first-child { font-size: 29rpx; font-weight: 760; color: #172019; }
.stats-strip view text:last-child { font-size: 18rpx; }

.loading-state,
.error-state { display: flex; align-items: center; justify-content: center; flex-direction: column; min-height: 680rpx; padding: 50rpx; text-align: center; color: #758278; }
.loading-ring { width: 44rpx; height: 44rpx; margin-bottom: 22rpx; border: 4rpx solid rgba(91, 122, 91, .2); border-top-color: #668166; border-radius: 50%; animation: spin .8s linear infinite; }
.error-mark { font-size: 70rpx; color: #7f9c7c; }
.error-title { margin-top: 18rpx; font-size: 30rpx; font-weight: 700; color: #172019; }
.error-copy { max-width: 500rpx; margin-top: 14rpx; font-size: 22rpx; line-height: 1.7; }
.retry-button { height: 76rpx; margin-top: 28rpx; padding: 0 30rpx; background: #172019; color: #fff; }

@keyframes spin { to { transform: rotate(360deg); } }

/* #ifdef H5 */
@media (min-width: 900px) {
	.content-scroll { height: calc(100vh - 76px); }
	.detail-shell { max-width: 820px; padding: 20px 34px 90px; }
	.card-hero { padding: 36px 42px 40px; border-radius: 30px; }
	.seed-sentence { max-width: 680px; font-size: 34px; }
	.content-section,
	.practice-section,
	.public-actions { padding: 30px 34px; border-radius: 26px; }
}
/* #endif */
</style>
