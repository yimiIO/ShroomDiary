<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell">
			<view class="header">
				<view class="back" @tap="goBack">‹</view>
				<view class="header-copy"><text class="kicker">LEGAL & PRIVACY</text><text class="title">{{ document.title || '菇服务规则' }}</text></view>
			</view>
			<view v-if="document.title" class="document">
				<view v-if="!document.publishable" class="warning">当前法定主体、备案资质、客服或合规复核尚未完整，因此不接受真实充值。</view>
				<view class="meta">
					<text>版本：{{ document.version }}</text>
					<text>服务主体：{{ document.operator }}</text>
					<text>经营地址：{{ document.operatorAddress }}</text>
					<text v-if="document.invoiceLegalName">开票主体：{{ document.invoiceLegalName }}</text>
					<text v-if="document.merchantTaxId">统一社会信用代码：{{ document.merchantTaxId }}</text>
					<text v-if="document.icpQualification">互联网信息服务资质：{{ document.icpQualification }}</text>
					<text v-if="document.appFilingNumber">APP/小程序备案号：{{ document.appFilingNumber }}</text>
				</view>
				<view v-for="(section,index) in document.sections" :key="index" class="section">
					<text class="section-title">{{ index + 1 }}. {{ section[0] }}</text>
					<text class="section-copy">{{ section[1] }}</text>
				</view>
				<view class="footer-note">如果规则更新会产生新版本；已经发生的交易保留当时同意的版本记录。</view>
			</view>
	</view>
	</view>
</template>

<script>
import { billingLegalDocument } from '@/api/billing';

export default {
	data() { return { statusBarHeight: 0, type: 'terms', document: {} }; },
	onLoad(options = {}) {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.type = ['terms', 'privacy', 'recharge', 'refund'].includes(options.type) ? options.type : 'terms';
		this.load();
	},
	methods: {
		async load() {
			try { this.document = (await this.$http.get(billingLegalDocument(this.type))).data || {}; }
			catch (error) { this.$mHelper.log(error); }
		},
		goBack() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/me' }) }); }
	}
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: #f1f8e9; }
.shell { box-sizing: border-box; padding: 34rpx 34rpx 120rpx; }
.header { display: flex; align-items: flex-start; gap: 22rpx; }
.back { display: flex; width: 62rpx; height: 62rpx; flex: 0 0 62rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.72); font-size: 46rpx; }
.header-copy { display: flex; flex: 1; flex-direction: column; }
.kicker { font-size: 17rpx; font-weight: 720; letter-spacing: 2.5rpx; color: #718074; }
.title { margin-top: 8rpx; font-family: Georgia, 'Songti SC', serif; font-size: 40rpx; font-weight: 700; }
.document { margin-top: 34rpx; padding: 35rpx; border-radius: 28rpx; background: #fff; }
.warning { margin-bottom: 23rpx; padding: 19rpx; border-radius: 15rpx; background: #f8eee4; font-size: 19rpx; line-height: 1.6; color: #815f47; }
.meta { display: flex; flex-direction: column; gap: 8rpx; padding-bottom: 26rpx; border-bottom: 1rpx solid #e9ede7; font-size: 18rpx; line-height: 1.55; color: #718076; }
.section { margin-top: 30rpx; }
.section-title, .section-copy { display: block; }
.section-title { font-size: 25rpx; font-weight: 700; }
.section-copy { margin-top: 12rpx; font-size: 21rpx; line-height: 1.8; color: #55615a; }
.footer-note { margin-top: 34rpx; padding-top: 24rpx; border-top: 1rpx solid #e9ede7; font-size: 18rpx; line-height: 1.6; color: #859087; }
/* #ifdef H5 */
@media (min-width: 920px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 760px; margin: 0 auto; padding: 64px 42px 110px; } }
/* #endif */
</style>
