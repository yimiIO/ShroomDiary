-- Persist the CEO-approved first official-account column experiment.
-- This is an approved natural-content test plan, not autonomous publishing
-- authority. Final product screenshots and platform AI labels remain manual gates.
BEGIN;

UPDATE ai_company_departments
SET operating_system = jsonb_set(
      COALESCE(operating_system, '{}'::jsonb),
      '{xiaohongshuFirstColumnExperiment}',
      '{
        "experimentId":"xhs-shroom-columns-001",
        "decision":"APPROVED",
        "accountModel":"SINGLE_OFFICIAL_WITH_COLUMNS",
        "publicationState":"NOT_PUBLISHED",
        "paidTraffic":false,
        "externalRedirect":false,
        "automatedInteraction":false,
        "posts":[
          {"contentCode":"xhs-past-helps-today-001","column":"过去怎样在今天帮到我","status":"ASSET_DRAFT_READY"},
          {"contentCode":"xhs-one-diary-finds-001","column":"一条日记能发现什么","status":"ASSET_DRAFT_READY"},
          {"contentCode":"xhs-building-shroom-001","column":"做菇的人","status":"ASSET_DRAFT_READY"}
        ],
        "sharedQuestion":"如果能从过去的记录里重新找到一件事，你最想弄明白什么？",
        "observationWindows":["2h","24h","72h","7d"],
        "resultStates":["VERIFIED","REPEATABLE_SIGNAL","REAL_WORLD","UNKNOWN","NONE","STOP"],
        "visualQa":"PASS",
        "contentEvidenceGate":"PENDING_REAL_DEMO_SCREENSHOTS",
        "publishReady":false,
        "canPublishAutonomously":false,
        "brief":"docs/XIAOHONGSHU_PILOT_001.md"
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key = 'operations';

UPDATE ai_company_agents
SET current_focus = CASE stable_key
      WHEN 'xiaohongshu-content-generator' THEN '按三个固定栏目维护首轮稿件，不再用三篇重复讲同一个痛点；统一客群、讨论问题和观察窗。'
      WHEN 'xiaohongshu-visual-director' THEN '首轮三套 7 页样稿已通过版式检查；下一步只补演示账号真实产品截图和来源标识。'
      WHEN 'xiaohongshu-carousel-renderer' THEN '已确定性渲染三套 1080×1440 图文；保持 publishReady=false，直至真实演示截图补齐。'
      WHEN 'xiaohongshu-visual-qa' THEN '三套样稿视觉 PASS；继续阻断缺少演示账号真实产品截图的对外发布。'
      WHEN 'content-compliance' THEN '首轮三篇方法与文案 PASS；发布前逐页复核演示数据标识、身心非诊断说明和平台 AI 声明。'
      ELSE current_focus
    END,
    runtime_config = jsonb_set(
      COALESCE(runtime_config, '{}'::jsonb),
      '{activeExperiment}',
      '{
        "id":"xhs-shroom-columns-001",
        "decision":"APPROVED",
        "publicationState":"NOT_PUBLISHED",
        "contentCodes":["xhs-past-helps-today-001","xhs-one-diary-finds-001","xhs-building-shroom-001"],
        "canPublish":false,
        "nextGate":"REAL_DEMO_SCREENSHOTS_AND_FINAL_HUMAN_REVIEW"
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key IN (
  'xiaohongshu-content-generator',
  'xiaohongshu-visual-director',
  'xiaohongshu-carousel-renderer',
  'xiaohongshu-visual-qa',
  'content-compliance'
);

COMMIT;
