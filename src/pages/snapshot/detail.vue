<template>
	<view class="detail-page snapshot-subpage">
		<view class="status-bar" :style="{height:statusBarHeight+'px'}"></view>
		<view class="page-header"><view @tap="goBack">‹</view><text>{{ dateLabel }}</text><view class="space"></view></view>
		<view v-if="loading" class="state">正在读取快照…</view>
		<view v-else-if="!hasContent" class="state"><text>这一天还没有记录</text></view>
		<block v-else>
			<view class="card signals">
				<view v-if="snapshot.mood"><text>心情</text><text>{{ moodLabel(snapshot.mood) }}</text></view>
				<view v-if="weatherText"><text>天气</text><text>{{ weatherText }}</text></view>
				<view v-if="Number(snapshot.steps)"><text>步数</text><text>{{ Number(snapshot.steps).toLocaleString() }}</text></view>
				<view v-if="snapshot.bedtime"><text>入睡</text><text>{{ clock(snapshot.bedtime) }}</text></view>
				<view v-if="snapshot.wake_time"><text>起床</text><text>{{ clock(snapshot.wake_time) }}</text></view>
				<view v-if="snapshot.scene"><text>场景</text><text>{{ snapshot.scene }}</text></view>
			</view>
			<view v-if="meals.length" class="card"><text class="card-title">吃喝</text><view v-for="meal in meals" :key="meal.id" class="line" @tap="editMeal(meal)"><text>{{ mealType(meal.meal_type) }}</text><text>{{ meal.name }} ›</text></view></view>
			<view v-if="financeEntries.length" class="card" @tap="openFinance"><text class="card-title">账单</text><view class="line"><text>支出</text><text>¥{{ money(expense) }}</text></view><view class="line"><text>收入</text><text>¥{{ money(income) }}</text></view><view class="line strong"><text>结余</text><text>¥{{ money(income-expense) }} ›</text></view></view>
			<view v-if="meditations.length" class="card"><text class="card-title">冥想</text><view class="line"><text>完成 {{ meditations.length }} 次</text><text>{{ meditationMinutes }} 分钟</text></view></view>
			<view v-if="snapshot.morning_intent" class="card text-card"><text class="card-title">晨间意向</text><text>{{ snapshot.morning_intent }}</text></view>
			<view v-if="snapshot.evening_reflection" class="card text-card"><text class="card-title">晚间反思</text><text>{{ snapshot.evening_reflection }}</text></view>
			<view v-if="snapshot.daily_answer" class="card text-card"><text class="card-title">{{ snapshot.daily_question || '今日一问' }}</text><text>{{ snapshot.daily_answer }}</text></view>
			<view v-if="snapshot.challenge_completed || snapshot.challenge_skipped" class="card"><text class="card-title">今日挑战</text><view class="line"><text>{{ snapshot.challenge_title || '当日挑战' }}</text><text>{{ snapshot.challenge_completed ? '已完成' : '已跳过' }}</text></view></view>
			<view v-if="isToday" class="edit-today" @tap="backToToday">回到今日快照继续记录</view>
			<text v-else class="readonly-note">历史快照只读，避免改写当时的记录。</text>
		</block>
	</view>
</template>

