<template>
	<view class="compound-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-shell">
			<view class="topbar">
				<button class="back-button" aria-label="返回" @tap="goBack">‹</button>
				<text class="topbar-title">复利系统</text>
				<view class="topbar-spacer"></view>
			</view>

			<view class="hero">
				<text class="hero-kicker">MY COMPOUND SYSTEM</text>
				<text class="hero-title">让正确的事<br>持续发生</text>
				<text class="hero-copy">系统替我重复，规则替我决策，信用替我积累，身体让我走得更久。</text>
				<view class="progress-block">
					<view class="progress-copy">
						<text>今日必做</text>
						<text class="progress-number">{{ progress.completed }}/{{ progress.total }}</text>
					</view>
					<view class="progress-track">
						<view class="progress-fill" :style="{ width: progressPercent + '%' }"></view>
					</view>
				</view>
			</view>

			<view v-if="loading" class="loading-card">
				<view class="loading-dot"></view>
				<text>正在把今天的数据放回四个长期账户</text>
			</view>
			<view v-else-if="loadError" class="load-error-card">
				<text class="load-error-title">复利记录暂时没有读到</text>
				<text class="load-error-copy">页面会留在这里，不会再自动退出。可以重新读取；如果登录已过期，请先重新登录。</text>
				<button class="action-button primary" @tap="loadToday">重新读取</button>
			</view>

			<template v-else>
				<view class="section">
					<view class="section-heading">
						<view>
							<text class="section-kicker">TODAY</text>
							<text class="section-title">今天的本金</text>
						</view>
						<text class="date-label">{{ dateLabel }}</text>
					</view>

					<view
						v-for="ritual in rituals"
						:key="ritual.key"
						class="ritual-row"
						:class="{ completed: ritual.completed, disabled: !ritual.enabled }"
					>
						<view class="ritual-state">{{ ritual.completed ? '✓' : (ritual.enabled ? '·' : '—') }}</view>
						<view class="ritual-content">
							<view class="ritual-title-line">
								<text class="ritual-title">{{ ritual.title }}</text>
								<text class="ritual-meta">{{ ritual.meta }}</text>
							</view>
							<text class="ritual-description" :class="{ prayer: ritual.key === 'prayer' && ritual.enabled }">{{ ritual.description }}</text>
							<view v-if="ritual.key === 'body'" class="ritual-actions">
								<template v-if="!ritual.completed">
									<button class="action-button primary" :disabled="saving" @tap="openYogaPractice">开始瑜伽跟练</button>
									<button class="action-button quiet secondary-action" :disabled="saving" @tap="startBodyCheckIn">记录其他跟练</button>
								</template>
								<button v-else class="action-button quiet" :disabled="saving" @tap="undoCheckIn('body')">撤销今天</button>
							</view>
							<view v-if="ritual.key === 'body' && showYogaPractice && !ritual.completed" class="yoga-practice">
								<view class="yoga-heading">
									<view>
										<text class="yoga-title">{{ bodyPractice.title }}</text>
										<text class="yoga-subtitle">{{ bodyPractice.subtitle }}</text>
									</view>
									<button class="close-practice" aria-label="收起跟练视频" @tap="closeYogaPractice">×</button>
								</view>
								<video
									id="daily-yoga-practice"
									class="yoga-video"
									:src="bodyPractice.videoUrl"
									:poster="bodyPractice.posterUrl"
									:controls="true"
									:autoplay="true"
									:show-center-play-btn="true"
									:enable-progress-gesture="true"
									object-fit="contain"
									@ended="finishYogaPractice"
								></video>
								<text class="yoga-safety">跟着自己的呼吸和活动范围做；出现疼痛、眩晕或明显不适请立即停止。</text>
								<button
									class="action-button yoga-checkin"
									:class="{ ready: yogaFinished }"
									:disabled="saving || !yogaFinished"
									@tap="completeYogaCheckIn"
								>{{ yogaFinished ? '完成并打卡' : '跟练结束后可打卡' }}</button>
								<text class="yoga-credit">来源：{{ bodyPractice.sourceTitle }} · {{ bodyPractice.license }}</text>
								<text class="yoga-credit">{{ bodyPractice.notice }}</text>
							</view>
							<view v-else-if="ritual.key === 'prayer' && ritual.enabled" class="ritual-actions">
								<button v-if="!ritual.completed" class="action-button primary" :disabled="saving" @tap="checkInPrayer">我已读完</button>
								<button v-else class="action-button quiet" :disabled="saving" @tap="undoCheckIn('prayer')">撤销今天</button>
							</view>
							<view v-else-if="ritual.key === 'system' && ritual.enabled" class="auto-note">由 Codex 记录自动判断，无需手动打卡</view>
						</view>
					</view>
				</view>

				<view class="section accounts-section">
					<view class="section-heading">
						<view>
							<text class="section-kicker">LIFETIME ACCOUNTS</text>
							<text class="section-title">四个长期账户</text>
						</view>
					</view>
					<view v-for="dimension in dimensions" :key="dimension.key" class="account-row">
						<text class="account-number">{{ dimension.number }}</text>
						<view class="account-content">
							<view class="account-title-line">
								<text class="account-title">{{ dimension.title }}</text>
								<text class="cadence" :class="dimension.state">{{ dimension.cadence }}</text>
							</view>
							<text class="account-description">{{ dimension.description }}</text>
							<text class="account-metric">{{ dimension.metric }}</text>
							<text class="account-detail">{{ dimension.detail }}</text>
							<view v-if="dimension.key === 'financial'" class="account-action">
								<button v-if="dimension.state !== 'done'" class="action-button outline" :disabled="saving" @tap="checkInFinancial">本月已按规则执行</button>
								<button v-else class="text-button" :disabled="saving" @tap="undoCheckIn('financial')">撤销本月确认</button>
							</view>
						</view>
					</view>
				</view>

				<view v-if="system.available && system.assetSystems && system.assetSystems.length" class="section asset-section">
					<view class="section-heading">
						<view>
							<text class="section-kicker">COMPOUND CAPITAL</text>
							<text class="section-title">六类复利本金</text>
						</view>
						<text class="date-label">累计 {{ system.totalAssetContributions }} 份</text>
					</view>
					<text class="asset-intro">自动运行只代表省时；资产被下一次任务调用，才算开始生息。</text>
					<view class="asset-grid">
						<view v-for="item in system.assetSystems" :key="item.key" class="asset-card" :class="item.state">
							<view class="asset-title-line">
								<text class="asset-title">{{ item.name }}</text>
								<text class="asset-state">{{ item.state === 'yielding' ? '正在生息' : (item.state === 'building' ? '积累中' : '待建立') }}</text>
							</view>
							<view class="asset-metrics">
								<text>{{ item.contributions }} 份本金</text>
								<text>{{ item.reuseEvents }} 次复用</text>
								<text>近30天 +{{ item.recentContributions }}</text>
							</view>
						</view>
					</view>
				</view>

				<view class="section recommendation-section">
					<text class="section-kicker">NEXT LEVER</text>
					<text class="section-title">下一步杠杆</text>
					<view v-for="(item, index) in recommendations" :key="item.key" class="recommendation-row">
						<text class="recommendation-index">0{{ index + 1 }}</text>
						<view>
							<text class="recommendation-title">{{ item.title }}</text>
							<text class="recommendation-copy">{{ item.description }}</text>
						</view>
					</view>
				</view>

				<view class="principle-card">
					<text class="principle-label">THE RULE</text>
					<text class="principle-text">不追求做更多，<br>让正确的事自动继续。</text>
				</view>
			</template>
		</view>
	</view>
