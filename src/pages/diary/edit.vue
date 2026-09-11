<template>
	<view class="edit-diary-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

		<view class="navbar">
			<view class="nav-inner">
				<button class="nav-back" @click="goBack" aria-label="返回">
					<text class="nav-back-icon">‹</text>
				</button>
				<view class="nav-heading">
					<text class="nav-kicker">SHROOM JOURNAL</text>
					<text class="nav-title">{{ diaryId ? '编辑日记' : '写日记' }}</text>
				</view>
				<button class="nav-save" :class="{ disabled: !canSave }" :disabled="!canSave" @click="saveDiary">
					{{ saving ? '保存中' : '完成' }}
				</button>
			</view>
		</view>

		<scroll-view class="content-scroll" scroll-y>
			<view class="journal-canvas">
				<view class="date-intro">
					<text class="date-eyebrow">{{ displayDateEyebrow }}</text>
					<text class="date-title">{{ displayDateTitle }}</text>
					<text class="date-prompt">不必完整，也不必正确。先把此刻留下。</text>
				</view>

				<view class="mood-block">
					<view class="section-heading-row">
						<text class="section-heading">此刻的感受</text>
						<text class="section-value">{{ selectedMood.label }}</text>
					</view>
					<scroll-view class="mood-scroll" scroll-x :show-scrollbar="false">
						<view class="mood-row">
							<button
								v-for="mood in moods"
								:key="mood.value"
								class="mood-chip"
								:class="{ active: diaryForm.mood === mood.value }"
								@click="selectMood(mood.value)"
							>
								<text class="mood-emoji">{{ mood.emoji }}</text>
								<text class="mood-label">{{ mood.label }}</text>
							</button>
						</view>
					</scroll-view>
				</view>

				<view class="writing-sheet">
					<view class="writing-topline">
						<text class="writing-label">今天发生了什么？</text>
						<text class="writing-count">{{ diaryForm.content.length }} / 5000</text>
					</view>
					<textarea
						class="content-input"
						v-model="diaryForm.content"
						placeholder="从一个画面、一句话，或一种说不清的感受开始……"
						placeholder-class="content-placeholder"
						:maxlength="5000"
						:show-confirm-bar="false"
					/>

					<view class="writing-tools">
						<button class="writing-tool" :class="{ active: voicePanelOpen || diaryForm.voice }" @click="openVoicePanel">
							<view class="tool-icon mic-mini"><view class="mic-mini-stem"></view></view>
							<text>{{ diaryForm.voice ? '语音已保存' : '语音写日记' }}</text>
						</button>
						<button class="writing-tool" :class="{ active: imageUploading }" :disabled="imageUploading" @click="chooseImage">
							<view class="tool-icon photo-mini"><view class="photo-mini-dot"></view></view>
							<text>{{ imageUploading ? imageUploadProgress + '%' : '照片' }}</text>
						</button>
						<button class="writing-tool" @click="selectCard">
							<text class="tool-symbol">✦</text>
							<text>关联菇卡</text>
						</button>
						<button class="writing-tool" :class="{ active: linkedInquiries.length }" @click="selectInquiry">
							<text class="tool-symbol question-symbol">?</text>
							<text>关联问题</text>
						</button>
						<button class="writing-tool" @click="detailsOpen = !detailsOpen">
							<text class="tool-symbol">···</text>
							<text>设置</text>
						</button>
					</view>
				</view>

				<view class="image-upload-panel" v-if="imageUploading" aria-live="polite">
					<view class="image-upload-heading">
						<view>
							<text class="image-upload-kicker">照片保存进度</text>
							<text class="image-upload-title">正在压缩并安全保存</text>
						</view>
						<text class="image-upload-percent">{{ imageUploadProgress }}%</text>
					</view>
					<view class="progress-track image-upload-track">
						<view class="progress-fill" :style="{ width: imageUploadProgress + '%' }"></view>
					</view>
					<text class="image-upload-meta">已处理 {{ imageUploadFinishedCount }} / {{ imageUploadTotal }} 张 · 已用时 {{ imageUploadElapsed }} 秒</text>
				</view>

				<button class="post-save-choice" :class="{ selected: lookBackAfterSave }" v-if="!diaryId" @click="lookBackAfterSave = !lookBackAfterSave">
					<view class="choice-check"><text v-if="lookBackAfterSave">✓</text></view>
					<view class="choice-copy">
						<text>保存后，看看与过去的关联</text>
						<text>默认关闭。开启后才会进入日记回看，不影响本次保存。</text>
					</view>
				</button>

				<view class="voice-studio" v-if="voicePanelOpen || diaryForm.voice">
					<view class="voice-header">
						<view>
							<text class="voice-kicker">VOICE NOTE</text>
							<text class="voice-title">说给未来的自己听</text>
						</view>
						<button class="quiet-button" v-if="!isRecording" @click="voicePanelOpen = false">收起</button>
					</view>

					<view class="recording-state" v-if="isRecording || voiceUploading">
						<view class="record-orbit" :class="{ recording: isRecording }">
							<button v-if="isRecording" class="record-button stop" @click="stopRecording">
								<view class="stop-square"></view>
							</button>
							<view v-else class="upload-progress-ring">
								<text class="upload-progress-number">{{ voiceUploadProgress }}%</text>
							</view>
						</view>
						<text class="record-time">{{ formatDuration(recordSeconds) }}</text>
						<text class="record-caption">{{ voiceUploading ? '正在安全保存录音 · ' + voiceUploadProgress + '%' : '正在录音 · 点击停止' }}</text>
						<view class="progress-track upload-track" v-if="voiceUploading">
							<view class="progress-fill" :style="{ width: voiceUploadProgress + '%' }"></view>
						</view>
						<text class="progress-meta" v-if="voiceUploading">已用时 {{ voiceUploadElapsed }} 秒 · 上传完成后录音会立即保留</text>
						<view class="live-wave" aria-hidden="true">
							<view v-for="(height, index) in waveformBars" :key="index" class="live-wave-bar" :style="{ height: height + 'rpx' }"></view>
						</view>
					</view>

					<view class="ready-to-record" v-else-if="!diaryForm.voice">
						<button class="record-button" @click="startRecording">
							<view class="mic-shape">
								<view class="mic-body"></view>
								<view class="mic-base"></view>
							</view>
						</button>
						<text class="record-instruction">点击开始录音</text>
						<text class="record-helper">最长 10 分钟。原始语音会和日记一起保留。</text>
					</view>

					<view class="voice-result" v-else>
						<view class="voice-player">
							<button class="play-button" @click="toggleVoicePlayback">
								<text>{{ isVoicePlaying ? 'Ⅱ' : '▶' }}</text>
							</button>
							<view class="waveform" @click="restartVoice">
								<view
									v-for="(height, index) in waveformBars"
									:key="index"
									class="waveform-bar"
									:class="{ played: isWavePlayed(index) }"
									:style="{ height: height + 'rpx' }"
								></view>
							</view>
							<text class="voice-time">{{ formatDuration(voicePlaybackTime) }} / {{ formatDuration(voiceDuration) }}</text>
						</view>
						<view class="voice-actions">
							<button class="voice-link" @click="replaceVoice">重新录制</button>
							<button class="voice-link danger" @click="removeVoice">删除语音</button>
						</view>

						<view class="transcript-panel">
							<view class="transcript-heading">
								<view>
									<text class="transcript-kicker">AI TRANSCRIPT</text>
									<text class="transcript-title">高精度转写</text>
								</view>
								<text class="transcript-state" v-if="transcriptDraft">可编辑</text>
							</view>

							<view class="transcript-empty" v-if="!transcriptDraft">
								<text class="transcript-copy">
									{{ transcriptionAvailable ? '只在你主动点击后转写；结果可先修改，不会自动覆盖正文。' : '录音已经私密保存，高精度转写服务暂未就绪。' }}
								</text>
								<view class="transcription-progress" v-if="transcribing" aria-live="polite">
									<view class="progress-heading">
										<text>预计处理进度</text>
										<text class="progress-percent">{{ transcribeProgress }}%</text>
									</view>
									<view class="progress-track">
										<view class="progress-fill" :style="{ width: transcribeProgress + '%' }"></view>
									</view>
									<text class="progress-meta">已等待 {{ transcribeElapsed }} 秒 · 录音 {{ formatDuration(voiceDuration) }}</text>
								</view>
								<view class="transcription-error" v-if="transcriptionError && !transcribing">
									<text>{{ transcriptionError }}</text>
								</view>
								<button class="transcribe-button" :disabled="transcribing || !transcriptionAvailable" @click="transcribeRecording">
									<text>{{ transcribing ? '高精度转写中 · ' + transcribeProgress + '%' : (transcriptionStatusKnown && !transcriptionAvailable ? '高精度转写服务待接入' : (transcriptionError ? '重试高精度转写' : '开始高精度转写')) }}</text>
								</button>
							</view>
							<view v-else>
								<textarea
									class="transcript-input"
									v-model="transcriptDraft"
									:maxlength="5000"
									:show-confirm-bar="false"
								/>
								<view class="transcript-actions">
									<button class="voice-link" @click="transcriptDraft = ''">重新转写</button>
									<button class="insert-button" @click="appendTranscript"><text>加入正文</text></button>
								</view>
							</view>
						</view>
					</view>
				</view>

				<view class="image-strip" v-if="diaryForm.images.length">
					<view class="section-heading-row">
						<text class="section-heading">照片</text>
						<text class="section-value">{{ diaryForm.images.length }} / 9</text>
					</view>
					<view class="image-grid">
						<view class="image-item" v-for="(img, index) in diaryForm.images" :key="img">
							<image class="image-preview" :src="img" mode="aspectFill" />
							<button class="image-delete" @click="removeImage(index)">×</button>
						</view>
						<button class="image-add" v-if="diaryForm.images.length < 9" @click="chooseImage">
							<text class="image-add-plus">＋</text>
							<text>继续添加</text>
						</button>
					</view>
				</view>

				<view class="linked-cards" v-if="diaryForm.linkedCards.length">
					<text class="section-heading">关联的菇卡</text>
					<view class="linked-card" v-for="(card, index) in diaryForm.linkedCards" :key="index">
						<text class="linked-card-mark">✦</text>
						<text class="linked-card-text">{{ card.seedSentence || '已关联菇卡' }}</text>
						<button class="linked-card-delete" @click="removeCard(card.id || card)">×</button>
					</view>
				</view>

				<view class="linked-inquiries" v-if="linkedInquiries.length">
					<view class="linked-inquiry-heading">
						<view><text class="section-heading">放进长期问题</text><text>保存后成为一条由你确认的线索</text></view>
						<button @tap="selectInquiry">调整</button>
					</view>
					<view class="linked-inquiry" v-for="item in linkedInquiries" :key="item.id">
						<text class="linked-inquiry-mark">?</text>
						<text class="linked-inquiry-text">{{ item.question }}</text>
						<button class="linked-card-delete" @tap="removeInquiry(item.id)">×</button>
					</view>
				</view>

				<view class="details-panel" v-if="detailsOpen">
					<view class="details-header">
						<view>
							<text class="voice-kicker">JOURNAL DETAILS</text>
							<text class="details-title">日记设置</text>
						</view>
						<button class="quiet-button" @click="detailsOpen = false">收起</button>
					</view>

					<view class="detail-row">
						<text class="detail-label">记录时间</text>
						<picker mode="selector" :range="timeOptions" range-key="label" :value="selectedTimeIndex" @change="onTimeChange">
							<view class="detail-picker">
								<text>{{ selectedTimeText }}</text>
								<text class="detail-arrow">›</text>
							</view>
						</picker>
					</view>

					<view class="detail-section">
						<text class="detail-label">谁可以看到</text>
						<view class="privacy-list">
							<button
								v-for="option in privacyOptions"
								:key="option.value"
								class="privacy-option"
								:class="{ selected: diaryForm.visibility === option.value }"
								@click="selectPrivacy(option.value)"
							>
								<view class="privacy-radio"><view v-if="diaryForm.visibility === option.value" class="privacy-dot"></view></view>
								<view class="privacy-copy">
									<text class="privacy-name">{{ option.label }}</text>
									<text class="privacy-description">{{ option.desc }}</text>
								</view>
							</button>
						</view>
					</view>

					<button class="ai-access-row" v-if="diaryId" :disabled="aiAccessChanging" @click="toggleAiAccess">
						<view>
							<text class="privacy-name">允许 AI 读取这篇日记</text>
							<text class="privacy-description">保存后自动整理人脉事件；五视角与回看仍由你主动发起。关闭会停止并清理派生索引。</text>
						</view>
						<view class="access-switch" :class="{ on: diaryForm.aiAllowed }"><view></view></view>
					</button>
				</view>

				<view class="reflection-bridge" v-if="diaryId && diaryForm.content.length">
					<view class="reflection-mark"><text>↗</text></view>
					<view class="analysis-copy"><text>看看关联</text><text>从自己的历史日记里寻找相似经历、变化与反例，结论都可以回到原文。</text></view>
					<button class="reflection-button" @click="openReflection">回看</button>
				</view>

				<view class="analysis-bridge" v-if="diaryId && diaryForm.content.length > 20">
						<view class="analysis-orbit"><text>5</text></view>
						<view class="analysis-copy"><text>五视角重新观察</text><text>AI 会分析这段经历，也会判断是否值得沉淀新菇卡或关联历史菇卡。</text></view>
					<button class="analysis-button" @click="openAnalysis">查看</button>
				</view>

				<view class="bottom-space"></view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { diaryAiAccess, diaryDetail, diaryCreate, diaryUpdate } from '@/api/diary';
