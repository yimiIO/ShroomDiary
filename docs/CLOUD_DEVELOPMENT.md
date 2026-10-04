# Shroom 云端开发与个人测试环境

## 工作流

```text
手机向 Shroom 云端 Agent 提需求
  → Agent 修改 cloud-test
  → GitHub Actions 运行 API 测试、H5 与管理后台构建
  → 生成单一发布包
  → 专用 shroomdeploy 账号上传
  → 服务器运行迁移、备份、替换、重启与健康检查
  → 失败自动恢复上一版
```

`shroom.evox.run` 当前被定义为所有者个人测试环境。`cloud-test` 每次通过验证的 push 都会自动部署，不需要额外的生产审批。

## GitHub Actions secrets

- `SHROOM_TEST_HOST`：测试服务器地址。
- `SHROOM_TEST_USER`：固定为 `shroomdeploy`。
- `SHROOM_TEST_SSH_KEY`：专用部署私钥。
- `SHROOM_TEST_KNOWN_HOSTS`：测试服务器 SSH host key。

这些值不得进入仓库、日志、Agent 提示词或用户报告。

## 服务器边界

部署账号只能上传到 `/var/lib/shroom-deploy/incoming`，并通过 sudo 执行 `/usr/local/sbin/shroom-test-deploy`。应用密钥继续只存放在 `/etc/shroom/*.env`。

部署脚本会：验证压缩包路径、安装服务端生产依赖、串行执行未应用 SQL、备份现有版本、替换前后端、重启服务、检查本机和公网健康状态。失败时恢复上一版。

## 以后正式上线

正式环境使用独立服务器、独立域名、独立数据库与单独的 `production` GitHub Environment。个人测试环境不直接复制数据库到正式环境，只通过经过确认的迁移脚本和版本发布升级。
