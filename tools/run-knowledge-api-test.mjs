import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-knowledge-api-'));
const legacyDir = path.join(tempDir, 'legacy');
await fs.mkdir(path.join(legacyDir, 'handbooks'), { recursive: true });
await fs.writeFile(path.join(legacyDir, 'structured-blocks.json'), JSON.stringify({
  version: 'api-test',
  blocks: [{
    id: 'api-proof-hook',
    title: 'API测试金额证明方法',
    category: 'personal_ip',
    moduleIds: ['script'],
    methods: ['金额结果前置', '证明材料打码'],
    keywords: ['工程款', '胜诉', '金额'],
    scenarios: ['工程律师口播'],
  }],
}));
await fs.writeFile(path.join(legacyDir, 'handbooks', 'personal-ip.md'), '# API 测试手册\n\n工程律师脚本先讲大金额结果，再讲客户现金流困境和风险共担，最后引导电话咨询。该段用于验证私有知识迁移和检索。');

const fakeModelServer = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const prompt = JSON.stringify(body.messages || []);
  const content = prompt.includes('知识工程师')
    ? {
        cards: [{
          title: 'API提炼的工程成交方法',
          summary: '金额、强对手和胜诉结果前置。',
          content: '第一句讲金额和结果，中段讲客户现金流困境，结尾用风险共担引导电话。',
          category: 'personal_ip',
          moduleIds: ['script', 'conversion-topics'],
          methods: ['金额前置', '客户困境', '风险共担CTA'],
          keywords: ['工程款', '金额', '胜诉', '电话'],
          scenarios: ['工程律师成交口播'],
          qualityScore: 90,
          confidence: 0.9,
        }],
      }
    : {
        module: '脚本创作',
        summary: '工程律师面向被拖欠工程款的老板，用金额胜诉和风险共担建立信任。',
        sections: [{ title: '脚本结构', items: ['第一句讲一千多万工程款已经胜诉', '中段讲老板现金流压力', '结尾引导电话咨询'] }],
        tables: [],
        scripts: [{ title: '工程款案例口播', hook: '拖了三年的一千多万工程款，今天终于到账了。', body: ['对手是国央企，老板下面还要付材料款和工资。', '我们愿意和工程老板风险共担。'], shots: ['判决书金额打码特写'], cta: '工程款被拖欠，可以电话沟通。' }],
        nextActions: ['发布后记录电话和线索'],
        riskNotes: ['客户和案件隐私必须打码'],
      };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    model: 'knowledge-api-test-model',
    choices: [{ message: { content: JSON.stringify(content) } }],
  }));
});

await new Promise((resolve) => fakeModelServer.listen(0, '127.0.0.1', resolve));
const fakePort = fakeModelServer.address().port;
const appPort = await reservePort();
let serverOutput = '';
const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: String(appPort),
    APP_DATA_DIR: path.join(tempDir, 'data'),
    KNOWLEDGE_DB_PATH: path.join(tempDir, 'private', 'knowledge.db'),
    KNOWLEDGE_BACKUP_DIR: path.join(tempDir, 'private', 'backups'),
    KNOWLEDGE_BACKUP_ENABLED: 'false',
    LEGACY_KNOWLEDGE_DIR: legacyDir,
    PRIVATE_KNOWLEDGE_REQUIRED: 'true',
    PRIVATE_KNOWLEDGE_MIN_CARDS: '1',
    ADMIN_USERNAME: 'admin',
    INITIAL_ADMIN_PASSWORD: 'admin-test-pass',
    OPENAI_BASE_URL: `http://127.0.0.1:${fakePort}/v1`,
    OPENAI_API_KEY: 'server-test-key',
    OPENAI_MODEL: 'knowledge-api-test-model',
    OPENAI_FALLBACK_MODELS: '',
    AGENT_REVIEW_ENABLED: 'false',
    QUALITY_REPAIR_ENABLED: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

const baseUrl = `http://127.0.0.1:${appPort}`;

