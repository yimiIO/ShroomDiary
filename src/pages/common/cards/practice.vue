<template>
	<view class="shroom-practice-page">
		<!-- 状态栏占位 -->
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

		<!-- 导航栏 -->
		<view class="navbar" :style="{ paddingTop: (customBarHeightRpx - statusBarHeight * 2 + 40) + 'rpx' }">
			<text class="nav-back" @click="goBack">‹</text>
			<text class="nav-title">后续验证<text v-if="previewMode" class="preview-badge"> · 示例</text></text>
			<view class="nav-placeholder"></view>
		</view>

		<scroll-view class="content-scroll" scroll-y>
			<!-- 菇卡信息 -->
			<view class="card-info-section" v-if="cardData">
				<view class="card-seed-sentence">
					<text class="seed-icon">菇卡</text>
					<text class="seed-text">{{ cardData.seedSentence }}</text>
					<text class="seed-understanding" v-if="cardData.myUnderstanding">{{ cardData.myUnderstanding }}</text>
					<image class="seed-mascot" src="/static/images/shroom-card-mascot-v2.webp" mode="widthFix" />
				</view>
			</view>
			<view class="feedback-section"><text class="section-title">这次的经验对你有帮助吗？</text><view class="feedback-grid"><view v-for="option in feedbackOptions" :key="option.label" :class="{ active: practiceForm.feeling === option.label }" @tap="practiceForm.feeling = option.label"><text class="feedback-face" :class="option.tone">{{ option.face }}</text><text>{{ option.label }}</text><text>{{ option.desc }}</text></view></view></view>

			<!-- 情境 -->
			<view class="form-section">
				<view class="section-title">这次的实际情况是？</view>
				<textarea
					class="input-textarea"
					v-model="practiceForm.context"
					placeholder="记录一下当时发生了什么…"
					:maxlength="500"
					auto-height
				/>
				<view class="char-count">{{ practiceForm.context.length }}/500</view>
			</view>

			<!-- 做了什么 -->
			<view class="form-section">
				<view class="section-title">你当时怎么做？</view>
				<textarea
					class="input-textarea"
					v-model="practiceForm.action"
					placeholder="写下你真实做出的选择…"
					:maxlength="500"
					auto-height
				/>
				<view class="char-count">{{ practiceForm.action.length }}/500</view>
			</view>

			<!-- 结果评估 -->
			<view class="form-section">
				<view class="section-title">结果如何？</view>
				<view class="result-chips"><text v-for="option in resultOptions" :key="option" :class="{ active: practiceForm.result === option }" @tap="practiceForm.result = option">{{ option }}</text></view>
			</view>

			<!-- 复盘 -->
			<view class="form-section">
				<view class="section-title">我学到了什么？（可选）</view>
				<textarea
					class="input-textarea"
					v-model="practiceForm.reflection"
					placeholder="这次的经验带来了什么新想法…"
					:maxlength="1000"
					auto-height
				/>
				<view class="char-count">{{ practiceForm.reflection.length }}/1000</view>
			</view>
		</scroll-view>

		<!-- 底部保存按钮 -->
		<view class="bottom-save-bar">
			<button
				class="save-button"
				:class="{ 'disabled': !canSave }"
				@click="savePractice"
			>
				保存验证记录
			</button>
		</view>
	</view>
</template>

<script>
import { shroomCardDetail, shroomCardPracticeCreate } from '@/api/shroomCard';
import { previewCard } from '@/utils/shroom-card-preview';

