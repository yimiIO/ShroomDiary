'use strict';

const POINT_CENTS_PER_POINT = 100;
const FEATURE_PRICE_POINT_CENTS = 1000;
const SEVEN_DAY_REWARD_POINT_CENTS = 100;
const SEVEN_DAY_CAMPAIGN_KEY = 'seven_day_diary_v1';
const LEGAL_VERSION = '2026-09-18-4';

const FEATURES = Object.freeze({
  compound: {
    key: 'compound',
    name: '复利系统',
    description: '结构化记录复利计划、进度、本金、回报与验证证据。'
  },
  inquiries: {
    key: 'inquiries',
    name: '未解之问',
    description: '保留长期问题、连接新线索并查看可修订的阶段理解。'
  },
  wellbeing: {
    key: 'wellbeing',
    name: '身心问题',
    description: '结构化整理身心状态与长期变化；不构成医疗诊断。'
  }
});

const LEGAL_DOCUMENTS = Object.freeze({
  terms: {
    key: 'terms',
    title: '菇用户服务协议',
    version: LEGAL_VERSION
  },
  privacy: {
    key: 'privacy',
    title: '菇隐私政策',
    version: LEGAL_VERSION
  },
  recharge: {
    key: 'recharge',
    title: '菇点充值与使用规则',
    version: LEGAL_VERSION
  },
  refund: {
    key: 'refund',
    title: '菇退款规则',
    version: LEGAL_VERSION
  }
});

function points(pointCents) {
  return Number((Number(pointCents || 0) / POINT_CENTS_PER_POINT).toFixed(2));
}

function pointCentsFromYuan(amountYuan) {
  const value = Number(amountYuan);
  if (!Number.isFinite(value)) return null;
  const rawCents = value * POINT_CENTS_PER_POINT;
  const cents = Math.round(rawCents);
  if (Math.abs(rawCents - cents) > 1e-8) return null;
  return cents > 0 ? cents : null;
}

function aiChargePointCents(costCny, multiplier = 2.5) {
  if (costCny === null || costCny === undefined || costCny === '') return null;
  const cost = Number(costCny);
  if (!Number.isFinite(cost) || cost < 0) return null;
  return Math.max(1, Math.ceil(cost * Math.max(1, Number(multiplier) || 2.5) * POINT_CENTS_PER_POINT));
}

function dayNumber(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) ? Math.floor(value / 86400000) : null;
}

function streakStatus(dateValues, today) {
  const days = [...new Set((Array.isArray(dateValues) ? dateValues : [])
    .map(dayNumber).filter(value => value !== null))].sort((a, b) => a - b);
  const todayNumber = dayNumber(today);
  let runStart = null;
  let previous = null;
  let best = { days: 0, start: null, end: null };
  let latest = { days: 0, start: null, end: null };
  for (const current of days) {
    if (previous === null || current !== previous + 1) runStart = current;
    const runDays = current - runStart + 1;
    if (runDays >= best.days) best = { days: runDays, start: runStart, end: current };
    latest = { days: runDays, start: runStart, end: current };
    previous = current;
  }
  const active = todayNumber !== null && latest.end !== null && todayNumber - latest.end <= 1;
  const currentDays = active ? latest.days : 0;
  const format = value => value === null ? null : new Date(value * 86400000).toISOString().slice(0, 10);
  return {
    qualified: best.days >= 7,
    currentDays: Math.min(7, currentDays),
    bestDays: best.days,
    remainingDays: Math.max(0, 7 - currentDays),
    qualifyingStartDate: best.days >= 7 ? format(best.end - 6) : null,
    qualifyingEndDate: best.days >= 7 ? format(best.end) : null,
    latestDate: format(latest.end)
  };
}

function merchantStatus(config) {
  const billing = config || {};
  const legalName = String(billing.merchantLegalName || '').trim();
  const invoiceName = String(billing.invoiceLegalName || '').trim();
  const subjectConsistent = Boolean(legalName && invoiceName && legalName === invoiceName);
  const missing = [];
  for (const [key, value] of [
    ['BILLING_MERCHANT_LEGAL_NAME', legalName],
    ['BILLING_INVOICE_LEGAL_NAME', invoiceName],
    ['BILLING_MERCHANT_TAX_ID', billing.merchantTaxId],
    ['BILLING_MERCHANT_ADDRESS', billing.merchantAddress],
    ['BILLING_CUSTOMER_SERVICE', billing.customerService],
    ['BILLING_ICP_QUALIFICATION', billing.icpQualification]
  ]) if (!String(value || '').trim()) missing.push(key);
  if (billing.legalReviewConfirmed !== true) missing.push('BILLING_LEGAL_REVIEW_CONFIRMED');
  if (!subjectConsistent) missing.push('BILLING_SUBJECT_MISMATCH');
  return { ready: missing.length === 0, subjectConsistent, missing };
}

