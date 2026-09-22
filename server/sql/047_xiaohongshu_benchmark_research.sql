-- Upgrade the existing Xiaohongshu analyst instead of creating a duplicate agent.
-- This records a repeatable public benchmark workflow. It does not scrape private
-- data, publish content, contact users or enable autonomous platform actions.
BEGIN;

-- Keep this specialized migration deployable when the formal admin-console
-- migration has not reached an older environment yet. The later migration uses
-- the same names and ADD COLUMN IF NOT EXISTS, so the two remain compatible.
ALTER TABLE ai_company_agents
  ADD COLUMN IF NOT EXISTS executor_type varchar(32) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS schedule_text varchar(160) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS runtime_config jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE ai_company_agents
SET name = '小红书标杆与目标用户信号分析 Agent',
    responsibility = '分开执行官方账号标杆研究与 Shroom 内容实验复盘：验证哪些账号和内容在今年仍持续获得真实流量信号，再判断可迁移机制；不得把粉丝量、单次榜单或案例文章当成爆文结论。',
    result_definition = '带来源、观察日期、时间序列、证据等级和不确定性的标杆清单，以及对 Shroom 可迁移/不可迁移机制；单篇爆文结论必须经过笔记级直接审计。',
    current_focus = '建立 2026 年官方账号持续流量基准库；首轮只确认 Apple 为 CURRENT_SUSTAINED，其他账号保持 YEAR_REPEAT、RECENT_REPEAT 或 WATCHLIST，等待最新窗口或笔记级证据。',
    status = 'ACTIVE',
    executor_type = 'MANUAL',
    schedule_text = '运营期每周一次标杆增量扫描；Shroom 内容发布后 2h / 24h / 72h / 7d 复盘',
    capabilities = '[
      "public-signal-research",
      "benchmark-account-research",
      "note-cohort-verification",
      "temporal-validation",
      "source-ledger",
      "audience-fit-scoring",
      "variable-control",
      "noise-exclusion",
      "content-postmortem"
    ]'::jsonb,
    runtime_config = '{
      "researchModes": ["ACCOUNT_BENCHMARK", "POST_EVALUATION"],
      "benchmarkGate": {
        "officialIdentityRequired": true,
        "minimumDistinctMonths": 3,
        "minimumRecentConsecutiveWindows": 2,
        "maximumRecentSnapshotAgeDays": 14,
        "requiresSourceUrl": true,
        "requiresVisibleMetricSnapshot": true,
        "noteLevelClaimsRequireDirectNoteAudit": true,
        "thirdPartyRankingsProveAccountTrendOnly": true
      },
      "evidenceGrades": ["CURRENT_SUSTAINED", "YEAR_REPEAT", "RECENT_REPEAT", "WATCHLIST"],
      "canGenerateFinalCopy": false,
      "canPublish": false,
      "canApproveOwnAnalysis": false,
      "readsPrivateDiaries": false,
      "requiresCompliancePass": true,
      "resultStates": ["CONTINUE", "ITERATE", "STOP", "UNKNOWN"]
    }'::jsonb,
    updated_at = now()
WHERE stable_key = 'xiaohongshu-signal-analyst';

UPDATE ai_company_departments
SET operating_system = jsonb_set(
      COALESCE(operating_system, '{}'::jsonb),
      '{xiaohongshuBenchmarkResearch}',
      '{
        "status": "ACTIVE_MANUAL",
        "cadence": "WEEKLY",
        "researchCutoff": "2026-09-18",
        "verifiedCurrentAccounts": ["Apple"],
        "report": "docs/XIAOHONGSHU_BENCHMARK_RESEARCH.md",
        "rule": "账号趋势与单篇爆文分开验证；无笔记级直接证据不下爆文结论"
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key = 'operations';

COMMIT;
