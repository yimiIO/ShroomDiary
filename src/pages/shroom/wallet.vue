<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell">
			<view class="header">
				<view class="back" @tap="goBack">‹</view>
				<view class="header-copy">
					<text class="kicker">SHROOM POINTS</text>
					<text class="title">菇点与账单</text>
					<text class="subtitle">{{ walletSubtitle }}</text>
				</view>
			</view>

			<view v-if="rollout" class="rollout-panel" data-testid="commercial-rollout">
				<text class="section-label">PRODUCT STAGE</text>
				<text class="rollout-title">{{ rollout.title }}</text>
				<text class="rollout-description">{{ rollout.description }}</text>
				<view class="channel-strip">
					<view v-for="channel in rollout.channels" :key="channel.key" class="channel-item">
						<view class="channel-copy">
							<text class="channel-name">{{ channel.name }}</text>
							<text class="channel-role">{{ channel.role }}</text>
						</view>
						<text class="channel-status">{{ channel.statusLabel }}</text>
					</view>
				</view>
			</view>

			<view class="balance-panel" data-testid="wallet-balance">
				<text class="balance-label">可用菇点</text>
				<text class="balance-value">{{ formatPoints(wallet.availablePoints) }}</text>
				<view class="balance-detail">
					<text>充值 {{ formatPoints(wallet.paidPoints) }}</text>
					<text>赠送 {{ formatPoints(wallet.rewardPoints) }}</text>
					<text v-if="wallet.refundReservedPoints">退款处理中 {{ formatPoints(wallet.refundReservedPoints) }}</text>
				</view>
			</view>

			<view v-if="activity" class="activity-panel" data-testid="seven-day-activity">
				<view class="section-heading"><text class="section-label">7 DAY DIARY</text><text class="reward">+1 菇点</text></view>
				<text class="panel-title">连续记录 7 天</text>
				<text class="panel-copy">奖励来自真实的日记记录，与是否分享无关。</text>
				<view class="days">
					<view v-for="index in 7" :key="index" class="day" :class="{ done: index <= activity.currentDays || activity.qualified }">{{ index }}</view>
				</view>
				<text v-if="!activity.qualified" class="activity-status">已连续 {{ activity.currentDays }} 天，还需 {{ activity.remainingDays }} 天</text>
				<button v-else-if="!activity.rewarded" class="action-button" :loading="claiming" @tap="claimReward">领取 1 菇点</button>
				<view v-else class="activity-actions">
					<text class="activity-status">奖励已入账。分享完全自愿，不会带出日记原文。</text>
					<button class="secondary-button" @tap="openSevenDayShare">生成我的七日变化</button>
				</view>
			</view>

			<view v-if="billingEnabled" class="section agreement-section" data-testid="billing-consent">
				<text class="section-label">CHARGING & REFUNDS</text>
				<view class="agreement-panel" :class="{ saved: paymentAgreementsAccepted }">
					<text class="agreement-title">收费与退款约定</text>
					<text class="agreement-description">AI 成功交付后，按实际 Token 用量对应的供应商成本 × 2.5 扣除菇点；失败不扣费，也不会形成欠额。</text>
					<view class="agreement-row" :class="{ locked: paymentAgreementsAccepted }" @tap="toggleAgreement">
						<view class="check" :class="{ checked: agreementAccepted }">{{ agreementAccepted ? '✓' : '' }}</view>
						<view class="agreement-copy">我已阅读并同意
							<text @tap.stop="openLegal('terms')">《用户服务协议》</text>、
							<text @tap.stop="openLegal('privacy')">《隐私政策》</text>、
							<text @tap.stop="openLegal('recharge')">《菇点充值与使用规则》</text>和
							<text @tap.stop="openLegal('refund')">《退款规则》</text>
						</view>
					</view>
					<button v-if="!paymentAgreementsAccepted" class="agreement-button" :disabled="confirmingAgreements || !agreementAccepted || !agreementsPublishable" :loading="confirmingAgreements" @tap="confirmAgreements">确认并保存</button>
					<text v-if="!paymentAgreementsAccepted && !agreementsPublishable" class="agreement-unavailable">收费主体与协议尚未正式发布，当前不能保存同意，也不会发起收费调用。</text>
					<text v-if="paymentAgreementsAccepted" class="agreement-saved">✓ 已保存当前版本的同意记录</text>
				</view>
			</view>

			<view class="section">
				<text class="section-label">ADVANCED SPACES</text>
				<view class="feature-list">
					<view v-for="feature in features" :key="feature.key" class="feature-row">
						<view class="feature-copy">
							<text class="feature-title">{{ feature.name }}</text>
							<text class="feature-description">{{ feature.description }}</text>
							<text class="feature-price">{{ featurePriceLabel(feature) }}</text>
						</view>
						<view v-if="feature.active" class="unlocked">{{ billingEnabled ? '已解锁' : '测试期开放' }}</view>
						<button v-else class="unlock-button" :loading="unlockingKey === feature.key" @tap="unlock(feature)">解锁</button>
					</view>
				</view>
			</view>

			<!-- #ifdef H5 -->
			<view v-if="billingEnabled" class="section recharge-section" data-testid="wallet-recharge">
				<view class="section-heading"><text class="section-label">RECHARGE</text><text class="exchange">1 元 = 1 菇点</text></view>
				<view class="recharge-panel">
					<view class="amount-grid">
						<view v-for="amount in quickAmounts" :key="amount" class="amount-option" :class="{ selected: selectedAmount === amount && !customMode }" @tap="selectAmount(amount)">¥{{ amount }}</view>
						<view class="amount-option" :class="{ selected: customMode }" @tap="selectCustom">自定义</view>
					</view>
					<view v-if="customMode" class="custom-row">
						<text>¥</text><input type="digit" v-model="customAmount" placeholder="1–500" />
					</view>
					<button class="pay-button" :disabled="paying || !paymentReady" :loading="paying" @tap="recharge">微信支付 ¥{{ rechargeAmount }}</button>
					<text v-if="!paymentReady" class="configuration-note">{{ paymentUnavailableReason }}</text>
					<text v-else class="merchant-note">收款与开票主体：{{ merchant.legalName }}</text>
				</view>
			</view>
			<!-- #endif -->
			<!-- #ifdef MP-WEIXIN -->
			<view class="section channel-note" data-testid="mini-program-payment-boundary">
				<text class="section-label">PAYMENT CHANNEL</text>
				<text class="panel-title">小程序内暂不提供充值</text>
				<text class="panel-copy">菇点属于虚拟服务；在微信虚拟支付能力完成审核和接入前，不使用普通小程序支付，也不引导到外部付款。</text>
			</view>
			<!-- #endif -->

			<view class="section">
				<view class="section-heading"><text class="section-label">BILLING HISTORY</text><text class="text-link" @tap="loadLedger">刷新</text></view>
				<view class="ledger-list">
					<view v-if="!ledger.length" class="empty">还没有菇点流水</view>
					<view v-for="item in ledger" :key="item.id" class="ledger-row">
						<view><text class="ledger-title">{{ item.description }}</text><text class="ledger-date">{{ formatDate(item.createdAt) }}</text></view>
						<text class="ledger-amount" :class="{ credit: ledgerDelta(item) > 0 }">{{ ledgerDelta(item) > 0 ? '+' : '' }}{{ formatPoints(ledgerDelta(item)) }}</text>
					</view>
				</view>
				<view class="legal-links">
					<text @tap="openLegal('terms')">用户服务协议</text>
					<text @tap="openLegal('privacy')">隐私政策</text>
					<text @tap="openLegal('refund')">退款规则</text>
					<text v-if="canRequestRefund" @tap="toggleRefund">申请退款</text>
				</view>
				<view v-if="showRefund" class="refund-panel">
					<text class="refund-title">退回未消费的充值余额</text>
					<input type="digit" v-model="refundAmount" placeholder="退款金额（元）" />
					<textarea v-model="refundReason" maxlength="400" placeholder="原因（可选）" />
					<button class="secondary-button" :loading="refunding" @tap="requestRefund">提交退款申请</button>
				</view>
				<view v-if="refundRequests.length" class="refund-history">
					<view v-for="item in refundRequests" :key="item.id" class="refund-history-row">
						<view><text class="ledger-title">退款 {{ formatPoints(item.requestedPoints) }} 菇点</text><text class="ledger-date">{{ formatDate(item.createdAt) }}</text></view>
						<text class="refund-status">{{ refundStatus(item.status) }}</text>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
