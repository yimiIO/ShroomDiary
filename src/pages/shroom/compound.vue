<template>
	<view class="compound-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-shell">
			<view class="topbar">
				<button class="back-button" aria-label="返回" @tap="goBack">‹</button>
				<view class="topbar-copy"><text class="topbar-kicker">COMPOUND SYSTEM</text><text class="topbar-title">复利系统</text></view>
				<button class="more-button" aria-label="查看长期方向" @tap="openDirections">•••</button>
			</view>

			<view v-if="loading" class="state-card"><view class="loading-dot"></view><text>正在找回上次停留的位置</text></view>
			<view v-else-if="loadError" class="state-card error"><text>推进记录暂时没有读到</text><button class="pill-button dark" @tap="loadHome">重新读取</button></view>

			<template v-else-if="home.needsOnboarding">
				<view class="onboarding-hero">
					<text class="eyebrow">START WITH ONE THING</text>
					<text class="onboarding-title">先选一件，<br>现在最值得开始的事</text>
					<text class="onboarding-copy">不用配置二十项计划。选一个方向，确认这次要做到什么，然后直接完成最小一步。</text>
				</view>

				<view v-if="!starterDraft" class="direction-picker">
					<button v-for="item in visibleCandidates" :key="item.stableKey" class="direction-option" :disabled="starting" @tap="prepareStarter(item)">
						<text class="direction-number">{{ item.stableKey }}</text>
						<view><text class="direction-name">{{ item.name }}</text><text class="direction-reason">{{ candidateReason(item) }}</text></view>
						<text class="direction-arrow">›</text>
					</button>
					<button class="all-directions" @tap="openDirections">查看五类 20 个长期方向　›</button>
				</view>

				<view v-else class="starter-card">
					<view class="starter-heading"><view><text>{{ starterItem.stableKey }} · {{ starterItem.section }}</text><text>{{ starterItem.name }}</text></view><button @tap="resetStarter">重选</button></view>
					<label class="field"><text>这次要做到什么</text><textarea v-model="starterDraft.desiredOutcome" maxlength="1200" auto-height /></label>
					<label class="field"><text>现在可以做的最小一步</text><textarea v-model="starterDraft.currentStep" maxlength="1000" auto-height /></label>
					<text v-if="starterDraft.contextReason" class="starter-reason">为什么从这里开始：{{ starterDraft.contextReason }}</text>
					<button class="primary-action" :disabled="startingThread" @tap="startThread">{{ startingThread ? '正在保存起点…' : '确认并开始这一步' }}</button>
					<text class="confirm-note">确认前只是建议；不会自动新增待办或修改人生 OS。</text>
				</view>
			</template>

			<template v-else-if="current">
				<view class="resume-hero">
					<view class="resume-meta"><text>{{ modeLabel(current.progressMode) }}</text><text>{{ current.itemKey }} · {{ current.section }}</text></view>
					<text class="resume-label">正在推进</text>
					<text class="resume-title">{{ current.itemName }}</text>
					<text class="resume-outcome">{{ current.desiredOutcome }}</text>

					<view class="continuity">
						<view v-if="current.lastCompleted" class="continuity-row done"><text class="continuity-label">上次已经做到</text><text>{{ current.lastCompleted }}</text></view>
						<view v-if="current.blockerSummary" class="continuity-row blocked"><text class="continuity-label">当前卡点</text><text>{{ current.blockerSummary }}</text></view>
						<view class="continuity-row next"><text class="continuity-label">现在可以做</text><text>{{ current.currentStep }}</text></view>
					</view>

					<view class="main-actions">
						<button class="action continue" :disabled="working" @tap="continueWork"><text>继续推进</text><text>带着上次上下文继续</text></button>
						<button class="action" :class="{ selected: composerMode === 'blocker' }" :disabled="working" @tap="openComposer('blocker')"><text>我卡住了</text><text>换一种推进方式</text></button>
						<button class="action" :class="{ selected: composerMode === 'result' }" :disabled="working" @tap="openComposer('result')"><text>记录结果</text><text>留下真实发生的事</text></button>
					</view>
				</view>

				<view v-if="composerMode === 'blocker'" class="composer-card">
					<view class="composer-head"><view><text class="eyebrow">UNBLOCK</text><text>具体卡在哪里？</text></view><button @tap="closeComposer">×</button></view>
					<textarea v-model="blockerText" maxlength="1800" auto-height placeholder="例如：我找不到能证明前后变化的材料。" />
					<button class="primary-action" :disabled="working || !blockerText.trim()" @tap="submitBlocker">{{ working ? '正在判断障碍…' : '调整这一步' }}</button>
				</view>

				<view v-if="composerMode === 'result'" class="composer-card result-composer">
					<view class="composer-head"><view><text class="eyebrow">REAL RESULT</text><text>实际发生了什么？</text></view><button @tap="closeComposer">×</button></view>
					<textarea v-model="resultText" maxlength="5000" auto-height placeholder="一句话也可以。准备做、已经做、有效果和还没验证，系统会先整理成可纠正草稿。" />
					<view class="input-tools">
						<button :class="{ recording: isRecording }" :disabled="uploading" @tap="toggleRecording">{{ isRecording ? `停止录音 ${formatDuration(recordSeconds)}` : '语音记录' }}</button>
						<button :disabled="uploading || attachments.length >= 9" @tap="chooseAttachment">添加照片</button>
					</view>
					<view v-if="uploading" class="upload-progress"><view><view :style="{ width: uploadProgress + '%' }"></view></view><text>{{ uploadLabel }} {{ uploadProgress }}%</text></view>
					<view v-if="attachments.length" class="attachment-row"><image v-for="item in attachments" :key="item.id" :src="item.url" mode="aspectFill" /><text>{{ attachments.length }} 份附件</text></view>
					<text v-if="voiceNote" class="voice-note">{{ voiceNote }}</text>
					<button class="primary-action" :disabled="working || uploading || (!resultText.trim() && !attachments.length)" @tap="prepareResult">{{ working ? '正在整理结果…' : '整理为可确认结果' }}</button>
				</view>

				<view v-if="resultDraft" class="draft-card">
					<view class="draft-head"><view><text class="eyebrow">CONFIRM RESULT</text><text>先确认它是什么</text></view><button @tap="resultDraft = null">×</button></view>
					<view class="state-options">
						<button v-for="option in resultStates" :key="option.value" :class="{ active: resultDraft.payload.state === option.value }" @tap="resultDraft.payload.state = option.value">{{ option.label }}</button>
					</view>
					<label class="field"><text>实际发生</text><textarea v-model="resultDraft.payload.summary" maxlength="1800" auto-height /></label>
					<label class="field"><text>留下的产出或变化</text><textarea v-model="resultDraft.payload.actualResult" maxlength="2400" auto-height placeholder="没有可核对结果时可以留空" /></label>
					<label class="field"><text>下次从哪里继续</text><textarea v-model="resultDraft.payload.nextStep" maxlength="1000" auto-height /></label>
					<view class="close-options"><text>确认后</text><button v-for="option in closeModes" :key="option.value" :class="{ active: resultCloseMode === option.value }" @tap="resultCloseMode = option.value">{{ option.label }}</button></view>
					<button class="primary-action" :disabled="working" @tap="confirmResult">{{ working ? '正在保存…' : '确认结果并留下接续位置' }}</button>
				</view>

				<view v-if="latestWork" class="work-card">
					<view class="work-heading"><text>{{ latestWork.kind === 'BLOCKER' ? '卡点已经调整' : '这次一起做' }}</text><text>{{ eventTime(latestWork.createdAt) }}</text></view>
					<text class="work-copy">{{ latestWork.payload.assistance || latestWork.payload.analysis || latestWork.summary }}</text>
					<view v-if="latestWork.payload.completionCriteria" class="work-detail"><text>怎样算真正发生</text><text>{{ latestWork.payload.completionCriteria }}</text></view>
					<view v-if="latestWork.payload.neededInput" class="work-detail"><text>还缺一个信息</text><text>{{ latestWork.payload.neededInput }}</text></view>
					<view v-if="latestWork.payload.adjustedStep" class="work-detail"><text>调整后</text><text>{{ latestWork.payload.adjustedStep }}</text></view>
					<text class="ai-boundary">这是一段协助，不代表你已经完成行动。</text>
				</view>

				<view v-if="diaryReviewDraft" class="draft-card diary-review-card">
					<view class="draft-head"><view><text class="eyebrow">DIARY REVIEW</text><text>回看这次发生了什么</text></view><button @tap="diaryReviewDraft = null">×</button></view>
					<view class="review-block"><text>日记支持的事实</text><text v-for="(fact, index) in diaryReviewDraft.payload.facts" :key="index">· {{ fact }}</text></view>
					<view v-if="diaryReviewDraft.payload.inferences.length" class="review-block inference"><text>仍需验证的推测</text><text v-for="(item, index) in diaryReviewDraft.payload.inferences" :key="index">· {{ item }}</text></view>
					<label class="field"><text>下次尝试的方法</text><textarea v-model="diaryReviewDraft.payload.nextTry" maxlength="1000" auto-height /></label>
					<button class="primary-action" :disabled="working" @tap="confirmDiaryReview">采用这个方法并继续观察</button>
				</view>

				<view v-if="home.diarySuggestions.length" class="section-card diary-section">
					<view class="section-head"><view><text class="eyebrow">FROM YOUR JOURNAL</text><text>相关日记，等你处理</text></view><text>{{ home.diarySuggestions.length }}</text></view>
					<view v-for="item in home.diarySuggestions" :key="item.linkId" class="diary-prompt">
						<text class="diary-date">{{ item.sourceDate }} · {{ item.itemName }}</text>
						<text class="diary-excerpt">“{{ item.evidenceExcerpt }}”</text>
						<text class="diary-question">这件事与正在推进的方向有关。要不要回看这次发生了什么？</text>
						<view><button :disabled="working" @tap="reviewDiary(item)">回看这次</button><button :disabled="working" @tap="dismissDiary(item)">不是这件事</button></view>
					</view>
				</view>

				<view v-if="home.recentResults.length" class="section-card">
					<view class="section-head"><view><text class="eyebrow">RECENT ACCUMULATION</text><text>近期留下的结果</text></view></view>
					<view v-for="item in home.recentResults" :key="item.id" class="result-row"><text>{{ item.itemKey }} · {{ item.itemName }}</text><text>{{ item.payload.actualResult || item.summary }}</text><text>{{ eventTime(item.createdAt) }}</text></view>
				</view>

				<view v-if="home.otherActive.length" class="section-card compact-section">
					<view class="section-head"><view><text class="eyebrow">OTHER THREADS</text><text>其他正在推进</text></view></view>
					<button v-for="item in home.otherActive" :key="item.id" class="other-thread" @tap="switchThread(item)"><view><text>{{ item.itemName }}</text><text>{{ item.currentStep }}</text></view><text>切换 ›</text></button>
				</view>
			</template>

			<view v-if="!loading && !loadError" class="footer-links">
				<button @tap="openReview"><view><text>阶段回看</text><text>做了什么、留下什么、继续还是调整</text></view><text>›</text></button>
				<button @tap="openDirections"><view><text>五类 20 个长期方向</text><text>选择方向与调整关注范围</text></view><text>›</text></button>
				<button @tap="openPrinciples"><view><text>人生 OS 原则</text><text>引用你确认过的判断原则；复利系统不会自动改写</text></view><text>›</text></button>
			</view>
			<view v-if="!loading" class="privacy-note"><view></view><text>{{ home.privacy || '复利系统仅本人可见，不进入发现。' }}</text></view>
		</view>
	</view>