import { shroomCardDetail } from '@/api/shroomCard';
import { inquiryDiaryLinks } from '@/api/inquiry';
import { uploadImage, uploadVoice, transcribeVoiceBase } from '@/api/upload';
import indexConfig from '@/config/index.config';
import voiceProgress from '@/utils/voice-progress.js';

const MAX_RECORD_SECONDS = 600;
const { clampPercent, estimatedTranscriptionPercent } = voiceProgress;

export default {
	data() {
		const timeOptions = [{ value: 'fullDay', label: '当天日记', hour: null, minute: null, isFullDay: true }];
		for (let hour = 0; hour < 24; hour++) {
			for (let minute = 0; minute < 60; minute += 30) {
				const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
				timeOptions.push({
					value: timeStr,
					label: moment(timeStr, 'HH:mm').format('HH:mm'),
					hour,
					minute,
					isFullDay: false
				});
			}
		}

		return {
			statusBarHeight: 0,
			diaryId: null,
			entryDate: moment().format('YYYY-MM-DD'),
			originalCreatedAt: null,
			selectedTimeIndex: 0,
			timeOptions,
			diaryForm: {
				content: '',
				mood: 'calm',
				images: [],
				voice: null,
				linkedCards: [],
				visibility: 'PRIVATE',
				hour: null,
				minute: null,
				type: 'default',
				aiAllowed: true
			},
			moods: [
				{ value: 'happy', label: '开心', emoji: '😊' },
				{ value: 'excited', label: '雀跃', emoji: '🤩' },
				{ value: 'calm', label: '平静', emoji: '😌' },
				{ value: 'tired', label: '疲惫', emoji: '😴' },
				{ value: 'anxious', label: '焦虑', emoji: '😰' },
				{ value: 'sad', label: '难过', emoji: '😢' },
				{ value: 'angry', label: '生气', emoji: '😠' },
				{ value: 'confused', label: '困惑', emoji: '😕' }
			],
			privacyOptions: [
				{ value: 'PRIVATE', label: '仅自己可见', desc: '这是默认选项，只有你能看到' },
				{ value: 'PUBLIC_ANON', label: '匿名公开', desc: '出现在发现页，但不显示你的身份' },
				{ value: 'PUBLIC_NAMED', label: '公开并署名', desc: '出现在发现页，同时显示昵称和头像' }
			],
			waveformBars: [20, 34, 46, 28, 58, 38, 64, 42, 72, 48, 60, 32, 52, 68, 40, 56, 30, 66, 44, 74, 50, 62, 36, 54, 70, 42, 58, 32, 48, 64, 38, 24],
			voicePanelOpen: false,
			detailsOpen: false,
			isRecording: false,
			voiceUploading: false,
			voiceUploadProgress: 0,
			voiceUploadElapsed: 0,
			voiceUploadStartedAt: 0,
			voiceUploadTimer: null,
			imageUploading: false,
			imageUploadProgress: 0,
			imageUploadFinishedCount: 0,
			imageUploadSuccessCount: 0,
			imageUploadTotal: 0,
			imageUploadElapsed: 0,
			imageUploadStartedAt: 0,
			imageUploadItems: [],
			imageUploadTimer: null,
			imageUploadHideTimer: null,
			transcribing: false,
			transcribeProgress: 0,
			transcribeElapsed: 0,
			transcribeStartedAt: 0,
			transcribeTimer: null,
				transcriptionError: '',
				transcriptionAvailable: false,
				transcriptionStatusKnown: false,
				analysisAvailable: false,
			lookBackAfterSave: false,
			linkedInquiries: [],
			aiAccessChanging: false,
			saving: false,
			recordSeconds: 0,
			recordStartedAt: 0,
			recordTimer: null,
			recorderManager: null,
			h5Recorder: null,
			h5Stream: null,
			h5Chunks: [],
			voicePlayer: null,
			isVoicePlaying: false,
			voicePlaybackTime: 0,
			transcriptDraft: '',
			transcriptMeta: null
		};
	},
	computed: {
		canSave() {
			return !this.saving && !this.isRecording && !this.voiceUploading && !this.imageUploading &&
				(this.diaryForm.content.trim().length > 0 || Boolean(this.diaryForm.voice));
		},
		selectedMood() {
			return this.moods.find(item => item.value === this.diaryForm.mood) || this.moods[2];
		},
		displayDateEyebrow() {
			if (this.entryDate === moment().format('YYYY-MM-DD')) return '今天';
			return this.weekdayLabel(this.entryDate);
		},
		displayDateTitle() {
			return `${moment(this.entryDate).format('M月D日')} · ${this.weekdayLabel(this.entryDate)}`;
		},
		selectedTimeText() {
			if (this.diaryForm.hour === null || this.diaryForm.minute === null) return '当天日记';
			return `${String(this.diaryForm.hour).padStart(2, '0')}:${String(this.diaryForm.minute).padStart(2, '0')}`;
		},
		voiceDuration() {
			return this.diaryForm.voice ? Number(this.diaryForm.voice.duration) || 0 : 0;
		}
	},
	onLoad(options) {
		// #ifdef H5
		document.documentElement.classList.add('shroom-focus-active');
		// #endif
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
		if (options && /^\d{4}-\d{2}-\d{2}$/.test(String(options.date || ''))) this.entryDate = options.date;
		if (options && options.time) this.setTimeFromString(options.time);
		this.initVoicePlayer();
		this.initPlatformRecorder();
		this.loadCapabilities();
		if (options && options.cardId && !options.id) this.loadInitialCard(String(options.cardId));
		if (options && options.id) {
			this.diaryId = options.id;
			this.loadDiary(options.id);
		}
	},
	onUnload() {
		// #ifdef H5
		document.documentElement.classList.remove('shroom-focus-active');
		// #endif
		this.clearRecordTimer();
		this.clearVoiceUploadTimer();
		this.clearImageUploadTimers();
		this.clearTranscriptionTimer();
		this.releaseMicrophone();
		if (this.voicePlayer) {
			this.voicePlayer.stop();
			this.voicePlayer.destroy();
			this.voicePlayer = null;
		}
	},
	methods: {
		async loadInitialCard(cardId) {
			try {
				const res = await this.$http.get(shroomCardDetail, { id: cardId });
				if (res && res.code === 200 && res.data && res.data.isOwner) {
					this.diaryForm.linkedCards = [res.data];
				}
			} catch (error) {
				console.error('预关联菇卡失败', error);
			}
		},
		async loadCapabilities() {
			try {
					const res = await this.$http.get('/health');
					this.transcriptionAvailable = Boolean(res && res.data && res.data.transcription && res.data.transcription.enabled);
					this.analysisAvailable = Boolean(res && res.data && res.data.analysis && res.data.analysis.enabled);
				} catch (error) {
					console.warn('无法读取转写服务状态', error);
					this.transcriptionAvailable = false;
					this.analysisAvailable = false;
			} finally {
				this.transcriptionStatusKnown = true;
			}
		},
		weekdayLabel(date) {
			return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][moment(date).day()];
		},
		async loadDiary(id) {
			try {
				uni.showLoading({ title: '打开日记…' });
				const res = await this.$http.get(diaryDetail, { id });
				if (res.code !== 200 || !res.data) return;
				const diary = res.data;
				this.originalCreatedAt = diary.createdAt || null;
				if (diary.createdAt) this.entryDate = moment(diary.createdAt).format('YYYY-MM-DD');
				this.diaryForm = {
					id: diary.id,
					content: diary.content || '',
					mood: diary.mood || 'calm',
					images: Array.isArray(diary.images) ? diary.images : [],
					voice: diary.voice || null,
					hour: diary.hour === null || diary.hour === undefined ? null : Number(diary.hour),
					minute: diary.minute === null || diary.minute === undefined ? null : Number(diary.minute),
					type: diary.type || 'default',
					linkedCards: Array.isArray(diary.linkedCards) ? diary.linkedCards : [],
					visibility: diary.visibility || 'PRIVATE',
					aiAllowed: diary.aiAllowed !== false
				};
				this.transcriptDraft = diary.voice && diary.voice.transcript ? diary.voice.transcript : '';
				this.syncSelectedTime();
				this.voicePanelOpen = Boolean(diary.voice);
				await this.loadInquiryLinks(id);
			} catch (error) {
				console.error('加载日记失败', error);
				uni.showToast({ title: '日记暂时打不开', icon: 'none' });
			} finally {
				uni.hideLoading();
			}
		},

		selectMood(mood) {
			this.diaryForm.mood = mood;
		},
		async chooseImage() {
			if (this.diaryForm.images.length >= 9 || this.imageUploading) return;
			try {
				const selected = await new Promise((resolve, reject) => {
					uni.chooseImage({ count: 9 - this.diaryForm.images.length, sizeType: ['compressed'], success: resolve, fail: reject });
				});
				const filePaths = Array.isArray(selected.tempFilePaths) ? selected.tempFilePaths.filter(Boolean) : [];
				if (!filePaths.length) return;
				this.beginImageUpload(filePaths.length);
				const uploads = filePaths.map((filePath, index) => this.$http.upload(uploadImage, {
					filePath,
					name: 'file',
					getTask: task => this.trackImageUploadTask(task, index)
				}).then(result => {
					this.finishImageUploadItem(index, true);
					return result;
				}).catch(error => {
					console.error('单张照片保存失败', error);
					this.finishImageUploadItem(index, false);
					return null;
				}));
				const results = await Promise.all(uploads);
				const urls = results.filter(item => item && item.code === 200 && item.data && item.data.url).map(item => item.data.url);
				this.diaryForm.images = this.diaryForm.images.concat(urls).slice(0, 9);
				if (urls.length < filePaths.length) {
					uni.showToast({ title: urls.length ? `${urls.length} 张已保存，其余请重试` : '照片没有保存成功', icon: 'none' });
				}
			} catch (error) {
				if (!String((error && error.errMsg) || error).includes('cancel')) {
					uni.showToast({ title: '照片没有保存成功', icon: 'none' });
				}
			} finally {
				if (this.imageUploading) this.finishImageUploadBatch();
			}
		},
		beginImageUpload(total) {
			this.clearImageUploadTimers();
			this.imageUploading = true;
			this.imageUploadProgress = 0;
			this.imageUploadFinishedCount = 0;
			this.imageUploadSuccessCount = 0;
			this.imageUploadTotal = total;
			this.imageUploadElapsed = 0;
			this.imageUploadStartedAt = Date.now();
			this.imageUploadItems = Array.from({ length: total }, () => ({ progress: 0, finished: false, success: false }));
			this.imageUploadTimer = setInterval(() => {
				this.imageUploadElapsed = Math.max(0, Math.floor((Date.now() - this.imageUploadStartedAt) / 1000));
			}, 500);
		},
		trackImageUploadTask(task, index) {
			if (!task || typeof task.onProgressUpdate !== 'function') return;
			task.onProgressUpdate(progress => {
				const item = this.imageUploadItems[index];
				if (!item || item.finished) return;
				this.$set(this.imageUploadItems, index, {
					...item,
					progress: Math.min(99, clampPercent(progress && progress.progress))
				});
				this.updateImageUploadProgress();
			});
		},
		finishImageUploadItem(index, success) {
			const item = this.imageUploadItems[index];
			if (!item || item.finished) return;
			this.$set(this.imageUploadItems, index, { ...item, progress: 100, finished: true, success });
			this.imageUploadFinishedCount += 1;
			if (success) this.imageUploadSuccessCount += 1;
			this.updateImageUploadProgress();
		},
		updateImageUploadProgress() {
			if (!this.imageUploadItems.length) {
				this.imageUploadProgress = 0;
				return;
			}
			const total = this.imageUploadItems.reduce((sum, item) => sum + Number(item.progress || 0), 0);
			const progress = Math.round(total / this.imageUploadItems.length);
			this.imageUploadProgress = this.imageUploadFinishedCount === this.imageUploadTotal ? 100 : Math.min(99, progress);
		},
		finishImageUploadBatch() {
			this.imageUploadProgress = 100;
			if (this.imageUploadTimer) clearInterval(this.imageUploadTimer);
			this.imageUploadTimer = null;
			this.imageUploadHideTimer = setTimeout(() => {
				this.imageUploading = false;
				this.imageUploadHideTimer = null;
			}, 500);
		},
		clearImageUploadTimers() {
			if (this.imageUploadTimer) clearInterval(this.imageUploadTimer);
			if (this.imageUploadHideTimer) clearTimeout(this.imageUploadHideTimer);
			this.imageUploadTimer = null;
			this.imageUploadHideTimer = null;
		},
		removeImage(index) {
			this.diaryForm.images.splice(index, 1);
		},

		openVoicePanel() {
			this.voicePanelOpen = true;
			this.detailsOpen = false;
		},
		initPlatformRecorder() {
			// #ifndef H5
			if (typeof uni.getRecorderManager !== 'function') return;
			const manager = uni.getRecorderManager();
			manager.onStop(result => this.finishPlatformRecording(result));
			manager.onError(error => this.handleRecordingError(error));
			this.recorderManager = manager;
			// #endif
		},
		async startRecording() {
			if (this.isRecording || this.voiceUploading) return;
			this.stopVoicePlayback();
			// #ifdef H5
			await this.startH5Recording();
			// #endif
			// #ifndef H5
			this.startPlatformRecording();
			// #endif
		},
		startPlatformRecording() {
			if (!this.recorderManager) {
				uni.showToast({ title: '当前设备暂不支持录音', icon: 'none' });
				return;
			}
			try {
				this.recorderManager.start({
					duration: MAX_RECORD_SECONDS * 1000,
					sampleRate: 16000,
					numberOfChannels: 1,
					encodeBitRate: 64000,
					format: 'mp3'
				});
				this.beginRecordingTimer();
			} catch (error) {
				this.handleRecordingError(error);
			}
		},
		async startH5Recording() {
			try {
				if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
					uni.showToast({ title: '请使用新版 Safari、Chrome 或 Edge 录音', icon: 'none' });
					return;
				}
				this.h5Stream = await navigator.mediaDevices.getUserMedia({
					audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
				});
				const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
				const mimeType = candidates.find(type => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type));
				this.h5Chunks = [];
				this.h5Recorder = mimeType ? new MediaRecorder(this.h5Stream, { mimeType }) : new MediaRecorder(this.h5Stream);
				this.h5Recorder.ondataavailable = event => {
					if (event.data && event.data.size) this.h5Chunks.push(event.data);
				};
				this.h5Recorder.onerror = error => this.handleRecordingError(error);
				this.h5Recorder.onstop = () => {
					const blobType = this.h5Recorder && this.h5Recorder.mimeType ? this.h5Recorder.mimeType : 'audio/webm';
					const blob = new Blob(this.h5Chunks, { type: blobType });
					this.finishH5Recording(blob);
				};
				this.h5Recorder.start(500);
				this.beginRecordingTimer();
			} catch (error) {
				this.handleRecordingError(error);
			}
		},
		beginRecordingTimer() {
			this.recordStartedAt = Date.now();
			this.recordSeconds = 0;
			this.isRecording = true;
			this.clearRecordTimer();
			this.recordTimer = setInterval(() => {
				this.recordSeconds = Math.min(MAX_RECORD_SECONDS, Math.floor((Date.now() - this.recordStartedAt) / 1000));
				if (this.recordSeconds >= MAX_RECORD_SECONDS) this.stopRecording();
			}, 500);
		},
		stopRecording() {
			if (!this.isRecording || this.voiceUploading) return;
			this.isRecording = false;
			this.clearRecordTimer();
			// #ifdef H5
			if (this.h5Recorder && this.h5Recorder.state !== 'inactive') this.h5Recorder.stop();
			// #endif
			// #ifndef H5
			if (this.recorderManager) this.recorderManager.stop();
			// #endif
		},
		clearRecordTimer() {
			if (this.recordTimer) clearInterval(this.recordTimer);
			this.recordTimer = null;
		},
		releaseMicrophone() {
			// #ifdef H5
			if (this.h5Stream) this.h5Stream.getTracks().forEach(track => track.stop());
			this.h5Stream = null;
			// #endif
		},
		handleRecordingError(error) {
			console.error('录音失败', error);
			this.isRecording = false;
			this.voiceUploading = false;
			this.clearRecordTimer();
			this.clearVoiceUploadTimer();
			this.releaseMicrophone();
			const message = String((error && (error.errMsg || error.name || error.message)) || '');
			const denied = /denied|permission|auth/i.test(message);
			uni.showToast({ title: denied ? '请允许 Shroom 使用麦克风' : '录音没有成功，请再试一次', icon: 'none' });
		},
		beginVoiceUpload() {
			this.voiceUploading = true;
			this.voiceUploadProgress = 0;
			this.voiceUploadElapsed = 0;
			this.voiceUploadStartedAt = Date.now();
			this.clearVoiceUploadTimer();
			this.voiceUploadTimer = setInterval(() => {
				this.voiceUploadElapsed = Math.max(0, Math.floor((Date.now() - this.voiceUploadStartedAt) / 1000));
			}, 500);
		},
		clearVoiceUploadTimer() {
			if (this.voiceUploadTimer) clearInterval(this.voiceUploadTimer);
			this.voiceUploadTimer = null;
		},
		setVoiceUploadProgress(value) {
			this.voiceUploadProgress = clampPercent(value);
		},
		trackVoiceUploadTask(task) {
			if (!task || typeof task.onProgressUpdate !== 'function') return;
			task.onProgressUpdate(progress => this.setVoiceUploadProgress(progress && progress.progress));
		},
		finishVoiceUpload(success) {
			if (success) this.voiceUploadProgress = 100;
			this.voiceUploading = false;
			this.clearVoiceUploadTimer();
		},
		async finishPlatformRecording(result) {
			this.isRecording = false;
			this.clearRecordTimer();
			if (!result || !result.tempFilePath) {
				this.handleRecordingError(new Error('Missing recording file'));
				return;
			}
			try {
				this.beginVoiceUpload();
				const response = await this.$http.upload(uploadVoice, {
					filePath: result.tempFilePath,
					name: 'file',
					getTask: task => this.trackVoiceUploadTask(task)
				});
				this.acceptVoiceUpload(response, 'audio/mpeg');
				this.finishVoiceUpload(true);
			} catch (error) {
				console.error('语音上传失败', error);
				uni.showToast({ title: '录音未能保存，请重新录制', icon: 'none' });
			} finally {
				this.finishVoiceUpload(Boolean(this.diaryForm.voice));
			}
		},
		async finishH5Recording(blob) {
			this.releaseMicrophone();
			if (!blob || !blob.size) {
				this.handleRecordingError(new Error('Empty recording'));
				return;
			}
			if (blob.size > 10 * 1024 * 1024) {
				uni.showToast({ title: '录音文件超过 10MB，请缩短后重试', icon: 'none' });
				return;
			}
			try {
				this.beginVoiceUpload();
				const cleanType = String(blob.type || 'audio/webm').split(';')[0];
				const extension = cleanType === 'audio/mp4' ? 'm4a' : (cleanType.split('/')[1] || 'webm');
				const payload = await this.uploadH5Voice(blob, extension);
				this.acceptVoiceUpload(payload, cleanType);
				this.finishVoiceUpload(true);
			} catch (error) {
				console.error('语音上传失败', error);
				uni.showToast({ title: '录音未能保存，请重新录制', icon: 'none' });
			} finally {
				this.finishVoiceUpload(Boolean(this.diaryForm.voice));
			}
		},
		uploadH5Voice(blob, extension) {
			return new Promise((resolve, reject) => {
				const formData = new FormData();
				formData.append('file', blob, `shroom-${Date.now()}.${extension}`);
				const request = new XMLHttpRequest();
				request.open('POST', `${indexConfig.baseUrl}${uploadVoice}`, true);
				request.timeout = 120000;
				request.setRequestHeader('x-api-key', uni.getStorageSync('accessToken'));
				request.upload.onprogress = event => {
					if (event.lengthComputable && event.total > 0) {
						this.setVoiceUploadProgress((event.loaded / event.total) * 100);
					}
				};
				request.onerror = () => reject(new Error('Voice upload network error'));
				request.ontimeout = () => reject(new Error('Voice upload timeout'));
				request.onload = () => {
					let payload;
					try {
						payload = JSON.parse(request.responseText || '{}');
					} catch (error) {
						reject(new Error('Invalid voice upload response'));
						return;
					}
					if (request.status < 200 || request.status >= 300 || payload.code !== 200) {
						reject(new Error(payload.message || 'Voice upload failed'));
						return;
					}
					resolve(payload);
				};
				request.send(formData);
			});
		},
		acceptVoiceUpload(response, mimeType) {
			if (!response || response.code !== 200 || !response.data || !response.data.id) throw new Error('Invalid voice upload');
			this.diaryForm.voice = {
				mediaId: response.data.id,
				url: response.data.url,
				duration: Math.max(1, this.recordSeconds),
				mimeType,
				transcript: null,
				transcribedAt: null,
				model: null
			};
			this.transcriptDraft = '';
			this.transcriptMeta = null;
			this.transcriptionError = '';
			this.voicePlaybackTime = 0;
			uni.showToast({ title: '语音已保存', icon: 'success' });
		},

		initVoicePlayer() {
			if (typeof uni.createInnerAudioContext !== 'function') return;
			const player = uni.createInnerAudioContext();
			player.autoplay = false;
			player.onPlay(() => { this.isVoicePlaying = true; });
			player.onPause(() => { this.isVoicePlaying = false; });
			player.onStop(() => { this.isVoicePlaying = false; this.voicePlaybackTime = 0; });
			player.onEnded(() => { this.isVoicePlaying = false; this.voicePlaybackTime = 0; });
			player.onTimeUpdate(() => { this.voicePlaybackTime = Number(player.currentTime) || 0; });
			player.onError(error => {
				console.error('语音播放失败', error);
				this.isVoicePlaying = false;
				uni.showToast({ title: '语音暂时无法播放', icon: 'none' });
			});
			this.voicePlayer = player;
		},
		toggleVoicePlayback() {
			if (!this.diaryForm.voice || !this.diaryForm.voice.url || !this.voicePlayer) return;
			if (this.isVoicePlaying) {
				this.voicePlayer.pause();
				return;
			}
			if (this.voicePlayer.src !== this.diaryForm.voice.url) this.voicePlayer.src = this.diaryForm.voice.url;
			this.voicePlayer.play();
		},
		stopVoicePlayback() {
			if (this.voicePlayer && this.isVoicePlaying) this.voicePlayer.stop();
			this.isVoicePlaying = false;
		},
		restartVoice() {
			if (!this.voicePlayer || !this.diaryForm.voice) return;
			if (this.voicePlayer.src !== this.diaryForm.voice.url) this.voicePlayer.src = this.diaryForm.voice.url;
			this.voicePlayer.seek(0);
			this.voicePlaybackTime = 0;
			this.voicePlayer.play();
		},
		isWavePlayed(index) {
			if (!this.voiceDuration) return false;
			return index / this.waveformBars.length <= this.voicePlaybackTime / this.voiceDuration;
		},
		formatDuration(seconds) {
			const total = Math.max(0, Math.round(Number(seconds) || 0));
			return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
		},
		replaceVoice() {
			uni.showModal({
				title: '重新录制？',
				content: '新录音会替换当前语音，已经加入正文的文字不会删除。',
				success: result => {
					if (!result.confirm) return;
					this.removeVoice(false);
					this.startRecording();
				}
			});
		},
		removeVoice(showMessage = true) {
			this.stopVoicePlayback();
			this.diaryForm.voice = null;
			this.transcriptDraft = '';
			this.transcriptMeta = null;
			this.transcriptionError = '';
			this.voicePlaybackTime = 0;
			if (showMessage) uni.showToast({ title: '已从这篇日记移除', icon: 'none' });
		},
		beginTranscriptionProgress() {
			this.transcribing = true;
			this.transcriptionError = '';
			this.transcribeProgress = 8;
			this.transcribeElapsed = 0;
			this.transcribeStartedAt = Date.now();
			this.clearTranscriptionTimer();
			this.transcribeTimer = setInterval(() => {
				this.transcribeElapsed = Math.max(0, Math.floor((Date.now() - this.transcribeStartedAt) / 1000));
				this.transcribeProgress = estimatedTranscriptionPercent(this.transcribeElapsed, this.voiceDuration);
			}, 500);
		},
		clearTranscriptionTimer() {
			if (this.transcribeTimer) clearInterval(this.transcribeTimer);
			this.transcribeTimer = null;
		},
		finishTranscriptionProgress(success) {
			if (success) this.transcribeProgress = 100;
			this.transcribing = false;
			this.clearTranscriptionTimer();
		},
		async transcribeRecording() {
			const voice = this.diaryForm.voice;
			if (!this.transcriptionAvailable) {
				uni.showToast({ title: '高精度转写服务待接入', icon: 'none' });
				return;
			}
			if (!voice || !voice.mediaId || this.transcribing) return;
			this.beginTranscriptionProgress();
			let completed = false;
			try {
				const res = await this.$http.post(`${transcribeVoiceBase}/${voice.mediaId}/transcribe`, {});
				if (res.code !== 200 || !res.data || !res.data.text) throw new Error('Empty transcript');
				this.transcriptDraft = res.data.text;
				this.transcriptMeta = { model: res.data.model || null, language: res.data.language || null };
				completed = true;
				uni.showToast({ title: '转写完成，可以继续修改', icon: 'success' });
			} catch (error) {
				console.error('语音转写失败', error);
				const message = typeof error === 'string' ? error : (error && error.message);
				this.transcriptionError = message || '转写没有完成，录音已经安全保存，可以稍后重试。';
			} finally {
				this.finishTranscriptionProgress(completed);
			}
		},
		appendTranscript() {
			const text = this.transcriptDraft.trim();
			if (!text) return;
			const separator = this.diaryForm.content.trim() ? '\n\n' : '';
			const remaining = 5000 - this.diaryForm.content.length - separator.length;
			if (remaining <= 0) {
				uni.showToast({ title: '正文已经达到 5000 字', icon: 'none' });
				return;
			}
			this.diaryForm.content += separator + text.slice(0, remaining);
			uni.showToast({ title: '已加入正文，可继续修改', icon: 'none' });
		},

		selectCard() {
			uni.navigateTo({
				url: '/pages/common/cards/select?mode=link',
				success: res => {
					res.eventChannel.on('selectCard', card => {
						if (!card || this.diaryForm.linkedCards.some(item => (item.id || item) === card.id)) return;
						this.diaryForm.linkedCards.push(card);
					});
				}
			});
		},
		selectInquiry() {
			const selected = encodeURIComponent(JSON.stringify(this.linkedInquiries.map(item => ({
				id: item.id, question: item.question, status: item.status
			}))));
			uni.navigateTo({
				url: `/pages/shroom/inquiries?mode=select&selected=${selected}`,
				success: res => {
					res.eventChannel.on('selectInquiries', items => {
						this.linkedInquiries = Array.isArray(items) ? items.slice(0, 3) : [];
					});
				}
			});
		},
		removeInquiry(id) {
			this.linkedInquiries = this.linkedInquiries.filter(item => item.id !== id);
		},
		async loadInquiryLinks(diaryId) {
			try {
				const res = await this.$http.get(inquiryDiaryLinks(diaryId));
				this.linkedInquiries = Array.isArray(res.data) ? res.data : [];
			} catch (error) {
				console.error('加载问题关联失败', error);
				this.linkedInquiries = [];
			}
		},
		async syncInquiryLinks(diaryId) {
			await this.$http.put(inquiryDiaryLinks(diaryId), {
				inquiryIds: this.linkedInquiries.map(item => item.id)
			});
		},
		removeCard(cardId) {
			this.diaryForm.linkedCards = this.diaryForm.linkedCards.filter(card => (card.id || card) !== cardId);
		},
			openAnalysis() {
			if (this.diaryId) uni.navigateTo({ url: `/pages/shroom/ai-analysis?diaryId=${this.diaryId}` });
		},
		openReflection() {
			if (!this.diaryId) return;
			if (this.diaryForm.aiAllowed === false) {
				uni.showToast({ title: '请先允许 AI 读取这篇日记', icon: 'none' });
				return;
			}
			uni.navigateTo({ url: `/pages/shroom/memory?diaryId=${this.diaryId}` });
		},
		async toggleAiAccess() {
			if (!this.diaryId || this.aiAccessChanging) return;
			const allowed = !this.diaryForm.aiAllowed;
			this.aiAccessChanging = true;
			try {
				const res = await this.$http.patch(`${diaryAiAccess}?id=${this.diaryId}`, { allowed });
				if (res.code !== 200) throw new Error(res.message || 'Update failed');
				this.diaryForm.aiAllowed = allowed;
				uni.showToast({ title: allowed ? '已允许主动回看' : '已关闭并清理派生索引', icon: 'none' });
			} catch (error) {
				console.error('更新 AI 访问权限失败', error);
			} finally {
				this.aiAccessChanging = false;
			}
		},
		selectPrivacy(value) {
			this.diaryForm.visibility = value;
		},
		setTimeFromString(value) {
			const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
			if (!match) return;
			this.diaryForm.hour = Number(match[1]);
			this.diaryForm.minute = Number(match[2]);
			this.syncSelectedTime();
		},
		syncSelectedTime() {
			const index = this.timeOptions.findIndex(option => option.hour === this.diaryForm.hour && option.minute === this.diaryForm.minute);
			this.selectedTimeIndex = index > -1 ? index : 0;
		},
		onTimeChange(event) {
			const index = Number(event.detail.value);
			const option = this.timeOptions[index] || this.timeOptions[0];
			this.diaryForm.hour = option.hour;
			this.diaryForm.minute = option.minute;
			this.selectedTimeIndex = index;
		},
		buildOccurredAt() {
			if (this.diaryId && this.originalCreatedAt && this.diaryForm.hour === null && this.diaryForm.minute === null) {
				return moment(this.originalCreatedAt).format('YYYY-MM-DD HH:mm:ss');
			}
			let time = '12:00:00';
			if (this.diaryForm.hour !== null && this.diaryForm.minute !== null) {
				time = `${String(this.diaryForm.hour).padStart(2, '0')}:${String(this.diaryForm.minute).padStart(2, '0')}:00`;
			} else if (this.entryDate === moment().format('YYYY-MM-DD')) {
				time = moment().format('HH:mm:ss');
			}
			return `${this.entryDate} ${time}`;
		},
		async saveDiary() {
			if (!this.canSave) {
				uni.showToast({ title: '写点文字或留下一段语音吧', icon: 'none' });
				return;
			}
			this.saving = true;
			try {
				const voice = this.diaryForm.voice ? {
					...this.diaryForm.voice,
					transcript: this.transcriptDraft.trim() || null,
					transcribedAt: this.transcriptDraft.trim() ? (this.diaryForm.voice.transcribedAt || moment().toISOString()) : null,
					model: this.transcriptDraft.trim() ? ((this.transcriptMeta && this.transcriptMeta.model) || this.diaryForm.voice.model || null) : null
				} : null;
				const diaryData = {
					content: this.diaryForm.content,
					mood: this.diaryForm.mood,
					images: this.diaryForm.images,
					voice,
					hour: this.diaryForm.hour,
					minute: this.diaryForm.minute,
					type: this.diaryForm.type || 'default',
					linkedCards: this.diaryForm.linkedCards.map(card => card.id || card),
					visibility: this.diaryForm.visibility || 'PRIVATE',
					createdAt: this.buildOccurredAt()
				};
					const res = this.diaryId
						? await this.$http.put(`${diaryUpdate}?id=${this.diaryId}`, diaryData)
						: await this.$http.post(diaryCreate, diaryData);
					if (res.code !== 200) throw new Error(res.message || 'Save failed');
					this.diaryId = res.data && res.data.id ? res.data.id : this.diaryId;
					let linkSyncFailed = false;
					try {
						await this.syncInquiryLinks(this.diaryId);
					} catch (error) {
						linkSyncFailed = true;
						console.error('同步问题线索失败', error);
					}
					if (this.lookBackAfterSave && this.diaryId) {
						uni.redirectTo({
							url: `/pages/shroom/memory?diaryId=${this.diaryId}`,
							fail: () => this.leaveEditor()
						});
						return;
					}
					uni.showToast({ title: linkSyncFailed ? '日记已保存，问题关联请重试' : '这一刻已经保存', icon: linkSyncFailed ? 'none' : 'success' });
					setTimeout(() => this.leaveEditor(), 700);
			} catch (error) {
				console.error('保存日记失败', error);
				uni.showToast({ title: '日记没有保存成功', icon: 'none' });
			} finally {
					this.saving = false;
				}
			},
		hasDraft() {
			return Boolean(this.diaryForm.content.trim() || this.diaryForm.voice || this.diaryForm.images.length);
		},
		leaveEditor() {
			const pages = getCurrentPages();
			const openDiaryHome = () => uni.switchTab({
				url: '/pages/diary/index',
				fail: () => uni.reLaunch({ url: '/pages/diary/index' })
			});
			if (pages.length > 1) {
				uni.navigateBack({ fail: openDiaryHome });
				return;
			}
			openDiaryHome();
		},
		goBack() {
			if (!this.hasDraft()) {
				this.leaveEditor();
				return;
			}
			uni.showModal({
				title: '要离开这篇日记吗？',
				content: '还没有点击完成，刚才的修改不会保留。',
				confirmText: '离开',
				cancelText: '继续写',
				success: result => { if (result.confirm) this.leaveEditor(); }
			});
		}
	}
};
</script>

