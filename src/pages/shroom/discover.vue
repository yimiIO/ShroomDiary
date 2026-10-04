<template>
	<view class="discover-page">
		<view class="discover-hero" :style="{ paddingTop: (statusBarHeight + 10) + 'px' }">
			<image class="discover-hero-art" src="/static/images/shroom-discover-hero-art-v2.webp" mode="aspectFill" aria-hidden="true" />
			<view class="hero-brand">
				<image class="hero-logo" src="/static/icons/tab-shroom-filled.svg" mode="aspectFit" />
				<view class="hero-brand-copy">
					<text class="hero-brand-name">SHROOM</text>
					<text class="hero-brand-line">把生活的碎片，变成闪闪发光的故事。</text>
				</view>
			</view>
			<view class="hero-heading">
				<text class="hero-title">发现</text>
				<text class="hero-subtitle">在生活里，发现更好的自己。</text>
			</view>
			<view class="hero-note"><text>好奇的生活，</text><text>总会带来新的风景。</text></view>
		</view>

		<view class="discover-content">
			<view class="discover-search">
				<text class="search-icon">⌕</text>
				<input v-model="searchQuery" confirm-type="search" placeholder="搜索你感兴趣的话题、笔记或灵感…" @confirm="searchDiscover" />
				<view class="search-submit" @tap="searchDiscover">搜索</view>
			</view>

			<scroll-view class="category-scroll" scroll-x :show-scrollbar="false">
				<view class="category-list">
					<view v-for="item in categories" :key="item.value" class="category-chip" :class="{ active: activeCategory === item.value }" @tap="selectCategory(item.value)">
						<text class="category-symbol">{{ item.symbol }}</text><text>{{ item.label }}</text>
					</view>
				</view>
			</scroll-view>

			<view class="discover-section topic-section">
				<view class="section-heading">
					<view class="section-mark sun-mark">☼</view>
					<view class="section-copy"><text class="section-title">今天适合继续聊的话题</text><text class="section-subtitle">基于你的记录和状态，为你推荐</text></view>
				</view>
				<view class="topic-grid">
					<view v-for="(topic, index) in topicSuggestions" :key="topic.title" class="topic-card" @tap="openMemory(topic.question)">
						<image :src="topic.image" mode="aspectFill" />
						<view><text>{{ topic.title }}</text><text>{{ topic.description }}</text></view>
						<text class="topic-arrow">›</text>
					</view>
				</view>
			</view>

			<view class="discover-section notes-section">
				<view class="section-heading">
					<view class="section-mark leaf-mark">♧</view>
					<view class="section-copy"><text class="section-title">从你的笔记延伸</text><text class="section-subtitle">基于你的真实记录，发现更多思考的可能</text></view>
					<text class="section-arrow" @tap="openDiaryHome">›</text>
				</view>
				<view class="note-grid" v-if="noteCards.length">
					<view v-for="note in noteCards" :key="note.id" class="note-paper" @tap="openDiary(note)">
						<text class="note-date">{{ note.dateLabel }}</text>
						<text class="note-copy">“{{ note.preview }}”</text>
						<image v-if="note.image" :src="note.image" mode="aspectFill" />
					</view>
				</view>
				<view class="notes-empty" v-else @tap="createNote">
					<text>写下第一篇笔记</text><text>保存后，这里会从你的真实记录中延伸新的线索。</text>
				</view>
			</view>

			<view class="discover-section article-section">
				<view class="section-heading">
					<view class="section-mark star-mark">★</view>
					<view class="section-copy"><text class="section-title">值得继续看的内容</text><text class="section-subtitle">来自公开菇卡的真实思考与经验</text></view>
					<text class="section-arrow" @tap="toggleSort">›</text>
				</view>
				<view class="article-grid" v-if="visibleCards.length">
					<view v-for="(card, index) in visibleCards.slice(0, 3)" :key="card.id" class="article-card" @tap="openCard(card)">
						<image :src="articleImages[index % articleImages.length]" mode="aspectFill" />
						<view class="article-copy">
							<text class="article-title">{{ card._seed }}</text>
							<text class="article-description">{{ card._understanding || card._usageItems[0] || '打开这张菇卡，继续看看它来自怎样的真实经历。' }}</text>
							<view class="article-meta"><text>♡ {{ card._resonanceCount }}</text><text>{{ card._tags[0] || '思考' }}</text></view>
						</view>
					</view>
				</view>
				<view class="article-state" v-else-if="loading"><text>正在寻找值得继续看的内容…</text></view>
				<view class="article-state" v-else-if="loadError" @tap="reload"><text>这次没有连上发现广场，点这里重试</text></view>
				<view class="article-state" v-else><text>公开菇卡会在这里出现，等待下一次回声。</text></view>
			</view>

			<view class="discover-banner">
				<image src="/static/images/shroom-snapshot-health-landscape-v1.webp" mode="aspectFill" aria-hidden="true" />
				<text>生活不只是发生，也可以被看见、被理解、被珍藏。</text>
				<image class="banner-mascot" src="/static/images/shroom-card-mascot-v2.webp" mode="aspectFit" aria-hidden="true" />
			</view>
		</view>
	</view>
