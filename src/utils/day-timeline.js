'use strict';

const HOUR_HEIGHT = 112;
const MIN_EVENT_HEIGHT = 80;
const DEFAULT_EVENT_MINUTES = 45;
const COLUMN_GAP_RPX = 8;
const COLLAPSED_GAP_HEIGHT = 64;
const MIN_COLLAPSIBLE_HOURS = 3;

function finiteMinutes(value) {
	const minutes = Number(value);
	return Number.isFinite(minutes) ? Math.max(0, Math.min(1440, minutes)) : null;
}

function eventInterval(entry, startBoundary, endBoundary) {
	const start = finiteMinutes(entry && entry.actualMinutes);
	if (start === null || start < startBoundary || start >= endBoundary) return null;
	const requestedDuration = Number(entry && entry.durationMinutes);
	const duration = Number.isFinite(requestedDuration) && requestedDuration > 0
		? requestedDuration
		: DEFAULT_EVENT_MINUTES;
	return {
		...entry,
		actualMinutes: start,
		layoutStart: start,
		layoutEnd: Math.min(endBoundary, Math.max(start + DEFAULT_EVENT_MINUTES, start + duration))
	};
}

function overlaps(left, right) {
	return left.layoutStart < right.layoutEnd && right.layoutStart < left.layoutEnd;
}

function clusterIntervals(intervals) {
	const clusters = [];
	let current = [];
	let currentEnd = -1;
	intervals.forEach(interval => {
		if (current.length && interval.layoutStart >= currentEnd) {
			clusters.push(current);
			current = [];
			currentEnd = -1;
		}
		current.push(interval);
		currentEnd = Math.max(currentEnd, interval.layoutEnd);
	});
	if (current.length) clusters.push(current);
	return clusters;
}

function assignColumns(cluster) {
	const columnEnds = [];
	cluster.forEach(interval => {
		let column = columnEnds.findIndex(end => end <= interval.layoutStart);
		if (column < 0) column = columnEnds.length;
		columnEnds[column] = interval.layoutEnd;
		interval.layoutColumn = column;
	});
	const columnCount = Math.max(1, columnEnds.length);

	cluster.forEach(interval => {
		let span = 1;
		for (let column = interval.layoutColumn + 1; column < columnCount; column += 1) {
			const blocked = cluster.some(candidate => candidate.layoutColumn === column && overlaps(interval, candidate));
			if (blocked) break;
			span += 1;
		}
		interval.layoutColumnCount = columnCount;
		interval.layoutColumnSpan = span;
	});
}

function findEmptyHourGaps(intervals, startHour, endHour, minimumHours = MIN_COLLAPSIBLE_HOURS) {
	const gaps = [];
	let runStart = null;
	const finishRun = runEnd => {
		if (runStart === null) return;
		if (runEnd - runStart >= minimumHours) {
			gaps.push({
				key: `${runStart}-${runEnd}`,
				startHour: runStart,
				endHour: runEnd,
				hours: runEnd - runStart
			});
		}
		runStart = null;
	};

	for (let hour = startHour; hour < endHour; hour += 1) {
		const slotStart = hour * 60;
		const slotEnd = (hour + 1) * 60;
		const occupied = intervals.some(interval => interval.layoutStart < slotEnd && interval.layoutEnd > slotStart);
		if (!occupied && runStart === null) runStart = hour;
		if (occupied) finishRun(hour);
	}
	finishRun(endHour);
	return gaps;
}

function offsetForMinutes(segments, value, fallbackHeight) {
	const minutes = finiteMinutes(value);
	if (minutes === null || !segments.length) return 0;
	for (const segment of segments) {
		if (minutes <= segment.endMinutes) {
			const span = Math.max(1, segment.endMinutes - segment.startMinutes);
			const progress = Math.max(0, Math.min(1, (minutes - segment.startMinutes) / span));
			return segment.top + progress * segment.height;
		}
	}
	return fallbackHeight;
}

