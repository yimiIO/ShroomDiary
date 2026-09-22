-- Record the Shroom mascot IP agent decision.
-- Mascot IP is for social growth and content acting; it is separate from the formal trademark logo.
BEGIN;

UPDATE ai_company_departments
SET operating_system = jsonb_set(
      COALESCE(operating_system, '{}'::jsonb),
      '{shroomMascotIp}',
      '{
        "batch":"shroom-mascot-ip-v1",
        "decidedAt":"2026-09-18",
        "status":"INTERNAL_REVIEW_NOT_PUBLISHED",
        "roleName":"记忆管理员菇",
        "workingNickname":"小菇",
        "principle":"MASCOT_IP_SEPARATE_FROM_TRADEMARK_LOGO",
        "primaryBase":"memory-detective-mushroom",
        "socialMode":"diary-gremlin-mushroom",
        "trustMode":"calm-archivist-mushroom",
        "actionMode":"growth-sprint-mushroom",
        "asset":"artifacts/brand/shroom-mascot-ip-v1/mascot-directions-2x2.png",
        "publishReady":false,
        "fixedBehaviors":["找","对","问","停","推"],
        "mustAvoid":[
          "GENERIC_SMILING_MUSHROOM_STANDING_STILL",
          "DUOLINGO_OWL_SIMILARITY",
          "GAME_CHARACTER_PLAGIARISM",
          "MEDICAL_DOCTOR_PERSONA",
          "CUTE_WITHOUT_PRODUCT_BEHAVIOR"
        ]
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key = 'operations';

UPDATE ai_company_agents
SET current_focus = CASE stable_key
      WHEN 'shroom-brand-steward' THEN '品牌分层更新：正式 logo 继续走商标结构，小红书/公众号卡通 IP 走“记忆管理员菇”；两者共享颜色和记忆结构但不能混为一个资产。'
      WHEN 'xiaohongshu-visual-director' THEN '官方号视觉改为卡通 IP 驱动：小菇必须有表情、动作和产品行为；优先深化记忆侦探菇和日记捣蛋菇。'
      WHEN 'xiaohongshu-visual-qa' THEN '新增 IP QA：画面必须能看出小菇在找、对、问、停或推；不能只是普通蘑菇站着笑，不能像多邻国猫头鹰或游戏角色抄袭。'
      WHEN 'content-compliance' THEN '卡通 IP 可以拟人化表达，但不得做医学诊断、不得暗示 AI 比用户更懂用户、不得复制第三方角色。'
      ELSE current_focus
    END,
    runtime_config = jsonb_set(
      COALESCE(runtime_config, '{}'::jsonb),
      '{mascotIp}',
      '{
        "batch":"shroom-mascot-ip-v1",
        "status":"INTERNAL_REVIEW_NOT_PUBLISHED",
        "roleName":"记忆管理员菇",
        "workingNickname":"小菇",
        "principle":"MASCOT_IP_SEPARATE_FROM_TRADEMARK_LOGO",
        "primaryBase":"memory-detective-mushroom",
        "socialMode":"diary-gremlin-mushroom",
        "trustMode":"calm-archivist-mushroom",
        "actionMode":"growth-sprint-mushroom",
        "fixedBehaviors":["找","对","问","停","推"],
        "canPublish":false
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key IN (
  'shroom-brand-steward',
  'xiaohongshu-visual-director',
  'xiaohongshu-visual-qa',
  'content-compliance'
);

COMMIT;