<style lang="scss" scoped>
button {
	padding: 0;
	margin: 0;
	line-height: 1;
	background: transparent;
	border-radius: 0;
}

button::after { border: 0; }

.edit-diary-page {
	height: 100vh;
	display: flex;
	flex-direction: column;
	background: #f1f8e9;
	color: #172019;
}

.status-bar { flex-shrink: 0; background: rgba(241, 248, 233, 0.96); }

.navbar {
	flex-shrink: 0;
	background: rgba(241, 248, 233, 0.96);
	border-bottom: 1rpx solid rgba(23, 32, 25, 0.08);
	z-index: 20;
}

.nav-inner {
	height: 112rpx;
	max-width: 920rpx;
	margin: 0 auto;
	padding: 0 34rpx;
	display: flex;
	align-items: center;
	box-sizing: border-box;
}

.nav-back {
	width: 72rpx;
	height: 72rpx;
	border: 1rpx solid rgba(23, 32, 25, 0.12);
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(255, 255, 255, 0.5);
}

.nav-back-icon { font-size: 56rpx; font-weight: 300; transform: translateY(-3rpx); }
.nav-heading { flex: 1; padding-left: 24rpx; display: flex; flex-direction: column; }
.nav-kicker, .voice-kicker, .transcript-kicker, .bridge-kicker {
	font-size: 18rpx;
	line-height: 1.2;
	letter-spacing: 3rpx;
	font-weight: 700;
	color: #718075;
}
.nav-title { margin-top: 7rpx; font-size: 28rpx; line-height: 1; font-weight: 650; }

