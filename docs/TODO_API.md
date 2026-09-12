# 待办功能后端接口文档（历史草案，已废弃）

> 本文档是早期 MySQL / `rf-todo` 草案，不代表当前产品或生产 API。当前 PostgreSQL 行动层见 [TODO_PROJECTS.md](./TODO_PROJECTS.md) 和 `server/src/routes/todos.js`。特别是：完成待办不再伪造日记正文，而是生成可撤销的系统行动记录。

## 数据库表设计

### 待办表 (todos)

```sql
CREATE TABLE `todos` (
  `id` VARCHAR(64) NOT NULL COMMENT '待办ID',
  `member_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
  `content` TEXT NOT NULL COMMENT '待办内容',
  `deadline` DATE COMMENT '截止日期（可选）',
  `status` ENUM('pending', 'completed') NOT NULL DEFAULT 'pending' COMMENT '状态：pending-待完成，completed-已完成',
  `tags` JSON COMMENT '标签数组，如：["工作", "重要"]',
  `completed_at` DATETIME COMMENT '完成时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_member_id` (`member_id`),
  KEY `idx_status` (`status`),
  KEY `idx_deadline` (`deadline`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='待办表';
```

## API 接口说明

### 1. 获取待办列表

**接口地址**: `GET /api/rf-todo/v1/todo/index`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| page | int | 否 | 页码，默认1 |
| pageSize | int | 否 | 每页数量，默认20 |
| status | string | 否 | 状态筛选：pending-待完成，completed-已完成，空-全部 |

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "todo_123456",
        "content": "完成项目报告",
        "deadline": "2024-01-15",
        "status": "pending",
        "tags": ["工作", "重要"],
        "createdAt": "2024-01-10 10:00:00",
        "updatedAt": "2024-01-10 10:00:00"
      }
    ],
    "total": 10,
    "page": 1,
    "pageSize": 20
  }
}
```

**说明**:
- 后端需要根据token自动识别用户，筛选member_id
- 如果返回total字段，前端可以直接使用，否则需要计算list长度

---

### 2. 获取待办详情

**接口地址**: `GET /api/rf-todo/v1/todo/view`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 待办ID |

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "todo_123456",
    "content": "完成项目报告",
    "deadline": "2024-01-15",
    "status": "pending",
    "tags": ["工作", "重要"],
    "createdAt": "2024-01-10 10:00:00",
    "updatedAt": "2024-01-10 10:00:00"
  }
}
```

---

### 3. 创建待办

**接口地址**: `POST /api/rf-todo/v1/todo/create`

**请求体**:
```json
{
  "content": "完成项目报告",
  "deadline": "2024-01-15",
  "tags": ["工作", "重要"],
  "status": "pending"
}
```

**字段说明**:
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| content | string | 是 | 待办内容，最大500字符 |
| deadline | string | 否 | 截止日期，格式：YYYY-MM-DD，可选 |
| tags | array | 否 | 标签数组 |
| status | string | 否 | 状态，默认pending |

**响应示例**:
```json
{
  "code": 200,
  "message": "创建成功",
  "data": {
    "id": "todo_123456"
  }
}
```

---

### 4. 更新待办

**接口地址**: `PUT /api/rf-todo/v1/todo/update?id={todo_id}`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 待办ID（URL参数） |

**请求体**: 同创建待办，所有字段可选

**响应示例**:
```json
{
  "code": 200,
  "message": "更新成功"
}
```

---

### 5. 删除待办

**接口地址**: `DELETE /api/rf-todo/v1/todo/delete?id={todo_id}`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 待办ID（URL参数） |

**响应示例**:
```json
{
  "code": 200,
  "message": "删除成功"
}
```

---

### 6. 完成待办（重要）

**接口地址**: `POST /api/rf-todo/v1/todo/complete?id={todo_id}`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 待办ID（URL参数） |

**功能说明**:
1. 将待办状态更新为 `completed`
2. 设置 `completed_at` 为当前时间
3. **自动创建一条日记记录**，添加到当天日程

**自动创建日记的逻辑**:
- 日记内容：`✅ 完成待办：{待办内容}`
- 日记日期：当天
- 日记时间：当前时间向上取整到半小时粒度
  - 例如：14:25 → 14:30
  - 例如：14:35 → 15:00
- 日记情绪：happy
- 日记不再继承待办标签；待办标签只用于行动管理
- 日记类型：todo_completed
- 日记可见性：PRIVATE

**响应示例**:
```json
{
  "code": 200,
  "message": "完成成功",
  "data": {
    "diaryId": "diary_789012"
  }
}
```

**响应字段说明**:
- `diaryId`: 自动创建的日记ID（可选，前端可以用于跳转）

---

## 数据字段映射

### 前端字段 → 数据库字段

| 前端字段 | 数据库字段 | 说明 |
|---------|-----------|------|
| content | content | 待办内容 |
| deadline | deadline | 截止日期（可选） |
| status | status | 状态 |
| tags | tags | 标签（JSON数组） |
| completedAt | completed_at | 完成时间 |
| createdAt | created_at | 创建时间 |
| updatedAt | updated_at | 更新时间 |

---

## 注意事项

1. **用户身份验证**: 所有接口都需要token验证，后端需要根据token自动识别用户ID
2. **数据权限**: 用户只能操作自己的待办，需要验证member_id
3. **完成待办**: 完成待办时会自动创建日记，需要调用日记创建接口
4. **时间粒度**: 完成待办时添加到日程的时间需要按半小时粒度计算
5. **标签存储**: tags字段使用JSON格式存储数组
6. **分页**: 列表接口需要支持分页，返回total字段便于前端显示总数

---

## 示例SQL

### 创建待办
```sql
INSERT INTO `todos` (
  `id`,
  `member_id`,
  `content`,
  `deadline`,
  `status`,
  `tags`
) VALUES (
  'todo_123456',
  'user_001',
  '完成项目报告',
  '2024-01-15',
  'pending',
  '["工作", "重要"]'
);
```

### 完成待办并创建日记
```sql
-- 1. 更新待办状态
UPDATE `todos`
SET `status` = 'completed',
    `completed_at` = NOW()
