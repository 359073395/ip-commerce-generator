import { moduleDefinitions } from './prompt-engine/modules.mjs';
const moduleById = Object.fromEntries(moduleDefinitions.map((item) => [item.id, item]));

const commerceKeywords = [
  '带货', '卖货', '产品', '商品', '小黄车', '商品卡', '直播', '直播间', '团购', '团购券',
  'TikTok', 'tiktok', 'shop', 'Shop', 'SKU', 'GMV', '下单', '转化', '测评', '种草',
  '供应链', '销量', '客单价', '爆单', '成交', '变现',
];

const ipKeywords = [
  'IP', 'ip', '人设', '定位', '账号', '个人品牌', '专家', '顾问', '老师', '教练',
  '老板', '创始人', '医生', '律师', '获客', '信任', '私域', '咨询', '服务', '门店',
  '专业', '同城', '本地',
];

const vagueKeywords = ['随便', '都行', '帮我搞', '你看着办', '爆款', '涨粉', '赚钱', '变现'];
const injectionKeywords = ['忽略以上', '忽略前面', '系统提示词', 'system prompt', 'developer message', '越狱', 'jailbreak'];

export function planAgentTask({ goal, projectProfile = {}, project = null } = {}) {
  const normalized = normalizeGoal(goal);
  const dirtyFlags = detectDirtyFlags(goal, normalized);
  const profileFacts = factsFromProfile(projectProfile);
  const extractedFacts = extractFacts(normalized.text, profileFacts);
  const classification = classifyTask(normalized.text, extractedFacts, projectProfile);
  const recommended = recommendModules(normalized.text, classification);
  const missingQuestions = buildMissingQuestions({
    text: normalized.text,
    taskType: classification.taskType,
    facts: extractedFacts,
    dirtyFlags,
  });
  const confidence = scoreConfidence({ text: normalized.text, classification, facts: extractedFacts, dirtyFlags });
  const status = resolveStatus({ normalized, confidence, missingQuestions, dirtyFlags });
  const plan = {
    status,
    taskType: classification.taskType,
    taskTypeLabel: taskTypeLabel(classification.taskType),
    confidence,
    goal: normalized.text,
    project: project ? { id: project.id, name: project.name } : null,
    recommendedModuleId: recommended[0]?.id || 'ip-positioning',
    recommendedModuleLabel: recommended[0]?.label || moduleById['ip-positioning']?.label || 'IP定位',
    recommendedModules: recommended,
    extractedFacts,
    missingQuestions,
    reasoning: buildReasoning({ classification, recommended, extractedFacts, dirtyFlags, projectProfile }),
    actionPlan: buildActionPlan({ status, classification, recommended, missingQuestions }),
    suggestedFormData: buildSuggestedFormData({ normalized, extractedFacts, recommended }),
    dirtyFlags,
    riskNotes: buildRiskNotes({ dirtyFlags, missingQuestions, projectProfile }),
    source: 'rules',
  };

  return normalizePlan(plan);
}

function normalizeGoal(input) {
  const raw = String(input || '');
  const withoutControls = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
  const compact = withoutControls.replace(/\s+/g, ' ').trim();
  return {
    raw,
    text: compact.slice(0, 4000),
    originalLength: raw.length,
    meaningfulLength: countMeaningfulChars(compact),
  };
}

