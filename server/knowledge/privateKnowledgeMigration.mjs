import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getPrivateKnowledgeDatabaseStatus,
  initializePrivateKnowledgeDatabase,
  privateKnowledgeRequired,
} from './privateKnowledgeDatabase.mjs';
import {
  bulkImportPublishedKnowledgeCards,
  getKnowledgeMeta,
  setKnowledgeMeta,
} from './privateKnowledgeRepository.mjs';

const rootDir = process.cwd();

export async function initializePrivateKnowledgeSystem({
  legacyKnowledgeDir = process.env.LEGACY_KNOWLEDGE_DIR || path.join(rootDir, 'knowledge'),
  forceImport = false,
} = {}) {
  await initializePrivateKnowledgeDatabase();
  const currentStatus = await getPrivateKnowledgeDatabaseStatus();
  const importState = await getKnowledgeMeta('legacy_import');
  let migration = importState || null;

  if (forceImport || currentStatus.totalCards === 0) {
    migration = await importLegacyKnowledgeDirectory(legacyKnowledgeDir);
  }

  const status = await getPrivateKnowledgeDatabaseStatus();
  const minimumCards = privateKnowledgeMinimumCards();
  if (privateKnowledgeRequired() && status.publishedCards < minimumCards) {
    const error = new Error(`私有知识库只有 ${status.publishedCards} 条已发布知识，低于要求的 ${minimumCards} 条。`);
    error.code = 'PRIVATE_KNOWLEDGE_UNAVAILABLE';
    error.status = status;
    throw error;
  }

  return { ...status, minimumCards, migration };
}

export async function importLegacyKnowledgeDirectory(legacyKnowledgeDir) {
  const sourceDir = path.resolve(String(legacyKnowledgeDir || ''));
  const entries = [];
  const structuredPath = path.join(sourceDir, 'structured-blocks.json');

  try {
    const raw = await fs.readFile(structuredPath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    for (const block of parsed.blocks || []) {
      if (!block?.id || !block?.title) continue;
      entries.push({
        legacyKey: `structured:${block.id}`,
        sourceType: 'legacy_structured_block',
        sourceRef: `structured-blocks/${block.id}`,
        draft: {
          title: block.title,
          summary: block.description || (block.methods || []).join('；'),
          content: [
            block.description,
            ...(block.methods || []),
            ...(block.scenarios || []),
          ].filter(Boolean).join('\n'),
          category: block.category || 'combined',
          moduleIds: block.moduleIds || [],
          methods: block.methods || [],
          keywords: block.keywords || [],
          scenarios: block.scenarios || [],
          requiredInputs: block.requiredInputs || [],
          outputTemplate: block.outputTemplate || [],
          example: block.example || '',
          evidence: {
            importedFrom: structuredPath,
            originalId: block.id,
            sourceVersion: parsed.version || '',
          },
          qualityScore: 82,
          confidence: 0.9,
        },
      });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const handbooks = [
    { relativePath: 'handbooks/personal-ip.md', category: 'personal_ip', moduleIds: ['ip-positioning', 'operation-plan', 'viral-topics', 'conversion-topics', 'pain-topics', 'script', 'rewrite', 'viral-analysis', 'polish'] },
    { relativePath: 'handbooks/commerce-video.md', category: 'commerce_video', moduleIds: ['commerce', 'script', 'viral-analysis', 'polish'] },
    { relativePath: 'handbooks/combined.md', category: 'combined', moduleIds: ['ip-positioning', 'operation-plan', 'viral-topics', 'conversion-topics', 'pain-topics', 'script', 'rewrite', 'viral-analysis', 'polish', 'commerce'] },
  ];

  for (const handbook of handbooks) {
    const filePath = path.join(sourceDir, handbook.relativePath);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      for (const section of splitMarkdownSections(content)) {
        const legacyKey = `handbook:${handbook.relativePath}:${shortHash(`${section.heading}\n${section.content}`)}`;
        entries.push({
          legacyKey,
          sourceType: 'legacy_handbook_section',
          sourceRef: `${handbook.relativePath}#${section.heading}`,
          draft: {
            title: section.heading,
            summary: compactText(section.content, 500),
            content: section.content,
            category: handbook.category,
            moduleIds: handbook.moduleIds,
            methods: extractBulletLines(section.content, 30),
            keywords: extractKeywords(section.heading, section.content),
            evidence: { importedFrom: filePath },
            qualityScore: 72,
            confidence: 0.78,
          },
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  if (!entries.length) {
    const result = {
      imported: 0,
      skipped: 0,
      sourceDir,
      completedAt: new Date().toISOString(),
      warning: '没有找到可导入的旧知识文件。',
    };
    await setKnowledgeMeta('legacy_import', result);
    return result;
  }

  const result = await bulkImportPublishedKnowledgeCards(entries, 'system:migration');
  const migration = {
    ...result,
    sourceDir,
    discovered: entries.length,
    completedAt: new Date().toISOString(),
  };
  await setKnowledgeMeta('legacy_import', migration);
  return migration;
}

export function privateKnowledgeMinimumCards() {
  const value = Number(process.env.PRIVATE_KNOWLEDGE_MIN_CARDS || 20);
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 20;
}

function splitMarkdownSections(content) {
  const lines = String(content || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const sections = [];
  let heading = '文档概览';
  let body = [];

  const flush = () => {
    const text = body.join('\n').trim();
    if (text.length >= 80) sections.push({ heading, content: text.slice(0, 20000) });
  };

  for (const line of lines) {
    const match = /^(#{1,4})\s+(.+)$/.exec(line);
    if (match) {
      flush();
      heading = match[2].trim();
      body = [];
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

function extractBulletLines(content, limit) {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => /^\s*[-*+]\s+(.+)$/.exec(line)?.[1]?.trim() || '')
    .filter((line) => line.length >= 4 && line.length <= 500)
    .slice(0, limit);
}

function extractKeywords(heading, content) {
  const source = `${heading}\n${String(content || '').slice(0, 3000)}`;
  const matches = source.match(/[A-Za-z][A-Za-z0-9+.-]{2,20}|[\u4e00-\u9fff]{2,8}/g) || [];
  const seen = new Set();
  const output = [];
  for (const match of matches) {
    const normalized = match.trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= 40) break;
  }
  return output;
}

function compactText(content, maxLength) {
  return String(content || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 20);
}
