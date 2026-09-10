/**
 * @des 待办相关接口
 * @author shroom-app
 * @date 2024/01/15
 */

// 获取待办列表
// GET /api/rf-todo/v1/todo/index?page=1&pageSize=20&status=pending
const todoList = '/todos/v1/index';

// 获取待办详情
// GET /api/rf-todo/v1/todo/view?id=1
const todoDetail = '/todos/v1/view';

// 创建待办
// POST /api/rf-todo/v1/todo/create
const todoCreate = '/todos/v1/create';

// 更新待办
// PUT /api/rf-todo/v1/todo/update?id=1
const todoUpdate = '/todos/v1/update';

// 删除待办
// DELETE /api/rf-todo/v1/todo/delete?id=1
const todoDelete = '/todos/v1/delete';

// 完成待办（会自动添加到当天日程）
// POST /api/rf-todo/v1/todo/complete?id=1
const todoComplete = '/todos/v1/complete';

export {
	todoList,
	todoDetail,
	todoCreate,
	todoUpdate,
	todoDelete,
	todoComplete
};
