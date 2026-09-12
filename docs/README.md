# Shroom 文档入口

当前产品与实现首先以以下两份文档为准：

- [PRODUCT.md](./PRODUCT.md)：Shroom 整体产品定义、核心对象、已实现能力和边界。
- [COMPOUND_SYSTEM.md](./COMPOUND_SYSTEM.md)：五类 20 个长期方向、跨次推进、卡点处理、结果确认、日记联动与阶段回看。
- [LIFE_OS.md](./LIFE_OS.md)：人生 OS 与菇卡/行动的区别、生成修订机制、数据与 API 契约。
- [INQUIRIES.md](./INQUIRIES.md)：未解之问的入口、证据生命周期、AI 复盘和隐私边界。
- [TODO_PROJECTS.md](./TODO_PROJECTS.md)：待办、项目、重复实例、行动记录与复利系统的统一行动层。

下面的 `API.md` 和 `database.sql` 是项目早期基于 MySQL 草案留下的参考，不能代表当前生产 PostgreSQL API 与数据库；现行服务端结构以 `server/sql/`、`server/src/routes/` 和 `server/STORAGE.md` 为准。

## 历史文档

## 文档目录

### 1. API 接口文档 (`API.md`)
包含日记和菇卡功能的所有 RESTful API 接口说明，包括：
- 请求方法、路径、参数
- 请求体格式
- 响应格式
- 错误码说明

**使用方式**：
- 前端开发：参考接口文档进行 API 调用
- 后端开发：按照文档实现接口

### 2. 数据库结构文档 (`database.sql`)
包含完整的数据库表结构定义，包括：
- 日记表 (diaries)
- 菇卡表 (shroom_cards)
- 练习记录表 (shroom_practices)
- 关联表（共鸣、收藏、引用等）
- 索引优化
- 触发器（自动更新统计信息）

**使用方式**：
```bash
# 导入数据库
mysql -u root -p < database.sql
```

## 数据模型说明

### 日记 (Diary)
- **核心字段**：内容、图片、语音、时间段
- **关联**：可关联多个菇卡
- **隐私**：支持私有、匿名公开、实名公开

### 菇卡 (ShroomCard)
- **核心字段**：觉察句、我的理解、使用方法、标签
- **统计**：练习次数、共鸣数、收藏数、引用数
- **练习记录**：每次练习的情境、行动、感受
- **隐私**：支持私有、匿名公开、实名公开

## API 接口文件

### 前端使用
在 `src/api/` 目录下已创建：
- `diary.js` - 日记相关接口
- `shroomCard.js` - 菇卡相关接口

**使用示例**：
```javascript
import { diaryList, diaryCreate } from '@/api/diary';
import { shroomCardList, shroomCardCreate } from '@/api/shroomCard';

// 获取日记列表
const res = await this.$http.get(diaryList, { date: '2024-01-15' });

// 创建菇卡
const res = await this.$http.post(shroomCardCreate, {
  seedSentence: '觉察句内容',
  myUnderstanding: '我的理解',
  usageItems: ['使用方法1', '使用方法2'],
  tags: ['标签1', '标签2']
});
```

## 数据库表关系

```
diaries (日记)
  └── diary_linked_cards (日记关联菇卡)
      └── shroom_cards (菇卡)
          ├── shroom_practices (练习记录)
          ├── shroom_resonances (共鸣)
          ├── shroom_favorites (收藏)
          └── shroom_quotes (引用)
```

## 注意事项

1. **ID 生成**：建议使用 UUID 或雪花算法生成唯一ID
2. **软删除**：使用 `deleted_at` 字段实现软删除
3. **时间字段**：统一使用 `DATETIME` 类型，格式 `YYYY-MM-DD HH:mm:ss`
4. **JSON 字段**：MySQL 5.7+ 支持 JSON 类型，用于存储数组数据
5. **索引优化**：已为常用查询场景创建索引，可根据实际使用情况调整
6. **触发器**：自动维护统计信息，确保数据一致性

## 后续开发建议

1. **缓存策略**：对热门菇卡、发现广场等高频查询使用 Redis 缓存
2. **全文搜索**：使用 Elasticsearch 实现更强大的搜索功能
3. **文件存储**：图片和语音文件建议使用 OSS 或 CDN
4. **消息队列**：统计信息更新可使用消息队列异步处理
5. **数据备份**：定期备份数据库，建议每天一次
