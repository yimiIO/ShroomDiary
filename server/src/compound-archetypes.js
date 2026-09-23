'use strict';

const CATALOG_VERSION = '2026-09-18-v5';

const DEFAULT_SETUP = Object.freeze({
  titleLabel: '这项积累在你的生活里叫什么？',
  titlePlaceholder: '例如：让专业能力能解决更难的真实问题',
  commitmentLabel: '你准备持续投入什么？',
  commitmentPlaceholder: '写一种能反复发生的投入，不用解释复利理论',
  outcomeLabel: '首个观察周期结束时，你希望能观察或感受到什么？',
  outcomePlaceholder: '写一个能亲自核对的变化，也可以是一种反复出现的真实感受',
  nextStepLabel: '下一次最小的具体动作是什么？',
  nextStepPlaceholder: '写下离开页面后就能开始的一步',
  reinvestmentSummary: '系统会在进展回看时确认，真实回报是否进入了下一轮。',
  reinvestmentDefinition: '已经确认的复用、节省或回报，会由用户安排进入下一轮投入。',
  weeklyTimeBudgetMinutes: 120,
  principalMetricTarget: 4,
  returnMetricTarget: 1,
  defaultCycleWeeks: 12,
  currentMilestone: '四周内完成第一轮真实投入，并留下可以核对的结果'
});

function starterPlan(key, title, summary, observableEvidence, feltChange, firstStep, cycleWeeks = 12, extra = {}) {
  return Object.freeze({ key, title, summary, observableEvidence, feltChange, firstStep, cycleWeeks, ...extra });
}