WHERE `id` = 'todo_123456' AND `member_id` = 'user_001';

-- 2. 计算半小时粒度时间
-- 假设当前时间是 14:25
-- hour = 14, minute = 30 (向上取整)

-- 3. 创建日记（需要调用日记创建接口或直接插入）
INSERT INTO `diaries` (
  `id`,
  `member_id`,
  `content`,
  `hour`,
  `minute`,
  `mood`,
  `tags`,
  `type`,
  `visibility`,
  `created_at`
) VALUES (
  'diary_789012',
  'user_001',
  '✅ 完成待办：完成项目报告',
  14,
  30,
  'happy',
  '["工作", "重要"]',
  'todo_completed',
  'PRIVATE',
  NOW()
);
```

---

## 前端调用示例

### 获取待办列表
```javascript
const res = await this.$http.get('/rf-todo/v1/todo/index', {
  page: 1,
  pageSize: 20,
  status: 'pending' // 或 'completed' 或 ''
});
```

### 创建待办
```javascript
const res = await this.$http.post('/rf-todo/v1/todo/create', {
  content: '完成项目报告',
  deadline: '2024-01-15', // 可选
  tags: ['工作', '重要'],
  status: 'pending'
});
```

### 完成待办
```javascript
const res = await this.$http.post('/rf-todo/v1/todo/complete?id=todo_123456', {});
// 后端会自动创建日记记录
```

---

## 数据库索引建议

```sql
-- 用户ID索引（最常用）
CREATE INDEX idx_member_id ON todos(member_id);

-- 状态索引（用于筛选）
CREATE INDEX idx_status ON todos(status);

-- 截止日期索引（用于按日期筛选）
CREATE INDEX idx_deadline ON todos(deadline);

-- 创建时间索引（用于排序）
CREATE INDEX idx_created_at ON todos(created_at);

-- 复合索引（用于用户+状态查询）
CREATE INDEX idx_member_status ON todos(member_id, status);

-- 复合索引（用于用户+日期查询）
CREATE INDEX idx_member_date ON todos(member_id, deadline);
```
