# Shroom Diary｜菇日记

[English](./README_EN.md) · [在线体验](https://shroom.surfplus.xyz)

Shroom 是一款以私人日记为原点的开源 AI 记忆、理解与轻社交产品。它不只保存“今天发生了什么”，也帮助你在经过足够时间与真实经历后，重新理解过去、保留有效经验，并看见自己正在发生的变化。

> 日记保存真实，AI 帮助回看；最终的解释、选择与公开权始终属于用户。

## 愿景

> 不遗忘你，也不替你生活；在真正需要时，带回恰当的记忆与帮助。

Shroom 的远景是成为每个人长期陪伴的 AI 伙伴：在尊重隐私和用户主权的前提下，逐渐理解一个人的经历、选择、关系、困惑与长期目标，在真正需要的时刻提供帮助、提醒和新的观察。

当前版本以主动写日记为记忆入口。未来，Shroom 将从“需要刻意记录”走向“低打扰、低摩擦地留下可用线索”，再成长为能在合适时机主动帮助用户的长期伙伴。“无感”不意味着不知情的监听：所有自动记录必须可见、可选择、可暂停、可删除，重要结论和行动仍由用户确认。

## 核心体验

- **跨端日记**：按天与时段记录文字、图片和语音，支持日历、归档、搜索与分页回看。
- **高精度语音转写**：原始录音先私密保存，转写结果是可编辑草稿，不会直接覆盖正文。
- **日记记忆**：基于 PostgreSQL + pgvector 的语义检索，用相关日记作为证据回答长期问题，并明确引用来源。
- **未解之问**：把一次讨论回答不了的困惑保存下来，经用户确认持续关联日记与新线索，再形成带支持、反例和未知项的阶段理解。
- **健康长期观察**：在未解之问中连接心理感受、身体变化、睡眠、行为、环境、测量、检查与日记照片，比较个人基线，整理可修订的原因假设并导出就医摘要；所有输出都是线索，不是诊断。
- **五个观察席**：每位新用户拥有默认观察视角，也可以新增、编辑和切换自己的观察者。
- **菇卡**：从具体经历中保留下次仍能使用的理解、提醒或观察视角；它不是待办，也不是口号。
- **人生 OS**：用 20 项可编辑的长期事项连接日记证据、本周重点与复盘；更抽象的跨情境判断标准由 AI 提议、用户确认后才发布新版本。
- **人脉与待办**：从日记中提取关系事件与承诺，规则化更新关系记录；真正需要执行的事情进入待办或实验。
- **可控 AI**：每篇日记可单独关闭 AI 使用；分析与回看记录模型、token、价格快照和人民币费用估算。
- **轻社交**：用户可以公开、共鸣、收藏、引用和练习菇卡，私人日记本身默认不公开。
- **数据可携带**：支持导出自己的日记和衍生数据，日记正文始终是权威源。

## 产品边界

Shroom 不是医疗诊断工具，也不替用户下最终结论。AI 生成的情绪理解、关系判断和人生 OS 建议都应被视为可检查的候选解释。产品不会偷偷采集浏览器历史，也不会因为一次分析就自动改写用户的人生原则或公开私人内容。

更完整的产品定义见 [docs/PRODUCT.md](./docs/PRODUCT.md)，长期问题机制见 [docs/INQUIRIES.md](./docs/INQUIRIES.md)，菇卡与人生 OS 的边界见 [docs/LIFE_OS.md](./docs/LIFE_OS.md)，长期事项模块见 [docs/LIFE_OS_LONG_TERM.md](./docs/LIFE_OS_LONG_TERM.md)，记忆检索架构见 [server/REFLECTION_ARCHITECTURE.md](./server/REFLECTION_ARCHITECTURE.md)。

## 技术架构

```text
uni-app / Vue 2
  ├─ H5 浏览器
  ├─ Android / iOS（app-plus）
  └─ 微信等小程序
          │ HTTPS / Bearer + rotating refresh token
          ▼
Node.js / Express API
  ├─ PostgreSQL + pgvector（业务数据、记忆索引）
  ├─ OpenAI-compatible LLM / Embedding API
  ├─ 火山引擎或兼容 ASR（可选）
  └─ 腾讯云 COS 私有桶（可选，图片去元数据与自适应压缩）
```

前端与服务端都在同一仓库中：

- `src/`：uni-app 客户端
- `server/src/`：独立 Shroom API
- `server/sql/`：按编号执行的 PostgreSQL 迁移
- `server/test/`：Node.js 单元、契约与集成测试
- `docs/`：产品、数据与 API 文档

## 本地运行

### 环境要求

- Node.js 16.20（当前 uni-app 旧版客户端构建链）
- Node.js 20+（`server/` 服务端与测试）
- PostgreSQL 14+，并安装 pgvector 扩展
- npm

### 1. 安装依赖

```bash
npm install
npm --prefix server install
```

建议使用 nvm 分别运行两套工具链：根目录客户端遵循 `.nvmrc`，启动或测试 `server/` 时切换到 Node.js 20+。旧版 uni-app 的 App/小程序构建在过新的 Node.js 上可能因已移除的 Node API 失败。

### 2. 创建数据库并执行迁移

创建一个独立的 Shroom 数据库和低权限数据库用户，然后按文件名顺序执行 `server/sql/*.sql`。例如：

```bash
for migration in server/sql/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
```

### 3. 配置服务端

```bash
cp server/.env.example server/.env
```

至少设置 `DATABASE_URL` 和高强度随机 `TOKEN_SECRET`。AI、Embedding、ASR 与 COS 都是可选能力；未配置时，基础日记与菇卡功能仍可运行。所有供应商密钥只允许出现在服务端环境变量中，不能写入客户端或提交到 Git。

### 4. 启动 API 与 H5

在两个终端分别运行：

```bash
set -a
source server/.env
set +a
npm --prefix server start
```

```bash
npm run dev:h5
```

如果 API 不是生产地址，请通过构建环境变量设置 `VUE_APP_SHROOM_ORIGIN`，例如 `http://localhost:3102`。

其他客户端构建：

```bash
npm run build:h5
npm run build:app-plus
npm run build:mp-weixin
```

## 测试

```bash
npm --prefix server test
npm run build:h5
```

带数据库的集成与在线 smoke test 需要显式提供测试环境变量，测试数据不要指向生产数据库。详细配置与部署说明见 [server/README.md](./server/README.md)。

## 隐私与安全

- 新用户数据只写入独立 Shroom 数据库，不兼容或读取旧商城、课程、支付、冲浪等业务数据源。
- API 只从登录会话或受限 API Token 确认用户，客户端不能通过传入 `userId` 切换数据归属。
- 密码以加盐散列保存；刷新令牌轮换并仅保存摘要。
- 私密图片通过短时签名 URL 访问；上传时移除 EXIF/GPS，并避免“压缩后反而变大”。
- AI 只能读取当前账户中明确允许 AI 使用的内容。
- 请勿提交 `.env`、数据库导出、录音、图片、证书或任何真实用户资料。

如果发现安全问题，请不要公开提交包含利用细节或用户数据的 Issue，先通过仓库所有者的 GitHub 联系方式私下报告。

## 参与贡献

欢迎提交 Issue、产品讨论和 Pull Request。较大的改动建议先说明它解决的真实使用问题、隐私边界、跨 H5/App/小程序的交互差异，以及可验证的验收方式。

## License

[MIT](./LICENSE)
