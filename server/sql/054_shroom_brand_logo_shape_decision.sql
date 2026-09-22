-- Record the brand steward decision that formal logo shape outranks the
-- temporary Xiaohongshu mushroom character, and that campaign backgrounds use
-- Brand Paper #E9F1E1. Internal governance state only.
BEGIN;

UPDATE ai_company_departments
SET operating_system = jsonb_set(
      jsonb_set(
        COALESCE(operating_system, '{}'::jsonb),
        '{shroomBrandSystem,brandPaper}',
        '"#E9F1E1"'::jsonb,
        true
      ),
      '{shroomBrandSystem,logoShapeDecision}',
      '{
        "decidedAt": "2026-09-18",
        "priority": "FORMAL_LOGO_SOURCE_OVERRIDES_TEMPORARY_MUSHROOM_CHARACTER",
        "appIconSourceStatus": "MISSING_SOURCE",
        "campaignBackground": "#E9F1E1",
        "temporaryCharacterStatus": "PAUSED_AS_FORMAL_IP",
        "allowedBeforeLogoSource": [
          "FACELESS_MUSHROOM_SILHOUETTE",
          "MEMORY_CARD",
          "EVIDENCE_LINE",
          "ARCHIVE_BOX"
        ],
        "forbiddenBeforeLogoSource": [
          "PROMOTING_SMALL_FACE_MUSHROOM_AS_OFFICIAL_LOGO",
          "LET_TEMPORARY_CHARACTER_OVERRIDE_APP_ICON",
          "PUBLIC_CLAIM_THAT_CHARACTER_IS_FINAL_IP"
        ]
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key = 'operations';

UPDATE ai_company_agents
SET current_focus = CASE stable_key
      WHEN 'shroom-brand-steward' THEN '执行 logo 形状优先规则：正式 logo 源文件缺失前，小脸蘑菇不能作为官方固定 IP；宣发底色优先使用 Brand Paper #E9F1E1。'
      WHEN 'xiaohongshu-visual-director' THEN '官方号封面使用无脸菇形轮廓、记忆卡片、证据线和档案物件；不要把临时小脸蘑菇做成品牌中心。'
      WHEN 'xiaohongshu-visual-qa' THEN '新增检查：背景是否使用 Brand Paper #E9F1E1，是否误把临时蘑菇角色当 logo，是否与正式 App 图标源文件状态冲突。'
      ELSE current_focus
    END,
    runtime_config = jsonb_set(
      COALESCE(runtime_config, '{}'::jsonb),
      '{logoShapeDecision}',
      '{
        "campaignBackground":"#E9F1E1",
        "formalLogoSourceStatus":"MISSING_SOURCE",
        "temporaryMushroomCharacterStatus":"PAUSED_AS_FORMAL_IP",
        "canUseFacelessMushroomSilhouette":true,
        "canUseSmallFaceMushroomAsOfficialLogo":false,
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