</template>

<script>
import {
	compoundBlocker,
	compoundContinue,
	compoundDiaryDismiss,
	compoundDiaryReview,
	compoundDiaryReviewConfirm,
	compoundHome,
	compoundResultConfirm,
	compoundResultDraft,
	compoundStarter,
	compoundThreadPrimary,
	compoundThreads
} from '@/api/compound-system';
import { transcribeVoiceBase, uploadImage, uploadVoice } from '@/api/upload';
import indexConfig from '@/config/index.config';

const MAX_RECORD_SECONDS = 600;

export default {
	data() {
		return {
			statusBarHeight: 0,
			loading: true,
			loadError: false,
			working: false,
			starting: false,
			startingThread: false,
			home: { needsOnboarding: true, current: null, otherActive: [], diarySuggestions: [], recentResults: [], directionCandidates: [], directionCount: 20, privacy: '' },
			starterItem: null,
			starterDraft: null,
			composerMode: '',
			blockerText: '',
			resultText: '',
			resultDraft: null,
			resultCloseMode: 'CONTINUE',
			diaryReviewDraft: null,
			isRecording: false,
			recordSeconds: 0,
			recordStartedAt: 0,
			recordTimer: null,
			recorderManager: null,
			h5Recorder: null,
			h5Stream: null,
			h5Chunks: [],
			uploading: false,
			uploadProgress: 0,
			uploadLabel: '',
			attachments: [],
			voiceMediaId: '',
			voiceNote: '',
			resultStates: [
				{ value: 'PREPARING', label: '准备做' },
				{ value: 'DONE', label: '已经做' },
				{ value: 'EFFECTIVE', label: '有效果' },
				{ value: 'UNVERIFIED', label: '尚未验证' }
			],
			closeModes: [
				{ value: 'CONTINUE', label: '继续' },
				{ value: 'PAUSE', label: '暂缓' },
				{ value: 'END', label: '结束' }
			]
		};
	},
	computed: {
		current() { return this.home.current || null; },
		visibleCandidates() { return (this.home.directionCandidates || []).slice(0, 7); },
		latestWork() {
			if (!this.current) return null;
			return (this.current.recentEvents || []).find(item => item.status === 'CONFIRMED' && ['CONTINUE', 'BLOCKER'].includes(item.kind)) || null;
		}
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.initPlatformRecorder();
	},
	onShow() { this.loadHome(); },
	onUnload() { this.releaseRecorder(); },
	methods: {
		async loadHome() {
			this.loading = true;
			this.loadError = false;
			try {
				const response = await this.$http.get(compoundHome);
				this.home = { ...this.home, ...(response.data || {}) };
				const selectedKey = uni.getStorageSync('compoundStartItemKey');
				if (selectedKey) {
					uni.removeStorageSync('compoundStartItemKey');
					const selected = (this.home.directionCandidates || []).find(item => item.stableKey === selectedKey);
					if (selected) await this.prepareStarter(selected);
				}
			} catch (error) {
				this.loadError = true;
				console.error('加载复利系统失败', error);
			} finally { this.loading = false; }
		},
		candidateReason(item) {
			if (item.isWeekFocus) return '你此前把它放进了本周关注';
			if (item.relatedRecordCount) return `已有 ${item.relatedRecordCount} 条相关记录可接着用`;
			return item.minimumAction;
		},
		modeLabel(mode) { return { MAINTENANCE: '持续维护', SITUATIONAL: '情境练习', OUTCOME: '成果积累' }[mode] || '持续推进'; },
		async prepareStarter(item) {
			if (this.starting) return;
			this.starting = true;
			try {
				const response = await this.$http.post(compoundStarter, { itemKey: item.stableKey });
				this.starterItem = response.data.item;
				this.starterDraft = response.data.draft;
			} catch (error) { uni.showToast({ title: '暂时没能整理起点', icon: 'none' }); }
			finally { this.starting = false; }
		},
		resetStarter() { this.starterItem = null; this.starterDraft = null; },
		async startThread() {
			if (this.startingThread || !this.starterItem || !this.starterDraft.desiredOutcome.trim() || !this.starterDraft.currentStep.trim()) return;
			this.startingThread = true;
			try {
				await this.$http.post(compoundThreads, { itemKey: this.starterItem.stableKey, ...this.starterDraft });
				this.resetStarter();
				await this.loadHome();
				uni.showToast({ title: '已经从这一步开始', icon: 'success' });
			} catch (error) { uni.showToast({ title: '起点没有保存，请重试', icon: 'none' }); }
			finally { this.startingThread = false; }
		},
		openComposer(mode) {
			this.composerMode = this.composerMode === mode ? '' : mode;
			this.resultDraft = null;
			this.diaryReviewDraft = null;
		},
		closeComposer() { if (this.isRecording) this.stopRecording(); this.composerMode = ''; },
		async continueWork() {
			if (!this.current || this.working) return;
			this.working = true;
			this.composerMode = '';
			try { await this.$http.post(compoundContinue(this.current.id), {}); await this.loadHome(); }
			catch (error) { uni.showToast({ title: '这次协助没有完成，请重试', icon: 'none' }); }
			finally { this.working = false; }
		},
		async submitBlocker() {
			if (!this.current || this.working || !this.blockerText.trim()) return;
			this.working = true;
			try {
				await this.$http.post(compoundBlocker(this.current.id), { blocker: this.blockerText });
				this.blockerText = '';
				this.composerMode = '';
				await this.loadHome();
			} catch (error) { uni.showToast({ title: '卡点暂时没有处理好', icon: 'none' }); }
			finally { this.working = false; }
		},
		async prepareResult() {
			if (!this.current || this.working) return;
			this.working = true;
			const mediaIds = this.attachments.map(item => item.id).concat(this.voiceMediaId ? [this.voiceMediaId] : []);
			try {
				const response = await this.$http.post(compoundResultDraft(this.current.id), { text: this.resultText, mediaIds });
				this.resultDraft = response.data.event;
				this.resultCloseMode = 'CONTINUE';
				this.composerMode = '';
			} catch (error) { uni.showToast({ title: '结果暂时没有整理好', icon: 'none' }); }
			finally { this.working = false; }
		},
		async confirmResult() {
			if (!this.current || !this.resultDraft || this.working) return;
			this.working = true;
			try {
				await this.$http.post(compoundResultConfirm(this.current.id, this.resultDraft.id), { ...this.resultDraft.payload, closeMode: this.resultCloseMode });
				this.resultDraft = null;
				this.resultText = '';
				this.attachments = [];
				this.voiceMediaId = '';
				this.voiceNote = '';
				await this.loadHome();
				uni.showToast({ title: '结果与下一步已保存', icon: 'success' });
			} catch (error) { uni.showToast({ title: '结果没有确认成功', icon: 'none' }); }
			finally { this.working = false; }
		},
		async reviewDiary(item) {
			if (!this.current || this.working) return;
			this.working = true;
			try {
				const response = await this.$http.post(compoundDiaryReview(this.current.id, item.linkId), {});
				this.diaryReviewDraft = response.data.event;
			} catch (error) { uni.showToast({ title: '这次日记暂时没有回看完成', icon: 'none' }); }
			finally { this.working = false; }
		},
		async confirmDiaryReview() {
			if (!this.current || !this.diaryReviewDraft || this.working) return;
			this.working = true;
			try {
				await this.$http.post(compoundDiaryReviewConfirm(this.current.id, this.diaryReviewDraft.id), this.diaryReviewDraft.payload);
				this.diaryReviewDraft = null;
				await this.loadHome();
				uni.showToast({ title: '已经接到下一次尝试', icon: 'success' });
			} catch (error) { uni.showToast({ title: '这次回看没有确认成功', icon: 'none' }); }
			finally { this.working = false; }
		},
		async dismissDiary(item) {
			if (!this.current || this.working) return;
			this.working = true;
			try { await this.$http.post(compoundDiaryDismiss(this.current.id, item.linkId), {}); await this.loadHome(); }
			catch (error) { uni.showToast({ title: '暂时没能忽略这条关联', icon: 'none' }); }
			finally { this.working = false; }
		},
		async switchThread(item) {
			try { await this.$http.post(compoundThreadPrimary(item.id), {}); await this.loadHome(); }
			catch (error) { uni.showToast({ title: '暂时无法切换', icon: 'none' }); }
		},
		initPlatformRecorder() {
			// #ifndef H5
			if (typeof uni.getRecorderManager !== 'function') return;
			this.recorderManager = uni.getRecorderManager();
			this.recorderManager.onStop(result => this.finishPlatformRecording(result));
			this.recorderManager.onError(() => this.recordingFailed());
			// #endif
		},
		async toggleRecording() {
			if (this.isRecording) { this.stopRecording(); return; }
			// #ifdef H5
			await this.startH5Recording();
			// #endif
			// #ifndef H5
			if (!this.recorderManager) { uni.showToast({ title: '当前设备不支持录音', icon: 'none' }); return; }
			this.recorderManager.start({ duration: MAX_RECORD_SECONDS * 1000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 64000, format: 'mp3' });
			this.beginRecording();
			// #endif
		},
		async startH5Recording() {
			try {
				if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') throw new Error('unsupported');
				this.h5Stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
				const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type));
				this.h5Chunks = [];
				this.h5Recorder = mimeType ? new MediaRecorder(this.h5Stream, { mimeType }) : new MediaRecorder(this.h5Stream);
				this.h5Recorder.ondataavailable = event => { if (event.data && event.data.size) this.h5Chunks.push(event.data); };
				this.h5Recorder.onstop = () => this.finishH5Recording(new Blob(this.h5Chunks, { type: this.h5Recorder.mimeType || 'audio/webm' }));
				this.h5Recorder.start(500);
				this.beginRecording();
			} catch (error) { this.recordingFailed(); }
		},
		beginRecording() {
			this.isRecording = true;
			this.recordSeconds = 0;
			this.recordStartedAt = Date.now();
			this.recordTimer = setInterval(() => {
				this.recordSeconds = Math.min(MAX_RECORD_SECONDS, Math.floor((Date.now() - this.recordStartedAt) / 1000));
				if (this.recordSeconds >= MAX_RECORD_SECONDS) this.stopRecording();
			}, 500);
		},
		stopRecording() {
			if (!this.isRecording) return;
			this.isRecording = false;
			clearInterval(this.recordTimer);
			this.recordTimer = null;
			// #ifdef H5
			if (this.h5Recorder && this.h5Recorder.state !== 'inactive') this.h5Recorder.stop();
			// #endif
			// #ifndef H5
			if (this.recorderManager) this.recorderManager.stop();
			// #endif
		},
		async finishPlatformRecording(result) {
			if (!result || !result.tempFilePath) return this.recordingFailed();
			try {
				this.beginUpload('正在保存语音');
				const response = await this.$http.upload(uploadVoice, { filePath: result.tempFilePath, name: 'file', getTask: task => this.trackUpload(task) });
				await this.finishVoiceUpload(response);
			} catch (error) { this.recordingFailed(); }
		},
		async finishH5Recording(blob) {
			this.releaseMicrophone();
			if (!blob || !blob.size) return this.recordingFailed();
			try {
				this.beginUpload('正在保存语音');
				const response = await this.uploadH5Blob(blob);
				await this.finishVoiceUpload(response);
			} catch (error) { this.recordingFailed(); }
		},
		uploadH5Blob(blob) {
			return new Promise((resolve, reject) => {
				const form = new FormData();
				const type = String(blob.type || 'audio/webm').split(';')[0];
				const extension = type === 'audio/mp4' ? 'm4a' : (type.split('/')[1] || 'webm');
				form.append('file', blob, `compound-${Date.now()}.${extension}`);
				const request = new XMLHttpRequest();
				request.open('POST', `${indexConfig.baseUrl}${uploadVoice}`, true);
				request.timeout = 120000;
				request.setRequestHeader('x-api-key', uni.getStorageSync('accessToken'));
				request.upload.onprogress = event => { if (event.lengthComputable) this.uploadProgress = Math.min(99, Math.round(event.loaded / event.total * 100)); };
				request.onerror = reject;
				request.ontimeout = reject;
				request.onload = () => { try { const payload = JSON.parse(request.responseText || '{}'); payload.code === 200 ? resolve(payload) : reject(new Error(payload.message)); } catch (error) { reject(error); } };
				request.send(form);
			});
		},
		async finishVoiceUpload(response) {
			if (!response || response.code !== 200 || !response.data || !response.data.id) throw new Error('voice upload failed');
			this.voiceMediaId = response.data.id;
			this.uploadLabel = '正在转写语音';
			this.uploadProgress = 72;
			try {
				const transcript = await this.$http.post(`${transcribeVoiceBase}/${this.voiceMediaId}/transcribe`, {});
				if (transcript.data && transcript.data.text) {
					this.resultText += `${this.resultText.trim() ? '\n\n' : ''}${transcript.data.text}`;
					this.voiceNote = '语音已保存并转写，可继续修改文字。';
				} else this.voiceNote = '语音已保存，转写暂时没有返回文字。';
			} catch (error) { this.voiceNote = '语音已保存；转写暂时不可用，你仍然可以直接记录结果。'; }
			this.uploadProgress = 100;
			this.uploading = false;
		},
		recordingFailed() {
			this.isRecording = false;
			this.uploading = false;
			clearInterval(this.recordTimer);
			this.releaseMicrophone();
			uni.showToast({ title: '录音没有成功，请再试一次', icon: 'none' });
		},
		beginUpload(label) { this.uploading = true; this.uploadLabel = label; this.uploadProgress = 3; },
		trackUpload(task) { if (task && typeof task.onProgressUpdate === 'function') task.onProgressUpdate(event => { this.uploadProgress = Math.min(99, Number(event.progress) || 0); }); },
		async chooseAttachment() {
			try {
				const selected = await new Promise((resolve, reject) => uni.chooseImage({ count: 9 - this.attachments.length, sizeType: ['compressed'], success: resolve, fail: reject }));
				const paths = selected.tempFilePaths || [];
				for (let index = 0; index < paths.length; index += 1) {
					this.beginUpload(`正在保存照片 ${index + 1}/${paths.length}`);
					const response = await this.$http.upload(uploadImage, { filePath: paths[index], name: 'file', getTask: task => this.trackUpload(task) });
					if (response.code === 200 && response.data && response.data.id) this.attachments.push({ id: response.data.id, url: response.data.url });
				}
				this.uploadProgress = 100;
			} catch (error) { if (!String(error.errMsg || error).includes('cancel')) uni.showToast({ title: '照片没有保存成功', icon: 'none' }); }
			finally { this.uploading = false; }
		},
		releaseMicrophone() { if (this.h5Stream) this.h5Stream.getTracks().forEach(track => track.stop()); this.h5Stream = null; },
		releaseRecorder() { if (this.isRecording) this.stopRecording(); clearInterval(this.recordTimer); this.releaseMicrophone(); },
		formatDuration(seconds) { const total = Math.max(0, Number(seconds) || 0); return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; },
		eventTime(value) { return String(value || '').replace('T', ' ').slice(0, 16); },
		openDirections() { uni.navigateTo({ url: '/pages/shroom/life-os-plan?select=1' }); },
		openReview() { uni.navigateTo({ url: '/pages/shroom/life-os-weekly' }); },
		openPrinciples() { uni.navigateTo({ url: '/pages/shroom/life-os' }); },
		goBack() { const pages = getCurrentPages(); if (pages.length > 1) uni.navigateBack(); else uni.switchTab({ url: '/pages/diary/index' }); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; line-height: 1.25; background: transparent; border: 0; }
