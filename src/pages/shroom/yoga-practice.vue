<template>
	<view class="practice-page">
		<shroom-page-top-spacer />
		<view class="page-shell">
			<view class="topbar">
				<button class="back-button" aria-label="返回" @tap="goBack">‹</button>
				<view><text class="topbar-kicker">BODY PRACTICE</text><text class="topbar-title">每日自主练习</text></view>
				<text class="date">{{ dateLabel }}</text>
			</view>

			<view v-if="loading" class="state-card">正在准备今天的动作…</view>
			<view v-else-if="loadError" class="state-card error"><text>暂时没有读到练习内容</text><button @tap="loadPractice">重新读取</button></view>

			<template v-else>
				<view class="hero">
					<text class="eyebrow">WATCH · PAUSE · PRACTICE</text>
					<text class="hero-title">今天不跟完整套，<br>只学懂一个动作</text>
					<text class="hero-copy">先看 1 分钟左右的动作片段，视频会在这个动作结束时停下。然后离开屏幕，按自己的呼吸和节奏练习。</text>
					<view v-if="completed" class="today-record"><view></view><text>今天已记录 {{ durationMinutes }} 分钟 · {{ practicedSegmentIds.length }} 个动作</text></view>
				</view>

				<view v-if="activeSegment" class="lesson-card">
					<view class="lesson-heading">
						<view><text class="lesson-index">{{ activeIndexLabel }}</text><text class="lesson-title">{{ activeSegment.title }}</text><text class="lesson-title-en">{{ activeSegment.titleEn }}</text></view>
						<text class="clip-duration">{{ clipDurationLabel }}</text>
					</view>
					<view class="audio-toolbar">
						<view><text>讲解语言</text><text>首次跟随系统，切换后记住选择</text></view>
						<view class="language-switch" role="group" aria-label="视频讲解语言">
							<button :class="{ active: audioLocale === 'zh' }" :aria-pressed="audioLocale === 'zh'" @tap="switchAudioLocale('zh')">中文</button>
							<button :class="{ active: audioLocale === 'en' }" :aria-pressed="audioLocale === 'en'" @tap="switchAudioLocale('en')">EN</button>
						</view>
					</view>
					<view class="video-wrap">
						<video
							:key="videoRenderKey"
							id="yoga-lesson-video"
							class="lesson-video"
							:src="activeVideoUrl"
							:poster="practice.posterUrl"
							:initial-time="activeSegment.startSeconds"
							:controls="false"
							:show-center-play-btn="false"
							:enable-progress-gesture="false"
							@play="handlePlay"
							@pause="handlePause"
							@timeupdate="handleTimeUpdate"
							@error="handleVideoError"
						></video>
					</view>
					<view class="clip-controls">
						<button class="clip-control" :aria-label="clipPlaying ? '暂停视频' : '播放这个动作'" @tap="toggleClip">
							<text>{{ clipPlaying ? 'Ⅱ 暂停视频' : (clipEnded ? '↻ 重看这个动作' : '▶ 播放这个动作') }}</text>
							<text>{{ clipElapsedLabel }} / {{ clipLengthLabel }}</text>
						</button>
						<view class="clip-progress"><view :style="{ width: clipProgress + '%' }"></view></view>
					</view>
					<view v-if="activeCaption" class="caption-card" aria-live="polite">
						<text class="caption-primary">{{ audioLocale === 'zh' ? activeCaption.zh : activeCaption.en }}</text>
						<text class="caption-secondary">{{ audioLocale === 'zh' ? activeCaption.en : activeCaption.zh }}</text>
					</view>
					<view v-if="clipEnded" class="clip-finished"><text>动作片段已播完</text><text>现在可以按自己的节奏练习</text></view>

					<text class="focus">{{ activeSegment.focus }}</text>
					<view class="steps"><view v-for="(step, index) in activeSegment.steps" :key="index"><text>{{ index + 1 }}</text><text>{{ step }}</text></view></view>
					<view class="caution"><text>注意</text><text>{{ activeSegment.caution }}</text></view>

					<view class="practice-timer" :class="timerState">
						<view><text>{{ timerTitle }}</text><text>{{ timerHint }}</text></view>
						<text class="timer-value">{{ timerLabel }}</text>
					</view>
					<button v-if="timerState !== 'running' && timerState !== 'finished'" class="primary-action" @tap="startPracticeTimer">开始自主练习 {{ practiceDurationLabel }}</button>
					<button v-else-if="timerState === 'running'" class="primary-action timer-running" @tap="pausePracticeTimer">暂停计时</button>
					<button v-else class="primary-action complete-action" @tap="confirmSegmentComplete">我已练完这个动作</button>
					<button v-if="timerState === 'paused'" class="secondary-action" @tap="resumePracticeTimer">继续计时</button>
				</view>

				<view class="segment-section">
					<view class="section-heading"><view><text class="eyebrow">MOVEMENT LIBRARY</text><text>今天想练哪个</text></view><text>已完成 {{ practicedSegmentIds.length }}/{{ practice.segments.length }}</text></view>
					<button v-for="(segment, index) in practice.segments" :key="segment.id" class="segment-row" :class="{ active: segment.id === activeSegmentId, done: practicedSegmentIds.includes(segment.id) }" @tap="selectSegment(segment)">
						<text class="segment-number">{{ String(index + 1).padStart(2, '0') }}</text>
						<view><text>{{ segment.title }}</text><text>{{ segment.focus }}</text></view>
						<text class="segment-state">{{ practicedSegmentIds.includes(segment.id) ? '已练' : '›' }}</text>
					</button>
				</view>

				<view class="record-card">
					<view><text>只记录真正练过的动作</text><text>视频播放、计时结束都不会自动打卡。</text></view>
					<button class="record-button" :disabled="saving || !practicedSegmentIds.length" @tap="savePractice">{{ saving ? '正在记录…' : '记录今天的练习' }}</button>
					<button v-if="completed" class="undo-button" :disabled="saving" @tap="undoPractice">撤销今天的记录</button>
				</view>

				<view class="safety"><text>练习边界</text><text>{{ practice.safety }}</text><text>素材：{{ practice.sourceTitle }} · {{ practice.license }}</text></view>
			</template>
		</view>
	</view>
