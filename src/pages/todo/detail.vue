<template>
	<view class="detail-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="navbar"><button @tap="goBack">‹</button><text>待办详情</text><button @tap="edit">调整</button></view>
		<scroll-view v-if="task" class="content" scroll-y>
			<view class="hero">
				<view class="status-line"><text>{{ statusLabel }}</text><text v-if="task.isOverdue" class="overdue">已过截止日期</text></view>
				<text class="title">{{ task.title }}</text>
				<text v-if="task.description" class="description">{{ task.description }}</text>
				<text v-else class="description muted">还没有行动说明；标题已经足够开始。</text>
			</view>

			<view class="actions">
				<button v-if="task.status === 'pending'" class="primary" @tap="changeStatus('START')">开始推进</button>
				<button v-if="task.status === 'in_progress'" class="primary" @tap="openResultSheet">记录结果并完成</button>
				<button v-if="task.status === 'pending'" @tap="openResultSheet">标记完成</button>
				<button v-if="task.status === 'completed'" class="primary" @tap="openResultSheet">补充完成结果</button>
				<button v-if="task.status === 'completed'" @tap="changeStatus('RESTORE')">恢复为未完成</button>
				<button v-if="task.status === 'cancelled'" class="primary" @tap="changeStatus('REOPEN')">重新打开</button>
			</view>

			<view class="section settings">
				<text class="section-title">安排</text>
				<view v-if="task.projectName"><text>项目</text><text>{{ task.projectName }}</text></view>
				<view><text>安排日期</text><text>{{ task.scheduledDate || '未设置' }}</text></view>
				<view><text>截止日期</text><text>{{ task.deadline || '未设置' }}</text></view>
				<view><text>重复</text><text>{{ task.recurrence ? task.recurrence.label : '不重复' }}</text></view>
				<view v-if="task.compoundItemName"><text>复利方向</text><text>{{ task.compoundItemName }}</text></view>
			</view>

			<view v-if="task.status === 'completed' || task.result || (task.resultMedia && task.resultMedia.length)" class="section result">
				<text class="section-title">完成结果</text><text>{{ task.result || '已完成，暂未补充结果。' }}</text><text class="result-time">实际完成于 {{ formatTime(task.completedAt) }}</text>
				<view v-if="task.resultMedia && task.resultMedia.length" class="result-media"><image v-for="media in task.resultMedia" :key="media.id" :src="media.url" mode="aspectFill" @tap="previewResultMedia(media)" /></view>
			</view>

			<view v-if="task.sourceCompoundThreadId" class="section compound">
				<text class="section-title">复利系统</text><text>这条待办来自一次真实推进，返回时会带回已经确认的背景。</text><button @tap="openCompound">继续协作　›</button>
			</view>

			<view v-if="task.linkedDiaries && task.linkedDiaries.length" class="section">
				<text class="section-title">相关日记</text><button v-for="diary in task.linkedDiaries" :key="diary.id" class="diary-link" @tap="openDiary(diary)"><text>{{ diary.date }}</text><text>{{ diary.excerpt || '语音日记' }}</text><text>›</text></button>
			</view>

			<view v-if="task.events && task.events.length" class="section history">
				<text class="section-title">历史</text><view v-for="event in task.events" :key="event.id" :class="{ invalid: !event.valid }"><text>{{ eventLabel(event.type) }}</text><text>{{ formatTime(event.createdAt) }}</text></view>
			</view>
			<view class="secondary-actions"><button v-if="task.recurrence && task.recurrence.status === 'ACTIVE'" @tap="stopRepeat">停止未来重复</button><button v-if="!['completed','cancelled'].includes(task.status)" @tap="changeStatus(task.recurrenceRuleId ? 'SKIP' : 'CANCEL')">{{ task.recurrenceRuleId ? '跳过本次' : '取消待办' }}</button></view>
			<view class="bottom-space"></view>
		</scroll-view>

		<view v-if="showResultSheet" class="mask" @tap="showResultSheet = false"><view class="sheet" @tap.stop><view class="handle"></view><text class="sheet-title">实际发生了什么？</text><textarea v-model="resultText" maxlength="5000" auto-height placeholder="结果可以以后再补，不写也能完成" /><view v-if="resultAttachments.length" class="attachment-strip"><view v-for="media in resultAttachments" :key="media.id"><image :src="media.url" mode="aspectFill" /><button @tap="removeAttachment(media)">×</button></view></view><button class="attach-button" :disabled="uploading || resultAttachments.length >= 9" @tap="chooseAttachment">{{ uploading ? `正在保存 ${uploadProgress}%` : '＋ 添加结果照片' }}</button><view class="result-note"><text>系统会留下独立行动记录</text><text>不会伪造或修改你的日记正文。</text></view><button class="confirm" :disabled="saving || uploading" @tap="complete">{{ saving ? '保存中…' : (task.status === 'completed' ? '保存结果' : '确认完成') }}</button></view></view>
	</view>
