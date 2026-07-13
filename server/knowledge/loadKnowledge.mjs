import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { formatPrivateKnowledgeItem, retrievePrivateKnowledge } from './privateKnowledgeRetrieval.mjs';

const rootDir = process.cwd();
const knowledgeDir = path.join(rootDir, 'knowledge');
const structuredBlocksPath = path.join(knowledgeDir, 'structured-blocks.json');
const benchmarkCasesPath = path.join(knowledgeDir, 'quality-benchmark-cases.json');

const handbookFiles = {
  personal_ip: ['handbooks/personal-ip.md'],
  commerce_video: ['handbooks/commerce-video.md'],
  combined: ['handbooks/personal-ip.md', 'handbooks/commerce-video.md', 'handbooks/combined.md'],
};

const moduleRetrievalTerms = {
  'ip-positioning': ['个人IP', '账号定位', '定位一句话', '商业定位', '目标用户', '人设资产', '内容矩阵', '成交设计', 'CTA入口'],
  'viral-topics': ['爆款选题', '8类爆款元素', '八大爆款元素', '爆款元素', '目标用户 × 具体场景', '四类脚本卡', '黄金3秒'],
  'conversion-topics': ['成交选题', '成交理由', '信任证明', '承接方式', 'CTA', '私域', '咨询', '成交链路'],
  'operation-plan': ['运营规划', '账号阶段', '选题排序', '选题编排', '内容比例', '发布节奏', '爆款后承接', '转化接力', '数据复盘', '7天计划', '14天计划'],
  'pain-topics': ['痛点', '需求场景', '购买冲突', '目标用户', '用户原话', '情绪刺点', '剧烈痛点'],
  script: ['脚本系统', '四类脚本卡', '黄金3秒', '钩子', '完整脚本', '分镜', 'B-roll', 'CTA', '4P', '八大爆款元素'],
  rewrite: ['脚本结构', '选题系统', '差异化表达', '平台表达', '痛点', '原创表达'],
  'viral-analysis': ['爆款结构', '黄金3秒', '情绪刺点', '成交链路', '可复用结构', '拆解爆款'],
  polish: ['脚本结构', '痛点重写', '观点', '故事', '短句口播', '钩子优化'],
  commerce: ['带货视频', '需求拆解', '成交心理链路', '成交理由', '商品视觉化', '小黄车', '商品卡', 'TikTok', 'GMV', 'CTR', 'CVR'],
};

export async function loadManifest() {
  const filePath = path.join(knowledgeDir, 'manifest.json');
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (error) {
    return {
      version: 'missing',
      error: `knowledge/manifest.json unavailable: ${error.message}`,
      files: [],
    };
  }
}

