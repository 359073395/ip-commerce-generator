import { getPrivateKnowledgeDatabaseStatus, privateKnowledgeRequired } from './privateKnowledgeDatabase.mjs';
import { privateKnowledgeMinimumCards } from './privateKnowledgeMigration.mjs';
import { getPublishedKnowledgeForRetrieval } from './privateKnowledgeRepository.mjs';

export async function retrievePrivateKnowledge({
  userId = '',
  projectId = '',
  moduleId = '',
  taskType = '',
  queryTerms = [],
  budgetChars = 800,
} = {}) {
  const status = await getPrivateKnowledgeDatabaseStatus();
  const minimumCards = privateKnowledgeMinimumCards();
  if (!status.ok || (privateKnowledgeRequired() && status.publishedCards < minimumCards)) {
    if (privateKnowledgeRequired()) {
      const error = new Error(status.error || `私有知识库未就绪，当前只有 ${status.publishedCards || 0} 条已发布知识。`);
      error.code = 'PRIVATE_KNOWLEDGE_UNAVAILABLE';
      throw error;
    }
    return emptyRetrieval(status);
  }

  const { cards, memories } = await getPublishedKnowledgeForRetrieval({ userId, projectId });
  const scoredMemories = memories.map((memory) => scoreMemory(memory, { moduleId, queryTerms }));
  const scoredCards = cards.map((card) => scoreCard(card, { moduleId, taskType, queryTerms }));
  const rankedCandidates = [...scoredMemories, ...scoredCards]
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt));
  const candidates = deduplicateRankedKnowledge(rankedCandidates);

  const selected = [];
  let usedChars = 0;
  for (const item of candidates) {
    const excerpt = relevantExcerpt(item.content || item.summary, queryTerms, item.scope === 'project' ? 420 : 340);
    const cost = excerpt.length + item.title.length;
    if (selected.length >= 3 && usedChars + cost > budgetChars) continue;
    selected.push({ ...item, excerpt });
    usedChars += cost;
    if (selected.length >= 6 || usedChars >= budgetChars) break;
  }

  return {
    selected,
    status,
    retrieval: {
      totalGlobalCards: cards.length,
      totalProjectMemories: memories.length,
      selectedCount: selected.length,
      selectedProjectMemories: selected.filter((item) => item.scope === 'project').length,
      selectedGlobalCards: selected.filter((item) => item.scope === 'global').length,
      deduplicatedCandidates: rankedCandidates.length - candidates.length,
      budgetChars,
    },
  };
}

export function formatPrivateKnowledgeItem(item) {
  const details = [
    `- ${item.title} (${item.source}):`,
    `  - 适用范围：${[...(item.industries || []), ...(item.scenarios || [])].join(' / ') || '通用'}`,
    `  - 方法：${(item.methods || []).join(' / ') || item.summary || '按项目反馈执行'}`,
    `  - 内容：${item.excerpt || item.summary || ''}`,
    item.example ? `  - 示例：${item.example}` : '',
    item.avoidWhen ? `  - 禁用条件：${item.avoidWhen}` : '',
  ].filter(Boolean);
  return details.join('\n');
}

function scoreMemory(memory, { moduleId, queryTerms }) {
  const haystack = [memory.title, memory.summary, memory.content, ...(memory.keywords || [])].join('\n').toLowerCase();
  const matchedTerms = matchTerms(haystack, queryTerms);
  let score = 30 + Math.min(memory.qualityScore || 0, 100) / 8;
  const reasons = ['project_scope'];
  if (memory.moduleId && memory.moduleId === moduleId) {
    score += 24;
    reasons.push(`module:${moduleId}`);
  }
  score += matchedTerms.length * 5;
  if (matchedTerms.length) reasons.push('query_match');
  if (hasOutcomeEvidence(memory.evidence)) {
    score += 14;
    reasons.push('verified_outcome');
  }
  return {
    id: memory.id,
    memoryId: memory.id,
    scope: 'project',
    source: `private/project/${memory.id}`,
    title: memory.title,
    heading: memory.title,
    summary: memory.summary,
    content: memory.content,
    category: 'project_memory',
    moduleIds: memory.moduleId ? [memory.moduleId] : [],
    methods: [],
    keywords: memory.keywords || [],
    industries: [],
    scenarios: [],
    example: '',
    avoidWhen: '',
    score,
    matchedTerms,
    scoreReasons: reasons,
    version: 1,
    updatedAt: memory.updatedAt || '',
  };
}

