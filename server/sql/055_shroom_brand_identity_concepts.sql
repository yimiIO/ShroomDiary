-- Record the Shroom brand identity agent's trademark-grade concept batch.
-- This is internal governance state only, not trademark legal advice.
BEGIN;

UPDATE ai_company_departments
SET operating_system = jsonb_set(
      COALESCE(operating_system, '{}'::jsonb),
      '{shroomBrandIdentityConcepts}',
      '{
        "batch":"shroom-identity-concepts-001",
        "decidedAt":"2026-09-18",
        "status":"INTERNAL_REVIEW_NOT_TRADEMARK_ADVICE",
        "principle":"AVATAR_KINSHIP_PLUS_DISTINCTIVE_MEMORY_STRUCTURE",
        "recommendedMain":"02-shroom-s-negative-space",
        "recommendedIconCandidate":"05-folded-card-mushroom",
        "recommendedDefensiveBackup":"06-seal-monogram",
        "contactSheet":"artifacts/brand/shroom-identity-concepts/contact-sheet.png",
        "requiresProfessionalTrademarkSearch":true,
        "classesToSearch":["9","35","38","41","42"],
        "forbiddenAsFinalMark":[
          "GENERIC_MUSHROOM_ONLY",
          "DIARY_CARD_ONLY",
          "AI_CHAT_BUBBLE_ONLY",
          "SMALL_FACE_MUSHROOM_AS_FORMAL_IP"
        ]
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key = 'operations';

UPDATE ai_company_agents
SET current_focus = CASE stable_key
      WHEN 'shroom-brand-steward' THEN '品牌形象进入商标级内审：主推 02 S 形负空间，05 折角卡片菇作为 App icon 候选，06 印章式 S 菇作为防御备选；小脸蘑菇不能作为正式品牌形象。'
      WHEN 'xiaohongshu-visual-director' THEN '所有官方号视觉先贴合 shroom-identity-concepts-001：使用 Brand Paper、菌丝墨绿与记忆黄绿；图形必须保留菇形亲缘，并加入 S 形负空间、折角或记忆缺口。'
      WHEN 'xiaohongshu-visual-qa' THEN '新增视觉 QA：不能使用普通蘑菇、日记本或 AI 气泡作为主标；不能把小脸蘑菇当 logo；必须标记内部审核未发布。'
      WHEN 'content-compliance' THEN '品牌形象稿件需标注为内部设计探索；不得承诺商标可注册，正式商标需专业近似检索与申请评估。'
      ELSE current_focus
    END,
    runtime_config = jsonb_set(
      COALESCE(runtime_config, '{}'::jsonb),
      '{brandIdentityConcepts}',
      '{
        "batch":"shroom-identity-concepts-001",
        "status":"INTERNAL_REVIEW_NOT_TRADEMARK_ADVICE",
        "principle":"AVATAR_KINSHIP_PLUS_DISTINCTIVE_MEMORY_STRUCTURE",
        "recommendedShortlist":[
          "02-shroom-s-negative-space",
          "05-folded-card-mushroom",
          "06-seal-monogram"
        ],
        "recommendedMain":"02-shroom-s-negative-space",
        "recommendedIconCandidate":"05-folded-card-mushroom",
        "recommendedDefensiveBackup":"06-seal-monogram",
        "canPublish":false,
        "requiresProfessionalTrademarkSearch":true,
        "forbiddenAsFinalMark":[
          "GENERIC_MUSHROOM_ONLY",
          "DIARY_CARD_ONLY",
          "AI_CHAT_BUBBLE_ONLY",
          "SMALL_FACE_MUSHROOM_AS_FORMAL_IP"
        ]
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
