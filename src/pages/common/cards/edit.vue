<template>
	<view class="shroom-card-edit-page">
		<!-- 状态栏占位 -->
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		
		<!-- 导航栏 -->
		<view class="navbar" :style="{ paddingTop: (customBarHeightRpx - statusBarHeight * 2 + 40) + 'rpx' }">
			<text class="nav-back" @click="goBack">取消</text>
			<text class="nav-title">{{ cardId ? '编辑菇卡' : '创建菇卡' }}</text>
			<view class="nav-placeholder"></view>
		</view>

		<scroll-view class="content-scroll" scroll-y>
			<!-- 觉察句 -->
			<view class="card-section">
				<view class="section-title">🌱 觉察句</view>
				<textarea 
					class="input-textarea" 
					v-model="cardForm.seedSentence" 
					placeholder="一句最打动自己的洞察或提醒..."
					:maxlength="200"
					auto-height
				/>
				<view class="char-count">{{ cardForm.seedSentence.length }}/200</view>
			</view>

			<!-- 我的理解 -->
			<view class="card-section">
				<view class="section-title">💭 我的理解</view>
				<textarea 
					class="input-textarea" 
					v-model="cardForm.myUnderstanding" 
					placeholder="用自己的话展开这句觉察，说明为什么重要、和自己有什么关系..."
					:maxlength="1000"
					auto-height
				/>
				<view class="char-count">{{ cardForm.myUnderstanding.length }}/1000</view>
			</view>

			<!-- 我要怎么去用 -->
			<view class="card-section">
				<view class="section-title">🌊 我要怎么去用</view>
				<view class="usage-items">
					<view 
						class="usage-item" 
						v-for="(item, index) in cardForm.usageItems" 
						:key="index"
					>
						<view class="usage-number">{{ index + 1 }}</view>
						<input 
							class="usage-input" 
							v-model="cardForm.usageItems[index]" 
							:placeholder="`使用方法 ${index + 1}（建议写成「当 X 发生时，我就 Y」的格式）`"
							:maxlength="200"
						/>
						<text class="usage-delete" @click="removeUsageItem(index)" v-if="cardForm.usageItems.length > 1">×</text>
					</view>
					<view class="add-usage-btn" @click="addUsageItem">
						<text class="add-icon">+</text>
						<text class="add-text">添加使用方法</text>
					</view>
				</view>
			</view>

			<!-- 标签 -->
			<view class="card-section">
				<view class="section-title">标签</view>
				<view class="tags-selector">
					<view 
						class="tag-item" 
						v-for="tag in availableTags" 
						:key="tag"
						:class="{ 'selected': cardForm.tags.includes(tag) }"
						@click="toggleTag(tag)"
					>
						#{{ tag }}
					</view>
					<view class="tag-input-wrapper">
						<input 
							class="tag-input" 
							v-model="newTag" 
							placeholder="添加新标签"
							@confirm="addNewTag"
							confirm-type="done"
						/>
					</view>
				</view>
			</view>

			<!-- 隐私设置 -->
			<view class="card-section">
				<view class="section-title">隐私设置</view>
				<view class="privacy-selector">
					<view 
						class="privacy-item" 
						v-for="option in privacyOptions" 
						:key="option.value"
						:class="{ 'active': cardForm.visibility === option.value }"
						@click="selectPrivacy(option.value)"
					>
						<text class="privacy-icon">{{ option.icon }}</text>
						<view class="privacy-info">
							<text class="privacy-label">{{ option.label }}</text>
							<text class="privacy-desc">{{ option.desc }}</text>
						</view>
						<text class="privacy-check" v-if="cardForm.visibility === option.value">✓</text>
					</view>
				</view>
			</view>
		</scroll-view>

		<!-- 底部保存按钮 -->
		<view class="bottom-save-bar">
			<button 
				class="save-button" 
				:class="{ 'disabled': !canSave }"
				@click="saveCard"
			>
				{{ cardId ? '保存' : '创建' }}
			</button>
		</view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { shroomCardDetail, shroomCardCreate, shroomCardUpdate } from '@/api/shroomCard';

