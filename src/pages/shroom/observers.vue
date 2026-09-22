<template>
	<view class="page">
		<shroom-page-top-spacer />
		<view class="nav"><view class="back" @tap="goBack">‹</view><view><text>MY OBSERVERS</text><text>我的观察席</text></view></view>
		<view class="shell">
			<view class="intro">
				<text class="intro-index">{{ enabledCount }} / {{ observers.length || 5 }}</text>
				<text class="intro-title">决定用哪些眼睛，重新看见自己</text>
				<text class="intro-copy">每个新账号都有五个默认观察席。你可以随时暂停某一席，也可以增加只属于自己的观察角度。设置只影响下一次分析，已经生成的结果不会改变。</text>
			</view>

			<view class="section-head"><text>当前席位</text><text>至少保留 1 席启用</text></view>
			<view class="observer-list">
				<view class="observer" :class="{ off: !item.enabled }" v-for="(item,index) in observers" :key="item.id">
					<view class="observer-number">{{ numberLabel(index) }}</view>
					<view class="observer-copy" @tap="editObserver(item)">
						<view class="observer-name"><text>{{ item.name }}</text><text v-if="item.isSystem">默认</text><text v-else>自定义</text></view>
						<text class="observer-description">{{ item.description || item.instructions }}</text>
						<text class="edit-hint" v-if="!item.isSystem">轻触编辑观察方式</text>
					</view>
					<switch :checked="item.enabled" color="#172019" @change="toggleObserver(item, $event)" />
				</view>
			</view>

			<view class="add-button" @tap="openCreate"><text>＋</text><view><text>增加自定义观察席</text><text>例如：创作者、十年后的我、关系边界</text></view></view>
			<text class="limit-note">最多 20 席。启用越多，一次日记观察需要的模型调用和费用也会增加。</text>
		</view>

		<view class="editor-mask" v-if="editing" @tap="closeEditor">
			<view class="editor" @tap.stop>
				<view class="editor-head"><view><text>{{ form.id ? 'EDIT OBSERVER' : 'NEW OBSERVER' }}</text><text>{{ form.id ? '修改观察席' : '增加观察席' }}</text></view><text @tap="closeEditor">×</text></view>
				<text class="field-label">名字</text>
				<input v-model="form.name" maxlength="80" placeholder="给这个观察角度一个名字" />
				<text class="field-label">一句话说明</text>
				<input v-model="form.description" maxlength="300" placeholder="它主要帮助你看见什么？" />
				<text class="field-label">观察说明</text>
				<textarea v-model="form.instructions" maxlength="3000" placeholder="例如：从十年后的我看来，区分今天的焦虑里哪些会长期重要，哪些只是短期噪音；必须指出依据和不确定性。" />
				<text class="privacy-note">它只在你主动观察日记时生效。AI 会按这段说明分析，但不会把它当作事实替你下结论。</text>
				<view class="editor-actions"><view class="delete" v-if="form.id" @tap="confirmDelete">删除</view><button :disabled="!canSave || saving" @tap="saveObserver">{{ saving ? '保存中…' : '保存并启用' }}</button></view>
			</view>
		</view>
	</view>
</template>

<script>
import { aiObserver, aiObservers } from '@/api/shroom-system';

