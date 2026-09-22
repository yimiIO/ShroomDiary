-- Persist the Shroom-specific official account learning pool.
-- This is research configuration only: no publishing, messaging or scraping.
BEGIN;

UPDATE ai_company_agents
SET current_focus = '对 10 个 Shroom 适配官方账号进行笔记级审计；每次只提取一个可迁移机制，不复制行业资产或把账号增长写成创意因果。',
    runtime_config = jsonb_set(
      COALESCE(runtime_config, '{}'::jsonb),
      '{benchmarkAccounts}',
      '[
        {"account":"多邻国 Duolingo","module":"IP_PERSONA","priority":"A"},
        {"account":"Apple","module":"PRODUCT_EVIDENCE","priority":"A"},
        {"account":"蚂蚁森林","module":"LONG_TERM_ACCUMULATION","priority":"A"},
        {"account":"TapNow","module":"SOCIAL_RETURN","priority":"A"},
        {"account":"种草学习薯","module":"PLATFORM_NATIVE_EDUCATION","priority":"A"},
        {"account":"百度地图","module":"MOMENT_BASED_FEATURE","priority":"B"},
        {"account":"支付宝","module":"HUMAN_OFFICIAL_VOICE","priority":"B"},
        {"account":"滴滴","module":"HUMAN_STORY","priority":"B"},
        {"account":"丁香园","module":"PROFESSIONAL_TRUST","priority":"B"},
        {"account":"寿司郎","module":"BRAND_PERSONALITY","priority":"B"}
      ]'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key = 'xiaohongshu-signal-analyst';

UPDATE ai_company_departments
SET operating_system = jsonb_set(
      COALESCE(operating_system, '{}'::jsonb),
      '{xiaohongshuBenchmarkAccounts}',
      '{
        "status":"VERIFIED_ACCOUNT_LEVEL",
        "cutoff":"2026-09-18",
        "count":10,
        "report":"docs/XIAOHONGSHU_SHROOM_BENCHMARK_ACCOUNTS.md",
        "nextGate":"DIRECT_NOTE_AUDIT"
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key = 'operations';

COMMIT;
