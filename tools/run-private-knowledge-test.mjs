import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-private-knowledge-'));
const legacyDir = path.join(tempDir, 'legacy');
process.env.APP_DATA_DIR = path.join(tempDir, 'data');
process.env.KNOWLEDGE_DB_PATH = path.join(tempDir, 'private', 'knowledge.db');
process.env.KNOWLEDGE_BACKUP_DIR = path.join(tempDir, 'private', 'backups');
process.env.KNOWLEDGE_BACKUP_ENABLED = 'false';
process.env.PRIVATE_KNOWLEDGE_REQUIRED = 'false';

await fs.mkdir(path.join(legacyDir, 'handbooks'), { recursive: true });
await fs.writeFile(path.join(legacyDir, 'structured-blocks.json'), JSON.stringify({
  version: 'test-v1',
  blocks: [
    {
      id: 'test-proof-hook',
      title: '金额证明前置',
      category: 'personal_ip',
      moduleIds: ['script'],
      methods: ['第一句先讲金额结果', '再讲客户困境和解决过程'],
      keywords: ['工程款', '金额', '胜诉', '电话咨询'],
      scenarios: ['工程纠纷律师成交脚本'],
      requiredInputs: ['案件金额', '客户身份'],
      outputTemplate: ['钩子', '过程', '证明', 'CTA'],
      example: '拖了三年的工程款，今天终于到账了。',
    },
  ],
}, null, 2));
await fs.writeFile(path.join(legacyDir, 'handbooks', 'personal-ip.md'), `# 工程老板转化\n\n先讲金额和对手身份，再讲客户为什么撑不住，最后用风险共担的大白话引导电话咨询。内容必须说明案件拖欠时间、客户现金流压力、可展示的胜诉证明和最终承接动作，不能只写泛泛的法律建议。\n\n- 金额前置\n- 胜诉证明\n- 电话承接\n`);
await fs.writeFile(path.join(legacyDir, 'handbooks', 'commerce-video.md'), '# 商品证明\n\n展示真实使用过程、前后变化、用户评价和购买场景，再给出明确购买指令。每一项证明都要能被镜头拍出来，避免只用形容词描述产品效果。');
await fs.writeFile(path.join(legacyDir, 'handbooks', 'combined.md'), '# 统一原则\n\n用户事实优先，知识方法负责补齐完整结构。所有输出都必须区分用户已经提供的事实、系统根据知识库给出的建议和仍需人工确认的信息。');

const {
  createPrivateKnowledgeBackup,
  getPrivateKnowledgeDatabaseStatus,
  listPrivateKnowledgeBackups,
  restorePrivateKnowledgeBackup,
} = await import('../server/knowledge/privateKnowledgeDatabase.mjs');
const {
  createKnowledgeCandidate,
  bulkImportPublishedKnowledgeCards,
  deleteProjectMemoryForUser,
  getKnowledgeCard,
  listKnowledgeCardVersions,
  listKnowledgeCards,
  listKnowledgeCandidates,
  listProjectMemories,
  publishKnowledgeCandidate,
  updateKnowledgeCard,
  upsertProjectMemory,
} = await import('../server/knowledge/privateKnowledgeRepository.mjs');
const { initializePrivateKnowledgeSystem } = await import('../server/knowledge/privateKnowledgeMigration.mjs');
const { retrievePrivateKnowledge } = await import('../server/knowledge/privateKnowledgeRetrieval.mjs');

