# API 接口文档

## 基础信息

- **Base URL**: `/api`
- **认证方式**: Bearer Token (通过 Header 传递: `Authorization: Bearer {token}`)
- **数据格式**: JSON
- **字符编码**: UTF-8

## 通用响应格式

### 成功响应
```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

### 错误响应
```json
{
  "code": 400,
  "message": "错误信息",
  "data": null
}
```

### 状态码说明
- `200`: 成功
- `400`: 请求参数错误
- `401`: 未授权
- `403`: 无权限
- `404`: 资源不存在
- `500`: 服务器错误

---

## 菇每日总结

- `GET /api/daily-reviews/v1/{YYYY-MM-DD}`：读取已有总结状态，不标记已查看。
- `POST /api/daily-reviews/v1/{YYYY-MM-DD}/open`：主动打开；当来源或总结规则版本变化时重新生成，并记录已查看。生成结果以 `criticalReview`（最大问题、代价、具体建议）为首要判断，事实速记放在末尾，并包含数据截止时间和最小来源引用。
- `GET /api/daily-reviews/v1/inbox`：读取最近 30 条站内总结消息，只返回标题与摘要，不复制完整私人证据正文。
- `GET /api/daily-reviews/v1/inbox/unread-count`：读取未读数与最新未读消息 id，用于应用角标和在线提醒。
- `GET /api/daily-reviews/v1/preferences`：读取 22:00 收件箱和邮件状态。
- `POST /api/daily-reviews/v1/preferences/email/request`：向新邮箱发送 6 位验证码。
- `POST /api/daily-reviews/v1/preferences/email/verify`：验证邮箱并显式开启 22:00 邮件。
- `PATCH /api/daily-reviews/v1/preferences`：用 `{ "inboxEnabled": false }` 或 `{ "emailEnabled": false }` 分别管理站内投递与邮件。

上海时间 22:00 后，当天存在可读取证据且用户开启站内投递时，总结会进入收件箱并显示未读角标；这不依赖邮箱。邮件只会在当天总结从未打开、邮箱已验证且用户已开启时发送。总结是派生草稿，不写入日记正文，也不修改人生 OS、复利状态或待办。

---

## 日记相关接口

### 1. 获取日记列表

**接口**: `GET /api/diaries`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| date | string | 否 | 日期，格式：YYYY-MM-DD，不传则返回所有日记 |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20 |

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "diary-1",
        "content": "今天心情很好...",
        "images": ["https://example.com/image1.jpg"],
        "voice": null,
        "hour": 14,
        "minute": 30,
        "type": "default",
        "linkedCards": [
          {
            "id": "card-1",
            "seedSentence": "当别人误解我时..."
          }
        ],
        "visibility": "PRIVATE",
        "createdAt": "2024-01-15 14:30:00",
        "updatedAt": "2024-01-15 14:30:00"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

### 2. 获取日记详情

**接口**: `GET /api/diaries/{id}`

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 日记ID |

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "diary-1",
    "content": "今天心情很好...",
    "images": ["https://example.com/image1.jpg"],
    "voice": {
      "url": "https://example.com/voice.mp3",
      "duration": 30
    },
    "hour": 14,
    "minute": 30,
    "type": "default",
    "linkedCards": [
      {
        "id": "card-1",
        "seedSentence": "当别人误解我时..."
      }
    ],
    "visibility": "PRIVATE",
    "createdAt": "2024-01-15 14:30:00",
    "updatedAt": "2024-01-15 14:30:00"
  }
}
```

### 3. 创建日记

**接口**: `POST /api/diaries`

**请求体**:
```json
{
  "content": "今天心情很好...",
  "images": ["https://example.com/image1.jpg"],
  "voice": {
    "url": "https://example.com/voice.mp3",
    "duration": 30
  },
  "hour": 14,
  "minute": 30,
  "type": "default",
  "linkedCards": ["card-1"],
  "visibility": "PRIVATE",
  "createdAt": "2024-01-15 14:30:00"
}
```

**字段说明**:
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| content | string | 是 | 日记内容 |
| images | array | 否 | 图片URL数组，最多9张 |
| voice | object | 否 | 语音对象，包含url和duration |
| hour | number | 否 | 小时（0-23），null表示整篇日记 |
| minute | number | 否 | 分钟（0-59），null表示整篇日记 |
| type | string | 否 | 日记类型，默认"default" |
| linkedCards | array | 否 | 关联的菇卡ID数组 |
| visibility | string | 否 | 隐私设置：PRIVATE/PUBLIC_ANON/PUBLIC_NAMED，默认PRIVATE |
| createdAt | string | 否 | 创建时间，格式：YYYY-MM-DD HH:mm:ss，不传则使用当前时间 |