function detectDirtyFlags(rawInput, normalized) {
  const raw = String(rawInput || '');
  const flags = [];
  if (!normalized.text) flags.push('empty_input');
  if (normalized.text && normalized.meaningfulLength < 6) flags.push('too_short');
  if (normalized.originalLength > 4000) flags.push('too_long_truncated');
  if ((raw.match(/[^\p{Script=Han}\p{Letter}\p{Number}\s，。！？、,.!?/@#:+\-()（）【】《》"'“”‘’]/gu) || []).length > 20) {
    flags.push('noisy_symbols');
  }
  if (/[a-zA-Z]/.test(raw) && /[\u4e00-\u9fff]/.test(raw)) flags.push('mixed_language');
  if (vagueKeywords.some((word) => normalized.text.includes(word))) flags.push('vague_goal');
  if (injectionKeywords.some((word) => normalized.text.toLowerCase().includes(word.toLowerCase()))) {
    flags.push('prompt_injection_like_text');
  }
  return flags;
}

function classifyTask(text, facts, projectProfile) {
  const commerceScore = countKeywordHits(text, commerceKeywords) + (facts.offer ? 1 : 0);
  const ipScore = countKeywordHits(text, ipKeywords) + (facts.persona ? 1 : 0) + (profileHasMemory(projectProfile) ? 0.5 : 0);

  if (commerceScore >= 1 && ipScore >= 2) {
    return { taskType: 'combined', commerceScore, ipScore };
  }
  if (commerceScore > ipScore && commerceScore >= 1) {
    return { taskType: 'commerce_video', commerceScore, ipScore };
  }
  if (ipScore >= 1) {
    return { taskType: 'personal_ip', commerceScore, ipScore };
  }
  return { taskType: 'unknown', commerceScore, ipScore };
}

function recommendModules(text, classification) {
  const modules = [];
  const add = (id, reason) => {
    const definition = moduleById[id];
    if (definition && !modules.some((item) => item.id === id)) {
      modules.push({ id, label: definition.label, reason });
    }
  };

  const explicitDownstream = hasAny(text, ['拆解', '分析', '复盘', '参考', '对标', '二创', '改写', '仿写', '洗稿', '润色', '脚本', '口播', '拍摄', '分镜', '视频文案', '选题', '题目', '痛点']);
  if (classification.taskType === 'combined' && !explicitDownstream) add('ip-positioning', '任务同时包含个人IP和商业转化，先定定位。');
  if (classification.taskType === 'commerce_video' && !explicitDownstream) add('commerce', '任务更偏带货视频或产品成交。');
  if (classification.taskType === 'personal_ip' && !explicitDownstream) add('ip-positioning', '任务更偏个人IP定位和账号身份。');

  if (hasAny(text, ['拆解', '分析', '复盘', '参考', '对标'])) add('viral-analysis', '用户目标是拆解或复盘内容结构。');
  if (hasAny(text, ['二创', '改写', '仿写', '换一种', '搬运改', '重写'])) add('rewrite', '用户目标是基于已有内容做二创。');
  if (hasAny(text, ['洗稿', '润色', '优化文案', '改文案'])) add('polish', '用户目标是优化已有表达。');
  if (hasAny(text, ['脚本', '口播', '拍摄', '分镜', '视频文案'])) add('script', '用户明确需要可拍摄脚本。');
  if (hasAny(text, ['痛点', '焦虑', '需求', '用户问题'])) add('pain-topics', '用户重点在挖掘痛点或需求。');
  if (hasAny(text, ['成交选题', '成交', '转化', '咨询', '私域', '预约'])) add('conversion-topics', '用户目标包含成交或承接。');
  if (hasAny(text, ['选题', '题目', '内容方向', '爆款'])) add('viral-topics', '用户需要选题方向。');

  if (classification.taskType === 'combined') {
    add('ip-positioning', '任务同时包含个人IP和商业转化，先定定位。');
    add('conversion-topics', '定位后进入成交型选题。');
    add('script', '最后生成可拍摄脚本。');
  }
  if (!modules.length) add('ip-positioning', '信息不足时先从IP定位入口梳理。');
  return modules.slice(0, 4);
}

function buildMissingQuestions({ text, taskType, facts, dirtyFlags }) {
  if (dirtyFlags.includes('empty_input')) {
    return ['你想做个人IP、带货视频，还是两者结合？', '你所在的行业/赛道是什么？', '你最终想获得什么结果：定位、选题、脚本、还是带货方案？'];
  }

  const questions = [];
  if (dirtyFlags.includes('too_short') || dirtyFlags.includes('vague_goal')) {
    questions.push('请补充你的行业、身份、人群或产品，至少给出一个具体方向。');
  }
  if (!facts.industry) questions.push('你的行业/赛道是什么？例如美业、本地生活、教育培训、跨境电商。');
  if (taskType !== 'commerce_video' && !facts.persona) questions.push('你的身份/人设是什么？例如老板、顾问、老师、医生、达人、店长。');
  if (taskType !== 'personal_ip' && !facts.offer) questions.push('你要卖的产品/服务是什么？价格、卖点或交付方式是什么？');
  if (!facts.audience) questions.push('目标用户是谁？他们在什么场景下会需要你？');
  if (!facts.proof) questions.push('你现在有什么信任证据？例如案例、评价、资质、门店现场、测评素材。');
  if (!facts.conversion) questions.push('你希望用户去哪里成交或承接？例如私信、表单、到店、商品卡、直播间、社群。');

  return questions.slice(0, 5);
}

function scoreConfidence({ text, classification, facts, dirtyFlags }) {
  let score = 0.25;
  if (classification.taskType !== 'unknown') score += 0.25;
  for (const key of ['industry', 'persona', 'offer', 'audience', 'proof', 'conversion']) {
    if (facts[key]) score += 0.07;
  }
  if (text.length > 40) score += 0.08;
  if (dirtyFlags.includes('empty_input')) score -= 0.4;
  if (dirtyFlags.includes('too_short')) score -= 0.18;
  if (dirtyFlags.includes('vague_goal')) score -= 0.1;
  if (dirtyFlags.includes('prompt_injection_like_text')) score -= 0.2;
  return Math.max(0.05, Math.min(0.98, Number(score.toFixed(2))));
}

function resolveStatus({ normalized, confidence, missingQuestions, dirtyFlags }) {
  if (dirtyFlags.includes('empty_input') || normalized.meaningfulLength < 2) return 'invalid';
  if (confidence < 0.45 || missingQuestions.length >= 3) return 'needs_input';
  return 'ready';
}

function buildReasoning({ classification, recommended, extractedFacts, dirtyFlags, projectProfile }) {
  const reasoning = [];
  reasoning.push(`识别路径：${taskTypeLabel(classification.taskType)}。`);
  if (recommended[0]) reasoning.push(`优先模块：${recommended[0].label}，原因：${recommended[0].reason}`);
  if (profileHasMemory(projectProfile)) reasoning.push('已读取当前项目档案，作为行业、人设、产品和承接方式的长期记忆。');
  const knownFacts = Object.entries(extractedFacts).filter(([, value]) => value).map(([key]) => key);
  reasoning.push(knownFacts.length ? `已识别关键信息：${knownFacts.join('、')}。` : '目前可识别信息较少，需要先补充核心事实。');
  if (dirtyFlags.includes('prompt_injection_like_text')) reasoning.push('输入里包含疑似提示词注入文本，已作为普通用户内容处理。');
  return reasoning;
}

function buildActionPlan({ status, classification, recommended, missingQuestions }) {
  if (status === 'invalid') {
    return ['先补充一个真实业务目标。', '至少说明行业、身份/产品、目标用户其中两项。'];
  }
  if (status === 'needs_input') {
    return [
      `先回答 ${Math.min(missingQuestions.length, 5)} 个关键问题，避免系统胡编。`,
      recommended[0] ? `补齐后优先进入「${recommended[0].label}」。` : '补齐后先做IP定位。',
      classification.taskType === 'combined' ? '如果既做个人IP又卖产品，先定位再做成交选题和脚本。' : '生成后再进入下一个模块做内容深化。',
    ];
  }
  return [
    recommended[0] ? `直接进入「${recommended[0].label}」生成第一版完整骨架。` : '先进入IP定位。',
    recommended[1] ? `第二步进入「${recommended[1].label}」继续细化。` : '根据结果补充项目档案。',
    '生成后把有效定位、承接方式和禁忌表达保存进项目档案。',
  ];
}

function buildSuggestedFormData({ normalized, extractedFacts, recommended }) {
  const moduleId = recommended[0]?.id || 'ip-positioning';
  const basePrompt = normalized.text;
  if (moduleId === 'commerce') {
    return {
      product: extractedFacts.offer || basePrompt,
      audience: extractedFacts.audience || '',
      proof: extractedFacts.proof || '',
    };
  }
  if (moduleId === 'pain-topics') {
    return {
      industryBackground: [extractedFacts.industry, extractedFacts.persona, extractedFacts.offer].filter(Boolean).join(' / ') || basePrompt,
      targetCustomer: extractedFacts.audience || '',
    };
  }
  return { prompt: basePrompt };
}

function buildRiskNotes({ dirtyFlags, missingQuestions, projectProfile }) {
  const notes = [];
  if (dirtyFlags.includes('too_long_truncated')) notes.push('输入过长，已截取前4000字符参与规划。');
  if (dirtyFlags.includes('noisy_symbols')) notes.push('输入包含较多符号或杂乱文本，建议整理后再生成正式内容。');
  if (dirtyFlags.includes('prompt_injection_like_text')) notes.push('疑似提示词注入内容不会被当作系统指令执行。');
  if (missingQuestions.length) notes.push('信息不足时先追问，不直接编造行业、案例、资质或价格。');
  if (!profileHasMemory(projectProfile)) notes.push('当前项目档案为空，建议先保存行业、人设、产品、目标用户和承接方式。');
  return notes;
}

function extractFacts(text, profileFacts) {
  const facts = { ...profileFacts };
  const pairs = [
    ['industry', ['行业', '赛道', '我是做', '做']],
    ['persona', ['身份', '人设', '我是', '作为']],
    ['offer', ['卖', '产品', '服务', '课程', '团购券']],
    ['audience', ['用户', '客户', '人群', '卖给', '目标']],
    ['proof', ['案例', '评价', '资质', '证书', '反馈']],
    ['conversion', ['私信', '表单', '到店', '直播间', '商品卡', '小黄车', '社群', '预约']],
  ];
  for (const [key, keywords] of pairs) {
    if (!facts[key] && keywords.some((word) => text.includes(word))) {
      facts[key] = guessFactSnippet(text, keywords);
    }
  }
  return facts;
}

function factsFromProfile(profile = {}) {
  return {
    industry: cleanFact(profile.industry),
    persona: cleanFact(profile.persona),
    offer: cleanFact(profile.offer),
    audience: cleanFact(profile.audience),
    proof: cleanFact(profile.proof),
    conversion: cleanFact(profile.conversion),
  };
}

function profileHasMemory(profile = {}) {
  return ['industry', 'persona', 'offer', 'audience', 'proof', 'conversion', 'voice', 'ipPositioningSummary', 'notes']
    .some((field) => String(profile[field] || '').trim());
}

function guessFactSnippet(text, keywords) {
  const sentences = text.split(/[。！？!?；;\n]/).map((item) => item.trim()).filter(Boolean);
  const hit = sentences.find((sentence) => keywords.some((word) => sentence.includes(word))) || text;
  return cleanFact(hit.slice(0, 120));
}

function cleanFact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function countKeywordHits(text, keywords) {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function countMeaningfulChars(text) {
  return (String(text || '').match(/[\p{Script=Han}\p{Letter}\p{Number}]/gu) || []).length;
}

function taskTypeLabel(taskType) {
  if (taskType === 'personal_ip') return '个人IP';
  if (taskType === 'commerce_video') return '带货视频';
  if (taskType === 'combined') return '个人IP + 商业转化';
  return '信息不足';
}

function normalizePlan(plan) {
  return {
    ...plan,
    missingQuestions: Array.isArray(plan.missingQuestions) ? plan.missingQuestions : [],
    recommendedModules: Array.isArray(plan.recommendedModules) ? plan.recommendedModules : [],
    reasoning: Array.isArray(plan.reasoning) ? plan.reasoning : [],
    actionPlan: Array.isArray(plan.actionPlan) ? plan.actionPlan : [],
    riskNotes: Array.isArray(plan.riskNotes) ? plan.riskNotes : [],
    dirtyFlags: Array.isArray(plan.dirtyFlags) ? plan.dirtyFlags : [],
  };
}
