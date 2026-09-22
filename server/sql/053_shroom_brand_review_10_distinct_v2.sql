-- Mark the ten-route Xiaohongshu review batch as the distinct v2 revision after
-- the first visual pass was rejected for text overlap, weak brand color use and
-- insufficient differentiation between routes. Internal review only.
BEGIN;

UPDATE ai_company_departments
SET operating_system = jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(operating_system, '{}'::jsonb),
          '{xiaohongshuBrandReview10,visualSystem}',
          '"SHROOM_BRAND_REVIEW_10_DISTINCT_V2"'::jsonb,
          true
        ),
        '{xiaohongshuBrandReview10,revisionReason}',
        '"首版因文字过挤、主题色不稳定、十套过于同质退回；v2 改为确定性 SVG 十种版式语言。"'::jsonb,
        true
      ),
      '{xiaohongshuBrandReview10,hardGates}',
      '["NO_TEXT_OVERLAP", "USE_SHROOM_BRAND_TOKENS", "TEN_DISTINCT_VISUAL_STRATEGIES", "NOT_PUBLISHED"]'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key = 'operations';

UPDATE ai_company_agents
SET current_focus = CASE stable_key
      WHEN 'shroom-brand-steward' THEN '复核 xhs-brand-review-10-001 distinct v2：文字不得重叠、主视觉必须使用 Shroom 品牌 Token、十张必须体现十种打法，继续保持 NOT_PUBLISHED。'
      WHEN 'xiaohongshu-visual-director' THEN '比较 distinct v2 十种视觉语言：证据戳、档案、证据链、宣言、热点辩题、专业边界、隐私金库、时间线、公开理解拼贴、未来轨道。'
      WHEN 'xiaohongshu-visual-qa' THEN '对 distinct v2 逐张检查缩略图可读性、字距行距、安全区、主题色和十套差异；仍不得批准发布。'
      ELSE current_focus
    END,
    runtime_config = jsonb_set(
      COALESCE(runtime_config, '{}'::jsonb),
      '{brandReview10Revision}',
      '{
        "visualSystem":"SHROOM_BRAND_REVIEW_10_DISTINCT_V2",
        "hardGates":["NO_TEXT_OVERLAP","USE_SHROOM_BRAND_TOKENS","TEN_DISTINCT_VISUAL_STRATEGIES","NOT_PUBLISHED"],
        "publishReady":false,
        "canPublish":false
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key IN (
  'shroom-brand-steward',
  'xiaohongshu-visual-director',
  'xiaohongshu-visual-qa'
);

COMMIT;
