-- Specialize the operations team for Shroom's first approved Xiaohongshu pilot.
-- This migration records internal approval and role boundaries only. It does not
-- publish content, contact users, create platform automation or enable spending.
BEGIN;

UPDATE ai_company_departments
SET operating_system = jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(operating_system, '{}'::jsonb),
          '{positioning,firstAudience}',
          to_jsonb('已经积累日记、备忘录、语音或文档，却很少有效回看；相似问题再次出现时仍从零回忆和判断的人'::text),
          true
        ),
        '{approvedExperiment}',
        $experiment${
          "key": "xhs-diary-reuse-pilot-001",
          "status": "APPROVED_BY_CEO",
          "approvedAt": "2026-09-18",
          "scope": "3 篇小红书自然图文；不投流、不站外导流、不自动互动",
          "contentCodes": ["xhs-diary-reuse-001", "xhs-diary-reuse-002", "xhs-diary-reuse-003"],
          "publicationState": "NOT_PUBLISHED",
          "successSignal": "目标用户具体描述过去记录无法调用；真实激活需完成首篇日记与首次回看"
        }$experiment$::jsonb,
        true
      ),
      '{version}',
      '"2026-09-v2"'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key = 'operations';

UPDATE ai_company_agents
SET responsibility = '围绕一个明确目标用户和一个真实痛点，协调专业 Agent，把已验证产品事实转成最小、可逆、可归因的渠道实验。',
    result_definition = '至少一条可复核的目标用户具体表达、一项合规激活，或一个证据充分的 STOP / UNKNOWN 结论。',
    current_focus = '执行已批准的 xhs-diary-reuse-pilot-001；保持同一客群，只比较痛点、机制和信任三个证据角度。',
    executor_type = 'MANUAL',
    capabilities = '["campaign-brief", "audience-fit-gate", "experiment-design", "agent-handoff", "decision-escalation"]'::jsonb,
    runtime_config = '{
      "autonomy": "INTERNAL_ONLY",
      "canPublish": false,
      "canContactUsers": false,
      "canSpend": false,
      "requiresCompliancePass": true,
      "requiresCeoApproval": true,
      "primaryMetrics": ["target-user-language", "effective-visit", "first-value-activation", "seven-day-return"]
    }'::jsonb,
    updated_at = now()
WHERE stable_key = 'operations-lead';

INSERT INTO ai_company_agents
  (stable_key, department_key, name, level, responsibility, result_definition,
   current_focus, status, executor_type, schedule_text, capabilities, runtime_config, sort_order)
VALUES
  ('xiaohongshu-signal-analyst', 'operations', '小红书目标用户信号分析 Agent', 'L2',
   '登记每篇内容的唯一假设和变量，区分分发、目标用户表达、产品激活和噪声，并输出 CONTINUE / ITERATE / STOP / UNKNOWN。',
   '可追溯的目标用户语言、证据评分、干扰项和停止结论；不以曝光、点赞、收藏或所谓爆文概率冒充需求验证。',
   '分析 xhs-diary-reuse-001 至 003；三篇固定客群、形式和互动问题，只比较主要证据角度。',
   'ACTIVE', 'MANUAL', '每篇发布前登记；发布后 2h / 24h / 72h / 7d 分析',
   '["public-signal-research", "audience-fit-scoring", "variable-control", "noise-exclusion", "content-postmortem"]'::jsonb,
   '{
     "canGenerateFinalCopy": false,
     "canPublish": false,
     "canApproveOwnAnalysis": false,
     "readsPrivateDiaries": false,
     "resultStates": ["CONTINUE", "ITERATE", "STOP", "UNKNOWN"],
     "hardGate": "CONTENT_COMPLIANCE"
   }'::jsonb,
   32),
  ('xiaohongshu-content-generator', 'operations', '小红书内容生成 Agent', 'L2',
   '把锁定后的实验简报与已验证证据转成小红书原生候选稿，不改变客群、产品承诺、事实状态或实验变量。',
   '包含封面、7 页脚本、正文、标签、单一互动问题、逐页素材来源、AI 标识、风险与停止条件的可审阅候选稿。',
   '完成 xhs-diary-reuse-001 至 003 的受控发布包；所有画面只使用已验证功能和明确标注的演示数据。',
   'ACTIVE', 'MANUAL', '只按已批准实验简报运行',
   '["xiaohongshu-carousel", "caption-drafting", "headline-variants", "visual-brief", "ai-disclosure"]'::jsonb,
   '{
     "canPublish": false,
     "canReply": false,
     "canScoreOwnContent": false,
     "readsPrivateDiaries": false,
     "requiresLockedBrief": true,
     "requiresVerifiedEvidence": true,
     "requiresCompliancePass": true,
     "requiresHumanFinalReview": true
   }'::jsonb,
   34)
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
