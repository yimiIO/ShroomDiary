<template>
	<view class="meal-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-header">
			<view class="back-btn" @tap="goBack"><text class="back-text">‹</text></view>
			<text class="page-title">记个吃喝</text>
			<view class="template-btn" @tap="useTemplate">
				<text class="template-text">📋 吃喝模板</text>
			</view>
		</view>

		<view class="intro">
			<text class="eyebrow">MEAL NOTE</text>
			<text class="intro-date">{{ dateLabel }}</text>
			<text class="intro-desc">记录这一餐，也可套用模板。</text>
		</view>

		<!-- 餐次选择 -->
		<view class="section">
			<view class="section-head">
				<text class="section-title">这一餐属于</text>
				<text class="section-note">各餐次按方案限额</text>
			</view>
			<view class="meal-types">
				<view
					v-for="t in mealTypes"
					:key="t.name"
					class="meal-type"
					:class="{ active: currentType === t.name }"
					@tap="currentType = t.name"
				>
					<image class="meal-type-icon" :src="t.icon" mode="aspectFit" />
					<text class="meal-type-name">{{ t.name }}</text>
				</view>
			</view>
		</view>

		<!-- 菜名 -->
		<view class="section card">
			<view class="section-head">
				<text class="section-title">这一餐吃了什么 <text class="required">必填</text></text>
				<text class="section-note">已录 {{ dishes.length }}/20</text>
			</view>
			<view class="dish-input-row">
				<input class="dish-input" v-model="dishInput" placeholder="输入菜名，例如红烧肉、青菜、米饭" @confirm="addDish" />
				<view class="dish-add" @tap="addDish">+</view>
			</view>
			<view class="dish-tags" v-if="dishes.length">
				<view class="dish-tag" v-for="(d,i) in dishes" :key="i" @tap="removeDish(i)">
					<text>{{ d }}</text><text class="tag-x">×</text>
				</view>
			</view>
			<text class="dish-hint">顿号、逗号、分号或换行都会自动分开</text>
		</view>

		<!-- 描述 -->
		<view class="section card">
			<textarea class="desc-input" v-model="description" placeholder="写下自己当下的感受或者介绍一下每个菜的…" maxlength="500" />
		</view>

		<!-- 图片 -->
		<view class="photo-grid">
			<view class="photo-add" @tap="addPhoto">
				<text class="photo-plus">+</text>
				<text class="photo-count">0/18</text>
				<text class="photo-label">图片</text>
			</view>
		</view>

		<!-- 用餐偏好 -->
		<view class="section card pref-section">
			<view class="section-head">
				<text class="section-title">用餐偏好</text>
				<text class="section-note">方式 · 时间 · 标签</text>
			</view>
			<view class="pref-row" @tap="pickWay">
				<view class="pref-icon green">🍽</view>
				<text class="pref-name">就餐方式</text>
				<text class="pref-value">请选择 ›</text>
			</view>
			<view class="pref-row" @tap="pickTime">
				<view class="pref-icon blue">🕐</view>
				<text class="pref-name">就餐时间</text>
				<text class="pref-value">请选择 ›</text>
			</view>
			<view class="pref-row" @tap="pickTags">
				<view class="pref-icon pink">🏷</view>
				<text class="pref-name">标签</text>
				<text class="pref-value">请选择 ›</text>
			</view>
		</view>

		<view class="save-btn" @tap="save">保存这一餐</view>
	</view>
</template>

<script>
import { addMeal } from '@/api/snapshot';

export default {
	data() {
		return {
			statusBarHeight: 20,
			currentType: '早餐',
			dishInput: '',
			dishes: [],
			description: '',
			mealTypes: [
				{ name: '早餐', icon: '/static/snapshot/icons/ic-book.png' },
				{ name: '午餐', icon: '/static/snapshot/icons/ic-book.png' },
				{ name: '晚餐', icon: '/static/snapshot/icons/ic-book.png' },
				{ name: '下午茶', icon: '/static/snapshot/icons/ic-book.png' },
				{ name: '夜宵', icon: '/static/snapshot/icons/ic-book.png' },
			]
		}
	},
	computed: {
		dateLabel() {
			const d = new Date()
			return `${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日 · ${['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]}`
		}
	},
	onLoad() { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20 },
	methods: {
		goBack() { uni.navigateBack() },
		addDish() {
			const v = this.dishInput.trim()
			if (!v) return
			v.split(/[、，,；;\n]/).forEach(d => {
				if (d.trim() && this.dishes.length < 20) this.dishes.push(d.trim())
			})
			this.dishInput = ''
		},
		removeDish(i) { this.dishes.splice(i,1) },
		addPhoto() {},
		pickWay() {}, pickTime() {}, pickTags() {},
		useTemplate() {},
		async save() {
			if (!this.dishes.length) {
				uni.showToast({ title: '先写下这一餐吃了什么', icon: 'none' })
				return
			}
			const mealTypes = {
				早餐: 'BREAKFAST', 午餐: 'LUNCH', 晚餐: 'DINNER', 下午茶: 'AFTERNOON_TEA', 夜宵: 'SUPPER'
			}
			try {
				await addMeal({
					meal_type: mealTypes[this.currentType] || 'BRUNCH',
					name: this.dishes.join('、'),
					description: this.description
				})
				uni.showToast({ title: '已保存', icon: 'success' })
				setTimeout(() => uni.navigateBack(), 500)
			} catch (error) {}
		}
	}
}
</script>