**响应示例**:
```json
{
  "code": 200,
  "message": "创建成功",
  "data": {
    "id": "diary-1",
    "createdAt": "2024-01-15 14:30:00"
  }
}
```

### 4. 更新日记

**接口**: `PUT /api/diaries/{id}`

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 日记ID |

**请求体**: 同创建日记，所有字段可选

**响应示例**:
```json
{
  "code": 200,
  "message": "更新成功",
  "data": {
    "id": "diary-1",
    "updatedAt": "2024-01-15 15:00:00"
  }
}
```

### 5. 删除日记

**接口**: `DELETE /api/diaries/{id}`

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 日记ID |

**响应示例**:
```json
{
  "code": 200,
  "message": "删除成功",
  "data": null
}
```

### 6. 搜索日记

**接口**: `GET /api/diaries/search`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| keyword | string | 是 | 搜索关键词 |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20 |

**响应示例**: 同获取日记列表

---

## 菇卡相关接口

### 1. 获取菇卡列表

**接口**: `GET /api/cards/v1/index`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| reviewStage | string | 否 | 复习阶段：new/today/day1/day3/day7/day14/day30/mastered |
| tags | string | 否 | 标签，多个用逗号分隔 |
| visibility | string | 否 | 隐私设置：PRIVATE/PUBLIC_ANON/PUBLIC_NAMED |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20 |

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "card-1",
        "seedSentence": "当别人误解我时，我其实不是在生气，而是害怕自己被抹掉。",
        "myUnderstanding": "我意识到自己很多时候的愤怒其实源于内心的恐惧...",
        "usageItems": [
          "当感到被误解时，先深呼吸，问自己：我真正害怕的是什么？",
          "尝试用\"我感到...\"的句式表达自己的感受"
        ],
        "practiceCases": [],
        "tags": ["情绪", "关系"],
        "visibility": "PRIVATE",
        "stats": {
          "practiceCount": 0,
          "resonanceCount": 12,
          "favoriteCount": 3,
          "quoteCount": 2,
          "lastPracticeTime": null
        },
        "createdAt": "2024-01-15 10:00:00",
        "updatedAt": "2024-01-15 10:00:00"
      }
    ],
    "total": 50,
    "page": 1,
    "pageSize": 20
  }
}
```

**我的收藏**: `GET /api/cards/v1/favorites?page=1&pageSize=20`。只返回当前登录用户收藏且仍可见的菇卡，用于个人菇卡页的“我的收藏”入口。

### 2. 获取菇卡详情

**接口**: `GET /api/cards/v1/view?id={id}`

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 菇卡ID |

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "card-1",
    "seedSentence": "当别人误解我时，我其实不是在生气，而是害怕自己被抹掉。",
    "myUnderstanding": "我意识到自己很多时候的愤怒其实源于内心的恐惧...",
    "usageItems": [
      "当感到被误解时，先深呼吸，问自己：我真正害怕的是什么？",
      "尝试用\"我感到...\"的句式表达自己的感受"
    ],
    "practiceCases": [
      {
        "id": "practice-1",
        "context": "今天和同事发生了争执",
        "action": "我深呼吸后，说出了自己的感受",
        "feeling": "感觉轻松了很多",
        "createdAt": "2024-01-15 16:00:00"
      }
    ],
    "tags": ["情绪", "关系"],
    "visibility": "PRIVATE",
    "stats": {
      "practiceCount": 1,
      "resonanceCount": 12,
      "favoriteCount": 3,
      "quoteCount": 2,
      "lastPracticeTime": "2024-01-15 16:00:00"
    },
    "createdAt": "2024-01-15 10:00:00",
    "updatedAt": "2024-01-15 16:00:00"
  }
}
```

### 3. 创建菇卡

**接口**: `POST /api/cards/v1/create`

**请求体**:
```json
{
  "seedSentence": "当别人误解我时，我其实不是在生气，而是害怕自己被抹掉。",
  "myUnderstanding": "我意识到自己很多时候的愤怒其实源于内心的恐惧...",
  "usageItems": [
    "当感到被误解时，先深呼吸，问自己：我真正害怕的是什么？",
    "尝试用\"我感到...\"的句式表达自己的感受"
  ],
  "tags": ["情绪", "关系"],
  "visibility": "PRIVATE"
}
```

**字段说明**:
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| seedSentence | string | 是 | 觉察句 |
| myUnderstanding | string | 否 | 我的理解 |
| usageItems | array | 否 | 使用方法数组 |
| tags | array | 否 | 标签数组 |
| visibility | string | 否 | 隐私设置：PRIVATE/PUBLIC_ANON/PUBLIC_NAMED，默认PRIVATE |

