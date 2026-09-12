<template>
	<view class="page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="shell" v-if="item">
			<view class="header"><button class="back" @tap="goBack">‹</button><view class="heading"><text class="kicker">LIFE OS · {{ item.section }}</text><text class="title">{{ item.stableKey }} · {{ item.name }}</text></view></view>
			<view class="state-line"><text>{{ item.status === 'PAUSED' ? '暂停维护' : '长期维护中' }}</text><text>{{ item.relatedRecordCount }} 条关联记录</text></view>

			<view class="editor">
				<text class="field-label">它是什么</text>
				<input v-model="form.name" class="title-input" maxlength="120" placeholder="长期事项名称" />
				<textarea v-model="form.description" class="textarea" maxlength="3000" auto-height :show-confirm-bar="false" placeholder="说明为什么这件事值得长期维护，不必写成口号。" />
				<text class="field-label">最低行动</text>
				<textarea v-model="form.minimumAction" class="textarea compact" maxlength="2000" auto-height :show-confirm-bar="false" placeholder="即使状态一般，也做得到的最小动作。" />
				<text class="field-label">当前下一步</text>
				<textarea v-model="form.currentNextStep" class="textarea compact" maxlength="1000" auto-height :show-confirm-bar="false" placeholder="这周真正要推进的一小步，不会自动创建待办。" />
				<view class="inline-fields"><view><text class="field-label">优先顺序</text><input v-model="form.priority" class="number-input" type="number" maxlength="2" /></view><view><text class="field-label">维护状态</text><picker :range="statusOptions" range-key="label" :value="statusIndex" @change="changeStatus"><view class="picker">{{ statusOptions[statusIndex].label }}　⌄</view></picker></view></view>
				<button class="primary" :disabled="saving" @tap="confirmSave">{{ saving ? '保存中…' : '保存修改' }}</button>
				<button class="focus-action" @tap="confirmFocusChange">{{ item.isWeekFocus ? '移出本周关注' : '加入本周关注' }}</button>
				<text class="decision-note">名称、描述和动作可以随时修订；这里没有“永久完成”。调整优先顺序与本周关注都由你确认。</text>
			</view>

			<view class="section">
				<view class="section-head"><view><text class="section-kicker">RELATED DIARIES</text><text class="section-title">关联日记</text></view></view>
				<view v-if="relatedRecords.length" class="links">
					<view v-for="link in relatedRecords" :key="link.id" class="link" :class="{ invalid: !link.sourceValid }">
						<view class="link-head" @tap="openDiary(link)"><text>{{ link.sourceDate || '来源日期未知' }}</text><text>{{ link.origin === 'AI' ? 'AI 关联' : '手动关联' }}{{ !link.sourceValid ? ' · 原文已变更' : '' }}　›</text></view>
						<text class="excerpt">{{ link.evidenceExcerpt || link.summary }}</text>
						<text class="summary" v-if="link.summary">{{ link.summary }}</text>
						<view class="type-row" v-if="link.sourceValid"><button v-for="type in recordTypes" :key="type.value" :class="{ active: link.recordType === type.value }" @tap="changeLinkType(link, type.value)">{{ type.label }}</button></view>
						<button class="remove" @tap="removeLink(link)">取消关联</button>
					</view>
				</view>
				<text v-else class="empty">还没有关联记录。日记分析发现真实相关内容时会显示；普通关联无需确认，也可以随时取消或纠正类型。</text>
			</view>

			<view class="section">
				<view class="section-head"><view><text class="section-kicker">RULES & ASSETS</text><text class="section-title">规则与资产</text></view></view>
				<view v-for="ref in references" :key="ref.id" class="reference"><view @tap="openReference(ref)"><text>{{ referenceTypeLabel(ref.refType) }}</text><text>{{ ref.label }}</text></view><button @tap="removeReference(ref)">移除</button></view>
				<view class="existing-reference-picker">
					<text>关联已有内容</text>
					<view class="reference-tabs"><button v-for="type in referenceTypes" :key="type.value" :class="{ active: referenceType === type.value }" @tap="referenceType = type.value">{{ type.label }}</button></view>
					<view v-for="option in availableReferenceOptions" :key="option.id" class="reference-option" @tap="addExistingReference(option)"><view><text>{{ option.label }}</text><text>{{ option.status || '' }}</text></view><text>＋</text></view>
					<text v-if="!availableReferenceOptions.length" class="empty-option">没有更多可关联的{{ referenceTypeLabel(referenceType) }}</text>
				</view>
				<view class="reference-form"><input v-model="assetLabel" maxlength="240" placeholder="资产名称，例如：项目复盘模板" /><input v-model="assetUrl" maxlength="2000" placeholder="https:// 链接" /><button :disabled="addingReference" @tap="addReference">{{ addingReference ? '保存中…' : '保存资产引用' }}</button></view>
				<text class="asset-note">这里只保存引用。把内容升级为正式人生原则，仍需在“判断原则与版本”中由你确认签发。</text>
			</view>

			<view class="section history-section">
				<view class="section-head"><view><text class="section-kicker">REVISION HISTORY</text><text class="section-title">修订历史</text></view></view>
				<view v-for="entry in history" :key="entry.id" class="history"><text>{{ formatDate(entry.createdAt) }} · {{ entry.changeType === 'EDIT' ? '编辑前版本' : entry.changeType }}</text><text>{{ entry.snapshot.name || '' }}{{ entry.snapshot.currentNextStep ? ' · ' + entry.snapshot.currentNextStep : '' }}</text></view>
				<text v-if="!history.length" class="empty">第一次修订后，这里会留下可回看的历史。</text>
			</view>
		</view>
	</view>
