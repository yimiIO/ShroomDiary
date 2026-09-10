'use strict';

const crypto = require('node:crypto');

const OFFICIAL_USER_ID = 'b7a6f915-5e1d-4b6a-8f31-0f5baea49c21';
const COLLECTION_SLUG = 'human-notes';
const COLLECTION_TITLE = '人类留给自己的提醒';

const PEOPLE = {
  marcus: {
    slug: 'marcus-aurelius',
    name: '马可·奥勒留',
    years: '121—180',
    theme: '内在治理',
    workTitle: '《沉思录》',
    sourceLanguage: '古希腊语',
    sourceUrl: 'https://classics.mit.edu/Antoninus/meditations.html',
    sourceInstitution: 'MIT Internet Classics Archive',
    sourceKind: '写给自己的私人笔记'
  },
  thoreau: {
    slug: 'henry-david-thoreau',
    name: '亨利·戴维·梭罗',
    years: '1817—1862',
    theme: '注意与生活',
    workTitle: '《梭罗日记》及本人作品',
    sourceLanguage: '英语',
    sourceUrl: 'https://www.walden.org/collection/journals/',
    sourceInstitution: 'The Walden Woods Project',
    sourceKind: '长期日记与本人作品'
  },
  darwin: {
    slug: 'charles-darwin',
    name: '查尔斯·达尔文',
    years: '1809—1882',
    theme: '证据与怀疑',
    workTitle: '航海日记、私人日记与研究笔记',
    sourceLanguage: '英语',
    sourceUrl: 'https://darwin-online.org.uk/contents.html',
    sourceInstitution: 'The Complete Work of Charles Darwin Online',
    sourceKind: '日记、田野笔记与自传'
  },
  zhu: {
    slug: 'zhu-kezhen',
    name: '竺可桢',
    years: '1890—1974',
    theme: '长期观察',
    workTitle: '《竺可桢日记》',
    sourceLanguage: '中文',
    sourceUrl: 'https://acv.zju.edu.cn/site/bgxw_view.html?id=508',
    sourceInstitution: '浙江大学档案馆',
    sourceKind: '科学、教育与日常生活日记'
  },
  xu: {
    slug: 'xu-xiake',
    name: '徐霞客',
    years: '1587—1641',
    theme: '身体与探索',
    workTitle: '《徐霞客游记》',
    sourceLanguage: '文言文',
    sourceUrl: 'https://zh.wikisource.org/wiki/%E5%BE%90%E9%9C%9E%E5%AE%A2%E9%81%8A%E8%A8%98',
    sourceInstitution: '维基文库公版文本；故宫博物院资料交叉核对',
    sourceKind: '日记体田野游记'
  },
  tolstoy: {
    slug: 'leo-tolstoy',
    name: '列夫·托尔斯泰',
    years: '1828—1910',
    theme: '道德诚实',
    workTitle: '《日记与笔记本》',
    sourceLanguage: '俄语',
    sourceUrl: 'https://tolstoy.ru/online/90/52/',
    sourceInstitution: '托尔斯泰国家博物馆等合作的90卷本在线版',
    sourceKind: '长期私人日记与笔记本'
  },
  zeng: {
    slug: 'zeng-guofan',
    name: '曾国藩',
    years: '1811—1872',
    theme: '日常修正',
    workTitle: '《曾国藩日记》',
    sourceLanguage: '文言文',
    sourceUrl: 'https://zh.wikisource.org/wiki/%E6%9B%BE%E5%9C%8B%E8%97%A9%E6%97%A5%E8%A8%98',
    sourceInstitution: '维基文库公版文本；中国国家图书馆日记文献资料交叉核对',
    sourceKind: '长期自省与公私生活日记'
  }
};

const provenanceLabels = {
  PARAPHRASE: 'Shroom 转译',
  SYNTHESIS: '编辑综合'
};

