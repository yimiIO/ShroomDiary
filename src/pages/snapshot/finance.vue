<template>
	<view class="finance-page snapshot-subpage">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-header">
			<view class="back-btn" @tap="goBack"><text class="back-text">‹</text></view>
			<text class="page-title">今日账单</text>
			<view class="header-space"></view>
		</view>

		<view class="summary-card">
			<text class="summary-date">{{ dateLabel }}</text>
			<text class="balance-title">今日结余</text>
			<view class="balance-amount"><text>¥</text><text>{{ money(balance) }}</text></view>
			<view class="two-col">
				<view><text class="label">支出 · {{ expenseCount }} 笔</text><text class="expense">¥{{ money(expense) }}</text></view>
				<view><text class="label">收入 · {{ incomeCount }} 笔</text><text class="income">¥{{ money(income) }}</text></view>
			</view>
		</view>

		<view v-if="loading" class="state-card">正在读取账单…</view>
		<view v-else-if="!entries.length" class="state-card">
			<text class="empty-title">今天还没有账单</text>
			<text class="empty-desc">记录第一笔真实收支，结余会自动计算。</text>
		</view>
		<view v-else class="entry-list">
			<view v-for="entry in entries" :key="entry.id" class="entry-row">
				<view class="entry-main">
					<text class="entry-category">{{ entry.category || (entry.entry_type === 'INCOME' ? '收入' : '支出') }}</text>
					<text class="entry-note">{{ [clock(entry.occurred_at), entry.note].filter(Boolean).join(' · ') || '未填写备注' }}</text>
				</view>
				<text :class="entry.entry_type === 'INCOME' ? 'entry-income' : 'entry-expense'">{{ entry.entry_type === 'INCOME' ? '+' : '-' }}¥{{ money(entry.amount) }}</text>
				<view class="delete-entry" @tap="remove(entry)">删除</view>
			</view>
		</view>

		<view class="fab" @tap="openForm">+</view>
		<view v-if="showForm" class="mask" @tap="showForm = false"></view>
		<view v-if="showForm" class="sheet">
			<view class="handle"></view>
			<text class="sheet-title">记一笔真实收支</text>
			<view class="type-row">
				<view :class="{ active: form.entry_type === 'EXPENSE' }" @tap="setType('EXPENSE')">支出</view>
				<view :class="{ active: form.entry_type === 'INCOME' }" @tap="setType('INCOME')">收入</view>
			</view>
			<view class="amount-row"><text>¥</text><input v-model="form.amount" type="digit" maxlength="12" placeholder="0.00" /></view>
			<view class="category-row">
				<view v-for="item in categoryOptions" :key="item" :class="{ active: form.category === item }" @tap="form.category = item">{{ item }}</view>
			</view>
			<picker mode="time" :value="form.occurred_at" @change="form.occurred_at = $event.detail.value">
				<view class="field-row"><text>发生时间</text><text>{{ form.occurred_at }} ›</text></view>
			</picker>
			<input class="note-input" v-model="form.note" maxlength="240" placeholder="备注（可选）" />
			<view class="save-button" :class="{ disabled: saving }" @tap="save">{{ saving ? '保存中…' : '保存这笔账' }}</view>
		</view>
	</view>
</template>

<script>
import { addSnapshotFinance, deleteSnapshotFinance, getSnapshotFinance } from '@/api/snapshot';