</template>

<script>
import { compoundCheckIn, compoundToday, compoundUndo } from '@/api/compound-system';

export default {
	data() {
		return {
			statusBarHeight: 0,
			loading: true,
			loadError: false,
			saving: false,
			showYogaPractice: false,
			yogaFinished: false,
			date: '',
			progress: { completed: 0, total: 0 },
			rituals: [],
			dimensions: [],
			recommendations: [],
			system: {},
			bodyPractice: {}
		};
	},
	computed: {
		progressPercent() {
			if (!this.progress.total) return 0;
			return Math.round(this.progress.completed / this.progress.total * 100);
		},
		dateLabel() {
			if (!this.date) return '';
			const parts = this.date.split('-');
			return `${Number(parts[1])}月${Number(parts[2])}日`;
		}
	},
	onLoad() {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
	},
	onShow() {
		this.loadToday();
	},
	methods: {
		applyPayload(payload) {
			this.date = payload.date || '';
			this.progress = payload.progress || { completed: 0, total: 0 };
			this.rituals = payload.rituals || [];
			this.dimensions = payload.dimensions || [];
			this.recommendations = payload.recommendations || [];
			this.system = payload.system || {};
			this.bodyPractice = payload.bodyPractice || {};
		},
		async loadToday() {
			this.loading = true;
			this.loadError = false;
			try {
				const response = await this.$http.get(compoundToday);
				this.applyPayload(response.data || {});
			} catch (error) {
				this.loadError = true;
				uni.showToast({ title: '暂时无法读取复利记录', icon: 'none' });
			} finally {
				this.loading = false;
			}
		},
		startBodyCheckIn() {
			uni.showActionSheet({
				itemList: ['拉伸', '瑜伽'],
				success: modeResult => {
					const mode = modeResult.tapIndex === 1 ? 'yoga' : 'stretch';
					uni.showActionSheet({
						itemList: ['5 分钟最低版', '15 分钟标准版', '30 分钟完整版'],
						success: durationResult => this.submitCheckIn('body', mode, [5, 15, 30][durationResult.tapIndex])
					});
				}
			});
		},
		openYogaPractice() {
			if (!this.bodyPractice.videoUrl) {
				uni.showToast({ title: '跟练视频暂时不可用', icon: 'none' });
				return;
			}
			this.yogaFinished = false;
			this.showYogaPractice = true;
		},
		closeYogaPractice() {
			this.showYogaPractice = false;
			this.yogaFinished = false;
		},
		finishYogaPractice() {
			this.yogaFinished = true;
			uni.showToast({ title: '跟练完成，可以打卡', icon: 'none' });
		},
		completeYogaCheckIn() {
			if (!this.yogaFinished) return;
			this.submitCheckIn('body', 'yoga', Number(this.bodyPractice.durationMinutes) || 24);
		},
		checkInPrayer() {
			this.submitCheckIn('prayer', 'reading', 1);
		},
		checkInFinancial() {
			uni.showModal({
				title: '确认本月已执行？',
				content: '只确认你按既定规则完成，不评价短期涨跌，也不记录金额。',
				confirmText: '确认执行',
				confirmColor: '#233b2b',
				success: result => {
					if (result.confirm) this.submitCheckIn('financial', 'scheduled_investment', 0);
				}
			});
		},
		async submitCheckIn(ritualKey, mode, durationMinutes) {
			if (this.saving) return;
			this.saving = true;
			try {
				const response = await this.$http.post(compoundCheckIn, { ritualKey, mode, durationMinutes });
				this.applyPayload(response.data || {});
				if (ritualKey === 'body') this.closeYogaPractice();
				uni.showToast({ title: '又存下一份本金', icon: 'success' });
			} catch (error) {
				uni.showToast({ title: '记录失败，请稍后重试', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		async undoCheckIn(ritualKey) {
			if (this.saving) return;
			this.saving = true;
			try {
				const response = await this.$http.post(compoundUndo, { ritualKey });
				this.applyPayload(response.data || {});
			} catch (error) {
				uni.showToast({ title: '撤销失败，请稍后重试', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
		goBack() {
			const pages = getCurrentPages();
			if (pages.length > 1) uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/me' }) });
			else uni.switchTab({ url: '/pages/shroom/me' });
		}
	}
};
</script>

<style lang="scss" scoped>
.compound-page {
	box-sizing: border-box;
	width: 100%;
	min-height: 100vh;
	background: #f1f8e9;
	color: #172019;
}

.status-bar { background: #f1f8e9; }

.page-shell {
	box-sizing: border-box;
	width: 100%;
	padding: 18rpx 30rpx calc(70rpx + env(safe-area-inset-bottom));
}

.topbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 88rpx;
	margin-bottom: 20rpx;
}

.back-button,
.topbar-spacer {
	width: 88rpx;
	height: 88rpx;
}

.back-button {
	display: flex;
	align-items: center;
	justify-content: center;
	margin: 0;
	padding: 0;
	border-radius: 50%;
	background: rgba(255, 255, 255, .78);
	font-size: 56rpx;
	line-height: 1;
	color: #172019;
}

.back-button::after,
.action-button::after,
.text-button::after { border: 0; }

.topbar-title { font-size: 27rpx; font-weight: 700; }

.hero {
	padding: 54rpx 42rpx 40rpx;
	border-radius: 38rpx;
	background: #172019;
	box-shadow: 0 22rpx 60rpx rgba(23, 32, 25, .16);
	color: #f6f8ef;
}

.hero-kicker,
.section-kicker,
.principle-label {
	display: block;
	font-size: 18rpx;
	font-weight: 720;
	letter-spacing: 3.2rpx;
}

.hero-kicker { color: #aebcac; }

.hero-title {
	display: block;
	margin-top: 24rpx;
	font-size: 58rpx;
	font-weight: 760;
	line-height: 1.22;
	letter-spacing: -2rpx;
}

.hero-copy {
	display: block;
	margin-top: 24rpx;
	font-size: 24rpx;
	line-height: 1.78;
	color: #becabd;
}

.progress-block { margin-top: 44rpx; }
.progress-copy,
.section-heading,
.ritual-title-line,
.account-title-line { display: flex; align-items: center; justify-content: space-between; }
.progress-copy { font-size: 22rpx; color: #c8d3c5; }
.progress-number { font-size: 31rpx; font-weight: 740; color: #fff; }
.progress-track { height: 10rpx; margin-top: 15rpx; border-radius: 999rpx; background: rgba(255, 255, 255, .13); overflow: hidden; }
.progress-fill { height: 100%; border-radius: inherit; background: #d9ef63; transition: width .3s ease; }

.loading-card,
.load-error-card,
.section {
	margin-top: 24rpx;
	border: 1rpx solid rgba(23, 32, 25, .07);
	border-radius: 32rpx;
	background: rgba(255, 255, 255, .9);
}

.loading-card { display: flex; align-items: center; min-height: 160rpx; padding: 0 34rpx; font-size: 23rpx; color: #657269; }
.load-error-card { padding: 42rpx 34rpx; }
.load-error-title,
.load-error-copy { display: block; }
.load-error-title { font-size: 30rpx; font-weight: 740; }
.load-error-copy { margin: 14rpx 0 24rpx; font-size: 22rpx; line-height: 1.7; color: #657269; }
.loading-dot { width: 14rpx; height: 14rpx; margin-right: 18rpx; border-radius: 50%; background: #6a846d; animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .25; transform: scale(.72); } }

.section { padding: 36rpx 30rpx; }
.section-heading { align-items: flex-start; margin-bottom: 20rpx; }
.section-kicker { color: #718075; }
.section-title { display: block; margin-top: 9rpx; font-size: 35rpx; font-weight: 740; }
.date-label { margin-top: 25rpx; font-size: 21rpx; color: #748078; }

.ritual-row { display: flex; padding: 30rpx 0; }
.ritual-row + .ritual-row { border-top: 1rpx solid #e7ece2; }
.ritual-row.disabled { opacity: .52; }
.ritual-state {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 54rpx;
	height: 54rpx;
	flex: 0 0 54rpx;
	margin-right: 21rpx;
	border: 2rpx solid #b9c5b9;
	border-radius: 50%;
	font-size: 26rpx;
	font-weight: 740;
	color: #718075;
}
.ritual-row.completed .ritual-state { border-color: #233b2b; background: #233b2b; color: #d9ef63; }
.ritual-content { min-width: 0; flex: 1; }
.ritual-title-line { align-items: flex-start; }
.ritual-title { font-size: 28rpx; font-weight: 720; }
.ritual-meta { max-width: 250rpx; margin-left: 18rpx; font-size: 19rpx; line-height: 1.5; text-align: right; color: #758178; }
.ritual-description,
.account-description,
.recommendation-copy { display: block; margin-top: 12rpx; font-size: 23rpx; line-height: 1.72; color: #657269; overflow-wrap: anywhere; }
.ritual-description.prayer { padding: 22rpx; border-radius: 20rpx; background: #f2f5eb; font-family: serif; font-size: 27rpx; color: #37483b; }
.ritual-actions,
.account-action { margin-top: 20rpx; }
.action-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	min-width: 190rpx;
	height: 88rpx;
	margin: 0;
	padding: 0 30rpx;
	border-radius: 999rpx;
	font-size: 23rpx;
	font-weight: 680;
	line-height: 88rpx;
}
.action-button.primary { background: #233b2b; color: #fff; }
.action-button.quiet { background: #edf1e9; color: #657269; }
.action-button.outline { border: 1rpx solid #647c67; background: transparent; color: #29432f; }
.secondary-action { margin-top: 14rpx; }
.auto-note { display: inline-flex; margin-top: 18rpx; padding: 10rpx 15rpx; border-radius: 999rpx; background: #edf3e4; font-size: 19rpx; color: #5b6f5e; }

.yoga-practice {
	margin-top: 22rpx;
	padding: 22rpx;
	border-radius: 24rpx;
	background: #172019;
	color: #f6f8ef;
}
.yoga-heading { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18rpx; }
.yoga-title,
.yoga-subtitle,
.yoga-safety,
.yoga-credit { display: block; }
.yoga-title { font-size: 26rpx; font-weight: 720; }
.yoga-subtitle { margin-top: 7rpx; font-size: 19rpx; color: #aebcac; }
.close-practice {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 88rpx;
	height: 88rpx;
	margin: -18rpx -16rpx 0 16rpx;
	padding: 0;
	border-radius: 50%;
	background: rgba(255, 255, 255, .09);
	font-size: 38rpx;
	line-height: 1;
	color: #dce4d8;
}
.close-practice::after { border: 0; }
.yoga-video { display: block; width: 100%; height: 330rpx; border-radius: 18rpx; background: #080a08; overflow: hidden; }
.yoga-safety { margin-top: 17rpx; font-size: 20rpx; line-height: 1.65; color: #bac6b8; }
.yoga-checkin { width: 100%; margin-top: 20rpx; background: #3b463d; color: #89948a; }
.yoga-checkin.ready { background: #d9ef63; color: #172019; }
.yoga-credit { margin-top: 14rpx; font-size: 17rpx; line-height: 1.55; color: #849184; }

.account-row { display: flex; padding: 34rpx 0; }
.account-row + .account-row { border-top: 1rpx solid #e7ece2; }
.account-number { width: 66rpx; flex: 0 0 66rpx; padding-top: 5rpx; font-size: 19rpx; font-weight: 720; letter-spacing: 2rpx; color: #889952; }
.account-content { min-width: 0; flex: 1; }
.account-title-line { align-items: flex-start; }
.account-title { font-size: 29rpx; font-weight: 740; }
.cadence { margin-left: 16rpx; padding: 7rpx 14rpx; border-radius: 999rpx; background: #edf3e4; font-size: 18rpx; color: #5a6f5d; }
.cadence.attention { background: #f8e8db; color: #9c5539; }
.cadence.done { background: #e3efdc; color: #456148; }
.account-metric { display: block; margin-top: 20rpx; font-size: 27rpx; font-weight: 730; color: #263d2c; }
.account-detail { display: block; margin-top: 7rpx; font-size: 20rpx; line-height: 1.6; color: #829087; }
.text-button { display: inline-flex; min-height: 88rpx; align-items: center; margin: 0; padding: 0; background: transparent; font-size: 21rpx; color: #7a867d; }

.asset-intro { display: block; margin: -2rpx 0 18rpx; font-size: 22rpx; line-height: 1.7; color: #657269; }
.asset-grid { display: flex; flex-wrap: wrap; margin: 0 -7rpx; }
.asset-card {
	box-sizing: border-box;
	width: calc(50% - 14rpx);
	min-height: 188rpx;
	margin: 7rpx;
	padding: 22rpx;
	border: 1rpx solid #dfe7dd;
	border-radius: 22rpx;
	background: #f6f8f3;
}
.asset-card.yielding { border-color: #c7dba7; background: #f0f6df; }
.asset-title-line { display: flex; align-items: flex-start; justify-content: space-between; }
.asset-title { max-width: 190rpx; font-size: 23rpx; font-weight: 720; line-height: 1.45; }
.asset-state { margin-left: 8rpx; font-size: 16rpx; color: #6e7d71; }
.asset-card.yielding .asset-state { color: #667a24; }
.asset-metrics { margin-top: 22rpx; }
.asset-metrics text { display: block; margin-top: 6rpx; font-size: 18rpx; color: #758178; }

.recommendation-section { background: #f7f1df; }
.recommendation-row { display: flex; padding: 28rpx 0; }
.recommendation-row + .recommendation-row { border-top: 1rpx solid rgba(86, 76, 44, .1); }
.recommendation-index { width: 56rpx; flex: 0 0 56rpx; font-size: 18rpx; font-weight: 720; color: #9b894d; }
.recommendation-title { display: block; font-size: 26rpx; font-weight: 720; }

.principle-card { margin-top: 24rpx; padding: 43rpx 36rpx; border-radius: 32rpx; background: #d9ef63; color: #172019; }
.principle-label { color: #5a6727; }
.principle-text { display: block; margin-top: 14rpx; font-size: 33rpx; font-weight: 750; line-height: 1.5; }
</style>