try {
  const initialized = await initializePrivateKnowledgeSystem({ legacyKnowledgeDir: legacyDir });
  assert.ok(initialized.publishedCards >= 2, 'legacy knowledge should import structured blocks and handbook sections');

  const cardsAfterImport = await listKnowledgeCards({ status: 'published' });
  assert.ok(cardsAfterImport.some((card) => card.legacyKey === 'structured:test-proof-hook'));

  const candidate = await createKnowledgeCandidate({
    sourceType: 'admin_text',
    sourceSummary: '管理员补充的工程律师转化方法',
    createdBy: 'admin-1',
    qualityScore: 91,
    draft: {
      title: '关系顾虑化解',
      summary: '先承认工程老板怕得罪关系，再解释利益和现实。',
      content: '客户担心得罪国央企时，先共情，再说明关系不能替代回款和现金流。',
      category: 'personal_ip',
      moduleIds: ['conversion-topics'],
      methods: ['共情关系顾虑', '解释现实利益', '给出风险共担方案'],
      keywords: ['关系', '工程款', '风险共担'],
      scenarios: ['工程老板不敢撕破脸'],
      qualityScore: 91,
      confidence: 0.92,
    },
  });
  assert.equal(candidate.status, 'pending');
  assert.equal((await listKnowledgeCandidates({ status: 'pending' })).length, 1);

  const published = await publishKnowledgeCandidate(candidate.id, 'admin-1');
  assert.equal(published.status, 'published');
  assert.equal(published.title, '关系顾虑化解');
  assert.equal((await listKnowledgeCandidates({ status: 'pending' })).length, 0);

  const updated = await updateKnowledgeCard(published.id, {
    summary: '先承认关系顾虑，再用现金流和风险共担化解。',
  }, 'admin-1');
  assert.equal(updated.version, 2);
  assert.equal((await listKnowledgeCardVersions(updated.id)).length, 2);

  const memoryA = await upsertProjectMemory({
    userId: 'user-a',
    projectId: 'project-a',
    moduleId: 'script',
    title: '工程案例金额开头有效',
    summary: '金额和胜诉第一句带来更多电话咨询。',
    content: '优先使用大金额、胜诉和国央企身份作为第一句。',
    keywords: ['金额', '胜诉', '国央企', '电话咨询'],
    evidence: { metrics: { privateMessages: 6, phoneCalls: 3, deals: 1 } },
    sourceType: 'experiment_review',
    sourceRef: 'experiment-a',
    qualityScore: 94,
  });
  await upsertProjectMemory({
    userId: 'user-b',
    projectId: 'project-b',
    moduleId: 'script',
    title: '另一个用户的偏好',
    content: '只属于另一个项目。',
    sourceRef: 'experiment-b',
  });
  assert.equal((await listProjectMemories({ userId: 'user-a', projectId: 'project-a' })).length, 1);
  assert.equal((await listProjectMemories({ userId: 'user-a', projectId: 'project-b' })).length, 0);

  const retrieval = await retrievePrivateKnowledge({
    userId: 'user-a',
    projectId: 'project-a',
    moduleId: 'script',
    taskType: 'personal_ip',
    queryTerms: ['工程款', '金额', '胜诉', '电话咨询'],
    budgetChars: 1200,
  });
  assert.equal(retrieval.selected[0].scope, 'project', 'project memory should have highest priority');
  assert.ok(retrieval.selected.some((item) => item.source.includes('private/global')));

  await bulkImportPublishedKnowledgeCards([
    {
      legacyKey: 'duplicate:test:a',
      sourceType: 'test',
      sourceRef: 'duplicate-a',
      draft: {
        title: '重复方法测试',
        summary: '相同方法只应进入一次提示词。',
        content: '先讲结果，再讲证明，最后给出明确行动指令。',
        category: 'personal_ip',
        moduleIds: ['script'],
        keywords: ['结果', '证明', '行动指令'],
      },
    },
    {
      legacyKey: 'duplicate:test:b',
      sourceType: 'test',
      sourceRef: 'duplicate-b',
      draft: {
        title: '重复方法测试',
        summary: '相同方法只应进入一次提示词。',
        content: '先讲结果，再讲证明，最后给出明确行动指令。',
        category: 'combined',
        moduleIds: ['script'],
        keywords: ['结果', '证明', '行动指令'],
      },
    },
  ], 'system:test');
  const deduplicatedRetrieval = await retrievePrivateKnowledge({
    moduleId: 'script',
    taskType: 'personal_ip',
    queryTerms: ['重复方法测试', '结果', '证明', '行动指令'],
    budgetChars: 2000,
  });
  assert.equal(deduplicatedRetrieval.selected.filter((item) => item.title === '重复方法测试').length, 1);
  assert.ok(deduplicatedRetrieval.retrieval.deduplicatedCandidates >= 1, 'retrieval should report removed duplicate candidates');

  await bulkImportPublishedKnowledgeCards([
    {
      legacyKey: 'ranking:test:broad',
      sourceType: 'legacy_handbook_section',
      sourceRef: 'broad-handbook',
      draft: {
        title: '通用说明',
        summary: '脚本、CTA、案例、分镜和完整骨架。',
        content: '脚本、CTA、案例、分镜和完整骨架等通用说明。',
        category: 'combined',
        moduleIds: ['ip-positioning', 'operation-plan', 'viral-topics', 'conversion-topics', 'pain-topics', 'script', 'rewrite', 'viral-analysis', 'polish', 'commerce'],
      },
    },
    {
      legacyKey: 'ranking:test:specific',
      sourceType: 'admin_method',
      sourceRef: 'specific-method',
      draft: {
        title: '金额胜诉成交脚本',
        summary: '工程律师用大金额胜诉和风险共担承接电话咨询。',
        content: '第一句讲金额胜诉，中段讲客户现金流困境，结尾用风险共担承接电话咨询。',
        category: 'personal_ip',
        moduleIds: ['script'],
        methods: ['金额胜诉前置', '风险共担', '电话咨询'],
        keywords: ['工程律师', '工程款', '金额胜诉', '风险共担', '电话咨询'],
      },
    },
  ], 'system:test');
  const rankedRetrieval = await retrievePrivateKnowledge({
    moduleId: 'script',
    taskType: 'personal_ip',
    queryTerms: ['脚本', 'CTA', '案例', '工程律师', '金额胜诉', '风险共担', '电话咨询'],
    budgetChars: 2000,
  });
  const specificIndex = rankedRetrieval.selected.findIndex((item) => item.title === '金额胜诉成交脚本');
  const broadIndex = rankedRetrieval.selected.findIndex((item) => item.title === '通用说明');
  assert.ok(specificIndex >= 0, 'specific professional method should be selected');
  assert.ok(broadIndex < 0 || specificIndex < broadIndex, 'specific professional method should outrank broad handbook text');

  const backup = await createPrivateKnowledgeBackup({ kind: 'manual' });
  assert.ok(backup.fileName.endsWith('.db'));
  await updateKnowledgeCard(published.id, { title: '临时修改标题' }, 'admin-1');
  assert.equal((await getKnowledgeCard(published.id)).title, '临时修改标题');
  await restorePrivateKnowledgeBackup(backup.fileName);
  assert.equal((await getKnowledgeCard(published.id)).title, '关系顾虑化解', 'restore should replace in-memory and on-disk database');
  assert.ok((await listPrivateKnowledgeBackups()).length >= 2, 'manual and pre-restore backups should exist');

  await deleteProjectMemoryForUser('user-a', 'project-a', memoryA.id);
  assert.equal((await listProjectMemories({ userId: 'user-a', projectId: 'project-a' })).length, 0);

  const finalStatus = await getPrivateKnowledgeDatabaseStatus();
  console.log(JSON.stringify({
    ok: true,
    publishedCards: finalStatus.publishedCards,
    versions: finalStatus.versions,
    backupCount: (await listPrivateKnowledgeBackups()).length,
    message: 'Private knowledge migration, review, project isolation, retrieval, versioning, backup, and restore passed.',
  }, null, 2));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
