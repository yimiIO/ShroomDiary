<template>
	<view v-if="visible" class="consent-mask" @tap="cancel" @touchmove.stop.prevent>
		<view class="consent-sheet" role="dialog" aria-modal="true" @tap.stop>
			<view class="consent-handle"></view>
			<view class="consent-kicker">PRIVATE DIARY REVIEW</view>
			<text class="consent-title">{{ title }}</text>
			<text class="consent-reason">{{ reason }}</text>

			<view class="consent-privacy">
				<view class="privacy-row"><text class="privacy-mark">01</text><text>问题只读取与它关联的日记和你在问题内补充的线索</text></view>
				<view class="privacy-row"><text class="privacy-mark">02</text><text>不读取、不引用、也不改写“身心记录”中的数据</text></view>
				<view class="privacy-row"><text class="privacy-mark">03</text><text>只有你主动点击回看时，允许 AI 读取的日记线索才会发送给当前服务</text></view>
			</view>

			<text class="consent-note">这是对私密日记进行跨时间理解的单独授权，也不是医学诊断。</text>
			<view class="consent-actions">
				<button class="consent-cancel" @tap.stop="cancel">先不开始</button>
				<button class="consent-confirm" @tap.stop="confirm">确认，开始观察</button>
			</view>
		</view>
	</view>
</template>

<script>
export default {
	name: 'HealthConsentSheet',
	props: {
		visible: { type: Boolean, default: false },
		inquiryType: { type: String, default: 'PSYCHOLOGICAL' }
	},
	computed: {
		isPhysical() { return this.inquiryType === 'PHYSICAL_HEALTH'; },
		typeName() { return this.isPhysical ? '身体健康观察' : '心理观察'; },
		title() { return this.isPhysical ? '允许 AI 回看相关日记？' : '允许 AI 回看相关日记？'; },
		reason() {
			return this.isPhysical
				? '这个问题需要跨时间比较与它相关的日记，寻找身体变化、基线与可被反驳的原因假设。'
				: '这个问题需要跨时间比较与它相关的日记，寻找心理感受、压力和认知变化中的模式。';
		}
	},
	methods: {
		cancel() { this.$emit('cancel'); },
		confirm() { this.$emit('confirm'); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1; border-radius: 0; background: transparent; }
button::after { border: 0; }
.consent-mask {
	position: fixed;
	z-index: 9999;
	top: 0;
	right: 0;
	bottom: 0;
	left: 0;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	padding: 24rpx;
	box-sizing: border-box;
	background: rgba(10, 14, 11, .58);
	backdrop-filter: blur(8px);
}
.consent-sheet {
	width: 100%;
	max-width: 760rpx;
	padding: 18rpx 30rpx calc(28rpx + env(safe-area-inset-bottom));
	box-sizing: border-box;
	border: 1rpx solid rgba(23, 32, 25, .08);
	border-radius: 36rpx 36rpx 26rpx 26rpx;
	background: #f8f8ef;
	box-shadow: 0 30rpx 90rpx rgba(8, 14, 9, .28);
	color: #172019;
}
.consent-handle { width: 64rpx; height: 6rpx; margin: 0 auto 28rpx; border-radius: 6rpx; background: #c9cfc0; }
.consent-kicker { color: #718047; font-size: 16rpx; font-weight: 750; letter-spacing: 3rpx; }
.consent-title { display: block; margin-top: 14rpx; font-family: Georgia, 'Songti SC', serif; font-size: 36rpx; line-height: 1.38; }
.consent-reason { display: block; margin-top: 18rpx; color: #5f685f; font-size: 22rpx; line-height: 1.72; }
.consent-privacy { margin-top: 26rpx; padding: 8rpx 22rpx; border-radius: 23rpx; background: #e8edd9; }
.privacy-row { display: flex; align-items: flex-start; padding: 17rpx 0; color: #465047; font-size: 20rpx; line-height: 1.6; }
.privacy-row + .privacy-row { border-top: 1rpx solid rgba(23, 32, 25, .08); }
.privacy-mark { width: 52rpx; flex: 0 0 52rpx; padding-top: 2rpx; color: #7a874f; font-family: Georgia, serif; font-size: 16rpx; letter-spacing: 1rpx; }
.privacy-row > text:last-child { flex: 1; }
.consent-note { display: block; margin-top: 20rpx; color: #7a827a; font-size: 18rpx; line-height: 1.6; }
.consent-actions { display: flex; gap: 14rpx; margin-top: 27rpx; }
.consent-cancel, .consent-confirm { height: 74rpx; border-radius: 38rpx; display: flex; align-items: center; justify-content: center; font-size: 21rpx; }
.consent-cancel { width: 34%; border: 1rpx solid rgba(23, 32, 25, .14); color: #606a61; }
.consent-confirm { flex: 1; background: #1d271e; color: #f7faef; font-weight: 700; }
@media (min-width: 720px) {
	.consent-mask { align-items: center; padding: 40px; }
	.consent-sheet { max-width: 560px; padding: 22px 28px 28px; border-radius: 28px; }
	.consent-handle { display: none; }
}
</style>
