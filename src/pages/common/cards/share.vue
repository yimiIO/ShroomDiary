<template>
	<view class="share-page">
		<shroom-page-top-spacer />
		<view class="navbar"><text @tap="goBack">‹</text><text>引用这张菇卡<text v-if="previewMode" class="preview-badge"> · 示例</text></text><text></text></view>
		<view class="shell" v-if="card.id">
			<view class="preview"><text class="preview-seed">{{ card.seedSentence }}</text><text class="preview-understanding">{{ card.myUnderstanding }}</text><image src="/static/images/shroom-card-mascot-v2.webp" mode="widthFix" /></view>
			<text class="section-title">公开范围</text>
			<view class="visibility-option" v-for="option in options" :key="option.value" :class="{ active: visibility === option.value }" @tap="visibility = option.value"><text class="option-icon">{{ option.icon }}</text><view><text>{{ option.title }}</text><text>{{ option.desc }}</text></view><text class="option-radio">{{ visibility === option.value ? '✓' : '' }}</text></view>
			<text class="section-title optional-title">想对朋友说什么？（可选）</text>
			<textarea v-model="shareMessage" maxlength="200" placeholder="这段经历对我帮助很大，也希望对你有用。" auto-height />
			<text class="char-count">{{ shareMessage.length }}/200</text>
			<text class="privacy-note">只公开菇卡内容；原始日记和后续验证记录始终私密。附言只用于复制的分享文案。</text>
		</view>
		<view class="loading" v-else>{{ loading ? '正在打开菇卡…' : '菇卡暂时无法打开' }}</view>
		<view class="bottom"><button :disabled="saving || !card.id" @tap="publish">{{ saving ? '正在保存…' : visibility === 'PRIVATE' ? '保存为仅自己可见' : '发布引用' }}</button></view>
	</view>
</template>

<script>
import { shroomCardDetail, shroomCardUpdate } from '@/api/shroomCard';
import { previewCard } from '@/utils/shroom-card-preview';
export default {
	data() { return { cardId: '', card: {}, visibility: 'PRIVATE', shareMessage: '', loading: true, saving: false, previewMode: false, options: [
		{ value: 'PUBLIC_NAMED', title: '公开', desc: '所有人可见', icon: '◎' },
		{ value: 'PUBLIC_ANON', title: '匿名公开', desc: '公开内容，不显示昵称', icon: '◌' },
		{ value: 'PRIVATE', title: '仅自己', desc: '不公开', icon: '♧' }
	] }; },
	onLoad(options) { this.previewMode = Boolean(options && options.preview === '1'); if (this.previewMode) { this.cardId = 'preview'; this.card = previewCard; this.visibility = 'PUBLIC_NAMED'; this.loading = false; } else { this.cardId = options && options.id ? String(options.id) : ''; this.load(); } },
	onShow() { uni.hideTabBar({ animation: false }); },
	onUnload() { uni.showTabBar({ animation: false }); },
	methods: {
		goBack() { uni.navigateBack(); },
		async load() {
			if (!this.cardId) { this.loading = false; return; }
			try { const res = await this.$http.get(shroomCardDetail, { id: this.cardId }); if (res && res.code === 200 && res.data && res.data.isOwner) { this.card = res.data; this.visibility = res.data.visibility || 'PRIVATE'; } }
			catch (error) { console.error('加载分享菇卡失败', error); }
			finally { this.loading = false; }
		},
		async publish() {
			if (this.previewMode) return uni.showToast({ title: '示例不会发布', icon: 'none' });
			if (!this.card.id || this.saving) return;
			this.saving = true;
			try {
				const res = await this.$http.put(`${shroomCardUpdate}?id=${this.cardId}`, { seedSentence: this.card.seedSentence, myUnderstanding: this.card.myUnderstanding || '', usageItems: this.card.usageItems || [], tags: this.card.tags || [], visibility: this.visibility });
				if (!res || res.code !== 200) throw new Error((res && res.message) || '保存失败');
				if (this.visibility !== 'PRIVATE' && this.shareMessage.trim()) {
					const url = `https://shroom.evox.run/pages/common/cards/detail?id=${this.cardId}`;
					uni.setClipboardData({ data: `${this.shareMessage.trim()}\n${this.card.seedSentence}\n${url}` });
				}
				uni.showToast({ title: this.visibility === 'PRIVATE' ? '已设为私密' : '已公开菇卡', icon: 'success' });
				setTimeout(() => uni.navigateBack(), 900);
			} catch (error) { console.error('发布菇卡失败', error); uni.showToast({ title: '保存失败，请重试', icon: 'none' }); }
			finally { this.saving = false; }
		}
	}
};
</script>