const STARTER_PLANS_BY_KEY = Object.freeze({
  capability_feedback: [
    starterPlan('real_work_skill', '把一项工作能力练稳定', '在重复出现的真实任务里练同一项关键能力，并接受外部反馈。', '同类任务连续完成 3 次，返工次数减少，别人能指出你稳定做对了什么。', '面对同类任务不再慌乱，能解释自己的选择，也更容易发现错误。', '选一个本周会真实发生的任务，写下要练的一个动作。', 8, { principalDefinition: '每周在真实任务中练习一次关键能力，并获得一次可核对反馈', desiredOutcome: '同类任务连续完成 3 次，返工减少；我能更从容地解释自己的选择', principalMetricName: '真实练习与反馈', principalMetricTarget: 8, returnMetricName: '稳定迁移到新任务', returnMetricTarget: 3 }),
    starterPlan('sport_technique', '让一项运动技术变得稳定', '用录像、教练或训练结果反复校正一个关键动作。', '录像或教练连续 3 次看到关键动作稳定出现，失误后也能恢复。', '动作更顺、更省力，注意力能从“怎么做”转向环境和节奏。', '拍一次基线录像，或请可信教练指出一个最小修正点。', 8, { principalDefinition: '每周完成有录像或教练反馈的专项练习', desiredOutcome: '关键动作连续 3 次稳定出现，身体感觉更顺、更省力', principalMetricName: '有反馈的专项练习', principalMetricTarget: 8, returnMetricName: '稳定动作证据', returnMetricTarget: 3 })
  ],
  knowledge_network: [
    starterPlan('knowledge_for_work', '让读过的东西解决真实问题', '每次学习都连接一个正在发生的问题，并留下可以再次调用的解释。', '旧笔记至少 3 次直接帮助完成新任务或回答新问题。', '遇到问题不再从零搜索，能更快找到已有线索。', '选一个当前问题，把已有的 3 条知识连接成一页解释。', 8, { principalDefinition: '围绕真实问题建立可解释、可链接的知识笔记', desiredOutcome: '旧知识至少 3 次帮助解决新问题，我不再每次从零开始', principalMetricName: '完成连接的知识节点', principalMetricTarget: 8, returnMetricName: '在新问题中成功调用', returnMetricTarget: 3 }),
    starterPlan('explanatory_model', '建立一个能讲明白的知识模型', '围绕一个长期主题不断解释、应用和修正，而不是只收藏资料。', '能向两类不同的人讲清楚，并用它处理一个从未见过的问题。', '原本模糊的部分变得有结构，知道自己还不懂什么。', '用自己的话画出当前模型，并标出一个最不确定的连接。', 12, { principalDefinition: '每周解释、应用或修正一次核心知识模型', desiredOutcome: '能向不同对象讲清楚，并成功迁移到一个新问题', principalMetricName: '模型修订', principalMetricTarget: 12, returnMetricName: '跨场景调用', returnMetricTarget: 3 })
  ],
  decision_calibration: [
    starterPlan('repeat_decisions', '减少重复犯同一种决策错误', '在结果出现前写下预期和改变条件，结果出现后对照。', '至少 4 个决策能对照预期与结果，并找出一条反复偏差。', '做决定时更少纠结，也更能接受“不确定但已足够”。', '选一个正在犹豫的决定，先写预期、风险和什么情况会改变主意。', 12, { principalDefinition: '记录重要决策的事前预期、改变条件和事后结果', desiredOutcome: '完成 4 次可对照复盘，发现并减少一种重复偏差', principalMetricName: '有事前预期的决策', principalMetricTarget: 4, returnMetricName: '被后续决策复用', returnMetricTarget: 2 }),
    starterPlan('project_priority', '更稳定地判断项目优先级', '先预测项目价值与成本，再用真实结果校准选择标准。', '一轮项目结束后能看出哪些判断准确，低价值事项明显减少。', '更容易对不重要的事说“不”，注意力更集中。', '列出当前 3 个候选项目，并在行动前写下价值、成本和放弃条件。', 8, { principalDefinition: '对候选项目做事前价值、成本和放弃条件判断', desiredOutcome: '低价值事项减少，我能更容易拒绝不重要的项目', principalMetricName: '事前评估的项目', principalMetricTarget: 6, returnMetricName: '被验证的选择规则', returnMetricTarget: 2 })
  ],
  reusable_assets: [
    starterPlan('report_template', '把重复报告做成可复用资产', '把重复收集、整理和表达的步骤沉淀成模板或数据管线。', '同一资产被真实复用 3 次，并记录每次节省的时间和遗漏。', '下一次开始更轻松，不再面对空白页面。', '找出最近重复做过两次的报告，圈出完全相同的步骤。', 8, { principalDefinition: '把重复交付沉淀为能独立复用的模板或流程', desiredOutcome: '同一资产真实复用 3 次，开始更快且遗漏更少', principalMetricName: '可复用资产', principalMetricTarget: 2, returnMetricName: '真实复用', returnMetricTarget: 3 }),
    starterPlan('checklist_asset', '建立一份真的会用的检查清单', '从真实遗漏中更新清单，并在下一次交付前调用。', '清单连续使用 4 次，同类遗漏减少。', '交付前更安心，不需要反复靠记忆确认。', '从最近一次遗漏或返工中提取第一条检查项。', 8, { principalDefinition: '从真实错误中更新并使用交付检查清单', desiredOutcome: '清单连续使用 4 次，同类遗漏明显减少', principalMetricName: '清单更新与使用', principalMetricTarget: 6, returnMetricName: '避免的重复遗漏', returnMetricTarget: 2 })
  ],
  automation_system: [
    starterPlan('monthly_reconciliation', '让月度对账稳定运行', '把重复核对变成标准流程，只把异常留给人处理。', '流程连续运行 3 次，异常能被指出，人工逐行检查明显减少。', '月底不再害怕遗漏，也不需要每次重新想步骤。', '完整走一次现有对账，并标记最重复、最容易错的一步。', 12, { principalDefinition: '把月度对账步骤标准化并逐步自动化', desiredOutcome: '流程连续稳定运行 3 次，只需人工处理异常', principalMetricName: '流程改进与运行', principalMetricTarget: 6, returnMetricName: '稳定运行并节省人工', returnMetricTarget: 3 }),
    starterPlan('followup_sop', '建立不靠记忆的跟进流程', '把触发、负责人、时间和异常处理写进可重复流程。', '流程被 2 个人或同一个人 4 次独立使用，关键跟进没有遗漏。', '脑子里少挂一件事，交接时不用从头解释。', '选一个最近遗漏过的跟进，写下触发条件和完成标准。', 8, { principalDefinition: '把高频跟进沉淀为可执行、可交接的流程', desiredOutcome: '流程独立运行 4 次，关键跟进不再依赖记忆', principalMetricName: '流程运行', principalMetricTarget: 4, returnMetricName: '避免遗漏或节省时间', returnMetricTarget: 2 })
  ],
  product_feedback: [
    starterPlan('core_flow', '改好一个核心使用流程', '围绕一个真实用户任务收集使用证据，逐轮改进。', '至少 5 个真实用户完成流程，重复出现的问题减少。', '决定改什么时更有底气，不再只靠自己的感觉。', '选一个最重要的用户任务，观察一位用户从头完成。', 12, { principalDefinition: '观察真实使用并完成小步产品改进', desiredOutcome: '5 位用户完成核心流程，重复问题减少', principalMetricName: '被验证的改进', principalMetricTarget: 4, returnMetricName: '有效使用证据', returnMetricTarget: 5 }),
    starterPlan('onboarding', '让新用户更容易第一次成功', '记录新人在哪里卡住，用最小改动降低理解成本。', '相同问题被问得更少，新人能更独立完成第一次关键动作。', '不用每次亲自解释，也更清楚产品哪里难懂。', '找一位新用户，记录他第一次使用时停顿最久的地方。', 8, { principalDefinition: '观察新人首次使用并修正一个阻碍', desiredOutcome: '新人更独立完成第一次关键动作，重复提问减少', principalMetricName: '新手阻碍改进', principalMetricTarget: 4, returnMetricName: '独立完成首次关键动作', returnMetricTarget: 5 })
  ],
  work_distribution: [
    starterPlan('evergreen_article', '写一篇持续有用的作品', '围绕长期存在的问题创作，并根据搜索、引用和反馈持续修订。', '旧作品在不重新发布时仍带来搜索、回访、引用或询问。', '过去的工作还在帮自己，新作品不再每次从零找受众。', '选一个被反复问到的问题，整理成可长期更新的作品。', 12, { principalDefinition: '创作并持续修订能长期解决问题的公开作品', desiredOutcome: '旧作品持续带来搜索、引用、回访或真实询问', principalMetricName: '持续有用的作品', principalMetricTarget: 3, returnMetricName: '旧作品带来的回访或机会', returnMetricTarget: 5 }),
    starterPlan('content_series', '建立一组互相增值的内容', '围绕一个稳定主题连续创作，让旧内容成为新内容的上下文。', '新内容能引用旧内容，旧内容持续带来收藏、留言或私信。', '发布下一篇时更有基础，表达越来越顺。', '确定一个能连续回答 6 次的主题，写下第一篇和它要连接的下一篇。', 12, { principalDefinition: '围绕稳定主题创作能互相连接的内容', desiredOutcome: '形成至少 6 篇互相连接的内容，旧内容仍带来反馈', principalMetricName: '主题作品', principalMetricTarget: 6, returnMetricName: '旧作品带来的反馈', returnMetricTarget: 6 })
  ],
  reputation_trust: [
    starterPlan('delivery_promises', '用稳定交付积累专业信誉', '只承诺能验收的结果，并持续记录是否按时兑现。', '连续 4 次按约定验收，出现至少一次复购、转介或更深合作。', '沟通更坦然，不需要靠夸张包装证明自己。', '选一个正在进行的交付，和对方确认结果、时间与验收标准。', 12, { principalDefinition: '明确并兑现可验收的专业承诺', desiredOutcome: '连续 4 次按约定验收，并出现复购、转介或更深合作', principalMetricName: '按约验收的交付', principalMetricTarget: 4, returnMetricName: '因旧信誉产生的机会', returnMetricTarget: 1 }),
    starterPlan('evidence_cases', '让真实案例替自己建立信任', '把过程、限制与结果整理成可核对案例，而不是只做自我宣传。', '新的询问或合作明确提到过去案例，并更快进入实质讨论。', '更少需要“推销自己”，也更敢讲清楚边界。', '选一个已完成项目，写出问题、做法、结果和未解决部分。', 8, { principalDefinition: '把真实交付整理为透明、可核对的案例', desiredOutcome: '新的询问会引用旧案例，信任沟通更直接', principalMetricName: '公开且可核对的案例', principalMetricTarget: 3, returnMetricName: '案例带来的有效机会', returnMetricTarget: 2 })
  ],
  collaboration_context: [
    starterPlan('partner_workflow', '和核心合作者建立稳定配合', '在重复合作中保留决定、接口和复盘，逐步减少返工。', '连续 3 次合作的交付更顺，重复解释和返工减少。', '合作时更有默契，问题出现后也知道怎么修复。', '和一位核心合作者复盘最近一次返工，确认一个共同规则。', 12, { principalDefinition: '和同一核心合作者完成交付并沉淀共同规则', desiredOutcome: '连续 3 次合作更顺，重复解释和返工减少', principalMetricName: '完成验收的共同成果', principalMetricTarget: 3, returnMetricName: '被复用的共同上下文', returnMetricTarget: 3 }),
    starterPlan('team_weekly_rhythm', '建立不消耗人的团队周节奏', '让决定、阻碍和责任有稳定去处，减少无效会议。', '关键决定能被找到，阻碍按时解决，会议时长或重复讨论减少。', '开会后更清楚，而不是更疲惫。', '记录本周一个重复讨论的问题，决定它以后固定在哪里被处理。', 8, { principalDefinition: '运行并修正团队每周决定与阻碍处理节奏', desiredOutcome: '决定可追溯、阻碍更快解决，会议不再反复消耗', principalMetricName: '有效周节奏', principalMetricTarget: 8, returnMetricName: '减少的重复沟通', returnMetricTarget: 4 })
  ],
  financial_capital: [
    starterPlan('fixed_contribution', '固定周期投入计划', '按自己设定的金额和周期记录计划与实际，不由系统推荐标的或时点。', '能清楚看到计划投入、实际投入、当前余额与投资损益是否一致。', '不再每天靠涨跌决定要不要行动，对自己的规则更有把握。', '先确定长期目的、年限和每期能承受的金额。', 12),
    starterPlan('batched_lump_sum', '一笔资金分批投入计划', '先限定总预算和复核周期，再记录每批实际发生；系统不判断买卖时点。', '能清楚看到已投入批次、剩余预算、当前余额和计划偏离。', '减少一次性决定的压力，也不会因为短期波动临时改规则。', '先确定可承受的总预算、长期目的和复核频率。', 12)
  ],
  body_capacity: [
    starterPlan('daily_yoga_practice', '每天练一遍 7 动作全身瑜伽', '使用已有的 7 动作自主练习，每天按舒适范围完成约 10 分钟，并用身体反馈调整幅度。', '每周完成 5 天左右；连续几周后，能对照练习天数、身体反馈、被迫中断和恢复时间。', '早上或久坐后更容易活动，肩背和髋部更容易松开，也更知道何时应该减量或停止。', '今天先完成一遍舒适版本，记录练习前后最明显的一处身体感受；疼痛、眩晕或明显不适时立即停止。', 8, { principalDefinition: '每天按舒适范围完成已有的 7 动作全身瑜伽，并留下练习前后身体反馈', desiredOutcome: '每周稳定练习约 5 天，活动更容易，中断后能更快恢复，并能根据身体反馈主动调整', weeklyTimeBudgetMinutes: 70, principalMetricName: '完成每日瑜伽的天数', principalMetricTarget: 40, returnMetricName: '活动或恢复改善的周', returnMetricTarget: 4 }),
    starterPlan('sleep_recovery', '建立更稳定的睡眠与恢复节奏', '先观察个人基线，再小步调整睡眠、负荷和恢复，不追求完美打卡。', '入睡与起床更规律，白天精力和中断天数能被记录比较。', '早上更有恢复感，疲惫时更知道该调整什么。', '连续 7 天只记录睡眠时间、白天精力和一次身体感受。', 8, { principalDefinition: '记录个人基线，并每周执行一个可承受的睡眠或恢复调整', desiredOutcome: '睡眠与白天精力更稳定，中断后能更快恢复', principalMetricName: '符合个人基线的稳定周', principalMetricTarget: 6, returnMetricName: '恢复感改善或中断减少', returnMetricTarget: 3 })
  ],
  attention_capacity: [
    starterPlan('focus_blocks', '保护真正能完成事情的专注时段', '固定少量不被打断的时段，并记录其中产生的真实成果。', '每周有 3 个专注时段产出可见结果，切换次数下降。', '开始重要工作更快，做完后脑子更完整。', '在日历里保护本周第一个 45 分钟，并写明唯一产出。', 8, { principalDefinition: '每周保护少量无打扰时段，并只完成一个重要产出', desiredOutcome: '每周稳定产生 3 个可见成果，切换明显减少', principalMetricName: '被保护的专注时段', principalMetricTarget: 24, returnMetricName: '完成的重要结果', returnMetricTarget: 8 }),
    starterPlan('notification_boundary', '减少通知和反复查看', '关闭非必要即时入口，用固定时间集中处理。', '解锁或检查次数下降，重要消息仍能在约定时间处理。', '脑子更安静，和人相处或休息时更在场。', '关闭一个最常打断你的非必要通知，设定固定查看时间。', 4, { principalDefinition: '建立并执行通知与信息查看边界', desiredOutcome: '反复查看减少，重要消息仍被及时处理，心理空间更完整', principalMetricName: '执行边界的天数', principalMetricTarget: 20, returnMetricName: '完整专注或休息时段', returnMetricTarget: 12 })
  ],
  safety_buffer: [
    starterPlan('cash_buffer', '建立必要开支缓冲', '逐步积累能覆盖必要开支的现金缓冲，并定期核对可用性。', '可覆盖月数从当前基线稳定上升，临时支出不会立刻打断长期计划。', '面对突发开支更少恐慌，也更敢做长期选择。', '算出一个月必要开支，并记录当前可立即使用的缓冲。', 24, { principalDefinition: '定期把可承受金额转入独立的必要开支缓冲', desiredOutcome: '必要开支可覆盖月数上升，突发支出不再立刻打断长期计划', principalMetricName: '完成缓冲投入的周期', principalMetricTarget: 6, returnMetricName: '可覆盖必要开支月数', returnMetricTarget: 1 }),
    starterPlan('backup_restore', '让关键资料真的能恢复', '建立备份并定期做恢复演练，而不是只相信“已经同步”。', '从备份成功恢复一次关键资料，并知道最后成功时间。', '设备故障时不再只剩恐惧，知道下一步怎么做。', '选一类最不能丢的资料，确认它现在有几个独立副本。', 4, { principalDefinition: '为关键资料建立独立备份并实际演练恢复', desiredOutcome: '关键资料能从备份成功恢复，最后成功时间清楚可见', principalMetricName: '备份检查与演练', principalMetricTarget: 4, returnMetricName: '成功恢复', returnMetricTarget: 1 })
  ]
});

