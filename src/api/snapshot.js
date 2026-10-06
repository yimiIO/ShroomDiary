import { http } from '@/utils/request';

// 今日快照
export const getTodaySnapshot = (date) =>
	http.get('/snapshot/v1/today', date ? { date } : {});

export const updateTodaySnapshot = (data, date) =>
	http.put('/snapshot/v1/today', data, date ? { params: { date } } : {});

// 餐饮
export const addMeal = (data, date) =>
	http.post('/snapshot/v1/meals', data, date ? { params: { date } } : {});

export const updateMeal = (id, data) =>
	http.put(`/snapshot/v1/meals/${id}`, data);

export const deleteMeal = (id) =>
	http.delete(`/snapshot/v1/meals/${id}`);

// 账单明细
export const getSnapshotFinance = (date) =>
	http.get('/snapshot/v1/finance', date ? { date } : {});

export const addSnapshotFinance = (data, date) =>
	http.post('/snapshot/v1/finance', data, date ? { params: { date } } : {});

export const deleteSnapshotFinance = (id) =>
	http.delete(`/snapshot/v1/finance/${id}`);

// 常用地点
export const getSnapshotPlaces = () => http.get('/snapshot/v1/places');
export const addSnapshotPlace = (label) => http.post('/snapshot/v1/places', { label });
export const deleteSnapshotPlace = (id) => http.delete(`/snapshot/v1/places/${id}`);

// 冥想
export const getMeditationSummary = (date) =>
	http.get('/snapshot/v1/meditation/summary', date ? { date } : {});

export const completeMeditation = (data, date) =>
	http.post('/snapshot/v1/meditation/complete', data, date ? { params: { date } } : {});

// 历史 / 趋势
export const getSnapshotHistory = (days = 7) =>
	http.get('/snapshot/v1/history', { days });

export const getSnapshotTrend = () =>
	http.get('/snapshot/v1/trend');
