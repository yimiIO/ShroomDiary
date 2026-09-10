<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell">
			<view class="header"><view class="back" @tap="goBack">‹</view><view class="heading"><text class="kicker">RELATIONSHIP CARE</text><text class="title">关系提醒</text><text class="subtitle">重要的关系，不该靠焦虑维持。</text></view><view class="count">{{ overview.total || 0 }}</view></view>

			<view class="focus-card" v-if="overview.total">
				<text class="focus-label">TODAY'S FOCUS</text><text class="focus-number">{{ overview.total }}</text><text class="focus-copy">件值得你看一眼的关系事项</text>
			</view>
			<view class="focus-card quiet" v-else><text class="focus-label">ALL CLEAR</text><text class="focus-title">此刻没有需要追赶的关系</text><text class="focus-copy">保持真实的联系，也允许关系自然呼吸。</text></view>

			<view class="section" v-if="overview.contactDue && overview.contactDue.length">
				<view class="section-head"><text>该联系的人</text><text>{{ overview.contactDue.length }}</text></view>
				<view class="item" v-for="item in overview.contactDue" :key="item.friendId" @tap="openFriend(item.friendId)">
					<view class="avatar">{{ initial(item.name) }}</view><view class="item-copy"><text>{{ item.name }} · {{ item.score }} 分</text><text>{{ contactCopy(item) }}</text></view><text class="arrow">›</text>
				</view>
			</view>
			<view class="section" v-if="overview.commitments && overview.commitments.length">
				<view class="section-head"><text>承诺与截止</text><text>{{ overview.commitments.length }}</text></view>
				<view class="item" v-for="item in overview.commitments" :key="item.id" @tap="openFriend(item.friendId)">
					<view class="urgency" :class="item.urgency"></view><view class="item-copy"><text>{{ item.task }}</text><text>{{ item.name }} · {{ dueCopy(item) }}</text></view><text class="arrow">›</text>
				</view>
			</view>
			<view class="section" v-if="overview.boundaries && overview.boundaries.length">
				<view class="section-head"><text>保护关系边界</text><text>{{ overview.boundaries.length }}</text></view>
				<view class="item" v-for="item in overview.boundaries" :key="item.friendId" @tap="openFriend(item.friendId)">
					<view class="avatar boundary">!</view><view class="item-copy"><text>{{ item.name }} · {{ item.score }} 分</text><text>最近三次变化持续为负，先照顾好自己的边界。</text></view><text class="arrow">›</text>
				</view>
			</view>

			<view class="review-card">
				<view><text class="review-kicker">MONTHLY REVIEW</text><text class="review-title">本月关系复盘</text><text class="review-copy">用真实记录看见新增关系、变化与未完成承诺。</text></view>
				<view class="review-button" :class="{ disabled: reviewing }" @tap="runReview">{{ reviewing ? '生成中…' : '生成复盘' }}</view>
			</view>
			<view class="review-result" v-if="review">
				<text>{{ review.period }}</text>
				<view class="metrics"><view><b>{{ review.payload.summary.newFriendCount }}</b><text>新认识</text></view><view><b>{{ review.payload.summary.positiveChangeCount }}</b><text>加分</text></view><view><b>{{ review.payload.summary.negativeChangeCount }}</b><text>减分</text></view><view><b>{{ review.payload.summary.pendingCommitmentCount }}</b><text>承诺</text></view></view>
			</view>

			<view class="section settings-section">
				<view class="section-head"><text>提醒设置</text><text>站内</text></view>
				<view class="rule" v-for="rule in rules" :key="rule.id"><view><text>{{ rule.label }}</text><text>{{ rule.description }}</text></view><switch :checked="rule.enabled" color="#59725e" @change="toggleRule(rule, $event)" /></view>
				<text class="push-note">当前为 App 内实时提醒；系统通知推送尚未接入，页面不会冒充已经送达。</text>
			</view>
		</view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { reminderOverview, reminderReview, reminderRules } from '@/api/shroom-system';