export default {
	data() {
		return {
			statusBarHeight: 0,
			observers: [],
			editing: false,
			saving: false,
			form: { id: '', name: '', description: '', instructions: '' }
		};
	},
	computed: {
		enabledCount() { return this.observers.filter(item => item.enabled).length; },
		canSave() { return Boolean(this.form.name.trim() && this.form.instructions.trim()); }
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.load();
	},
	methods: {
		async load() {
			try {
				const res = await this.$http.get(aiObservers);
				this.observers = Array.isArray(res.data) ? res.data : [];
			} catch (error) { console.error('加载观察席失败', error); }
		},
		numberLabel(index) { return String(index + 1).padStart(2, '0'); },
		async toggleObserver(item, event) {
			const enabled = Boolean(event.detail.value);
			if (!enabled && this.enabledCount <= 1) {
				item.enabled = true;
				uni.showToast({ title: '至少保留一个观察席', icon: 'none' });
				this.load();
				return;
			}
			const previous = item.enabled;
			item.enabled = enabled;
			try { await this.$http.patch(aiObserver(item.id), { enabled }); }
			catch (error) { item.enabled = previous; this.load(); }
		},
		openCreate() {
			this.form = { id: '', name: '', description: '', instructions: '' };
			this.editing = true;
		},
		editObserver(item) {
			if (item.isSystem) return;
			this.form = { id: item.id, name: item.name, description: item.description || '', instructions: item.instructions || '' };
			this.editing = true;
		},
		closeEditor() { if (!this.saving) this.editing = false; },
		async saveObserver() {
			if (!this.canSave || this.saving) return;
			this.saving = true;
			const payload = { name: this.form.name.trim(), description: this.form.description.trim(), instructions: this.form.instructions.trim(), enabled: true };
			try {
				if (this.form.id) await this.$http.patch(aiObserver(this.form.id), payload);
				else await this.$http.post(aiObservers, payload);
				this.editing = false;
				await this.load();
				uni.showToast({ title: '观察席已保存', icon: 'success' });
			} catch (error) { console.error('保存观察席失败', error); }
			finally { this.saving = false; }
		},
		confirmDelete() {
			uni.showModal({ title: '删除这个观察席？', content: '已经生成的历史分析不会被删除。', confirmColor: '#9a554c', success: result => { if (result.confirm) this.deleteObserver(); } });
		},
		async deleteObserver() {
			if (!this.form.id || this.saving) return;
			this.saving = true;
			try { await this.$http.delete(aiObserver(this.form.id)); this.editing = false; await this.load(); }
			catch (error) { console.error('删除观察席失败', error); }
			finally { this.saving = false; }
		},
		goBack() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/shroom/me' }) }); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1; background: transparent; }
button::after { border: 0; }
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }
.status-bar { background: rgba(241,248,233,.97); }
.nav { height: 112rpx; padding: 0 34rpx; display: flex; align-items: center; border-bottom: 1rpx solid rgba(23,32,25,.07); box-sizing: border-box; }
.back { width: 68rpx; height: 68rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255,255,255,.68); font-size: 50rpx; }
.nav > view:last-child { display: flex; margin-left: 20rpx; flex-direction: column; gap: 4rpx; }
.nav > view:last-child text:first-child { font-size: 16rpx; font-weight: 750; letter-spacing: 2.6rpx; color: #728070; }
.nav > view:last-child text:last-child { font-size: 31rpx; font-weight: 720; }
.shell { width: 100%; max-width: 940rpx; margin: 0 auto; padding: 38rpx 34rpx calc(90rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.intro { position: relative; min-height: 400rpx; padding: 38rpx; overflow: hidden; border-radius: 36rpx; background: #172019; color: #fff; box-sizing: border-box; }
.intro::after { content: ''; position: absolute; right: -90rpx; top: -110rpx; width: 330rpx; height: 330rpx; border: 1rpx solid rgba(255,255,255,.1); border-radius: 50%; box-shadow: 0 0 0 48rpx rgba(255,255,255,.025), 0 0 0 96rpx rgba(255,255,255,.018); }
.intro-index, .intro-title, .intro-copy { position: relative; z-index: 1; display: block; }
.intro-index { font-size: 18rpx; font-weight: 700; letter-spacing: 3rpx; color: #b3c7ae; }
.intro-title { max-width: 560rpx; margin-top: 92rpx; font-family: Georgia, 'Songti SC', serif; font-size: 43rpx; line-height: 1.3; }
.intro-copy { max-width: 650rpx; margin-top: 22rpx; font-size: 21rpx; line-height: 1.7; color: #b8c5b7; }
.section-head { display: flex; margin: 45rpx 5rpx 17rpx; align-items: flex-end; justify-content: space-between; }
.section-head text:first-child { font-size: 27rpx; font-weight: 720; }
.section-head text:last-child { font-size: 18rpx; color: #829080; }
.observer-list { overflow: hidden; border-radius: 31rpx; background: rgba(255,255,255,.72); }
.observer { min-height: 126rpx; padding: 24rpx; display: flex; align-items: center; gap: 19rpx; border-bottom: 1rpx solid rgba(23,32,25,.07); box-sizing: border-box; transition: opacity .2s ease; }
.observer:last-child { border-bottom: 0; }
.observer.off { opacity: .48; }
.observer-number { width: 49rpx; height: 49rpx; flex: 0 0 49rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #e7eee1; font-size: 17rpx; font-weight: 700; color: #647361; }
.observer-copy { min-width: 0; flex: 1; }
.observer-name { display: flex; align-items: center; gap: 10rpx; }
.observer-name text:first-child { font-size: 24rpx; font-weight: 700; }
.observer-name text:last-child { padding: 5rpx 9rpx; border-radius: 999rpx; background: #edf0e8; font-size: 14rpx; color: #788574; }
.observer-description, .edit-hint { display: block; margin-top: 8rpx; font-size: 18rpx; line-height: 1.45; color: #758173; }
.edit-hint { margin-top: 5rpx; color: #9a8464; }
.observer switch { transform: scale(.78); transform-origin: right center; }
.add-button { min-height: 112rpx; margin-top: 18rpx; padding: 24rpx 27rpx; display: flex; align-items: center; gap: 20rpx; border: 1rpx dashed rgba(23,32,25,.2); border-radius: 28rpx; box-sizing: border-box; }
.add-button > text { font-size: 39rpx; font-weight: 300; color: #647361; }
.add-button > view { display: flex; flex-direction: column; gap: 7rpx; }
.add-button > view text:first-child { font-size: 23rpx; font-weight: 690; }
.add-button > view text:last-child { font-size: 17rpx; color: #7d897b; }
.limit-note { display: block; margin: 16rpx 8rpx 0; font-size: 17rpx; line-height: 1.55; color: #8a9588; }
.editor-mask { position: fixed; z-index: 50; inset: 0; padding: 70rpx 28rpx calc(24rpx + env(safe-area-inset-bottom)); display: flex; align-items: flex-end; background: rgba(13,20,15,.46); box-sizing: border-box; }
.editor { width: 100%; max-width: 850rpx; max-height: 90vh; margin: 0 auto; padding: 31rpx; overflow-y: auto; border-radius: 36rpx; background: #fbfcf8; box-sizing: border-box; }
.editor-head { display: flex; align-items: flex-start; justify-content: space-between; }
.editor-head > view { display: flex; flex-direction: column; gap: 7rpx; }
.editor-head > view text:first-child { font-size: 15rpx; font-weight: 750; letter-spacing: 2.3rpx; color: #7a8978; }
.editor-head > view text:last-child { font-size: 31rpx; font-weight: 720; }
.editor-head > text { width: 56rpx; height: 56rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #edf1e9; font-size: 35rpx; }
.field-label { display: block; margin: 26rpx 3rpx 10rpx; font-size: 18rpx; font-weight: 680; color: #657363; }
.editor input, .editor textarea { width: 100%; padding: 19rpx 20rpx; border: 1rpx solid rgba(23,32,25,.08); border-radius: 19rpx; background: #f1f5ed; font-size: 22rpx; color: #172019; box-sizing: border-box; }
.editor input { height: 76rpx; }
.editor textarea { height: 250rpx; line-height: 1.55; }
.privacy-note { display: block; margin: 15rpx 4rpx 0; font-size: 17rpx; line-height: 1.5; color: #889386; }
.editor-actions { display: flex; align-items: center; gap: 14rpx; margin-top: 24rpx; }
.editor-actions button { height: 78rpx; flex: 1; border-radius: 999rpx; background: #172019; color: #fff; font-size: 21rpx; font-weight: 680; }
.editor-actions button[disabled] { opacity: .38; }
.delete { padding: 20rpx; font-size: 20rpx; color: #a05e54; }
@media screen and (min-width: 900px) { .shell { padding-top: 56rpx; } }
</style>
