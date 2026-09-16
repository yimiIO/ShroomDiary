'use strict';

function normalizeReflectionText(value) {
	return String(value || '')
		.replace(/\s+/g, ' ')
		.trim();
}

function firstSentencePreview(value, maximum = 64) {
	const content = normalizeReflectionText(value);
	if (!content) return '';
	const sentence = (content.match(/^.*?[。！？!?；;]/) || [content])[0];
	const characters = Array.from(sentence);
	const limit = Math.max(1, Number(maximum) || 64);
	return characters.length > limit ? `${characters.slice(0, limit).join('')}…` : sentence;
}

function remainingDetail(value, preview) {
	const content = normalizeReflectionText(value);
	const lead = normalizeReflectionText(preview);
	if (!content || content === lead) return '';
	if (!lead.endsWith('…') && content.startsWith(lead)) {
		return content.slice(lead.length).trim();
	}
	return content;
}

function observationHeadline(item, maximum = 52) {
	if (!item) return '';
	return firstSentencePreview(item.headline || item.text, maximum);
}

function observationDetail(item, maximum = 52) {
	if (!item) return '';
	const headline = observationHeadline(item, maximum);
	if (item.headline) {
		const detail = normalizeReflectionText(item.text);
		return detail === normalizeReflectionText(item.headline) ? '' : detail;
	}
	return remainingDetail(item.text, headline);
}

module.exports = {
	firstSentencePreview,
	normalizeReflectionText,
	observationDetail,
	observationHeadline,
	remainingDetail
};
