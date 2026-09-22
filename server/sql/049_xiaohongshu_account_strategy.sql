-- Refine the active benchmark pool after Shroom-fit research and persist the
-- first 12-week account architecture. Research configuration only: no account
-- creation, publishing, messaging or paid traffic is authorized here.
BEGIN;

UPDATE ai_company_agents
SET current_focus = '先对 flomo、Apple、百度地图、蚂蚁森林和多邻国完成笔记级机制审计；同时用 Shroom 主号前 12 周真实数据验证单主号三栏目，不创建功能专题分号。',
    runtime_config = jsonb_set(
      jsonb_set(
        COALESCE(runtime_config, '{}'::jsonb),
        '{benchmarkAccounts}',
        '[
          {"account":"flomo 浮墨笔记","module":"CATEGORY_NEAREST_CONTENT_SYSTEM","priority":"A"},
          {"account":"Apple","module":"PRODUCT_EVIDENCE","priority":"A"},
          {"account":"百度地图","module":"MOMENT_BASED_FEATURE","priority":"A"},
          {"account":"蚂蚁森林","module":"LONG_TERM_ACCUMULATION","priority":"A"},
          {"account":"多邻国 Duolingo","module":"IP_PERSONA","priority":"A"},
          {"account":"种草学习薯","module":"PLATFORM_NATIVE_EDUCATION","priority":"B"},
          {"account":"TapNow","module":"SOCIAL_RETURN","priority":"B"},
          {"account":"丁香园","module":"PROFESSIONAL_BOUNDARY","priority":"B"},
          {"account":"支付宝","module":"HUMAN_OFFICIAL_VOICE","priority":"B"},
          {"account":"滴滴","module":"HUMAN_STORY","priority":"B"}
        ]'::jsonb,
        true
      ),
      '{deepResearchDecision}',
      '{
        "status":"VERIFIED_STRATEGY_OUTPUT",
        "report":"docs/XIAOHONGSHU_DEEP_RESEARCH_AND_ACCOUNT_STRATEGY.md",
        "accountModel":"SINGLE_OFFICIAL_WITH_COLUMNS",
        "optionalLater":"FOUNDER_PERSONAL_ACCOUNT",
        "removedFromActivePool":["寿司郎"],
        "nextGate":"DIRECT_NOTE_MECHANISM_AUDIT"
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key = 'xiaohongshu-signal-analyst';

UPDATE ai_company_departments
SET operating_system = jsonb_set(
      COALESCE(operating_system, '{}'::jsonb),
      '{xiaohongshuAccountStrategy}',
      '{
        "status":"DECIDED_FOR_FIRST_12_WEEKS",
        "model":"SINGLE_OFFICIAL_WITH_COLUMNS",
        "mainAccountRole":"SHROOM_BRAND_OFFICIAL",
        "profilePromise":"让过去的经历，在需要时真正帮到你。",
        "columns":[
          {"name":"过去怎样在今天帮到我","share":50},
          {"name":"一条日记能发现什么","share":30},
          {"name":"做菇的人","share":20}
        ],
        "doNotCreateTopicAccounts":["身心记录","人生OS","菇卡","未解之问","日记技巧","产品更新"],
        "optionalLater":"FOUNDER_PERSONAL_ACCOUNT",
        "reviewGate":{"minimumWeeks":12,"minimumOriginalPosts":36,"distinctAudienceWeeks":6,"independentSupplyWeeks":8,"minimumPostsPerWeek":2},
        "requiresCeoDecisionToSplit":true,
        "canCreateAccounts":false,
        "canPublish":false,
        "report":"docs/XIAOHONGSHU_DEEP_RESEARCH_AND_ACCOUNT_STRATEGY.md"
      }'::jsonb,
      true
    ),
    updated_at = now()
WHERE stable_key = 'operations';

COMMIT;