</template>

<script>
import moment from '@/common/moment.js';
import { diaryList } from '@/api/diary';
import { shroomCardDiscover, shroomCardResonate, shroomCardUnresonate } from '@/api/shroomCard';

export default {
	data() {
		return {
			statusBarHeight: 0,
			cards: [],
			personalNotes: [],
			loading: false,
			loadError: false,
			page: 1,
			pageSize: 12,
			hasMore: true,
			sort: 'latest',
			searchQuery: '',
			activeCategory: 'chat',
			categories: [
				{ label: '继续聊', value: 'chat', symbol: '♧' },
				{ label: '来自记录', value: 'notes', symbol: '▤' },
				{ label: '公开档案', value: 'public', symbol: '♙' },
				{ label: '灵感', value: 'inspiration', symbol: '☼' },
				{ label: '最近收藏', value: 'saved', symbol: '☆' }
			],
			topicSuggestions: [
				{ title: '关于时间管理', description: '上次聊到想更高效地安排时间…', question: '回看我的记录，我的时间通常花在哪里？', image: '/static/images/shroom-diary-search-sprout-v1.webp' },
				{ title: '情绪与自我关怀', description: '我最近反复出现的情绪是什么？', question: '我最近反复出现的情绪是什么？', image: '/static/images/shroom-snapshot-health-landscape-v1.webp' },
				{ title: '理想的生活方式', description: '从上次的对话延伸聊聊…', question: '我的记录里，哪些时刻最接近理想生活？', image: '/static/images/shroom-snapshot-meal-art-v1.webp' }
			],
			articleImages: [
				'/static/images/shroom-discover-hero-art-v2.webp',
				'/static/images/shroom-diary-hero-art-v5.webp',
				'/static/images/shroom-snapshot-mug-v1.webp'
			]
		};
	},
	computed: {
		visibleCards() {
			let result = this.cards;
			if (this.activeCategory === 'saved') result = result.filter(card => card._resonated);
			if (this.activeCategory === 'inspiration') result = result.filter(card => card._tags.some(tag => /灵感|思考|成长/.test(tag)));
			const query = this.searchQuery.trim().toLowerCase();
			if (!query) return result;
			return result.filter(card => [card._seed, card._understanding, ...card._tags].join(' ').toLowerCase().includes(query));
		},
		noteCards() {
			return this.personalNotes.slice(0, 3).map((note, index) => ({
				...note,
				dateLabel: note.date ? moment(note.date).format('M月D日') : '最近',
				preview: String(note.content || note.title || '一段刚刚留下的记录').replace(/\s+/g, ' ').slice(0, 46),
				image: Array.isArray(note.images) && note.images[0] ? note.images[0] : (index === 1 ? '/static/images/shroom-snapshot-health-landscape-v1.webp' : '')
			}));
		}
	},
	onLoad() {
		this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0;
		this.loadCards(true);
		this.loadPersonalNotes();
	},
	onPullDownRefresh() {
		Promise.all([this.loadCards(true), this.loadPersonalNotes()]).finally(() => uni.stopPullDownRefresh());
	},
	onReachBottom() { this.loadCards(false); },
	methods: {
		normalizeList(data, startIndex = 0) {
			const raw = Array.isArray(data) ? data : (data && (data.list || data.data)) || [];
			return raw.map((card, index) => {
				const stats = card.stats || {};
				const authorName = this.resolveAuthorName(card);
				return Object.assign({}, card, {
					_displayIndex: startIndex + index + 1,
					_seed: card.seedSentence || card.seed_sentence || '一条正在生长的觉察',
					_understanding: card.myUnderstanding || card.my_understanding || '',
					_usageItems: this.resolveUsageItems(card).slice(0, 2),
					_tags: Array.isArray(card.tags) ? card.tags.slice(0, 4) : [],
					_resonanceCount: stats.resonanceCount || stats.resonance_count || 0,
					_resonated: Boolean(card.viewerState && card.viewerState.resonated),
					_authorName: authorName
				});
			});
		},
		async loadCards(reset) {
			if (this.loading || (!reset && !this.hasMore)) return;
			if (reset) { this.page = 1; this.hasMore = true; this.loadError = false; }
			this.loading = true;
			try {
				const res = await this.$http.get(shroomCardDiscover, { sort: this.sort, page: this.page, pageSize: this.pageSize });
				const next = res && res.code === 200 ? this.normalizeList(res.data, reset ? 0 : this.cards.length) : [];
				this.cards = reset ? next : this.cards.concat(next);
				this.hasMore = next.length >= this.pageSize;
				if (this.hasMore) this.page += 1;
			} catch (error) {
				console.error('加载发现广场失败', error);
				this.loadError = this.cards.length === 0;
			} finally { this.loading = false; }
		},
		async loadPersonalNotes() {
			if (!this.$mStore.getters.hasLogin) return;
			try {
				const res = await this.$http.get(diaryList, { page: 1, pageSize: 12 });
				const payload = res && res.data;
				const records = Array.isArray(payload) ? payload : (payload && payload.list) || [];
				this.personalNotes = records.filter(item => item && item.type === 'note').slice(0, 3);
			} catch (error) { this.personalNotes = []; }
		},
		reload() { this.loadCards(true); },
		selectCategory(value) {
			this.activeCategory = value;
			if (value === 'chat') this.searchQuery = '';
		},
		searchDiscover() {
			if (!this.searchQuery.trim()) return;
			this.activeCategory = 'public';
		},
		toggleSort() {
			this.sort = this.sort === 'latest' ? 'popular' : 'latest';
			this.loadCards(true);
		},
		openCard(card) {
			if (card && card.id) uni.navigateTo({ url: `/pages/common/cards/detail?id=${card.id}&from=discover` });
		},
		openDiary(note) {
			if (note && note.id) uni.navigateTo({ url: `/pages/diary/edit?id=${note.id}&date=${note.date || ''}` });
		},
		openDiaryHome() { uni.switchTab({ url: '/pages/diary/index' }); },
		createNote() { uni.navigateTo({ url: '/pages/diary/edit?mode=note' }); },
		resolveUsageItems(card) { const value = card.usageItems || card.usage_items || []; return Array.isArray(value) ? value : []; },
		resolveAuthorName(card) {
			if (card.visibility === 'PUBLIC_ANON' || card.visibility === 'public_anon') return '匿名记录者';
			const author = card.author || card.member || {};
			return author.nickname || author.realname || card.authorName || '一位记录者';
		},
		requireLogin() {
			if (this.$mStore.getters.hasLogin) return true;
			uni.showModal({ title: '登录后继续', content: '登录后可以从自己的真实记录继续聊。', confirmText: '去登录', success: res => { if (res.confirm) uni.navigateTo({ url: '/pages/public/login' }); } });
			return false;
		},
		openMemory(question = '') {
			if (!this.requireLogin()) return;
			const query = question ? `?q=${encodeURIComponent(question)}` : '';
			uni.navigateTo({ url: `/pages/shroom/memory${query}` });
		},
		async resonate(card) {
			if (!this.requireLogin() || card.resonating) return;
			this.$set(card, 'resonating', true);
			try {
				const wasResonated = card._resonated;
				const endpoint = wasResonated ? shroomCardUnresonate : shroomCardResonate;
				const res = await this.$http.post(endpoint, { id: card.id });
				const nextCount = res && res.data && Number(res.data.resonanceCount);
				this.$set(card, '_resonated', !wasResonated);
				this.$set(card, '_resonanceCount', Number.isFinite(nextCount) ? nextCount : Math.max(0, card._resonanceCount + (wasResonated ? -1 : 1)));
			} finally { this.$set(card, 'resonating', false); }
		}
	}
};
</script>