export default {
	data() {
		return {
			statusBarHeight: 0,
			customBarHeight: 0,
			cardId: null,
			cardData: null,
			previewMode: false,
			practiceForm: {
				context: '',
				action: '',
				feeling: '',
				result: '',
				reflection: ''
			},
			feedbackOptions: [
				{ label: '有帮助', desc: '我做到了', face: '☺', tone: 'positive' },
				{ label: '一般', desc: '部分做到', face: '•', tone: 'neutral' },
				{ label: '没帮助', desc: '仍需改进', face: '☹', tone: 'negative' }
			],
			resultOptions: ['正向结果', '没有明显变化', '负向结果']
		};
	},
	computed: {
		customBarHeightRpx() {
			return this.customBarHeight * 2;
		},
		canSave() {
			return this.practiceForm.context.trim().length > 0 &&
				this.practiceForm.action.trim().length > 0;
		}
	},
	onLoad(options) {
		this.previewMode = Boolean(options && options.preview === '1');
		if (this.previewMode) { this.cardId = 'preview'; this.cardData = previewCard; return; }
		// 获取状态栏高度和自定义导航栏高度
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;

		// #ifdef MP-WEIXIN
		// eslint-disable-next-line
		const custom = wx.getMenuButtonBoundingClientRect();
		if (custom) {
			this.customBarHeight = custom.top - this.statusBarHeight + custom.height + 8;
		} else {
			this.customBarHeight = this.statusBarHeight + 44;
		}
		// #endif

		// #ifndef MP-WEIXIN
		this.customBarHeight = this.statusBarHeight + 44;
		// #endif

		if (options.cardId) {
			this.cardId = options.cardId;
			this.loadCard(options.cardId);
		}
	},
	onShow() { uni.hideTabBar({ animation: false }); },
	onUnload() { uni.showTabBar({ animation: false }); },
	methods: {
		// 加载菇卡信息
		async loadCard(id) {
			try {
				const res = await this.$http.get(shroomCardDetail, { id });

				if (res.code === 200 && res.data) {
					this.cardData = res.data;
				} else {
					uni.showToast({
						title: res.message || '加载失败',
						icon: 'none'
					});
				}
			} catch (error) {
				console.error('加载菇卡失败', error);
				uni.showToast({
					title: '加载失败',
					icon: 'none'
				});
			}
		},

		// 保存练习记录
		async savePractice() {
			if (this.previewMode) return uni.showToast({ title: '示例不会保存', icon: 'none' });
			if (!this.canSave) {
				uni.showToast({
					title: '请填写情境和做了什么',
					icon: 'none'
				});
				return;
			}

			uni.showLoading({ title: '保存中...' });

			try {
				const practiceData = {
					context: this.practiceForm.context,
					action: this.practiceForm.action,
					feeling: this.practiceForm.feeling,
					result: this.practiceForm.result,
					reflection: this.practiceForm.reflection
				};

				const res = await this.$http.post(`${shroomCardPracticeCreate}?id=${this.cardId}`, practiceData);

				if (res.code === 200) {
					uni.hideLoading();
					uni.showToast({
						title: '保存成功',
						icon: 'success'
					});
					setTimeout(() => {
						// 返回详情页并刷新
						uni.navigateBack();
					}, 1500);
				} else {
					uni.hideLoading();
					uni.showToast({
						title: res.message || '保存失败',
						icon: 'none'
					});
				}
			} catch (error) {
				uni.hideLoading();
				console.error('保存练习记录失败', error);
				uni.showToast({
					title: '保存失败',
					icon: 'none'
				});
			}
		},

		// 返回
		goBack() {
			if (this.practiceForm.context.trim() || this.practiceForm.action.trim()) {
				uni.showModal({
					title: '提示',
					content: '有未保存的内容，确定要离开吗？',
					success: (res) => {
						if (res.confirm) {
							uni.navigateBack();
						}
					}
				});
			} else {
				uni.navigateBack();
			}
		}
	}
};
</script>

<style lang="scss" scoped>
.shroom-practice-page {
	min-height: 100vh;
	background-color: #f5f5f5;
}

.status-bar {
	background-color: #fff;
}

.navbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 40rpx 20rpx;
	background-color: #fff;
	border-bottom: 1rpx solid #eee;
	position: sticky;
	top: 0;
	z-index: 100;

	.nav-back {
		font-size: 28rpx;
		color: #666;
		width: 60rpx;
	}

	.nav-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333;
		flex: 1;
		text-align: center;
	}

	.nav-placeholder {
		width: 60rpx;
	}
}

.content-scroll {
	height: calc(100vh - 240rpx);
	padding-bottom: 40rpx;
}