<style lang="scss" scoped>
.meal-page { min-height: 100vh; background: #F0F4F2; padding: 0 30rpx 60rpx; }
.page-header { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0 20rpx; }
.back-text { font-size: 56rpx; color: #666; }
.page-title { font-size: 36rpx; font-weight: 700; color: #333; }
.template-btn { background: #e8f5e9; padding: 12rpx 24rpx; border-radius: 30rpx; }
.template-text { font-size: 24rpx; color: #7CAE5A; }

.intro { padding: 20rpx 0 30rpx; }
.eyebrow { font-size: 22rpx; color: #7CAE5A; letter-spacing: 2rpx; display: block; }
.intro-date { font-size: 40rpx; font-weight: 700; color: #333; display: block; margin-top: 8rpx; }
.intro-desc { font-size: 24rpx; color: #999; display: block; margin-top: 8rpx; }

.section { margin-bottom: 24rpx; }
.section-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20rpx; }
.section-title { font-size: 30rpx; font-weight: 600; color: #333;
	.required { font-size: 22rpx; color: #E06B6B; font-weight: 400; } }
.section-note { font-size: 22rpx; color: #999; }

.meal-types { display: flex; gap: 16rpx; overflow-x: auto; }
.meal-type { flex-shrink: 0; width: 140rpx; background: #fff; border-radius: 20rpx; padding: 20rpx 10rpx; display: flex; flex-direction: column; align-items: center;
	&.active { background: #e8f5e9; border: 2rpx solid #7CAE5A; } }
.meal-type-icon { width: 60rpx; height: 60rpx; margin-bottom: 10rpx; }
.meal-type-name { font-size: 24rpx; color: #333; }

.card { background: #fff; border-radius: 24rpx; padding: 30rpx; }
.dish-input-row { display: flex; gap: 16rpx; align-items: center; }
.dish-input { flex: 1; background: #e8f0e3; border-radius: 16rpx; padding: 24rpx; font-size: 28rpx; }
.dish-add { width: 72rpx; height: 72rpx; background: #e8f5e9; color: #7CAE5A; border-radius: 16rpx; text-align: center; line-height: 72rpx; font-size: 40rpx; }
.dish-tags { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 20rpx; }
.dish-tag { background: #f0ebdd; border-radius: 20rpx; padding: 10rpx 20rpx; font-size: 24rpx; color: #333; display: flex; align-items: center; gap: 8rpx;
	.tag-x { color: #999; } }
.dish-hint { font-size: 22rpx; color: #bbb; margin-top: 16rpx; display: block; }

.desc-input { width: 100%; height: 160rpx; font-size: 28rpx; color: #999; }

.photo-grid { margin-bottom: 24rpx; }
.photo-add { width: 200rpx; height: 200rpx; border: 2rpx dashed #d0d0d0; border-radius: 20rpx; display: flex; flex-direction: column; align-items: center; justify-content: center;
	.photo-plus { font-size: 60rpx; color: #bbb; }
	.photo-count { font-size: 22rpx; color: #bbb; margin-top: 8rpx; }
	.photo-label { font-size: 22rpx; color: #bbb; } }

.pref-section .pref-row { display: flex; align-items: center; gap: 20rpx; padding: 24rpx 0; border-bottom: 1rpx solid #f0f0f0;
	&:last-child { border-bottom: none; } }
.pref-icon { width: 56rpx; height: 56rpx; border-radius: 16rpx; text-align: center; line-height: 56rpx; font-size: 28rpx;
	&.green { background: #e8f5e9; } &.blue { background: #e3f0fa; } &.pink { background: #fce4ec; } }
.pref-name { font-size: 28rpx; color: #333; flex: 1; }
.pref-value { font-size: 26rpx; color: #bbb; }

.save-btn { background: #7CAE5A; border-radius: 40rpx; padding: 28rpx; text-align: center; margin-top: 20rpx;
	text { color: #fff; font-size: 30rpx; font-weight: 600; } }
</style>
