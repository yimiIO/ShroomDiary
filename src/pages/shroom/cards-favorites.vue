<template>
	<view class="favorites-page">
		<shroom-page-top-spacer />
		<view class="favorites-shell">
			<view class="favorites-nav"><button @tap="goBack" aria-label="返回菇卡">‹</button><text>我的收藏</text><view></view></view>
			<view class="favorites-heading"><text>想再回来的理解。</text><text v-if="hasLogin">{{ total }} 张收藏 · 仅自己可见</text></view>
			<view class="favorites-state" v-if="!hasLogin"><text>登录后查看你的收藏</text><button @tap="goLogin">去登录</button></view>
			<view class="favorites-state" v-else-if="loading && !cards.length"><text>正在取回收藏…</text></view>
			<view class="favorites-state" v-else-if="!cards.length && !loadError"><text>还没有收藏的菇卡</text><text>在发现页遇到想再看的理解，可以先收藏。</text><button @tap="openDiscover">去发现看看　→</button></view>
			<view class="favorites-list" v-if="hasLogin && cards.length">
				<view class="favorite-card" v-for="card in cards" :key="card.id" @tap="openCard(card)"><view class="favorite-meta"><text>{{ firstTag(card) }}</text><text>☆</text></view><text class="favorite-seed">{{ card.seedSentence || '暂无觉察句' }}</text><text class="favorite-understanding" v-if="card.myUnderstanding">{{ card.myUnderstanding }}</text><view class="favorite-footer"><text>查看菇卡</text><text>↗</text></view></view>
			</view>
			<view class="favorites-error" v-if="loadError" @tap="loadFavorites(retryReset)">{{ loadError }} · 点击重试</view>
			<button class="load-more" v-else-if="cards.length < total" :disabled="loading" @tap="loadFavorites(false)">{{ loading ? '正在加载…' : '继续看收藏' }}</button>
		</view>
	</view>
</template>

<script>
import { shroomCardFavorites } from '@/api/shroomCard';

export default {
	data() { return { cards: [], loading: false, loadError: '', page: 0, total: 0, requestNumber: 0, retryReset: true }; },
	computed: { hasLogin() { return this.$mStore.getters.hasLogin; } },
	onShow() { this.loadFavorites(true); },
	onPullDownRefresh() { this.loadFavorites(true).finally(() => uni.stopPullDownRefresh()); },
	onUnload() { this.requestNumber++; },
	methods: {
		async loadFavorites(reset = false) {
			if (!this.hasLogin) { this.requestNumber++; this.cards = []; this.page = 0; this.total = 0; this.loading = false; this.loadError = ''; return; }
			if (this.loading && !reset) return;
			const request = ++this.requestNumber;
			const page = reset ? 1 : this.page + 1;
			this.loading = true;
			this.retryReset = reset;
			this.loadError = '';
			try {
				const response = await this.$http.get(shroomCardFavorites, { page, pageSize: 20 });
				if (request !== this.requestNumber) return;
				if (!response || response.code !== 200 || !response.data || !Array.isArray(response.data.list)) throw new Error('读取失败');
				const list = response.data.list;
				this.cards = reset ? list : this.cards.concat(list.filter(item => !this.cards.some(card => card.id === item.id)));
				this.total = Number(response.data.total) || 0;
				this.page = page;
			} catch (error) { if (request === this.requestNumber) this.loadError = '收藏暂时未能读取，已有内容保留'; }
			finally { if (request === this.requestNumber) this.loading = false; }
		},
		firstTag(card) { return Array.isArray(card.tags) && card.tags.length ? card.tags[0] : '菇卡'; },
		openCard(card) { uni.navigateTo({ url: `/pages/common/cards/detail?id=${encodeURIComponent(card.id)}` }); },
		goBack() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/cards' }) }); },
		goLogin() { uni.navigateTo({ url: '/pages/public/login' }); },
		openDiscover() { uni.switchTab({ url: '/pages/shroom/discover' }); }
	}
};
</script>

<style scoped lang="scss">
.favorites-page { min-height: 100vh; background: #fffefa; color: #26352a; }
.favorites-shell { box-sizing: border-box; max-width: 750rpx; margin: 0 auto; padding: 18rpx 32rpx 80rpx; }
.favorites-nav { display: flex; align-items: center; justify-content: space-between; height: 76rpx; }
.favorites-nav button, .favorites-nav > view { width: 68rpx; height: 68rpx; }
.favorites-nav button { padding: 0; margin: 0; background: transparent; color: #26352a; font-size: 50rpx; line-height: 60rpx; }
button::after { border: 0; }
.favorites-nav > text { font-size: 29rpx; font-weight: 650; }
.favorites-heading { display: flex; flex-direction: column; gap: 12rpx; margin: 34rpx 0; }
.favorites-heading > text:first-child { font-size: 40rpx; font-weight: 700; line-height: 1.4; }
.favorites-heading > text:last-child { font-size: 23rpx; color: #859180; }
.favorites-list { display: flex; flex-direction: column; gap: 20rpx; }
.favorite-card { padding: 28rpx; border: 1rpx solid #e1e6d9; border-radius: 22rpx; background: #f5f6ed; }
.favorite-meta { display: flex; justify-content: space-between; align-items: center; font-size: 21rpx; color: #7e8f70; }
.favorite-meta > text:last-child { font-size: 31rpx; }
.favorite-seed { display: block; margin-top: 19rpx; font-size: 32rpx; font-weight: 650; line-height: 1.65; }
.favorite-understanding { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 3; -webkit-box-orient: vertical; margin-top: 16rpx; font-size: 24rpx; color: #7a8574; line-height: 1.7; }
.favorite-footer { display: flex; justify-content: space-between; margin-top: 24rpx; font-size: 21rpx; color: #86947b; }
.favorites-state { display: flex; flex-direction: column; align-items: center; gap: 18rpx; padding: 70rpx 15rpx; text-align: center; font-size: 27rpx; line-height: 1.7; }
.favorites-state > text + text { font-size: 23rpx; color: #859180; }
.favorites-state button { margin-top: 12rpx; padding: 0 30rpx; border-radius: 32rpx; background: #334b35; color: #fff; font-size: 25rpx; }
.favorites-error { padding: 35rpx 0; font-size: 23rpx; color: #9b755d; line-height: 1.6; text-align: center; }
.load-more { margin: 28rpx auto 0; background: transparent; color: #6b835e; font-size: 24rpx; }
</style>