</template>

<script>
import { lifeOsPlanFocus, lifeOsPlanHome, lifeOsPlanItem, lifeOsPlanLink, lifeOsPlanReference, lifeOsPlanReferences } from '@/api/shroom-system';

export default {
	data() {
		return {
			statusBarHeight: 0, key: '', item: null, relatedRecords: [], references: [], history: [], saving: false,
			addingReference: false, assetLabel: '', assetUrl: '', form: {}, referenceOptions: { TODO: [], CARD: [], INQUIRY: [] }, referenceType: 'TODO',
			referenceTypes: [{ value: 'TODO', label: '待办' }, { value: 'CARD', label: '菇卡' }, { value: 'INQUIRY', label: '未解之问' }],
			statusOptions: [{ value: 'ACTIVE', label: '维护中' }, { value: 'PAUSED', label: '暂停维护' }],
			recordTypes: [{ value: 'PLAN', label: '计划' }, { value: 'ACTION', label: '行动' }, { value: 'RESULT', label: '结果' }, { value: 'OBSERVATION', label: '观察' }, { value: 'INQUIRY', label: '疑问' }]
		};
	},
	computed: {
		statusIndex() { return Math.max(0, this.statusOptions.findIndex(option => option.value === this.form.status)); },
		availableReferenceOptions() { const used = new Set(this.references.filter(ref => ref.refType === this.referenceType).map(ref => ref.refId)); return (this.referenceOptions[this.referenceType] || []).filter(option => !used.has(option.id)).slice(0, 8); }
	},
	onLoad(options) { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; this.key = options.key || ''; this.load(); },
	methods: {
		async load() {
			try {
				const res = await this.$http.get(lifeOsPlanItem(this.key)); const data = res.data || {};
				this.item = data.item || null; this.relatedRecords = data.relatedRecords || []; this.references = data.references || []; this.history = data.history || []; this.referenceOptions = data.referenceOptions || { TODO: [], CARD: [], INQUIRY: [] };
				if (this.item) this.form = { name: this.item.name, description: this.item.description, minimumAction: this.item.minimumAction, currentNextStep: this.item.currentNextStep, priority: String(this.item.priority), status: this.item.status };
			} catch (error) { console.error('加载长期事项失败', error); }
		},
		changeStatus(event) { this.form.status = this.statusOptions[Number(event.detail.value || 0)].value; },
		confirmSave() {
			uni.showModal({ title: '保存这次修订？', content: '会保留修改前版本。暂停维护不会删除历史记录。', confirmText: '确认保存', success: result => { if (result.confirm) this.save(); } });
		},
		async save() {
			if (this.saving) return; this.saving = true;
			try { await this.$http.patch(lifeOsPlanItem(this.key), { ...this.form, priority: Number(this.form.priority || this.item.priority) }); await this.load(); uni.showToast({ title: '已保存修订', icon: 'success' }); }
			catch (error) { console.error('保存长期事项失败', error); }
			finally { this.saving = false; }
		},
		async confirmFocusChange() {
			const home = await this.$http.get(lifeOsPlanHome); const keys = (home.data.focus || []).map(value => value.stableKey);
			const isFocus = keys.includes(this.key); const next = isFocus ? keys.filter(key => key !== this.key) : [...keys, this.key];
			if (next.length > 3) return uni.showToast({ title: '本周重点最多 3 项，请先移出一项', icon: 'none' });
			uni.showModal({ title: isFocus ? '移出本周关注？' : '加入本周关注？', content: '只影响本周关注，不改变长期事项本身。', confirmText: '确认', success: async result => { if (!result.confirm) return; await this.$http.put(lifeOsPlanFocus, { itemKeys: next }); await this.load(); } });
		},
		async changeLinkType(link, recordType) { if (!link.sourceValid || link.recordType === recordType) return; try { await this.$http.patch(lifeOsPlanLink(link.id), { recordType }); await this.load(); } catch (error) { console.error('纠正记录类型失败', error); } },
		removeLink(link) { uni.showModal({ title: '取消这条关联？', content: '不会删除日记或人生 OS 事项。', confirmText: '取消关联', success: async result => { if (!result.confirm) return; await this.$http.delete(lifeOsPlanLink(link.id)); await this.load(); } }); },
		async addReference() { if (!this.assetLabel.trim() || !/^https?:\/\//i.test(this.assetUrl.trim())) return uni.showToast({ title: '请填写名称和 http(s) 链接', icon: 'none' }); this.addingReference = true; try { await this.$http.post(lifeOsPlanReferences(this.key), { refType: 'EXTERNAL_ASSET', label: this.assetLabel.trim(), externalUrl: this.assetUrl.trim() }); this.assetLabel = ''; this.assetUrl = ''; await this.load(); } catch (error) { console.error('保存引用失败', error); } finally { this.addingReference = false; } },
		async addExistingReference(option) { if (!option || this.addingReference) return; this.addingReference = true; try { await this.$http.post(lifeOsPlanReferences(this.key), { refType: this.referenceType, refId: option.id, label: option.label }); await this.load(); uni.showToast({ title: '已关联', icon: 'success' }); } catch (error) { console.error('关联已有内容失败', error); } finally { this.addingReference = false; } },
		removeReference(ref) { uni.showModal({ title: '移除资产引用？', content: '不会删除原始资产。', confirmText: '移除', success: async result => { if (!result.confirm) return; await this.$http.delete(lifeOsPlanReference(ref.id)); await this.load(); } }); },
		referenceTypeLabel(value) { return { TODO: '待办', CARD: '菇卡', INQUIRY: '未解之问', EXTERNAL_ASSET: '外部资产' }[value] || value; },
		openReference(ref) {
			if (ref.refType !== 'EXTERNAL_ASSET' || !ref.externalUrl) return;
			// #ifdef H5
			window.open(ref.externalUrl, '_blank', 'noopener');
			// #endif
			// #ifndef H5
			uni.setClipboardData({ data: ref.externalUrl });
			// #endif
		},
		openDiary(link) { if (link.diaryId) uni.navigateTo({ url: `/pages/diary/edit?id=${link.diaryId}` }); },
		formatDate(value) { return value ? String(value).replace('T', ' ').slice(0, 16) : ''; },
		goBack() { uni.navigateBack({ fail: () => uni.navigateTo({ url: '/pages/shroom/life-os-plan' }) }); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1; background: transparent; border: 0; } button::after { border: 0; }
.page { min-height: 100vh; background: #f1f8e9; color: #172019; }.status-bar { background: #f1f8e9; }.shell { box-sizing: border-box; padding: 30rpx 34rpx 130rpx; }
.header { display: flex; align-items: flex-start; gap: 20rpx; }.back { display: flex; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.7); font-size: 50rpx; }.heading { display: flex; min-width: 0; flex: 1; flex-direction: column; }.kicker,.section-kicker { color: #718075; font-size: 15rpx; font-weight: 720; letter-spacing: 2.2rpx; }.title { margin-top: 9rpx; font-family: Georgia,'Songti SC',serif; font-size: 36rpx; font-weight: 700; line-height: 1.35; }
.state-line { display: flex; justify-content: space-between; margin-top: 28rpx; padding: 17rpx 21rpx; border-radius: 20rpx; background: #dfe9d6; color: #57665a; font-size: 17rpx; }
.editor,.section { margin-top: 23rpx; padding: 29rpx; border-radius: 31rpx; background: #fff; }.field-label { display: block; margin: 22rpx 0 10rpx; color: #66736a; font-size: 16rpx; font-weight: 710; letter-spacing: 1rpx; }.field-label:first-child { margin-top: 0; }.title-input,.textarea,.number-input,.picker { width: 100%; box-sizing: border-box; border: 1rpx solid #e1e6df; border-radius: 19rpx; background: #f7f9f5; color: #172019; }.title-input { height: 82rpx; padding: 0 19rpx; font-size: 23rpx; font-weight: 670; }.textarea { min-height: 150rpx; margin-top: 12rpx; padding: 18rpx 19rpx; font-size: 20rpx; line-height: 1.6; }.textarea.compact { min-height: 104rpx; }.inline-fields { display: flex; gap: 16rpx; }.inline-fields > view { flex: 1; min-width: 0; }.number-input,.picker { height: 76rpx; padding: 0 18rpx; font-size: 20rpx; }.picker { display: flex; align-items: center; }.primary,.focus-action { width: 100%; margin-top: 24rpx; padding: 24rpx; border-radius: 999rpx; background: #172019; color: #fff; font-size: 20rpx; font-weight: 700; }.focus-action { margin-top: 13rpx; border: 1rpx solid #dce2d9; background: #fff; color: #59665b; }.decision-note,.asset-note { display: block; margin-top: 18rpx; color: #7b867e; font-size: 16rpx; line-height: 1.55; }
.section-head > view { display: flex; flex-direction: column; gap: 8rpx; }.section-title { font-family: Georgia,'Songti SC',serif; font-size: 27rpx; font-weight: 680; }.links { margin-top: 18rpx; }.link { padding: 22rpx 0; border-top: 1rpx solid #e9ede7; }.link.invalid { opacity: .55; }.link-head { display: flex; justify-content: space-between; gap: 15rpx; color: #718075; font-size: 16rpx; }.excerpt,.summary { display: block; margin-top: 12rpx; font-size: 20rpx; line-height: 1.55; }.summary { color: #748078; font-size: 17rpx; }.type-row { display: flex; flex-wrap: wrap; gap: 8rpx; margin-top: 15rpx; }.type-row button { padding: 10rpx 14rpx; border-radius: 999rpx; background: #edf1e9; color: #6f7a71; font-size: 15rpx; }.type-row button.active { background: #dce9d5; color: #405644; font-weight: 700; }.remove { margin-top: 15rpx; color: #9a655d; font-size: 16rpx; }.empty { display: block; margin-top: 20rpx; color: #7b867e; font-size: 18rpx; line-height: 1.6; }
.reference { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; padding: 19rpx 0; border-bottom: 1rpx solid #e9ede7; }.reference > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }.reference > view text:first-child { color: #748078; font-size: 14rpx; }.reference > view text:last-child { font-size: 19rpx; }.reference > button { color: #90645e; font-size: 16rpx; }.reference-form { margin-top: 21rpx; padding: 19rpx; border-radius: 21rpx; background: #f3f6ef; }.reference-form input { height: 70rpx; padding: 0 15rpx; border-bottom: 1rpx solid #dde4da; font-size: 18rpx; }.reference-form button { width: 100%; margin-top: 15rpx; padding: 20rpx; border-radius: 999rpx; background: #dfe9d6; color: #405543; font-size: 18rpx; font-weight: 680; }
.existing-reference-picker { margin-top: 21rpx; padding: 19rpx; border-radius: 21rpx; background: #f5f7f2; }.existing-reference-picker > text:first-child { font-size: 18rpx; font-weight: 690; }.reference-tabs { display: flex; gap: 7rpx; margin-top: 14rpx; }.reference-tabs button { padding: 10rpx 14rpx; border-radius: 999rpx; background: #e8ede5; color: #687469; font-size: 15rpx; }.reference-tabs button.active { background: #172019; color: #fff; }.reference-option { display: flex; align-items: center; justify-content: space-between; gap: 13rpx; padding: 15rpx 0; border-bottom: 1rpx solid #e2e7df; }.reference-option > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4rpx; }.reference-option > view text:first-child { display: -webkit-box; overflow: hidden; font-size: 17rpx; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.reference-option > view text:last-child { color: #859087; font-size: 13rpx; }.reference-option > text { color: #607062; font-size: 24rpx; }.empty-option { display: block; margin-top: 15rpx; color: #859087; font-size: 15rpx; }
.history { display: flex; padding: 18rpx 0; flex-direction: column; gap: 7rpx; border-bottom: 1rpx solid #e9ede7; }.history text:first-child { color: #7c877f; font-size: 15rpx; }.history text:last-child { font-size: 18rpx; line-height: 1.5; }
/* #ifdef H5 */
@media (min-width:980px) { .page { box-sizing:border-box; padding-left:96px; }.status-bar { display:none; }.shell { max-width:820px; margin:0 auto; padding:64px 44px 100px; } }
/* #endif */
</style>
