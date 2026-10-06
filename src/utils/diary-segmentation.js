const MAX_SEGMENTS = 4;
const MIN_TOTAL_CHARS = 320;
const MIN_SEGMENT_CHARS = 36;

function normalizeText(value) {
	return String(value || '')
		.replace(/\r\n?/g, '\n')
		.split(/\n{2,}/)
		.map(part => part.trim())
		.filter(Boolean)
		.join('\n\n');
}

function mergeShortParagraphs(parts) {
	const merged = [];
	parts.forEach(part => {
		if (part.length < MIN_SEGMENT_CHARS && merged.length) {
			merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${part}`;
		} else {
			merged.push(part);
		}
	});
	if (merged.length > 1 && merged[0].length < MIN_SEGMENT_CHARS) {
		merged[1] = `${merged[0]}\n\n${merged[1]}`;
		merged.shift();
	}
	return merged;
}

function groupParagraphs(parts) {
	if (parts.length <= MAX_SEGMENTS) return parts;
	const groups = [];
	let cursor = 0;
	while (cursor < parts.length) {
		const remainingParts = parts.length - cursor;
		const remainingGroups = MAX_SEGMENTS - groups.length;
		const take = Math.ceil(remainingParts / remainingGroups);
		groups.push(parts.slice(cursor, cursor + take).join('\n\n'));
		cursor += take;
	}
	return groups;
}

export function suggestDiarySegments(value) {
	const normalized = normalizeText(value);
	if (normalized.length < MIN_TOTAL_CHARS) return [];
	const paragraphs = normalized.split(/\n{2,}/).filter(Boolean);
	if (paragraphs.length < 2) return [];
	const segments = groupParagraphs(mergeShortParagraphs(paragraphs));
	if (segments.length < 2 || segments.some(segment => segment.length < MIN_SEGMENT_CHARS)) return [];
	if (segments.length === 2 && Math.min(...segments.map(segment => segment.length)) < 80) return [];
	return segments;
}
