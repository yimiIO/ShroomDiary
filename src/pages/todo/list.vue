<template>
	<view class="todo-list-page">
		<!-- 状态栏占位 -->
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

		<!-- 导航栏 -->
		<view class="navbar" :style="{ paddingTop: (customBarHeightRpx - statusBarHeight * 2 + 40) + 'rpx' }">
			<text class="nav-back" @click="goBack">‹</text>
			<text class="nav-title">我的待办</text>
			<view class="nav-placeholder"></view>
		</view>

		<!-- 统计卡片 -->
		<view class="stats-card">
			<view class="stat-item">
				<text class="stat-value">{{ pendingCount }}</text>
				<text class="stat-label">待完成</text>
			</view>
			<view class="stat-divider"></view>
			<view class="stat-item">
				<text class="stat-value">{{ completedCount }}</text>
				<text class="stat-label">已完成</text>
			</view>
		</view>

		<!-- 筛选标签 -->
		<view class="filter-tabs">
			<view
				class="filter-tab"
				:class="{ active: currentFilter === 'all' }"
				@click="setFilter('all')"
			>
				全部
			</view>
			<view
				class="filter-tab"
				:class="{ active: currentFilter === 'pending' }"
				@click="setFilter('pending')"
			>
				待完成
			</view>
			<view
				class="filter-tab"
				:class="{ active: currentFilter === 'completed' }"
				@click="setFilter('completed')"
			>
				已完成
			</view>
		</view>

		<!-- 待办列表 -->
		<scroll-view class="todo-list" scroll-y @scrolltolower="loadMore">
			<view
				class="todo-item"
				v-for="todo in filteredTodos"
				:key="todo.id"
				:class="{ completed: todo.status === 'completed' }"
			>
				<view class="todo-checkbox" @click="toggleTodo(todo)">
					<view class="checkbox-inner" v-if="todo.status === 'completed'">
						<text class="checkbox-icon">✓</text>
					</view>
				</view>
				<view class="todo-content" @click="editTodo(todo)">
					<view class="todo-title">{{ todo.content || '待办事项' }}</view>
					<view class="todo-meta" v-if="todo.deadline">
						<text class="meta-item deadline-item">⏰ 截止：{{ formatDate(todo.deadline) }}</text>
					</view>
					<view class="todo-tags" v-if="todo.tags && todo.tags.length > 0">
						<text
							class="todo-tag"
							v-for="tag in todo.tags"
							:key="tag"
						>#{{ tag }}</text>
					</view>
				</view>
				<view class="todo-actions">
					<text class="action-btn edit-btn" @click.stop="editTodo(todo)">✏️</text>
					<text class="action-btn delete-btn" @click.stop="deleteTodo(todo)">🗑️</text>
				</view>
			</view>

			<!-- 空状态 -->
			<view class="empty-state" v-if="filteredTodos.length === 0">
				<text class="empty-icon">📝</text>
				<text class="empty-text">{{ currentFilter === 'completed' ? '还没有完成的待办' : '还没有待办事项' }}</text>
				<text class="empty-hint">点击右下角按钮添加待办</text>
			</view>
		</scroll-view>

		<!-- 添加按钮 -->
		<button class="add-button" data-testid="add-todo" aria-label="新建待办" @tap="addTodo">
			<text class="add-icon">+</text>
		</button>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { todoList, todoComplete, todoDelete } from '@/api/todo';
import { diaryCreate } from '@/api/diary';

