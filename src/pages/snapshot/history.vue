<template>
	<view class="history-page snapshot-subpage">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-header"><view @tap="goBack">‹</view><text>历史快照</text><view class="space"></view></view>
		<view v-if="loading" class="state">正在读取真实记录…</view>
		<view v-else-if="!groups.length" class="state"><text>还没有历史快照</text><text>从今天的一项真实记录开始。</text></view>
		<view v-for="group in groups" :key="group.month" class="month-group">
			<text class="month-label">{{ group.month }}</text>
			<view v-for="item in group.items" :key="item.day" class="snapshot-card" @tap="viewDetail(item)">
				<view class="card-date"><text>{{ dayLabel(item.day) }}</text><text>{{ weekLabel(item.day) }}</text></view>
				<view class="signals">
					<text v-if="item.mood">心情 {{ moodLabel(item.mood) }}</text>
					<text v-if="item.weather_code || item.weather_temp !== null">{{ weatherLabel(item) }}</text>
					<text v-if="Number(item.steps)">步数 {{ Number(item.steps).toLocaleString() }}</text>
					<text v-if="sleepHours(item)">睡眠 {{ sleepHours(item) }}h</text>
					<text v-if="item.scene">{{ item.scene }}</text>
					<text v-if="Number(item.meal_count)">吃喝 {{ item.meal_count }} 餐</text>
					<text v-if="Number(item.finance_count)">账单 {{ item.finance_count }} 笔</text>
					<text v-if="Number(item.meditation_minutes)">冥想 {{ item.meditation_minutes }} 分钟</text>
				</view>
				<text class="arrow">›</text>
			</view>
		</view>
	</view>
</template>

<script>
import { getSnapshotHistory } from '@/api/snapshot';
export default {
	data(){return{statusBarHeight:20,loading:true,list:[]}},
	computed:{groups(){const grouped={};this.list.forEach(item=>{const key=String(item.day).slice(0,7);(grouped[key]||(grouped[key]=[])).push(item)});return Object.keys(grouped).sort().reverse().map(key=>{const [year,month]=key.split('-');return{month:`${year}年${Number(month)}月`,items:grouped[key]}})}},
	onLoad(){this.statusBarHeight=uni.getSystemInfoSync().statusBarHeight||20},
	onShow(){uni.hideTabBar({animation:false,fail:()=>{}});this.load()},
	methods:{
		goBack(){uni.navigateBack()},
		async load(){this.loading=true;try{const response=await getSnapshotHistory(90);const payload=response.data||response;this.list=Array.isArray(payload.days)?payload.days:[]}catch(error){this.list=[];uni.showToast({title:error.message||'历史记录读取失败',icon:'none'})}finally{this.loading=false}},
		viewDetail(item){uni.navigateTo({url:`/pages/snapshot/detail?date=${item.day}`})},
		dayLabel(value){const d=new Date(`${String(value).slice(0,10)}T00:00:00`);return `${d.getMonth()+1}月${d.getDate()}日`},
		weekLabel(value){const d=new Date(`${String(value).slice(0,10)}T00:00:00`);return['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]},
		moodLabel(value){return{super:'超棒',happy:'开心',moved:'感动',heart:'心动',calm:'平静',cozy:'舒服',speechless:'无语',lost:'迷茫',bored:'无聊',tired:'疲惫',irritated:'烦躁',unhappy:'低落',scared:'害怕',shock:'震惊',surprise:'惊讶',terrible:'糟糕',unwell:'难受',angry:'生气',worried:'焦虑',wronged:'委屈'}[value]||value},
		weatherLabel(item){const name={sunny:'晴',cloudy:'多云',overcast:'阴','light-rain':'小雨','heavy-rain':'大雨',snow:'雪',haze:'雾',windy:'大风'}[item.weather_code]||'';return[name,item.weather_temp===null||item.weather_temp===undefined?'':`${item.weather_temp}°`].filter(Boolean).join(' ')},
		sleepHours(item){if(!item.bedtime||!item.wake_time)return'';const [bh,bm]=item.bedtime.split(':').map(Number);const [wh,wm]=item.wake_time.split(':').map(Number);let minutes=wh*60+wm-(bh*60+bm);if(minutes<=0)minutes+=1440;return(minutes/60).toFixed(1)},
	}
}
</script>

<style lang="scss" scoped>
.history-page{box-sizing:border-box;min-height:100vh;padding:0 28rpx 60rpx;background:#f2f7ee;color:#29322c}.page-header{display:flex;height:96rpx;align-items:center;justify-content:space-between}.page-header>view:first-child,.space{width:62rpx;font-size:56rpx}.page-header>text{font-size:34rpx;font-weight:760}.state{display:flex;min-height:420rpx;flex-direction:column;align-items:center;justify-content:center;gap:12rpx;color:#8b938d;font-size:24rpx}.month-group{margin-top:18rpx}.month-label{display:block;margin:0 6rpx 14rpx;color:#7a837c;font-size:23rpx;font-weight:650}.snapshot-card{display:flex;margin-bottom:14rpx;padding:25rpx;border-radius:24rpx;background:#fff;align-items:center}.card-date{display:flex;width:128rpx;flex-direction:column}.card-date text:first-child{font-size:27rpx;font-weight:700}.card-date text:last-child{margin-top:5rpx;color:#939a94;font-size:20rpx}.signals{display:flex;min-width:0;flex:1;flex-wrap:wrap;gap:8rpx}.signals text{padding:7rpx 11rpx;border-radius:15rpx;background:#f1f5ef;color:#677168;font-size:19rpx}.arrow{margin-left:10rpx;color:#9da49e;font-size:40rpx}
</style>
