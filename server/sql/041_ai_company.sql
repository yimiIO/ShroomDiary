-- Shroom AI company management and governance storage.
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role varchar(24) NOT NULL DEFAULT 'USER';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('USER', 'ADMIN'));

CREATE TABLE IF NOT EXISTS ai_company_departments (
    stable_key varchar(80) PRIMARY KEY,
    name varchar(120) NOT NULL,
    mission text NOT NULL DEFAULT '',
    status varchar(24) NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')),
    cadence varchar(120) NOT NULL DEFAULT '',
    report_channel varchar(160) NOT NULL DEFAULT '',
    sort_order smallint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_company_agents (
    stable_key varchar(80) PRIMARY KEY,
    department_key varchar(80) NOT NULL REFERENCES ai_company_departments(stable_key) ON DELETE CASCADE,
    name varchar(120) NOT NULL,
    level varchar(40) NOT NULL,
    responsibility text NOT NULL DEFAULT '',
    result_definition text NOT NULL DEFAULT '',
    current_focus text NOT NULL DEFAULT '',
    status varchar(24) NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE', 'PAUSED', 'BLOCKED')),
    last_result_state varchar(24)
      CHECK (last_result_state IS NULL OR last_result_state IN ('OUTPUT', 'VERIFIED', 'REAL_WORLD', 'NONE')),
    last_run_at timestamptz,
    sort_order smallint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_company_agents_department_idx
  ON ai_company_agents(department_key, sort_order);

CREATE TABLE IF NOT EXISTS ai_company_runs (
    id uuid PRIMARY KEY,
    department_key varchar(80) NOT NULL REFERENCES ai_company_departments(stable_key) ON DELETE CASCADE,
    run_date date NOT NULL,
    bottleneck text NOT NULL DEFAULT '',
    completed_work text NOT NULL DEFAULT '',
    evidence text NOT NULL DEFAULT '',
    flywheel_stage varchar(32) NOT NULL
      CHECK (flywheel_stage IN ('PRIVATE_VALUE', 'EXPRESSION', 'REACH', 'INVITATION', 'OUTCOME', 'REVENUE', 'SAFETY')),
    result_state varchar(24) NOT NULL
      CHECK (result_state IN ('OUTPUT', 'VERIFIED', 'REAL_WORLD', 'NONE')),
    safety_status varchar(16) NOT NULL
      CHECK (safety_status IN ('PASS', 'STOP')),
    next_step text NOT NULL DEFAULT '',
    source varchar(24) NOT NULL DEFAULT 'MANUAL'
      CHECK (source IN ('MANUAL', 'AUTOMATION', 'SYSTEM')),
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (department_key, run_date)
);
CREATE INDEX IF NOT EXISTS ai_company_runs_department_date_idx
  ON ai_company_runs(department_key, run_date DESC);

CREATE TABLE IF NOT EXISTS ai_company_decisions (
    id uuid PRIMARY KEY,
    department_key varchar(80) NOT NULL REFERENCES ai_company_departments(stable_key) ON DELETE CASCADE,
    run_id uuid REFERENCES ai_company_runs(id) ON DELETE SET NULL,
    title varchar(200) NOT NULL,
    why_now text NOT NULL DEFAULT '',
    options jsonb NOT NULL DEFAULT '[]'::jsonb,
    recommendation text NOT NULL DEFAULT '',
    impact_if_deferred text NOT NULL DEFAULT '',
    due_at timestamptz,
    status varchar(24) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'ADJUSTED', 'DEFERRED')),
    resolution_note text NOT NULL DEFAULT '',
    resolved_at timestamptz,
    resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_company_decisions_status_idx
  ON ai_company_decisions(status, due_at, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ai_company_decisions_run_title_idx
  ON ai_company_decisions(run_id, title)
  WHERE run_id IS NOT NULL;

INSERT INTO ai_company_departments
  (stable_key, name, mission, status, cadence, report_channel, sort_order)
VALUES
  ('growth-compounding', '用户增长与复利部门',
   '逐步验证并实现“私人真实 → 真实表达 → 外部互动 → 共同成果 → 新的可信证据”增长飞轮。',
   'ACTIVE', '每天一次 · 10:00 Asia/Shanghai', 'CEO 当前 Codex 任务 + Shroom 管理后台', 10)
ON CONFLICT (stable_key) DO NOTHING;

INSERT INTO ai_company_agents
  (stable_key, department_key, name, level, responsibility, result_definition, current_focus, status, sort_order)
VALUES
  ('growth-lead', 'growth-compounding', '增长与复利总管', 'L1',
   '识别每天唯一最大瓶颈，组织专业角色并选择最小可验证动作。',
   '一项 VERIFIED / REAL_WORLD 结果，或一个证据充分的停止结论。',
   '先推进真实表达包，再验证公开活档案和共同成果确认。', 'ACTIVE', 10),
  ('user-value', 'growth-compounding', '用户价值 Agent', 'L2',
   '验证过去的数据是否在正确时机真正帮助用户，而不是追求记录量。',
   '重复使用、有帮助反馈、问题解决或明确的体验修正。',
   '为私人价值飞轮建立可观测信号和基线。', 'ACTIVE', 20),
  ('authentic-expression', 'growth-compounding', '真实表达 Agent', 'L2',
   '从用户已授权的真实记录生成保留本人语气、可追溯的公开候选。',
   '用户实际采纳、编辑并公开的表达，而不是生成稿数量。',
   '定义真实表达包的来源、结构、授权和采纳事件。', 'ACTIVE', 30),
  ('living-profile', 'growth-compounding', '分发与活档案 Agent', 'L2',
   '让外部访客在不读取隐私的情况下理解用户并产生下一步互动。',
   '公开档案访问转化为提问、关注、连接或注册。',
   '设计公开活档案最小版本和外部访问漏斗。', 'ACTIVE', 40),
  ('relationship-trust', 'growth-compounding', '关系与信任 Agent', 'L2',
   '围绕具体共同经历和结果设计邀请、回应与双方确认。',
   '对方完成的邀请、双方确认的事实以及后续真实机会。',
   '设计一个合作成果确认切片，禁止全局信用评分。', 'ACTIVE', 50),
  ('experiment-data', 'growth-compounding', '实验与数据 Agent', 'L2',
   '定义假设、事件、基线、成功条件和停止条件，验证飞轮是否真的转动。',
   '可重复核验的漏斗与结论，明确 OUTPUT、VERIFIED 和 REAL_WORLD。',
   '建立采纳、公开、访问、互动、邀请、确认和付费的分层口径。', 'ACTIVE', 60),
  ('privacy-safety', 'growth-compounding', '隐私与安全 Agent', '独立门禁',
   '审查默认私密、明确授权、最小披露、撤回、敏感推断和外部动作。',
   'PASS 或 STOP；STOP 时提供最小修正路径并向 CEO 升级。',
   '自动发布、健康诊断、信用评分和私密数据默认公开一律 STOP。', 'ACTIVE', 70)
ON CONFLICT (stable_key) DO NOTHING;

COMMIT;