.card-info-section {
	background: linear-gradient(135deg, #f1f8e9 0%, #e8f5e9 100%);
	margin: 20rpx 40rpx;
	padding: 32rpx;
	border-radius: 24rpx;

	.card-seed-sentence {
		display: flex;
		align-items: flex-start;
		gap: 16rpx;

		.seed-icon {
			font-size: 32rpx;
			flex-shrink: 0;
			margin-top: 4rpx;
		}

		.seed-text {
			flex: 1;
			font-size: 32rpx;
			line-height: 1.6;
			color: #333;
			font-weight: 500;
		}
	}
}

.form-section {
	background: #fff;
	margin: 0 40rpx 20rpx;
	padding: 30rpx;
	border-radius: 16rpx;

	.section-title {
		font-size: 28rpx;
		font-weight: 600;
		color: #333;
		margin-bottom: 20rpx;
	}

	.input-textarea {
		width: 100%;
		min-height: 200rpx;
		padding: 20rpx;
		border: 1rpx solid #eee;
		border-radius: 12rpx;
		font-size: 28rpx;
		line-height: 1.6;
		color: #333;
		background-color: #fafafa;
	}

	.char-count {
		text-align: right;
		font-size: 24rpx;
		color: #999;
		margin-top: 12rpx;
	}
}

// 底部保存按钮
.bottom-save-bar {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	padding: 20rpx 40rpx;
	padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
	background-color: #fff;
	border-top: 1rpx solid #eee;
	z-index: 100;
	box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.05);

	.save-button {
		width: 100%;
		height: 88rpx;
		line-height: 88rpx;
		background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
		color: #fff;
		border-radius: 44rpx;
		font-size: 32rpx;
		font-weight: 600;
		border: none;

		&.disabled {
			background: #e0e0e0;
			color: #999;
		}

		&::after {
			border: none;
		}
	}
}