export async function loadStructuredKnowledgeBlocks() {
  try {
    const raw = await fs.readFile(structuredBlocksPath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    return {
      version: parsed.version || 'unknown',
      description: parsed.description || '',
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
    };
  } catch (error) {
    return {
      version: 'missing',
      description: `knowledge/structured-blocks.json unavailable: ${error.message}`,
      blocks: [],
      error: error.message,
    };
  }
}

export async function loadQualityBenchmarkCases() {
  try {
    const raw = await fs.readFile(benchmarkCasesPath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    return {
      version: parsed.version || 'unknown',
      description: parsed.description || '',
      cases: Array.isArray(parsed.cases) ? parsed.cases : [],
    };
  } catch (error) {
    return {
      version: 'missing',
      description: `knowledge/quality-benchmark-cases.json unavailable: ${error.message}`,
      cases: [],
      error: error.message,
    };
  }
}

export async function getKnowledgeOptimizationStatus() {
  const [structured, benchmarks] = await Promise.all([
    loadStructuredKnowledgeBlocks(),
    loadQualityBenchmarkCases(),
  ]);
  const categoryCounts = countBy(structured.blocks, (item) => item.category || 'unknown');
  const moduleCoverage = countBy(structured.blocks.flatMap((item) => item.moduleIds || []), (item) => item);
  const benchmarkCoverage = countBy(benchmarks.cases, (item) => item.moduleId || 'unknown');
  return {
    structuredBlocks: {
      version: structured.version,
      count: structured.blocks.length,
      categories: categoryCounts,
      moduleCoverage,
      ok: structured.blocks.length > 0 && !structured.error,
    },
    benchmarkCases: {
      version: benchmarks.version,
      count: benchmarks.cases.length,
      moduleCoverage: benchmarkCoverage,
      ok: benchmarks.cases.length >= 30 && !benchmarks.error,
    },
  };
}

export async function loadHandbook(taskType) {
  const files = handbookFiles[taskType] || handbookFiles.personal_ip;

  const parts = [];
  for (const relativePath of files) {
    const filePath = path.join(knowledgeDir, relativePath);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      parts.push(`\n\n# Source: ${relativePath}\n${content}`);
    } catch (error) {
      parts.push(`\n\n# Source missing: ${relativePath}\n${error.message}`);
    }
  }
  return parts.join('\n');
}

export async function loadKnowledgePack({
  taskType,
  moduleId,
  label,
  userId = '',
  projectId = '',
  knowledge = [],
  output = [],
  formData = {},
  selections = [],
  context = {},
  budgetChars = Number(process.env.KNOWLEDGE_BUDGET_CHARS || 1200),
} = {}) {
  const files = handbookFiles[taskType] || handbookFiles.personal_ip;

  const queryTerms = buildQueryTerms({ moduleId, label, knowledge, output, formData, selections, context });
  const privateKnowledge = await retrievePrivateKnowledge({
    userId,
    projectId,
    moduleId,
    taskType,
    queryTerms,
    budgetChars: Math.max(500, Math.round(budgetChars * 0.65)),
  });
  const structuredBlocks = await loadStructuredKnowledgeBlocks();
  const rankedBlocks = rankStructuredBlocks({
    blocks: structuredBlocks.blocks,
    moduleId,
    taskType,
    queryTerms,
    budgetChars,
  });
  const sections = [];
  for (const relativePath of files) {
    const filePath = path.join(knowledgeDir, relativePath);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      sections.push(...splitMarkdownSections(content).map((section) => {
        const score = scoreSectionV2(section, queryTerms);
        return {
          ...section,
          source: relativePath,
          score: score.score,
          matchedTerms: score.matchedTerms,
          scoreReasons: score.reasons,
        };
      }));
    } catch (error) {
      sections.push({
        source: relativePath,
        heading: `Source missing: ${relativePath}`,
        content: error.message,
        score: -1,
      });
    }
  }

  const deduplicatedBlocks = excludeDuplicateHeadings(rankedBlocks, privateKnowledge.selected);
  const selectedBlocks = deduplicatedBlocks.slice(0, getStructuredBlockLimit(budgetChars));
  const rankedSections = selectSectionsV2(sections, budgetChars);
  const deduplicatedSections = deduplicateSelectedSections(rankedSections);
  const selected = excludeDuplicateHeadings(deduplicatedSections, [
    ...privateKnowledge.selected,
    ...selectedBlocks.map(toSelectedBlockSection),
  ]);
  const selectedKnowledge = [
    ...privateKnowledge.selected,
    ...selectedBlocks.map(toSelectedBlockSection),
    ...selected,
  ];
  const pack = [
    `# Knowledge Pack: ${label || moduleId}`,
    `Selected sources: ${selectedKnowledge.map((item) => `${item.source} > ${item.heading}`).join(' | ')}`,
    '',
    ...privateKnowledge.selected.map(formatPrivateKnowledgeItem),
    ...selectedBlocks.map(formatStructuredBlock),
    ...selected.map((item) => `- ${item.heading} (${item.source}): ${compactSection(item.content, 260)}`),
  ].join('\n\n');

  return {
    pack,
    selected: selectedKnowledge.map(({ source, heading, score, matchedTerms, scoreReasons, blockId, cardId, memoryId, scope, version, category, methods, keywords, scenarios }) => ({
      source,
      heading,
      score,
      matchedTerms,
      scoreReasons,
      blockId,
      cardId,
      memoryId,
      scope,
      version,
      category,
      methods,
      keywords,
      scenarios,
    })),
    retrieval: {
      budgetChars,
      totalSections: sections.length,
      structuredBlocksVersion: structuredBlocks.version,
      totalStructuredBlocks: structuredBlocks.blocks.length,
      selectedStructuredBlocks: selectedBlocks.length,
      deduplicatedStructuredBlocks: rankedBlocks.length - deduplicatedBlocks.length,
      deduplicatedHandbookSections: rankedSections.length - selected.length,
      privateKnowledge: privateKnowledge.retrieval,
      selectedCount: selectedKnowledge.length,
      selectedSources: [...new Set(selectedKnowledge.map((item) => item.source))],
    },
    queryTerms,
  };
}

