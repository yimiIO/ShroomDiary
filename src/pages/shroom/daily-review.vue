<template>
	<view class="page">
		<shroom-page-top-spacer />
		<view class="shell">
			<view class="header">
				<view class="back" @tap="goBack">‹</view>
				<view class="header-copy"><text class="title">菇每日总结</text><text class="subtitle">{{ archiveMode ? '按日期回看' : dateLabel }}</text></view>
			</view>

			<view v-if="loading" class="state-card"><text>{{ archiveMode ? '正在读取每日总结…' : '正在整理这一天的事实与判断…' }}</text><text>{{ archiveMode ? '这里只显示已经生成的日期。' : '第一次生成可能需要一点时间。' }}</text></view>
			<view v-else-if="error" class="state-card error"><text>这次总结没有完成</text><text>{{ error }}</text><button @tap="load">重新尝试</button></view>

			<template v-else-if="archiveMode">
				<view v-if="!items.length" class="state-card empty"><text>还没有每日总结</text><text>当天有真实记录后，22:00 生成的总结会按日期留在这里。</text></view>
				<view v-else class="archive-list">
					<view class="archive-item" :class="{ unread: item.unread }" v-for="item in items" :key="item.id" @tap="openReview(item)">
						<view class="archive-meta"><text>{{ archiveDateLabel(item.date) }}</text><view v-if="item.unread" class="unread-dot"></view><text>{{ item.unread ? '未查看' : '已查看' }}</text></view>
						<text class="archive-title">{{ item.title }}</text>
						<text class="archive-preview">{{ item.preview }}</text>
						<view class="archive-foot"><text>菇每日总结</text><text>打开这一天 ›</text></view>
					</view>
				</view>
			</template>

			<template v-else-if="review && review.result">
				<view class="critical">
					<text class="critical-heading">今天最需要修正</text>
					<text class="critical-issue">{{ primaryCorrection.issue }}</text>
					<view class="critical-advice"><text>明天只做这一件</text><text>{{ primaryCorrection.recommendation }}</text></view>
				</view>
			</template>

			<button v-if="!archiveMode && review && review.result && !showEmailSettings" class="settings-toggle" @tap="showEmailSettings = true">总结设置</button>
			<view v-if="!archiveMode && review && review.result && showEmailSettings" class="email-card">
				<view class="section-head"><text class="section-title">邮箱提醒</text><button @tap="showEmailSettings = false">收起</button></view>
				<text class="email-note">只有验证邮箱并主动开启后才发送。邮件包含私人总结正文；当天已经打开过，就不会再发。</text>
				<view v-if="preferences.mailConfigured" class="email-form">
					<input v-model.trim="emailInput" type="text" maxlength="254" placeholder="你的邮箱" />
					<button :disabled="sending || !emailInput" @tap="requestCode">{{ sending ? '正在发送…' : (preferences.emailVerified ? '更换并验证邮箱' : '发送验证码') }}</button>
					<view v-if="codeRequested" class="verify-row"><input v-model.trim="codeInput" type="number" maxlength="6" placeholder="6 位验证码" /><button :disabled="verifying || codeInput.length !== 6" @tap="verifyCode">{{ verifying ? '正在验证…' : '确认绑定' }}</button></view>
					<view v-if="preferences.emailVerified" class="email-switch"><view><text>{{ preferences.maskedEmail }}</text><text>每天 22:00，仅在当天总结未查看时发送</text></view><switch color="#5d725f" :checked="preferences.emailEnabled" @change="toggleEmail" /></view>
				</view>
				<view v-else class="mail-unavailable">
					<text>{{ preferences.emailVerified ? `已绑定 ${preferences.maskedEmail}` : '邮件通道尚未配置' }}</text>
					<text>网页内每日总结可以正常使用；服务器 SMTP 配置完成前不会自动外发。</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import {
	dailyReviewEmailRequest,
	dailyReviewEmailVerify,
	dailyReviewInbox,
	dailyReviewOpen,
	dailyReviewPreferences
} from '@/api/daily-review';