/* global window */
import {
	billingAcceptAgreements,
	billingFeatureUnlock,
	billingLedger,
	billingOverview,
	billingPaymentOrder,
	billingPaymentOrders,
	billingRefundRequests,
	billingSevenDayClaim,
	billingWechatJsapiAuthUrl,
	billingWechatJsapiPayer
} from '@/api/billing';

export default {
	data() {
		return {
			statusBarHeight: 0,
			overview: null,
			ledger: [],
			refundRequests: [],
			quickAmounts: [10, 20, 50, 100],
			selectedAmount: 10,
			customMode: false,
			customAmount: '',
			agreementAccepted: false,
			claiming: false,
			paying: false,
			unlockingKey: '',
			pendingFeatureKey: '',
			showRefund: false,
			refundAmount: '',
			refundReason: '',
			refunding: false,
			confirmingAgreements: false,
			wechatOauthHandling: false
		};
	},
	computed: {
		wallet() { return this.overview && this.overview.wallet ? this.overview.wallet : {}; },
		billingEnabled() { return Boolean(this.overview && this.overview.enabled); },
		walletSubtitle() {
			if (!this.overview) return '写日记不收费；收费能力会在渠道与合规准备完成后单独开放。';
			if (!this.billingEnabled) return '当前免费测试，不充值、不扣费；未来收费时会提前展示价格和规则。';
			return '写日记不收费。高级空间一次解锁，AI 只在成功交付结果后扣点。';
		},
		rollout() { return this.overview ? this.overview.rollout || null : null; },
		canRequestRefund() { return this.billingEnabled || Number(this.wallet.paidPoints || 0) > 0; },
		activity() { return this.overview ? this.overview.activity : null; },
		features() {
			const list = this.overview ? this.overview.features || [] : [];
			if (!this.pendingFeatureKey) return list;
			return [...list].sort((left, right) => Number(right.key === this.pendingFeatureKey) - Number(left.key === this.pendingFeatureKey));
		},
		merchant() { return this.overview ? this.overview.merchant || {} : {}; },
		paymentAgreementsAccepted() { return Boolean(this.overview && this.overview.agreements && this.overview.agreements.paymentAccepted); },
		agreementsPublishable() { return Boolean(this.merchant.legalReady); },
		paymentChannel() {
			const channels = this.overview && this.overview.paymentChannels ? this.overview.paymentChannels : {};
			return channels[this.paymentPlatform()] || {};
		},
		paymentReady() {
			if (this.paymentPlatform() !== 'H5') return false;
			if (!this.h5InsidePersonalWechat()) return false;
			return Boolean(this.paymentChannel.live && this.paymentChannel.paymentMode === 'JSAPI');
		},
		paymentUnavailableReason() {
			if (this.paymentPlatform() === 'H5' && !this.h5InsidePersonalWechat()) return '请在个人微信中打开菇日记完成充值。';
			return this.paymentChannel.reason || '收款主体、资质和微信商户配置核验完成后才会开放真实充值。';
		},
		rechargeAmount() {
			const value = this.customMode ? Number(this.customAmount) : Number(this.selectedAmount);
			return Number.isFinite(value) ? value : 0;
		}
	},
	onLoad(options = {}) {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.pendingFeatureKey = String(options.feature || '');
	},
	async onShow() {
		await this.load();
		await this.completeWechatAuthorization();
		this.checkPendingOrder();
	},
	methods: {
		async load() {
			try {
				const response = await this.$http.get(billingOverview);
				this.overview = response.data;
				if (response.data.agreements && response.data.agreements.paymentAccepted) this.agreementAccepted = true;
				await Promise.all([this.loadLedger(), this.loadRefundRequests()]);
			} catch (error) { this.$mHelper.log(error); }
		},
		async loadLedger() {
			try { this.ledger = (await this.$http.get(billingLedger)).data.list || []; }
			catch (error) { this.$mHelper.log(error); }
		},
		async loadRefundRequests() {
			try { this.refundRequests = (await this.$http.get(billingRefundRequests)).data.list || []; }
			catch (error) { this.$mHelper.log(error); }
		},
		refundStatus(status) {
			return ({ REQUESTED: '待审核', PROCESSING: '原路退款中', SUCCEEDED: '退款成功', PARTIAL: '部分完成', REJECTED: '未通过', FAILED: '需要处理' })[status] || status;
		},
		formatPoints(value) { return Number(value || 0).toFixed(2).replace(/\.00$/, ''); },
		featurePriceLabel(feature) {
			return this.billingEnabled
				? `${feature.pricePoints} 菇点一次解锁 · AI 调用另行扣点`
				: `计划价格 ${feature.pricePoints} 菇点 · 免费测试期全部开放`;
		},
		formatDate(value) {
			if (!value) return '';
			const date = new Date(value);
			return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
		},
		ledgerDelta(item) { return Number(item.paidDeltaPoints || 0) + Number(item.rewardDeltaPoints || 0); },
		selectAmount(amount) { this.selectedAmount = amount; this.customMode = false; },
		selectCustom() { this.customMode = true; },
		toggleAgreement() {
			if (this.paymentAgreementsAccepted) return;
			this.agreementAccepted = !this.agreementAccepted;
		},
		openLegal(type) { uni.navigateTo({ url: `/pages/shroom/legal?type=${type}` }); },
		openSevenDayShare() { uni.navigateTo({ url: '/pages/shroom/seven-day-share' }); },
		async claimReward() {
			this.claiming = true;
			try {
				await this.$http.post(billingSevenDayClaim, {});
				this.$mHelper.toast('已获得 1 菇点');
				await this.load();
			} finally { this.claiming = false; }
		},
		async acceptAgreements() {
			if (!this.agreementAccepted && !this.paymentAgreementsAccepted) throw new Error('请先同意收费与退款规则');
			if (this.paymentAgreementsAccepted) return;
			await this.$http.post(billingAcceptAgreements, { accepted: true, version: this.overview.agreements.version });
		},
		async confirmAgreements() {
			if (!this.agreementsPublishable) {
				this.$mHelper.toast('收费主体与协议尚未正式发布');
				return;
			}
			if (!this.agreementAccepted) {
				this.$mHelper.toast('请先阅读并勾选全部规则');
				return;
			}
			this.confirmingAgreements = true;
			try {
				await this.acceptAgreements();
				await this.load();
				this.$mHelper.toast('同意记录已保存');
			} catch (error) { this.$mHelper.log(error); }
			finally { this.confirmingAgreements = false; }
		},
		async unlock(feature) {
			if (!this.agreementAccepted) {
				this.$mHelper.toast('请先阅读并同意充值与退款规则');
				return;
			}
			const confirmed = await new Promise(resolve => uni.showModal({
				title: `解锁${feature.name}`,
				content: `一次扣除 ${feature.pricePoints} 菇点并立即长期开通；正常开通的解锁费不作为未消费余额。AI 调用仍会单独计费，异常可申诉。`,
				confirmText: '确认解锁',
				confirmColor: '#42634a',
				success: result => resolve(result.confirm)
			}));
			if (!confirmed) return;
			this.unlockingKey = feature.key;
			try {
				await this.acceptAgreements();
				await this.$http.post(billingFeatureUnlock(feature.key), {});
				this.$mHelper.toast(`已解锁${feature.name}`);
				await this.load();
			} catch (error) { this.$mHelper.log(error); }
			finally { this.unlockingKey = ''; }
		},
		paymentPlatform() {
			let platform = 'UNSUPPORTED';
			// #ifdef MP-WEIXIN
			platform = 'MP_WEIXIN';
			// #endif
			// #ifdef H5
			platform = 'H5';
			// #endif
			return platform;
		},
		h5InsidePersonalWechat() {
			// #ifdef H5
			const userAgent = window.navigator.userAgent || '';
			return /MicroMessenger/i.test(userAgent) && !/wxwork/i.test(userAgent);
			// #endif
			// #ifndef H5
			return false;
			// #endif
		},
		walletReturnUrl() {
			// #ifdef H5
			return `${window.location.origin}${window.location.pathname}`;
			// #endif
			return '';
		},
		readWechatPayerToken() {
			// #ifdef H5
			try {
				const stored = JSON.parse(window.sessionStorage.getItem('shroomWechatPayer') || '{}');
				if (stored.token && Date.now() - Number(stored.savedAt || 0) < 8 * 60 * 1000) return stored.token;
				window.sessionStorage.removeItem('shroomWechatPayer');
			} catch (error) { window.sessionStorage.removeItem('shroomWechatPayer'); }
			// #endif
			return '';
		},
		storeWechatPayerToken(token) {
			// #ifdef H5
			window.sessionStorage.setItem('shroomWechatPayer', JSON.stringify({ token, savedAt: Date.now() }));
			// #endif
		},
		async completeWechatAuthorization() {
			// #ifdef H5
			if (!this.h5InsidePersonalWechat() || this.wechatOauthHandling) return;
			const query = new URLSearchParams(window.location.search || '');
			const code = query.get('code');
			const state = query.get('state');
			if (!code || !state) return;
			this.wechatOauthHandling = true;
			this.paying = true;
			try {
				const response = await this.$http.post(billingWechatJsapiPayer, { code, state });
				this.storeWechatPayerToken(response.data.payerToken);
				const clean = new URL(response.data.returnUrl || this.walletReturnUrl(), window.location.origin);
				window.history.replaceState({}, '', `${clean.pathname}${clean.search}`);
				const rawIntent = window.sessionStorage.getItem('shroomPendingRechargeIntent');
				if (rawIntent) {
					window.sessionStorage.removeItem('shroomPendingRechargeIntent');
					await this.submitWechatPayment(JSON.parse(rawIntent));
				}
			} catch (error) {
				this.$mHelper.log(error);
				window.sessionStorage.removeItem('shroomPendingRechargeIntent');
				this.$mHelper.toast('微信支付授权未完成，请重试');
			} finally {
				this.wechatOauthHandling = false;
				this.paying = false;
			}
			// #endif
		},
		async beginWechatAuthorization(intent) {
			// #ifdef H5
			window.sessionStorage.setItem('shroomPendingRechargeIntent', JSON.stringify(intent));
			const response = await this.$http.get(billingWechatJsapiAuthUrl, { returnUrl: this.walletReturnUrl() });
			window.location.replace(response.data.authUrl);
			// #endif
		},
		invokeWechatJsapi(params) {
			// #ifdef H5
			return new Promise((resolve, reject) => {
				const invoke = () => window.WeixinJSBridge.invoke('getBrandWCPayRequest', params, result => {
					const message = String(result && result.err_msg || '');
					if (message === 'get_brand_wcpay_request:ok') return resolve(true);
					if (message === 'get_brand_wcpay_request:cancel') return resolve(false);
					return reject(new Error(message || '微信支付调起失败'));
				});
				if (window.WeixinJSBridge) return invoke();
				const timer = window.setTimeout(() => reject(new Error('微信支付组件未就绪')), 8000);
				window.document.addEventListener('WeixinJSBridgeReady', () => {
					window.clearTimeout(timer);
					invoke();
				}, { once: true });
			});
			// #endif
			return Promise.reject(new Error('当前客户端不支持微信网页支付'));
		},
		async submitWechatPayment(intent) {
			const payerToken = this.readWechatPayerToken();
			if (!payerToken) return this.beginWechatAuthorization(intent);
			const response = await this.$http.post(billingPaymentOrders, { ...intent, payerToken });
			uni.setStorageSync('shroomPendingPaymentOrder', response.data.id);
			const accepted = await this.invokeWechatJsapi(response.data.payment.jsapiParams);
			if (!accepted) this.$mHelper.toast('已取消支付，不会增加菇点');
			await this.pollOrder(response.data.id);
		},
		async recharge() {
			const amount = this.rechargeAmount;
			if (!Number.isFinite(amount) || amount < 1 || amount > 500) {
				this.$mHelper.toast('充值金额需要在 1–500 元之间');
				return;
			}
			if (!this.agreementAccepted) {
				this.$mHelper.toast('请先阅读并同意充值与退款规则');
				return;
			}
			if (!this.paymentReady) {
				this.$mHelper.toast('真实充值尚未开放');
				return;
			}
			this.paying = true;
			try {
				await this.acceptAgreements();
				await this.submitWechatPayment({
					amountYuan: amount,
					clientPlatform: this.paymentPlatform(),
					idempotencyKey: `recharge-${Date.now()}-${Math.random().toString(36).slice(2)}`
				});
			} catch (error) {
				this.$mHelper.log(error);
				this.$mHelper.toast('支付未完成，不会增加菇点');
			} finally { this.paying = false; }
		},
		async pollOrder(id) {
			for (let index = 0; index < 8; index += 1) {
				const response = await this.$http.get(billingPaymentOrder(id));
				if (response.data.status === 'PAID') {
					uni.removeStorageSync('shroomPendingPaymentOrder');
					this.$mHelper.toast('充值已入账');
					await this.load();
					return true;
				}
				await new Promise(resolve => setTimeout(resolve, 1500));
			}
			this.$mHelper.toast('支付结果正在确认，稍后会自动入账');
			return false;
		},
		checkPendingOrder() {
			const id = uni.getStorageSync('shroomPendingPaymentOrder');
			if (id) this.pollOrder(id).catch(error => this.$mHelper.log(error));
		},
		toggleRefund() { this.showRefund = !this.showRefund; },
		async requestRefund() {
			const amount = Number(this.refundAmount);
			if (!Number.isFinite(amount) || amount <= 0) {
				this.$mHelper.toast('请输入要退回的未消费金额');
				return;
			}
			this.refunding = true;
			try {
				await this.$http.post(billingRefundRequests, { amountYuan: amount, reason: this.refundReason });
				this.$mHelper.toast('退款申请已提交');
				this.showRefund = false;
				this.refundAmount = '';
				this.refundReason = '';
				await this.load();
			} finally { this.refunding = false; }
		},
		goBack() {
			const pages = getCurrentPages();
			if (pages.length > 1) uni.navigateBack();
			else uni.switchTab({ url: '/pages/shroom/me' });
		}
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
.kicker, .section-label { font-size: 17rpx; font-weight: 720; letter-spacing: 2.5rpx; color: #718074; }
.title { margin-top: 8rpx; font-family: Georgia, 'Songti SC', serif; font-size: 46rpx; font-weight: 700; }
.subtitle { margin-top: 12rpx; font-size: 21rpx; line-height: 1.65; color: #6d796f; }
.rollout-panel { margin-top: 30rpx; padding: 30rpx; border: 1rpx solid rgba(23,32,25,.07); border-radius: 28rpx; background: #edf3e6; }
.rollout-title { display: block; margin-top: 13rpx; font-size: 29rpx; font-weight: 700; }
.rollout-description { display: block; margin-top: 9rpx; font-size: 20rpx; line-height: 1.65; color: #677469; }
.channel-strip { margin-top: 23rpx; overflow: hidden; border-top: 1rpx solid rgba(23,32,25,.08); }
.channel-item { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; padding: 18rpx 0; border-bottom: 1rpx solid rgba(23,32,25,.08); }
.channel-item:last-child { border-bottom: 0; padding-bottom: 0; }
.channel-copy { display: flex; min-width: 0; flex-direction: column; }
.channel-name { font-size: 21rpx; font-weight: 700; }
.channel-role { margin-top: 4rpx; font-size: 16rpx; color: #7b887d; }
.channel-status { flex: 0 0 auto; font-size: 17rpx; color: #4c6954; }
.balance-panel { margin-top: 38rpx; padding: 38rpx; border-radius: 30rpx; background: #172019; color: #f5f8ef; }
.balance-label, .balance-value { display: block; }
.balance-label { font-size: 19rpx; color: #bdcbbd; }
.balance-value { margin-top: 8rpx; font-family: Georgia, serif; font-size: 68rpx; }
.balance-detail { display: flex; flex-wrap: wrap; gap: 18rpx; margin-top: 17rpx; font-size: 18rpx; color: #cad5c8; }
.activity-panel { margin-top: 22rpx; padding: 32rpx; border-radius: 28rpx; background: #f7f1d9; }
.section-heading { display: flex; align-items: center; justify-content: space-between; }
.reward, .exchange, .text-link { font-size: 18rpx; color: #6d775e; }
.panel-title { display: block; margin-top: 16rpx; font-size: 30rpx; font-weight: 700; }
.panel-copy { display: block; margin-top: 9rpx; font-size: 20rpx; line-height: 1.6; color: #73705d; }
.days { display: flex; justify-content: space-between; margin-top: 25rpx; }
.day { display: flex; width: 49rpx; height: 49rpx; align-items: center; justify-content: center; border: 1rpx solid #d8d5bd; border-radius: 50%; font-size: 18rpx; color: #8d8a77; }
.day.done { border-color: #56715b; background: #56715b; color: #fff; }
.activity-status { display: block; margin-top: 19rpx; font-size: 19rpx; line-height: 1.55; color: #686957; }
.activity-actions { margin-top: 8rpx; }
.section { margin-top: 38rpx; }
.feature-list, .recharge-panel, .ledger-list { margin-top: 14rpx; overflow: hidden; border: 1rpx solid rgba(23,32,25,.06); border-radius: 27rpx; background: #fff; }
.agreement-panel { margin-top: 14rpx; padding: 28rpx; border: 1rpx solid rgba(23,32,25,.06); border-radius: 27rpx; background: #fff; }
.agreement-panel.saved { background: #eef4e9; }
.agreement-title { display: block; font-size: 25rpx; font-weight: 700; }
.agreement-description { display: block; margin-top: 10rpx; font-size: 19rpx; line-height: 1.65; color: #69766d; }
.feature-row { display: flex; align-items: center; gap: 16rpx; padding: 28rpx; border-bottom: 1rpx solid #edf0eb; }
.feature-row:last-child { border-bottom: 0; }
.feature-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.feature-title { font-size: 25rpx; font-weight: 700; }
.feature-description { margin-top: 7rpx; font-size: 18rpx; line-height: 1.5; color: #738078; }
.feature-price { margin-top: 9rpx; font-size: 17rpx; color: #8a7254; }
.unlocked { font-size: 18rpx; font-weight: 700; color: #58705c; }
.unlock-button { width: 110rpx; margin: 0; padding: 0; border-radius: 999rpx; background: #e4ebd7; color: #3d5744; font-size: 19rpx; line-height: 62rpx; }
.recharge-panel { padding: 27rpx; }
.amount-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12rpx; }
.amount-option { padding: 23rpx 8rpx; border: 1rpx solid #dfe5dc; border-radius: 18rpx; text-align: center; font-size: 23rpx; }
.amount-option.selected { border-color: #56715b; background: #edf3e6; color: #36523e; font-weight: 700; }
.custom-row { display: flex; align-items: center; margin-top: 15rpx; padding: 0 20rpx; border-radius: 18rpx; background: #f4f6f1; }
.custom-row text { font-size: 27rpx; }
.custom-row input { flex: 1; height: 86rpx; margin-left: 10rpx; font-size: 24rpx; }
.agreement-row { display: flex; align-items: flex-start; gap: 13rpx; margin-top: 23rpx; }
.agreement-row.locked { opacity: .78; }
.check { display: flex; width: 31rpx; height: 31rpx; flex: 0 0 31rpx; align-items: center; justify-content: center; border: 1rpx solid #a8b1a7; border-radius: 8rpx; font-size: 20rpx; }
.check.checked { border-color: #4e6a55; background: #4e6a55; color: #fff; }
.agreement-copy { font-size: 18rpx; line-height: 1.6; color: #727c74; }
.agreement-copy text, .legal-links text, .text-link { color: #44644c; text-decoration: underline; }
.agreement-button { margin-top: 21rpx; border: 0; border-radius: 999rpx; background: #42634a; color: #fff; font-size: 21rpx; font-weight: 700; line-height: 76rpx; }
.agreement-button[disabled] { background: #c7cfc5; color: #f5f6f3; }
.agreement-saved { display: block; margin-top: 20rpx; font-size: 18rpx; font-weight: 700; color: #4e6a55; }
.agreement-unavailable { display: block; margin-top: 17rpx; font-size: 17rpx; line-height: 1.55; color: #916d54; }
.pay-button, .action-button, .secondary-button { margin-top: 23rpx; border: 0; border-radius: 999rpx; background: #42634a; color: #fff; font-size: 22rpx; font-weight: 700; line-height: 82rpx; }
.pay-button[disabled] { background: #c7cfc5; color: #f5f6f3; }
.secondary-button { background: #fff; color: #47604c; line-height: 74rpx; }
.configuration-note, .merchant-note { display: block; margin-top: 15rpx; text-align: center; font-size: 17rpx; line-height: 1.55; color: #8b7a67; }
.ledger-row { display: flex; align-items: center; justify-content: space-between; padding: 25rpx 27rpx; border-bottom: 1rpx solid #edf0eb; }
.ledger-row:last-child { border-bottom: 0; }
.ledger-row > view { display: flex; flex-direction: column; }
.ledger-title { font-size: 22rpx; }
.ledger-date { margin-top: 6rpx; font-size: 16rpx; color: #8b958d; }
.ledger-amount { font-size: 23rpx; font-weight: 700; color: #9a5a50; }
.ledger-amount.credit { color: #4e7458; }
.empty { padding: 36rpx; text-align: center; font-size: 20rpx; color: #8a958d; }
.legal-links { display: flex; flex-wrap: wrap; gap: 20rpx; margin: 22rpx 8rpx 0; font-size: 18rpx; }
.refund-panel { margin-top: 18rpx; padding: 25rpx; border-radius: 23rpx; background: #fff; }
.refund-title { display: block; font-size: 23rpx; font-weight: 700; }
.refund-panel input, .refund-panel textarea { box-sizing: border-box; width: 100%; margin-top: 15rpx; padding: 20rpx; border-radius: 16rpx; background: #f4f6f1; font-size: 20rpx; }
.refund-panel textarea { height: 150rpx; }
.channel-note { padding: 28rpx; border-radius: 26rpx; background: #f7f1d9; }
.refund-history { margin-top: 18rpx; overflow: hidden; border-radius: 22rpx; background: rgba(255,255,255,.72); }
.refund-history-row { display: flex; align-items: center; justify-content: space-between; padding: 22rpx 25rpx; border-bottom: 1rpx solid #edf0eb; }
.refund-history-row:last-child { border-bottom: 0; }
.refund-history-row > view { display: flex; flex-direction: column; }
.refund-status { font-size: 18rpx; color: #5f725f; }
/* #ifdef H5 */
@media (min-width: 920px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 760px; margin: 0 auto; padding: 64px 42px 110px; } }
/* #endif */
</style>