</template>

<script>
import { todoDetail, todoResult, todoStatus } from '@/api/todo';
import { uploadImage } from '@/api/upload';
export default {
	data() { return { statusBarHeight: 0, taskId: '', task: null, timeZone: this.localTimeZone(), showResultSheet: false, resultText: '', resultAttachments: [], uploading: false, uploadProgress: 0, saving: false }; },
	computed: { statusLabel() { return { pending: '待做', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }[this.task.status] || ''; } },
	onLoad(options) { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; this.taskId = options.id; }, onShow() { this.load(); },
	methods: {
		localTimeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; } catch (_) { return 'Asia/Shanghai'; } },
		requestId() { return `todo-action-${Date.now()}-${Math.random().toString(16).slice(2)}`; },
		async load() { try { const res = await this.$http.get(todoDetail, { id: this.taskId, timeZone: this.timeZone }); if (res.code !== 200) throw new Error(res.message); this.task = res.data; this.resultText = res.data.result || ''; this.resultAttachments = res.data.resultMedia || []; } catch (e) { uni.showToast({ title: e.message || '待办加载失败', icon: 'none' }); } },
		openResultSheet() { this.resultText = this.task.result || ''; this.resultAttachments = [...(this.task.resultMedia || [])]; this.showResultSheet = true; },
		async changeStatus(action) { try { const res = await this.$http.patch(todoStatus, { id: this.task.id, action, version: this.task.version, operationId: this.requestId(), timeZone: this.timeZone }); if (res.code !== 200) throw new Error(res.message); this.task = { ...this.task, ...res.data }; uni.showToast({ title: action === 'START' ? '已经开始推进' : '状态已更新', icon: 'none' }); this.load(); } catch (e) { uni.showToast({ title: e.message || '操作失败', icon: 'none' }); } },
		async complete() { if (this.saving || this.uploading) return; this.saving = true; try { const operationId = this.requestId(); const payload = { id: this.task.id, version: this.task.version, result: this.resultText, resultMediaIds: this.resultAttachments.map(item => item.id), operationId, timeZone: this.timeZone }; const editingResult = this.task.status === 'completed'; const res = await this.$http.patch(editingResult ? todoResult : todoStatus, editingResult ? payload : { ...payload, action: 'COMPLETE' }); if (res.code !== 200) throw new Error(res.message); this.task = { ...this.task, ...res.data }; this.showResultSheet = false; uni.showToast({ title: editingResult ? '完成结果已更新' : '已完成并留下行动记录', icon: 'none' }); this.load(); } catch (e) { uni.showToast({ title: e.message || '结果保存失败', icon: 'none' }); } finally { this.saving = false; } },
		async chooseAttachment() { if (this.uploading || this.resultAttachments.length >= 9) return; try { const selected = await new Promise((resolve, reject) => uni.chooseImage({ count: 9 - this.resultAttachments.length, sizeType: ['compressed'], success: resolve, fail: reject })); const paths = selected.tempFilePaths || []; this.uploading = true; for (let index = 0; index < paths.length; index += 1) { this.uploadProgress = Math.round(index / Math.max(1, paths.length) * 100); const response = await this.$http.upload(uploadImage, { filePath: paths[index], name: 'file', getTask: task => this.trackUpload(task, index, paths.length) }); if (response.code === 200 && response.data && response.data.id) this.resultAttachments.push({ id: response.data.id, url: response.data.url }); } this.uploadProgress = 100; } catch (error) { if (!String((error && error.errMsg) || error).includes('cancel')) uni.showToast({ title: '结果照片没有保存成功', icon: 'none' }); } finally { this.uploading = false; } },
		trackUpload(task, index, total) { if (task && typeof task.onProgressUpdate === 'function') task.onProgressUpdate(event => { const partial = Math.min(99, Number(event.progress) || 0) / 100; this.uploadProgress = Math.min(99, Math.round((index + partial) / Math.max(1, total) * 100)); }); },
		removeAttachment(media) { this.resultAttachments = this.resultAttachments.filter(item => item.id !== media.id); },
		previewResultMedia(media) { uni.previewImage({ current: media.url, urls: this.task.resultMedia.map(item => item.url) }); },
		stopRepeat() { uni.showModal({ title: '停止未来重复？', content: '只影响未来尚未开始的实例，过去记录会保留。', success: async value => { if (!value.confirm) return; try { const res = await this.$http.post(`/todos/v1/recurrences/${this.task.recurrenceRuleId}/stop`, { timeZone: this.timeZone }); if (res.code !== 200) throw new Error(res.message); this.load(); } catch (e) { uni.showToast({ title: e.message || '停止失败', icon: 'none' }); } } }); },
		edit() { uni.navigateTo({ url: `/pages/todo/edit?id=${this.taskId}` }); },
		openCompound() { uni.navigateTo({ url: `/pages/shroom/compound?threadId=${this.task.sourceCompoundThreadId}` }); },
		openDiary(diary) { uni.navigateTo({ url: `/pages/diary/edit?id=${diary.id}&date=${diary.date}` }); },
		formatTime(value) { if (!value) return ''; const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`; },
		eventLabel(type) { return { CREATED: '创建待办', UPDATED: '调整待办', STARTED: '开始推进', COMPLETED: '完成行动', RESULT_UPDATED: '补充完成结果', RESTORED: '恢复为未完成', CANCELLED: '取消待办', SKIPPED: '跳过本次', DIARY_LINKED: '关联日记' }[type] || type; },
		goBack() { uni.navigateBack(); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; border: 0; background: transparent; line-height: 1; } button::after { border: 0; }
.detail-page { min-height: 100vh; background: #f3f1e9; color: #27322a; }
.navbar { display: flex; align-items: center; padding: 24rpx 30rpx 19rpx; } .navbar > text { flex: 1; text-align: center; font: 700 29rpx/1.2 Georgia, 'Songti SC', serif; } .navbar button { min-width: 70rpx; color: #637067; font-size: 23rpx; } .navbar button:last-child { text-align: right; }
.content { height: calc(100vh - 120rpx - env(safe-area-inset-top)); }
.hero { display: flex; flex-direction: column; margin: 12rpx 30rpx; padding: 31rpx 28rpx; border-radius: 27rpx; background: #25352a; color: #fff; }
.status-line { display: flex; justify-content: space-between; color: #c1cbbd; font-size: 18rpx; letter-spacing: 1rpx; } .status-line .overdue { color: #ffc7bd; }
.title { margin-top: 19rpx; font: 700 34rpx/1.45 Georgia, 'Songti SC', serif; overflow-wrap: anywhere; }
.description { margin-top: 18rpx; color: #d2d8d0; font-size: 22rpx; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; } .description.muted { color: #9fab9f; }
.actions { display: flex; gap: 14rpx; padding: 14rpx 30rpx; } .actions button { display: flex; min-height: 74rpx; flex: 1; align-items: center; justify-content: center; border: 1rpx solid #cfd5ca; border-radius: 21rpx; background: #fffdf7; color: #526057; font-size: 21rpx; } .actions button.primary { border-color: #52643d; background: #dfe8bd; color: #3f5031; font-weight: 700; }
.section { display: flex; flex-direction: column; margin: 18rpx 30rpx; padding: 26rpx; border: 1rpx solid rgba(39,52,42,.08); border-radius: 24rpx; background: rgba(255,253,247,.78); }
.section-title { margin-bottom: 18rpx; color: #6d786f; font-size: 19rpx; font-weight: 700; letter-spacing: 1rpx; }
.settings > view { display: flex; justify-content: space-between; gap: 24rpx; padding: 13rpx 0; color: #5f6a62; font-size: 21rpx; } .settings > view text:first-child { color: #89908b; }
.result > text:nth-child(2), .compound > text:nth-child(2) { font-size: 23rpx; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; } .result-time { margin-top: 15rpx; color: #8b938d; font-size: 18rpx; }
.result-media, .attachment-strip { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 18rpx; } .result-media image, .attachment-strip image { width: 150rpx; height: 150rpx; border-radius: 17rpx; background: #e5e7e0; } .attachment-strip > view { position: relative; } .attachment-strip button { position: absolute; top: -8rpx; right: -8rpx; display: flex; width: 34rpx; height: 34rpx; align-items: center; justify-content: center; border-radius: 50%; background: #28342c; color: #fff; font-size: 22rpx; }
.compound button { margin-top: 18rpx; color: #52643d; font-size: 21rpx; text-align: left; }
.diary-link { display: grid; grid-template-columns: 110rpx 1fr 20rpx; align-items: center; gap: 12rpx; padding: 14rpx 0; border-top: 1rpx solid rgba(39,52,42,.08); text-align: left; } .diary-link text { min-width: 0; color: #6f7971; font-size: 19rpx; } .diary-link text:nth-child(2) { overflow: hidden; color: #3d4940; text-overflow: ellipsis; white-space: nowrap; }
.history > view { display: flex; justify-content: space-between; padding: 12rpx 0; color: #566259; font-size: 19rpx; } .history > view text:last-child { color: #8a928c; } .history > view.invalid { opacity: .42; text-decoration: line-through; }
.secondary-actions { display: flex; justify-content: center; gap: 34rpx; padding: 18rpx 30rpx; } .secondary-actions button { color: #8d625b; font-size: 19rpx; }
.bottom-space { height: 90rpx; }
.mask { position: fixed; z-index: 500; inset: 0; display: flex; align-items: flex-end; background: rgba(18,26,20,.34); } .sheet { width: 100%; padding: 14rpx 30rpx calc(28rpx + env(safe-area-inset-bottom)); box-sizing: border-box; border-radius: 32rpx 32rpx 0 0; background: #fbfaf4; } .handle { width: 64rpx; height: 6rpx; margin: 0 auto 23rpx; border-radius: 5rpx; background: #c7cdc5; } .sheet-title { font: 700 29rpx/1.3 Georgia, 'Songti SC', serif; } .sheet textarea { width: 100%; min-height: 130rpx; margin-top: 20rpx; padding: 19rpx; box-sizing: border-box; border-radius: 20rpx; background: #fff; font-size: 23rpx; line-height: 1.55; overflow-wrap: anywhere; }
.result-note { display: flex; flex-direction: column; gap: 6rpx; margin-top: 15rpx; color: #7a837c; font-size: 18rpx; } .confirm { display: flex; width: 100%; height: 79rpx; align-items: center; justify-content: center; margin-top: 22rpx; border-radius: 22rpx; background: #26372b; color: #fff; font-size: 23rpx; }
.attach-button { display: flex; min-height: 62rpx; align-items: center; justify-content: center; margin-top: 17rpx; border: 1rpx dashed #aeb8aa; border-radius: 18rpx; color: #59685b; font-size: 20rpx; }
@media (min-width: 900px) { .detail-page { width: 760px; min-height: 820px; margin: 36px auto; border-radius: 28px; } .sheet { max-width: 700px; margin: 0 auto 30px; border-radius: 28px; } }
</style>
