<template>
	<view class="meal-page snapshot-subpage">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-header">
			<view class="back-btn" @tap="goBack"><text class="back-text">‹</text></view>
			<text class="page-title">{{ editing ? (mealId ? '编辑吃喝记录' : '记个吃喝') : '吃喝记录' }}</text>
			<view class="template-btn" v-if="editing" @tap="useTemplate">套用模板</view>
			<view v-else class="template-btn" @tap="startMeal">＋ 记一餐</view>
		</view>
		<view v-if="!editing" class="date-nav">
			<view @tap="moveDay(-1)">‹ 前一天</view>
			<picker mode="date" :value="date" :end="todayDate" @change="selectDay($event.detail.value)"><text>{{ dateLabel }} ▾</text></picker>
			<view :class="{ muted: date >= todayDate }" @tap="moveDay(1)">后一天 ›</view>
		</view>
		<text v-else class="intro-date">{{ dateLabel }}</text>
		<block v-if="!editing">
			<view v-if="loading" class="record-state">正在读取吃喝记录…</view>
			<view v-else-if="loadError" class="record-state"><text>{{ loadError }}</text><view class="template-btn" @tap="loadRecords()">重新加载</view></view>
			<view v-else-if="!records.length" class="record-state"><text>这一天还没有吃喝记录</text><text class="record-hint">拍张照片，或写下吃了什么。</text></view>
			<view v-for="record in records" :key="record.id" class="card meal-record">
				<view class="section-head"><text class="section-title">{{ typeLabel(record.meal_type) }}<text class="record-time"> {{ clock(record.meal_time) }}</text></text><view class="template-btn" @tap="editRecord(record)">编辑</view></view>
				<text class="record-name">{{ record.name }}</text>
				<text v-if="record.description" class="record-description">{{ record.description }}</text>
				<view class="record-photos"><image v-for="photo in record.media" :key="photo.id" :src="photo.url" mode="aspectFill" @tap="previewRecord(record, photo)" /></view>
				<view v-if="record.dining_way || (record.tags && record.tags.length)" class="record-meta"><text>{{ [record.dining_way].concat(record.tags || []).filter(Boolean).join(' · ') }}</text></view>
			</view>
			<view v-if="!loading && !loadError" class="save-btn" @tap="startMeal">{{ records.length ? '再记一餐' : '记录这一餐' }}</view>
		</block>
		<block v-else>

		<view class="section">
			<text class="section-title">这一餐属于</text>
			<view class="meal-types"><view v-for="item in mealTypes" :key="item.label" :class="{ active: currentType === item.value }" @tap="currentType = item.value">{{ item.label }}</view></view>
		</view>

		<view class="section card">
			<view class="section-head"><text class="section-title">这一餐吃了什么</text><text>{{ dishes.length }}/20</text></view>
			<view class="dish-input-row"><input v-model="dishInput" placeholder="菜名可用顿号、逗号分隔" @confirm="addDish" /><view @tap="addDish">+</view></view>
			<view class="dish-tags"><view v-for="(dish,index) in dishes" :key="dish + index" @tap="removeDish(index)">{{ dish }}　×</view></view>
			<textarea v-model="description" maxlength="500" placeholder="当下感受或这餐的介绍（可选）" />
		</view>

		<view class="section card">
			<view class="section-head"><text class="section-title">照片</text><text>{{ media.length }}/9</text></view>
			<view class="photo-grid">
				<view v-for="photo in media" :key="photo.id" class="photo"><image :src="photo.url" mode="aspectFill" @tap="preview(photo)"/><view @tap="removePhoto(photo)">×</view></view>
				<view v-if="media.length < 9" class="photo-add" @tap="addPhoto">{{ uploading ? `${uploadProgress}%` : '＋ 添加' }}</view>
			</view>
			<text v-if="media.length" class="record-hint">照片已上传，点击“保存这一餐”后会留在吃喝记录里。</text>
		</view>

		<view class="section card prefs">
			<view class="pref-row" @tap="pickWay"><text>就餐方式</text><text>{{ diningWay || '请选择' }} ›</text></view>
			<picker mode="time" :value="mealTime" @change="mealTime = $event.detail.value"><view class="pref-row"><text>就餐时间</text><text>{{ mealTime || '请选择' }} ›</text></view></picker>
			<view class="tags-title">标签（可多选）</view>
			<view class="tag-options"><view v-for="tag in tagOptions" :key="tag" :class="{ active: tags.includes(tag) }" @tap="toggleTag(tag)">{{ tag }}</view></view>
		</view>

		<view class="save-btn" :class="{ disabled: saving || uploading }" @tap="save">{{ saving ? '保存中…' : '保存这一餐' }}</view>
		<view v-if="mealId" class="delete-btn" @tap="removeMeal">删除这餐记录</view>
		</block>
	</view>
