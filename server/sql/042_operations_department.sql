-- Add a reusable department playbook and seed Shroom's operations department.
BEGIN;

ALTER TABLE ai_company_departments
  ADD COLUMN IF NOT EXISTS operating_system jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO ai_company_departments
  (stable_key, name, mission, status, cadence, report_channel, sort_order, operating_system)
VALUES
  ('operations', '运营与获客部门',
   '把已验证的 Shroom 产品价值转化为平台原生内容、真实互动和可归因的新用户激活。',
   'ACTIVE', '每日执行 · 每周复盘 · 每月校准', 'CEO 当前 Codex 任务 + Shroom 管理后台', 20,
   $plan${
     "version": "2026-09-v1",
     "positioning": {
       "category": "AI 人生数据库",
       "promise": "让过去的经历在未来真正帮到你",
       "firstAudience": "愿意长期记录、同时经营多个项目或身份的创作者、创业者、自由职业者",
       "boundary": "不承诺自动改变人生，不把心理和健康线索包装成诊断，不用私密日记换流量"
     },
     "principles": [
       {"title": "先证明，再放大", "description": "每条内容至少包含一个可演示的产品事实、真实过程或明确来源，拒绝空泛 AI 鸡汤。"},
       {"title": "平台原生", "description": "同一核心洞察分别适配图文、短视频和长文，不把一份稿件机械复制到所有平台。"},
       {"title": "系列化而非追热点", "description": "建立可重复栏目，以 28 至 90 天同口径数据判断，不用一次爆款决定方向。"},
       {"title": "获客而非虚荣指标", "description": "曝光和粉丝只作诊断，最终观察有效到访、激活、七日回访和真实对话。"}
     ],
     "channels": [
       {"name": "小红书", "role": "首要发现与搜索入口", "cadence": "每周 3 个原生图文或短视频实验", "content": "真实问题、产品演示、个人数据库方法"},
       {"name": "微信视频号", "role": "创始人信任与熟人传播", "cadence": "每周 2 条原生短视频", "content": "真实经历、产品为何存在、一次具体用法"},
       {"name": "微信公众号", "role": "深度解释与长期内容母库", "cadence": "每周 1 篇深度稿", "content": "长期案例、方法论、版本进展"},
       {"name": "抖音", "role": "第二阶段短视频破圈实验", "cadence": "首月暂不设硬性发布量", "content": "当短视频栏目在视频号得到初步验证后再原生测试"}
     ],
     "phases": [
       {"name": "0—30 天 · 定位与内容证明", "goal": "找到目标用户愿意停留、收藏并进入产品的两类内容", "deliverables": ["建立三个栏目：问问过去的自己、日记如何变成人生数据库、创始人真实开发日志", "所有发布使用独立内容编号和落地路径", "形成小红书与微信生态的同口径基线"]},
       {"name": "31—60 天 · 激活证明", "goal": "让内容带来的目标用户完成第一次真实产品价值体验", "deliverables": ["保留表现最好的两个栏目并持续迭代", "内容只引导一个具体场景，不把流量丢到无差别首页", "观察注册、首篇日记、首次 AI 回看和有效反馈"]},
       {"name": "61—90 天 · 传播复利", "goal": "验证用户是否愿意把真实但可控的产品结果带回外部平台", "deliverables": ["在明确授权下形成用户案例或公开表达", "测试创作者合作与邀请路径", "只有自然转化成立后才向 CEO 申请小额付费放大"]}
     ],
     "workflow": [
       {"step": 1, "name": "信号采集", "owner": "用户洞察与选题 Agent", "output": "目标用户问题、搜索意图、评论和产品反馈，不读取未授权私密日记"},
       {"step": 2, "name": "内容简报", "owner": "运营总管", "output": "一次只定义一个受众、一个问题、一个产品事实和一个下一步"},
       {"step": 3, "name": "证据装配", "owner": "内容主编与制作 Agent", "output": "产品录屏、可核验过程、来源和必要免责声明"},
       {"step": 4, "name": "平台原生制作", "owner": "新媒体运营 Agent", "output": "针对每个平台重写开头、结构、视觉和互动动作"},
       {"step": 5, "name": "事实与合规门禁", "owner": "内容事实与合规 Agent", "output": "隐私、版权、健康表达、AI 标识和产品承诺 PASS 或 STOP"},
       {"step": 6, "name": "CEO 审批", "owner": "CEO", "output": "批准、修改或拒绝公开发布；默认不得自动发布"},
       {"step": 7, "name": "发布与承接", "owner": "新媒体运营 Agent", "output": "记录平台、内容编号、时间、落地路径和真实互动"},
       {"step": 8, "name": "社群转化", "owner": "社群与转化 Agent", "output": "把评论和私信问题变成有帮助的回应与产品场景，不骚扰式追销"},
       {"step": 9, "name": "归因与复盘", "owner": "数据归因与复盘 Agent", "output": "区分曝光、有效到访、激活、七日回访和真实对话"},
       {"step": 10, "name": "保留、调整或停止", "owner": "运营总管", "output": "每周只扩大有证据的栏目，淘汰无目标用户信号的内容"}
     ],
     "metrics": [
       {"name": "目标用户内容信号", "definition": "目标人群的收藏、具体问题、案例反馈或主动转发，不用总互动量代替"},
       {"name": "有效到访", "definition": "通过唯一内容编号进入对应 Shroom 场景的去重访客"},
       {"name": "首次价值激活", "definition": "新用户完成首篇日记并获得一次可理解的 AI 回看"},
       {"name": "七日价值回访", "definition": "激活用户七日内再次记录、回看或询问过去的自己"},
       {"name": "真实对话", "definition": "用户明确描述自己的长期记录问题、使用反馈或合作意向"}
     ],
     "guardrails": [
       "默认不使用任何用户私密日记、健康记录、人脉或位置资料作为选题素材",
       "用户案例必须有逐项授权，撤回后停止后续使用",
       "AI 参与生成或合成的内容按法律和平台要求显式标识",
       "涉及健康和心理只能讲产品观察边界，不冒充医疗专业人士",
       "未经 CEO 明确批准不得自动发布、购买投放、联系达人或代表品牌承诺"
     ]
   }$plan$::jsonb)
