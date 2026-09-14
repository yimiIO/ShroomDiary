'use strict';

const CATALOG_VERSION = '2026-09-14-v2';

const DEFAULT_SETUP = Object.freeze({
  titleLabel: '这项积累在你的生活里叫什么？',
  titlePlaceholder: '例如：让专业能力能解决更难的真实问题',
  commitmentLabel: '你准备持续投入什么？',
  commitmentPlaceholder: '写一种能反复发生的投入，不用解释复利理论',
  outcomeLabel: '12 周后看到什么，说明它值得继续？',
  outcomePlaceholder: '写一个你能亲自核对的变化或结果',
  nextStepLabel: '下一次最小的具体动作是什么？',
  nextStepPlaceholder: '写下离开页面后就能开始的一步',
  reinvestmentSummary: '系统会在进展回看时确认，真实回报是否进入了下一轮。',
  reinvestmentDefinition: '已经确认的复用、节省或回报，会由用户安排进入下一轮投入。',
  weeklyTimeBudgetMinutes: 120,
  principalMetricTarget: 4,
  returnMetricTarget: 1,
  currentMilestone: '四周内完成第一轮真实投入，并留下可以核对的结果'
});

const SETUP_BY_KEY = Object.freeze({
  financial_capital: {
    titleLabel: '这项长期本金计划为了什么？',
    titlePlaceholder: '例如：长期安全垫或未来选择权；不要填写账户信息',
    commitmentLabel: '你准备怎样稳定增加本金？',
    commitmentPlaceholder: '例如：每月固定转入可承担的金额，同时保留应急资金',
    outcomeLabel: '12 周后看到什么，说明这套机制在正常运行？',
    outcomePlaceholder: '例如：连续完成 3 次投入，费用和风险清楚，实际收益按计划处理',
    nextStepLabel: '建立这套机制的下一步是什么？',
    nextStepPlaceholder: '例如：确认可承担金额，并设置第一次定期转入',
    returnDefinition: '本金按用户选择的工具产生经费用核对后的实际收益；收益可能为负，本功能不承诺收益。',
    reinvestmentSummary: '只有你确认已经保留或再投入的实际收益，才算进入下一轮；系统不会自动交易。',
    reinvestmentDefinition: '只有用户确认已经保留或再投入的实际收益，才计入下一轮；系统不会自动执行交易。',
    weeklyTimeBudgetMinutes: 15,
    principalMetricTarget: 3,
    returnMetricTarget: 1,
    currentMilestone: '四周内完成第一轮本金投入，并确认费用、风险和收益处理方式'
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
    summary: '让本金产生可核对收益，并将收益继续投入。',
    mechanism: '收益不全部被消费，而是重新成为下一期本金。',
    fits: '有稳定结余、理解风险并愿意长期执行的人。',
    notThis: '频繁交易、追涨杀跌、忽略费用和风险的短期投机。',
    defaultPrincipalMetric: '按计划增加本金的次数',
    defaultReturnMetric: '已确认收益再投入的次数',
    examples: ['建立稳定、低费用并且自动再投入的长期本金计划']
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
  return { ...item, setup, version: CATALOG_VERSION, order: index + 1 };
});

const ARCHETYPE_MAP = new Map(ARCHETYPES.map(item => [item.key, item]));

function archetypeByKey(value) {
  return ARCHETYPE_MAP.get(String(value || '')) || null;
}

function listArchetypes() {
  return ARCHETYPES.map(item => ({ ...item, examples: [...item.examples], setup: { ...item.setup } }));
}

module.exports = { ARCHETYPES, CATALOG_VERSION, archetypeByKey, listArchetypes };