export default {
	data() {
		return {
			statusBarHeight: 20, date: '', loading: true, saving: false, showForm: false,
			entries: [], expense: 0, income: 0, balance: 0,
			form: { entry_type: 'EXPENSE', amount: '', category: '餐饮', note: '', occurred_at: this.nowTime() },
		}
	},
	computed: {
		dateLabel() { const d = this.date ? new Date(`${this.date}T00:00:00`) : new Date(); return `${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日 · ${['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]}` },
		expenseCount() { return this.entries.filter(item => item.entry_type === 'EXPENSE').length },
		incomeCount() { return this.entries.filter(item => item.entry_type === 'INCOME').length },
		categoryOptions() { return this.form.entry_type === 'INCOME' ? ['工资','副业','红包','退款','其他'] : ['餐饮','交通','购物','居家','健康','其他'] },
	},
	onLoad(options) { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20; this.date = options.date || '' },
	onShow() { uni.hideTabBar({ animation: false, fail: () => {} }); this.load() },
	methods: {
		nowTime() { const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` },
		goBack() { uni.navigateBack() },
		money(value) { return (Number(value) || 0).toFixed(2) },
		clock(value) { const match = String(value || '').match(/^(\d{2}:\d{2})/); return match ? match[1] : '' },
		async load() {
			this.loading = true
			try {
				const response = await getSnapshotFinance(this.date)
				const payload = response.data || response
				this.entries = Array.isArray(payload.entries) ? payload.entries : []
				this.expense = Number(payload.expense) || 0; this.income = Number(payload.income) || 0; this.balance = Number(payload.balance) || 0
			} catch (error) { uni.showToast({ title: error.message || '账单读取失败', icon: 'none' }) }
			finally { this.loading = false }
		},
		openForm() { this.form = { entry_type: 'EXPENSE', amount: '', category: '餐饮', note: '', occurred_at: this.nowTime() }; this.showForm = true },
		setType(type) { this.form.entry_type = type; this.form.category = type === 'INCOME' ? '工资' : '餐饮' },
		async save() {
			if (this.saving) return
			if (!(Number(this.form.amount) > 0)) return uni.showToast({ title: '填写大于 0 的金额', icon: 'none' })
			this.saving = true
			try { await addSnapshotFinance(this.form, this.date); this.showForm = false; await this.load(); uni.showToast({ title: '已记入账单', icon: 'success' }) }
			catch (error) { uni.showToast({ title: error.message || '保存失败', icon: 'none' }) }
			finally { this.saving = false }
		},
		remove(entry) {
			uni.showModal({ title: '删除这笔记录？', content: '删除后今日结余会重新计算。', success: async value => {
				if (!value.confirm) return
				try { await deleteSnapshotFinance(entry.id); await this.load(); uni.showToast({ title: '已删除', icon: 'none' }) }
				catch (error) { uni.showToast({ title: error.message || '删除失败', icon: 'none' }) }
			} })
		},
	},
}
</script>

<style lang="scss" scoped>
.finance-page { box-sizing: border-box; min-height: 100vh; padding: 0 28rpx 150rpx; background: #f0f4f2; color: #29312c; }
.page-header { display: flex; height: 96rpx; align-items: center; justify-content: space-between; }.back-btn,.header-space{width:64rpx}.back-text{font-size:56rpx}.page-title{font-size:34rpx;font-weight:750}
.summary-card,.state-card,.entry-list{border-radius:28rpx;background:#fff}.summary-card{padding:34rpx}.summary-date,.label{display:block;color:#8a918c;font-size:22rpx}.balance-title{display:block;margin-top:25rpx;font-size:27rpx}.balance-amount{display:flex;margin-top:8rpx;align-items:baseline;gap:8rpx;font-size:34rpx}.balance-amount text:last-child{font-size:68rpx;font-weight:780}.two-col{display:flex;margin-top:30rpx;padding-top:26rpx;border-top:1rpx solid #edf0ec}.two-col>view{flex:1}.two-col>view+view{padding-left:28rpx;border-left:1rpx solid #edf0ec}.expense,.income{display:block;margin-top:8rpx;font-size:34rpx;font-weight:700}.expense,.entry-expense{color:#c36e62}.income,.entry-income{color:#55915f}
.state-card{display:flex;min-height:300rpx;margin-top:22rpx;flex-direction:column;align-items:center;justify-content:center;color:#7c857f;font-size:24rpx}.empty-title{color:#3c463f;font-size:30rpx;font-weight:700}.empty-desc{margin-top:12rpx}.entry-list{margin-top:22rpx;overflow:hidden}.entry-row{display:flex;min-height:112rpx;padding:22rpx 24rpx;box-sizing:border-box;align-items:center;border-bottom:1rpx solid #edf0ec}.entry-main{display:flex;min-width:0;flex:1;flex-direction:column}.entry-category{font-size:27rpx;font-weight:650}.entry-note{margin-top:7rpx;overflow:hidden;color:#929892;font-size:20rpx;text-overflow:ellipsis;white-space:nowrap}.entry-expense,.entry-income{font-size:27rpx;font-weight:700}.delete-entry{margin-left:18rpx;color:#a08882;font-size:20rpx}
.fab{position:fixed;right:38rpx;bottom:48rpx;display:flex;width:104rpx;height:104rpx;align-items:center;justify-content:center;border-radius:50%;background:#4c9b70;color:#fff;font-size:58rpx;box-shadow:0 10rpx 25rpx rgba(57,117,83,.25)}.mask{position:fixed;z-index:20;inset:0;background:rgba(20,29,23,.42)}.sheet{position:fixed;z-index:21;right:0;bottom:0;left:0;padding:18rpx 30rpx calc(34rpx + env(safe-area-inset-bottom));border-radius:34rpx 34rpx 0 0;background:#fff}.handle{width:70rpx;height:8rpx;margin:0 auto 22rpx;border-radius:8rpx;background:#d7dcd8}.sheet-title{display:block;font-size:32rpx;font-weight:750}.type-row{display:flex;margin-top:24rpx;padding:6rpx;border-radius:20rpx;background:#f1f3f0}.type-row view{flex:1;padding:17rpx;text-align:center;color:#727a74}.type-row .active{border-radius:16rpx;background:#fff;color:#355743;font-weight:700}.amount-row{display:flex;margin-top:22rpx;align-items:center;border-bottom:1rpx solid #e8ece8;font-size:42rpx}.amount-row input{height:100rpx;flex:1;font-size:58rpx}.category-row{display:flex;margin-top:20rpx;flex-wrap:wrap;gap:12rpx}.category-row view{padding:13rpx 20rpx;border-radius:24rpx;background:#f1f4ef;color:#6f776f;font-size:22rpx}.category-row .active{background:#dcebd4;color:#416b36}.field-row{display:flex;padding:28rpx 4rpx;justify-content:space-between;border-bottom:1rpx solid #edf0ec;font-size:25rpx}.note-input{height:84rpx;border-bottom:1rpx solid #edf0ec;font-size:25rpx}.save-button{margin-top:24rpx;padding:24rpx;border-radius:30rpx;background:#5b9250;color:#fff;text-align:center;font-size:28rpx;font-weight:700}.save-button.disabled{opacity:.55}
</style>