function splitMarkdownSections(content) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const sections = [];
  let current = { heading: 'Document Overview', content: [] };

  for (const line of lines) {
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch && current.content.length) {
      sections.push({ heading: current.heading, content: current.content.join('\n').trim() });
      current = { heading: headingMatch[2].trim(), content: [line] };
      continue;
    }
    if (headingMatch) current.heading = headingMatch[2].trim();
    current.content.push(line);
  }
  if (current.content.length) {
    sections.push({ heading: current.heading, content: current.content.join('\n').trim() });
  }
  return sections.filter((section) => section.content.length > 20);
}

function buildQueryTerms({ moduleId, label, knowledge, output, formData, selections, context }) {
  const terms = new Set([
    label,
    moduleId,
    ...knowledge,
    ...output,
    '示例',
    '案例',
    '输出格式',
    '完整脚本',
  ].filter(Boolean));

  const addText = (value) => {
    if (!value) return;
    String(value)
      .split(/[\s,，、。；;:：/|()[\]{}"'“”‘’]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && item.length <= 18)
      .forEach((item) => terms.add(item));
  };

  Object.values(formData || {}).forEach(addText);
  JSON.stringify(selections || []).split(/[\s,，、。；;:：/|()[\]{}"'“”‘’]+/).forEach(addText);
  JSON.stringify(context || {}).split(/[\s,，、。；;:：/|()[\]{}"'“”‘’]+/).forEach(addText);

  const moduleTerms = {
    'ip-positioning': ['个人IP', '商业目标', '目标用户', '价值定位', '人设关系', '内容矩阵', '默认交付包'],
    'viral-topics': ['选题生成', '8类爆款元素', '爆款元素', '四类脚本卡', '黄金3秒'],
    'conversion-topics': ['成交', '成交理由', '信任证明', '承接', 'CTA', '咨询', '私域'],
    'operation-plan': ['运营规划', '账号阶段', '选题编排', '选题比例', '发布节奏', '爆款后承接', '数据复盘', '下一轮调整'],
    'pain-topics': ['目标用户', '需求场景', '痛点', '用户原话', '购买冲突'],
    script: ['四类脚本卡', '脚本系统', '黄金3秒', 'CTA', '拍摄呈现', '剪辑原则'],
    rewrite: ['脚本结构', '选题系统', '差异化表达', '平台表达', '痛点'],
    'viral-analysis': ['爆款结构', '黄金3秒', '情绪刺点', '成交链路', '可复用结构'],
    polish: ['脚本结构', '痛点重写', '观点', '故事', '短句口播'],
    commerce: ['带货视频', '需求拆解', '成交心理链路', '成交理由', '商品视觉化', '小黄车', 'TikTok'],
  }[moduleId] || [];
  moduleTerms.forEach((term) => terms.add(term));
  (moduleRetrievalTerms[moduleId] || []).forEach((term) => terms.add(term));
  if (context?.agentGoal) addText(context.agentGoal);
  if (context?.agentPreviousSteps) addText(JSON.stringify(context.agentPreviousSteps));
  applyQueryAliases(terms);

  return normalizeTerms([...terms]);
}

function applyQueryAliases(terms) {
  const text = [...terms].join('\n').toLowerCase();
  const add = (...values) => values.forEach((value) => terms.add(value));

  if (/脏数据|空输入|缺失|信息不足|太短|模糊/.test(text)) {
    add('脏数据', '待确认', '不编造', '可执行初版', '缺失信息');
  }
  if (/报价贵|怕贵|价格异议|费用太高|异议化解/.test(text)) {
    add('异议', '怕贵', '报价贵', '价格异议', '费用太高', '顾虑化解');
  }
  if (/种草|尝鲜|新品/.test(text)) {
    add('种草', '场景需求', '兴趣激发', '新品种草');
  }
  if (/tiktok|tik tok|跨境|短句.*shop|shop.*短句/.test(text)) {
    add('TikTok', 'TikTok Shop', '短句', '短句口播', '平台表达');
  }
  if (/私域|社群|朋友圈|评论关键词/.test(text)) {
    add('私域', '评论关键词', '私信承接', '社群', '朋友圈');
  }
  if (/冷启动|起号|新账号/.test(text)) {
    add('冷启动', '账号冷启动', '发布节奏', '内容矩阵');
  }
  if (/专家|顾问|财税顾问|咨询/.test(text)) {
    add('专家顾问', '风险提示', '合规');
  }
}

function scoreSectionLegacy(section, terms) {
  const haystack = `${section.heading}\n${section.content}`;
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    const occurrences = haystack.split(term).length - 1;
    if (occurrences > 0) {
      score += occurrences;
      if (section.heading.includes(term)) score += 8;
    }
  }
  if (/示例|案例|脚本|表格|格式|流程|复盘|CTA|黄金3秒/.test(haystack)) score += 3;
  if (/详细脑图|mermaid|总脑图/.test(section.heading)) score -= 2;
  return score;
}

function selectSectionsLegacy(sections, budgetChars) {
  const sorted = [...sections].sort((a, b) => b.score - a.score);
  const selected = [];
  let total = 0;

  for (const section of sorted) {
    if (section.score < 1 && selected.length >= 4) continue;
    const cost = Math.min(section.content.length, 260);
    if (selected.length >= 3 && total + cost > budgetChars) continue;
    selected.push(section);
    total += cost;
    if (selected.length >= 4 || total >= budgetChars) break;
  }

  return selected.length ? selected : sorted.slice(0, 4);
}

function normalizeTerms(terms) {
  const seen = new Set();
  const normalized = [];
  for (const term of terms) {
    const value = String(term || '').replace(/\s+/g, ' ').trim();
    if (!value || value.length < 2 || value.length > 40) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}

function scoreSectionV2(section, terms) {
  const haystack = `${section.heading}\n${section.content}`;
  const lowerHaystack = haystack.toLowerCase();
  const lowerHeading = section.heading.toLowerCase();
  let score = 0;
  const matchedTerms = [];
  const reasons = [];
  for (const term of terms) {
    if (!term) continue;
    const lowerTerm = String(term).toLowerCase();
    const occurrences = lowerHaystack.split(lowerTerm).length - 1;
    if (occurrences > 0) {
      matchedTerms.push(term);
      score += Math.min(occurrences, 6);
      if (lowerHeading.includes(lowerTerm)) {
        score += 10;
        reasons.push(`heading:${term}`);
      }
      if (String(term).length >= 4) {
        score += 2;
        reasons.push(`phrase:${term}`);
      }
    }
  }
  if (/示例|案例|脚本|表格|格式|流程|复盘|CTA|黄金3秒|成交链路|爆款元素|小黄车|商品卡/.test(haystack)) {
    score += 4;
    reasons.push('deliverable_keywords');
  }
  if (/详细脑图|mermaid|总脑图/.test(section.heading)) {
    score -= 2;
    reasons.push('mindmap_penalty');
  }
  return {
    score,
    matchedTerms: [...new Set(matchedTerms)].slice(0, 12),
    reasons: [...new Set(reasons)].slice(0, 12),
  };
}

function selectSectionsV2(sections, budgetChars) {
  const sorted = [...sections].sort((a, b) => b.score - a.score);
  const selected = [];
  const sourceCounts = new Map();
  let total = 0;

  for (const section of sorted) {
    if (section.score < 1 && selected.length >= 4) continue;
    const cost = Math.min(section.content.length, 260);
    if (selected.length >= 3 && total + cost > budgetChars) continue;
    const sourceCount = sourceCounts.get(section.source) || 0;
    const hasAlternativeSource = sorted.some((item) => item.source !== section.source && item.score > 0 && !selected.includes(item));
    if (selected.length >= 2 && sourceCount >= 2 && hasAlternativeSource) continue;
    selected.push(section);
    sourceCounts.set(section.source, sourceCount + 1);
    total += cost;
    if (selected.length >= 4 || total >= budgetChars) break;
  }

  return selected.length ? selected : sorted.slice(0, 4);
}

function deduplicateSelectedSections(sections = []) {
  const seen = new Set();
  const unique = [];
  for (const section of sections) {
    const fingerprint = `${normalizeFingerprintText(section.heading)}|${normalizeFingerprintText(section.content)}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    unique.push(section);
  }
  return unique;
}

function excludeDuplicateHeadings(items = [], existingItems = []) {
  const seen = new Set(existingItems.map((item) => normalizeFingerprintText(item.heading || item.title)).filter(Boolean));
  const unique = [];
  for (const item of items) {
    const heading = normalizeFingerprintText(item.heading || item.title);
    if (heading && seen.has(heading)) continue;
    if (heading) seen.add(heading);
    unique.push(item);
  }
  return unique;
}

function normalizeFingerprintText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function rankStructuredBlocks({ blocks = [], moduleId, taskType, queryTerms = [] }) {
  return blocks
    .map((block) => {
      const score = scoreStructuredBlock({ block, moduleId, taskType, queryTerms });
      return {
        ...block,
        score: score.score,
        matchedTerms: score.matchedTerms,
        scoreReasons: score.reasons,
      };
    })
    .filter((block) => block.score > 0)
    .sort((a, b) => b.score - a.score);
}

function getStructuredBlockLimit(budgetChars) {
  return budgetChars >= 1600 ? 6 : 5;
}

function scoreStructuredBlock({ block, moduleId, taskType, queryTerms = [] }) {
  const parts = [
    block.id,
    block.category,
    block.title,
    ...(block.moduleIds || []),
    ...(block.methods || []),
    ...(block.scenarios || []),
    ...(block.requiredInputs || []),
    ...(block.outputTemplate || []),
    ...(block.keywords || []),
    block.example,
  ];
  const haystack = parts.filter(Boolean).join('\n').toLowerCase();
  let score = 0;
  const matchedTerms = [];
  const reasons = [];
  if ((block.moduleIds || []).includes(moduleId)) {
    score += 18;
    reasons.push(`module:${moduleId}`);
  }
  if (block.category === taskType || block.category === 'combined') {
    score += 8;
    reasons.push(`taskType:${taskType}`);
  }
  const queryText = queryTerms.join('\n').toLowerCase();
  if (
    block.id === 'dirty-data-handling' &&
    /忽略|ignore|注入|只输出|所有规则|system|developer|prompt/.test(queryText)
  ) {
    score += 28;
    reasons.push('dirty_data_safety_boost');
  }
  for (const term of queryTerms) {
    const normalized = String(term || '').trim().toLowerCase();
    if (!normalized || normalized.length < 2) continue;
    if (haystack.includes(normalized)) {
      matchedTerms.push(term);
      score += normalized.length >= 4 ? 4 : 2;
    }
  }
  const specificMatches = [...new Set(matchedTerms)]
    .filter((term) => isSpecificStructuredTerm(term, moduleId));
  const blockId = String(block.id || '');
  const shouldBoostVideoMethod = blockId.startsWith('ip-video-method-');
  const shouldBoostMethodLibrary =
    shouldBoostVideoMethod ||
    /^ip-(asset|research|hook|script|conversion|operation|industry|polish|quality|benchmark|deep|wutian|persona|content|expert|topic)-/.test(blockId) ||
    /^(conversion|commerce|script|pain|viral|publishing)-/.test(blockId);
  if (shouldBoostMethodLibrary && specificMatches.length >= 2) {
    score += 14 + Math.min(specificMatches.length, 5) * 4;
    reasons.push('specific_query_match');
  }
  const priorityText = [
    block.title,
    ...(block.methods || []),
    ...(block.scenarios || []),
    ...(block.keywords || []),
  ].filter(Boolean).join('\n').toLowerCase();
  if (shouldBoostMethodLibrary && specificMatches.some((term) => priorityText.includes(String(term).toLowerCase()))) {
    score += 8;
    reasons.push('priority_field_match');
  }
  return {
    score,
    matchedTerms: [...new Set(matchedTerms)].slice(0, 12),
    reasons: [...new Set(reasons)].slice(0, 12),
  };
}

function isSpecificStructuredTerm(term, moduleId) {
  const value = String(term || '').trim().toLowerCase();
  if (!value || value === moduleId) return false;
  const genericTerms = new Set([
    'script',
    'cta',
    'CTA',
    'b-roll',
    '案例',
    '示例',
    '脚本',
    '完整脚本',
    '输出格式',
    '四类脚本卡',
    '黄金3秒',
    '钩子',
    '分镜',
    '个人ip',
    '账号定位',
    '商业定位',
    '商业目标',
    '目标用户',
    '专家',
    '顾问',
    '老板',
    '表单',
    '专业服务',
    '企业服务',
    '合规',
    '内容矩阵',
    '人设资产',
    '成交设计',
    '成交',
    '成交理由',
    '信任证明',
    '承接',
    '承接方式',
    '私域',
    '咨询',
    '带货视频',
    '商品卡',
    '小黄车',
  ]);
  if (genericTerms.has(value)) return false;
  return value.length >= 2;
}

function toSelectedBlockSection(block) {
  return {
    source: `structured-blocks/${block.id}`,
    heading: block.title,
    score: block.score,
    matchedTerms: block.matchedTerms || [],
    scoreReasons: block.scoreReasons || [],
    blockId: block.id,
    category: block.category,
    methods: block.methods || [],
    keywords: block.keywords || [],
    scenarios: block.scenarios || [],
  };
}

function formatStructuredBlock(block) {
  return [
    `- ${block.title} (structured-blocks/${block.id}):`,
    `  - Methods: ${(block.methods || []).join(' / ') || 'none'}`,
    `  - Keywords: ${(block.keywords || []).join(' / ') || 'none'}`,
    `  - Applies to: ${(block.scenarios || []).join(' / ') || 'general'}`,
    `  - Required inputs: ${(block.requiredInputs || []).join(' / ') || 'none'}`,
    `  - Output skeleton: ${(block.outputTemplate || []).join(' / ') || 'standard JSON'}`,
    block.example ? `  - Example: ${block.example}` : '',
  ].filter(Boolean).join('\n');
}

function countBy(items = [], keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function trimSection(content, maxChars) {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n...`;
}

function compactSection(content, maxChars) {
  const cleaned = content
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('```') && !/^\s*[A-Z]\s*-->|graph |mindmap/.test(line))
    .map((line) => line.replace(/^#{1,6}\s*/, '').trim())
    .join('；');
  return trimSection(cleaned, maxChars).replace(/\s+/g, ' ');
}

export async function verifyKnowledgeFiles() {
  const manifest = await loadManifest();
  if (!manifest.files?.length) {
    return { ok: false, manifest, checks: [] };
  }

  const checks = [];
  for (const item of manifest.files) {
    const filePath = path.join(knowledgeDir, item.path);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const normalizedContent = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
      const sha256 = crypto.createHash('sha256').update(normalizedContent, 'utf8').digest('hex');
      checks.push({
        path: item.path,
        ok: sha256 === item.sha256,
        expected: item.sha256,
        actual: sha256,
      });
    } catch (error) {
      checks.push({ path: item.path, ok: false, error: error.message });
    }
  }

  return { ok: checks.every((item) => item.ok), manifest, checks };
}