const SETUP_BY_KEY = Object.freeze({
  financial_capital: {
    titleLabel: '这项长期本金计划叫什么？',
    titlePlaceholder: '例如：长期选择权资金；不要填写账户信息',
    commitmentLabel: '计划范围稍后在投资计划中确认',
    commitmentPlaceholder: '创建后选择全部长期投资或一部分长期资金',
    outcomeLabel: '这项长期本金计划为了什么？',
    outcomePlaceholder: '描述长期目的；不需要填写目标收益率',
    nextStepLabel: '第一项核对行动',
    nextStepPlaceholder: '例如：确认今天纳入计划的资产总额',
    returnDefinition: '只记录用户已经确认、扣除可知费用后的实际结果；结果可能为负，本功能不预测、不承诺收益。',
    reinvestmentSummary: '记录收益实际去向，不以是否手动再投入判断计划成功。',
    reinvestmentDefinition: '收益去向由用户记录为基金内累积、计划内现金、再次买入、转出或待确认；系统不会自动交易。',
    riskDisclosure: '仅用于管理你自己的长期资金计划和记录已发生事实，不提供具体产品、买卖时点、仓位比例、收益预测或自动交易。投资有风险，结果可能为负。请勿填写银行或证券账户、卡号、密码、验证码。',
    requiresBoundaryAcceptance: true,
    boundaryVersion: '2026-09-14-v1',
    weeklyTimeBudgetMinutes: 15,
    principalMetricTarget: 0,
    returnMetricTarget: 0,
    currentMilestone: '完成计划范围、期初资产与一条有效资金记录的核对'
  }
});

