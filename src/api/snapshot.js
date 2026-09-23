import { http } from '@/utils/request';

// 今日快照
export const getTodaySnapshot = (date) =>
	http.get('/snapshot/v1/today', date ? { date } : {});

export const updateTodaySnapshot = (data, date) =>
	http.put('/snapshot/v1/today', data, date ? { params: { date } } : {});

// 餐饮
export const addMeal = (data, date) =>
	http.post('/snapshot/v1/meals', data, date ? { params: { date } } : {});

export const deleteMeal = (id) =>
	http.delete(`/snapshot/v1/meals/${id}`);

// 冥想
export const completeMeditation = (data, date) =>
	http.post('/snapshot/v1/meditation/complete', data, date ? { params: { date } } : {});

// 历史 / 趋势
export const getSnapshotHistory = (days = 7) =>
	http.get('/snapshot/v1/history', { days });

export const getSnapshotTrend = () =>
	http.get('/snapshot/v1/trend');
