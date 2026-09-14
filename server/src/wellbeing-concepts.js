'use strict';

const WELLBEING_CONCEPT_CATALOG_VERSION = 'wellbeing-concepts-2026-09-14-v1';

const WHO_MENTAL_HEALTH_SOURCE = {
  organization: '世界卫生组织（WHO）',
  title: 'ICD-11 精神、行为或神经发育障碍临床描述与诊断要求',
  url: 'https://iris.who.int/handle/10665/375767'
};

const MEDLINEPLUS = (title, slug) => ({
  organization: '美国国家医学图书馆（MedlinePlus）',
  title,
  url: `https://medlineplus.gov/${slug}.html`
});

const CONCEPTS = [
  {
    id: 'psych.rejection-sensitivity', domain: 'PSYCHOLOGICAL',
    name: '拒绝敏感性', englishName: 'Rejection sensitivity', type: 'RESEARCH_CONSTRUCT', typeLabel: '心理学研究构念',
    definition: '一种认知—情感倾向：更容易焦虑地预期拒绝、在模糊互动中察觉拒绝，并对拒绝线索产生较强反应。',
    boundary: '它不是精神障碍诊断。偶尔担心被拒绝很常见，需要结合跨情境的重复性、痛苦程度和关系影响理解。',
    matchGuidance: '反复预期被拒绝、把模糊社交线索理解为拒绝，并产生明显情绪或关系反应。不要仅凭在意评价匹配。',
    source: { organization: 'Downey 与 Feldman', title: 'Implications of rejection sensitivity for intimate relationships', url: 'https://pubmed.ncbi.nlm.nih.gov/8667172/' },
    aliases: ['拒绝敏感', '拒绝敏感性倾向']
  },
  {
    id: 'psych.fear-negative-evaluation', domain: 'PSYCHOLOGICAL',
    name: '负面评价恐惧', englishName: 'Fear of negative evaluation', type: 'RESEARCH_CONSTRUCT', typeLabel: '心理学研究构念',
    definition: '对他人可能给予负面评价的担忧、害怕及相应回避倾向，是社交焦虑研究中的重要构念。',
    boundary: '它本身不是社交焦虑障碍。只有出现明显而持续的恐惧、回避和功能影响时，才值得进一步评估临床方向。',
    matchGuidance: '日记明确反复记录害怕被评价、被看低或出丑，并影响表达、社交或决策。',
    source: { organization: 'Watson 与 Friend', title: 'Measurement of social-evaluative anxiety', url: 'https://doi.org/10.1037/h0027806' },
    aliases: ['社交评价敏感', '负面评价焦虑']
  },
  {
    id: 'psych.anger-rumination', domain: 'PSYCHOLOGICAL',
    name: '愤怒反刍', englishName: 'Anger rumination', type: 'RESEARCH_CONSTRUCT', typeLabel: '心理学研究构念',
    definition: '注意力持续停留在愤怒情绪、过去的愤怒事件，以及事件原因和后果上的倾向。',
    boundary: '它不是疾病诊断。一次冲突后继续思考也不等于愤怒反刍，需要看是否反复、难以停止并带来持续影响。',
    matchGuidance: '多次记录冲突后反复回想、持续愤怒、想象报复或难以把注意力移开。',
    source: { organization: 'Sukhodolsky、Golub 与 Cromwell', title: 'Development and validation of the Anger Rumination Scale', url: 'https://doi.org/10.1016/S0191-8869(00)00171-9' },
    aliases: ['愤怒反刍与冲突后持续投入', '愤怒性反刍']
  },
  {
    id: 'psych.depressive-rumination', domain: 'PSYCHOLOGICAL',
    name: '抑郁反刍', englishName: 'Depressive rumination', type: 'RESEARCH_CONSTRUCT', typeLabel: '心理学研究构念',
    definition: '注意力反复停留在低落感受及其原因、意义和后果上，却较少转向具体问题解决的思维模式。',
    boundary: '反刍是一种思维模式，不等于抑郁障碍；需要与一般复盘、有效的问题解决和短暂低落区分。',
    matchGuidance: '低落时反复分析原因或后果、难以停止、没有转化为行动，并加重或延长负面情绪。',
    source: { organization: 'Nolen-Hoeksema', title: 'Sex differences in unipolar depression: evidence and theory', url: 'https://pubmed.ncbi.nlm.nih.gov/2208951/' },
    aliases: ['反刍思维', '抑郁性反刍']
  },
  {
    id: 'psych.emotion-regulation-difficulty', domain: 'PSYCHOLOGICAL',
    name: '情绪调节困难', englishName: 'Difficulties in emotion regulation', type: 'RESEARCH_CONSTRUCT', typeLabel: '心理学研究构念',
    definition: '在识别、理解、接纳情绪，控制冲动，保持目标行动或灵活使用调节策略方面出现持续困难。',
    boundary: '它是跨多种情境和问题的心理学构念，不是独立诊断，也不能只凭情绪强烈或一次失控判断。',
    matchGuidance: '跨时间出现情绪难以识别或接纳、冲动控制困难、情绪中无法继续目标行动或缺乏有效策略。',
    source: { organization: 'Gratz 与 Roemer', title: 'Multidimensional assessment of emotion regulation and dysregulation', url: 'https://doi.org/10.1023/B:JOBA.0000007455.08539.94' },
    aliases: ['情绪调节失调', '情绪调节困难倾向']
  },
  {
    id: 'psych.avoidance-coping', domain: 'PSYCHOLOGICAL',
    name: '回避性应对', englishName: 'Avoidance coping', type: 'RESEARCH_CONSTRUCT', typeLabel: '心理学研究构念',
    definition: '面对压力或冲突时，主要通过回避情境、压下想法感受或延迟处理来降低当下不适的应对方式。',
    boundary: '回避有时是合理的短期保护，不能仅凭一次退出或告别困难认定为问题；关键是是否长期妨碍重要行动。',
    matchGuidance: '同类压力情境中反复逃避、拖延或压抑体验，短期缓解但长期问题持续或功能受损。',
    source: { organization: 'Carver、Scheier 与 Weintraub', title: 'Assessing coping strategies: a theoretically based approach', url: 'https://pubmed.ncbi.nlm.nih.gov/2926629/' },
    aliases: ['回避应对', '逃避型应对']
  },
  {
    id: 'psych.depressive-symptom-cluster', domain: 'PSYCHOLOGICAL',
    name: '抑郁相关症状群', englishName: 'Depressive symptom cluster', type: 'CLINICAL_SCREENING_DIRECTION', typeLabel: '临床筛查方向',
    definition: '低落、兴趣或愉悦感下降、精力变化，以及睡眠、食欲、注意力、自我评价等表现共同出现的症状组合。',
    boundary: '症状群不等于抑郁障碍。专业评估还需确认持续时间、严重程度、功能影响，并排除身体疾病、药物和其他解释。',
    matchGuidance: '至少两类核心表现跨时间重复或持续，并出现明确痛苦或学习、工作、社交、自我照顾影响。',
    source: { ...WHO_MENTAL_HEALTH_SOURCE },
    aliases: ['抑郁相关症状', '抑郁症状群', '抑郁相关问题需要评估']
  },
  {
    id: 'psych.generalized-anxiety-disorder', domain: 'PSYCHOLOGICAL',
    name: '广泛性焦虑障碍评估方向', englishName: 'Generalized anxiety disorder', type: 'CLINICAL_CONDITION', typeLabel: '临床评估方向',
    definition: '对多个日常领域出现显著、难以控制且持续的焦虑和担忧，并常伴紧张、坐立不安、注意或睡眠等变化。',
    boundary: '日记中的担忧不能完成诊断；需要专业人员核对持续时间、功能影响及药物、物质和身体原因。',
    matchGuidance: '多个生活领域长期过度担忧、难控制，并伴明显痛苦、身体紧张或功能影响。',
    source: { ...WHO_MENTAL_HEALTH_SOURCE },
    aliases: ['广泛性焦虑需要评估', '广泛性焦虑障碍']
  },
  {
    id: 'psych.social-anxiety-disorder', domain: 'PSYCHOLOGICAL',
    name: '社交焦虑障碍评估方向', englishName: 'Social anxiety disorder', type: 'CLINICAL_CONDITION', typeLabel: '临床评估方向',
    definition: '在一个或多个社交情境中，因担心受到负面评价而出现明显且过度的恐惧或焦虑，并可能回避相关情境。',
    boundary: '害羞、在意评价或单次社交紧张并不等于该障碍；需要核对持续性、强度、回避及生活影响。',
    matchGuidance: '负面评价恐惧持续反复，导致显著回避或工作、学习、关系受损。',
    source: { ...WHO_MENTAL_HEALTH_SOURCE },
    aliases: ['社交焦虑', '社交焦虑需要评估']
  },
  {
    id: 'psych.panic-disorder', domain: 'PSYCHOLOGICAL',
    name: '惊恐障碍评估方向', englishName: 'Panic disorder', type: 'CLINICAL_CONDITION', typeLabel: '临床评估方向',
    definition: '反复出现意外的强烈恐惧或不适发作，并持续担心再次发作或因此明显改变行为。',
    boundary: '心悸、胸闷或一次恐慌有多种身体和情境原因，必须先考虑紧急身体问题并由专业人员评估。',
    matchGuidance: '多次突发强烈恐惧伴明显身体反应，之后持续担忧复发或回避活动。',
    source: { ...WHO_MENTAL_HEALTH_SOURCE },
    aliases: ['惊恐发作相关问题', '惊恐障碍']
  },
  {
    id: 'psych.adjustment-disorder', domain: 'PSYCHOLOGICAL',
    name: '适应障碍评估方向', englishName: 'Adjustment disorder', type: 'CLINICAL_CONDITION', typeLabel: '临床评估方向',
    definition: '在明确生活压力事件之后，持续专注于压力源及其后果、难以适应，并造成明显功能损害。',
    boundary: '面对重大变化产生痛苦通常是正常反应；只有程度、持续和功能影响达到临床要求时才可能属于该方向。',
    matchGuidance: '明确压力事件后持续难以适应，反复被事件占据，并出现明显功能影响。',
    source: { ...WHO_MENTAL_HEALTH_SOURCE },
    aliases: ['适应问题需要评估', '适应障碍']
  },
  {
    id: 'psych.prolonged-grief-disorder', domain: 'PSYCHOLOGICAL',
    name: '延长哀伤障碍评估方向', englishName: 'Prolonged grief disorder', type: 'CLINICAL_CONDITION', typeLabel: '临床评估方向',
    definition: '亲近者去世后，长期存在强烈思念或持续专注于逝者，并伴显著情绪痛苦和功能损害。',
    boundary: '普通告别困难、关系结束或正常哀伤不能匹配该概念；必须存在丧亲背景及符合文化情境的异常持续时间。',
    matchGuidance: '仅在明确丧亲后长期强烈思念或专注，并伴功能损害时匹配。不能用于一般分手或告别。',
    source: { ...WHO_MENTAL_HEALTH_SOURCE },
    aliases: ['延长哀伤', '延长哀伤障碍']
  },
  {
    id: 'psych.burnout', domain: 'PSYCHOLOGICAL',
    name: '职业倦怠', englishName: 'Burn-out', type: 'OCCUPATIONAL_PHENOMENON', typeLabel: '职业相关现象',
    definition: '长期未被有效管理的工作压力所形成的职业现象，通常涉及精力耗竭、对工作的疏离或消极感，以及职业效能下降。',
    boundary: 'WHO 将其归为职业现象而非医学疾病，且只适用于工作情境，不能泛化到生活其他领域。',
    matchGuidance: '记录明确指向长期工作压力，并同时出现耗竭、疏离或效能下降中的多个方面。',
    source: { organization: '世界卫生组织（WHO）', title: 'Burn-out an occupational phenomenon', url: 'https://www.who.int/standards/classifications/frequently-asked-questions/burn-out-an-occupational-phenomenon' },
    aliases: ['工作倦怠', '职业耗竭']
  },
  {
    id: 'physical.hyperhidrosis', domain: 'PHYSICAL',
    name: '多汗症评估方向', englishName: 'Hyperhidrosis', type: 'MEDICAL_CONDITION', typeLabel: '医学评估方向',
    definition: '出汗明显超过体温调节通常所需程度，可局限在手、足、腋下或其他部位，也可能继发于其他疾病或药物。',
    boundary: '天气炎热、运动或紧张时出汗很常见；需要记录部位、诱因、睡眠时表现、持续时间和生活影响，并区分原发与继发原因。',
    matchGuidance: '非单纯炎热或运动造成的反复过度出汗，尤其局部对称、影响生活，或伴其他全身表现。',
    source: { organization: '美国国家医学图书馆（MedlinePlus）', title: 'Hyperhidrosis', url: 'https://medlineplus.gov/ency/article/007259.htm' },
    aliases: ['多汗症方向', '手汗症', '多汗症']
  },
  {
    id: 'physical.iron-deficiency-anemia', domain: 'PHYSICAL',
    name: '缺铁性贫血排查方向', englishName: 'Iron-deficiency anemia', type: 'MEDICAL_CONDITION', typeLabel: '医学排查方向',
    definition: '身体铁储备不足导致的贫血，可出现疲乏、乏力、头晕、心悸、气短或面色变化，但症状并不特异。',
    boundary: '仅凭疲劳或脸色不能判断，需要血常规、铁蛋白等检查并寻找缺铁原因。',
    matchGuidance: '持续疲乏等表现合并客观血液检查异常，或存在值得核对的失血、饮食等线索时列为排查方向。',
    source: MEDLINEPLUS('Iron Deficiency Anemia', 'irondeficiencyanemia'),
    aliases: ['贫血需要排查', '缺铁性贫血', '贫血方向']
  },
  {
    id: 'physical.hypothyroidism', domain: 'PHYSICAL',
    name: '甲状腺功能减退排查方向', englishName: 'Hypothyroidism', type: 'MEDICAL_CONDITION', typeLabel: '医学排查方向',
    definition: '甲状腺激素不足的状态，可能出现疲乏、怕冷、体重变化、皮肤干燥、便秘或思维和情绪变化。',
    boundary: '这些表现很常见且不特异，不能通过日记诊断；需要甲状腺功能检查和临床评估。',
    matchGuidance: '多个相关身体表现持续共现，或已有甲状腺检查异常时才列入排查。不能只凭体重增加匹配。',
    source: MEDLINEPLUS('Hypothyroidism', 'hypothyroidism'),
    aliases: ['甲减', '甲状腺功能减退']
  },
  {
    id: 'physical.hyperthyroidism', domain: 'PHYSICAL',
    name: '甲状腺功能亢进排查方向', englishName: 'Hyperthyroidism', type: 'MEDICAL_CONDITION', typeLabel: '医学排查方向',
    definition: '甲状腺激素过多的状态，可能出现心跳加快、怕热、多汗、震颤、体重下降、焦虑或睡眠变化。',
    boundary: '单一症状不能判断，需结合甲状腺功能检查和临床评估；突发明显心悸或胸痛应及时就医。',
    matchGuidance: '怕热、多汗、心悸、震颤或非预期体重下降等多项持续共现，或已有检查异常。',
    source: MEDLINEPLUS('Hyperthyroidism', 'hyperthyroidism'),
    aliases: ['甲亢', '甲状腺功能亢进']
  },
  {
    id: 'physical.obstructive-sleep-apnea', domain: 'PHYSICAL',
    name: '阻塞性睡眠呼吸暂停排查方向', englishName: 'Obstructive sleep apnea', type: 'MEDICAL_CONDITION', typeLabel: '医学排查方向',
    definition: '睡眠中上气道反复阻塞，使呼吸暂停或变浅，并可能造成鼾声、憋醒、晨起头痛和白天嗜睡。',
    boundary: '睡得少或普通打鼾不等于睡眠呼吸暂停，通常需要睡眠评估或监测确认。',
    matchGuidance: '反复响亮打鼾、目击呼吸暂停或憋醒，并伴白天嗜睡、晨起头痛等表现。',
    source: MEDLINEPLUS('Sleep Apnea', 'sleepapnea'),
    aliases: ['睡眠呼吸暂停', '阻塞性睡眠呼吸暂停']
  },
  {
    id: 'physical.chronic-insomnia-disorder', domain: 'PHYSICAL',
    name: '慢性失眠障碍评估方向', englishName: 'Chronic insomnia disorder', type: 'CLINICAL_CONDITION', typeLabel: '睡眠评估方向',
    definition: '在有适当睡眠机会的情况下，持续出现入睡、维持睡眠或早醒困难，并影响白天状态。',
    boundary: '偶尔失眠或主动熬夜不等于失眠障碍，需要核对频率、持续时间、睡眠机会和白天影响。',
    matchGuidance: '睡眠困难长期反复，且即使有睡眠机会仍发生并影响白天功能。',
    source: MEDLINEPLUS('Insomnia', 'insomnia'),
    aliases: ['慢性失眠', '失眠障碍', '失眠问题']
  },
  {
    id: 'physical.migraine', domain: 'PHYSICAL',
    name: '偏头痛评估方向', englishName: 'Migraine', type: 'MEDICAL_CONDITION', typeLabel: '医学评估方向',
    definition: '一种反复发作的头痛疾病，常呈中重度，可伴恶心、怕光、怕声，部分人发作前有视觉或感觉先兆。',
    boundary: '头痛原因很多；突发最严重头痛、神经功能变化、发热颈强或头部外伤后头痛需要及时就医。',
    matchGuidance: '反复相似的中重度头痛发作，并伴恶心、怕光怕声、活动加重或先兆等特征。',
    source: MEDLINEPLUS('Migraine', 'migraine'),
    aliases: ['偏头痛']
  },
  {
    id: 'physical.tension-type-headache', domain: 'PHYSICAL',
    name: '紧张型头痛评估方向', englishName: 'Tension-type headache', type: 'MEDICAL_CONDITION', typeLabel: '医学评估方向',
    definition: '常表现为双侧压迫或紧箍样、轻到中度的头痛，日常活动通常不会明显加重。',
    boundary: '不能仅凭“压力大时头痛”判断；需记录疼痛位置、性质、时长、伴随症状和用药情况。',
    matchGuidance: '反复双侧压迫或紧箍样头痛，通常无明显恶心，且日常活动不明显加重。',
    source: { organization: '国际头痛学会（IHS）', title: 'ICHD-3: Tension-type headache', url: 'https://ichd-3.org/2-tension-type-headache/' },
    aliases: ['紧张性头痛', '紧张型头痛']
  },
  {
    id: 'physical.cervical-spondylosis', domain: 'PHYSICAL',
    name: '颈椎病评估方向', englishName: 'Cervical spondylosis', type: 'MEDICAL_CONDITION', typeLabel: '医学评估方向',
    definition: '颈椎椎间盘、关节等随年龄或负荷发生退变的统称，可能与颈痛、僵硬或神经受压表现有关。',
    boundary: '颈肩不适不一定是颈椎病，影像退变也不一定解释症状；手脚无力、行走异常或大小便变化需及时就医。',
    matchGuidance: '持续或反复颈部疼痛僵硬，尤其已有临床或影像依据，或伴符合神经受压的表现。',
    source: { organization: '美国国家医学图书馆（MedlinePlus）', title: 'Cervical spondylosis', url: 'https://medlineplus.gov/ency/article/000436.htm' },
    aliases: ['颈椎病', '颈椎退行性改变']
  },
  {
    id: 'physical.gastroesophageal-reflux', domain: 'PHYSICAL',
    name: '胃食管反流病评估方向', englishName: 'Gastroesophageal reflux disease', type: 'MEDICAL_CONDITION', typeLabel: '医学评估方向',
    definition: '胃内容物反流引起反复烧心、反酸或相关不适，部分人也会出现咳嗽、咽部不适等表现。',
    boundary: '偶尔餐后反酸很常见；吞咽困难、消化道出血、持续呕吐或非预期体重下降需要及时就医。',
    matchGuidance: '反复烧心或反酸，并与进食、躺下等有稳定关联，或已接受相关检查。',
    source: MEDLINEPLUS('GERD', 'gerd'),
    aliases: ['胃食管反流', '反流性食管炎']
  },
  {
    id: 'physical.irritable-bowel-syndrome', domain: 'PHYSICAL',
    name: '肠易激综合征评估方向', englishName: 'Irritable bowel syndrome', type: 'MEDICAL_CONDITION', typeLabel: '医学评估方向',
    definition: '反复腹痛与排便变化相关的肠—脑互动障碍，可能伴腹泻、便秘或两者交替。',
    boundary: '需要排除其他原因；便血、发热、贫血、夜间症状或非预期体重下降属于需要尽快评估的信号。',
    matchGuidance: '反复腹痛与排便频率或形态变化稳定相关，并持续一段时间。',
    source: MEDLINEPLUS('Irritable Bowel Syndrome', 'irritablebowelsyndrome'),
    aliases: ['肠易激综合征', '肠易激']
  },
  {
    id: 'physical.hypertension', domain: 'PHYSICAL',
    name: '高血压评估方向', englishName: 'Hypertension', type: 'MEDICAL_CONDITION', typeLabel: '医学评估方向',
    definition: '血压在规范测量中持续高于健康范围的状态，往往没有明显症状，需要依靠重复测量判断。',
    boundary: '单次升高可能受测量方式、活动、情绪或咖啡因影响；必须用规范的多次测量或医疗评估确认。',
    matchGuidance: '多个日期的规范血压测量持续升高，或已有医疗记录。不能凭头晕、头痛等非特异症状匹配。',
    source: MEDLINEPLUS('High Blood Pressure', 'highbloodpressure'),
    aliases: ['高血压', '血压升高']
  },
  {
    id: 'physical.prediabetes', domain: 'PHYSICAL',
    name: '糖尿病前期排查方向', englishName: 'Prediabetes', type: 'MEDICAL_CONDITION', typeLabel: '医学排查方向',
    definition: '血糖高于正常范围但尚未达到糖尿病诊断标准的状态，通常依靠血糖或糖化血红蛋白检查发现。',
    boundary: '体重增加、疲劳或饮食变化不能单独说明糖尿病前期，需要规范的实验室检查。',
    matchGuidance: '已有空腹血糖、糖化血红蛋白等客观异常，或医生明确建议复查时匹配。',
    source: MEDLINEPLUS('Prediabetes', 'prediabetes'),
    aliases: ['糖尿病前期', '血糖异常']
  }
];

