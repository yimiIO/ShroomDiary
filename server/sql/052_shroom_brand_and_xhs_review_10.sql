-- Lock the formal Shroom brand color system and the ten Xiaohongshu review routes
-- into the AI company operations state. This is internal review state only:
-- it grants no publishing, outreach, spending or production-deployment authority.
BEGIN;

UPDATE ai_company_departments
SET operating_system = COALESCE(operating_system, '{}'::jsonb) ||
    '{
      "shroomBrandSystem": {
        "version": "2026-09-18-v1",
        "status": "LOCKED_FOR_REVIEW",
        "coreColors": {
          "myceliumInk": "#172019",
          "livingPaper": "#F1F8E9",
          "memoryLime": "#DDEC8C",
          "warmPaper": "#FFFDF7",
          "evidenceCoral": "#D86246"
        },
        "campaignExtension": {
          "memoryFlash": "#DDEC4A",
          "maxVisualShare": "25%",
          "notProductBaseColor": true
        },
        "iconSourceStatus": "MISSING_SOURCE",
        "tabIconStatus": "LEGACY_GREY_BLACK",
        "nextBrandAssetGate": "APP_ICON_SOURCE_AND_TAB_ICON_MIGRATION"
      },
      "xiaohongshuBrandReview10": {
        "batch": "xhs-brand-review-10-001",
        "publicationState": "NOT_PUBLISHED",
        "publishReady": false,
        "contactSheet": "artifacts/xiaohongshu/shroom-brand-review-10/contact-sheet.png",
        "routes": [
          {"id":"01-evidence-reversal","route":"证据反转","hypothesis":"强冲突让长期记录者理解历史证据价值"},
          {"id":"02-emotional-recognition","route":"情绪识别","hypothesis":"先说出记录很多但调用不了的遗憾"},
          {"id":"03-product-proof","route":"产品证明","hypothesis":"证据链比功能清单更可信"},
          {"id":"04-manifesto","route":"品牌宣言","hypothesis":"边界感比全能承诺更能建立长期信任"},
          {"id":"05-cultural-hotspot","route":"热点判断","hypothesis":"只参与 Shroom 有独特判断的公共讨论"},
          {"id":"06-professional-boundary","route":"专业边界","hypothesis":"主动说不知道建立身心观察可信度"},
          {"id":"07-privacy-position","route":"隐私立场","hypothesis":"个人数据库的控制权可以成为选择理由"},
          {"id":"08-positive-reframe","route":"正向重估","hypothesis":"长期记录能纠正近期失败造成的自我否定"},
          {"id":"09-social-card","route":"轻社交","hypothesis":"公开理解而非公开隐私解释菇卡差异"},
          {"id":"10-future-companion","route":"未来愿景","hypothesis":"克制的 AI 伙伴愿景吸引长期认同者"}
        ],
        "reviewGate": "CEO_CHOOSES_2_OR_3_ROUTES_BEFORE_ANY_PUBLICATION",
        "requiresAiDisclosure": true,
        "requiresRealProductScreenshotsForInnerPages": true
      }
    }'::jsonb,
    updated_at = now()
WHERE stable_key = 'operations';

INSERT INTO ai_company_agents
  (stable_key, department_key, name, level, responsibility, result_definition,
   current_focus, status, executor_type, schedule_text, capabilities, runtime_config, sort_order)
VALUES
  ('shroom-brand-steward', 'operations', 'Shroom 品牌管家 Agent', '独立门禁',
   '维护 Shroom 品牌色、App 图标、官方账号识别资产和对外素材门禁；任何内容发布前检查是否偏离可信个人记忆系统定位。',
   'PASS 或 STOP：色值、对比度、App 图标来源、AI 素材声明、产品截图真实性、未发布状态和品牌识别一致性。',
   '锁定菌丝墨绿、活纸雾绿、记忆黄绿、暖纸白和证据珊瑚；监督 xhs-brand-review-10-001 十套路线内审，正式 App 图标源文件仍为 MISSING_SOURCE。',
   'ACTIVE', 'MANUAL', '每次品牌资产、官方账号图文或 App 图标改动后运行',
   '["brand-token-governance", "contrast-gate", "asset-provenance", "xhs-cover-review", "ai-disclosure-check", "publication-state-gate"]'::jsonb,
   '{
     "canPublish": false,
     "canApproveOwnAssets": false,
     "canChangeProductPaletteWithoutCeoApproval": false,
     "readsPrivateDiaries": false,
     "requiredPublicationStateBeforeApproval": "NOT_PUBLISHED",
     "coreColors": {
       "myceliumInk": "#172019",
       "livingPaper": "#F1F8E9",
       "memoryLime": "#DDEC8C",
       "warmPaper": "#FFFDF7",
       "evidenceCoral": "#D86246"
     }
   }'::jsonb,
   35)
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
      WHEN 'xiaohongshu-visual-director' THEN '根据 SHROOM_BRAND_SYSTEM v1 和 xhs-brand-review-10-001，帮助 CEO 比较十条路线；先判断缩略图停留与品牌识别，不进入发布。'
      WHEN 'xiaohongshu-content-generator' THEN '围绕十条路线生成内页文案时必须保持同一产品事实：保存真实、找回来源、跨时间比较、解释权留给用户。'
      WHEN 'content-compliance' THEN '对十条候选逐条核对隐私、医疗边界、AI 声明、夸大承诺和 NOT_PUBLISHED 状态；没有 CEO 发布批准不得放行。'
      WHEN 'xiaohongshu-visual-qa' THEN '检查 1080×1440 尺寸、缩略图可读性、品牌 Token、Memory Flash 占比和概念示意标签。'
      ELSE current_focus
    END,
    runtime_config = jsonb_set(
      COALESCE(runtime_config, '{}'::jsonb),
      '{brandReview10}',
      '{
        "batch":"xhs-brand-review-10-001",
        "brandSystem":"SHROOM_BRAND_SYSTEM_2026_09_18_V1",
        "publicationState":"NOT_PUBLISHED",
        "publishReady":false,
        "requiresCeoRouteSelection":true,
        "canPublish":false
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key IN (
  'xiaohongshu-visual-director',
  'xiaohongshu-content-generator',
  'content-compliance',
  'xiaohongshu-visual-qa'
);

COMMIT;
