import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();
const knowledgeDir = path.join(rootDir, 'knowledge');

const handbookFiles = {
  personal_ip: ['handbooks/personal-ip.md'],
  commerce_video: ['handbooks/commerce-video.md'],
  combined: ['handbooks/personal-ip.md', 'handbooks/commerce-video.md', 'handbooks/combined.md'],
};

const moduleRetrievalTerms = {
  'ip-positioning': ['个人IP', '账号定位', '定位一句话', '商业定位', '目标用户', '人设资产', '内容矩阵', '成交设计', 'CTA入口'],
  'viral-topics': ['爆款选题', '8类爆款元素', '八大爆款元素', '爆款元素', '目标用户 × 具体场景', '四类脚本卡', '黄金3秒'],
  'conversion-topics': ['成交选题', '成交理由', '信任证明', '承接方式', 'CTA', '私域', '咨询', '成交链路'],
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
  knowledge = [],
  output = [],
  formData = {},
  selections = [],
  context = {},
  budgetChars = Number(process.env.KNOWLEDGE_BUDGET_CHARS || 1200),
} = {}) {
  const files = handbookFiles[taskType] || handbookFiles.personal_ip;

  const queryTerms = buildQueryTerms({ moduleId, label, knowledge, output, formData, selections, context });
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

  const selected = selectSectionsV2(sections, budgetChars);
  const pack = [
    `# Knowledge Pack: ${label || moduleId}`,
    `Selected sources: ${selected.map((item) => `${item.source} > ${item.heading}`).join(' | ')}`,
    '',
    ...selected.map((item) => `- ${item.heading} (${item.source}): ${compactSection(item.content, 260)}`),
  ].join('\n\n');

  return {
    pack,
    selected: selected.map(({ source, heading, score, matchedTerms, scoreReasons }) => ({
      source,
      heading,
      score,
      matchedTerms,
      scoreReasons,
    })),
    retrieval: {
      budgetChars,
      totalSections: sections.length,
      selectedCount: selected.length,
      selectedSources: [...new Set(selected.map((item) => item.source))],
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

  return normalizeTerms([...terms]);
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
    if (selected.length >= 5 || total >= budgetChars) break;
  }

  return selected.length ? selected : sorted.slice(0, 4);
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