function today() {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export default {
	data() {
		return {
			statusBarHeight: 0, date: '', loading: false, error: '', review: null, items: [],
			preferences: {}, emailInput: '', codeInput: '', codeRequested: false,
			sending: false, verifying: false, showEmailSettings: false
		};
	},
	computed: {
		archiveMode() { return !this.date; },
		dateLabel() { return this.archiveDateLabel(this.date); },
		primaryCorrection() {
			const result = this.review && this.review.result || {};
			if (result.criticalReview) return result.criticalReview;
			const adjustment = result.tomorrowAdjustment || {};
			return {
				issue: result.headline || '今天没有足够证据指出具体失误',
				recommendation: adjustment.action || '补充结果证据后再决定调整。'
			};
		}
	},
	onLoad(query) {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		if (/^\d{4}-\d{2}-\d{2}$/.test(query && query.date || '')) this.date = query.date;
	},
	onShow() {
		if (!this.$mStore.getters.hasLogin) { uni.switchTab({ url: '/pages/shroom/me' }); return; }
		this.load();
	},
	methods: {
		goBack() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/me' }) }); },
		async load() {
			if (this.loading) return;
			this.loading = true; this.error = '';
			try {
				if (this.archiveMode) {
					const inbox = await this.$http.get(`${dailyReviewInbox}?limit=50`);
					this.items = inbox.data && inbox.data.items || [];
					return;
				}
				const [review, preferences] = await Promise.all([
					this.$http.post(dailyReviewOpen(this.date), {}),
					this.$http.get(dailyReviewPreferences)
				]);
				this.review = review.data;
				this.preferences = preferences.data || {};
				if (this.preferences.email) this.emailInput = this.preferences.email;
			} catch (error) {
				this.error = error && error.message || '请稍后再试';
			} finally { this.loading = false; }
		},
		openReview(item) {
			const route = item.route || `/pages/shroom/daily-review?date=${item.date}`;
			uni.navigateTo({ url: route });
		},
		archiveDateLabel(value) {
			if (!value) return '';
			if (value === today()) return '今天';
			const [year, month, day] = value.split('-').map(Number);
			const currentYear = new Date().getFullYear();
			const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(year, month - 1, day).getDay()];
			return `${year === currentYear ? '' : `${year}年`}${month}月${day}日 · ${weekday}`;
		},
		async requestCode() {
			if (this.sending) return;
			this.sending = true;
			try {
				const response = await this.$http.post(dailyReviewEmailRequest, { email: this.emailInput });
				this.codeRequested = true;
				uni.showToast({ title: response.message || '验证码已发送', icon: 'none' });
			} catch (error) { console.error('发送邮箱验证码失败', error); }
			finally { this.sending = false; }
		},
		async verifyCode() {
			if (this.verifying) return;
			this.verifying = true;
			try {
				const response = await this.$http.post(dailyReviewEmailVerify, { email: this.emailInput, code: this.codeInput });
				this.preferences = response.data || {};
				this.codeRequested = false; this.codeInput = '';
				uni.showToast({ title: '22:00 邮件已开启', icon: 'success' });
			} catch (error) { console.error('验证邮箱失败', error); }
			finally { this.verifying = false; }
		},
		async toggleEmail(event) {
			try {
				const response = await this.$http.patch(dailyReviewPreferences, { emailEnabled: Boolean(event.detail.value) });
				this.preferences = response.data || {};
			} catch (error) { console.error('更新每日总结邮件失败', error); await this.loadPreferences(); }
		},
		async loadPreferences() {
			try { this.preferences = (await this.$http.get(dailyReviewPreferences)).data || {}; }
			catch (error) { console.error('加载邮件设置失败', error); }
		}
	}
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.shell { box-sizing: border-box; padding: 34rpx 34rpx 120rpx; }
.header { display: flex; align-items: flex-start; gap: 22rpx; }
.back { display: flex; width: 62rpx; height: 62rpx; flex: 0 0 62rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.72); font-size: 46rpx; }
.header-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.title { font-family: Georgia, 'Songti SC', serif; font-size: 46rpx; font-weight: 700; }
.subtitle { margin-top: 12rpx; color: #6d796f; font-size: 21rpx; line-height: 1.65; }
.state-card, .critical, .email-card { margin-top: 30rpx; padding: 31rpx; border: 1rpx solid rgba(23,32,25,.06); border-radius: 29rpx; background: #fff; box-shadow: 0 18rpx 50rpx rgba(58,80,60,.05); }
.state-card { display: flex; flex-direction: column; gap: 12rpx; color: #6c776f; }
.state-card text:first-child { color: #172019; font-size: 25rpx; font-weight: 700; }
.state-card button { margin: 12rpx 0 0; border: 0; border-radius: 999rpx; background: #172019; color: #fff; font-size: 20rpx; }
.archive-list { margin-top: 30rpx; }
.archive-item { margin-top: 17rpx; padding: 31rpx; border: 1rpx solid rgba(23,32,25,.06); border-radius: 29rpx; background: rgba(255,255,255,.76); }
.archive-item.unread { background: #fff; box-shadow: 0 18rpx 50rpx rgba(58,80,60,.07); }
.archive-meta { display: flex; align-items: center; gap: 10rpx; color: #829087; font-size: 17rpx; }
.unread-dot { width: 13rpx; height: 13rpx; border-radius: 50%; background: #a45e50; }
.archive-title { display: block; margin-top: 16rpx; font-family: Georgia, 'Songti SC', serif; font-size: 29rpx; font-weight: 680; line-height: 1.5; }
.archive-preview { display: -webkit-box; margin-top: 13rpx; overflow: hidden; color: #667269; font-size: 20rpx; line-height: 1.7; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.archive-foot { display: flex; justify-content: space-between; margin-top: 20rpx; padding-top: 16rpx; border-top: 1rpx solid #edf0eb; color: #758078; font-size: 17rpx; }
.archive-foot text:last-child { color: #425b48; font-weight: 690; }
.critical { padding: 38rpx; border-color: rgba(126,67,57,.12); background: #f2e2dc; color: #432823; }
.critical-heading { display: block; color: #7a453d; font-size: 21rpx; font-weight: 700; }
.critical-issue { display: block; margin-top: 12rpx; font-family: Georgia, 'Songti SC', serif; font-size: 37rpx; font-weight: 700; line-height: 1.45; }
.critical-advice { display: flex; margin-top: 24rpx; padding-top: 20rpx; flex-direction: column; gap: 9rpx; border-top: 1rpx solid rgba(126,67,57,.16); }
.critical-advice text:first-child { color: #92584f; font-size: 17rpx; font-weight: 700; }
.critical-advice text:last-child { color: #432823; font-size: 26rpx; font-weight: 720; line-height: 1.62; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; }
.section-title { font-family: Georgia, 'Songti SC', serif; font-size: 30rpx; font-weight: 680; }
.section-head button { flex: 0 0 auto; margin: 0; padding: 0; border: 0; background: transparent; color: #718075; font-size: 19rpx; line-height: 1; }
.section-head button::after { border: 0; }
.settings-toggle { margin: 28rpx auto 0; padding: 8rpx 22rpx; border: 0; background: transparent; color: #718075; font-size: 18rpx; }
.settings-toggle::after { border: 0; }
.email-note { display: block; margin-top: 15rpx; color: #707c73; font-size: 19rpx; line-height: 1.7; }
.email-form { display: flex; margin-top: 23rpx; flex-direction: column; gap: 13rpx; }
.email-form input { box-sizing: border-box; width: 100%; min-height: 82rpx; padding: 0 22rpx; border: 1rpx solid #dce4da; border-radius: 18rpx; background: #f8faf6; font-size: 21rpx; }
.email-form button { margin: 0; border: 0; border-radius: 999rpx; background: #172019; color: #fff; font-size: 20rpx; }
.verify-row { display: flex; gap: 12rpx; }
.verify-row input { min-width: 0; flex: 1; }
.verify-row button { flex: 0 0 auto; padding: 0 24rpx; }
.email-switch { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; padding-top: 18rpx; border-top: 1rpx solid #edf0eb; }
.email-switch > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }
.email-switch > view text:first-child { font-size: 21rpx; font-weight: 700; }
.email-switch > view text:last-child { color: #7a857d; font-size: 17rpx; line-height: 1.5; }
.mail-unavailable { display: flex; margin-top: 22rpx; padding: 21rpx; flex-direction: column; gap: 7rpx; border-radius: 18rpx; background: #f2f3ef; color: #758078; font-size: 18rpx; }
/* #ifdef H5 */
@media (min-width: 920px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 780px; margin: 0 auto; padding: 64px 42px 110px; } }
/* #endif */
</style>
