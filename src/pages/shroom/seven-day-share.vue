<template>
	<view class="page">
		<shroom-page-top-spacer />
		<view class="shell">
			<view class="top-row"><view class="back" @tap="goBack">‹</view><text class="wordmark">SHROOM</text><view class="spacer"></view></view>
			<view class="share-card" data-testid="seven-day-share-card">
				<view class="mushroom"><view class="cap"></view><view class="stem"></view></view>
				<text class="eyebrow">MY SEVEN-DAY CHANGE</text>
				<text class="card-title">我连续七天，<br />认真地留下了自己。</text>
				<view class="divider"></view>
				<view class="number-row"><text class="number">7</text><text class="unit">DAYS</text></view>
				<text class="date-range">{{ dateRange }}</text>
				<text class="card-note">变化不一定立刻有答案，但记下来后，我开始能看见它。</text>
				<text class="signature">菇日记 · 记录，理解，连接</text>
			</view>
			<text class="privacy-note">这张卡片只包含记录天数和日期，不包含日记原文。分享完全自愿，不影响菇点奖励。</text>
			<!-- #ifdef MP-WEIXIN -->
			<button class="share-button" open-type="share">自愿分享给朋友</button>
			<!-- #endif -->
			<!-- #ifdef H5 -->
			<button class="share-button" @tap="copyShareText">复制分享文案</button>
			<!-- #endif -->
			<view class="cancel" @tap="goBack">暂不分享</view>
		</view>
	</view>
</template>

<script>
/* global window, document */
import { billingOverview } from '@/api/billing';

export default {
	data() { return { statusBarHeight: 0, activity: null }; },
	computed: {
		dateRange() {
			if (!this.activity || !this.activity.qualifyingStartDate) return '连续记录的七天';
			return `${this.activity.qualifyingStartDate}  —  ${this.activity.qualifyingEndDate}`;
		}
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.load();
	},
	onShareAppMessage() {
		return { title: '我在菇日记连续记录了七天', path: '/pages/diary/index' };
	},
	onShareTimeline() {
		return { title: '我在菇日记连续记录了七天' };
	},
	methods: {
		async load() {
			try {
				this.activity = (await this.$http.get(billingOverview)).data.activity;
				if (!this.activity || !this.activity.rewarded) {
					this.$mHelper.toast('完成七日记录后才会生成卡片');
					this.goBack();
				}
			} catch (error) { this.$mHelper.log(error); }
		},
		// #ifdef H5
		async copyShareText() {
			const value = `我在菇日记连续记录了七天。${this.dateRange}\n变化不一定立刻有答案，但记下来后，我开始能看见它。`;
			try {
				if (window.navigator.clipboard && window.navigator.clipboard.writeText) await window.navigator.clipboard.writeText(value);
				else {
					const input = document.createElement('textarea');
					input.value = value; document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove();
				}
				this.$mHelper.toast('分享文案已复制');
			} catch (error) { this.$mHelper.toast('复制失败，请手动选择文案'); }
		},
		// #endif
		goBack() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/me' }) }); }
	}
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #e9f1e1; color: #172019; }
.status-bar { background: #e9f1e1; }
.shell { box-sizing: border-box; padding: 28rpx 34rpx 100rpx; }
.top-row { display: flex; align-items: center; justify-content: space-between; }
.back { display: flex; width: 62rpx; height: 62rpx; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255,255,255,.7); font-size: 46rpx; }
.wordmark { font-family: Georgia, serif; font-size: 21rpx; font-weight: 700; letter-spacing: 5rpx; }
.spacer { width: 62rpx; }
.share-card { position: relative; margin-top: 36rpx; padding: 52rpx 42rpx 43rpx; overflow: hidden; border-radius: 34rpx; background: #fffdf5; box-shadow: 0 28rpx 70rpx rgba(55,72,57,.12); }
.mushroom { position: relative; width: 73rpx; height: 71rpx; }
.cap { position: absolute; top: 0; left: 0; width: 73rpx; height: 39rpx; border-radius: 40rpx 40rpx 15rpx 15rpx; background: #55715b; }
.stem { position: absolute; top: 31rpx; left: 27rpx; width: 20rpx; height: 40rpx; border-radius: 5rpx 5rpx 13rpx 13rpx; background: #d8b98b; }
.eyebrow { display: block; margin-top: 42rpx; font-size: 17rpx; font-weight: 700; letter-spacing: 3rpx; color: #778377; }
.card-title { display: block; margin-top: 18rpx; font-family: Georgia, 'Songti SC', serif; font-size: 43rpx; font-weight: 700; line-height: 1.45; }
.divider { width: 64rpx; height: 3rpx; margin-top: 35rpx; background: #d9c497; }
.number-row { display: flex; align-items: baseline; gap: 12rpx; margin-top: 28rpx; }
.number { font-family: Georgia, serif; font-size: 105rpx; line-height: 1; color: #42634a; }
.unit { font-size: 19rpx; letter-spacing: 3rpx; color: #708074; }
.date-range { display: block; margin-top: 10rpx; font-size: 18rpx; color: #829087; }
.card-note { display: block; margin-top: 38rpx; font-size: 23rpx; line-height: 1.8; color: #536057; }
.signature { display: block; margin-top: 48rpx; font-size: 16rpx; letter-spacing: 1.5rpx; color: #8e978f; }
.privacy-note { display: block; margin: 27rpx 12rpx 0; font-size: 18rpx; line-height: 1.65; color: #6f7a70; }
.share-button { margin-top: 25rpx; border-radius: 999rpx; background: #42634a; color: #fff; font-size: 22rpx; font-weight: 700; line-height: 84rpx; }
.cancel { padding: 25rpx; text-align: center; font-size: 20rpx; color: #6f7a70; }
/* #ifdef H5 */
@media (min-width: 920px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 660px; margin: 0 auto; padding: 55px 42px 100px; } }
/* #endif */
</style>
