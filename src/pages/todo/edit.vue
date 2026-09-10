<template>
	<view class="todo-edit-page">
		<!-- 状态栏占位 -->
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

		<!-- 导航栏 -->
		<view class="navbar" :style="{ paddingTop: (customBarHeightRpx - statusBarHeight * 2 + 40) + 'rpx' }">
			<text class="nav-back" @click="goBack">取消</text>
			<text class="nav-title">{{ todoId ? '编辑待办' : '新建待办' }}</text>
			<button class="nav-save" data-testid="save-todo" :disabled="saving" @tap="saveTodo">
				{{ saving ? '保存中…' : '保存' }}
			</button>
		</view>

		<scroll-view class="content-scroll" scroll-y>
			<!-- 待办内容 -->
			<view class="form-section">
				<view class="section-title">待办内容</view>
				<textarea
					class="input-textarea"
					v-model="todoForm.content"
					placeholder="输入待办事项..."
					:maxlength="500"
					auto-height
				/>
				<view class="char-count">{{ todoForm.content.length }}/500</view>
			</view>

			<!-- 截止日期（可选） -->
			<view class="form-section">
				<view class="section-title">
					截止日期
					<text class="optional-label">（可选）</text>
				</view>
				<picker
					mode="date"
					:value="todoForm.deadline"
					@change="onDeadlineChange"
					:start="moment().format('YYYY-MM-DD')"
				>
					<view class="picker-item" :class="{ 'placeholder': !todoForm.deadline }">
						<text class="picker-label">{{ todoForm.deadline || '选择截止日期（可选）' }}</text>
						<text class="picker-arrow">›</text>
					</view>
				</picker>
				<view class="section-hint" v-if="!todoForm.deadline">
					<text class="hint-text">💡 设置截止日期可以帮助您更好地管理待办事项</text>
				</view>
			</view>

			<!-- 标签 -->
			<view class="form-section">
				<view class="section-title">标签（可选）</view>
				<view class="tags-selector">
					<view
						class="tag-item"
						v-for="tag in availableTags"
						:key="tag"
						:class="{ 'selected': todoForm.tags.includes(tag) }"
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
		</scroll-view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { todoDetail, todoCreate, todoUpdate } from '@/api/todo';

export default {
	data() {
		return {
			statusBarHeight: 0,
			customBarHeight: 0,
			todoId: null,
			newTag: '',
			saving: false,
			todoForm: {
				content: '',
				deadline: '', // 截止日期，可选
				tags: []
			},
			availableTags: ['工作', '生活', '学习', '健康', '购物', '旅行', '重要', '紧急']
		};
	},
	computed: {
		customBarHeightRpx() {
			return this.customBarHeight * 2;
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
			this.todoId = options.id;
			this.loadTodo(options.id);
		}
	},
	methods: {
		// 加载待办
		async loadTodo(id) {
			try {
				uni.showLoading({ title: '加载中...' });
				const res = await this.$http.get(todoDetail, { id });

				if (res.code === 200 && res.data) {
					const todo = res.data;
					this.todoForm = {
						content: todo.content || '',
						deadline: todo.deadline || '',
						tags: todo.tags || []
					};
				} else {
					uni.showToast({
						title: res.message || '加载失败',
						icon: 'none'
					});
				}
			} catch (error) {
				console.error('加载待办失败', error);
				uni.showToast({
					title: '加载失败',
					icon: 'none'
				});
			} finally {
				uni.hideLoading();
			}
		},

		// 截止日期选择
		onDeadlineChange(e) {
			this.todoForm.deadline = e.detail.value;
		},

		// 切换标签
		toggleTag(tag) {
			const index = this.todoForm.tags.indexOf(tag);
			if (index > -1) {
				this.todoForm.tags.splice(index, 1);
			} else {
				this.todoForm.tags.push(tag);
			}
		},

		// 添加新标签
		addNewTag() {
			if (this.newTag.trim() && !this.availableTags.includes(this.newTag.trim())) {
				this.availableTags.push(this.newTag.trim());
				this.todoForm.tags.push(this.newTag.trim());
				this.newTag = '';
			}
		},

		// 保存待办
		async saveTodo() {
			if (this.saving) return;
			if (!this.todoForm.content.trim()) {
				uni.showToast({
					title: '请输入待办内容',
					icon: 'none'
				});
				return;
			}

			this.saving = true;
			uni.showLoading({ title: '保存中...' });

			try {
				const todoData = {
					content: this.todoForm.content.trim(),
					deadline: this.todoForm.deadline || null,
					tags: this.todoForm.tags,
					status: 'pending'
				};

				let res;
				if (this.todoId) {
					// 更新待办
					res = await this.$http.put(`${todoUpdate}?id=${this.todoId}`, todoData);
				} else {
					// 创建待办
					res = await this.$http.post(todoCreate, todoData);
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
				console.error('保存待办失败', error);
				uni.showToast({
					title: typeof error === 'string' ? error : '保存失败，请重试',
					icon: 'none'
				});
			} finally {
				this.saving = false;
				uni.hideLoading();
			}
		},

		// 返回
		goBack() {
			if (this.todoForm.content.trim()) {
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
button {
	margin: 0;
	padding: 0;
	line-height: 1;
	background: transparent;
	border: 0;
}

button::after { border: 0; }

.todo-edit-page {
	min-height: 100vh;
	background-color: #F5F5F5;
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

	.nav-save {
		font-size: 28rpx;
		color: #000;
		font-weight: 600;
		width: 60rpx;
		text-align: right;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		white-space: nowrap;

		&[disabled] { opacity: .45; }
	}
}

.content-scroll {
	height: calc(100vh - 240rpx);
	padding-bottom: 40rpx;
}

.form-section {
	background: #fff;
	margin-bottom: 20rpx;
	padding: 30rpx 40rpx;

	.section-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333;
		margin-bottom: 24rpx;

		.optional-label {
			font-size: 24rpx;
			font-weight: 400;
			color: #999;
			margin-left: 8rpx;
		}
	}

	.section-hint {
		margin-top: 16rpx;

		.hint-text {
			font-size: 24rpx;
			color: #999;
			line-height: 1.5;
		}
	}

	.input-textarea {
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
		overflow-x: hidden;
		word-break: break-word;
		overflow-wrap: anywhere;
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

	.picker-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20rpx;
		background-color: #fafafa;
		border: 1rpx solid #eee;
		border-radius: 12rpx;

		.picker-label {
			font-size: 28rpx;
			color: #333;
		}

		&.placeholder .picker-label {
			color: #999;
		}

		.picker-arrow {
			font-size: 32rpx;
			color: #999;
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
			border-color: #000;
			background-color: #000;
			color: #fff;
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
</style>
