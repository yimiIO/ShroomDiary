'use strict';

function validPart(value, maximum) {
	if (value === null || value === undefined || value === '') return false;
	const number = Number(value);
	return Number.isInteger(number) && number >= 0 && number <= maximum;
}

function hasExplicitDiaryTime(diary) {
	return Boolean(diary) && validPart(diary.hour, 23) && validPart(diary.minute, 59);
}

function isFullDayDiary(diary) {
	return !hasExplicitDiaryTime(diary);
}

function diaryTimeLabel(diary) {
	if (!hasExplicitDiaryTime(diary)) return '全天';
	return `${String(Number(diary.hour)).padStart(2, '0')}:${String(Number(diary.minute)).padStart(2, '0')}`;
}

function diaryLocalDate(diary) {
	const explicit = String((diary && diary.date) || '');
	if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
	const timestamp = String((diary && diary.createdAt) || '');
	const match = timestamp.match(/^(\d{4}-\d{2}-\d{2})/);
	return match ? match[1] : '';
}

module.exports = {
	diaryLocalDate,
	diaryTimeLabel,
	hasExplicitDiaryTime,
	isFullDayDiary
};
