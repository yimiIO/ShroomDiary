<template>
	<view class="shroom-practice-page">
		<!-- 状态栏占位 -->
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

		<!-- 导航栏 -->
		<view class="navbar" :style="{ paddingTop: (customBarHeightRpx - statusBarHeight * 2 + 40) + 'rpx' }">
			<text class="nav-back" @click="goBack">取消</text>
			<text class="nav-title">记录练习</text>
			<view class="nav-placeholder"></view>
		</view>

		<scroll-view class="content-scroll" scroll-y>
			<!-- 菇卡信息 -->
			<view class="card-info-section" v-if="cardData">
				<view class="card-seed-sentence">
					<text class="seed-icon">🌱</text>
					<text class="seed-text">{{ cardData.seedSentence }}</text>
				</view>
			</view>

			<!-- 情境 -->
			<view class="form-section">
				<view class="section-title">情境</view>
				<textarea
					class="input-textarea"
					v-model="practiceForm.context"
					placeholder="描述一下当时发生了什么，在什么情况下..."
					:maxlength="500"
					auto-height
				/>
				<view class="char-count">{{ practiceForm.context.length }}/500</view>
			</view>

			<!-- 做了什么 -->
			<view class="form-section">
				<view class="section-title">做了什么</view>
				<textarea
					class="input-textarea"
					v-model="practiceForm.action"
					placeholder="你具体做了什么，如何应用了这张菇卡..."
					:maxlength="500"
					auto-height
				/>
				<view class="char-count">{{ practiceForm.action.length }}/500</view>
			</view>

			<!-- 感受如何 -->
			<view class="form-section">
				<view class="section-title">感受如何</view>
				<textarea
					class="input-textarea"
					v-model="practiceForm.feeling"
					placeholder="记录你的感受和情绪变化..."
					:maxlength="500"
					auto-height
				/>
				<view class="char-count">{{ practiceForm.feeling.length }}/500</view>
			</view>

			<!-- 结果评估 -->
			<view class="form-section">
				<view class="section-title">结果评估</view>
				<textarea
					class="input-textarea"
					v-model="practiceForm.result"
					placeholder="这次练习的结果如何，达到了预期吗..."
					:maxlength="500"
					auto-height
				/>
				<view class="char-count">{{ practiceForm.result.length }}/500</view>
			</view>

			<!-- 复盘 -->
			<view class="form-section">
				<view class="section-title">复盘</view>
				<textarea
					class="input-textarea"
					v-model="practiceForm.reflection"
					placeholder="从这次练习中学到了什么，有什么可以改进的..."
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
				保存练习记录
			</button>
		</view>
	</view>
</template>

<script>
import { shroomCardDetail, shroomCardPracticeCreate } from '@/api/shroomCard';

export default {
	data() {
		return {
			statusBarHeight: 0,
			customBarHeight: 0,
			cardId: null,
			cardData: null,
			practiceForm: {
				context: '',
				action: '',
				feeling: '',
				result: '',
				reflection: ''
			}
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
</style>