try {
  const health = await waitForHealth(`${baseUrl}/api/health`);
  assert.equal(health.knowledge.private.ok, true);
  assert.ok(health.knowledge.private.publishedCards >= 1);
  assert.equal(JSON.stringify(health).includes('server-test-key'), false, 'health must not expose API keys');
  assert.equal(Object.hasOwn(health.knowledge.private, 'path'), false, 'health must not expose private database path');

  const adminSession = await login(baseUrl, 'admin', 'admin-test-pass');
  const status = await apiJson(baseUrl, '/api/admin/knowledge/status', { cookie: adminSession });
  assert.ok(status.overview.totals.publishedCards >= 1);
  assert.equal(JSON.stringify(status).includes(tempDir), false, 'admin status must not expose filesystem paths');

  const ingestion = await apiJson(baseUrl, '/api/admin/knowledge/ingest', {
    method: 'POST',
    cookie: adminSession,
    body: {
      title: 'API测试补充资料',
      text: '工程老板怕得罪关系，但工程款长期拖欠已经导致现金流断裂。脚本要先讲金额和胜诉结果，再共情关系顾虑，最后用风险共担的大白话引导电话咨询。',
    },
  });
  assert.equal(ingestion.candidates.length, 1);
  const candidateId = ingestion.candidates[0].id;

  const pending = await apiJson(baseUrl, '/api/admin/knowledge/candidates?status=pending', { cookie: adminSession });
  assert.ok(pending.candidates.some((item) => item.id === candidateId));

  const published = await apiJson(baseUrl, `/api/admin/knowledge/candidates/${candidateId}/publish`, {
    method: 'POST',
    cookie: adminSession,
  });
  assert.equal(published.card.status, 'published');

  const uploadBody = new FormData();
  uploadBody.set('title', '上传资料测试');
  uploadBody.set('file', new Blob(['短视频开头要先讲客户最想知道的结果，再用金额、案例、合同或过程等真实证明建立信任。正文需要说明用户为什么会相信，最后给出私信、电话、到店或购买等明确承接动作。'], { type: 'text/plain' }), 'upload-test.txt');
  const uploadResponse = await fetch(`${baseUrl}/api/admin/knowledge/upload`, {
    method: 'POST',
    headers: { Cookie: adminSession },
    body: uploadBody,
  });
  const uploadPayload = await uploadResponse.json();
  assert.equal(uploadResponse.ok, true, uploadPayload.message);
  assert.equal(uploadPayload.candidates.length, 1);

  const creatorA = await apiJson(baseUrl, '/api/admin/users', {
    method: 'POST',
    cookie: adminSession,
    body: { username: 'creator-a', password: 'creator-pass-a', dailyLimit: 20 },
  });
  await apiJson(baseUrl, '/api/admin/users', {
    method: 'POST',
    cookie: adminSession,
    body: { username: 'creator-b', password: 'creator-pass-b', dailyLimit: 20 },
  });
  assert.equal(creatorA.user.username, 'creator-a');

  const creatorASession = await login(baseUrl, 'creator-a', 'creator-pass-a');
  const creatorAProjects = await apiJson(baseUrl, '/api/projects', { cookie: creatorASession });
  const projectA = creatorAProjects.projects[0];
  const generated = await apiJson(baseUrl, '/api/generate', {
    method: 'POST',
    cookie: creatorASession,
    body: {
      projectId: projectA.id,
      moduleId: 'script',
      formData: { prompt: '工程律师给被拖欠工程款的老板写成交口播' },
      selections: [],
      context: {},
    },
  });
  assert.ok(generated.record.id);
  assert.ok(generated.result.knowledgeCitations.some((item) => item.source.startsWith('private/')), 'generation should cite private knowledge');
  const privateCitation = generated.result.knowledgeCitations.find((item) => item.source.startsWith('private/global/'));
  assert.equal(privateCitation?.scope, 'global', 'private global citation should preserve its scope');
  assert.ok(privateCitation?.cardId, 'private global citation should preserve the card id');
  assert.ok(Number(privateCitation?.version) >= 1, 'private global citation should preserve the card version');

  const feedback = await apiJson(baseUrl, '/api/knowledge/feedback', {
    method: 'POST',
    cookie: creatorASession,
    body: {
      projectId: projectA.id,
      moduleId: 'script',
      generationRecordId: generated.record.id,
      helpful: true,
      correctedText: '在河南干工程的李总，被七局拖了三年的一千多万工程款，去年找到我们。这个案子不但打赢了，我们还多争取了违约金。工程款被拖着、前期又没钱打官司的老板，可以电话沟通，我们愿意和工程老板风险共担。',
      notes: '金额、对手身份和结果必须放到第一句。',
    },
  });
  assert.equal(feedback.learning.memory.projectId, projectA.id);

  const ownMemories = await apiJson(baseUrl, `/api/knowledge/project-memories?projectId=${projectA.id}`, { cookie: creatorASession });
  assert.equal(ownMemories.memories.length, 1);

  const creatorBSession = await login(baseUrl, 'creator-b', 'creator-pass-b');
  const crossResponse = await fetch(`${baseUrl}/api/knowledge/project-memories?projectId=${projectA.id}`, { headers: { Cookie: creatorBSession } });
  assert.equal(crossResponse.status, 404, 'another user must not read project learning');

  const adminMemories = await apiJson(baseUrl, '/api/admin/knowledge/project-memories?status=active', { cookie: adminSession });
  assert.ok(adminMemories.memories.some((item) => item.projectId === projectA.id));

  const backup = await apiJson(baseUrl, '/api/admin/knowledge/backups', { method: 'POST', cookie: adminSession });
  assert.ok(backup.backup.fileName.endsWith('.db'));
  assert.equal(JSON.stringify(backup).includes(tempDir), false, 'backup API must not expose filesystem paths');

  console.log(JSON.stringify({
    ok: true,
    initialPrivateCards: health.knowledge.private.publishedCards,
    publishedCandidate: published.card.title,
    projectMemories: ownMemories.memories.length,
    backup: backup.backup.fileName,
    message: 'Authenticated private knowledge API, upload, review, generation citation, feedback isolation, and backup passed.',
  }, null, 2));
} catch (error) {
  error.message = `${error.message}\nServer output:\n${serverOutput.slice(-6000)}`;
  throw error;
} finally {
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  await new Promise((resolve) => fakeModelServer.close(resolve));
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function login(baseUrl, username, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, payload.message);
  return response.headers.get('set-cookie').split(';')[0];
}

async function apiJson(baseUrl, route, { method = 'GET', cookie = '', body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${route}: ${payload.message || response.status}`);
  return payload;
}

async function waitForHealth(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function reservePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
