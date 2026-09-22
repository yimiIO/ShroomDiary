<template>
	<view class="select-page">
		<shroom-page-top-spacer />
		<view class="navbar">
			<text class="back" @tap="goBack">取消</text>
			<text class="nav-title">选择菇卡</text>
			<view class="nav-space"></view>
		</view>

		<view class="search-box">
			<text class="search-icon">⌕</text>
			<input v-model="keyword" placeholder="搜索觉察句或标签" placeholder-class="placeholder" />
		</view>

		<view class="card-list" v-if="filteredCards.length">
			<view class="card-row" v-for="card in filteredCards" :key="card.id" @tap="select(card)">
				<view class="card-mark">◇</view>
				<view class="card-copy">
					<text class="sentence">{{ card.seedSentence || '未命名觉察' }}</text>
				<view class="tags" v-if="card._tags.length">
					<text v-for="tag in card._tags" :key="tag">#{{ tag }}</text>
					</view>
				</view>
				<text class="arrow">›</text>
			</view>
		</view>

		<view class="state" v-else-if="loading">正在加载菇卡…</view>
		<view class="state" v-else>{{ keyword ? '没有找到匹配的菇卡' : '还没有可以关联的菇卡' }}</view>
	</view>
</template>

<script>
import { shroomCardList } from '@/api/shroomCard';

export default {
	data() {
		return {
			statusBarHeight: 0,
			keyword: '',
			cards: [],
			loading: true
		};
	},
	computed: {
		filteredCards() {
			const keyword = this.keyword.trim().toLowerCase();
			if (!keyword) return this.cards;
			return this.cards.filter(card => {
				const tags = Array.isArray(card.tags) ? card.tags.join(' ') : '';
				return `${card.seedSentence || ''} ${tags}`.toLowerCase().includes(keyword);
			});
		}
	},
	onLoad() {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
		this.loadCards();
	},
	methods: {
		async loadCards() {
			try {
				const res = await this.$http.get(shroomCardList, { page: 1, pageSize: 100 });
				const data = res && res.data;
				const cards = Array.isArray(data) ? data : (data && (data.list || data.data)) || [];
				this.cards = cards.map(card => Object.assign({}, card, {
					_tags: Array.isArray(card.tags) ? card.tags.slice(0, 3) : []
				}));
			} catch (error) {
				console.error('加载菇卡失败', error);
			} finally {
				this.loading = false;
			}
		},
		select(card) {
			this.getOpenerEventChannel().emit('selectCard', card);
			uni.navigateBack();
		},
		goBack() {
			uni.navigateBack();
		}
	}
};
</script>

<style lang="scss" scoped>
.select-page {
	display: block;
	min-height: 100vh;
	padding-bottom: 60rpx;
	background: #f1f8e9;
	color: #172019;
}

.status-bar { display: block; background: #f1f8e9; }

.navbar {
	display: flex;
	align-items: center;
	padding: 27rpx 36rpx;
}

.back,
.nav-space { width: 110rpx; }
.back { font-size: 25rpx; color: #667568; }
.nav-title { flex: 1; text-align: center; font-size: 30rpx; font-weight: 680; }

.search-box {
	display: flex;
	align-items: center;
	gap: 14rpx;
	margin: 16rpx 36rpx 30rpx;
	padding: 20rpx 24rpx;
	border-radius: 999rpx;
	background: #fff;
	box-shadow: 0 8rpx 30rpx rgba(58, 80, 60, .06);
}

.search-icon { font-size: 28rpx; color: #7b897d; }
.search-box input { flex: 1; font-size: 25rpx; }
.placeholder { color: #a0aaa2; }

.card-list {
	display: block;
	margin: 0 36rpx;
	padding: 2rpx 28rpx;
	border-radius: 34rpx;
	background: #fff;
	box-shadow: 0 18rpx 55rpx rgba(58, 80, 60, .07);
}

.card-row {
	display: flex;
	align-items: center;
	padding: 29rpx 0;
	border-bottom: 1rpx solid #edf0ec;
}

.card-row:last-child { border-bottom: 0; }
.card-mark { display: flex; align-items: center; justify-content: center; width: 64rpx; height: 64rpx; margin-right: 20rpx; border-radius: 20rpx; background: #e5efd9; color: #58705b; font-size: 28rpx; }
.card-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 11rpx; }
.sentence { font-size: 26rpx; font-weight: 630; line-height: 1.5; }
.tags { display: flex; flex-wrap: wrap; gap: 12rpx; font-size: 19rpx; color: #768379; }
.arrow { font-size: 40rpx; color: #9aa49c; }
.state { padding: 190rpx 40rpx; text-align: center; font-size: 24rpx; color: #77857a; }

/* #ifdef H5 */
@media (min-width: 900px) {
	.select-page { box-sizing: border-box; max-width: 820px; min-height: calc(100vh - 60px); margin: 30px auto; border-radius: 34px; }
	.card-list { margin-bottom: 55px; }
}
/* #endif */
</style>