export default {
	data() {
		return {
			statusBarHeight: 0,
			customBarHeight: 0,
			todos: [],
			currentFilter: 'all', // all, pending, completed
			loading: false,
			page: 1,
			pageSize: 20,
			hasMore: true
		};
	},
	computed: {
		customBarHeightRpx() {
			return this.customBarHeight * 2;
		},
		pendingCount() {
			return this.todos.filter(todo => todo.status === 'pending').length;
		},
		completedCount() {
			return this.todos.filter(todo => todo.status === 'completed').length;
		},
		filteredTodos() {
			if (this.currentFilter === 'all') {
				return this.todos;
			}
			return this.todos.filter(todo => todo.status === this.currentFilter);
		}
	},
	onLoad() {
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

		this.loadTodos();
	},
	onShow() {
		// 从编辑页返回时刷新列表
		this.loadTodos();
	},
	methods: {
		// 加载待办列表
		async loadTodos() {
			this.loading = true;
			try {
				const res = await this.$http.get(todoList, {
					page: this.page,
					pageSize: this.pageSize,
					status: this.currentFilter === 'all' ? '' : this.currentFilter
				});

				if (res.code === 200) {
					let todos = [];
					if (res.data) {
						if (Array.isArray(res.data)) {
							todos = res.data;
						} else if (res.data.list && Array.isArray(res.data.list)) {
							todos = res.data.list;
						} else if (res.data.data && Array.isArray(res.data.data)) {
							todos = res.data.data;
						}
					}

					if (this.page === 1) {
						this.todos = todos;
					} else {
						this.todos = [...this.todos, ...todos];
					}

					this.hasMore = todos.length >= this.pageSize;
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
				this.loading = false;
			}
		},

		// 设置筛选
		setFilter(filter) {
			this.currentFilter = filter;
			this.page = 1;
			this.loadTodos();
		},

		// 切换待办状态（完成/取消完成）
		async toggleTodo(todo) {
			if (todo.status === 'completed') {
				// 如果已完成，取消完成
				todo.status = 'pending';
				// 这里可以调用取消完成的接口（如果有的话）
				// 刷新列表
				this.loadTodos();
			} else {
				// 如果未完成，完成待办
				try {
					uni.showLoading({ title: '处理中...' });

					// 先添加到当天日程
					await this.addToDiary(todo);

					// 然后完成待办
					const res = await this.$http.post(`${todoComplete}?id=${todo.id}`, {});

					if (res.code === 200) {
						todo.status = 'completed';
						todo.completedAt = moment().format('YYYY-MM-DD HH:mm:ss');

						uni.showToast({
							title: '已完成并添加到今天日程',
							icon: 'success',
							duration: 2000
						});

						// 刷新列表
						this.loadTodos();
					} else {
						uni.showToast({
							title: res.message || '操作失败',
							icon: 'none'
						});
					}
				} catch (error) {
					console.error('完成待办失败', error);
					uni.showToast({
						title: '操作失败',
						icon: 'none'
					});
				} finally {
					uni.hideLoading();
				}
			}
		},

		// 将待办添加到当天日程
		async addToDiary(todo) {
			try {
				const now = moment();
				const currentHour = now.hour();
				const currentMinute = now.minute();

				// 计算半小时粒度的时间
				const hour = currentMinute < 30 ? currentHour : (currentHour + 1) % 24;
				const minute = currentMinute < 30 ? 0 : 30;

				const diaryData = {
					content: `✅ 完成待办：${todo.content}`,
					mood: 'happy',
					hour: hour,
					minute: minute,
					visibility: 'PRIVATE',
					type: 'todo_completed'
				};

				await this.$http.post(diaryCreate, diaryData);
			} catch (error) {
				console.error('添加到日程失败', error);
				// 即使添加到日程失败，也继续完成待办
			}
		},

		// 编辑待办
		editTodo(todo) {
			uni.navigateTo({
				url: `/pages/todo/edit?id=${todo.id}`
			});
		},

		// 删除待办
		deleteTodo(todo) {
			uni.showModal({
				title: '确认删除',
				content: '确定要删除这个待办吗？',
				success: async (res) => {
					if (res.confirm) {
						try {
							uni.showLoading({ title: '删除中...' });
							const deleteRes = await this.$http.delete(`${todoDelete}?id=${todo.id}`, {});

							if (deleteRes.code === 200) {
								uni.showToast({
									title: '删除成功',
									icon: 'success'
								});
								this.loadTodos();
							} else {
								uni.showToast({
									title: deleteRes.message || '删除失败',
									icon: 'none'
								});
							}
						} catch (error) {
							console.error('删除待办失败', error);
							uni.showToast({
								title: '删除失败',
								icon: 'none'
							});
						} finally {
							uni.hideLoading();
						}
					}
				}
			});
		},

		// 添加待办
		addTodo() {
			uni.navigateTo({
				url: '/pages/todo/edit',
				fail: () => uni.showToast({ title: '新建页没有打开，请重试', icon: 'none' })
			});
		},

		// 加载更多
		loadMore() {
			if (!this.loading && this.hasMore) {
				this.page++;
				this.loadTodos();
			}
		},

		// 格式化日期
		formatDate(dateStr) {
			if (!dateStr) return '';
			const date = moment(dateStr);
			const today = moment();
			const tomorrow = moment().add(1, 'day');

			if (date.isSame(today, 'day')) {
				return '今天';
			} else if (date.isSame(tomorrow, 'day')) {
				return '明天';
			} else if (date.isBefore(today, 'day')) {
				return date.format('MM月DD日');
			} else {
				return date.format('MM月DD日');
			}
		},

		// 返回
		goBack() {
			uni.navigateBack();
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

.todo-list-page {
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
		font-size: 48rpx;
		color: #333;
		width: 60rpx;
		line-height: 1;
	}

	.nav-title {
		font-size: 36rpx;
		font-weight: 600;
		color: #333;
		flex: 1;
		text-align: center;
	}

	.nav-placeholder {
		width: 60rpx;
	}
}

.stats-card {
	background: #000;
	margin: 20rpx 40rpx;
	padding: 40rpx;
	border-radius: 24rpx;
	display: flex;
	align-items: center;
	justify-content: space-around;
	box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.15);

	.stat-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8rpx;

		.stat-value {
			font-size: 48rpx;
			font-weight: 700;
			color: #fff;
		}

		.stat-label {
			font-size: 24rpx;
			color: rgba(255, 255, 255, 0.9);
		}
	}

	.stat-divider {
		width: 2rpx;
		height: 60rpx;
		background-color: rgba(255, 255, 255, 0.3);
	}
}

.filter-tabs {
	display: flex;
	padding: 20rpx 40rpx;
	background-color: #fff;
	gap: 20rpx;

	.filter-tab {
		padding: 12rpx 32rpx;
		border-radius: 40rpx;
		font-size: 28rpx;
		color: #666;
		background-color: #f5f5f5;
		transition: all 0.3s;

		&.active {
			background: #000;
			color: #fff;
			font-weight: 600;
		}
	}
}

.todo-list {
	height: calc(100vh - 400rpx);
	padding: 0 40rpx 120rpx;
}

.todo-item {
	background-color: #fff;
	border-radius: 20rpx;
	padding: 32rpx;
	margin-bottom: 24rpx;
	display: flex;
	align-items: flex-start;
	gap: 24rpx;
	box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.06);
	transition: all 0.3s;

	&:active {
		transform: scale(0.98);
	}

	&.completed {
		opacity: 0.6;

		.todo-title {
			text-decoration: line-through;
			color: #999;
		}
	}

	.todo-checkbox {
		width: 48rpx;
		height: 48rpx;
		border: 3rpx solid #ddd;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		margin-top: 4rpx;
		transition: all 0.3s;

		&:active {
			transform: scale(0.9);
		}

		.checkbox-inner {
			width: 100%;
			height: 100%;
			background: #000;
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.checkbox-icon {
			font-size: 28rpx;
			color: #fff;
			font-weight: 700;
		}

		.checkbox-circle {
			width: 24rpx;
			height: 24rpx;
			border-radius: 50%;
			background-color: transparent;
		}
	}

	.todo-content {
		flex: 1;
		min-width: 0;

		.todo-title {
			font-size: 32rpx;
			font-weight: 500;
			color: #333;
			line-height: 1.5;
			margin-bottom: 12rpx;
			word-break: break-word;
		}

		.todo-meta {
			display: flex;
			flex-wrap: wrap;
			gap: 16rpx;
			margin-bottom: 12rpx;

			.meta-item {
				font-size: 24rpx;
				color: #999;
			}

			.deadline-item {
				color: #666;
				font-weight: 500;
			}
		}

		.todo-tags {
			display: flex;
			flex-wrap: wrap;
			gap: 12rpx;

			.todo-tag {
				font-size: 22rpx;
				color: #000;
				background-color: rgba(0, 0, 0, 0.08);
				padding: 4rpx 12rpx;
				border-radius: 12rpx;
			}
		}
	}

	.todo-actions {
		display: flex;
		flex-direction: column;
		gap: 16rpx;
		flex-shrink: 0;

		.action-btn {
			font-size: 32rpx;
			width: 64rpx;
			height: 64rpx;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 16rpx;
			transition: all 0.3s;

			&:active {
				transform: scale(0.9);
			}

			&.edit-btn {
				background-color: rgba(0, 0, 0, 0.08);
			}

			&.delete-btn {
				background-color: rgba(255, 68, 68, 0.1);
			}
		}
	}
}

.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 200rpx 40rpx;

	.empty-icon {
		font-size: 120rpx;
		margin-bottom: 40rpx;
	}

	.empty-text {
		font-size: 32rpx;
		color: #666;
		margin-bottom: 16rpx;
		font-weight: 500;
	}

	.empty-hint {
		font-size: 24rpx;
		color: #999;
	}
}

.add-button {
	position: fixed;
	right: 40rpx;
	bottom: 120rpx;
	width: 112rpx;
	height: 112rpx;
	background: #000;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.3);
	z-index: 100;
	box-sizing: border-box;
	padding-bottom: env(safe-area-inset-bottom);
	pointer-events: auto;

	.add-icon {
		font-size: 56rpx;
		color: #fff;
		font-weight: 300;
		line-height: 1;
	}

	&:active {
		transform: scale(0.95);
	}
}
</style>
