<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell">
			<view class="header">
				<view class="back" @tap="goBack">‹</view>
				<view class="header-copy"><text class="kicker">DAILY REVIEW</text><text class="title">菇每日总结</text><text class="subtitle">{{ archiveMode ? '按日期回看，每天只保留一份可核对的总结' : `${dateLabel} · 只根据这一天可读取的真实记录判断` }}</text></view>
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
					<text class="critical-label">先看问题，不看成绩单</text>
					<text class="critical-heading">今天最需要修正</text>
					<text class="critical-issue">{{ primaryCorrection.issue }}</text>
					<view class="critical-why"><text>为什么重要</text><text>{{ primaryCorrection.consequence }}</text></view>
					<view class="critical-advice"><text>建议｜明天只改这一件</text><text>{{ primaryCorrection.recommendation }}</text></view>
					<text class="refs critical-refs" v-if="primaryCorrection.sourceRefs && primaryCorrection.sourceRefs.length">{{ refs(primaryCorrection.sourceRefs) }}</text>
				</view>

				<view class="section" v-if="review.result.ownershipDecisions && review.result.ownershipDecisions.length">
					<view class="section-head"><text class="section-kicker">OWNERSHIP</text><text class="section-title">哪些不该继续自己做</text></view>
					<view class="rows"><view class="row ownership" v-for="(item, index) in review.result.ownershipDecisions" :key="'o' + index"><text class="pill dark">{{ ownerLabel(item.owner) }}</text><text class="row-title">{{ item.task }}</text><text>{{ item.reason }}</text><text>{{ refs(item.sourceRefs) }}</text></view></view>
				</view>

				<view class="section" v-if="review.result.lifeOsAudit && review.result.lifeOsAudit.length">
					<view class="section-head"><text class="section-kicker">LIFE OS</text><text class="section-title">今天是否符合我的标准</text></view>
					<view class="audit-list"><view class="audit" v-for="item in review.result.lifeOsAudit" :key="item.clauseId"><view class="audit-top"><text>{{ item.area || '人生 OS' }}</text><text :class="'tone-' + item.status.toLowerCase()">{{ osStatus(item.status) }}</text></view><text class="principle">{{ item.principle }}</text><text class="reason">{{ item.reason }}</text><text class="refs" v-if="item.sourceRefs.length">{{ refs(item.sourceRefs) }}</text></view></view>
				</view>

				<view class="section" v-if="compoundItems.length">
					<view class="section-head"><text class="section-kicker">COMPOUND</text><text class="section-title">复利与一次性交付</text></view>
					<view class="rows"><view class="row compound-row" v-for="(item, index) in compoundItems" :key="'c' + index"><text class="pill">{{ item.label }}</text><text>{{ item.text }}</text><text>{{ refs(item.sourceRefs) }}</text></view></view>
				</view>

				<view class="section facts">
					<view class="section-head"><text class="section-kicker">FACTS, LAST</text><text class="section-title">今日事实，仅作判断依据</text></view>
					<text class="facts-headline">{{ review.result.headline }}</text>
					<text class="facts-summary">{{ review.result.factsSummary }}</text>
					<view class="rows compact" v-if="review.result.evidenceHighlights && review.result.evidenceHighlights.length"><view class="row" v-for="(item, index) in review.result.evidenceHighlights" :key="'e' + index"><text>{{ item.text }}</text><text>{{ refs(item.sourceRefs) }}</text></view></view>
					<view class="coverage" v-if="review.coverage">
						<text>{{ review.coverage.diaryCount || 0 }} 篇日记</text><text>{{ review.coverage.codexTaskCount || 0 }} 个 Codex 任务</text><text>{{ review.coverage.completedTodoCount || 0 }} 个完成待办</text>
					</view>
					<text class="cutoff">数据截止 {{ formatTime(review.sourceCutoff) }} · Codex 最近同步 {{ formatTime(review.lastCodexSyncAt) }}</text>
				</view>

				<view class="boundary" v-if="review.result.caveats && review.result.caveats.length"><text>证据边界</text><text v-for="(item, index) in review.result.caveats" :key="index">{{ item }}</text></view>
			</template>

			<view v-if="!archiveMode" class="email-card">
				<view class="section-head"><text class="section-kicker">22:00 EMAIL</text><text class="section-title">没点开时，发到邮箱</text></view>
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
			sending: false, verifying: false
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
				consequence: adjustment.why || '当前证据不足以形成可靠的纠偏判断。',
				recommendation: adjustment.action || '补充结果证据后再决定调整。',
				sourceRefs: adjustment.sourceRefs || []
			};
		},
		compoundItems() {
			const value = this.review && this.review.result && this.review.result.compoundReview || {};
			return [
				...(value.opportunities || []).map(item => ({ ...item, label: '复利机会' })),
				...(value.oneOffWork || []).map(item => ({ ...item, label: '一次性交付' })),
				...(value.personalAssets || []).map(item => ({ ...item, label: '个人资产' })),
				...(value.businessAssets || []).map(item => ({ ...item, label: '公司资产' }))
			];
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
		formatTime(value) {
			if (!value) return '尚未同步';
			return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
		},
		refs(values) {
			if (!(values || []).length) return '证据不足';
			const sources = this.review && this.review.sources || [];
			return `依据 ${values.map(key => {
				const source = sources.find(item => item.key === key);
				if (!source) return key;
				return [key, source.label, source.title].filter(Boolean).join(' · ');
			}).join('；')}`;
		},
		osStatus(value) { return { ALIGNED: '符合', DEVIATED: '偏离', NOT_TRIGGERED: '未触发', INSUFFICIENT: '证据不足' }[value] || value; },
		ownerLabel(value) { return { SELF: '我亲自做', CODEX: '交给 Codex', STAFF: '交给员工', STOP: '停止' }[value] || value; },
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
.kicker, .section-kicker { color: #728074; font-size: 16rpx; font-weight: 750; letter-spacing: 2.8rpx; }
.title { margin-top: 8rpx; font-family: Georgia, 'Songti SC', serif; font-size: 46rpx; font-weight: 700; }
.subtitle { margin-top: 12rpx; color: #6d796f; font-size: 21rpx; line-height: 1.65; }
.state-card, .critical, .section, .email-card { margin-top: 30rpx; padding: 31rpx; border: 1rpx solid rgba(23,32,25,.06); border-radius: 29rpx; background: #fff; box-shadow: 0 18rpx 50rpx rgba(58,80,60,.05); }
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
.critical-label { color: #92584f; font-size: 16rpx; font-weight: 750; letter-spacing: 2.5rpx; }
.critical-heading { display: block; margin-top: 12rpx; color: #7a453d; font-size: 21rpx; font-weight: 700; }
.critical-issue { display: block; margin-top: 12rpx; font-family: Georgia, 'Songti SC', serif; font-size: 37rpx; font-weight: 700; line-height: 1.45; }
.critical-why, .critical-advice { display: flex; margin-top: 24rpx; padding-top: 20rpx; flex-direction: column; gap: 9rpx; border-top: 1rpx solid rgba(126,67,57,.16); }
.critical-why text:first-child, .critical-advice text:first-child { color: #92584f; font-size: 17rpx; font-weight: 700; }
.critical-why text:last-child { color: #73554f; font-size: 21rpx; line-height: 1.72; }
.critical-advice text:last-child { color: #432823; font-size: 26rpx; font-weight: 720; line-height: 1.62; }
.critical-refs { display: block; margin-top: 18rpx; color: #9c7169; }
.facts-headline { display: block; margin-top: 23rpx; color: #273229; font-size: 24rpx; font-weight: 700; line-height: 1.6; }
.facts-summary { display: block; margin-top: 10rpx; color: #6c776f; font-size: 20rpx; line-height: 1.7; }
.compact { margin-top: 13rpx; }
.coverage { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 25rpx; }
.coverage text { padding: 8rpx 13rpx; border-radius: 999rpx; background: #edf2e9; color: #5e6d61; font-size: 17rpx; }
.cutoff { display: block; margin-top: 22rpx; color: #93a194; font-size: 16rpx; line-height: 1.6; }
.section-head { display: flex; flex-direction: column; gap: 8rpx; }
.section-title { font-family: Georgia, 'Songti SC', serif; font-size: 30rpx; font-weight: 680; }
.rows, .audit-list { margin-top: 22rpx; }
.row, .audit { display: flex; padding: 22rpx 0; flex-direction: column; gap: 9rpx; border-top: 1rpx solid #edf0eb; font-size: 21rpx; line-height: 1.65; }
.row > text:last-child, .refs { color: #89938b; font-size: 16rpx; }
.row-title, .principle { font-weight: 700; color: #273229; }
.audit-top { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.audit-top text:first-child { color: #718075; font-size: 18rpx; }
.audit-top text:last-child, .pill { padding: 7rpx 11rpx; border-radius: 999rpx; background: #e5eddc; color: #526855; font-size: 16rpx; }
.audit-top .tone-deviated { background: #f2e2dc; color: #92584f; }
.audit-top .tone-insufficient, .audit-top .tone-not_triggered { background: #eef0ec; color: #778079; }
.reason { color: #6c776f; font-size: 20rpx; line-height: 1.7; }
.compound-row, .ownership { align-items: flex-start; }
.pill.dark { background: #172019; color: #eef4e8; }
.boundary { display: flex; margin-top: 20rpx; padding: 24rpx 28rpx; flex-direction: column; gap: 9rpx; border-radius: 23rpx; background: #f6f3e6; color: #706b5a; font-size: 18rpx; line-height: 1.6; }
.boundary text:first-child { color: #36392f; font-weight: 700; }
.email-note { display: block; margin-top: 15rpx; color: #707c73; font-size: 19rpx; line-height: 1.7; }
.email-form { display: flex; margin-top: 23rpx; flex-direction: column; gap: 13rpx; }
.email-form input { box-sizing: border-box; width: 100%; min-height: 82rpx; padding: 0 22rpx; border: 1rpx solid #dce4da; border-radius: 18rpx; background: #f8faf6; font-size: 21rpx; }
.email-form button { margin: 0; border: 0; border-radius: 999rpx; background: #172019; color: #fff; font-size: 20rpx; }
.verify-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12rpx; }
.verify-row button { padding: 0 24rpx; }
.email-switch { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; padding-top: 18rpx; border-top: 1rpx solid #edf0eb; }
.email-switch > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }
.email-switch > view text:first-child { font-size: 21rpx; font-weight: 700; }
.email-switch > view text:last-child { color: #7a857d; font-size: 17rpx; line-height: 1.5; }
.mail-unavailable { display: flex; margin-top: 22rpx; padding: 21rpx; flex-direction: column; gap: 7rpx; border-radius: 18rpx; background: #f2f3ef; color: #758078; font-size: 18rpx; }
/* #ifdef H5 */
@media (min-width: 920px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 780px; margin: 0 auto; padding: 64px 42px 110px; } }
/* #endif */
</style>