function scoreCard(card, { moduleId, taskType, queryTerms }) {
  const haystack = [
    card.title,
    card.summary,
    card.content,
    card.category,
    ...(card.moduleIds || []),
    ...(card.methods || []),
    ...(card.keywords || []),
    ...(card.scenarios || []),
  ].join('\n').toLowerCase();
  const matchedTerms = matchTerms(haystack, queryTerms);
  const specificMatches = matchedTerms.filter((term) => isSpecificQueryTerm(term, moduleId));
  const priorityHaystack = [
    card.title,
    card.summary,
    ...(card.methods || []),
    ...(card.keywords || []),
    ...(card.scenarios || []),
  ].join('\n').toLowerCase();
  const priorityMatches = matchTerms(priorityHaystack, specificMatches);
  const titleMatches = matchTerms(String(card.title || '').toLowerCase(), specificMatches);
  let score = Math.min(card.qualityScore || 0, 100) / 10;
  const reasons = [];
  if ((card.moduleIds || []).includes(moduleId)) {
    const moduleBreadth = Math.max(1, (card.moduleIds || []).length);
    score += moduleBreadth <= 3 ? 22 : Math.max(6, 16 - moduleBreadth);
    reasons.push(`module:${moduleId}`);
  }
  if (card.category === taskType || card.category === 'combined') {
    score += 8;
    reasons.push(`taskType:${taskType}`);
  }
  score += specificMatches.length * 3;
  score += priorityMatches.length * 5;
  score += titleMatches.length * 8;
  if (specificMatches.length) reasons.push('specific_query_match');
  if (priorityMatches.length) reasons.push('priority_field_match');
  if (titleMatches.length) reasons.push('title_match');
  if (hasOutcomeEvidence(card.evidence)) {
    score += 10;
    reasons.push('verified_outcome');
  }
  if (!specificMatches.length) score -= (card.moduleIds || []).length > 3 ? 10 : 4;
  if (!specificMatches.length && !(card.moduleIds || []).includes(moduleId)) score -= 8;
  return {
    id: card.id,
    cardId: card.id,
    blockId: card.evidence?.originalId || '',
    scope: 'global',
    source: `private/global/${card.id}`,
    title: card.title,
    heading: card.title,
    summary: card.summary,
    content: card.content,
    category: card.category,
    moduleIds: card.moduleIds || [],
    methods: card.methods || [],
    keywords: card.keywords || [],
    industries: card.industries || [],
    scenarios: card.scenarios || [],
    example: card.example || '',
    avoidWhen: card.avoidWhen || '',
    score,
    matchedTerms,
    scoreReasons: reasons,
    version: card.version,
    updatedAt: card.updatedAt || '',
  };
}

function isSpecificQueryTerm(term, moduleId) {
  const value = String(term || '').trim().toLowerCase();
  if (!value || value === String(moduleId || '').toLowerCase()) return false;
  if (genericQueryTerms.has(value)) return false;
  return value.length >= 2;
}

const genericQueryTerms = new Set([
  'script', 'cta', 'b-roll', '案例', '示例', '脚本', '完整脚本', '输出格式', '分镜', '钩子',
  '个人ip', '账号定位', '商业定位', '目标用户', '内容矩阵', '成交', '承接', '承接方式',
  '信任证明', '风险提醒', '表格', '方法', '流程', '复盘', '知识库', '完整骨架',
]);

function matchTerms(haystack, queryTerms) {
  const matched = [];
  for (const term of queryTerms || []) {
    const normalized = String(term || '').trim().toLowerCase();
    if (normalized.length < 2 || matched.includes(term)) continue;
    if (haystack.includes(normalized)) matched.push(term);
    if (matched.length >= 12) break;
  }
  return matched;
}

function relevantExcerpt(content, queryTerms, maxLength) {
  const normalized = String(content || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const sentences = normalized.split(/(?<=[。！？!?；;])\s*/).filter(Boolean);
  const lowerTerms = (queryTerms || []).map((term) => String(term || '').toLowerCase()).filter((term) => term.length >= 2);
  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: lowerTerms.reduce((sum, term) => sum + (sentence.toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked.filter((item) => item.score > 0).slice(0, 3);
  const text = (selected.length ? selected : ranked.slice(0, 2))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence)
    .join(' ');
  return text.slice(0, maxLength);
}

function hasOutcomeEvidence(evidence = {}) {
  const metrics = evidence.metrics || evidence;
  return Number(metrics.deals || 0) > 0
    || Number(metrics.leads || 0) >= 3
    || Number(metrics.privateMessages || 0) + Number(metrics.phoneCalls || 0) >= 5;
}

function deduplicateRankedKnowledge(items = []) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const fingerprint = knowledgeFingerprint(item);
    if (fingerprint && seen.has(fingerprint)) continue;
    if (fingerprint) seen.add(fingerprint);
    unique.push(item);
  }
  return unique;
}

function knowledgeFingerprint(item = {}) {
  const title = normalizeFingerprintText(item.title || item.heading);
  const content = normalizeFingerprintText(item.content || item.summary);
  if (!title && !content) return '';
  return `${title}|${content}`;
}

function normalizeFingerprintText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function emptyRetrieval(status) {
  return {
    selected: [],
    status,
    retrieval: {
      totalGlobalCards: 0,
      totalProjectMemories: 0,
      selectedCount: 0,
      selectedProjectMemories: 0,
      selectedGlobalCards: 0,
      deduplicatedCandidates: 0,
      budgetChars: 0,
    },
  };
}