<style lang="scss" scoped>
.discover-page { min-height: 100vh; padding-bottom: calc(154rpx + env(safe-area-inset-bottom)); overflow-x: hidden; background: radial-gradient(circle at 10% 48%, rgba(224,240,206,.52), transparent 28%), linear-gradient(180deg,#fffdf7,#f2f9e9 56%,#f8fbf2); color: #171a18; }
.discover-hero { box-sizing: border-box; position: relative; height: 330rpx; padding-right: 34rpx; padding-left: 34rpx; overflow: hidden; background: #f5eedc; }
.discover-hero::after { position: absolute; right: 0; bottom: -1rpx; left: 0; height: 48rpx; background: linear-gradient(180deg,rgba(248,250,239,0),rgba(248,250,239,.98)); content: ''; }
.discover-hero-art { position: absolute; inset: 0; width: 100%; height: 100%; object-position: 50% 51%; }
.hero-brand,.hero-heading,.hero-note { position: relative; z-index: 1; }
.hero-brand { display: flex; width: 300rpx; align-items: center; }
.hero-logo { width: 58rpx; height: 58rpx; margin-right: 13rpx; }
.hero-brand-copy { display: flex; min-width: 0; flex-direction: column; }
.hero-brand-name { color: #111411; font-size: 28rpx; font-weight: 900; line-height: 1; letter-spacing: 1.5rpx; }
.hero-brand-line { margin-top: 7rpx; color: #474b46; font-size: 18rpx; line-height: 1.35; }
.hero-heading { position: absolute; left: 34rpx; bottom: 39rpx; display: flex; flex-direction: column; }
.hero-title { color: #171a18; font-size: 53rpx; font-weight: 860; line-height: 1; letter-spacing: -2rpx; }
.hero-subtitle { margin-top: 11rpx; color: #4c524c; font-size: 22rpx; }
.hero-note { position: absolute; top: 61rpx; right: 25rpx; width: 190rpx; font-family: "Kaiti SC","STKaiti","KaiTi",serif; color: #30332f; font-size: 19rpx; line-height: 1.5; text-align: center; transform: rotate(-7deg); }
.hero-note text { display: block; }
.discover-content { position: relative; z-index: 2; margin-top: -5rpx; padding: 0 22rpx; }
.discover-search { display: flex; box-sizing: border-box; height: 72rpx; align-items: center; padding: 0 18rpx; border: 1rpx solid rgba(76,88,70,.12); border-radius: 36rpx; background: rgba(255,255,255,.94); box-shadow: 0 9rpx 24rpx rgba(62,82,56,.045); }
.search-icon { width: 42rpx; color: #69716b; font-size: 38rpx; line-height: 1; }
.discover-search input { min-width: 0; height: 100%; flex: 1; color: #20231f; font-size: 21rpx; }
.search-submit { padding-left: 15rpx; color: #61735a; font-size: 20rpx; font-weight: 700; }
.category-scroll { width: 100%; margin: 16rpx 0; white-space: nowrap; }
.category-list { display: inline-flex; gap: 10rpx; padding-right: 10rpx; }
.category-chip { display: flex; height: 51rpx; align-items: center; padding: 0 19rpx; border: 1rpx solid rgba(56,67,55,.13); border-radius: 999rpx; background: rgba(255,255,255,.72); color: #626962; font-size: 19rpx; }
.category-chip.active { border-color: #d5e3ca; background: #e7f1de; color: #1e2c1d; font-weight: 720; }
.category-symbol { margin-right: 8rpx; color: #526f48; font-size: 23rpx; }
.discover-section { box-sizing: border-box; margin-top: 16rpx; padding: 20rpx 17rpx 18rpx; border: 1rpx solid rgba(78,94,72,.1); border-radius: 24rpx; background: rgba(255,255,255,.91); box-shadow: 0 10rpx 26rpx rgba(75,99,68,.04); overflow: hidden; }
.section-heading { display: flex; align-items: center; }
.section-mark { display: flex; width: 48rpx; height: 48rpx; flex: 0 0 48rpx; align-items: center; justify-content: center; border-radius: 50%; font-size: 28rpx; }
.sun-mark { background: #fff3dc; color: #f1a025; }.leaf-mark { background: #ecf5e3; color: #5f8a4a; }.star-mark { background: #fff3d6; color: #f2a41f; }
.section-copy { display: flex; min-width: 0; margin-left: 12rpx; flex: 1; flex-direction: column; }
.section-title { color: #1d211d; font-size: 24rpx; font-weight: 790; line-height: 1.2; }
.section-subtitle { margin-top: 4rpx; color: #8b918b; font-size: 17rpx; }
.section-arrow { color: #4b504b; font-size: 40rpx; }
.topic-grid,.note-grid,.article-grid { display: flex; gap: 11rpx; margin-top: 16rpx; }
.topic-card { display: flex; box-sizing: border-box; min-width: 0; height: 91rpx; flex: 1; align-items: center; padding: 9rpx; border-radius: 17rpx; background: #faf9f5; }
.topic-card image { width: 58rpx; height: 70rpx; flex: 0 0 58rpx; border-radius: 13rpx; }
.topic-card > view { display: flex; min-width: 0; margin-left: 9rpx; flex: 1; flex-direction: column; }
.topic-card > view text:first-child { overflow: hidden; color: #252825; font-size: 18rpx; font-weight: 720; text-overflow: ellipsis; white-space: nowrap; }
.topic-card > view text:last-child { display: -webkit-box; margin-top: 5rpx; overflow: hidden; color: #8d928e; font-size: 15rpx; line-height: 1.3; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.topic-arrow { color: #666b66; font-size: 27rpx; }
.note-paper { position: relative; box-sizing: border-box; min-width: 0; height: 112rpx; flex: 1; padding: 14rpx; overflow: hidden; border: 1rpx solid #ece4d7; border-radius: 15rpx; background: linear-gradient(155deg,#fffdf7,#f7f1e7); box-shadow: 0 5rpx 11rpx rgba(94,72,47,.05); }
.note-date { color: #898276; font-size: 14rpx; }.note-copy { display: -webkit-box; margin-top: 8rpx; overflow: hidden; color: #474139; font-family: "Kaiti SC","STKaiti","KaiTi",serif; font-size: 17rpx; line-height: 1.48; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.note-paper image { position: absolute; right: 0; bottom: 0; width: 59rpx; height: 100%; opacity: .72; }
.notes-empty,.article-state { display: flex; margin-top: 15rpx; padding: 22rpx; flex-direction: column; border-radius: 16rpx; background: #f7f9f3; text-align: center; }
.notes-empty text:first-child { color: #43533d; font-size: 20rpx; font-weight: 700; }.notes-empty text:last-child,.article-state text { margin-top: 5rpx; color: #889086; font-size: 17rpx; line-height: 1.5; }
.article-card { min-width: 0; flex: 1; overflow: hidden; border: 1rpx solid #e8e8e1; border-radius: 16rpx; background: #fff; }
.article-card > image { width: 100%; height: 91rpx; }
.article-copy { display: flex; padding: 11rpx; flex-direction: column; }
.article-title { display: -webkit-box; overflow: hidden; color: #1f231f; font-size: 18rpx; font-weight: 760; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.article-description { display: -webkit-box; margin-top: 5rpx; overflow: hidden; color: #858b85; font-size: 15rpx; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.article-meta { display: flex; margin-top: 8rpx; align-items: center; justify-content: space-between; color: #818781; font-size: 14rpx; }.article-meta text:last-child { padding: 4rpx 7rpx; border-radius: 10rpx; background: #f2f1ec; }
.discover-banner { position: relative; box-sizing: border-box; height: 72rpx; margin: 16rpx 0 0; padding: 19rpx 142rpx 13rpx 22rpx; overflow: hidden; border-radius: 20rpx; background: #f5f7eb; }
.discover-banner > image:first-child { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .62; }.discover-banner > text { position: relative; z-index: 2; color: #404840; font-family: "Kaiti SC","STKaiti","KaiTi",serif; font-size: 17rpx; line-height: 1.45; }.discover-banner .banner-mascot { position: absolute; z-index: 2; right: 15rpx; bottom: -10rpx; width: 108rpx; height: 82rpx; }
@media (max-height: 720px) {
	.discover-hero { height: 285rpx; }
	.hero-heading { bottom: 28rpx; }
	.discover-content { margin-top: -4rpx; }
	.discover-section { margin-top: 12rpx; padding-top: 16rpx; padding-bottom: 14rpx; }
	.category-scroll { margin: 12rpx 0; }
	.topic-card { height: 82rpx; }
	.note-paper { height: 101rpx; }
	.article-card > image { height: 76rpx; }
	.discover-banner { height: 62rpx; margin-top: 12rpx; padding-top: 14rpx; }
}
</style>