<script>
import { getTodaySnapshot } from '@/api/snapshot';
export default{
	data(){return{statusBarHeight:20,date:'',loading:true,snapshot:{},meals:[],meditations:[],financeEntries:[]}},
	computed:{dateLabel(){const d=this.date?new Date(`${this.date}T00:00:00`):new Date();return`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`},isToday(){const d=new Date();const today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return!this.date||this.date===today},hasContent(){return Boolean(this.snapshot&&this.snapshot.id)||this.meals.length||this.meditations.length||this.financeEntries.length},weatherText(){const name={sunny:'晴',cloudy:'多云',overcast:'阴','light-rain':'小雨','heavy-rain':'大雨',snow:'雪',haze:'雾',windy:'大风'}[this.snapshot.weather_code]||'';return[name,this.snapshot.weather_temp===null||this.snapshot.weather_temp===undefined?'':`${this.snapshot.weather_temp}°`].filter(Boolean).join(' ')},expense(){return this.financeEntries.filter(item=>item.entry_type==='EXPENSE').reduce((sum,item)=>sum+(Number(item.amount)||0),0)},income(){return this.financeEntries.filter(item=>item.entry_type==='INCOME').reduce((sum,item)=>sum+(Number(item.amount)||0),0)},meditationMinutes(){return this.meditations.reduce((sum,item)=>sum+(Number(item.duration_min)||0),0)}},
	onLoad(options){this.statusBarHeight=uni.getSystemInfoSync().statusBarHeight||20;this.date=options.date||'';this.load()},onShow(){uni.hideTabBar({animation:false,fail:()=>{}})},
	methods:{goBack(){uni.navigateBack()},async load(){this.loading=true;try{const response=await getTodaySnapshot(this.date);const payload=response.data||response;this.snapshot=payload.snapshot||{};this.meals=payload.meals||[];this.meditations=payload.meditations||[];this.financeEntries=payload.financeEntries||[]}catch(error){uni.showToast({title:error.message||'快照读取失败',icon:'none'})}finally{this.loading=false}},clock(value){return String(value||'').slice(0,5)},money(value){return(Number(value)||0).toFixed(2)},moodLabel(value){return{super:'超棒',happy:'开心',moved:'感动',heart:'心动',calm:'平静',cozy:'舒服',speechless:'无语',lost:'迷茫',bored:'无聊',tired:'疲惫',irritated:'烦躁',unhappy:'低落',scared:'害怕',shock:'震惊',surprise:'惊讶',terrible:'糟糕',unwell:'难受',angry:'生气',worried:'焦虑',wronged:'委屈'}[value]||value},mealType(value){return{BREAKFAST:'早餐',LUNCH:'午餐',DINNER:'晚餐',AFTERNOON_TEA:'下午茶',SUPPER:'夜宵',BRUNCH:'加餐'}[value]||'一餐'},editMeal(meal){if(this.isToday)uni.navigateTo({url:`/pages/snapshot/meal?id=${meal.id}&date=${this.date}`})},openFinance(){uni.navigateTo({url:`/pages/snapshot/finance?date=${this.date}`})},backToToday(){uni.switchTab({url:'/pages/snapshot/index'})}}
}
</script>

<style lang="scss" scoped>
.detail-page{box-sizing:border-box;min-height:100vh;padding:0 28rpx 60rpx;background:#f2f7ee;color:#29322c}.page-header{display:flex;height:96rpx;align-items:center;justify-content:space-between}.page-header>view:first-child,.space{width:62rpx;font-size:56rpx}.page-header>text{font-size:32rpx;font-weight:750}.state{display:flex;min-height:420rpx;align-items:center;justify-content:center;color:#8b938d}.card{margin-bottom:18rpx;padding:28rpx;border-radius:25rpx;background:#fff}.signals{display:grid;grid-template-columns:repeat(3,1fr);gap:16rpx}.signals view{display:flex;min-height:92rpx;flex-direction:column;align-items:center;justify-content:center;border-radius:18rpx;background:#f2f6ef}.signals text:first-child{color:#858e87;font-size:19rpx}.signals text:last-child{margin-top:7rpx;font-size:25rpx;font-weight:700}.card-title{display:block;margin-bottom:16rpx;color:#4f5c53;font-size:25rpx;font-weight:750}.line{display:flex;min-height:70rpx;align-items:center;justify-content:space-between;border-top:1rpx solid #eef1ed;color:#69736b;font-size:23rpx}.line.strong{color:#334139;font-weight:700}.text-card>text:last-child{font-size:25rpx;line-height:1.7;white-space:pre-wrap}.edit-today{padding:24rpx;border-radius:30rpx;background:#628f56;color:#fff;text-align:center;font-size:26rpx;font-weight:700}.readonly-note{display:block;padding:20rpx;color:#919892;font-size:20rpx;text-align:center}
</style>
