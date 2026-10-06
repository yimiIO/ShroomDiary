<template>
	<view class="health-page snapshot-subpage">
		<view class="status-bar" :style="{height:statusBarHeight+'px'}"></view>
		<view class="page-header"><view @tap="goBack">‹</view><text>健康记录</text><view class="space"></view></view>
		<text class="intro">只汇总你在今日快照里亲自记录的步数与睡眠，不伪装成设备自动同步或医学判断。</text>
		<view v-if="loading" class="state">正在读取近 30 天记录…</view>
		<block v-else>
			<view class="summary-grid">
				<view><text>{{ activeDays }}</text><text>有记录天数</text></view>
				<view><text>{{ averageSteps ? averageSteps.toLocaleString() : '—' }}</text><text>平均步数</text></view>
				<view><text>{{ averageSleep || '—' }}</text><text>平均睡眠小时</text></view>
			</view>
			<view v-if="!rows.length" class="state">还没有健康记录</view>
			<view v-else class="record-card">
				<text class="card-title">最近记录</text>
				<view v-for="item in rows" :key="item.day" class="record-row" @tap="openDetail(item)">
					<text>{{ formatDay(item.day) }}</text>
					<text>{{ Number(item.steps) ? `${Number(item.steps).toLocaleString()} 步` : '步数未记' }}</text>
					<text>{{ sleepHours(item) ? `${sleepHours(item)}h` : '睡眠未记' }} ›</text>
				</view>
			</view>
			<view class="trend-entry" @tap="openTrend">查看睡眠趋势 ›</view>
		</block>
	</view>
</template>

<script>
import { getSnapshotHistory } from '@/api/snapshot';
export default{
	data(){return{statusBarHeight:20,loading:true,rows:[]}},
	computed:{activeDays(){return this.rows.length},averageSteps(){const values=this.rows.map(item=>Number(item.steps)||0).filter(Boolean);return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0},averageSleep(){const values=this.rows.map(this.sleepHours).map(Number).filter(Boolean);return values.length?(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1):''}},
	onLoad(){this.statusBarHeight=uni.getSystemInfoSync().statusBarHeight||20;this.load()},onShow(){uni.hideTabBar({animation:false,fail:()=>{}})},
	methods:{goBack(){uni.navigateBack()},async load(){this.loading=true;try{const response=await getSnapshotHistory(30);const payload=response.data||response;this.rows=(payload.days||[]).filter(item=>Number(item.steps)||item.bedtime||item.wake_time)}catch(error){uni.showToast({title:error.message||'健康记录读取失败',icon:'none'})}finally{this.loading=false}},sleepHours(item){if(!item||!item.bedtime||!item.wake_time)return'';const[bh,bm]=item.bedtime.split(':').map(Number);const[wh,wm]=item.wake_time.split(':').map(Number);let minutes=wh*60+wm-(bh*60+bm);if(minutes<=0)minutes+=1440;return(minutes/60).toFixed(1)},formatDay(value){const d=new Date(`${String(value).slice(0,10)}T00:00:00`);return`${d.getMonth()+1}月${d.getDate()}日`},openDetail(item){uni.navigateTo({url:`/pages/snapshot/detail?date=${item.day}`})},openTrend(){uni.navigateTo({url:'/pages/snapshot/trend'})}}
}
</script>

<style lang="scss" scoped>
.health-page{box-sizing:border-box;min-height:100vh;padding:0 28rpx 60rpx;background:#f2f7ee;color:#29322c}.page-header{display:flex;height:96rpx;align-items:center;justify-content:space-between}.page-header>view:first-child,.space{width:62rpx;font-size:56rpx}.page-header>text{font-size:34rpx;font-weight:760}.intro{display:block;padding:23rpx;border-radius:22rpx;background:#e6efdf;color:#667063;font-size:21rpx;line-height:1.6}.state{display:flex;min-height:320rpx;align-items:center;justify-content:center;color:#8b938d}.summary-grid{display:grid;margin-top:20rpx;grid-template-columns:repeat(3,1fr);gap:12rpx}.summary-grid view{display:flex;min-height:150rpx;flex-direction:column;align-items:center;justify-content:center;border-radius:23rpx;background:#fff}.summary-grid text:first-child{font-size:37rpx;font-weight:760;color:#558349}.summary-grid text:last-child{margin-top:8rpx;color:#838b85;font-size:18rpx}.record-card{margin-top:20rpx;padding:26rpx;border-radius:25rpx;background:#fff}.card-title{display:block;margin-bottom:12rpx;font-size:27rpx;font-weight:720}.record-row{display:grid;min-height:75rpx;grid-template-columns:1fr 1fr 1fr;align-items:center;border-top:1rpx solid #edf0ec;color:#647067;font-size:21rpx}.record-row text:last-child{text-align:right}.trend-entry{margin-top:20rpx;padding:23rpx;border-radius:24rpx;background:#fff;color:#527c47;text-align:center;font-size:24rpx;font-weight:700}
</style>