**响应示例**:
```json
{
  "code": 200,
  "message": "创建成功",
  "data": {
    "id": "card-1",
    "createdAt": "2024-01-15 10:00:00"
  }
}
```

### 4. 更新菇卡

**接口**: `PUT /api/cards/v1/update?id={id}`

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 菇卡ID |

**请求体**: 同创建菇卡，所有字段可选

**响应示例**:
```json
{
  "code": 200,
  "message": "更新成功",
  "data": {
    "id": "card-1",
    "updatedAt": "2024-01-15 15:00:00"
  }
}
```

### 5. 删除菇卡

**接口**: `DELETE /api/cards/v1/delete?id={id}`

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 菇卡ID |

**响应示例**:
```json
{
  "code": 200,
  "message": "删除成功",
  "data": null
}
```

### 6. 添加练习记录

**接口**: `POST /api/cards/v1/practices?id={id}`

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 菇卡ID |

**请求体**:
```json
{
  "context": "今天和同事发生了争执",
  "action": "我深呼吸后，说出了自己的感受",
  "feeling": "感觉轻松了很多"
}
```

**字段说明**:
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| context | string | 是 | 情境描述 |
| action | string | 是 | 做了什么 |
| feeling | string | 否 | 感受如何 |

**响应示例**:
```json
{
  "code": 200,
  "message": "添加成功",
  "data": {
    "id": "practice-1",
    "createdAt": "2024-01-15 16:00:00"
  }
}
```

### 7. 标记复习

**接口**: `POST /api/cards/v1/review?id={id}`

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 菇卡ID |

**说明**: 标记菇卡为已复习，会更新练习次数和最后练习时间

**响应示例**:
```json
{
  "code": 200,
  "message": "标记成功",
  "data": {
    "practiceCount": 1,
    "lastPracticeTime": "2024-01-15 16:00:00"
  }
}
```

### 8. 共鸣菇卡

**接口**: `POST /api/cards/v1/resonate`；取消使用 `POST /api/cards/v1/unresonate`，请求体均为 `{ "id": "..." }`。

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 菇卡ID |

**响应示例**:
```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "resonanceCount": 13
  }
}
```

### 9. 收藏菇卡

**接口**: `POST /api/cards/v1/favorite`；取消使用 `POST /api/cards/v1/unfavorite`，请求体均为 `{ "id": "..." }`。

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 菇卡ID |

**响应示例**:
```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "favoriteCount": 4
  }
}
```

### 10. 复制菇卡

**接口**: `POST /api/cards/v1/copy`，请求体为 `{ "id": "..." }`。

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 菇卡ID |

**说明**: 把别人的公开菇卡引用为自己的私密副本并保留 `copiedFromId`。同一用户重复引用同一来源时返回已有副本。

**响应示例**:
```json
{
  "code": 200,
  "message": "复制成功",
  "data": {
    "id": "card-2",
    "createdAt": "2024-01-15 16:00:00"
  }
}
```

### 11. 获取发现广场（公开菇卡）

**接口**: `GET /api/cards/v1/discover`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| tags | string | 否 | 标签，多个用逗号分隔 |
| sort | string | 否 | 排序方式：latest/resonance/favorite，默认latest |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20 |

**响应示例**: 同获取菇卡列表，但只返回公开的菇卡（PUBLIC_ANON 或 PUBLIC_NAMED）

默认发现流可以同时返回用户公开菇卡和 Shroom 策展菇卡。传入 `collection=human-notes` 后只看「人类留给自己的提醒」专题；可同时传入 `person` 按材料来源人物筛选。两者使用同一套菇卡接口与交互，策展卡仅通过 `editorialSource` 补充材料来源、转译类型和“非作者原话”等溯源信息。

公开详情和发现列表都会返回 `isOwner` 与 `viewerState`（`resonated`、`favorited`、`copiedCardId`）。非作者访问时不会返回日记/分析来源，`practiceCases` 为空且私人练习次数为 0；作者自己的详情才返回这些私密字段。

---

## 文件上传接口

### 上传图片

**接口**: `POST /api/upload/image`

**请求方式**: `multipart/form-data`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | file | 是 | 图片文件 |

**响应示例**:
```json
{
  "code": 200,
  "message": "上传成功",
  "data": {
    "url": "https://example.com/image1.jpg"
  }
}
```

### 上传语音

**接口**: `POST /api/upload/voice`

**请求方式**: `multipart/form-data`

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | file | 是 | 语音文件 |

**响应示例**:
```json
{
  "code": 200,
  "message": "上传成功",
  "data": {
    "url": "https://example.com/voice.mp3",
    "duration": 30
  }
}
```