button::after { border: 0; }
textarea { box-sizing: border-box; width: 100%; min-height: 112rpx; padding: 20rpx; border: 1rpx solid rgba(27,39,30,.12); border-radius: 20rpx; background: rgba(255,255,255,.74); color: #18231b; font-size: 21rpx; line-height: 1.55; overflow-wrap: anywhere; }
.compound-page { min-height: 100vh; background: #f1f8e9; color: #18231b; }
.status-bar { background: #f1f8e9; }
.page-shell { box-sizing: border-box; width: 100%; padding: 28rpx 32rpx calc(130rpx + env(safe-area-inset-bottom)); }
.topbar { display: flex; align-items: center; gap: 18rpx; }
.back-button, .more-button { display: flex; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(24,35,27,.1); border-radius: 50%; background: rgba(255,255,255,.7); color: #263128; font-size: 42rpx; }
.more-button { font-size: 25rpx; letter-spacing: 2rpx; }
.topbar-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4rpx; }
.topbar-kicker, .eyebrow { color: #718075; font-size: 15rpx; font-weight: 750; letter-spacing: 2.4rpx; }
.topbar-title { font-family: Georgia, 'Songti SC', serif; font-size: 34rpx; font-weight: 720; }
.state-card { display: flex; min-height: 300rpx; margin-top: 30rpx; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx; border-radius: 32rpx; background: rgba(255,255,255,.72); color: #667269; font-size: 19rpx; }
.loading-dot { width: 18rpx; height: 18rpx; border-radius: 50%; background: #668166; box-shadow: 0 0 0 12rpx rgba(102,129,102,.12); }
.pill-button { display: flex; min-height: 62rpx; padding: 0 28rpx; align-items: center; justify-content: center; border-radius: 999rpx; font-size: 18rpx; }.pill-button.dark { background: #1b2920; color: #fff; }
.onboarding-hero { display: flex; margin-top: 42rpx; flex-direction: column; }
.onboarding-title { margin-top: 14rpx; font-family: Georgia, 'Songti SC', serif; font-size: 51rpx; font-weight: 730; line-height: 1.14; letter-spacing: -1rpx; }
.onboarding-copy { max-width: 620rpx; margin-top: 20rpx; color: #677369; font-size: 20rpx; line-height: 1.65; }
.direction-picker { margin-top: 34rpx; }
.direction-option { display: flex; box-sizing: border-box; width: 100%; min-height: 112rpx; margin-bottom: 12rpx; padding: 22rpx 23rpx; align-items: flex-start; gap: 17rpx; border-radius: 24rpx; background: rgba(255,255,255,.85); text-align: left; }
.direction-number { padding-top: 3rpx; color: #78907d; font-size: 16rpx; font-weight: 760; }.direction-option > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 8rpx; }.direction-name { font-size: 22rpx; font-weight: 690; }.direction-reason { display: -webkit-box; overflow: hidden; color: #748078; font-size: 17rpx; line-height: 1.45; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }.direction-arrow { color: #849087; font-size: 30rpx; }
.all-directions { width: 100%; padding: 24rpx 0; color: #5f7063; font-size: 18rpx; }
.starter-card, .composer-card, .draft-card, .work-card, .section-card { box-sizing: border-box; margin-top: 26rpx; padding: 28rpx; border-radius: 30rpx; background: #fff; }
.starter-heading, .composer-head, .draft-head, .section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18rpx; }.starter-heading > view, .composer-head > view, .draft-head > view, .section-head > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }.starter-heading > view text:first-child { color: #758278; font-size: 16rpx; }.starter-heading > view text:last-child, .composer-head > view text:last-child, .draft-head > view text:last-child, .section-head > view text:last-child { font-family: Georgia, 'Songti SC', serif; font-size: 26rpx; font-weight: 700; }.starter-heading > button, .composer-head > button, .draft-head > button { color: #728077; font-size: 19rpx; }
.field { display: flex; margin-top: 23rpx; flex-direction: column; gap: 10rpx; }.field > text { color: #59675c; font-size: 17rpx; font-weight: 680; }
.starter-reason { display: block; margin-top: 18rpx; color: #6f7c72; font-size: 17rpx; line-height: 1.55; }
.primary-action { display: flex; box-sizing: border-box; width: 100%; min-height: 76rpx; margin-top: 24rpx; padding: 15rpx 24rpx; align-items: center; justify-content: center; border-radius: 999rpx; background: #1b2920; color: #fff; font-size: 20rpx; font-weight: 720; }.primary-action[disabled] { opacity: .46; }
.confirm-note, .ai-boundary { display: block; margin-top: 13rpx; color: #879188; font-size: 15rpx; line-height: 1.45; text-align: center; }
.resume-hero { box-sizing: border-box; margin-top: 27rpx; padding: 34rpx 30rpx 29rpx; border-radius: 35rpx; background: #18251d; color: #fff; box-shadow: 0 18rpx 50rpx rgba(25,40,29,.12); }
.resume-meta { display: flex; justify-content: space-between; gap: 18rpx; color: #9fb1a2; font-size: 15rpx; letter-spacing: 1rpx; }.resume-label { display: block; margin-top: 34rpx; color: #9eafa1; font-size: 17rpx; }.resume-title { display: block; margin-top: 8rpx; font-family: Georgia, 'Songti SC', serif; font-size: 38rpx; font-weight: 720; line-height: 1.25; }.resume-outcome { display: block; margin-top: 15rpx; color: #c4cec6; font-size: 19rpx; line-height: 1.6; }
.continuity { margin-top: 28rpx; border-top: 1rpx solid rgba(255,255,255,.12); }.continuity-row { display: flex; padding: 20rpx 0; flex-direction: column; gap: 8rpx; border-bottom: 1rpx solid rgba(255,255,255,.1); }.continuity-label { color: #91a294; font-size: 15rpx; }.continuity-row > text:last-child { font-size: 20rpx; line-height: 1.5; overflow-wrap: anywhere; }.continuity-row.next > text:last-child { color: #e8f3df; font-weight: 680; }.continuity-row.blocked > text:last-child { color: #efcf9e; }
.main-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12rpx; margin-top: 24rpx; }.action { display: flex; min-height: 100rpx; padding: 18rpx; flex-direction: column; align-items: flex-start; justify-content: center; gap: 7rpx; border: 1rpx solid rgba(255,255,255,.13); border-radius: 22rpx; color: #fff; text-align: left; }.action.continue { grid-column: 1 / -1; background: #dff0ce; color: #18251d; }.action.selected { background: rgba(255,255,255,.12); }.action > text:first-child { font-size: 21rpx; font-weight: 720; }.action > text:last-child { color: #96a79a; font-size: 15rpx; }.action.continue > text:last-child { color: #647462; }
.composer-card textarea { margin-top: 22rpx; }.input-tools { display: flex; gap: 12rpx; margin-top: 16rpx; }.input-tools button { display: flex; min-height: 64rpx; padding: 0 23rpx; align-items: center; justify-content: center; border-radius: 999rpx; background: #edf3e8; color: #4f6253; font-size: 17rpx; }.input-tools button.recording { background: #9e423d; color: #fff; }
.upload-progress { display: flex; align-items: center; gap: 13rpx; margin-top: 17rpx; }.upload-progress > view { height: 8rpx; flex: 1; overflow: hidden; border-radius: 999rpx; background: #e3e9df; }.upload-progress > view > view { height: 100%; border-radius: inherit; background: #668166; }.upload-progress > text { color: #718075; font-size: 15rpx; }.attachment-row { display: flex; align-items: center; gap: 9rpx; margin-top: 16rpx; }.attachment-row image { width: 68rpx; height: 68rpx; border-radius: 14rpx; }.attachment-row text { color: #6c786f; font-size: 16rpx; }.voice-note { display: block; margin-top: 14rpx; color: #617064; font-size: 16rpx; }
.state-options, .close-options { display: flex; flex-wrap: wrap; gap: 9rpx; margin-top: 20rpx; }.state-options button, .close-options button { display: flex; min-height: 52rpx; padding: 0 18rpx; align-items: center; justify-content: center; border-radius: 999rpx; background: #eef3e9; color: #627066; font-size: 16rpx; }.state-options button.active, .close-options button.active { background: #243329; color: #fff; }.close-options > text { display: flex; align-items: center; color: #78827a; font-size: 16rpx; }
.work-card { background: #e4edcf; }.work-heading { display: flex; justify-content: space-between; gap: 20rpx; }.work-heading text:first-child { font-family: Georgia, 'Songti SC', serif; font-size: 25rpx; font-weight: 700; }.work-heading text:last-child { color: #748074; font-size: 14rpx; }.work-copy { display: block; margin-top: 18rpx; font-size: 20rpx; line-height: 1.68; white-space: pre-wrap; overflow-wrap: anywhere; }.work-detail { display: flex; margin-top: 18rpx; padding-top: 17rpx; flex-direction: column; gap: 7rpx; border-top: 1rpx solid rgba(40,60,43,.11); }.work-detail text:first-child { color: #718075; font-size: 15rpx; }.work-detail text:last-child { font-size: 18rpx; line-height: 1.5; }
.review-block { display: flex; margin-top: 20rpx; padding: 18rpx; flex-direction: column; gap: 8rpx; border-radius: 20rpx; background: #eff5eb; }.review-block > text:first-child { color: #5f705f; font-size: 16rpx; font-weight: 700; }.review-block > text:not(:first-child) { font-size: 18rpx; line-height: 1.5; }.review-block.inference { background: #f7f1e6; }
.section-card { margin-top: 24rpx; }.section-head > text { color: #718075; font-size: 18rpx; }.diary-prompt, .result-row { display: flex; padding: 22rpx 0; flex-direction: column; gap: 9rpx; border-top: 1rpx solid #e8ede6; }.diary-prompt:first-of-type, .result-row:first-of-type { margin-top: 16rpx; }.diary-date, .result-row text:first-child { color: #718075; font-size: 15rpx; }.diary-excerpt { font-size: 20rpx; line-height: 1.58; }.diary-question { color: #677369; font-size: 17rpx; line-height: 1.5; }.diary-prompt > view { display: flex; gap: 12rpx; margin-top: 4rpx; }.diary-prompt button { display: flex; min-height: 57rpx; padding: 0 20rpx; align-items: center; justify-content: center; border-radius: 999rpx; background: #e7efdf; color: #35483a; font-size: 16rpx; }.diary-prompt button:last-child { background: #f2f3ef; color: #778079; }
.result-row text:nth-child(2) { font-size: 19rpx; line-height: 1.55; }.result-row text:last-child { color: #899189; font-size: 14rpx; }.other-thread { display: flex; box-sizing: border-box; width: 100%; padding: 20rpx 0; align-items: center; justify-content: space-between; gap: 17rpx; border-top: 1rpx solid #e8ede6; text-align: left; }.other-thread:first-of-type { margin-top: 12rpx; }.other-thread > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }.other-thread > view text:first-child { font-size: 19rpx; font-weight: 680; }.other-thread > view text:last-child { color: #738078; font-size: 16rpx; line-height: 1.4; }.other-thread > text { color: #657568; font-size: 16rpx; }
.footer-links { margin-top: 25rpx; overflow: hidden; border-radius: 28rpx; background: rgba(255,255,255,.7); }.footer-links > button { display: flex; box-sizing: border-box; width: 100%; padding: 23rpx 25rpx; align-items: center; justify-content: space-between; gap: 16rpx; border-top: 1rpx solid rgba(30,42,33,.08); text-align: left; }.footer-links > button:first-child { border-top: 0; }.footer-links > button > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }.footer-links > button > view text:first-child { font-size: 20rpx; font-weight: 680; }.footer-links > button > view text:last-child { color: #748078; font-size: 16rpx; line-height: 1.45; }.footer-links > button > text { color: #748078; font-size: 29rpx; }
.privacy-note { display: flex; align-items: flex-start; gap: 12rpx; padding: 24rpx 8rpx 0; color: #758178; font-size: 15rpx; line-height: 1.5; }.privacy-note > view { width: 8rpx; height: 8rpx; margin-top: 7rpx; flex: 0 0 8rpx; border-radius: 50%; background: #668166; }
/* #ifdef H5 */
@media (min-width: 980px) { .compound-page { box-sizing: border-box; padding-left: 96px; }.status-bar { display: none; }.page-shell { max-width: 820px; margin: 0 auto; padding: 54px 38px 100px; } }
/* #endif */
</style>
