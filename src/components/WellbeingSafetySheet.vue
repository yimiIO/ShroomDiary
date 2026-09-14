<template>
	<view v-if="visible" class="safety-mask" @tap="cancel" @touchmove.stop.prevent>
		<view class="safety-sheet" role="dialog" aria-modal="true" @tap.stop>
			<view class="safety-handle"></view>
			<text class="safety-kicker">AI WELLBEING REVIEW</text>
			<text class="safety-title">结合历史再判断</text>
			<text class="safety-intro">这是一次由你主动发起的第二次分析。AI 会综合当前账户中允许参与分析的身心记录摘要，不会重新读取全部日记。</text>

			<view class="safety-list">
				<view class="safety-row"><text>01</text><view><text>AI 生成·仅供参考</text><text>结果可能不完整、不准确或误解原文，仅供自我观察和就医沟通参考。</text></view></view>
				<view class="safety-row"><text>02</text><view><text>不是诊断或治疗建议</text><text>疾病名称只是待核对的排查方向，不代表患病概率，不替代医生、心理咨询师或其他专业人员。</text></view></view>
				<view class="safety-row"><text>03</text><view><text>不要仅凭本页改变医疗决定</text><text>不要据此开始、停止或更改药物与治疗，也不要因此延误就医。</text></view></view>
				<view class="safety-row"><text>04</text><view><text>紧急情况优先求助</text><text>症状严重、突然出现、持续加重，或出现伤害自己或他人的想法时，请及时联系专业医疗机构或当地紧急服务。</text></view></view>
			</view>

			<view class="privacy-note"><text>隐私与授权</text><text>身心健康信息属于敏感个人信息。只有你主动继续时，本次识别才会把已授权的摘要发送给当前 AI 服务；结果仅保存在你的账户中，不进入发现。</text></view>
			<text class="safety-ack">继续即表示你已阅读并理解上述说明，同意本次 AI 身心线索识别。</text>
			<view class="safety-actions">
				<button class="safety-cancel" @tap.stop="cancel">暂不识别</button>
				<button class="safety-confirm" @tap.stop="confirm">已了解，允许本次识别</button>
			</view>
		</view>
	</view>
</template>

<script>
export default {
	name: 'WellbeingSafetySheet',
	props: { visible: { type: Boolean, default: false } },
	methods: {
		cancel() { this.$emit('cancel'); },
		confirm() { this.$emit('confirm'); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1; border-radius: 0; background: transparent; }
button::after { border: 0; }
.safety-mask { position: fixed; z-index: 9999; top: 0; right: 0; bottom: 0; left: 0; display: flex; align-items: flex-end; justify-content: center; padding: 24rpx; box-sizing: border-box; background: rgba(10,14,11,.62); backdrop-filter: blur(8px); }
.safety-sheet { width: 100%; max-width: 760rpx; max-height: 88vh; padding: 18rpx 30rpx calc(28rpx + env(safe-area-inset-bottom)); box-sizing: border-box; overflow-y: auto; border: 1rpx solid rgba(23,32,25,.08); border-radius: 36rpx 36rpx 26rpx 26rpx; background: #f8f8ef; box-shadow: 0 30rpx 90rpx rgba(8,14,9,.3); color: #172019; }
.safety-handle { width: 64rpx; height: 6rpx; margin: 0 auto 27rpx; border-radius: 6rpx; background: #c9cfc0; }
.safety-kicker { display: block; color: #718047; font-size: 15rpx; font-weight: 750; letter-spacing: 3rpx; }
.safety-title { display: block; margin-top: 12rpx; font-family: Georgia, 'Songti SC', serif; font-size: 34rpx; line-height: 1.4; }
.safety-intro { display: block; margin-top: 16rpx; color: #5f685f; font-size: 20rpx; line-height: 1.68; }
.safety-list { margin-top: 22rpx; padding: 5rpx 21rpx; border-radius: 23rpx; background: #e8edd9; }
.safety-row { display: flex; align-items: flex-start; padding: 15rpx 0; }
.safety-row + .safety-row { border-top: 1rpx solid rgba(23,32,25,.08); }
.safety-row > text { width: 51rpx; flex: 0 0 51rpx; padding-top: 2rpx; color: #7a874f; font-family: Georgia, serif; font-size: 15rpx; }
.safety-row > view { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.safety-row > view text:first-child { font-size: 20rpx; font-weight: 700; }
.safety-row > view text:last-child { margin-top: 6rpx; color: #5f685f; font-size: 18rpx; line-height: 1.58; }
.privacy-note { margin-top: 18rpx; padding: 17rpx 19rpx; border-left: 4rpx solid #7e9254; border-radius: 0 17rpx 17rpx 0; background: #f0f2e8; display: flex; flex-direction: column; }
.privacy-note text:first-child { color: #647441; font-size: 16rpx; font-weight: 750; }
.privacy-note text:last-child { margin-top: 7rpx; color: #687068; font-size: 17rpx; line-height: 1.58; }
.safety-ack { display: block; margin-top: 17rpx; color: #7a827a; font-size: 16rpx; line-height: 1.55; }
.safety-actions { display: flex; gap: 13rpx; margin-top: 23rpx; }
.safety-cancel, .safety-confirm { min-height: 74rpx; padding: 0 20rpx; border-radius: 38rpx; display: flex; align-items: center; justify-content: center; font-size: 20rpx; }
.safety-cancel { width: 32%; border: 1rpx solid rgba(23,32,25,.14); color: #606a61; }
.safety-confirm { min-width: 0; flex: 1; background: #1d271e; color: #f7faef; font-weight: 700; }
@media (min-width: 720px) {
	.safety-mask { align-items: center; padding: 40px; }
	.safety-sheet { max-width: 560px; padding: 22px 28px 28px; border-radius: 28px; }
	.safety-handle { display: none; }
}
</style>
