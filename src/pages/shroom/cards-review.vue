<template>
	<view class="review-page">
		<shroom-page-top-spacer />
		<view class="review-nav">
			<button class="close-button" @tap="goBack" aria-label="关闭">×</button>
			<view class="review-progress">
				<text>{{ progressLabel }} <text v-if="previewMode" class="preview-badge">示例预览</text></text>
				<view class="progress-track"><view :style="{ width: progressPercent + '%' }"></view></view>
			</view>
			<view class="nav-space"></view>
		</view>

		<view class="loading" v-if="loading"><view class="loading-ring"></view><text>正在取回今天的菇卡…</text></view>

		<view class="complete-state" v-else-if="completed || !currentCard">
			<image src="/static/images/shroom-card-mascot-v2.webp" mode="widthFix" />
			<text class="complete-title">今天先到这里。</text>
			<text class="complete-copy">回看不是打卡。真正重要的是，在相似时刻还能想起并使用这些理解。</text>
			<button @tap="goBack">返回菇卡</button>
		</view>

		<view class="review-shell" v-else>
			<view class="review-card">
				<text class="topic-pill">{{ topicLabel }}</text>
				<text class="seed-sentence">{{ currentCard.seedSentence }}</text>
				<text class="understanding" v-if="currentCard.myUnderstanding">{{ currentCard.myUnderstanding }}</text>
				<text class="hand-note">慢一点，<br>会更清楚。♡</text>
				<image class="card-mascot" src="/static/images/shroom-card-mascot-v2.webp" mode="widthFix" />
			</view>

			<view class="review-actions">
				<text class="action-question">这张卡对你目前有帮助吗？</text>
				<view class="feedback-row">
					<view class="feedback-option" :class="{ selected: feedback === 'helpful' }" @tap="feedback = 'helpful'"><text class="face helpful">☻</text><text>有帮助</text></view>
					<view class="feedback-option" :class="{ selected: feedback === 'neutral' }" @tap="feedback = 'neutral'"><text class="face neutral">●</text><text>一般</text></view>
					<view class="feedback-option" :class="{ selected: feedback === 'not-helpful' }" @tap="feedback = 'not-helpful'"><text class="face not-helpful">☹</text><text>没帮助</text></view>
				</view>
				<button class="next-button" :disabled="saving" @tap="markReviewed">{{ saving ? '正在保存…' : '下一张 →' }}</button>
				<button class="skip-button" @tap="skipCard">稍后再看</button>
				<button class="detail-button" @tap="openDetail">查看完整菇卡</button>
			</view>
		</view>
	</view>
</template>

<script>
import { shroomCardList, shroomCardReview } from '@/api/shroomCard';
import { previewReviewCards } from '@/utils/shroom-card-preview';

export default {
	data() {
		return { cards: [], currentIndex: 0, loading: true, saving: false, completed: false, feedback: '', previewMode: false };
	},
	computed: {
		currentCard() { return this.cards[this.currentIndex] || null; },
		progressLabel() { return this.cards.length ? `${Math.min(this.currentIndex + 1, this.cards.length)} / ${this.cards.length}` : '0 / 0'; },
		progressPercent() { return this.cards.length ? Math.min(100, ((this.currentIndex + 1) / this.cards.length) * 100) : 0; },
		usageItems() { return this.currentCard && Array.isArray(this.currentCard.usageItems) ? this.currentCard.usageItems.slice(0, 3) : []; },
		topicLabel() { return this.currentCard && this.currentCard.tags && this.currentCard.tags[0] ? this.currentCard.tags[0] : '给未来的提醒'; }
	},
	onLoad(options) { this.previewMode = Boolean(options && options.preview === '1'); if (this.previewMode) { this.cards = previewReviewCards; this.loading = false; } else this.loadCards(); },
	onShow() { uni.hideTabBar({ animation: false }); },
	onUnload() { uni.showTabBar({ animation: false }); },
	methods: {
		async loadCards() {
			this.loading = true;
			try {
				const res = await this.$http.get(shroomCardList, { page: 1, pageSize: 100 });
				const list = res && res.code === 200 && res.data && Array.isArray(res.data.list) ? res.data.list : [];
				this.cards = list.filter(card => !card.lastReviewedAt || Date.now() - new Date(card.lastReviewedAt).getTime() >= 86400000).sort((a, b) => {
					if (!a.lastReviewedAt && b.lastReviewedAt) return -1;
					if (a.lastReviewedAt && !b.lastReviewedAt) return 1;
					return new Date(a.lastReviewedAt || a.createdAt || 0) - new Date(b.lastReviewedAt || b.createdAt || 0);
				}).slice(0, 3);
			} catch (error) {
				console.error('加载复习菇卡失败', error);
				uni.showToast({ title: '暂时无法开始复习', icon: 'none' });
			} finally { this.loading = false; }
		},
		advance() {
			this.feedback = '';
			if (this.currentIndex >= this.cards.length - 1) this.completed = true;
			else this.currentIndex += 1;
		},
		async markReviewed() {
			if (!this.currentCard || this.saving) return;
			if (this.previewMode) { this.advance(); return; }
			this.saving = true;
			try {
				await this.$http.post(`${shroomCardReview}?id=${this.currentCard.id}`, {});
				this.advance();
			} catch (error) {
				console.error('保存复习状态失败', error);
				uni.showToast({ title: '保存失败，请重试', icon: 'none' });
			} finally { this.saving = false; }
		},
		skipCard() { this.advance(); },
		openDetail() { if (this.currentCard) uni.navigateTo({ url: this.previewMode ? '/pages/common/cards/detail?preview=1' : `/pages/common/cards/detail?id=${this.currentCard.id}` }); },
		goBack() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/cards' }) }); }
	}
};
</script>

