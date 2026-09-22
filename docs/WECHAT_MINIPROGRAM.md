# Shroom 微信小程序工程

Shroom 继续以同一套 uni-app 源码维护 H5、App 与微信小程序。微信开发者工具工程是可重复生成的构建产物，不在 `dist/` 中手工修改业务代码。

## 构建与打开

客户端使用仓库根目录 `.nvmrc` 指定的 Node.js 16.20.2：

```bash
nvm use
npm install
npm run build:wechat-project
```

命令会依次：

1. 编译 `mp-weixin`；
2. 生成正式 AppID、合法域名校验、调试入口和上传忽略规则；
3. 检查全部页面产物、主包大小、浏览器专用 API 和不兼容 WXML 表达式。

生成后，在微信开发者工具中导入：

```text
dist/build/mp-weixin
```

构建脚本会同时生成仅供本机开发者工具使用、不会随代码上传的
`project.private.config.json`，用于在公众平台正式域名尚未配置前完成本地接口联调。
正式 `project.config.json` 仍强制开启合法域名校验；体验版和正式版不能依赖本地豁免。

macOS 已安装微信开发者工具时，可继续执行预览验证：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview \
  --project "$PWD/dist/build/mp-weixin" \
  --qr-format terminal \
  --lang zh
```

当前 AppID 为 `wxa25c13889c215f0a`。登录页和写日记页已经加入开发者工具的编译条件，便于联调。

## 公众平台上线前配置

代码编译通过不等于公众平台配置已经完成。发布体验版或提审前，还要在微信公众平台完成：

- 将 `https://shroom.evox.run` 配置为实际使用的 request、uploadFile 和 downloadFile 合法域名；
- 确认 HTTPS 证书链有效，生产接口 `/api/health` 可用；
- 在「设置 → 服务内容声明 → 用户隐私保护指引」按实际调用声明：用户主动从相册选择图片，用于添加日记图片或待办结果照片并上传保存；用户主动使用麦克风录音，用于创建语音日记并上传保存/转写；
- 图片选择已限定为 `sourceType: ['album']`，当前小程序不声明摄像头权限；若未来增加拍摄，必须先更新隐私保护指引再上线；
- 相册和录音入口在调用隐私接口前会执行 `wx.requirePrivacyAuthorize`，未同意时不继续访问设备能力；
- 完成小程序备案、服务类目、用户协议、隐私政策、客服与体验成员配置；
- 使用真实设备分别验证登录、写日记、图片上传、录音与转写、日历、身心记录、未解之问、菇卡、待办和退出登录；
- 当前虚拟服务支付保持关闭，不能用普通小程序支付或引导用户绕到 H5 充值。

## 跨端约束

- 浏览器的 `window`、`document`、`navigator`、`MediaRecorder`、Blob 下载与拖拽只允许出现在 `#ifdef H5` 分支；
- 小程序复制、录音、图片选择和上传使用 `uni.*` API；
- `navigationStyle: custom` 页面不能只预留状态栏。普通内容和页面级操作必须从微信胶囊导航区下方开始，统一使用 `shroom-page-top-spacer`；只有自行读取胶囊位置并完成等价避让的专用导航栏可以例外；
- 设置、新建、完成等业务操作不放进微信胶囊占用的右上角区域。若动作位于首屏右侧，它仍属于胶囊下方的页面工具栏；
- 私密页面进入后台时启用 `visualEffectInBackground: hidden`；
- TabBar 页面留在主包。当前上传包约 1.8 MB；旧模板静态资源通过项目上传规则排除，不影响 H5；
- `dist/` 是生成目录。兼容性修复必须改 `src/`、构建脚本或测试，再重新编译。

旧版 uni-app 构建会输出 Sass `@import` 与 legacy JS API 的弃用提醒；它们不是本次微信预览错误。升级 uni-app/Sass 属于单独的依赖迁移任务，需要同时回归 H5、App 和小程序，不能在发布前无验证地强行升级。