<style scoped lang="scss">
.share-page { min-height: 100vh; background: #fffefa; color: #15191f; }.navbar { display: flex; align-items: center; justify-content: space-between; height: 78rpx; box-sizing: border-box; padding: 0 27rpx; font-size: 25rpx; font-weight: 760; }.navbar > text:first-child, .navbar > text:last-child { width: 48rpx; }.navbar > text:first-child { font-size: 46rpx; font-weight: 300; }
.preview-badge { font-size: 18rpx; font-weight: 450; color: #8d9691; }
.shell { box-sizing: border-box; max-width: 750rpx; margin: 0 auto; padding: 12rpx 27rpx 190rpx; }.preview { position: relative; min-height: 233rpx; box-sizing: border-box; padding: 27rpx 28rpx; overflow: hidden; border: 1rpx solid #e8ebdf; border-radius: 23rpx; background: #fff; box-shadow: 0 5rpx 15rpx rgba(30,42,28,.04); }.preview-seed { display: block; position: relative; z-index: 2; max-width: 72%; font-size: 30rpx; font-weight: 800; line-height: 1.42; }.preview-understanding { display: block; position: relative; z-index: 2; max-width: 70%; margin-top: 13rpx; font-size: 21rpx; line-height: 1.5; color: #737c84; }.preview image { position: absolute; right: -18rpx; bottom: -24rpx; width: 240rpx; }
.section-title { display: block; margin: 24rpx 0 11rpx; font-size: 24rpx; font-weight: 760; }.visibility-option { display: flex; align-items: center; gap: 18rpx; min-height: 76rpx; box-sizing: border-box; margin-bottom: 9rpx; padding: 10rpx 20rpx; border: 1rpx solid #e7eae4; border-radius: 18rpx; background: #fff; }.option-icon { display: flex; width: 45rpx; align-items: center; justify-content: center; font-size: 39rpx; }.visibility-option > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3rpx; }.visibility-option > view text:first-child { font-size: 22rpx; font-weight: 750; }.visibility-option > view text:last-child { font-size: 18rpx; color: #8b949b; }.option-radio { display: flex; width: 28rpx; height: 28rpx; align-items: center; justify-content: center; border: 1rpx solid #dce2d9; border-radius: 50%; color: #fff; font-size: 18rpx; }.visibility-option.active .option-radio { border-color: #4d934d; background: #4d934d; }.optional-title { margin-top: 25rpx; }.shell textarea { box-sizing: border-box; width: 100%; min-height: 155rpx; padding: 18rpx; border: 1rpx solid #e6e8e3; border-radius: 17rpx; background: #fff; font-size: 21rpx; }.char-count { display: block; margin-top: 7rpx; text-align: right; color: #9299a0; font-size: 17rpx; }.privacy-note { display: block; margin-top: 12rpx; color: #839086; font-size: 18rpx; line-height: 1.6; }.loading { padding: 70rpx; text-align: center; color: #8d9691; }
.bottom { position: fixed; left: 0; right: 0; bottom: 0; padding: 15rpx 27rpx calc(16rpx + env(safe-area-inset-bottom)); background: #fffefa; }.bottom button { max-width: 696rpx; height: 75rpx; margin: 0 auto; border-radius: 17rpx; background: #20262b; color: #fff; font-size: 24rpx; line-height: 75rpx; }.bottom button::after { border: 0; }
</style>