/* Shroom Card verification visual language */
.shroom-practice-page { background: #fbfaf5; color: #171b1e; }
.status-bar, .navbar { background: rgba(251, 250, 245, .96); }
.navbar { padding-right: 32rpx; padding-left: 32rpx; border-bottom-color: #e4e3dc; }
.navbar .nav-title { color: #171b1e; font-weight: 760; }
.navbar .nav-back { color: #5f6862; }
.content-scroll { box-sizing: border-box; height: calc(100vh - 210rpx); padding: 10rpx 28rpx 210rpx; }
.card-info-section { margin: 0 0 28rpx; padding: 31rpx 32rpx; border: 1rpx solid #dfe5d8; border-radius: 29rpx; background: linear-gradient(145deg, #fffef8, #eff3e7); box-shadow: 0 14rpx 38rpx rgba(49, 61, 45, .06); }
.card-info-section .card-seed-sentence { align-items: flex-start; flex-direction: column; gap: 15rpx; }
.card-info-section .card-seed-sentence .seed-icon { margin: 0; padding: 7rpx 12rpx; border-radius: 999rpx; background: #e2edd8; color: #5f824d; font-size: 16rpx; font-weight: 800; letter-spacing: 2rpx; }
.card-info-section .card-seed-sentence .seed-text { font-size: 31rpx; line-height: 1.55; color: #1b201d; font-weight: 720; }
.form-section { margin: 0 0 18rpx; padding: 28rpx; border: 1rpx solid #e5e3dc; border-radius: 28rpx; background: #fff; box-shadow: 0 10rpx 32rpx rgba(45, 52, 42, .035); }
.form-section .section-title { margin-bottom: 17rpx; color: #242a26; font-size: 25rpx; font-weight: 720; }
.form-section .input-textarea { box-sizing: border-box; min-height: 155rpx; padding: 22rpx; border-color: #e6e5de; border-radius: 20rpx; background: #faf9f4; color: #2f3631; font-size: 25rpx; }
.form-section .char-count { color: #a0a49f; font-size: 19rpx; }
.bottom-save-bar { box-sizing: border-box; left: 50%; width: 100%; max-width: 750rpx; transform: translateX(-50%); padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom)); border-top-color: #e4e3dc; background: rgba(255, 254, 249, .96); box-shadow: 0 -12rpx 36rpx rgba(44, 49, 41, .06); }
.bottom-save-bar .save-button { height: 88rpx; border-radius: 24rpx; background: #192027; font-size: 25rpx; line-height: 88rpx; font-weight: 720; }
.bottom-save-bar .save-button.disabled { background: #dfe1dc; color: #969b96; }
.shroom-practice-page { background: #fffefa; }
.preview-badge { font-size: 18rpx; font-weight: 450; color: #8d9691; }
.navbar { padding: 10rpx 26rpx 15rpx !important; border: 0; background: #fffefa; }.navbar .nav-back { font-size: 48rpx; color: #171b1e; }.navbar .nav-title { font-size: 26rpx; }
.content-scroll { height: calc(100vh - 160rpx); padding: 8rpx 24rpx 180rpx; }
.card-info-section { position: relative; min-height: 196rpx; margin: 0 0 17rpx; padding: 23rpx 25rpx; overflow: hidden; border-radius: 22rpx; background: #fff; }
.card-info-section .card-seed-sentence { display: flex; align-items: flex-start; gap: 8rpx; }.card-info-section .card-seed-sentence .seed-icon { padding: 0; background: transparent; color: #67924f; font-size: 19rpx; letter-spacing: 0; }
.card-info-section .card-seed-sentence .seed-text { position: relative; z-index: 2; max-width: 78%; font-size: 29rpx; line-height: 1.4; color: #171b1e; }
.seed-understanding { position: relative; z-index: 2; max-width: 72%; font-size: 20rpx; line-height: 1.45; color: #758089; }.seed-mascot { position: absolute; right: -12rpx; bottom: -18rpx; width: 210rpx; }
.feedback-section { margin: 0 0 17rpx; }.feedback-section > .section-title { display: block; margin-bottom: 12rpx; font-size: 23rpx; font-weight: 730; }.feedback-grid { display: flex; gap: 10rpx; }.feedback-grid > view { display: flex; min-width: 0; height: 121rpx; flex: 1; align-items: center; justify-content: center; flex-direction: column; gap: 2rpx; border: 1rpx solid #e7e9e4; border-radius: 17rpx; background: #fff; box-shadow: 0 6rpx 18rpx rgba(35,42,35,.04); }.feedback-grid > view.active { border-color: #75a35b; background: #f5f9ee; }.feedback-grid > view text:nth-child(2) { font-size: 20rpx; font-weight: 740; }.feedback-grid > view text:last-child { font-size: 16rpx; color: #969da5; }.feedback-face { display: flex; width: 35rpx; height: 35rpx; align-items: center; justify-content: center; border: 2rpx solid #1d2327; border-radius: 50%; font-size: 27rpx; line-height: 1; }.feedback-face.positive { background: #a7dd82; }.feedback-face.neutral { background: #ffd078; font-size: 12rpx; }.feedback-face.negative { background: #fb8077; }
.form-section { margin: 0 0 17rpx; padding: 0; border: 0; border-radius: 0; box-shadow: none; background: transparent; }.form-section .section-title { margin-bottom: 10rpx; font-size: 23rpx; }.form-section .input-textarea { min-height: 112rpx; padding: 15rpx; border-radius: 17rpx; background: #fff; font-size: 22rpx; }.form-section .char-count { margin-top: 4rpx; font-size: 17rpx; }
.result-chips { display: flex; flex-wrap: wrap; gap: 9rpx; }.result-chips text { padding: 11rpx 16rpx; border: 1rpx solid #e6e8e3; border-radius: 999rpx; background: #fff; font-size: 19rpx; }.result-chips text.active { border-color: #719b5b; background: #eaf3e4; }
.bottom-save-bar { padding: 14rpx 24rpx calc(14rpx + env(safe-area-inset-bottom)); border: 0; background: #fffefa; box-shadow: none; }.bottom-save-bar .save-button { height: 74rpx; line-height: 74rpx; border-radius: 18rpx; background: #20262b; font-size: 24rpx; }
</style>