export default {
	data() { return { statusBarHeight: 0, overview: { total: 0, contactDue: [], commitments: [], boundaries: [] }, rules: [], reviewing: false, review: null }; },
	onLoad() { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; this.load(); },
	onPullDownRefresh() { this.load().finally(() => uni.stopPullDownRefresh()); },
	methods: {
		async load() {
			try {
				const [overview, rules] = await Promise.all([this.$http.get(reminderOverview), this.$http.get(reminderRules)]);
				this.overview = overview.data || this.overview;
				this.rules = rules.data || [];
			} catch (error) { console.error('加载关系提醒失败', error); }
		},
		async toggleRule(rule, event) {
			const enabled = Boolean(event.detail.value);
			try { await this.$http.put(`${reminderRules}/${rule.id}`, { enabled }); rule.enabled = enabled; await this.load(); }
			catch (error) { rule.enabled = !enabled; console.error('更新提醒设置失败', error); }
		},
		async runReview() {
			if (this.reviewing) return;
			this.reviewing = true;
			try { const res = await this.$http.post(reminderReview, {}); this.review = res.data; }
			catch (error) { console.error('生成关系复盘失败', error); }
			finally { this.reviewing = false; }
		},
		initial(name) { return String(name || '?').slice(0, 1); },
		contactCopy(item) { return item.lastInteraction ? `${moment(item.lastInteraction).format('MM月DD日')}后还没有新互动` : '还没有记录第一次互动'; },
		dueCopy(item) { return item.urgency === 'overdue' ? `已逾期 · ${item.dueDate}` : (item.urgency === 'today' ? '今天截止' : `${item.dueDate} 截止`); },
		openFriend(id) { uni.navigateTo({ url: `/pages/shroom/friends?friendId=${id}` }); },
		goBack() { const pages = getCurrentPages(); if (pages.length > 1) uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/me' }) }); else uni.switchTab({ url: '/pages/shroom/me' }); }
	}
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: #f1f8e9; }
.shell { box-sizing: border-box; padding: 32rpx 34rpx 125rpx; }
.header { display: flex; align-items: flex-start; gap: 20rpx; }
.back { display: flex; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.7); font-size: 50rpx; }
.heading { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.kicker { font-size: 16rpx; font-weight: 700; letter-spacing: 2.3rpx; color: #718075; }
.title { margin-top: 8rpx; font-size: 40rpx; font-weight: 740; }
.subtitle { margin-top: 9rpx; font-size: 20rpx; color: #728075; }
.count { display: flex; width: 60rpx; height: 60rpx; align-items: center; justify-content: center; border-radius: 21rpx; background: #172019; font-size: 24rpx; font-weight: 740; color: #fff; }
.focus-card { margin-top: 40rpx; padding: 36rpx; border-radius: 34rpx; background: #172019; color: #fff; }
.focus-card.quiet { background: #dfead7; color: #26362a; }
.focus-label { display: block; font-size: 16rpx; font-weight: 700; letter-spacing: 2.5rpx; color: #a9b8aa; }
.quiet .focus-label { color: #627166; }
.focus-number { display: inline-block; margin-top: 18rpx; font-size: 69rpx; font-weight: 750; }
.focus-title { display: block; margin-top: 19rpx; font-size: 29rpx; font-weight: 700; }
.focus-copy { margin-left: 12rpx; font-size: 20rpx; line-height: 1.6; color: #bdc8bd; }
.quiet .focus-copy { display: block; margin: 14rpx 0 0; color: #617065; }
.section { margin-top: 27rpx; padding: 27rpx; border-radius: 30rpx; background: #fff; }
.section-head { display: flex; justify-content: space-between; padding-bottom: 18rpx; border-bottom: 1rpx solid #edf1eb; font-size: 23rpx; font-weight: 710; }
.section-head text:last-child { font-size: 18rpx; color: #748078; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 22rpx 0; border-bottom: 1rpx solid #eef1ed; }
.item:last-child { border-bottom: 0; }
.avatar { display: flex; width: 58rpx; height: 58rpx; flex: 0 0 58rpx; align-items: center; justify-content: center; border-radius: 19rpx; background: #e2ecd9; font-size: 23rpx; font-weight: 710; color: #4b6250; }
.avatar.boundary { background: #efe0dc; color: #9a584d; }
.urgency { width: 17rpx; height: 17rpx; flex: 0 0 17rpx; border-radius: 50%; background: #d3a24a; }
.urgency.overdue { background: #a7594d; }
.urgency.today { background: #d77e4f; }
.item-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }
.item-copy text:first-child { font-size: 22rpx; font-weight: 670; }
.item-copy text:last-child { font-size: 18rpx; line-height: 1.5; color: #77837a; }
.arrow { font-size: 32rpx; color: #88928a; }
.review-card { display: flex; align-items: flex-end; justify-content: space-between; gap: 25rpx; margin-top: 27rpx; padding: 31rpx; border-radius: 31rpx; background: #6d3e31; color: #fff; }
.review-card > view:first-child { display: flex; min-width: 0; flex-direction: column; }
.review-kicker { font-size: 15rpx; font-weight: 700; letter-spacing: 2rpx; color: #d8bdb4; }
.review-title { margin-top: 10rpx; font-size: 27rpx; font-weight: 720; }
.review-copy { margin-top: 10rpx; font-size: 18rpx; line-height: 1.5; color: #dbc9c3; }
.review-button { flex: 0 0 auto; padding: 18rpx 21rpx; border-radius: 999rpx; background: #fff; font-size: 19rpx; font-weight: 700; color: #6d3e31; }
.review-button.disabled { opacity: .6; }
.review-result { margin-top: 12rpx; padding: 25rpx; border-radius: 26rpx; background: #fff; }
.review-result > text { font-size: 18rpx; font-weight: 680; color: #718075; }
.metrics { display: grid; grid-template-columns: repeat(4,1fr); margin-top: 19rpx; }
.metrics view { display: flex; align-items: center; flex-direction: column; gap: 6rpx; }
.metrics b { font-size: 30rpx; }
.metrics text { font-size: 17rpx; color: #748078; }
.rule { display: flex; align-items: center; gap: 20rpx; padding: 23rpx 0; border-bottom: 1rpx solid #edf1eb; }
.rule > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }
.rule > view text:first-child { font-size: 22rpx; font-weight: 670; }
.rule > view text:last-child { font-size: 18rpx; line-height: 1.5; color: #78847a; }
.push-note { display: block; padding-top: 21rpx; font-size: 18rpx; line-height: 1.6; color: #7a867d; }
/* #ifdef H5 */
@media (min-width: 1024px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 960px; margin: 0 auto; padding: 64px 44px 100px; } }
/* #endif */
</style>
