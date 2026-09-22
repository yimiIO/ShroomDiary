-- Add a controlled visual-production pipeline for Xiaohongshu carousels.
-- Image generation may produce illustration assets, but all Chinese copy is
-- rendered deterministically and every final page remains human-reviewed.
BEGIN;

INSERT INTO ai_company_agents
  (stable_key, department_key, name, level, responsibility, result_definition,
   current_focus, status, executor_type, schedule_text, capabilities, runtime_config, sort_order)
VALUES
  ('xiaohongshu-visual-director', 'operations', '小红书视觉导演 Agent', 'L2',
   '把锁定文案拆成逐页视觉目的、阅读顺序、构图、素材类型和连续叙事，不改写已批准事实。',
   '一份逐页 storyboard：每页只完成一个认知任务，并标明文字、视觉、素材来源、禁用元素和安全区。',
   '为 xhs-diary-reuse-001 建立 7 页编辑设计系统，先验证可读性与客群识别，不追逐花哨风格。',
   'ACTIVE', 'MANUAL', '每篇候选稿通过内容门禁后运行',
   '["visual-storyboard", "information-hierarchy", "carousel-continuity", "asset-brief", "safe-zone-design"]'::jsonb,
   '{
     "canRewriteApprovedClaims": false,
     "canPublish": false,
     "readsPrivateDiaries": false,
     "requiresLockedCopy": true,
     "outputAspectRatio": "3:4",
     "pageCount": 7
   }'::jsonb,
   36),
  ('xiaohongshu-asset-generator', 'operations', '小红书视觉素材生成 Agent', 'L2',
   '根据视觉导演的素材简报生成无文字插画、背景、纹理或隐喻画面；产品界面与事实证据必须使用真实截图。',
   '来源可追踪、无文字错字、不伪装产品 UI、不使用真实用户资料的候选视觉素材。',
   '首轮只在确有必要时生成辅助素材；优先使用 Shroom 编辑图形和真实产品证据，减少无关视觉变量。',
   'ACTIVE', 'MANUAL', '仅在 storyboard 明确要求素材时运行',
   '["image-generation", "background-asset", "editorial-illustration", "asset-provenance"]'::jsonb,
   '{
     "canRenderChineseCopy": false,
     "canGenerateProductUi": false,
     "canUsePrivateUserData": false,
     "canPublish": false,
     "requiresAiDisclosure": true,
     "preferredTool": "IMAGE_GENERATION_MODEL"
   }'::jsonb,
   37),
  ('xiaohongshu-carousel-renderer', 'operations', '小红书图文排版 Agent', 'L2',
   '把已批准文字、真实截图和候选素材放入确定性模板，输出尺寸一致、中文准确、可复现的最终图片。',
   '1080×1440 PNG 页面、页面顺序清单、渲染版本和素材清单；任何文字都来自锁定文本而非图片模型。',
   '使用 SVG + Sharp 生成 xhs-diary-reuse-001 七页样稿，并为后续内容复用同一模板。',
   'ACTIVE', 'MANUAL', '视觉与素材齐备后运行',
   '["svg-layout", "deterministic-typesetting", "png-export", "asset-manifest", "render-validation"]'::jsonb,
   '{
     "canRewriteCopy": false,
     "canPublish": false,
     "width": 1080,
     "height": 1440,
     "format": "PNG",
     "textRendering": "DETERMINISTIC",
     "preferredTool": "SVG_SHARP"
   }'::jsonb,
   38),
  ('xiaohongshu-visual-qa', 'operations', '小红书视觉质检 Agent', '独立门禁',
   '独立检查逐页文字、裁切安全区、对比度、字号、顺序、品牌一致性、真实截图与示意图标识、AI 素材声明。',
   'PASS 或 STOP；逐页指出错字、溢出、证据不一致、误导性界面和最小修正方式。',
   '对 xhs-diary-reuse-001 做尺寸、内容和人工视觉检查；未通过不得交给发布角色。',
   'ACTIVE', 'MANUAL', '每次渲染后、发布前运行',
   '["visual-proofreading", "safe-zone-check", "contrast-check", "claim-to-visual-check", "ai-disclosure-check"]'::jsonb,
   '{
     "canModifySource": false,
     "canApproveOwnGeneration": false,
     "canPublish": false,
     "hardGate": true,
     "resultStates": ["PASS", "STOP"]
   }'::jsonb,
   39)
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

COMMIT;