const ARCHETYPES = [
  {
    key: 'capability_feedback',
    kind: 'GROWTH',
    category: '能力与认知',
    name: '核心能力复利',
    summary: '在真实任务中练习、获得反馈并纠错，让下一次表现更稳定。',
    mechanism: '能力提高后能处理更难的真实任务，更难的任务又带来更高质量的反馈。',
    fits: '正在学习或依靠专业表现获得结果的人。',
    notThis: '只记录学习时长、看了多少内容，却没有真实任务与外部评估。',
    defaultPrincipalMetric: '通过验证的能力证据',
    defaultReturnMetric: '旧能力在新任务中成功调用',
    examples: ['用真实客户任务练成稳定的数据分析能力', '通过录像和教练反馈提高一项运动技术']
  },
  {
    key: 'knowledge_network',
    kind: 'GROWTH',
    category: '能力与认知',
    name: '知识网络复利',
    summary: '让新知识连接已有理解，持续提高学习、解释与迁移速度。',
    mechanism: '知识结构越完整，新问题越容易被理解和连接，并反过来修正旧模型。',
    fits: '长期研究、写作、学习或处理复杂专业问题的人。',
    notThis: '收藏资料、摘抄名句或追求阅读数量，但不解释、应用和校正。',
    defaultPrincipalMetric: '可解释并应用的知识模型',
    defaultReturnMetric: '跨场景成功调用',
    examples: ['建立能解释和解决真实问题的专业知识网络']
  },
  {
    key: 'decision_calibration',
    kind: 'GROWTH',
    category: '能力与认知',
    name: '决策质量复利',
    summary: '保存重要决策的预期与结果，通过校准减少重复错误。',
    mechanism: '每个有结果的决策都为下一次资源配置提供可核对的先验。',
    fits: '经常做高成本、高不确定性决策的人。',
    notThis: '事后只写感想，没有事前预期、改变条件和可核对结果。',
    defaultPrincipalMetric: '已获得结果反馈的决策',
    defaultReturnMetric: '旧决策经验帮助新决策',
    examples: ['建立可校准的个人决策记录与复盘系统']
  },
  {
    key: 'reusable_assets',
    kind: 'GROWTH',
    category: '资产与杠杆',
    name: '可复用资产复利',
    summary: '把一次性交付变成代码、模板、文档、课程、作品或方法。',
    mechanism: '旧成果被后续任务反复调用，节省的时间用来创造更多和更好的资产。',
    fits: '反复制作相似交付的知识工作者、手艺人和团队。',
    notThis: '只把文件存下来，却没有在后续真实任务中复用。',
    defaultPrincipalMetric: '可独立复用的有效资产',
    defaultReturnMetric: '资产在真实任务中复用',
    examples: ['把反复做的报告建成可复用模板与数据管线', '建立经过测试的代码组件库']
  },
  {
    key: 'automation_system',
    kind: 'GROWTH',
    category: '资产与杠杆',
    name: '流程与自动化复利',
    summary: '标准化并自动化重复工作，让单位时间产出持续上升。',
    mechanism: '每次真实运行都暴露瓶颈，修正后的系统又为下一轮节省时间并减少错误。',
    fits: '拥有稳定、重复、可观察工作流的人或团队。',
    notThis: '为很少发生的事做复杂自动化，维护成本高于节省的时间。',
    defaultPrincipalMetric: '稳定运行的自动化或标准流程',
    defaultReturnMetric: '自动化成功执行并节省人工',
    examples: ['建立可自动运行的月度对账与异常检查流程']
  },
  {
    key: 'product_feedback',
    kind: 'GROWTH',
    category: '产品与作品',
    name: '产品与数据反馈复利',
    summary: '真实使用产生反馈和数据，改进又带来更多有效使用。',
    mechanism: '用户使用→可核对反馈→产品改进→更多有效使用，形成反馈飞轮。',
    fits: '建设产品、服务、社区或平台的人。',
    notThis: '只不断增加功能，没有真实使用、留存与结果反馈。',
    defaultPrincipalMetric: '被真实使用且验证的改进',
    defaultReturnMetric: '旧改进持续带来有效使用',
    examples: ['建立用户使用、反馈、改进和留存的完整产品闭环']
  },
  {
    key: 'work_distribution',
    kind: 'GROWTH',
    category: '产品与作品',
    name: '作品与分发复利',
    summary: '让过去的有用作品持续被发现、引用，并为新作品带来初始受众。',
    mechanism: '作品库和稳定受众为新发布提供分发与反馈，新作品又扩大作品库。',
    fits: '作者、创作者、研究者、开源开发者和品牌。',
    notThis: '只追求当日发布数和短期流量，旧作品不再产生价值。',
    defaultPrincipalMetric: '持续有用的公开作品',
    defaultReturnMetric: '旧作品带来的引用、回访或机会',
    examples: ['建立持续被搜索、引用和使用的专业作品库']
  },
  {
    key: 'reputation_trust',
    kind: 'GROWTH',
    category: '信任与协作',
    name: '信誉复利',
    summary: '用真实交付和兑现承诺积累信誉，获得更高质量的合作机会。',
    mechanism: '可验证的兑现记录降低他人的信任成本，更好的机会又能产生更强成果。',
    fits: '依赖长期交易、服务或专业信任的人。',
    notThis: '把社交数量、口头承诺或单次自我宣传当作信誉。',
    defaultPrincipalMetric: '被验收的承诺或交付',
    defaultReturnMetric: '因旧信誉产生的复购、转介或合作',
    examples: ['用稳定交付建立可被验证的专业信誉']
  },
  {
    key: 'collaboration_context',
    kind: 'GROWTH',
    category: '信任与协作',
    name: '长期协作复利',
    summary: '通过多次可信合作积累共同背景，降低沟通和返工成本。',
    mechanism: '共同上下文和信任使协作更快、可承担更复杂成果，新成果又加深关系。',
    fits: '有明确共同成果的长期团队、合伙人、客户或研究伙伴。',
    notThis: '机械维系联系数量，或把亲情友情全部工具化。',
    defaultPrincipalMetric: '完成验收的共同成果',
    defaultReturnMetric: '旧协作背景被新合作复用',
    examples: ['与核心合作者建立可反复运行的交付与复盘节奏']
  },
  {
    key: 'financial_capital',
    kind: 'GROWTH',
    category: '资本',
    name: '财务本金复利',
    summary: '记清投入、实际赚亏和持有结构，对照自己制定的长期规则执行。',
    mechanism: '持续把可支配资金转化为长期资产；系统分开核算外部投入与投资损益，不用短期盈利证明计划成立。',
    fits: '有稳定结余、理解风险并愿意长期执行的人。',
    notThis: '频繁交易、追涨杀跌、忽略费用和风险的短期投机。',
    defaultPrincipalMetric: '已确认外部净投入',
    defaultReturnMetric: '排除资金进出后的投资损益',
    examples: ['按月核对资金进出和市值，按季度回看持有结构与计划偏离']
  },
  {
    key: 'body_capacity',
    kind: 'PROTECTION',
    category: '保障底盘',
    name: '身体与恢复底盘',
    summary: '维持睡眠、运动、恢复与异常跟进，降低长期积累被中断的风险。',
    mechanism: '它不追求无限增长，而是维持可恢复的身体能力，保护其他长期投入。',
    fits: '任何需要保护长期身体容量的人，尤其是睡眠、恢复或症状已影响生活时。',
    notThis: '追求无限运动量、将症状自动解释为诊断，或用连续打卡代替身体反馈。',
    defaultPrincipalMetric: '符合个人基线的稳定周',
    defaultReturnMetric: '少发生的中断或更快的恢复',
    examples: ['用 12 周建立稳定睡眠、训练与恢复基线']
  },
  {
    key: 'attention_capacity',
    kind: 'PROTECTION',
    category: '保障底盘',
    name: '注意力与心理空间',
    summary: '降低持续切换、过载与外部刺激，保护深度工作和当下生活。',
    mechanism: '保护稀缺的认知容量，避免已建立的能力和计划因持续切换而失效。',
    fits: '经常被通知、多任务、焦虑或过量信息打断的人。',
    notThis: '把人生全部排满、追求时时高效，或把休息当作失败。',
    defaultPrincipalMetric: '被保护的专注时段',
    defaultReturnMetric: '因减少切换而完成的重要结果',
    examples: ['建立能保护深度工作也保留休息的每周节奏']
  },
  {
    key: 'safety_buffer',
    kind: 'PROTECTION',
    category: '保障底盘',
    name: '安全与财务缓冲',
    summary: '用检查、备份、保险或现金缓冲，降低一次事故让长期积累归零的风险。',
    mechanism: '不直接创造增长，而是限制不可逆损失，保留时间、健康和资本的继续投入能力。',
    fits: '承担高风险交付、收入波动、家庭责任或关键数据责任的人。',
    notThis: '无限囤积、过度保守，或为了规避一切风险而停止真实行动。',
    defaultPrincipalMetric: '已建立的关键缓冲或防线',
    defaultReturnMetric: '被防止或显著减轻的中断',
    examples: ['建立可覆盖必要开支的现金缓冲', '建立关键数据的备份与恢复演练']
  }
].map((item, index) => {
  const specificSetup = SETUP_BY_KEY[item.key] || {};
  const setup = {
    ...DEFAULT_SETUP,
    ...specificSetup,
    returnDefinition: specificSetup.returnDefinition || item.mechanism
  };
  return { ...item, setup, starterPlans: STARTER_PLANS_BY_KEY[item.key] || [], version: CATALOG_VERSION, order: index + 1 };
});

const ARCHETYPE_MAP = new Map(ARCHETYPES.map(item => [item.key, item]));

function archetypeByKey(value) {
  return ARCHETYPE_MAP.get(String(value || '')) || null;
}

function listArchetypes() {
  return ARCHETYPES.map(item => ({
    ...item,
    examples: [...item.examples],
    setup: { ...item.setup },
    starterPlans: item.starterPlans.map(plan => ({ ...plan }))
  }));
}

module.exports = { ARCHETYPES, CATALOG_VERSION, archetypeByKey, listArchetypes };
