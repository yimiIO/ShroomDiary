<template>
	<view class="task-row" :class="{ completed: task.status === 'completed', selected }">
		<button class="complete-button" :aria-label="task.status === 'completed' ? '恢复待办' : '完成待办'" @tap.stop="$emit('toggle', task)">
			<text>{{ task.status === 'completed' ? '✓' : (selected ? '✓' : '') }}</text>
		</button>
		<view class="task-copy" @tap="$emit('open', task)">
			<text class="task-title">{{ task.title || task.content }}</text>
			<view class="task-meta" v-if="metaItems.length">
				<text v-for="item in metaItems" :key="item.key" :class="item.className">{{ item.label }}</text>
			</view>
		</view>
		<button class="more-button" aria-label="更多操作" @tap.stop="$emit('more', task)">···</button>
	</view>
</template>

<script>
export default {
	name: 'TodoRow',
	props: {
		task: { type: Object, required: true },
		selected: { type: Boolean, default: false },
		selectionMode: { type: Boolean, default: false }
	},
	computed: {
		metaItems() {
			const task = this.task || {};
			const items = [];
			if (task.projectName) items.push({ key: 'project', label: task.projectName, className: 'project' });
			if (task.status === 'in_progress') items.push({ key: 'status', label: '进行中', className: 'active' });
			if (task.isOverdue) items.push({ key: 'overdue', label: `已过截止日期 · ${this.shortDate(task.deadline)}`, className: 'overdue' });
			else if (task.scheduledDate) items.push({ key: 'scheduled', label: `安排 ${this.shortDate(task.scheduledDate)}`, className: '' });
			else if (task.deadline) items.push({ key: 'deadline', label: `截止 ${this.shortDate(task.deadline)}`, className: '' });
			if (task.recurrence && task.recurrence.label) items.push({ key: 'repeat', label: task.recurrence.label, className: 'repeat' });
			if (task.compoundItemName) items.push({ key: 'compound', label: `复利 · ${task.compoundItemName}`, className: 'compound' });
			return items;
		}
	},
	methods: {
		shortDate(value) {
			if (!value) return '';
			return String(value).slice(5).replace('-', '月') + '日';
		}
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; border: 0; background: transparent; line-height: 1; }
button::after { border: 0; }
.task-row {
	display: flex;
	align-items: flex-start;
	gap: 18rpx;
	min-height: 86rpx;
	padding: 18rpx 2rpx;
	border-bottom: 1rpx solid rgba(39, 52, 42, .09);
}
.task-row:last-child { border-bottom: 0; }
.task-row.completed { opacity: .58; }
.task-row.completed .task-title { text-decoration: line-through; }
.complete-button {
	display: flex;
	width: 36rpx;
	height: 36rpx;
	flex: 0 0 36rpx;
	align-items: center;
	justify-content: center;
	margin-top: 4rpx;
	border: 2rpx solid #8c978e;
	border-radius: 50%;
	color: #fff;
	font-size: 20rpx;
}
.completed .complete-button, .selected .complete-button { border-color: #26372b; background: #26372b; }
.task-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.task-title { color: #263129; font-size: 27rpx; line-height: 1.42; overflow-wrap: anywhere; }
.task-meta { display: flex; flex-wrap: wrap; gap: 8rpx 14rpx; margin-top: 8rpx; }
.task-meta text { color: #7a847d; font-size: 19rpx; line-height: 1.3; }
.task-meta .active { color: #47663e; font-weight: 650; }
.task-meta .overdue { color: #a54f48; }
.task-meta .repeat { color: #777044; }
.task-meta .compound { color: #5f6c45; }
.more-button { width: 48rpx; height: 42rpx; flex: 0 0 48rpx; color: #778079; font-size: 27rpx; letter-spacing: 1rpx; }
</style>