.nav-save {
	min-width: 108rpx;
	height: 66rpx;
	padding: 0 28rpx;
	border-radius: 34rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	background: #52622f;
	color: #fffdf8;
	font-size: 25rpx;
	font-weight: 650;
}
.nav-save.disabled { opacity: 0.34; }

.content-scroll { flex: 1; height: 0; }
.journal-canvas { width: 100%; max-width: 920rpx; margin: 0 auto; padding: 50rpx 34rpx 0; box-sizing: border-box; }

.date-intro { padding: 14rpx 10rpx 46rpx; display: flex; flex-direction: column; }
.date-eyebrow { font-size: 23rpx; letter-spacing: 4rpx; color: #6d7850; font-weight: 700; }
.date-title { margin-top: 14rpx; font-family: Georgia, 'Songti SC', serif; font-size: 53rpx; line-height: 1.22; font-weight: 500; letter-spacing: -1rpx; }
.date-prompt { margin-top: 18rpx; color: #728075; font-size: 25rpx; line-height: 1.7; }

.section-heading-row { display: flex; align-items: center; justify-content: space-between; }
.section-heading { font-size: 25rpx; font-weight: 650; color: #332723; }
.section-value { font-size: 22rpx; color: #81776f; }
.mood-block { margin-bottom: 28rpx; }
.mood-scroll { width: 100%; margin-top: 20rpx; white-space: nowrap; }
.mood-row { display: inline-flex; padding: 0 6rpx 8rpx 0; }
.mood-chip {
	height: 72rpx;
	margin-right: 14rpx;
	padding: 0 22rpx;
	border-radius: 38rpx;
	display: inline-flex;
	align-items: center;
	background: rgba(255, 255, 255, 0.56);
	border: 1rpx solid rgba(73, 57, 47, 0.11);
	color: #655b54;
}
.mood-chip.active { background: #26351f; border-color: #26351f; color: #fff; box-shadow: 0 10rpx 24rpx rgba(38, 53, 31, 0.14); }
.mood-emoji { font-size: 31rpx; }
.mood-label { margin-left: 10rpx; font-size: 23rpx; font-weight: 600; }

.writing-sheet {
	width: 100%;
	max-width: 100%;
	min-width: 0;
	box-sizing: border-box;
	background: #fffdf9;
	border: 1rpx solid rgba(65, 48, 39, 0.08);
	border-radius: 32rpx;
	box-shadow: 0 24rpx 70rpx rgba(68, 50, 39, 0.08);
	overflow: hidden;
}
.writing-topline { padding: 34rpx 34rpx 0; display: flex; justify-content: space-between; align-items: center; }
.writing-label { font-size: 24rpx; color: #5f554e; font-weight: 650; }
.writing-count { font-size: 19rpx; color: #a0978f; font-variant-numeric: tabular-nums; }
.content-input {
	width: 100%;
	max-width: 100%;
	min-width: 0;
	height: 500rpx;
	min-height: 500rpx;
	padding: 30rpx 34rpx 34rpx;
	box-sizing: border-box;
	font-family: Georgia, 'Songti SC', serif;
	font-size: 31rpx;
	line-height: 1.9;
	color: #281d19;
	background: transparent;
	overflow-x: hidden;
	overflow-y: auto;
	white-space: pre-wrap;
	word-break: break-word;
	overflow-wrap: anywhere;
}
.content-placeholder { color: #b0a69d; }
.writing-tools { min-height: 104rpx; padding: 12rpx 18rpx calc(12rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #eee8e1; display: flex; align-items: center; justify-content: space-around; }
.writing-tool { min-width: 120rpx; padding: 14rpx 10rpx; border-radius: 20rpx; display: flex; flex-direction: column; align-items: center; color: #786e67; }
.writing-tool.active { background: #edf0e5; color: #445329; }
.writing-tool[disabled] { opacity: .68; }
.image-upload-panel { width: 100%; margin-top: 18rpx; padding: 25rpx 27rpx; border: 1rpx solid rgba(82, 98, 47, .15); border-radius: 24rpx; background: #edf1e5; box-sizing: border-box; }
.image-upload-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }
.image-upload-heading > view:first-child { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.image-upload-kicker { color: #74805d; font-size: 17rpx; font-weight: 720; letter-spacing: 2rpx; }
.image-upload-title { margin-top: 7rpx; color: #35422b; font-size: 23rpx; font-weight: 680; }
.image-upload-percent { flex: 0 0 auto; color: #52622f; font-size: 28rpx; font-weight: 730; font-variant-numeric: tabular-nums; }
.image-upload-track { margin-top: 20rpx; background: rgba(82, 98, 47, .14); }
.image-upload-meta { display: block; margin-top: 12rpx; color: #76806c; font-size: 19rpx; font-variant-numeric: tabular-nums; }
.post-save-choice { width: 100%; margin: 18rpx 0 0; padding: 23rpx 25rpx; border: 1rpx solid rgba(69, 86, 57, .13); border-radius: 24rpx; background: rgba(255,255,255,.5); display: flex; align-items: center; text-align: left; box-sizing: border-box; }
.post-save-choice.selected { border-color: #82926a; background: #e9efdf; }
.choice-check { width: 38rpx; height: 38rpx; margin-right: 18rpx; flex: 0 0 38rpx; border: 2rpx solid #9ba48f; border-radius: 12rpx; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 22rpx; box-sizing: border-box; }
.post-save-choice.selected .choice-check { border-color: #52633a; background: #52633a; }
.choice-copy { display: flex; min-width: 0; flex-direction: column; gap: 7rpx; }
.choice-copy text:first-child { color: #34422f; font-size: 23rpx; font-weight: 680; line-height: 1.35; }
.choice-copy text:last-child { color: #788273; font-size: 19rpx; line-height: 1.5; }
.writing-tool text:last-child { margin-top: 10rpx; font-size: 20rpx; }
.tool-icon { width: 28rpx; height: 28rpx; position: relative; box-sizing: border-box; }
.mic-mini { border: 3rpx solid currentColor; border-radius: 14rpx; height: 24rpx; }
.mic-mini::after { content: ''; position: absolute; width: 18rpx; height: 12rpx; left: 2rpx; top: 15rpx; border: 3rpx solid currentColor; border-top: 0; border-radius: 0 0 12rpx 12rpx; }
.mic-mini-stem { position: absolute; width: 3rpx; height: 7rpx; background: currentColor; left: 10rpx; top: 26rpx; }
.photo-mini { border: 3rpx solid currentColor; border-radius: 5rpx; }
.photo-mini::after { content: ''; position: absolute; left: 4rpx; bottom: 4rpx; width: 15rpx; height: 10rpx; border-left: 3rpx solid currentColor; border-top: 3rpx solid currentColor; transform: rotate(45deg); }
.photo-mini-dot { position: absolute; width: 5rpx; height: 5rpx; border-radius: 50%; background: currentColor; right: 4rpx; top: 4rpx; }
.tool-symbol { height: 28rpx; font-size: 31rpx; line-height: 25rpx; font-weight: 500; }

.voice-studio, .details-panel {
	margin-top: 28rpx;
	padding: 34rpx;
	background: #283321;
	border-radius: 32rpx;
	color: #f8f4ec;
	box-shadow: 0 24rpx 64rpx rgba(35, 48, 28, 0.16);
}
.voice-header, .details-header { display: flex; align-items: flex-start; justify-content: space-between; }
.voice-header > view:first-child, .details-header > view:first-child, .transcript-heading > view:first-child { display: flex; flex-direction: column; }
.voice-kicker { color: #aeb998; }
.voice-title, .details-title { margin-top: 10rpx; font-family: Georgia, 'Songti SC', serif; font-size: 33rpx; }
.quiet-button { padding: 14rpx 18rpx; color: #c6cdb7; font-size: 21rpx; }
.ready-to-record, .recording-state { padding: 54rpx 0 28rpx; display: flex; flex-direction: column; align-items: center; }
.record-button { width: 136rpx; height: 136rpx; border-radius: 50%; background: #d86246; box-shadow: 0 0 0 18rpx rgba(216, 98, 70, 0.13); display: flex; align-items: center; justify-content: center; }
.record-button.stop { width: 116rpx; height: 116rpx; }
.record-orbit { width: 164rpx; height: 164rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2rpx solid rgba(224, 117, 91, 0.28); }
.record-orbit.recording { animation: recordPulse 1.8s ease-in-out infinite; }
.upload-progress-ring { width: 116rpx; height: 116rpx; border-radius: 50%; background: rgba(244, 239, 230, .1); border: 5rpx solid #d86246; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.upload-progress-number { color: #fffaf3; font-size: 27rpx; line-height: 1; font-weight: 700; font-variant-numeric: tabular-nums; }
@keyframes recordPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(216, 98, 70, 0.2); } 50% { box-shadow: 0 0 0 22rpx rgba(216, 98, 70, 0); } }
.stop-square { width: 34rpx; height: 34rpx; border-radius: 7rpx; background: #fffaf3; }
.mic-shape { width: 48rpx; height: 64rpx; position: relative; }
.mic-body { width: 28rpx; height: 42rpx; margin: 0 auto; border: 5rpx solid #fffaf3; border-radius: 18rpx; box-sizing: border-box; }
.mic-base { width: 46rpx; height: 29rpx; margin-top: -19rpx; border: 5rpx solid #fffaf3; border-top: 0; border-radius: 0 0 24rpx 24rpx; box-sizing: border-box; position: relative; }
.mic-base::after { content: ''; position: absolute; width: 5rpx; height: 14rpx; background: #fffaf3; left: 16rpx; top: 24rpx; }
.record-instruction { margin-top: 34rpx; font-size: 27rpx; font-weight: 650; }
.record-helper { margin-top: 14rpx; color: #aeb6a2; font-size: 21rpx; }
.record-time { margin-top: 24rpx; font-size: 40rpx; font-weight: 650; letter-spacing: 3rpx; font-variant-numeric: tabular-nums; }
.record-caption { margin-top: 10rpx; color: #bdc5b0; font-size: 21rpx; }
.progress-track { width: 100%; height: 10rpx; overflow: hidden; border-radius: 999rpx; background: rgba(82, 98, 47, .14); }
.progress-fill { height: 100%; border-radius: inherit; background: #647441; transition: width .28s ease; }
.upload-track { width: 82%; max-width: 480rpx; margin-top: 26rpx; background: rgba(255, 255, 255, .12); }
.upload-track .progress-fill { background: #d86246; }
.progress-meta { display: block; margin-top: 13rpx; color: #898078; font-size: 19rpx; line-height: 1.55; font-variant-numeric: tabular-nums; }
.recording-state > .progress-meta { color: #aeb6a2; text-align: center; }
.live-wave { height: 84rpx; margin-top: 28rpx; display: flex; align-items: center; justify-content: center; }
.live-wave-bar { width: 5rpx; margin: 0 4rpx; border-radius: 6rpx; background: #d86246; animation: wave 1.1s ease-in-out infinite alternate; }
.live-wave-bar:nth-child(3n) { animation-delay: .25s; }
.live-wave-bar:nth-child(4n) { animation-delay: .5s; }
@keyframes wave { from { transform: scaleY(.42); opacity: .5; } to { transform: scaleY(1); opacity: 1; } }
.voice-result { margin-top: 34rpx; }
.voice-player { min-height: 112rpx; padding: 20rpx; border-radius: 24rpx; background: rgba(255, 255, 255, 0.08); display: flex; align-items: center; box-sizing: border-box; }
.play-button { width: 68rpx; height: 68rpx; flex-shrink: 0; border-radius: 50%; background: #f4efe6; color: #26321f; display: flex; align-items: center; justify-content: center; }
.play-button text { font-size: 23rpx; transform: translateX(2rpx); }
.waveform { flex: 1; height: 76rpx; margin: 0 20rpx; display: flex; align-items: center; overflow: hidden; }
.waveform-bar { flex: 1; min-width: 3rpx; max-width: 6rpx; margin-right: 4rpx; border-radius: 5rpx; background: #66705b; }
.waveform-bar.played { background: #d96f53; }
.voice-time { flex-shrink: 0; color: #c1c8b5; font-size: 19rpx; font-variant-numeric: tabular-nums; }
.voice-actions { padding: 18rpx 4rpx 0; display: flex; justify-content: flex-end; }
.voice-link { padding: 12rpx 16rpx; color: #bdc6af; font-size: 21rpx; }
.voice-link.danger { color: #dfa08e; }
.transcript-panel { width: 100%; max-width: 100%; min-width: 0; margin-top: 26rpx; padding: 28rpx; border-radius: 26rpx; background: #f2ede5; color: #281f1b; box-sizing: border-box; overflow-x: hidden; }
.transcript-heading { min-width: 0; display: flex; gap: 16rpx; justify-content: space-between; align-items: flex-start; }
.transcript-heading > view:first-child { min-width: 0; flex: 1; }
.transcript-kicker { color: #838c67; }
.transcript-title { margin-top: 8rpx; font-family: Georgia, 'Songti SC', serif; font-size: 30rpx; }
.transcript-state { padding: 9rpx 14rpx; border-radius: 18rpx; background: #dce3ce; color: #4e5c34; font-size: 18rpx; }
.transcript-empty { padding-top: 22rpx; }
.transcript-copy { display: block; max-width: 100%; color: #766d65; font-size: 22rpx; line-height: 1.65; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
.transcription-progress { margin-top: 22rpx; padding: 20rpx; border-radius: 18rpx; background: rgba(82, 98, 47, .08); }
.progress-heading { display: flex; align-items: center; justify-content: space-between; color: #5f6848; font-size: 20rpx; font-weight: 650; }
.progress-percent { font-size: 22rpx; font-variant-numeric: tabular-nums; }
.transcription-progress .progress-track { margin-top: 14rpx; }
.transcription-error { max-width: 100%; margin-top: 20rpx; padding: 18rpx 20rpx; border-radius: 16rpx; background: #f4dfd7; color: #8a442f; font-size: 20rpx; line-height: 1.55; box-sizing: border-box; overflow-x: hidden; word-break: break-word; overflow-wrap: anywhere; }
.transcribe-button { width: 100%; height: 78rpx; min-height: 78rpx; margin-top: 24rpx; padding: 0 24rpx; border-radius: 40rpx; background: #52622f; color: #fff; font-size: 23rpx; font-weight: 650; line-height: 1; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.transcribe-button text { display: block; line-height: 1.1; }
.transcribe-button[disabled] { opacity: .55; }
.transcript-input { display: block; width: 100%; max-width: 100%; min-width: 0; height: 240rpx; margin-top: 22rpx; padding: 22rpx; border-radius: 18rpx; background: #fffdf9; box-sizing: border-box; color: #302520; font-size: 26rpx; line-height: 1.75; overflow-x: hidden; overflow-y: auto; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
.transcript-actions { margin-top: 18rpx; display: flex; align-items: center; justify-content: flex-end; }
.insert-button { height: 66rpx; min-height: 66rpx; margin-left: 12rpx; padding: 0 24rpx; border-radius: 34rpx; background: #52622f; color: #fff; font-size: 22rpx; font-weight: 650; line-height: 1; display: flex; align-items: center; justify-content: center; box-sizing: border-box; flex: 0 0 auto; }
.insert-button text { display: block; line-height: 1; }

.image-strip, .linked-cards, .linked-inquiries { margin-top: 34rpx; padding: 30rpx; border-radius: 28rpx; background: rgba(255, 253, 249, 0.64); border: 1rpx solid rgba(65, 48, 39, 0.08); }
.image-grid { margin-top: 22rpx; display: flex; flex-wrap: wrap; }
.image-item, .image-add { width: calc(33.333% - 12rpx); height: 190rpx; margin-right: 18rpx; margin-bottom: 18rpx; position: relative; border-radius: 20rpx; overflow: hidden; box-sizing: border-box; }
.image-item:nth-child(3n), .image-add:nth-child(3n) { margin-right: 0; }
.image-preview { width: 100%; height: 100%; }
.image-delete { position: absolute; right: 10rpx; top: 10rpx; width: 44rpx; height: 44rpx; border-radius: 50%; background: rgba(31, 23, 20, .72); color: #fff; font-size: 29rpx; }
.image-add { border: 2rpx dashed #b9afa5; color: #776e67; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 20rpx; }
.image-add-plus { margin-bottom: 10rpx; font-size: 34rpx; }
.linked-card { margin-top: 18rpx; padding: 20rpx; border-radius: 18rpx; display: flex; align-items: center; background: #fffdf9; }
.linked-card-mark { color: #697649; }
.linked-card-text { flex: 1; margin-left: 15rpx; font-size: 23rpx; line-height: 1.5; }
.linked-card-delete { width: 46rpx; height: 46rpx; color: #8b7e76; font-size: 30rpx; }
.question-symbol { width: 30rpx; height: 30rpx; border: 2rpx solid currentColor; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 21rpx; line-height: 1; }
.linked-inquiry-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }
.linked-inquiry-heading > view { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.linked-inquiry-heading > view text:last-child { margin-top: 8rpx; color: #7a837b; font-size: 19rpx; line-height: 1.5; }
.linked-inquiry-heading > button { padding: 10rpx 14rpx; color: #617044; font-size: 20rpx; }
.linked-inquiry { margin-top: 18rpx; padding: 20rpx; border-radius: 18rpx; display: flex; align-items: center; background: #f0f2e5; }
.linked-inquiry-mark { width: 42rpx; height: 42rpx; border-radius: 50%; background: #d9e4af; color: #4f5d32; display: flex; align-items: center; justify-content: center; font-family: Georgia, serif; font-size: 23rpx; }
.linked-inquiry-text { min-width: 0; flex: 1; margin-left: 15rpx; font-size: 23rpx; line-height: 1.5; white-space: normal; word-break: break-word; }

.details-panel { background: #fffdf9; color: #281d19; box-shadow: 0 24rpx 64rpx rgba(68, 50, 39, 0.08); }
.details-panel .voice-kicker { color: #77815f; }
.details-panel .quiet-button { color: #796f68; }
.detail-row { margin-top: 30rpx; padding: 24rpx 0; border-top: 1rpx solid #eee7df; border-bottom: 1rpx solid #eee7df; display: flex; align-items: center; justify-content: space-between; }
.detail-label { font-size: 23rpx; font-weight: 650; color: #4e433d; }
.detail-picker { min-width: 180rpx; padding: 15rpx 18rpx; border-radius: 18rpx; background: #f2ede7; display: flex; justify-content: space-between; color: #5b514a; font-size: 22rpx; }
.detail-arrow { margin-left: 24rpx; font-size: 27rpx; }
.detail-section { margin-top: 30rpx; }
.privacy-list { margin-top: 18rpx; }
.privacy-option { width: 100%; padding: 20rpx 0; border-top: 1rpx solid #eee7df; display: flex; align-items: center; text-align: left; }
.privacy-radio { width: 34rpx; height: 34rpx; margin-right: 18rpx; border: 2rpx solid #a79d94; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.privacy-option.selected .privacy-radio { border-color: #596a38; }
.privacy-dot { width: 18rpx; height: 18rpx; border-radius: 50%; background: #596a38; }
.privacy-copy { display: flex; flex-direction: column; }
.privacy-name { font-size: 23rpx; font-weight: 650; color: #41352f; }
.privacy-description { margin-top: 8rpx; color: #8a8179; font-size: 19rpx; line-height: 1.45; }
.ai-access-row { width: 100%; margin: 24rpx 0 0; padding: 22rpx 0 0; border-top: 1rpx solid #eee7df; display: flex; align-items: center; justify-content: space-between; gap: 24rpx; text-align: left; }
.ai-access-row > view:first-child { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.access-switch { width: 82rpx; height: 44rpx; padding: 4rpx; flex: 0 0 82rpx; border-radius: 999rpx; background: #d8d8d2; box-sizing: border-box; transition: background .2s ease; }
.access-switch view { width: 36rpx; height: 36rpx; border-radius: 50%; background: #fff; box-shadow: 0 2rpx 8rpx rgba(0,0,0,.15); transition: transform .2s ease; }
.access-switch.on { background: #62734b; }
.access-switch.on view { transform: translateX(38rpx); }

.analysis-bridge { display: flex; align-items: center; gap: 18rpx; margin-top: 18rpx; padding: 27rpx; border-radius: 29rpx; background: #172019; color: #fff; }
.reflection-bridge { display: flex; align-items: center; gap: 18rpx; margin-top: 34rpx; padding: 27rpx; border: 1rpx solid rgba(74, 94, 65, .14); border-radius: 29rpx; background: #e4ecd9; color: #263222; }
.reflection-mark { display: flex; width: 64rpx; height: 64rpx; flex: 0 0 64rpx; align-items: center; justify-content: center; border-radius: 20rpx; background: #c8d8b4; font-size: 30rpx; font-weight: 650; }
.reflection-bridge .analysis-copy text:last-child { color: #6d7a68; }
.reflection-button { height: 61rpx; padding: 0 20rpx; flex: 0 0 auto; border-radius: 999rpx; background: #263222; font-size: 19rpx; font-weight: 690; line-height: 61rpx; color: #fff; }
.analysis-orbit { display: flex; width: 64rpx; height: 64rpx; flex: 0 0 64rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(255,255,255,.25); border-radius: 50%; box-shadow: inset 0 0 0 9rpx rgba(255,255,255,.05); }
.analysis-orbit text { font-size: 25rpx; font-weight: 730; }
.analysis-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 7rpx; }
.analysis-copy text:first-child { font-size: 23rpx; font-weight: 690; }
.analysis-copy text:last-child { font-size: 18rpx; line-height: 1.5; color: #b8c5b8; }
.analysis-button { height: 61rpx; padding: 0 20rpx; flex: 0 0 auto; border-radius: 999rpx; background: #e5efd9; font-size: 19rpx; font-weight: 690; line-height: 61rpx; color: #172019; }
.bottom-space { height: calc(64rpx + env(safe-area-inset-bottom)); }

@media screen and (min-width: 900px) {
	.journal-canvas { padding-top: 70rpx; }
	.writing-sheet { border-radius: 38rpx; }
	.content-input { height: 560rpx; }
}
</style>
