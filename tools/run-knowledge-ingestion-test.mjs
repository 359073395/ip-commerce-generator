import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-knowledge-ingestion-'));
process.env.APP_DATA_DIR = path.join(tempDir, 'data');
process.env.KNOWLEDGE_DB_PATH = path.join(tempDir, 'private', 'knowledge.db');
process.env.KNOWLEDGE_BACKUP_DIR = path.join(tempDir, 'private', 'backups');
process.env.KNOWLEDGE_BACKUP_ENABLED = 'false';
process.env.PRIVATE_KNOWLEDGE_REQUIRED = 'false';
process.env.ADMIN_USERNAME = 'admin';
process.env.INITIAL_ADMIN_PASSWORD = 'admin-test-pass';

const { parseKnowledgeDocument } = await import('../server/knowledge/knowledgeDocumentParser.mjs');
const { createKnowledgeCandidatesFromText } = await import('../server/knowledge/privateKnowledgeIngestion.mjs');
const { learnFromContentExperiment, recordResultFeedback } = await import('../server/knowledge/privateKnowledgeFeedback.mjs');
const {
  listKnowledgeCandidates,
  listProjectMemories,
} = await import('../server/knowledge/privateKnowledgeRepository.mjs');
const {
  createUser,
  initializeDatabase,
  listProjectsForUser,
  recordGeneration,
} = await import('../server/database.mjs');

try {
  const parsedText = await parseKnowledgeDocument({
    buffer: Buffer.from('工程老板最怕得罪关系，但现金流已经撑不住。内容要先共情，再讲现实利益，最后说明风险共担。', 'utf8'),
    originalName: '工程律师方法.md',
    mimeType: 'text/markdown',
  });
  assert.equal(parsedText.title, '工程律师方法');
  assert.ok(parsedText.text.includes('风险共担'));

  const parsedJson = await parseKnowledgeDocument({
    buffer: Buffer.from('{"method":"金额前置","proof":"胜诉判决"}', 'utf8'),
    originalName: 'method.json',
  });
  assert.ok(parsedJson.text.includes('\n'));

  let ingestionPrompt = '';
  const fakeModel = async (messages) => {
    ingestionPrompt = JSON.stringify(messages);
    return ({
    cards: [
      {
        title: '关系顾虑现实化解法',
        summary: '先共情关系，再回到现金流和现实利益。',
        content: '工程老板怕得罪关系时，不直接否定关系，先承认顾虑，再说明继续拖欠对现金流的影响。',
        category: 'personal_ip',
        moduleIds: ['conversion-topics'],
        methods: ['共情顾虑', '解释现金流', '给出风险共担方案'],
        keywords: ['工程老板', '关系', '现金流'],
        qualityScore: 88,
        confidence: 0.9,
      },
    ],
    });
  };
  const ingestion = await createKnowledgeCandidatesFromText({
    text: parsedText.text.repeat(3),
    title: parsedText.title,
    sourceType: 'admin_upload',
    sourceRef: 'fixture.md',
    adminUserId: 'admin-id',
    callModel: fakeModel,
  });
  assert.equal(ingestion.candidates.length, 1);
  assert.ok(ingestionPrompt.includes('未受信任的数据'), 'knowledge extraction must treat uploaded content as untrusted data');
  assert.equal(ingestion.candidates[0].draft.title, '关系顾虑现实化解法');
  assert.equal((await listKnowledgeCandidates({ status: 'pending' })).length, 1);

  await initializeDatabase();
  const user = await createUser({ username: 'feedback-user', password: 'pass', dailyLimit: 10 });
  const project = (await listProjectsForUser(user.id))[0];
  const record = await recordGeneration(user.id, project.id, 'script', {
    moduleLabel: '脚本创作',
    request: { formData: { industry: '工程纠纷律师' } },
    result: { summary: '原始脚本开头较弱。', scripts: [{ hook: '工程款被拖欠怎么办？' }] },
  });
  const feedback = await recordResultFeedback({
    userId: user.id,
    projectId: project.id,
    moduleId: 'script',
    generationRecord: record,
    helpful: true,
    correctedText: '在河南干工程的李总，被七局拖了三年的一千多万工程款，去年找到我们。这个案子不但打赢了，我们还多争取了违约金。工程款被拖着、前期又没钱打官司的老板，可以电话沟通，我们愿意和工程老板风险共担。',
    notes: '第一句必须先讲金额、对手身份和结果。',
  });
  assert.equal(feedback.memory.userId, user.id);
  assert.ok(feedback.candidate, 'substantial user correction should enter admin candidate pool');
  assert.equal((await listProjectMemories({ userId: user.id, projectId: project.id })).length, 1);
  assert.equal((await listProjectMemories({ userId: 'other', projectId: project.id })).length, 0);

  const experimentLearning = await learnFromContentExperiment({
    userId: user.id,
    generationRecord: record,
    experiment: {
      id: 'experiment-success',
      userId: user.id,
      projectId: project.id,
      moduleId: 'script',
      status: 'learned',
      review: {
        decision: '继续放大',
        diagnosis: '金额和国央企身份带来了高意向电话。',
        nextActions: ['继续测试同类案例'],
        notes: '咨询质量高。',
        metrics: { views: 18000, privateMessages: 8, phoneCalls: 5, leads: 6, deals: 2 },
      },
    },
  });
  assert.ok(experimentLearning.candidate, 'verified experiment outcome should enter admin candidate pool');
  assert.equal((await listProjectMemories({ userId: user.id, projectId: project.id })).length, 2);

  console.log(JSON.stringify({
    ok: true,
    parsedCharacters: parsedText.characters,
    adminCandidates: ingestion.candidates.length,
    feedbackCandidate: Boolean(feedback.candidate),
    experimentCandidate: Boolean(experimentLearning.candidate),
    message: 'Knowledge document parsing, AI extraction, result feedback, and experiment learning passed.',
  }, null, 2));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
