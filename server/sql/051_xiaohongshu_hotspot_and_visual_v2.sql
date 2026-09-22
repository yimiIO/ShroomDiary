-- Add the hotspot-selection layer and the recurring official-account character.
-- This migration creates internal research/production state only. It grants no
-- authority to publish, contact users, spend money or treat cross-platform
-- signals as Xiaohongshu first-party trends.
BEGIN;

UPDATE ai_company_departments
SET operating_system = COALESCE(operating_system, '{}'::jsonb) ||
    '{
      "xiaohongshuHotspotLayer": {
        "status": "ACTIVE_INTERNAL_ONLY",
        "role": "TOPIC_ACCELERATOR_NOT_A_FOURTH_COLUMN",
        "sourcePriority": [
          "XIAOHONGSHU_FIRST_PARTY",
          "SHROOM_OWNED_FEEDBACK",
          "CATEGORY_REPEATED_QUESTIONS",
          "CROSS_PLATFORM_SIGNAL",
          "PREDICTABLE_LIFE_MOMENT"
        ],
        "thresholds": {"pursue": 78, "watch": 62},
        "hardStops": [
          "POLITICAL_EVENT",
          "MEMORIAL_EVENT",
          "DISASTER_OR_ACCIDENT",
          "PUBLIC_HEALTH_PANIC",
          "CELEBRITY_PRIVATE_MISFORTUNE",
          "UNVERIFIED_ALLEGATION"
        ],
        "columnRoutes": [
          "过去怎样在今天帮到我",
          "一条日记能发现什么",
          "做菇的人"
        ],
        "currentCandidate": {
          "title": "AI越来越聪明我们更懂自己了吗",
          "evidenceType": "CROSS_PLATFORM_SIGNAL",
          "decision": "PURSUE",
          "score": 94,
          "route": "做菇的人",
          "expiresAt": "2026-09-20T23:59:59+08:00",
          "xiaohongshuFirstPartyTrendVerified": false,
          "publicationState": "NOT_PUBLISHED"
        },
        "canPublish": false
      },
      "xiaohongshuVisualSystem": {
        "version": "SHROOM_MEMORY_KEEPER_V2",
        "recurringCharacter": "记忆管理员菇",
        "recognitionAssets": [
          "深森林绿不对称菌盖",
          "荧光黄绿记忆标签",
          "暖白身体与怀疑眉毛",
          "记忆卡片、放大镜、档案盒或证据线"
        ],
        "fixedBehaviors": ["找", "对", "问", "停"],
        "coverRule": "ONE_CONFLICT_ONE_CHARACTER_ACTION_ONE_JUDGMENT",
        "productEvidenceRequiresRealDemoScreenshot": true,
        "aiAssetDisclosureRequired": true,
        "publishReady": false
      }
    }'::jsonb,
    updated_at = now()
WHERE stable_key = 'operations';

INSERT INTO ai_company_agents
  (stable_key, department_key, name, level, responsibility, result_definition,
   current_focus, status, executor_type, schedule_text, capabilities, runtime_config, sort_order)
VALUES
  ('xiaohongshu-hotspot-radar', 'operations', '小红书热点雷达 Agent', 'L2',
   '持续读取可追溯的公开信号，核验来源、时间和风险，判断 Shroom 是否拥有独特且可证实的角度，再把合格候选路由到既有栏目；热点本身不是第四个栏目。',
   '带抓取时间、来源类型、有效期、六维评分、硬停止、栏目路由、Shroom 独有判断与 PURSUE / WATCH / REJECT 结论的热点卡。',
   '跟踪 AI 与个人记忆讨论；当前候选只标记为跨平台信号，不冒充小红书官方热点，过期后自动转为常青判断或放弃。',
   'ACTIVE', 'MANUAL', '每日候选扫描；发布前再次核验时效与平台状态',
   '["first-party-trend-check", "source-provenance", "freshness-window", "brand-truth-fit", "safety-hard-stop", "column-routing"]'::jsonb,
   '{
     "canGenerateFinalCopy": false,
     "canPublish": false,
     "canContactUsers": false,
     "canSpend": false,
     "canApproveOwnCandidate": false,
     "readsPrivateDiaries": false,
     "crossPlatformCannotClaimXiaohongshuTrend": true,
     "thresholds": {"pursue": 78, "watch": 62},
     "hardGate": "CONTENT_COMPLIANCE_AND_CEO_APPROVAL"
   }'::jsonb,
   33)
ON CONFLICT (stable_key) DO UPDATE SET
  department_key = EXCLUDED.department_key,
  name = EXCLUDED.name,
  level = EXCLUDED.level,
  responsibility = EXCLUDED.responsibility,
  result_definition = EXCLUDED.result_definition,
  current_focus = EXCLUDED.current_focus,
  status = EXCLUDED.status,
  executor_type = EXCLUDED.executor_type,
  schedule_text = EXCLUDED.schedule_text,
  capabilities = EXCLUDED.capabilities,
  runtime_config = EXCLUDED.runtime_config,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

UPDATE ai_company_agents
SET current_focus = CASE stable_key
      WHEN 'xiaohongshu-content-generator' THEN '用记忆管理员菇的固定声音完成三篇候选稿；热点只改变进入角度，不改变产品事实、栏目结构和互动边界。'
      WHEN 'xiaohongshu-visual-director' THEN '采用 SHROOM_MEMORY_KEEPER_V2：每张封面一个冲突、一个角色动作和一句判断；不再用纯模板冒充品牌识别。'
      WHEN 'xiaohongshu-asset-generator' THEN '维持记忆管理员菇的固定外形、物件和色彩，只生成无字角色场景；产品能力必须使用真实演示截图。'
      WHEN 'xiaohongshu-carousel-renderer' THEN '将角色场景与锁定中文确定性合成 1080×1440 封面；正文仍待真实演示截图，publishReady 保持 false。'
      WHEN 'xiaohongshu-visual-qa' THEN '新增跨篇角色一致性、缩略图停留、系列识别和 AI 素材声明检查；真实截图缺失继续 STOP 发布。'
      WHEN 'content-compliance' THEN '复核热点来源类型、截止时间、社会事件硬停止和跨平台信号表述；禁止把热度当产品证据。'
      ELSE current_focus
    END,
    runtime_config = jsonb_set(
      COALESCE(runtime_config, '{}'::jsonb),
      '{visualAndHotspotVersion}',
      '{
        "visualSystem":"SHROOM_MEMORY_KEEPER_V2",
        "hotspotLayer":"ACTIVE_INTERNAL_ONLY",
        "publicationState":"NOT_PUBLISHED",
        "publishReady":false,
        "canPublish":false,
        "nextGate":"REAL_DEMO_SCREENSHOTS_AND_FINAL_HUMAN_REVIEW"
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key IN (
  'xiaohongshu-content-generator',
  'xiaohongshu-visual-director',
  'xiaohongshu-asset-generator',
  'xiaohongshu-carousel-renderer',
  'xiaohongshu-visual-qa',
  'content-compliance'
);

COMMIT;