<style scoped lang="scss">
.review-page { min-height: 100vh; background: #fbfaf5; color: #171b1e; }
.review-nav { display: flex; align-items: center; gap: 24rpx; padding: 14rpx 30rpx 24rpx; }
.close-button, .nav-space { width: 68rpx; flex-shrink: 0; }
.close-button { height: 68rpx; margin: 0; padding: 0; border-radius: 50%; background: #fff; font-size: 42rpx; font-weight: 300; line-height: 64rpx; color: #20262b; box-shadow: 0 8rpx 24rpx rgba(41, 47, 39, .06); }
.close-button::after, .next-button::after, .detail-button::after, .skip-button::after, .complete-state button::after { border: 0; }
.review-progress { display: flex; align-items: center; gap: 18rpx; flex: 1; font-size: 21rpx; font-weight: 720; }
.progress-track { height: 6rpx; overflow: hidden; border-radius: 99rpx; background: #dedfd9; flex: 1; }
.progress-track view { height: 100%; border-radius: inherit; background: #6da04e; transition: width .25s ease; }
.loading, .complete-state { display: flex; min-height: 720rpx; align-items: center; justify-content: center; flex-direction: column; text-align: center; }
.loading { gap: 20rpx; color: #7c837e; font-size: 22rpx; }
.loading-ring { width: 42rpx; height: 42rpx; border: 4rpx solid #dde3d7; border-top-color: #6da04e; border-radius: 50%; animation: spin .8s linear infinite; }
.review-shell { box-sizing: border-box; max-width: 760rpx; margin: 0 auto; padding: 10rpx 28rpx 90rpx; }
.review-card { position: relative; box-sizing: border-box; min-height: 790rpx; overflow: hidden; padding: 45rpx 38rpx 300rpx; border: 1rpx solid #e1e3da; border-radius: 38rpx; background: linear-gradient(160deg, #fff 0%, #fbfaf5 62%, #edf2e4 100%); box-shadow: 0 24rpx 70rpx rgba(46, 57, 43, .1); }
.topic-pill { display: inline-flex; width: fit-content; padding: 9rpx 16rpx; border-radius: 999rpx; background: #e5efd9; font-size: 19rpx; font-weight: 690; color: #5d7a4c; }
.seed-sentence { display: block; margin-top: 37rpx; font-size: 43rpx; font-weight: 780; line-height: 1.52; letter-spacing: -1rpx; }
.understanding { display: block; margin-top: 22rpx; font-size: 25rpx; line-height: 1.72; color: #606964; }
.usage-list { display: flex; margin-top: 30rpx; flex-direction: column; gap: 14rpx; }
.usage-title { margin-bottom: 3rpx; font-size: 19rpx; font-weight: 720; color: #738078; }
.usage-list view { display: flex; gap: 13rpx; font-size: 22rpx; line-height: 1.55; color: #4e5852; }
.dot { width: 9rpx; height: 9rpx; margin-top: 13rpx; border-radius: 50%; background: #6da04e; flex-shrink: 0; }
.card-mascot { position: absolute; right: -45rpx; bottom: -28rpx; width: 480rpx; opacity: .96; }
.review-actions { display: flex; align-items: center; flex-direction: column; padding: 34rpx 4rpx 0; }
.action-question { font-size: 24rpx; font-weight: 680; }
.next-button, .detail-button { display: flex; width: 100%; height: 88rpx; align-items: center; justify-content: center; margin: 26rpx 0 0; border-radius: 25rpx; font-size: 24rpx; font-weight: 720; }
.next-button { background: #192027; color: #fff; }
.detail-button { margin-top: 14rpx; border: 1rpx solid #dcded6; background: #fff; color: #28312c; }
.skip-button { margin-top: 8rpx; background: transparent; color: #858b87; font-size: 21rpx; }
.complete-state { box-sizing: border-box; padding: 40rpx; }
.complete-state image { width: 430rpx; }
.complete-title { margin-top: -12rpx; font-size: 42rpx; font-weight: 780; }
.complete-copy { max-width: 560rpx; margin-top: 18rpx; font-size: 23rpx; line-height: 1.75; color: #727a75; }
.complete-state button { width: 360rpx; height: 82rpx; margin-top: 34rpx; border-radius: 999rpx; background: #192027; color: #fff; font-size: 23rpx; }
@keyframes spin { to { transform: rotate(360deg); } }
.review-page { background: #fffefa; }
.review-nav { height: 75rpx; box-sizing: border-box; padding: 9rpx 24rpx 15rpx; }
.close-button { width: 54rpx; height: 54rpx; line-height: 50rpx; font-size: 38rpx; }
.review-progress { flex-direction: column; gap: 8rpx; align-items: center; font-size: 22rpx; font-weight: 600; }
.progress-track { width: 100%; max-width: 290rpx; height: 5rpx; flex: none; }
.review-shell { padding: 7rpx 25rpx 110rpx; }
.review-card { min-height: 585rpx; padding: 22rpx 25rpx 215rpx; border-radius: 21rpx; background: #fff; box-shadow: 0 5rpx 22rpx rgba(36,43,31,.07); }
.topic-pill { padding: 7rpx 16rpx; font-size: 19rpx; color: #526a41; }
.seed-sentence { margin-top: 23rpx; font-size: 40rpx; font-weight: 800; line-height: 1.49; }
.understanding { margin-top: 16rpx; font-size: 25rpx; line-height: 1.56; color: #6b737b; }
.hand-note { position: absolute; z-index: 2; right: 27rpx; bottom: 150rpx; transform: rotate(-11deg); font-size: 20rpx; line-height: 1.5; }
.card-mascot { left: 50%; right: auto; bottom: -35rpx; width: 520rpx; transform: translateX(-50%); }
.review-actions { padding: 21rpx 0 0; }.action-question { font-size: 24rpx; font-weight: 700; }
.feedback-row { display: flex; width: 100%; gap: 12rpx; margin-top: 20rpx; }
.feedback-option { display: flex; min-width: 0; height: 106rpx; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 6rpx; border: 1rpx solid #e4e8e0; border-radius: 18rpx; background: #fff; box-shadow: 0 8rpx 20rpx rgba(35,42,35,.045); font-size: 19rpx; }
.feedback-option.selected { border-color: #6b9b57; background: #f4f8ed; }.face { display: flex; width: 40rpx; height: 40rpx; align-items: center; justify-content: center; border: 2rpx solid #1c2227; border-radius: 50%; font-size: 32rpx; line-height: 1; color: #1c2227; }.face.helpful { background: #a9df80; }.face.neutral { background: #ffcf77; font-size: 12rpx; }.face.not-helpful { background: #fa8175; }
.preview-badge { margin-left: 12rpx; font-size: 17rpx; font-weight: 450; color: #8d9691; }
@media (max-width: 750px) {
	.review-nav { height: 105rpx; padding: 15rpx 27rpx 22rpx; }.close-button { width: 65rpx; height: 65rpx; font-size: 46rpx; line-height: 60rpx; }.review-progress { font-size: 27rpx; }
	.review-shell { padding: 10rpx 27rpx 130rpx; }.review-card { min-height: 760rpx; padding: 31rpx 29rpx 300rpx; border-radius: 23rpx; }.topic-pill { font-size: 23rpx; }.seed-sentence { margin-top: 30rpx; font-size: 51rpx; }.understanding { font-size: 32rpx; }.card-mascot { width: 600rpx; bottom: -38rpx; }.hand-note { bottom: 206rpx; font-size: 24rpx; }
	.review-actions { padding-top: 25rpx; }.action-question { font-size: 30rpx; }.feedback-row { margin-top: 22rpx; }.feedback-option { height: 145rpx; font-size: 25rpx; }.face { width: 50rpx; height: 50rpx; font-size: 39rpx; }.next-button { height: 95rpx; font-size: 30rpx; }.skip-button { font-size: 24rpx; }.detail-button { font-size: 22rpx; }
}
.next-button { height: 72rpx; margin-top: 21rpx; border-radius: 17rpx; background: #20262b; font-size: 24rpx; }.skip-button { margin-top: 4rpx; font-size: 20rpx; }.detail-button { height: 50rpx; margin-top: 2rpx; border: 0; background: transparent; color: #818a84; font-size: 18rpx; }
</style>