function commercialRollout(mode, h5Live = false) {
  const normalizedMode = ['preview', 'live'].includes(mode) ? mode : 'disabled';
  const phase = h5Live ? 'PARTIAL_LIVE' : normalizedMode === 'disabled' ? 'FREE_BETA' : 'COMPLIANCE_REVIEW';
  const copy = {
    FREE_BETA: {
      title: '当前为免费测试期',
      description: 'H5 用于体验和验证产品；现在不会充值或扣费，写日记和现有功能照常使用。'
    },
    COMPLIANCE_REVIEW: {
      title: '收费方案准备中',
      description: '价格可以查看，但真实充值只会在备案、渠道审核和商户配置全部通过后开放。'
    },
    PARTIAL_LIVE: {
      title: 'H5 充值已开放',
      description: '当前仅支持个人微信内的菇日记 H5 页面；小程序和原生 APP 仍分别等待虚拟支付与应用商店内购接入。'
    }
  }[phase];
  return {
    phase,
    chargingLive: Boolean(h5Live),
    ...copy,
    channels: [
      {
        key: 'H5',
        name: 'H5',
        role: '当前体验与补充入口',
        status: h5Live ? 'LIVE' : normalizedMode === 'disabled' ? 'FREE_BETA' : 'REVIEWING',
        statusLabel: h5Live ? '已开放充值' : normalizedMode === 'disabled' ? '免费测试' : '资质审核中'
      },
      {
        key: 'MP_WEIXIN',
        name: '微信小程序',
        role: '未来主要入口',
        status: 'PLANNED',
        statusLabel: '待接入虚拟支付'
      },
      {
        key: 'APP',
        name: '原生 APP',
        role: '未来主要入口',
        status: 'PLANNED',
        statusLabel: '待接入应用商店内购'
      }
    ]
  };
}

