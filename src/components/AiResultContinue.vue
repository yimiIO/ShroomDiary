<template>
	<view class="continue-card">
		<view class="continue-copy">
			<text>{{ title }}</text>
			<text>{{ description }}</text>
		</view>
		<button :disabled="opening" @tap="openConversation">{{ opening ? '正在接上上下文…' : '继续聊聊' }}</button>
	</view>
</template>

<script>
import { memoryResultConversations } from '@/api/memory';

export default {
	props: {
		resultType: { type: String, required: true },
		resultId: { type: String, required: true },
		resultVersion: { type: Number, default: 1 },
		title: { type: String, default: '这份分析还可以继续' },
		description: { type: String, default: '追问判断依据、补充后来发生的事，或指出哪里不对。' }
	},
	data() { return { opening: false }; },
	methods: {
		async openConversation() {
			if (this.opening || !this.resultId) return;
			this.opening = true;
			try {
				const response = await this.$http.post(memoryResultConversations, {
					resultType: this.resultType,
					resultId: this.resultId,
					resultVersion: this.resultVersion
				});
				uni.navigateTo({ url: `/pages/shroom/memory?id=${response.data.id}` });
			} catch (error) {
				console.error('打开分析对话失败', error);
				uni.showToast({ title: typeof error === 'string' ? error : '暂时无法继续对话', icon: 'none' });
			} finally { this.opening = false; }
		}
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1; border: 0; background: transparent; }
button::after { border: 0; }
.continue-card { display: flex; align-items: center; gap: 24rpx; margin-top: 24rpx; padding: 28rpx; border-radius: 28rpx; background: #172019; color: #fff; }
.continue-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.continue-copy text:first-child { font-size: 25rpx; line-height: 1.4; font-weight: 720; }
.continue-copy text:last-child { color: #aebaae; font-size: 18rpx; line-height: 1.55; }
.continue-card button { min-width: 142rpx; height: 68rpx; padding: 0 22rpx; display: flex; align-items: center; justify-content: center; border-radius: 999rpx; background: #e5efd9; color: #172019; font-size: 20rpx; font-weight: 720; }
.continue-card button[disabled] { opacity: .55; }
</style>