</template>

<script>
import { addMeal, deleteMeal, getTodaySnapshot, updateMeal } from '@/api/snapshot';
import { uploadImage } from '@/api/upload';
import wechatPrivacy from '@/utils/wechat-privacy.js';
const { PRIVACY_DENIED_MESSAGE, requireWechatPrivacyAuthorization, isWechatPrivacyDenied } = wechatPrivacy;

export default {
	data() {
		return {
			statusBarHeight: 20, date: '', mealId: '', saving: false, uploading: false, uploadProgress: 0,
			editing: false, records: [], loading: false, loadError: '', initialDraft: '', todayDate: '', requestNumber: 0,
			currentType: 'BREAKFAST', dishInput: '', dishes: [], description: '', diningWay: '', mealTime: '', tags: [], media: [],
			mealTypes: [{label:'早餐',value:'BREAKFAST'},{label:'午餐',value:'LUNCH'},{label:'晚餐',value:'DINNER'},{label:'下午茶',value:'AFTERNOON_TEA'},{label:'夜宵',value:'SUPPER'}],
			tagOptions: ['在家','外食','独处','和朋友','清淡','满足','匆忙','值得记住'],
		}
	},
	computed: { dateLabel() { const d = this.date ? new Date(`${this.date}T00:00:00`) : new Date(); return `${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日 · ${['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]}` } },
	onLoad(options) { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20; this.todayDate = this.localDay(new Date()); this.date = options.date || this.todayDate; this.mealId = options.id || ''; this.loadRecords(this.mealId) },
	onShow() { uni.hideTabBar({ animation: false, fail: () => {} }) },
	methods: {
		goBack() { if (this.saving || this.uploading) return uni.showToast({ title: '请等待保存或上传完成', icon: 'none' }); if (this.editing) { if (this.draftValue() !== this.initialDraft) return uni.showModal({ title: '这一餐还没有保存', content: '离开编辑会放弃本次修改。', confirmText: '继续记录', cancelText: '放弃修改', success: result => { if (result.cancel) this.editing = false } }); this.editing = false; return } if (getCurrentPages().length > 1) uni.navigateBack(); else uni.switchTab({ url: '/pages/snapshot/index' }) },
		localDay(value) { return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}` },
		selectDay(day) { this.date = day; this.loadRecords() },
		moveDay(offset) { const next = new Date(`${this.date}T12:00:00`); next.setDate(next.getDate() + offset); const day = this.localDay(next); if (day <= this.todayDate) this.selectDay(day) },
		typeLabel(value) { const item = this.mealTypes.find(item => item.value === value); return item ? item.label : '加餐' },
		draftValue() { return JSON.stringify([this.currentType, this.dishInput, this.dishes, this.description, this.diningWay, this.mealTime, this.tags, this.media.map(item => item.id)]) },
		startMeal() { const hour = new Date().getHours(); this.mealId = ''; this.currentType = hour < 10 ? 'BREAKFAST' : hour < 14 ? 'LUNCH' : hour < 17 ? 'AFTERNOON_TEA' : hour < 21 ? 'DINNER' : 'SUPPER'; this.dishInput = ''; this.dishes = []; this.description = ''; this.diningWay = ''; this.mealTime = ''; this.tags = []; this.media = []; this.editing = true; this.initialDraft = this.draftValue() },
		editRecord(meal) { this.mealId = meal.id; this.currentType = meal.meal_type; this.dishInput = ''; this.dishes = String(meal.name || '').split('、').filter(Boolean); this.description = meal.description || ''; this.diningWay = meal.dining_way || ''; this.mealTime = this.clock(meal.meal_time); this.tags = [...(meal.tags || [])]; this.media = (meal.media || []).map(item => ({ ...item })); this.editing = true; this.initialDraft = this.draftValue() },
		async loadRecords(editId) { const request = ++this.requestNumber; this.loading = true; this.loadError = ''; this.records = []; try { const response = await getTodaySnapshot(this.date); if (request !== this.requestNumber) return; const payload = response.data || response; this.records = payload.meals || []; if (editId) { const meal = this.records.find(item => item.id === editId); if (meal) this.editRecord(meal); else uni.showToast({ title: '这餐记录不存在，请选择记录日期', icon: 'none' }) } } catch (error) { if (request === this.requestNumber) this.loadError = '记录暂时没有读取成功，请重试' } finally { if (request === this.requestNumber) this.loading = false } },
		previewRecord(record, photo) { uni.previewImage({ current: photo.url, urls: (record.media || []).map(item => item.url) }) },
		addDish() { const value = this.dishInput.trim(); if (!value) return; value.split(/[、，,；;\n]/).forEach(item => { const dish = item.trim(); if (dish && this.dishes.length < 20 && !this.dishes.includes(dish)) this.dishes.push(dish) }); this.dishInput = '' },
		removeDish(index) { this.dishes.splice(index, 1) },
		async loadMeal() { try { const response = await getTodaySnapshot(this.date); const payload = response.data || response; const meal = (payload.meals || []).find(item => item.id === this.mealId); if (!meal) throw new Error('这餐记录不存在'); this.currentType = meal.meal_type; this.dishes = String(meal.name || '').split('、').filter(Boolean); this.description = meal.description || ''; this.diningWay = meal.dining_way || ''; this.mealTime = this.clock(meal.meal_time); this.tags = Array.isArray(meal.tags) ? meal.tags : []; this.media = Array.isArray(meal.media) ? meal.media : [] } catch (error) { uni.showToast({ title: error.message || '记录读取失败', icon: 'none' }) } },
		clock(value) { const match = String(value || '').match(/^(\d{2}:\d{2})/); return match ? match[1] : '' },
		pickWay() { const options = ['自己做','外卖','餐厅','食堂','他人准备']; uni.showActionSheet({ itemList: options, success: value => { this.diningWay = options[value.tapIndex] } }) },
		toggleTag(tag) { this.tags = this.tags.includes(tag) ? this.tags.filter(item => item !== tag) : [...this.tags, tag].slice(0, 8) },
		useTemplate() { const names = ['家常一餐','轻食简记','外食聚餐']; const templates = [{ dishes:['米饭','蔬菜','蛋白质'], way:'自己做', tags:['在家'] },{ dishes:['蔬菜','水果','蛋白质'], way:'', tags:['清淡'] },{ dishes:[], way:'餐厅', tags:['外食','和朋友'] }]; uni.showActionSheet({ itemList: names, success: value => { const item = templates[value.tapIndex]; this.dishes = [...item.dishes]; this.diningWay = item.way; this.tags = [...item.tags] } }) },
		async addPhoto() { if (this.uploading || this.media.length >= 9) return; try { await requireWechatPrivacyAuthorization(); const selected = await new Promise((resolve,reject) => uni.chooseImage({ count: 9 - this.media.length, sourceType:['album','camera'], sizeType:['compressed'], success:resolve, fail:reject })); const paths = selected.tempFilePaths || []; this.uploading = true; for (let index=0; index<paths.length; index+=1) { const response = await this.$http.upload(uploadImage,{ filePath:paths[index],name:'file',getTask:task=>this.trackUpload(task,index,paths.length) }); if (response.code === 200 && response.data && response.data.id) this.media.push({ id:response.data.id,url:response.data.url }) } } catch (error) { if (isWechatPrivacyDenied(error)) uni.showToast({ title:PRIVACY_DENIED_MESSAGE,icon:'none' }); else if (!String((error&&error.errMsg)||error).includes('cancel')) uni.showToast({ title:'照片没有保存成功',icon:'none' }) } finally { this.uploading=false; this.uploadProgress=0 } },
		trackUpload(task,index,total) { if (task && typeof task.onProgressUpdate === 'function') task.onProgressUpdate(event => { const partial=Math.min(99,Number(event.progress)||0)/100; this.uploadProgress=Math.min(99,Math.round((index+partial)/Math.max(1,total)*100)) }) },
		removePhoto(photo) { this.media = this.media.filter(item => item.id !== photo.id) },
		preview(photo) { uni.previewImage({ current:photo.url,urls:this.media.map(item=>item.url) }) },
		async save() { if (this.saving || this.uploading) return; this.addDish(); if (!this.dishes.length && !this.media.length) return uni.showToast({ title:'拍张照片或写下吃了什么',icon:'none' }); this.saving=true; const payload={ meal_type:this.currentType,name:this.dishes.join('、') || '照片记录',description:this.description,dining_way:this.diningWay,meal_time:this.mealTime,tags:this.tags,media_ids:this.media.map(item=>item.id) }; try { const response = this.mealId ? await updateMeal(this.mealId,payload) : await addMeal(payload,this.date); const saved = (response.data || response).meal; if (!saved || !saved.id) throw new Error('未收到保存结果，请重试'); this.mealId = saved.id; this.initialDraft = this.draftValue(); this.records = this.records.filter(item => item.id !== saved.id).concat(saved); this.loadError = ''; this.editing = false; uni.showToast({title:'已保存到吃喝记录',icon:'success'}); } catch(error) { uni.showToast({title:error.message||'保存失败，请重试',icon:'none'}) } finally { this.saving=false } },
		removeMeal() { if (this.saving || this.uploading) return; uni.showModal({ title:'删除这餐记录？',content:'这餐的文字和照片将从吃喝记录中移除，操作无法撤销。',success:async value=>{ if(!value.confirm)return; this.saving=true; try{await deleteMeal(this.mealId);this.records=this.records.filter(item=>item.id!==this.mealId);this.editing=false;uni.showToast({title:'已删除',icon:'none'})}catch(error){uni.showToast({title:error.message||'删除失败',icon:'none'})}finally{this.saving=false} } }) },
	},
}
</script>

<style lang="scss" scoped>
.date-nav{display:flex;align-items:center;justify-content:space-between;margin:18rpx 0 32rpx;font-size:22rpx;color:#547b48}.date-nav .muted{opacity:.3}.record-state{display:flex;min-height:240rpx;flex-direction:column;align-items:center;justify-content:center;gap:20rpx;color:#707b72;font-size:26rpx}.record-hint{display:block;margin-top:16rpx;color:#7e887f;font-size:22rpx;line-height:1.6}.meal-record{margin-bottom:20rpx}.record-time{font-size:22rpx;font-weight:400;color:#7b857d}.record-name{display:block;margin-top:20rpx;font-size:30rpx;line-height:1.5;word-break:break-all}.record-description{display:block;margin-top:12rpx;font-size:25rpx;line-height:1.6;white-space:pre-wrap;color:#637066}.record-photos{display:flex;flex-wrap:wrap;gap:10rpx;margin-top:18rpx}.record-photos image{width:180rpx;height:180rpx;border-radius:16rpx}.record-meta{margin-top:18rpx;font-size:21rpx;color:#879084}
.meal-page{box-sizing:border-box;min-height:100vh;padding:0 28rpx 70rpx;background:#f0f4f2;color:#2b332e}.page-header{display:flex;height:94rpx;align-items:center;justify-content:space-between}.back-btn{width:64rpx}.back-text{font-size:56rpx}.page-title{font-size:32rpx;font-weight:760}.template-btn{color:#56844a;font-size:22rpx}.intro-date{display:block;margin:10rpx 0 28rpx;color:#818981;font-size:24rpx}.section{margin-bottom:22rpx}.section-title{font-size:28rpx;font-weight:700}.section-head{display:flex;align-items:center;justify-content:space-between;color:#858d87;font-size:20rpx}.section-head .section-title{color:#2b332e}.meal-types{display:flex;margin-top:16rpx;gap:10rpx;overflow-x:auto}.meal-types view{flex:0 0 auto;padding:16rpx 21rpx;border-radius:23rpx;background:#fff;color:#6d766f;font-size:22rpx}.meal-types .active{background:#dfeeda;color:#426b38;font-weight:700}.card{padding:28rpx;border-radius:26rpx;background:#fff}.dish-input-row{display:flex;margin-top:18rpx;gap:12rpx}.dish-input-row input{height:76rpx;flex:1;padding:0 20rpx;border-radius:15rpx;background:#f1f4ef;font-size:24rpx}.dish-input-row view{display:flex;width:72rpx;align-items:center;justify-content:center;border-radius:15rpx;background:#e3efdf;color:#548347;font-size:38rpx}.dish-tags,.tag-options{display:flex;margin-top:16rpx;flex-wrap:wrap;gap:10rpx}.dish-tags view,.tag-options view{padding:10rpx 16rpx;border-radius:20rpx;background:#f2ede0;font-size:21rpx}.tag-options .active{background:#dcebd5;color:#47713e}.card textarea{width:100%;min-height:120rpx;margin-top:20rpx;padding-top:18rpx;border-top:1rpx solid #edf0ec;font-size:24rpx}.photo-grid{display:flex;margin-top:18rpx;flex-wrap:wrap;gap:12rpx}.photo,.photo-add{position:relative;width:180rpx;height:180rpx;border-radius:18rpx;overflow:hidden}.photo image{width:100%;height:100%}.photo view{position:absolute;top:8rpx;right:8rpx;display:flex;width:38rpx;height:38rpx;align-items:center;justify-content:center;border-radius:50%;background:rgba(0,0,0,.55);color:#fff}.photo-add{display:flex;align-items:center;justify-content:center;border:2rpx dashed #cfd6cf;color:#8a938b;font-size:22rpx}.pref-row{display:flex;min-height:78rpx;align-items:center;justify-content:space-between;border-bottom:1rpx solid #edf0ec;font-size:24rpx}.pref-row text:last-child{color:#818981}.tags-title{margin-top:22rpx;color:#687169;font-size:22rpx}.save-btn{margin-top:26rpx;padding:25rpx;border-radius:34rpx;background:#659858;color:#fff;text-align:center;font-size:28rpx;font-weight:700}.save-btn.disabled{opacity:.55}.delete-btn{padding:25rpx;color:#9c665f;text-align:center;font-size:23rpx}
</style>
