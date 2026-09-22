/**
 * @des 日记相关接口
 * @author shroom-app
 * @date 2024/01/15
 */

// 获取日记列表
// GET /api/rf-diary/v1/diary/index?date=2024-12-02&page=1&pageSize=20
const diaryList = '/diaries/v1/index';

// GET /api/diaries/v1/calendar?month=2026-09
const diaryCalendar = '/diaries/v1/calendar';
const diaryStats = '/diaries/v1/stats';
const diaryOverview = '/diaries/v1/overview';

// 获取日记详情
// GET /api/rf-diary/v1/diary/view?id=1
const diaryDetail = '/diaries/v1/view';

// 创建日记
// POST /api/rf-diary/v1/diary/create
const diaryCreate = '/diaries/v1/create';

// 更新日记
// PUT /api/rf-diary/v1/diary/update?id=1
const diaryUpdate = '/diaries/v1/update';

// 删除日记
// DELETE /api/rf-diary/v1/diary/delete?id=1
const diaryDelete = '/diaries/v1/delete';
const diaryAiAccess = '/diaries/v1/ai-access';

// 搜索日记
// GET /api/rf-diary/v1/diary/search?keyword=测试&page=1&pageSize=20
const diarySearch = '/diaries/v1/search';

export {
	diaryList,
	diaryCalendar,
	diaryStats,
	diaryOverview,
	diaryDetail,
	diaryCreate,
	diaryUpdate,
	diaryDelete,
	diaryAiAccess,
	diarySearch
};