function buildTimelineLayout(entries, startHour, endHour, options = {}) {
	const start = Math.max(0, Math.min(23, Number(startHour) || 0));
	const end = Math.max(start + 1, Math.min(24, Number(endHour) || start + 1));
	const startBoundary = start * 60;
	const endBoundary = end * 60;
	const intervals = (entries || [])
		.map(entry => eventInterval(entry, startBoundary, endBoundary))
		.filter(Boolean)
		.sort((left, right) => {
			if (left.layoutStart !== right.layoutStart) return left.layoutStart - right.layoutStart;
			if (left.layoutEnd !== right.layoutEnd) return right.layoutEnd - left.layoutEnd;
			return String(left.key || '').localeCompare(String(right.key || ''));
		});

	clusterIntervals(intervals).forEach(assignColumns);
	const collapseEmptyGaps = Boolean(options.collapseEmptyGaps);
	const expandedGapKeys = new Set(Array.isArray(options.expandedGapKeys) ? options.expandedGapKeys : []);
	const minimumHours = Math.max(MIN_COLLAPSIBLE_HOURS, Number(options.minimumGapHours) || MIN_COLLAPSIBLE_HOURS);
	const emptyGaps = collapseEmptyGaps ? findEmptyHourGaps(intervals, start, end, minimumHours) : [];
	const gapByStartHour = new Map(emptyGaps.map(gap => [gap.startHour, gap]));
	const segments = [];
	const gaps = [];
	const hourTops = {};
	const hourHeights = {};
	const visibleHourSet = new Set();
	let cursor = 0;
	let hour = start;
	while (hour < end) {
		const gap = gapByStartHour.get(hour);
		if (gap) {
			const expanded = expandedGapKeys.has(gap.key);
			const height = expanded ? gap.hours * HOUR_HEIGHT : COLLAPSED_GAP_HEIGHT;
			const segment = {
				...gap,
				startMinutes: gap.startHour * 60,
				endMinutes: gap.endHour * 60,
				top: cursor,
				height,
				collapsed: !expanded
			};
			segments.push(segment);
			gaps.push(segment);
			if (expanded) {
				for (let expandedHour = gap.startHour; expandedHour <= gap.endHour; expandedHour += 1) {
					hourTops[expandedHour] = cursor + (expandedHour - gap.startHour) * HOUR_HEIGHT;
					visibleHourSet.add(expandedHour);
					if (expandedHour < gap.endHour) hourHeights[expandedHour] = HOUR_HEIGHT;
				}
			} else {
				hourTops[gap.startHour] = cursor;
				hourTops[gap.endHour] = cursor + height;
				visibleHourSet.add(gap.startHour);
				visibleHourSet.add(gap.endHour);
				hourHeights[gap.startHour] = height;
			}
			cursor += height;
			hour = gap.endHour;
			continue;
		}

		hourTops[hour] = cursor;
		hourHeights[hour] = HOUR_HEIGHT;
		visibleHourSet.add(hour);
		segments.push({
			startMinutes: hour * 60,
			endMinutes: (hour + 1) * 60,
			top: cursor,
			height: HOUR_HEIGHT,
			collapsed: false
		});
		cursor += HOUR_HEIGHT;
		hour += 1;
	}
	hourTops[end] = cursor;
	visibleHourSet.add(end);
	const stageHeight = cursor;

	const laidOutEntries = intervals.map(entry => {
		const columnWidth = 100 / entry.layoutColumnCount;
		const left = entry.layoutColumn * columnWidth;
		const width = entry.layoutColumnSpan * columnWidth;
		const top = offsetForMinutes(segments, entry.layoutStart, stageHeight);
		const bottom = offsetForMinutes(segments, entry.layoutEnd, stageHeight);
		const rawHeight = bottom - top;
		return {
			...entry,
			timelineStyle: {
				top: `${top}rpx`,
				left: `${left}%`,
				width: `calc(${width}% - ${COLUMN_GAP_RPX}rpx)`,
				height: `${Math.max(MIN_EVENT_HEIGHT, rawHeight - 4)}rpx`
			}
		};
	});

	return {
		startHour: start,
		endHour: end,
		hourTops,
		hourHeights,
		visibleHours: Array.from(visibleHourSet).sort((left, right) => left - right),
		segments,
		gaps,
		stageHeight,
		entries: laidOutEntries
	};
}

function timelineOffsetForMinutes(layout, value) {
	const minutes = finiteMinutes(value);
	if (!layout || minutes === null) return 0;
	const bounded = Math.max(layout.startHour * 60, Math.min(layout.endHour * 60, minutes));
	return offsetForMinutes(layout.segments || [], bounded, layout.stageHeight);
}

function minutesForTimelineOffset(layout, value) {
	if (!layout) return 0;
	const offset = Math.max(0, Math.min(layout.stageHeight, Number(value) || 0));
	const segments = layout.segments || [];
	for (const segment of segments) {
		if (offset <= segment.top + segment.height) {
			const progress = Math.max(0, Math.min(1, (offset - segment.top) / Math.max(1, segment.height)));
			return segment.startMinutes + progress * (segment.endMinutes - segment.startMinutes);
		}
	}
	return layout.endHour * 60;
}

module.exports = {
	COLLAPSED_GAP_HEIGHT,
	COLUMN_GAP_RPX,
	DEFAULT_EVENT_MINUTES,
	HOUR_HEIGHT,
	MIN_COLLAPSIBLE_HOURS,
	MIN_EVENT_HEIGHT,
	buildTimelineLayout,
	findEmptyHourGaps,
	minutesForTimelineOffset,
	timelineOffsetForMinutes
};