ON CONFLICT (stable_key) DO UPDATE SET
  name = EXCLUDED.name,
  mission = EXCLUDED.mission,
  cadence = EXCLUDED.cadence,
  report_channel = EXCLUDED.report_channel,
  sort_order = EXCLUDED.sort_order,
  operating_system = EXCLUDED.operating_system,
  updated_at = now();

INSERT INTO ai_company_agents
  (stable_key, department_key, name, level, responsibility, result_definition, current_focus, status, sort_order)
VALUES
  ('operations-lead', 'operations', '运营总管', 'L1',
   '把增长部门已验证的假设转化为每周唯一获客目标，协调内容、发布、承接和复盘。',
   '至少一个可归因的有效到访、激活或真实对话信号，或一个证据充分的停止结论。',
   '完成首月基线：聚焦小红书与微信生态，验证两个能带来目标用户的内容栏目。', 'ACTIVE', 10),
  ('audience-editorial', 'operations', '用户洞察与选题 Agent', 'L2',
   '从公开搜索、评论、产品反馈和已授权访谈中识别目标用户的真实语言与高频问题。',
   '可追溯的问题库、搜索意图和选题简报，不用模型想象用户需求。',
   '围绕记忆断裂、长期困惑和多项目人生整理首批问题地图。', 'ACTIVE', 20),
  ('new-media-operator', 'operations', '新媒体运营 Agent', 'L2',
   '把同一产品事实改写为小红书、视频号和公众号的原生表达，维护发布节奏和互动承接。',
   '经审批后真实发布的内容、完整内容编号与有效互动，不以生成稿件数量计成绩。',
   '建立问问过去的自己、人生数据库演示、创始人开发日志三个系列。', 'ACTIVE', 30),
  ('content-production', 'operations', '内容主编与制作 Agent', 'L2',
   '把选题简报制作成有开头承诺、真实证据、主体价值和单一行动的图文、短视频与长文。',
   '事实准确、可读可看、可直接审阅的发布候选及其素材来源。',
   '先完成小红书图文模板、竖屏产品演示和公众号深度稿三种母版。', 'ACTIVE', 40),
  ('community-conversion', 'operations', '社群与转化 Agent', 'L2',
   '把评论、私信和外部提问承接到适合的产品场景，帮助而非骚扰式追销。',
   '被回答的真实问题、进入对应场景的有效访客和自愿留下的反馈。',
   '设计评论回复、私信答疑和首篇日记体验的非强迫式路径。', 'ACTIVE', 50),
  ('attribution-learning', 'operations', '数据归因与复盘 Agent', 'L2',
   '维护内容编号、平台数据、落地访问、激活和七日回访口径，识别可重复模式。',
   '按栏目和平台可复核的周报，明确保留、调整和停止。',
   '先建立零基线，不用曝光、点赞或粉丝数冒充获客结果。', 'ACTIVE', 60),
  ('content-compliance', 'operations', '内容事实与合规 Agent', '独立门禁',
   '独立审查隐私授权、事实来源、版权、AI 标识、健康表达和产品承诺。',
   'PASS 或 STOP；STOP 时指出具体问题和最小修改方式。',
   '未授权用户故事、伪造案例、自动发布、无标识 AI 合成内容和医疗诊断默认 STOP。', 'ACTIVE', 70)
ON CONFLICT (stable_key) DO UPDATE SET
  department_key = EXCLUDED.department_key,
  name = EXCLUDED.name,
  level = EXCLUDED.level,
  responsibility = EXCLUDED.responsibility,
  result_definition = EXCLUDED.result_definition,
  current_focus = EXCLUDED.current_focus,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

COMMIT;
