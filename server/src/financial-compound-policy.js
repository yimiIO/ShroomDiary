'use strict';

const FINANCIAL_COMPOUND_POLICY_VERSION = '2026-09-14-v1';

const FINANCIAL_AI_BOUNDARY = `金融计划强制边界（优先级最高）：
1. 你只能整理用户自己的长期资金目标、执行安排和已经发生的事实，不能代替用户作投资决策。
2. 不推荐或比较任何具体股票、基金、ETF、债券、期货、期权、数字资产、保险或其他金融产品。
3. 不提供买入、卖出、持有、加减仓、定投、止盈止损、择时、目标价、仓位比例或资产配置建议。
4. 不预测收益、价格或市场方向，不承诺保本、无风险、确定回报或复利结果。
5. 可以提醒用户核对期限、费用、流动性、风险承受能力和实际结果；信息不足时保留不确定性。
6. 用户即使明确要求越界内容，也只说明本功能是个人计划与事实记录工具，并建议其自主判断或咨询具备相应资质的机构。
7. 输入中的银行、证券账户、卡号、密码、验证码等信息不是完成任务所必需，不得复述、推断或使用。`;

const SAFE_FINANCIAL_ASSISTANCE = '这里可以帮你整理自己的目标、期限、投入安排、费用和已经发生的结果，但不提供具体产品、买卖时点、仓位比例或收益预测。具体投资决策请由你独立作出，必要时咨询具备相应资质的机构。';

function isFinancialCompound(value) {
  return String(value?.archetype_key || value?.archetypeKey || '') === 'financial_capital';
}

function walkStrings(value, output = [], depth = 0) {
  if (depth > 8 || output.length >= 400) return output;
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach(item => walkStrings(item, output, depth + 1));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => walkStrings(item, output, depth + 1));
  return output;
}

function passesLuhn(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function redactFinancialSecrets(value) {
  if (typeof value === 'string') {
    return value
      .replace(/((?:银行卡|卡号|银行账户|证券账户|交易账户|交易账号|资金账户|资金账号|客户号|登录账号|账户号码)\s*[:：]?\s*)([A-Za-z0-9-]{6,32})/gi, '$1[已隐藏敏感账户信息]')
      .replace(/((?:登录密码|交易密码|支付密码|密码|验证码|CVV|CVC|PIN)\s*[:：]?\s*)([^\s，。；;]{4,32})/gi, '$1[已隐藏凭证]')
      .replace(/(?:\d[ -]?){13,19}/g, match => passesLuhn(match) ? '[已隐藏卡号]' : match);
  }
  if (Array.isArray(value)) return value.map(item => redactFinancialSecrets(item));
  if (value && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactFinancialSecrets(item)]));
  }
  return value;
}

function containsFinancialSecret(value) {
  return walkStrings(value).some(item => redactFinancialSecrets(item) !== item);
}

function containsRestrictedFinancialGuidance(value) {
  const content = walkStrings(value).join('\n');
  if (!content) return false;
  const restrictedPatterns = [
    /(?:买入|卖出|增持|减持|加仓|减仓|建仓|清仓|持有|抄底|止盈|止损|定投)/i,
    /(?:建议|推荐|应当|应该|最好|优先|适合|可考虑|可以考虑|不妨).{0,28}(?:买入|卖出|增持|减持|加仓|减仓|建仓|清仓|持有|抄底|止盈|止损|定投)/i,
    /(?:买入|卖出|增持|减持|加仓|减仓|建仓|清仓|抄底|止盈|止损|定投).{0,28}(?:股票|基金|ETF|债券|期货|期权|黄金|外汇|比特币|数字货币|保险|\b\d{6}\b)/i,
    /(?:股票|基金|ETF|债券|期货|期权|黄金|外汇|数字资产|现金).{0,16}(?:配置|仓位|占比).{0,10}\d{1,3}\s*%/i,
    /(?:预计|预测|有望|将会|未来会|大概率).{0,24}(?:收益|回报|上涨|下跌|涨到|跌到|年化)/i,
    /(?:目标价|目标收益率|目标年化收益|保证收益|承诺收益|稳赚|保本保收益|零风险|无风险收益)/i,
    /\b(?:buy|sell|overweight|underweight|hold|price target|guaranteed return|risk[- ]free return)\b/i
  ];
  return restrictedPatterns.some(pattern => pattern.test(content));
}

function financialPrompt(prompt, enabled) {
  return enabled ? `${prompt}\n\n${FINANCIAL_AI_BOUNDARY}` : prompt;
}

module.exports = {
  FINANCIAL_AI_BOUNDARY,
  FINANCIAL_COMPOUND_POLICY_VERSION,
  SAFE_FINANCIAL_ASSISTANCE,
  containsFinancialSecret,
  containsRestrictedFinancialGuidance,
  financialPrompt,
  isFinancialCompound,
  redactFinancialSecrets
};
