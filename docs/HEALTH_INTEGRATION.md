# 健康数据接入方案（跨平台）

## 一、各平台能力总览

| 平台 | 数据源 | 可拿数据 | 接入方式 | 难度 |
|------|--------|----------|----------|------|
| **微信小程序** | 微信运动 | 步数（近30天） | wx.getWeRunData + 后端解密 | ★★ |
| **iOS App** | Apple Health | 步数、睡眠、心率、距离、能量、正念、运动 | HealthKit / UTS 插件 | ★★★ |
| **Android App** | Health Connect | 步数、睡眠、心率、距离、能量、营养（50+类型） | Health Connect / UTS 插件 | ★★★ |
| **iOS 手表** | Apple Watch → HealthKit | 同 iOS | 自动同步到 HealthKit | ★ |
| **Android 手表** | 手表厂商App → Health Connect | 同 Android | 三星/Garmin/华为/小米都自动写入 | ★ |

## 二、微信小程序（已实现）

### 流程
1. 小程序端 `wx.login` 拿 code → 后端换 openid + session_key，存 users.wechat_session_key
2. 用户点"同步步数"按钮 → `wx.getWeRunData` 拿 encryptedData + iv
3. 发到后端 `/snapshot/v1/health/wechat/sync`
4. 后端 AES-128-CBC 解密 → 取今天 step → upsert snapshots.steps

### 数据
- 过去30天每天步数
- 只能读，不能写回微信运动（需要体育类目）

### 注意
- 需要小程序后台开通"微信运动"接口权限
- session_key 会过期，过期后重新 wx.login 刷新

## 三、iOS App（HealthKit）

### 数据类型
- **步数**：HKQuantityTypeIdentifier.stepCount
- **睡眠**：HKCategoryTypeIdentifier.sleepAnalysis（在床/入睡/醒来）
- **心率**：heartRate
- **距离/能量**：distanceWalkingRunning, activeEnergyBurned
- **正念**：mindfulSession（和我们冥想功能天然对接）

### 接入方式
uni-app 用 UTS 插件，推荐：
- **AI Health**（ext.dcloud.net.cn）：同时支持 iOS HealthKit + Android Health Connect
- **计步器**（id=27194）：纯步数，轻量

### 配置
manifest.json 加：
```json
"NSHealthShareUsageDescription": "需要读取步数和睡眠数据来记录你的每日生活",
"NSHealthUpdateUsageDescription": "需要写入冥想记录到健康App"
```

## 四、Android App（Health Connect）

### 重要
**Google Fit 已于 2025-06-30 废弃**，新接入全部用 **Health Connect**。

### 数据类型
50+ 种，我们需要的：
- 步数 Steps
- 睡眠 SleepSession
- 心率 HeartRate
- 距离 Distance
- 热量 ActiveCaloriesBurned
- 营养 Nutrition（和我们"记个吃喝"对接）

### 设备支持
所有主流手表/手环都自动写入 Health Connect：
- 三星 Galaxy Watch / Samsung Health
- 华为 Watch / 华为运动健康
- 小米手环 / 小米手表 / Mi Fitness
- Garmin / Polar / Fitbit / Amazfit / Oura
- 只要用户在厂商App里打开"同步到 Health Connect"

### 接入方式
和 iOS 同一个 UTS 插件（AI Health），一套代码两端跑。

## 五、我们的架构

```
用户设备（手机/手表）
    ↓ 系统级同步
iOS: HealthKit    Android: Health Connect    微信: 微信运动
    ↓                    ↓                        ↓
    └────────── UTS 插件统一调用 ──────────┘
                          ↓
                  后端 /snapshot/v1/health/sync
                          ↓
                  snapshots 表（steps, sleep...）
```

## 六、下一步

1. ✅ 微信步数接口已写好（后端解密 + 前端调用）
2. ⏳ 小程序登录流程补 wx.login → 后端存 session_key
3. ⏳ App 端引入 UTS 健康插件（需要 HBuilderX 打包，线上工程师处理）
4. ⏳ 睡眠数据：iOS 从 HealthKit sleepAnalysis 读；Android 从 Health Connect SleepSession 读
