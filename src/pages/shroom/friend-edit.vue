<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell">
			<view class="header">
				<view class="back" @tap="goBack">‹</view>
				<view class="heading"><text class="kicker">RELATIONSHIP PROFILE</text><text class="title">{{ id ? '编辑关系' : '记住一个人' }}</text></view>
				<view class="save" :class="{ disabled: saving }" @tap="save">{{ saving ? '保存中' : '保存' }}</view>
			</view>

			<view class="intro"><text>关系不是通讯录里的一个名字。写下你们如何相遇、如何彼此影响。</text></view>
			<view class="form-card">
				<view class="field"><text class="label">姓名 *</text><input v-model="form.name" maxlength="120" placeholder="对方是谁" /></view>
				<view class="field-row">
					<view class="field half"><text class="label">关系类型</text><input v-model="form.category" maxlength="48" placeholder="朋友 / 同事" /></view>
					<view class="field score-field"><text class="label">关系分值</text><input v-model="form.relationScore" type="number" maxlength="2" /></view>
				</view>
				<view class="field"><text class="label">关系描述</text><textarea v-model="form.relationship" maxlength="1000" placeholder="你们的关系、重要经历或相处方式" /></view>
				<view class="field"><text class="label">标签</text><input v-model="tagsText" maxlength="500" placeholder="同学，创业，县阳（用逗号分隔）" /></view>
			</view>

			<text class="section-title">联系与背景</text>
			<view class="form-card compact">
				<view class="field"><text class="label">平台 / 联系方式</text><input v-model="form.contact.platform" maxlength="120" placeholder="微信、电话或认识平台" /></view>
				<view class="field-row">
					<view class="field half"><text class="label">职业 / 身份</text><input v-model="form.contact.position" maxlength="120" placeholder="可选" /></view>
					<view class="field half"><text class="label">所在城市</text><input v-model="form.contact.location" maxlength="120" placeholder="可选" /></view>
				</view>
				<view class="field"><text class="label">最近互动日期</text><input v-model="form.lastInteraction" maxlength="10" placeholder="YYYY-MM-DD" /></view>
			</view>
			<view class="privacy-note">这些信息默认只属于你的私密空间，不会出现在发现广场。</view>
		</view>
	</view>
</template>

<script>
import { friendDetail } from '@/api/friend';

export default {
	data() {
		return {
			id: '', statusBarHeight: 0, saving: false, tagsText: '',
			form: { name: '', category: '朋友', relationship: '', relationScore: 4, lastInteraction: '', contact: { platform: '', position: '', location: '' } }
		};
	},
	onLoad(options) {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.id = options.id || '';
		if (this.id) this.load();
	},
	methods: {
		async load() {
			try {
				const res = await this.$http.get(`${friendDetail}/${this.id}`);
				const value = res.data || {};
				this.form = {
					name: value.name || '', category: value.category || '朋友', relationship: value.relationship || '',
					relationScore: value.relationScore || 4, lastInteraction: value.lastInteraction || '',
					contact: { platform: '', position: '', location: '', ...(value.contact || {}) }
				};
				this.tagsText = (value.tags || []).join('，');
			} catch (error) {
				console.error('加载人脉失败', error);
				uni.showToast({ title: '加载失败', icon: 'none' });
			}
		},
		async save() {
			if (this.saving || !this.form.name.trim()) {
				if (!this.form.name.trim()) uni.showToast({ title: '请填写姓名', icon: 'none' });
				return;
			}
			this.saving = true;
			const payload = {
				...this.form,
				relationScore: Math.max(1, Math.min(10, Number(this.form.relationScore) || 4)),
				tags: this.tagsText.split(/[,，]/).map(item => item.trim().replace(/^#/, '')).filter(Boolean).map(item => `#${item}`)
			};
			try {
				if (this.id) await this.$http.put(`${friendDetail}/${this.id}`, payload);
				else await this.$http.post(`${friendDetail}/upsert`, payload);
				uni.showToast({ title: '关系已保存', icon: 'success' });
				setTimeout(() => this.goBack(), 500);
			} catch (error) {
				console.error('保存人脉失败', error);
			} finally {
				this.saving = false;
			}
		},
		goBack() {
			const pages = getCurrentPages();
			if (pages.length > 1) uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/shroom/friends' }) });
			else uni.redirectTo({ url: '/pages/shroom/friends' });
		}
	}
};
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: #f1f8e9; }
.shell { box-sizing: border-box; padding: 32rpx 34rpx 120rpx; }
.header { display: flex; align-items: center; gap: 20rpx; }
.back { display: flex; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.7); font-size: 50rpx; line-height: 1; }
.heading { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 8rpx; }
.kicker { font-size: 17rpx; font-weight: 700; letter-spacing: 2.4rpx; color: #718075; }
.title { font-size: 39rpx; font-weight: 740; }
.save { padding: 18rpx 25rpx; border-radius: 999rpx; background: #172019; color: #fff; font-size: 21rpx; }
.save.disabled { opacity: .55; }
.intro { margin: 40rpx 4rpx 24rpx; font-size: 22rpx; line-height: 1.7; color: #637067; }
.form-card { padding: 7rpx 30rpx; border-radius: 31rpx; background: #fff; box-shadow: 0 16rpx 45rpx rgba(60,78,63,.05); }
.form-card.compact { margin-top: 17rpx; }
.field { box-sizing: border-box; padding: 27rpx 0 24rpx; border-bottom: 1rpx solid #edf1eb; }
.field:last-child { border-bottom: 0; }
.field-row { display: flex; gap: 25rpx; }
.field-row .field { flex: 1; }
.field-row .half:first-child { min-width: 0; }
.score-field { max-width: 150rpx; }
.label { display: block; margin-bottom: 14rpx; font-size: 18rpx; font-weight: 680; letter-spacing: 1rpx; color: #748078; }
input { height: 53rpx; font-size: 25rpx; color: #172019; }
textarea { width: 100%; height: 180rpx; font-size: 24rpx; line-height: 1.65; color: #172019; }
.section-title { display: block; margin: 39rpx 5rpx 17rpx; font-size: 20rpx; font-weight: 700; color: #5f6e62; }
.privacy-note { margin-top: 25rpx; padding: 23rpx 26rpx; border-radius: 23rpx; background: #e4eddc; font-size: 19rpx; line-height: 1.6; color: #59675b; }
/* #ifdef H5 */
@media (min-width: 800px) { .page { box-sizing: border-box; padding-left: 96px; } .status-bar { display: none; } .shell { max-width: 760px; margin: 0 auto; padding: 64px 44px 100px; } }
/* #endif */
</style>
