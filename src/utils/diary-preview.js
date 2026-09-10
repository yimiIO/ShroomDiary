'use strict';

function normalizePreviewText(value) {
	return String(value || '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function voicePlaceholder(voice) {
	if (!voice) return '';
	const duration = Math.max(0, Number(voice.duration) || 0);
	return `🎙 语音日记 · ${Math.floor(duration / 60)}:${String(Math.round(duration % 60)).padStart(2, '0')}`;
}

function diaryPreview(diary, maximum = 42) {
	if (!diary) return '';
	const source = diary.content || diary.title || (diary.voice && diary.voice.transcript);
	const content = normalizePreviewText(source);
	if (!content) return diary.voice ? voicePlaceholder(diary.voice) : '一段未命名的记录';
	const characters = Array.from(content);
	const limit = Math.max(1, Number(maximum) || 42);
	return characters.length > limit ? `${characters.slice(0, limit).join('')}…` : content;
}

module.exports = {
	diaryPreview,
	normalizePreviewText
};
