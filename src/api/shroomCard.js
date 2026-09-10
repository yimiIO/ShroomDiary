/**
 * @des 菇卡相关接口
 * @author shroom-app
 * @date 2024/01/15
 */

// 获取菇卡列表
// GET /api/rf-shroom-card/v1/shroom-card/index?page=1&pageSize=20
const shroomCardList = '/cards/v1/index';

// 获取我收藏的公开菇卡
const shroomCardFavorites = '/cards/v1/favorites';

// 获取菇卡详情
// GET /api/rf-shroom-card/v1/shroom-card/view?id=1
const shroomCardDetail = '/cards/v1/view';

// 创建菇卡
// POST /api/rf-shroom-card/v1/shroom-card/create
const shroomCardCreate = '/cards/v1/create';

// 更新菇卡
// PUT /api/rf-shroom-card/v1/shroom-card/update?id=1
const shroomCardUpdate = '/cards/v1/update';

// 删除菇卡
// DELETE /api/rf-shroom-card/v1/shroom-card/delete?id=1
const shroomCardDelete = '/cards/v1/delete';

// 添加练习记录
// POST /api/rf-shroom-card/v1/shroom-card/practices?id=1
const shroomCardPracticeCreate = '/cards/v1/practices';

// 标记复习
// POST /api/rf-shroom-card/v1/shroom-card/review?id=1
const shroomCardReview = '/cards/v1/review';

// 共鸣菇卡
// POST /api/rf-shroom-card/v1/shroom-card/resonate?id=1
const shroomCardResonate = '/cards/v1/resonate';

// 取消共鸣
const shroomCardUnresonate = '/cards/v1/unresonate';

// 收藏菇卡
// POST /api/rf-shroom-card/v1/shroom-card/favorite?id=1
const shroomCardFavorite = '/cards/v1/favorite';

// 取消收藏菇卡（如果后端支持，否则使用favorite接口）
const shroomCardUnfavorite = '/cards/v1/unfavorite';

// 复制菇卡
// POST /api/rf-shroom-card/v1/shroom-card/copy?id=1
const shroomCardCopy = '/cards/v1/copy';

// 获取发现广场（公开菇卡，无需登录）
// GET /api/rf-shroom-card/v1/shroom-card/discover?tags=情绪&sort=latest&page=1&pageSize=20
const shroomCardDiscover = '/cards/v1/discover';

// 获取策展公开菇卡集合及人物
const shroomCardCollections = '/cards/v1/collections';

export {
	shroomCardList,
	shroomCardFavorites,
	shroomCardDetail,
	shroomCardCreate,
	shroomCardUpdate,
	shroomCardDelete,
	shroomCardPracticeCreate,
	shroomCardReview,
	shroomCardResonate,
	shroomCardUnresonate,
	shroomCardFavorite,
	shroomCardUnfavorite,
	shroomCardCopy,
	shroomCardDiscover,
	shroomCardCollections
};