function legalDocument(key, merchant = {}) {
  const definition = LEGAL_DOCUMENTS[key];
  if (!definition) return null;
  const operator = String(merchant.legalName || '').trim() || '收费主体尚未配置';
  const address = String(merchant.address || '').trim() || '尚未配置';
  const service = String(merchant.customerService || '').trim() || '尚未配置';
  const common = {
    ...definition,
    operator,
    operatorAddress: address,
    customerService: service,
    merchantTaxId: String(merchant.taxId || '').trim(),
    icpQualification: String(merchant.icpQualification || '').trim(),
    appFilingNumber: String(merchant.appFilingNumber || '').trim()
  };
  const sections = {
    terms: [
      ['协议主体', `菇日记由「${operator}」向用户提供服务，经营地址为 ${address}，客服联系方式为 ${service}。收款、退款和开票由同一主体承担。`],
      ['协议生效', '用户注册前应完整阅读本协议和隐私政策；主动勾选并提交注册即表示接受当前版本。涉及充值或数字功能时，用户还需另行确认充值与退款规则。'],
      ['免费服务', '注册、写日记、查看和导出自己的日记不收费。'],
      ['付费服务', '高级功能解锁费与 AI 调用费分开。收费 AI 调用前按最大可能用量核验可用余额，但不预扣款；成功交付后只按实际 Token 用量结算，不会形成用户欠额。'],
      ['账户安全', '用户应妥善保管账户与登录凭证，并对本人授权的操作负责。发现异常登录、未授权充值或扣费时，应及时联系客服。'],
      ['使用边界', '用户不得利用服务侵害他人合法权益、绕过权限、攻击系统或实施违法活动。菇可以为保护用户和系统安全限制异常请求，并保留可申诉入口。'],
      ['用户数据', '日记与个人数据仍归用户控制。付费不会扩大菇对用户数据的授权范围。'],
      ['服务变更与停止', '影响价格、付费权益或个人信息处理的重要变更会显著提示，不以默认勾选替代同意。经营者停止服务时会提前公告，并依法处理未消费充值余额和用户数据导出。'],
      ['知识产权', '用户保留其日记和自行创作内容的合法权利；菇的软件、界面、商标和系统内容由相应权利人依法享有权利。'],
      ['未成年人', '未满十八周岁的用户进行充值或购买前，应取得监护人同意；未经有效同意的异常充值可由监护人联系客服核验处理。'],
      ['责任与救济', '因不可抗力、通信网络或第三方服务造成中断时，经营者会采取合理措施减少影响；本条不排除法律规定不得限制的责任，也不影响用户依法主张修理、重做、继续履行、退款或赔偿。'],
      ['联系与争议', `客服联系方式：${service}。用户可就扣费、退款或数据问题发起申诉；经营者未按约提供服务时，用户可要求继续履行或退还相应未消费预付款。争议优先协商，协商不成时依法向有管辖权的机构主张权利。`]
    ],
    privacy: [
      ['处理者信息', `个人信息处理者为「${operator}」，经营地址为 ${address}，隐私与数据请求联系方式为 ${service}。`],
      ['收集范围', '为完成账户、支付与对账，菇会保存账户标识、订单号、金额、菇点流水、支付状态和协议接受版本。'],
      ['支付信息', '银行卡号、支付密码等由支付机构处理，菇不保存支付密码或完整银行卡信息。'],
      ['日记与 AI', '日记正文、媒体、外部数据源和 AI 派生结果按产品内的授权开关处理。第三方 AI 或语音服务只在相应功能需要且用户授权时接收完成任务所必需的数据。'],
      ['每日总结与邮件', '菇每日总结只读取用户允许 AI 使用的当天记录，并保存来源和数据截止时间。网页内总结由用户主动打开；只有用户验证邮箱并单独开启后，系统才会在当天未查看时于 22:00 生成并把私人总结正文交给邮件服务发送。用户可随时关闭，未验证邮箱不发送。'],
      ['敏感个人信息', '身心健康、金融账户和未满十四周岁未成年人的信息属于敏感个人信息。身心分析使用独立提示和同意，不因接受一般协议而自动开启。'],
      ['共享与委托处理', '为提供服务，必要数据可能交由云存储、AI、语音识别和支付机构处理；各处理方仅按约定目的和安全要求处理。除法律要求或另行明确同意外，不向无关第三方提供。'],
      ['目的与最小化', '交易数据仅用于入账、扣费、对账、退款、开票、风险控制和依法留存；其他个人数据仅在实现已说明功能所必需的范围内处理。'],
      ['保存期限', '账户和日记数据保存至用户删除或注销；交易、发票、退款和安全记录按法定期限留存。超过必要期限后删除或匿名化，法律要求继续保存时停止其他处理。'],
      ['用户权利', '用户可查看菇点流水和系统已知内容，并依据法律和产品能力申请访问、复制、导出、更正、撤回授权、删除或注销。撤回不影响此前基于有效授权完成的处理。'],
      ['安全与事件', '菇使用账户隔离、凭证散列、权限控制和最小化日志保护数据；发生可能影响用户权益的安全事件时，将依法采取补救并履行通知义务。'],
      ['规则更新', '处理目的、方式或范围发生重大变化时会发布新版本并依法重新取得同意，不以继续使用默认为同意。']
    ],
    recharge: [
      ['交易主体', `菇点充值和付费服务由「${operator}」提供，经营地址 ${address}，客服 ${service}。支付前页面展示具体金额和所得菇点。`],
      ['菇点价值', '1 元充值可得 1 菇点。菇点仅可用于菇日记内的服务，不可转赠、交易或兑换现金。'],
      ['支付渠道', 'H5 充值仅在个人微信内通过微信支付完成。微信小程序内的菇点属于虚拟服务，在微信虚拟支付能力通过审核并完成独立接入前，不使用普通小程序支付，也不引导用户到外部付款。'],
      ['账户分开', '充值菇点与活动赠送菇点分开记录。消费时优先使用赠送菇点。'],
      ['计费规则', '付费功能解锁价格为每项 10 菇点。AI 服务按供应商返回的实际 Token 用量、当次保存的公开单价快照与 2.5 倍倍率结算，最小计费单位为 0.01 菇点。调用前的保守额度校验不是预扣款。'],
      ['失败不扣费', '系统失败、异常重试、重复扣费或没有产生可用结果的 AI 调用，不向用户收费。'],
      ['余额与停服', '充值菇点在账户和服务正常期间不设置额外失效期。经营者停止服务或未按约提供服务时，用户可依法要求退回未消费充值余额。'],
      ['开票', `充值后可通过 ${service} 申请合法有效的发票。开票主体与收款主体均为「${operator}」。`]
    ],
    refund: [
      ['充值余额', '未消费的充值菇点可申请按原支付路径退回。赠送菇点不可提现、退款或转赠。'],
      ['AI 服务', '调用失败、重复扣费或未生成有效结果时退回菇点。已成功交付的 AI 结果原则上不退款，用户仍可就异常质量问题申诉。'],
      ['功能解锁', '高级功能在用户二次确认后立即开通，已正常开通的数字功能不属于未消费充值余额；重复扣费、未开通或服务异常可以申诉并核验退回。'],
      ['申请材料', '退款申请需要说明金额和原因；处理方可以在必要范围内核对账户、原支付订单和付款人与申请人的关系，不要求提供与退款无关的信息。'],
      ['处理方式', `请通过产品内入口或 ${service} 发起退款申请。收到完整申请后 7 个工作日内完成审核；审核通过后由「${operator}」发起原路径退款，实际到账时间以支付机构处理为准。`],
      ['余额保护', '申请提交后，相应充值余额会冻结且不能继续消费；申请被拒绝或失败时解除冻结，成功退款后按实际退回金额完成账务核销。'],
      ['法定权利', '本规则不排除用户依照消费者权益保护、未成年人保护或其他适用法律享有的权利；重复扣费、欺诈交易或未履约争议按法律和支付机构规则处理。']
    ]
  };
  return { ...common, sections: sections[key] };
}

module.exports = {
  FEATURES,
  FEATURE_PRICE_POINT_CENTS,
  LEGAL_DOCUMENTS,
  LEGAL_VERSION,
  POINT_CENTS_PER_POINT,
  SEVEN_DAY_CAMPAIGN_KEY,
  SEVEN_DAY_REWARD_POINT_CENTS,
  aiChargePointCents,
  commercialRollout,
  legalDocument,
  merchantStatus,
  pointCentsFromYuan,
  points,
  streakStatus
};