export default {
		data() {
			return {
				statusBarHeight: 0,
				customBarHeight: 0,
				cardId: null,
				newTag: '',
				cardForm: {
					seedSentence: '',
					myUnderstanding: '',
					usageItems: [''],
					tags: [],
					visibility: 'PRIVATE'
				},
				availableTags: ['情绪', '关系', '工作', '成长', '自我接纳', '焦虑', '行动', '沟通'],
			privacyOptions: [
				{
					value: 'PRIVATE',
					label: '仅自己可见',
					desc: '只有你能看到这张菇卡',
					icon: '🔒'
				},
				{
					value: 'PUBLIC_ANON',
					label: '匿名公开',
					desc: '公开到发现广场，但不显示你的昵称',
					icon: '👤'
				},
				{
					value: 'PUBLIC_NAMED',
					label: '公开且显示昵称',
					desc: '公开到发现广场，显示你的昵称和头像',
					icon: '🌍'
				}
			]
		};
	},
	computed: {
		customBarHeightRpx() {
			return this.customBarHeight * 2;
		},
		canSave() {
			return this.cardForm.seedSentence.trim().length > 0;
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
		
			if (options.id) {
				this.cardId = options.id;
				this.loadCard(options.id);
			} else if (options.content) {
				try {
					this.cardForm.myUnderstanding = decodeURIComponent(options.content);
				} catch (error) {
					this.cardForm.myUnderstanding = options.content;
				}
			}
	},
	methods: {
		// 加载菇卡
		async loadCard(id) {
			try {
				uni.showLoading({ title: '加载中...' });
				const res = await this.$http.get(shroomCardDetail, { id });
				
				if (res.code === 200 && res.data) {
					const card = res.data;
					this.cardForm = {
						id: card.id,
						seedSentence: card.seedSentence || '',
						myUnderstanding: card.myUnderstanding || '',
						usageItems: card.usageItems && card.usageItems.length > 0 ? card.usageItems : [''],
						tags: card.tags || [],
						visibility: card.visibility || 'PRIVATE'
					};
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
			} finally {
				uni.hideLoading();
			}
		},
		
		// 添加使用方法
		addUsageItem() {
			if (this.cardForm.usageItems.length < 10) {
				this.cardForm.usageItems.push('');
			} else {
				uni.showToast({
					title: '最多添加10条使用方法',
					icon: 'none'
				});
			}
		},
		
		// 删除使用方法
		removeUsageItem(index) {
			if (this.cardForm.usageItems.length > 1) {
				this.cardForm.usageItems.splice(index, 1);
			}
		},
		
		// 切换标签
		toggleTag(tag) {
			const index = this.cardForm.tags.indexOf(tag);
			if (index > -1) {
				this.cardForm.tags.splice(index, 1);
			} else {
				this.cardForm.tags.push(tag);
			}
		},
		
		// 添加新标签
		addNewTag() {
			if (this.newTag.trim() && !this.availableTags.includes(this.newTag.trim())) {
				this.availableTags.push(this.newTag.trim());
				this.cardForm.tags.push(this.newTag.trim());
				this.newTag = '';
			}
		},
		
		// 选择隐私设置
		selectPrivacy(visibility) {
			this.cardForm.visibility = visibility;
		},
		
		// 保存菇卡
		async saveCard() {
			if (!this.canSave) {
				uni.showToast({
					title: '请输入觉察句',
					icon: 'none'
				});
				return;
			}
			
			// 过滤空的使用方法
			const usageItems = this.cardForm.usageItems.filter(item => item.trim().length > 0);
			if (usageItems.length === 0) {
				uni.showToast({
					title: '请至少添加一条使用方法',
					icon: 'none'
				});
				return;
			}
			
			uni.showLoading({ title: '保存中...' });
			
			try {
				const cardData = {
					seedSentence: this.cardForm.seedSentence,
					myUnderstanding: this.cardForm.myUnderstanding,
					usageItems: usageItems,
					tags: this.cardForm.tags,
					visibility: this.cardForm.visibility
				};
				
				let res;
				if (this.cardId) {
					// 更新菇卡 - 将id放在URL参数中
					res = await this.$http.put(`${shroomCardUpdate}?id=${this.cardId}`, cardData);
				} else {
					// 创建菇卡
					res = await this.$http.post(shroomCardCreate, cardData);
				}
				
				if (res.code === 200) {
					uni.hideLoading();
					uni.showToast({
						title: '保存成功',
						icon: 'success'
					});
					setTimeout(() => {
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
				console.error('保存菇卡失败', error);
				uni.showToast({
					title: '保存失败',
					icon: 'none'
				});
			}
		},
		
		// 返回
		goBack() {
			if (this.cardForm.seedSentence.trim() || this.cardForm.myUnderstanding.trim()) {
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
.shroom-card-edit-page {
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

.card-section {
	background: #fff;
	margin-bottom: 20rpx;
	padding: 30rpx 40rpx;
	
	.section-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333;
		margin-bottom: 24rpx;
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

.usage-items {
	.usage-item {
		display: flex;
		align-items: center;
		gap: 16rpx;
		margin-bottom: 20rpx;
		
		.usage-number {
			width: 48rpx;
			height: 48rpx;
			background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
			color: #fff;
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 24rpx;
			font-weight: 600;
			flex-shrink: 0;
		}
		
		.usage-input {
			flex: 1;
			min-height: 80rpx;
			padding: 16rpx 20rpx;
			border: 1rpx solid #eee;
			border-radius: 12rpx;
			font-size: 28rpx;
			line-height: 1.6;
			background-color: #fafafa;
			box-sizing: border-box;
		}
		
		.usage-delete {
			width: 48rpx;
			height: 48rpx;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 40rpx;
			color: #ff4444;
			flex-shrink: 0;
		}
	}
	
	.add-usage-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8rpx;
		padding: 20rpx;
		border: 2rpx dashed #ddd;
		border-radius: 12rpx;
		background-color: #fafafa;
		
		.add-icon {
			font-size: 32rpx;
			color: #4CAF50;
		}
		
		.add-text {
			font-size: 28rpx;
			color: #666;
		}
	}
}

.tags-selector {
	display: flex;
	flex-wrap: wrap;
	gap: 16rpx;
	
	.tag-item {
		padding: 12rpx 24rpx;
		border: 2rpx solid #eee;
		border-radius: 24rpx;
		font-size: 26rpx;
		color: #666;
		background-color: #fafafa;
		
		&.selected {
			border-color: #4CAF50;
			background-color: #f1f8e9;
			color: #4CAF50;
		}
	}
	
	.tag-input-wrapper {
		.tag-input {
			padding: 12rpx 24rpx;
			border: 2rpx solid #eee;
			border-radius: 24rpx;
			font-size: 26rpx;
			background-color: #fafafa;
		}
	}
}

.privacy-selector {
	.privacy-item {
		display: flex;
		align-items: center;
		padding: 24rpx;
		border: 2rpx solid #eee;
		border-radius: 12rpx;
		margin-bottom: 16rpx;
		background-color: #fafafa;
		
		&.active {
			border-color: #4CAF50;
			background-color: #f1f8e9;
		}
		
		.privacy-icon {
			font-size: 40rpx;
			margin-right: 20rpx;
		}
		
		.privacy-info {
			flex: 1;
			display: flex;
			flex-direction: column;
			
			.privacy-label {
				font-size: 28rpx;
				font-weight: 600;
				color: #333;
				margin-bottom: 8rpx;
			}
			
			.privacy-desc {
				font-size: 24rpx;
				color: #999;
			}
		}
		
		.privacy-check {
			font-size: 32rpx;
			color: #4CAF50;
		}
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