</template>

<script>
import { compoundBodyPractice, compoundBodyPracticeCheckIn } from '@/api/compound-system';

export default {
	data() {
		return {
			statusBarHeight: 0,
			loading: true,
			loadError: false,
			saving: false,
			date: '',
			practice: { segments: [] },
			activeSegmentId: '',
			practicedSegmentIds: [],
			completed: false,
			durationMinutes: 0,
			clipEnded: false,
			clipPlaying: false,
			currentVideoTime: 0,
			audioLocale: 'zh',
			systemLanguage: 'zh',
			timerState: 'idle',
			timerRemaining: 0,
			timerHandle: null
		};
	},
	computed: {
		activeSegment() { return (this.practice.segments || []).find(item => item.id === this.activeSegmentId) || this.practice.segments[0] || null; },
		videoRenderKey() { return this.activeSegment ? `${this.activeSegment.id}-${this.audioLocale}` : this.audioLocale; },
		activeIndexLabel() { const index = this.practice.segments.findIndex(item => item.id === this.activeSegmentId); return `MOVEMENT ${String(index + 1).padStart(2, '0')}`; },
		clipDurationLabel() { if (!this.activeSegment) return ''; return `精讲 ${Math.ceil((this.activeSegment.endSeconds - this.activeSegment.startSeconds) / 60)} 分钟`; },
		clipLength() { return this.activeSegment ? this.activeSegment.endSeconds - this.activeSegment.startSeconds : 0; },
		clipProgress() { if (!this.activeSegment || !this.clipLength) return 0; return Math.max(0, Math.min(100, (this.currentVideoTime - this.activeSegment.startSeconds) / this.clipLength * 100)); },
		clipElapsedLabel() { if (!this.activeSegment) return '00:00'; return this.formatTimer(Math.max(0, Math.min(this.clipLength, this.currentVideoTime - this.activeSegment.startSeconds))); },
		clipLengthLabel() { return this.formatTimer(this.clipLength); },
		activeVideoUrl() { return (this.practice.videoUrls && this.practice.videoUrls[this.audioLocale]) || this.practice.videoUrl || ''; },
		activeCaption() {
			if (!this.activeSegment || !Array.isArray(this.activeSegment.captions) || !this.activeSegment.captions.length) return null;
			const relativeTime = Math.max(0, this.currentVideoTime - this.activeSegment.startSeconds);
			return [...this.activeSegment.captions].reverse().find(caption => relativeTime >= Number(caption.atSeconds || 0)) || this.activeSegment.captions[0];
		},
		practiceDurationLabel() { return this.activeSegment ? this.formatTimer(this.activeSegment.practiceSeconds) : ''; },
		timerLabel() { return this.formatTimer(this.timerRemaining || (this.activeSegment ? this.activeSegment.practiceSeconds : 0)); },
		timerTitle() { return this.timerState === 'finished' ? '自主练习时间到了' : (this.timerState === 'running' ? '不用看屏幕，跟着呼吸练' : (this.timerState === 'paused' ? '计时已暂停' : '看懂后，再开始自主练习')); },
		timerHint() { return this.timerState === 'finished' ? '请你亲自确认是否完成，系统不会代你判定。' : '完成度和幅度由你决定，不需要跟上视频。'; },
		dateLabel() { return this.date ? this.date.slice(5).replace('-', '.') : ''; }
	},
	onLoad() {
		const systemInfo = uni.getSystemInfoSync();
		this.statusBarHeight = systemInfo.statusBarHeight || 0;
		this.systemLanguage = this.detectAudioLocale(systemInfo);
		let savedLocale = '';
		try { savedLocale = uni.getStorageSync('shroom_yoga_audio_locale') || ''; } catch (_) {}
		this.audioLocale = ['zh', 'en'].includes(savedLocale) ? savedLocale : this.systemLanguage;
		this.loadPractice();
	},
	onUnload() { this.clearTimer(); this.pauseVideo(); },
	methods: {
		detectAudioLocale(systemInfo = {}) {
			let locale = systemInfo.language || systemInfo.locale || '';
			// #ifdef H5
			if (!locale && typeof navigator !== 'undefined') locale = navigator.language || '';
			// #endif
			try { if (!locale && typeof uni.getLocale === 'function') locale = uni.getLocale() || ''; } catch (_) {}
			return /^zh(?:[-_]|$)/i.test(String(locale)) ? 'zh' : 'en';
		},
		async loadPractice() {
			this.loading = true;
			this.loadError = false;
			try {
				const response = await this.$http.get(compoundBodyPractice);
				const data = response.data || {};
				this.date = data.date || '';
				this.practice = data.practice || { segments: [] };
				this.practicedSegmentIds = data.completedSegmentIds || [];
				this.completed = Boolean(data.completed);
				this.durationMinutes = Number(data.durationMinutes || 0);
				if (!this.activeSegmentId && this.practice.segments.length) {
					this.activeSegmentId = this.practice.segments[0].id;
					this.currentVideoTime = this.practice.segments[0].startSeconds;
				}
				this.resetTimer();
			} catch (error) {
				this.loadError = true;
				console.error('加载自主练习失败', error);
			} finally { this.loading = false; }
		},
		videoContext() { return uni.createVideoContext('yoga-lesson-video', this); },
		pauseVideo() { try { this.videoContext().pause(); } catch (_) {} },
		handlePlay() {
			if (!this.activeSegment) return;
			if (this.currentVideoTime < this.activeSegment.startSeconds - 1 || this.currentVideoTime >= this.activeSegment.endSeconds) this.videoContext().seek(this.activeSegment.startSeconds);
			this.clipEnded = false;
			this.clipPlaying = true;
		},
		handlePause() { this.clipPlaying = false; },
		handleTimeUpdate(event) {
			this.currentVideoTime = Number(event.detail.currentTime || 0);
			if (this.activeSegment && this.currentVideoTime >= this.activeSegment.endSeconds - 0.25) {
				this.pauseVideo();
				this.clipPlaying = false;
				this.clipEnded = true;
			}
		},
		toggleClip() {
			if (!this.activeSegment) return;
			const context = this.videoContext();
			if (this.clipPlaying) return context.pause();
			if (this.clipEnded || this.currentVideoTime < this.activeSegment.startSeconds - 1 || this.currentVideoTime >= this.activeSegment.endSeconds) {
				this.currentVideoTime = this.activeSegment.startSeconds;
				this.clipEnded = false;
				context.seek(this.activeSegment.startSeconds);
			}
			context.play();
		},
		switchAudioLocale(locale) {
			if (!['zh', 'en'].includes(locale) || locale === this.audioLocale || !this.activeSegment) return;
			const relativeTime = Math.max(0, Math.min(this.clipLength, this.currentVideoTime - this.activeSegment.startSeconds));
			this.pauseVideo();
			this.audioLocale = locale;
			try { uni.setStorageSync('shroom_yoga_audio_locale', locale); } catch (_) {}
			this.currentVideoTime = this.activeSegment.startSeconds + relativeTime;
			this.clipEnded = false;
			this.clipPlaying = false;
			this.$nextTick(() => { try { this.videoContext().seek(this.currentVideoTime); } catch (_) {} });
			uni.showToast({ title: locale === 'zh' ? '已切换中文讲解' : 'English narration selected', icon: 'none' });
		},
		handleVideoError() { uni.showToast({ title: '视频暂时无法播放，可以先按文字要点练习', icon: 'none' }); },
		selectSegment(segment) {
			if (segment.id === this.activeSegmentId) return;
			this.pauseVideo();
			this.clearTimer();
			this.activeSegmentId = segment.id;
			this.currentVideoTime = segment.startSeconds;
			this.clipEnded = false;
			this.clipPlaying = false;
			this.$nextTick(() => { try { this.videoContext().seek(segment.startSeconds); } catch (_) {} });
			this.resetTimer();
		},
		startPracticeTimer() {
			if (!this.activeSegment) return;
			this.pauseVideo();
			this.timerRemaining = this.activeSegment.practiceSeconds;
			this.timerState = 'running';
			this.runTimer();
		},
		pausePracticeTimer() { this.clearTimer(); this.timerState = 'paused'; },
		resumePracticeTimer() { this.timerState = 'running'; this.runTimer(); },
		runTimer() {
			this.clearTimer();
			this.timerHandle = setInterval(() => {
				this.timerRemaining -= 1;
				if (this.timerRemaining <= 0) { this.clearTimer(); this.timerRemaining = 0; this.timerState = 'finished'; }
			}, 1000);
		},
		clearTimer() { if (this.timerHandle) clearInterval(this.timerHandle); this.timerHandle = null; },
		resetTimer() { this.clearTimer(); this.timerState = 'idle'; this.timerRemaining = this.activeSegment ? this.activeSegment.practiceSeconds : 0; },
		confirmSegmentComplete() {
			if (!this.activeSegment || this.timerState !== 'finished') return;
			if (!this.practicedSegmentIds.includes(this.activeSegment.id)) this.practicedSegmentIds = [...this.practicedSegmentIds, this.activeSegment.id];
			this.timerState = 'done';
			uni.showToast({ title: '这个动作已留在今天的练习中', icon: 'none' });
		},
		async savePractice() {
			if (this.saving || !this.practicedSegmentIds.length) return;
			this.saving = true;
			try {
				const response = await this.$http.post(compoundBodyPracticeCheckIn, { segmentIds: this.practicedSegmentIds });
				this.completed = true;
				this.durationMinutes = Number(response.data.durationMinutes || 0);
				this.practicedSegmentIds = response.data.completedSegmentIds || this.practicedSegmentIds;
				uni.showToast({ title: '今天的练习已记录', icon: 'success' });
			} catch (error) { uni.showToast({ title: error.message || '记录失败，请重试', icon: 'none' }); }
			finally { this.saving = false; }
		},
		undoPractice() {
			uni.showModal({ title: '撤销今天的练习记录？', content: '不会删除其他复利系统数据。', confirmText: '撤销', success: async result => {
				if (!result.confirm) return;
				this.saving = true;
				try { await this.$http.delete(compoundBodyPracticeCheckIn); this.completed = false; this.durationMinutes = 0; this.practicedSegmentIds = []; this.resetTimer(); }
				catch (error) { uni.showToast({ title: '撤销失败，请重试', icon: 'none' }); }
				finally { this.saving = false; }
			} });
		},
		formatTimer(seconds) { const total = Math.max(0, Number(seconds) || 0); return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; },
		goBack() { const pages = getCurrentPages(); if (pages.length > 1) uni.navigateBack(); else uni.navigateTo({ url: '/pages/shroom/compound' }); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; border: 0; background: transparent; line-height: 1.25; }
button::after { border: 0; }
.practice-page { min-height: 100vh; background: #f1f8e9; color: #18231b; }
.status-bar { background: #f1f8e9; }
.page-shell { box-sizing: border-box; width: 100%; padding: 28rpx 30rpx calc(120rpx + env(safe-area-inset-bottom)); }
.topbar { display: flex; align-items: center; gap: 17rpx; }.topbar > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4rpx; }
.back-button { display: flex; width: 68rpx; height: 68rpx; flex: 0 0 68rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(24,35,27,.1); border-radius: 50%; background: rgba(255,255,255,.72); color: #263128; font-size: 42rpx; }
.topbar-kicker, .eyebrow { color: #718075; font-size: 15rpx; font-weight: 760; letter-spacing: 2.4rpx; }.topbar-title { font-family: Georgia, 'Songti SC', serif; font-size: 31rpx; font-weight: 720; }.date { color: #718075; font-size: 17rpx; }
.state-card { display: flex; min-height: 330rpx; margin-top: 28rpx; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx; border-radius: 30rpx; background: rgba(255,255,255,.75); color: #68746c; font-size: 19rpx; }.state-card button { padding: 18rpx 25rpx; border-radius: 999rpx; background: #1b2920; color: #fff; font-size: 18rpx; }
.hero { display: flex; margin-top: 46rpx; flex-direction: column; }.hero-title { margin-top: 14rpx; font-family: Georgia, 'Songti SC', serif; font-size: 47rpx; font-weight: 730; line-height: 1.17; letter-spacing: -1rpx; }.hero-copy { max-width: 650rpx; margin-top: 19rpx; color: #637067; font-size: 19rpx; line-height: 1.68; }.today-record { display: flex; align-items: center; gap: 10rpx; margin-top: 18rpx; color: #527047; font-size: 17rpx; }.today-record view { width: 9rpx; height: 9rpx; border-radius: 50%; background: #668b59; }
.lesson-card, .segment-section, .record-card { box-sizing: border-box; margin-top: 30rpx; padding: 27rpx; border-radius: 31rpx; background: rgba(255,255,255,.86); box-shadow: 0 15rpx 45rpx rgba(38,55,42,.06); }.lesson-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }.lesson-heading > view { display: flex; min-width: 0; flex-direction: column; gap: 7rpx; }.lesson-index { color: #718075; font-size: 18rpx; font-weight: 750; letter-spacing: 2rpx; }.lesson-title { font-family: Georgia, 'Songti SC', serif; font-size: 34rpx; font-weight: 720; }.lesson-title-en { color: #819087; font-size: 21rpx; line-height: 1.35; }.clip-duration { flex: 0 0 auto; padding: 9rpx 13rpx; border-radius: 999rpx; background: #e6efd9; color: #536a4c; font-size: 20rpx; }
.audio-toolbar { display: flex; margin-top: 22rpx; align-items: center; justify-content: space-between; gap: 16rpx; }.audio-toolbar > view:first-child { display: flex; min-width: 0; flex-direction: column; gap: 5rpx; }.audio-toolbar > view:first-child text:first-child { font-size: 25rpx; font-weight: 700; }.audio-toolbar > view:first-child text:last-child { color: #7b877f; font-size: 19rpx; }.language-switch { display: flex; flex: 0 0 auto; padding: 5rpx; border-radius: 999rpx; background: #edf1e9; }.language-switch button { min-width: 86rpx; min-height: 68rpx; padding: 0 18rpx; border-radius: 999rpx; color: #6d786f; font-size: 22rpx; font-weight: 700; }.language-switch button.active { background: #1c2b21; color: #fff; box-shadow: 0 5rpx 14rpx rgba(28,43,33,.17); }
.video-wrap { margin-top: 22rpx; overflow: hidden; border-radius: 23rpx; background: #152019; }.lesson-video { display: block; width: 100%; height: 370rpx; }.clip-controls { box-sizing: border-box; width: 100%; margin-top: 13rpx; padding: 0 22rpx 17rpx; border-radius: 20rpx; background: #19271e; }.clip-control { display: flex; box-sizing: border-box; width: 100%; min-height: 96rpx; padding: 0; align-items: center; justify-content: space-between; gap: 18rpx; color: #fff; text-align: left; }.clip-control text:first-child { font-size: 30rpx; font-weight: 760; }.clip-control text:last-child { flex: 0 0 auto; color: #c7d2c9; font: 600 22rpx/1 Georgia, serif; }.clip-progress { width: 100%; height: 7rpx; overflow: hidden; border-radius: 999rpx; background: rgba(255,255,255,.2); }.clip-progress view { height: 100%; border-radius: inherit; background: #dff0ce; }.clip-finished { display: flex; margin-top: 12rpx; padding: 17rpx 19rpx; flex-direction: column; gap: 5rpx; border-radius: 16rpx; background: #e4eddc; color: #42553f; }.clip-finished text:first-child { font-size: 24rpx; font-weight: 700; }.clip-finished text:last-child { color: #6d7b6e; font-size: 21rpx; }
.caption-card { display: flex; min-height: 108rpx; margin-top: 12rpx; padding: 17rpx 19rpx; flex-direction: column; align-items: center; justify-content: center; gap: 6rpx; border: 1rpx solid #e2e8df; border-radius: 17rpx; background: #f7f9f5; text-align: center; }.caption-primary { color: #26342a; font-size: 27rpx; font-weight: 690; line-height: 1.5; }.caption-secondary { color: #77837a; font-size: 21rpx; line-height: 1.45; }
.focus { display: block; margin-top: 22rpx; font-size: 20rpx; font-weight: 680; line-height: 1.55; }.steps { margin-top: 17rpx; }.steps view { display: flex; align-items: flex-start; gap: 13rpx; margin-top: 11rpx; }.steps view > text:first-child { display: flex; width: 32rpx; height: 32rpx; flex: 0 0 32rpx; align-items: center; justify-content: center; border-radius: 50%; background: #e3ecd7; color: #4e6547; font-size: 14rpx; font-weight: 750; }.steps view > text:last-child { padding-top: 3rpx; color: #5e6a62; font-size: 18rpx; line-height: 1.5; }.caution { display: flex; margin-top: 19rpx; padding: 16rpx 18rpx; flex-direction: column; gap: 5rpx; border-radius: 17rpx; background: #f4efe5; }.caution text:first-child { color: #8c6c4b; font-size: 14rpx; font-weight: 720; }.caution text:last-child { color: #6e6256; font-size: 16rpx; line-height: 1.5; }
.practice-timer { display: flex; margin-top: 22rpx; padding: 19rpx 20rpx; align-items: center; gap: 17rpx; border-radius: 20rpx; background: #eef3e9; }.practice-timer > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }.practice-timer > view text:first-child { font-size: 18rpx; font-weight: 700; }.practice-timer > view text:last-child { color: #738078; font-size: 14rpx; line-height: 1.4; }.timer-value { flex: 0 0 auto; font: 700 28rpx/1 Georgia, serif; letter-spacing: 1rpx; }.practice-timer.running { background: #1c2b21; color: #fff; }.practice-timer.running > view text:last-child { color: #aebcaf; }.practice-timer.finished { background: #e3efd1; }
.primary-action, .secondary-action, .record-button { display: flex; box-sizing: border-box; width: 100%; min-height: 76rpx; margin-top: 17rpx; padding: 15rpx 22rpx; align-items: center; justify-content: center; border-radius: 999rpx; background: #1b2920; color: #fff; font-size: 19rpx; font-weight: 720; }.primary-action.timer-running { background: #e8eee3; color: #465448; }.primary-action.complete-action { background: #5e794d; }.secondary-action { margin-top: 10rpx; border: 1rpx solid rgba(27,41,32,.12); background: transparent; color: #425047; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16rpx; padding-bottom: 14rpx; }.section-heading > view { display: flex; flex-direction: column; gap: 7rpx; }.section-heading > view text:last-child { font-family: Georgia, 'Songti SC', serif; font-size: 27rpx; font-weight: 720; }.section-heading > text { color: #758178; font-size: 15rpx; }.segment-row { display: flex; box-sizing: border-box; width: 100%; min-height: 92rpx; padding: 18rpx 0; align-items: flex-start; gap: 14rpx; border-top: 1rpx solid #e4eae1; text-align: left; }.segment-number { padding-top: 3rpx; color: #879287; font-size: 14rpx; font-weight: 750; }.segment-row > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }.segment-row > view text:first-child { font-size: 19rpx; font-weight: 690; }.segment-row > view text:last-child { display: -webkit-box; overflow: hidden; color: #7b867e; font-size: 15rpx; line-height: 1.4; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }.segment-state { padding-top: 2rpx; color: #718075; font-size: 17rpx; }.segment-row.active > view text:first-child { color: #4d6b43; }.segment-row.done .segment-state { color: #547649; font-weight: 700; }
.record-card > view { display: flex; flex-direction: column; gap: 8rpx; }.record-card > view text:first-child { font-family: Georgia, 'Songti SC', serif; font-size: 24rpx; font-weight: 700; }.record-card > view text:last-child { color: #758178; font-size: 16rpx; line-height: 1.5; }.record-button[disabled] { opacity: .4; }.undo-button { display: block; margin: 19rpx auto 0; padding: 10rpx; color: #8b6961; font-size: 16rpx; }
.safety { display: flex; margin-top: 25rpx; padding: 0 7rpx; flex-direction: column; gap: 7rpx; color: #7c887f; font-size: 14rpx; line-height: 1.55; }.safety text:first-child { color: #627067; font-weight: 720; }
/* #ifdef H5 */
@media (min-width: 980px) { .practice-page { box-sizing: border-box; padding-left: 96px; }.status-bar { display: none; }.page-shell { max-width: 820px; margin: 0 auto; padding: 54px 38px 100px; }.lesson-video { height: 430px; } }
/* #endif */
</style>
