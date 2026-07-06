import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();
const knowledgeDir = path.join(rootDir, 'knowledge');

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
  const files = {
    personal_ip: ['handbooks/personal-ip.md'],
    commerce_video: ['handbooks/commerce-video.md'],
    combined: ['handbooks/personal-ip.md', 'handbooks/commerce-video.md', 'handbooks/combined.md'],
  }[taskType] || ['handbooks/personal-ip.md'];

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
  const files = {
    personal_ip: ['handbooks/personal-ip.md'],
    commerce_video: ['handbooks/commerce-video.md'],
    combined: ['handbooks/personal-ip.md', 'handbooks/commerce-video.md', 'handbooks/combined.md'],
  }[taskType] || ['handbooks/personal-ip.md'];

  const queryTerms = buildQueryTerms({ moduleId, label, knowledge, output, formData, selections, context });
  const sections = [];
  for (const relativePath of files) {
    const filePath = path.join(knowledgeDir, relativePath);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      sections.push(...splitMarkdownSections(content).map((section) => ({
        ...section,
        source: relativePath,
        score: scoreSection(section, queryTerms),
      })));
    } catch (error) {
      sections.push({
        source: relativePath,
        heading: `Source missing: ${relativePath}`,
        content: error.message,
        score: -1,
      });
    }
  }

  const selected = selectSections(sections, budgetChars);
  const pack = [
    `# Knowledge Pack: ${label || moduleId}`,
    `Selected sources: ${selected.map((item) => `${item.source} > ${item.heading}`).join(' | ')}`,
    '',
    ...selected.map((item) => `- ${item.heading} (${item.source}): ${compactSection(item.content, 260)}`),
  ].join('\n\n');

  return {
    pack,
    selected: selected.map(({ source, heading, score }) => ({ source, heading, score })),
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

  return [...terms].filter(Boolean);
}

function scoreSection(section, terms) {
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

function selectSections(sections, budgetChars) {
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
      const buffer = await fs.readFile(filePath);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
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
