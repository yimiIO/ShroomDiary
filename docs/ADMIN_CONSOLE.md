# Shroom 正式管理后台

## 定位

`/admin/` 是与 UniApp 用户端分离的轻量运营控制台。它复用现有 Node.js/PostgreSQL 服务，不引入新的后端框架、数据库或身份系统。

用户端中的临时 `pages/admin/ai-company` 和旧 `/api/admin/v1` 已移除。人工运营统一使用 `/api/admin/v2` 和 `/admin/`，自动执行使用绑定单个 Agent 的 `/api/agent-control/v1`。

## 功能范围

- 总览：用户、活跃、AI 用量、Agent 连接、功能发布和系统依赖状态。
- 用户管理：聚合计数、账号暂停/恢复、会话注销、单用户功能授权。
- 功能管理：`ACTIVE / BETA / PAUSED` 发布状态、平台范围、维护文案和版本冲突保护。
- 公司 Agent：部门与 Agent 配置、暂停/恢复/运行指令、Runner 凭据、心跳、执行记录、部门日报、CEO 决策和获客漏斗。
- 管理员：`OWNER / OPERATOR / SUPPORT / VIEWER` 角色与成员暂停。
- 审计：记录操作人、角色、动作、对象、原因、变更前后摘要和请求 ID。

## 数据和权限边界

- 后台只显示日记、菇卡、反思和 AI 调用的数量，不查询、返回或搜索日记正文。
- 功能发布状态与付费权益分开。`ALLOW` 是明确的运营例外，`DENY` 可单用户关闭；两者都不改写账单和余额。
- 服务履约、Agent 执行结果和付款不提升任何用户能力状态。
- 账号暂停会撤销用户 refresh token、API token 和管理会话，但不删除业务数据。
- 高影响操作需在 10 分钟内重新验证管理员密码。管理会话绝对有效期 8 小时，闲置 30 分钟失效。
- 会话使用 `HttpOnly + Secure + SameSite=Strict` Cookie，写操作同时校验 CSRF token。Runner 只使用绑定单个 Agent 的随机凭据，数据库仅保存 SHA-256 摘要。

## 数据库与首次开通

按现有迁移顺序执行 `server/sql/044_admin_console.sql`。迁移会将当前 `users.role = 'ADMIN'` 的用户加入 `admin_members` 并授予 `OWNER`，不创建默认密码。

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/sql/044_admin_console.sql
```

如果现有数据库没有 `role = 'ADMIN'` 用户，先使用正常 Shroom 注册流程创建账号，再由数据库管理员执行一次显式、可审计的 `admin_members` 插入。不要在代码或环境变量里预置共享管理员密码。

## 构建与部署

需要 Node.js 20.19+ or 22.12+。

```bash
# 使用根目录 .nvmrc 的 Node 16 构建旧 UniApp H5
npm run build:h5

# 切换到 Node 20.19+ 后构建后台
npm --prefix admin install
npm run build:admin
```

两次构建共用发行目录：后台输出到 `dist/build/h5/admin/` 且不清空其他 H5 产物。部署整个 `dist/build/h5/` 后，Nginx 使用 `server/deploy/shroom-evox-run.nginx.conf` 提供 `/admin/` SPA fallback、禁止搜索引擎索引，并为入口文件设置不缓存与 CSP。

本地运行：

```bash
# terminal 1
cd server && npm start

# terminal 2
npm --prefix admin run dev
```

## Agent Runner 协议

Runner 使用 `x-shroom-agent-token` 访问 `/api/agent-control/v1`：

- `GET /state`：读取当前 Agent 的有限配置和待处理指令数。
- `POST /heartbeat`：上报 `IDLE / RUNNING / ERROR`。
- `POST /commands/next`：原子领取一条指令。
- `POST /commands/:id/complete`：完成已领取指令。
- `POST /executions`：对处于 `ACTIVE` 的 Agent 开始一次执行。
- `PATCH /executions/:id`：写入终态、结果层级和证据摘要。
- `POST /department-runs`：写入当前 Runner 所属部门的当日日报；部门身份从凭据推导，不能由请求体指定。
- `GET /department-runs/:runDate`：核验当前 Runner 所属部门指定日期的日报。
- `POST /decisions`：为当前 Runner 所属部门的日报幂等写入 CEO 决策卡。

Runner 凭据仅在创建时显示一次；遗失时撤销并重新生成，不存在找回明文的接口。

## Direction Gate

`PASS`：本后台是运营基础设施，保护用户数据权限、功能发布和 Agent 执行证据。它不生成用户内容，不替用户完成关键行为，不根据运营、Agent 或付费记录更改用户能力状态。可检查证据为 RBAC/CSRF/会话失效逻辑、追加式审计记录、不返回日记正文的后台 API，以及 Agent execution/result-state 持久化。Outcome Preview / Demonstration: N/A（内部运营基础设施）。