function deterministicUuid(value) {
  const bytes = Buffer.from(crypto.createHash('sha256').update(String(value)).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function historicalUserId(personSlug) {
  return deterministicUuid(`shroom:historical-user:${personSlug}`);
}

function historicalUserMobile(personKey) {
  return `__shroom_${personKey}__`;
}

function card(personKey, slug, seedSentence, myUnderstanding, usageItems, tags, options = {}) {
  const person = PEOPLE[personKey];
  const provenanceType = options.provenanceType || 'SYNTHESIS';
  return {
    slug: `${person.slug}-${slug}`,
		ownerUserId: historicalUserId(person.slug),
		ownerPersonKey: personKey,
    collectionSlug: COLLECTION_SLUG,
    seedSentence,
    myUnderstanding,
    usageItems,
    tags: Array.from(new Set([person.theme, ...tags])).slice(0, 4),
    editorialSource: {
      collectionTitle: COLLECTION_TITLE,
      personSlug: person.slug,
      personName: person.name,
      personYears: person.years,
      theme: person.theme,
      provenanceType,
      provenanceLabel: provenanceLabels[provenanceType],
      directQuote: false,
      workTitle: options.workTitle || person.workTitle,
      locator: options.locator || '多条记录编辑综合',
      sourceLanguage: person.sourceLanguage,
      sourceUrl: options.sourceUrl || person.sourceUrl,
      sourceInstitution: person.sourceInstitution,
      sourceKind: person.sourceKind,
      editorialNote: options.editorialNote || '本卡是 Shroom 根据本人记录做的当代转译，不是作者原句。',
      verificationStatus: 'SOURCE_REVIEWED',
      edition: 'Shroom 策展版 v1'
    }
  };
}

const EDITORIAL_CARDS = [
  card('marcus', 'prepare-for-people', '早上出发前，先承认今天可能会遇见难以相处的人。', '预见摩擦不是悲观，而是不让他人的状态临时接管自己。对方的行为与我要成为什么样的人，是两件事。', ['在进入一场可能有冲突的对话前，先决定自己不愿丢掉的品质。', '被冒犯时，先分开“他做了什么”与“我准备怎样回应”。'], ['关系', '情绪'], { provenanceType: 'PARAPHRASE', locator: '卷二·第1节' }),
  card('marcus', 'inner-retreat', '真正能随时回去的安静之地，在自己的心里。', '休息不一定要先换一个地方。当内在的判断恢复秩序，人可以在同一个环境中重新获得空间。', ['想逃离现场时，先给自己三次完整呼吸，再看是环境还是判断在挤压你。', '无法立即休假时，先停止继续制造新的内在噪声。'], ['情绪', '边界'], { provenanceType: 'PARAPHRASE', locator: '卷四·第3节' }),
  card('marcus', 'rock-and-waves', '浪会一次次打来，稳定不是让浪停止。', '我们往往把稳定理解为问题不再出现。更真实的稳定，是冲击来时仍能恢复自己的形状。', ['又一次被同一件事打乱时，不要因“怎么又来了”额外惩罚自己。', '回顾自己需要多久恢复，而不是只看有没有被打倒。'], ['韧性', '情绪'], { provenanceType: 'PARAPHRASE', locator: '卷四·第49节' }),
  card('marcus', 'get-up-for-human-work', '不想起身时，记得人不只是为了舒服而醒来。', '舒适有价值，但不能成为唯一标准。有些时刻，起身是因为有一件只有清醒着的你才能完成的事。', ['拖延时，不问“我想不想”，先问“这件事值不值得我起来”。', '把任务缩小到一个能让身体开始的动作。'], ['行动', '意义'], { provenanceType: 'PARAPHRASE', locator: '卷五·第1节' }),
  card('marcus', 'do-not-become-them', '对伤害最彻底的回应，是不让它把你变成同样的人。', '反击有时必要，边界也必须清楚。但如果回应复制了对方的残酷和失真，伤害就已经进入了自己的人格。', ['准备报复时，先写下你不愿意复制的那种品质。', '设立边界时，让边界保护你，而不是让愤怒定义你。'], ['关系', '边界'], { provenanceType: 'PARAPHRASE', locator: '卷六·第6节' }),
  card('marcus', 'renew-principles', '知道过的道理也会死去，除非你在真实时刻重新想起它。', '理解不会因为曾经读懂就永久有效。菇卡的价值正在于，它把抽象道理送回到需要它的那个时刻。', ['已经明白却又没做到时，不说自己虚伪，先检查提醒是否来得太晚。', '为重要原则找到一个清晰的触发情境。'], ['菇卡', '反思'], { provenanceType: 'PARAPHRASE', locator: '卷七·第2节' }),
  card('marcus', 'judgment-and-event', '事情发生在外部，它的意义却常在我的判断里被放大。', '这不是否认疼痛或现实，而是为自己保留一小块可调整的地方：我如何描述它，是否已经把最坏的解释当成了事实。', ['情绪升高时，分别写下事实、解释和担心。', '不用强迫自己积极，只需把还未发生的部分从事实里移出。'], ['情绪', '判断'], { provenanceType: 'PARAPHRASE', locator: '卷八·第47节' }),
  card('marcus', 'self-love-and-opinion', '我们明明最重视自己，却常把别人的看法放在自己的判断之上。', '对认可的需要很真实。但当外部评价比自己的证据更有权力，人就会开始为他人的目光生活。', ['因一句评价怀疑自己时，问对方看到了哪些你没看到的证据。', '如果只是喜好不同，允许自己保留原判断。'], ['自我', '关系'], { provenanceType: 'PARAPHRASE', locator: '卷十二·第4节' }),

  card('thoreau', 'look-versus-see', '决定你经验深度的，不只是你看向哪里，而是你究竟看见了什么。', '同一个地方可以被路过，也可以被发现。注意力不是信息的数量，而是与眼前之物真正发生关系。', ['一天感觉空白时，回想一个今天真正看见的细节。', '重走一条熟悉的路，寻找一个以前从未命名的变化。'], ['注意', '日常'], { provenanceType: 'PARAPHRASE', locator: '日记·1851年8月5日' }),
  card('thoreau', 'stand-up-to-live', '如果还没有站起来生活，坐下来时就很难写出真实的东西。', '输入不能永远代替经验。当写作开始空转，需要的可能不是更多素材，而是重新进入一个真实现场。', ['写不下去时，先去走路、谈话、观察或完成一件实际的事。', '回来后先写发生了什么，暂时不追求结论。'], ['写作', '行动'], { provenanceType: 'PARAPHRASE', locator: '日记·1852年1月30日' }),
  card('thoreau', 'ordinary-nearby-world', '不要因为一个地方太熟悉，就认定它已经没有新事物。', '梭罗多年反复记录康科德周边。长期观察证明，新鲜感不一定来自远方，也可以来自观察尺度的变化。', ['觉得生活重复时，选一件附近的事连续观察七天。', '不问“今天有什么大事”，改问“哪个小变化值得记住”。'], ['日常', '长期主义']),
  card('thoreau', 'wakefulness', '真正醒着，不只是睡眠结束，而是开始知道自己正在怎样生活。', '人可以非常忙碌，同时对自己的生活几乎毫无知觉。清醒的标志是，能在行动中看见自己正在成为谁。', ['忙了很久后，问“这些事正在把我带向哪里”。', '对一个习以为常的选择，重新说出它的代价。'], ['觉察', '生活'], { provenanceType: 'PARAPHRASE', workTitle: '《瓦尔登湖》', locator: '“我生活的地方；我生活的目的”' }),
  card('thoreau', 'simplify-to-see', '简化不是把生活变小，而是减少那些让你看不清真正重要之物的噪声。', '当每件事都在要求反应，人会把响应速度误当成生活密度。简化的目的是恢复选择，不是表演清心寡欲。', ['觉得一切都很重要时，列出真正会改变结果的两件事。', '删去一个只是为了维持忙碌形象的安排。'], ['取舍', '注意'], { provenanceType: 'PARAPHRASE', workTitle: '《瓦尔登湖》', locator: '“我生活的地方；我生活的目的”' }),
  card('thoreau', 'solitude-is-relation', '孤独不是周围没有人，而是你能否在没有回声时仍和自己相处。', '独处可以是恢复，也可以是逃避。区别在于，它是否让你更能回到世界，还是让你更害怕与人连接。', ['想要躲开所有人时，问这段独处要保护什么。', '独处结束后，看自己是更开放还是更封闭。'], ['孤独', '关系'], { provenanceType: 'PARAPHRASE', workTitle: '《瓦尔登湖》', locator: '“孤独”' }),
  card('thoreau', 'wildness-and-control', '有些生命力只有在不被完全控制时，才能继续生长。', '效率和秩序很重要，但人不是一台只有产出的机器。保留一些不为结果服务的时间，是为了不让整个人被单一目标耗尽。', ['日程被填满时，保留一小段不需要产出的行走或凝视。', '评估一个选择时，除了效率，也问它是否让你更有生命力。'], ['自由', '精力'], { provenanceType: 'PARAPHRASE', workTitle: '《步行》', locator: '全文主题' }),
  card('thoreau', 'seasons-of-self', '当你连续观察得足够久，才会知道什么是异常，什么只是季节。', '一天的低落很容易被解释成“我已经变差了”。长期记录会显示，很多状态有它的气候，不必每次都变成身份判决。', ['用一次低谷定义自己前，回看去年同期与最近三次类似时刻。', '先给反复出现的状态命名，再决定是接纳季节还是修改环境。'], ['长期主义', '情绪']),

  card('darwin', 'record-counterevidence', '越喜欢一个解释，越要先记下那些不支持它的事实。', '支持自己的证据很容易被记住，反例却会很快消失。主动保存反例，是为了保护思考不被偏好劫持。', ['当你说“我早就知道”时，立即写下一个可能推翻它的事实。', '为重要判断保留一栏：什么出现时，我会改变结论。'], ['证据', '判断'], { provenanceType: 'PARAPHRASE', workTitle: '《自传》', locator: '关于及时记录反例的“黄金规则”' }),
  card('darwin', 'let-uncertainty-live', '一个问题暂时没有答案，不等于它必须立即被一个粗糙结论填满。', '不确定很不舒服，但它也是新证据进入的空间。过早命名会让观察只能服务于已有答案。', ['被催促表态时，允许自己说清“目前知道什么”和“还不知道什么”。', '为未解问题设一个下次检查点，而不是用焦虑反复审判。'], ['怀疑', '学习']),
  card('darwin', 'small-differences-matter', '重大变化往往不会一开始就以重大变化的样子出现。', '田野记录的价值，在于保留当时还不知道有什么用的差异。当规律浮现时，这些小差异才变成证据。', ['觉得一个变化太小不值得记时，先记下它与平常哪里不同。', '分析前保留原始描述，不要只留下结论。'], ['观察', '变化'], { locator: '根据《比格尔号航海日记》与田野笔记编辑综合' }),
  card('darwin', 'tree-not-ladder', '发展更像分叉的树，不是所有人都必须爬的同一架梯子。', '树状思考允许多种路径同时成立。对个人成长也一样：放弃一条路不一定是退步，也可能是分化出更适合的方向。', ['因为没有走主流路径而焦虑时，画出你已经生长出的分支。', '比较时先问：我们是在同一枝上，还是已经去了不同方向？'], ['成长', '路径'], { provenanceType: 'PARAPHRASE', workTitle: '物种转化笔记 B', locator: '第36页“I think”树状草图' }),
  card('darwin', 'observation-before-explanation', '先让事物被准确描述，再让理论来解释它。', '理论可以指导观察，也可以让我们只看见想看见的部分。把描述与解释分开，才能在以后重新阅读证据。', ['复盘争执时，先写可被录像记下的部分，再写各自解释。', '做决策记录时，分成观察、假设、预测三栏。'], ['证据', '反思'], { locator: '根据航海日记与研究笔记的工作方式编辑综合' }),
  card('darwin', 'patience-with-facts', '耐心不只是等待，而是在结论还没成形时仍然继续观察。', '长期问题很少在一次灵感中完成。真正的耐心包含重复检查、保留异常、承认无法解释，然后再回来。', ['重要问题没有进展时，记录现在缺少的证据，而不是反复得出同一结论。', '把“暂时不知道”当成一个合法状态。'], ['耐心', '学习'], { provenanceType: 'PARAPHRASE', workTitle: '《自传》', locator: '关于科学工作能力的自述' }),
  card('darwin', 'travel-changes-scale', '走到一个不熟悉的世界，会暴露出哪些常识只是当地习惯。', '旅行的价值不只是新鲜。它让我们的默认前提失效，迫使观察重新开始。', ['对自己的环境做绝对判断时，问换一个生态或文化是否仍然成立。', '旅行中优先记录冲击你常识的细节，而不只是景点。'], ['旅行', '观察'], { locator: '根据《比格尔号航海日记》编辑综合' }),
  card('darwin', 'change-the-model', '好的思考不是为了永远证明自己正确，而是让模型能在证据前改变。', '改变看法不是判断力失败，恰恰可能是判断力正在工作。真正危险的是为了保住一致而继续丢掉反例。', ['准备承认以前判断错了时，说清是哪条新证据改变了你。', '不问“谁输了”，先问“现在的模型能否解释更多现象”。'], ['学习', '判断'], { locator: '根据物种转化笔记和长期研究过程编辑综合' }),

  card('zhu', 'record-before-meaning', '今天看似普通的数字，可能是多年后才能读懂的证据。', '长期记录的困难在于，记录当下常常看不见回报。但如果只记那些已经知道重要的事，就无法发现新的长期变化。', ['觉得今天无事可记时，留下一个可比较的事实。', '记录一个变量时，保持单位、口径和时间尺度一致。'], ['记录', '证据']),
  card('zhu', 'separate-observation', '先写天气如何，再写你喜不喜欢这样的天气。', '观察和评价都有价值，但它们混在一起时，以后就无法知道当时究竟发生了什么。', ['日记里的“他不在乎我”，先改写成可观察的行为和自己的感受。', '情绪可以保留，但给它单独的位置。'], ['观察', '日记']),
  card('zhu', 'long-series', '单独一天只是天气，连续很多年才能看见气候。', '个人生活也存在天气和气候的区别。一次不愉快不等于长期不幸福；反复多年的模式也不应被当成偶然。', ['判断今年的自己时，使用按天去重后的记录，不让一篇极端日记代表全年。', '发现重复模式后，再去寻找例外日期。'], ['长期主义', '情绪']),
  card('zhu', 'ordinary-days', '不只记转折点；普通日子才是人生的基线。', '只记大事会制造一种错觉，仿佛人生由少数高潮和灾难组成。普通日子提供对照，让我们知道异常到底有多异常。', ['没有想法时，只记一件做过的事、一次感受和一个身体状态。', '回看时不只搜索痛苦或成就，也看平常的生活是什么样。'], ['日常', '日记']),
  card('zhu', 'record-through-crisis', '越是秩序破碎的时候，越需要留下不被当时情绪完全改写的记录。', '危机中的记录不是要求冷酷，而是同时保留事实、感受和决定。这使未来的自己不必只依赖回忆重建现场。', ['处在混乱期时，留下今天已知、未知与已决定各一条。', '允许日记不完整，但不要把它全部交给事后记忆。'], ['韧性', '记录'], { locator: '根据抗战时期西迁与办学日记编辑综合' }),
  card('zhu', 'revise-with-data', '忠于事实，包括当事实要求你修改自己时。', '求是不只是对外界的研究态度，也是对自己判断的约束。持续记录的意义，不是为旧结论积累材料，而是让结论可以被修订。', ['新证据与自己的故事冲突时，先保留证据，不急着为故事辩护。', '修改判断时，记下哪个事实促成了变化。'], ['求是', '判断']),
  card('zhu', 'public-role-private-record', '责任越大，越需要一个不为形象服务的记录空间。', '公开角色会要求确定、稳定和可解释。私人日记可以保留迟疑、疲惫与矛盾，使人不必在形象中失去自己。', ['对外必须给出结论后，对内仍然记下你的保留和担心。', '不把日记写成给未来观众看的个人公关稿。'], ['责任', '真实']),
  card('zhu', 'measurement-needs-context', '没有口径和背景的数字，很容易只是一种更像真相的错觉。', '记录数字不自动等于客观。测量方式、时间、位置和异常条件，决定了它以后能不能被正确比较。', ['记录情绪、睡眠或效率时，连同重要环境变量一起记。', '看到统计结论时，先问它如何定义和测量。'], ['证据', '统计']),

  card('xu', 'feet-before-map', '地图告诉你可能有路，脚下的地形才决定路是什么。', '间接信息能帮助出发，但不能代替现场。当计划与真实地形冲突，需要修改的是计划，不是现实。', ['项目开始后出现计划外难度时，重新画现场地图，不只是加速执行旧计划。', '使用他人经验时，标注哪些条件与你不同。'], ['探索', '现实']),
  card('xu', 'ask-and-verify', '向当地人问路，但也要继续看山势与水流。', '他人的经验是证据，但不是全部证据。有效的探索同时依赖请教和验证，不在盲从与自负之间二选一。', ['听到一个确定建议时，问对方在什么条件下得出它。', '对高代价选择，至少再寻找一种独立证据。'], ['学习', '判断']),
  card('xu', 'body-is-instrument', '身体不只是把你送到目的地的工具，它本身就在提供信息。', '疲惫、呼吸、恐惧和节奏都是现场数据。忽略它们可能导致危险，过度解读也可能让探索过早结束。', ['运动、旅行或高压工作中，区分身体的危险信号和对不适的正常反应。', '记录当时的身体条件，别只写意志品质。'], ['身体', '边界']),
  card('xu', 'difficulty-without-romance', '困难可以被穿过，但不必被美化成成长的唯一道路。', '探索者容易把受苦当成价值证明。真实记录会保留断粮、迷路和盗抢，也提醒我们：危险不因故事动人就变得必要。', ['准备为一个目标承受巨大代价时，问有没有更聪明而不损害目标的路。', '复盘成就时，同时记录本可避免的损失。'], ['冒险', '边界']),
  card('xu', 'follow-the-water', '遇到复杂局面时，先找那条真正连接了各部分的水流。', '徐霞客对山脉与水系的追索提供了一种系统视角：不被孤立景象吸引，而是寻找它们之间持续的结构。', ['面对多个表面问题时，问它们是否由同一条资源流、信息流或关系流串起。', '不急着分别修补每个症状，先画出它们如何相连。'], ['系统', '观察']),
  card('xu', 'route-can-change', '改路不等于放弃目的地，有时它是对现实最诚实的忠诚。', '把计划当成承诺，容易让人忽视新的地形。真正不变的应该是探索目的，而不是每一个最初步骤。', ['执行受阻时，分开不能改的目的与可以改的路线。', '改计划时记录新证据，避免改路变成漫无目的。'], ['行动', '路径']),
  card('xu', 'fear-and-terrain', '恐惧有时在告诉你有危险，有时只是在告诉你地形陌生。', '勇气不是忽略恐惧，而是继续收集足够信息，分辨真实危险和陌生感。两者需要的回应不同。', ['恐惧出现时，具体指出你预测哪件事会发生。', '找一个低成本的现场测试，而不是盲目冲过去或立刻退回去。'], ['恐惧', '探索']),
  card('xu', 'journey-as-evidence', '一次旅行的价值，不只在于我到达了哪里，也在于我对世界的哪个判断被改变了。', '到达可以被照片证明，但只有记录能保留路上的认知变化。一次探索如果没有修改任何预设，它可能只是地理移动。', ['旅行结束后，记下一个被推翻的想象和一个新出现的问题。', '不只整理美好瞬间，也保留迷路、失败和修改路线的时刻。'], ['旅行', '成长']),

  card('tolstoy', 'ideal-behavior-gap', '不要只记得自己相信什么，也要记得今天实际怎样做了。', '价值观与行为之间的差距不是一次羞耻审判，而是修正自己的真实起点。只保留理想中的自己，就无法看见变化。', ['说“我很重视”时，回看最近一周它得到了多少时间和行动。', '不用立即自责，先准确命名差距出现在哪个情境。'], ['反思', '价值']),
  card('tolstoy', 'vanity-in-goodness', '做好事时，也要留意自己是否正在追求“我是好人”的形象。', '行为可以对他人有益，动机也可以同时混有虚荣。看见混合动机不会抹消行动价值，只是防止自我形象开始要求回报。', ['帮助别人后感到失望时，问自己是否隐含了对感激、服从或名声的期待。', '让一件好事在不必被看见的情况下仍然成立。'], ['虚荣', '关系'], { locator: '根据多卷日记中对公益、虚荣与道德动机的反复检查编辑综合' }),
  card('tolstoy', 'self-critique-without-hate', '自我检查的目的是看得更真，不是让自己更值得被憎恨。', '严厉的日记容易滑向自我惩罚。如果反省只产生羞耻而没有更清楚的下次识别，它也可能变成另一种自我沉溺。', ['写下一个失败后，补上当时可观察的触发点。', '把“我就是这样”改成“我在这种情境下容易这样”。'], ['自我', '反思']),
  card('tolstoy', 'desire-after-achievement', '愿望实现后仍然空虚，可能不是得到得还不够，而是它原本就无法回答那个问题。', '欲望容易向我们承诺一个永久状态，而现实只提供短暂感受。获得之后的感受，是检查欲望判断力的重要证据。', ['实现一个目标后，不只记结果，也记它在一周后还剩下什么。', '新欲望出现时，问它承诺解决的究竟是哪个感受。'], ['欲望', '目标']),
  card('tolstoy', 'mortality-clarifies', '死亡不只结束生活，它也暴露了哪些事只在我们假装时间无限时才显得重要。', '想到有限不必导向恐慌。它可以是一种取舍工具：把名声、怨恨和拖延放到有限时间里重新称量。', ['被琐事长期占据时，问如果今年是有限的，还会如何分配注意。', '不用死亡催促自己完成一切，只让它帮你放下一些不必完成的事。'], ['死亡', '取舍']),
  card('tolstoy', 'beliefs-must-survive-life', '一个道理如果只能在书房里成立，它还没有真正进入生活。', '信念的价值不只在论证漂亮，还在它能否经过家庭、金钱、欲望和权力的实际摩擦。日记是信念的压力测试。', ['写下一条价值原则时，同时写一个它最容易失效的具体场景。', '不用为了保护原则而删掉反例；用反例修改原则。'], ['价值', '生活']),
  card('tolstoy', 'begin-again', '今天没有活成想要的样子，不等于明天只能继续证明失败。', '反复立志与失败可能显得滑稽，但重新开始仍然比把失败固定成身份更真实。关键是每次开始都带着对触发条件更准确的认识。', ['再次违背承诺时，不只重复承诺，补上上次失效的环境原因。', '让下一次开始比上一次更小、更早、更具体。'], ['重新开始', '反思']),
  card('tolstoy', 'truth-before-image', '当一个真相会破坏自己的形象时，它才真正在考验我们对真实的忠诚。', '人很容在无损自尊时喜欢诚实。真正的自我认识，要允许记录中出现不体面、不一致与没有解决的部分。', ['想删掉一段不好看的日记时，先问它保留了什么重要证据。', '分享自己时可以保护隐私，但不必在私人记录里继续维护公开形象。'], ['真实', '自我']),

  card('zeng', 'daily-audit-not-trial', '每日自省是为了修正下一次，不是每晚重新审判自己值不值得。', '自省一旦变成道德法庭，就容易只产生羞耻和自我表演。有价值的反省应当让下一次识别更早、回应更清楚。', ['复盘一天时，只选一个对明天有影响的修正点。', '如果反省只剩“我不好”，继续问“下次哪个瞬间可以更早看见”。'], ['自省', '日常']),
  card('zeng', 'anger-arrives-early', '愤怒真正爆发之前，往往已经在身体、语气和解释里出现了。', '“不发火”太晚了，因为它只在最后一刻要求意志力取胜。记录反复冲突的价值，在于找到更早的身体与认知信号。', ['下次生气后，不只记对方做了什么，也记爆发前五分钟的身体变化。', '把“他根本不尊重我”识别为解释，先回到可观察事实。'], ['愤怒', '关系']),
  card('zeng', 'consistency-over-intensity', '一次极端用力，往往不如一个能经过普通日子的节律。', '强度容易带来改变感，但节律才能形成可检查的长期结果。真正的功课需要在疲惫、旅途和低谷中仍有最小版本。', ['制定新习惯时，先定义最糟糕一天也能完成的版本。', '不用热情的峰值评估自己，看四周之后还在不在。'], ['习惯', '长期主义']),
  card('zeng', 'boasting-spends-future', '夸口常常提前消费了那件事尚未赢得的满足感。', '把计划说得很完整，会让自我形象先得到奖励。言语不必减少承诺，但要防止承诺替代实际进展。', ['很想宣布一个新计划时，先完成第一个不可撤回的小步骤。', '分享进展时，区分已完成、正在做和只是想做。'], ['行动', '虚荣']),
  card('zeng', 'one-correction-at-time', '当每个问题都被同时定为紧急，修正往往只会变成一场情绪。', '一次要改造全部自己，会使失败无法定位。把注意力放在一个可识别的旧模式上，才能看见修正是否真正发生。', ['想同时重启生活的多个方面时，选一个对其他部分有连锁影响的模式。', '给其他问题留在候选层，不假装它们已经被处理。'], ['修正', '取舍']),
  card('zeng', 'same-standard-for-self', '不要用意图审理自己，却用结果审理别人。', '我们对自己知道背景和动机，对别人却只看到行为。这种不对称会让自省与待人使用完全不同的标准。', ['对他人做人格判断前，用解释自己类似失误的宽度重述一次。', '对自己辩护时，也问这个意图最后给他人带来了什么结果。'], ['关系', '反思']),
  card('zeng', 'recover-after-lapse', '破戒之后最危险的，不是那一次失败，而是“既然已经失败”带来的连续放弃。', '一个失误容易被延伸成整天、整周和对自己的总结。恢复能力比绝不失败更可持续。', ['失误出现后，把恢复点放在下一个时段，不等明天或下周。', '记录从失败到恢复用了多久，把缩短这个时间当成进步。'], ['习惯', '韧性']),
  card('zeng', 'read-power-critically', '一个人能严格检查自己，仍然可能看不见自己所在的权力结构。', '私人日记能提供稀缺的内在证据，但不能自动使作者超越时代。读曾国藩时，应同时看他的自我修养、政治位置与行动后果。', ['学习历史人物的方法时，同时问谁承担了这种方法的代价。', '不把能力、成就或自律自动等同于道德正确。'], ['权力', '历史'], { editorialNote: '本卡是 Shroom 对日记史料的批判性编辑综合，用于防止将历史人物包装成无争议的“完美导师”，不是曾国藩原句。' })
];

module.exports = {
  COLLECTION_SLUG,
  COLLECTION_TITLE,
  deterministicUuid,
  EDITORIAL_CARDS,
	historicalUserId,
	historicalUserMobile,
  OFFICIAL_USER_ID,
  PEOPLE
};