const CONCEPT_BY_ID = new Map(CONCEPTS.map(concept => [concept.id, concept]));
const CONCEPT_ID_BY_ALIAS = new Map();

function comparable(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s：:（）()·、，,。]/gu, '');
}

for (const concept of CONCEPTS) {
  for (const alias of [concept.name, concept.englishName, ...(concept.aliases || [])]) {
    const key = comparable(alias);
    if (key && !CONCEPT_ID_BY_ALIAS.has(key)) CONCEPT_ID_BY_ALIAS.set(key, concept.id);
  }
}

function publicConcept(concept) {
  if (!concept) return null;
  return {
    id: concept.id,
    name: concept.name,
    englishName: concept.englishName,
    domain: concept.domain,
    type: concept.type,
    typeLabel: concept.typeLabel,
    definition: concept.definition,
    boundary: concept.boundary,
    source: { ...concept.source }
  };
}

function findWellbeingConcept(id) {
  return CONCEPT_BY_ID.get(String(id || '').trim()) || null;
}

function findLegacyWellbeingConcept(name) {
  return findWellbeingConcept(CONCEPT_ID_BY_ALIAS.get(comparable(name)));
}

function conceptCatalogForModel(domain) {
  return CONCEPTS.filter(concept => concept.domain === domain).map(concept => ({
    conceptId: concept.id,
    canonicalName: concept.name,
    englishName: concept.englishName,
    conceptType: concept.type,
    matchGuidance: concept.matchGuidance,
    boundary: concept.boundary
  }));
}

module.exports = {
  WELLBEING_CONCEPT_CATALOG_VERSION,
  conceptCatalogForModel,
  findLegacyWellbeingConcept,
  findWellbeingConcept,
  publicConcept
};
