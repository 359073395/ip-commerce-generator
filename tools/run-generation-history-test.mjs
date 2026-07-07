import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-generation-history-'));
process.env.APP_DATA_DIR = tempDir;
process.env.ADMIN_USERNAME = 'admin';
process.env.INITIAL_ADMIN_PASSWORD = 'admin-test-pass';

const {
  createProjectForUser,
  createUser,
  getDb,
  getGenerationRecordForUser,
  initializeDatabase,
  listGenerationRecordsForUser,
  listProjectsForUser,
  loginUser,
  recordGeneration,
} = await import('../server/database.mjs');

try {
  await initializeDatabase();

  const adminLogin = await loginUser('admin', 'admin-test-pass');
  const creatorA = await createUser({ username: 'creator-history-a', password: 'pass-a', dailyLimit: 20 });
  const creatorB = await createUser({ username: 'creator-history-b', password: 'pass-b', dailyLimit: 20 });

  const projectsA = await listProjectsForUser(creatorA.id);
  const projectA = projectsA[0];
  const secondProjectA = await createProjectForUser(creatorA.id, {
    name: 'second history project',
    profile: { industry: 'education' },
  });
  const projectB = (await listProjectsForUser(creatorB.id))[0];

  const record = await recordGeneration(creatorA.id, projectA.id, 'script', {
    moduleLabel: '脚本创作',
    model: 'test-model',
    request: {
      moduleId: 'script',
      projectId: projectA.id,
      formData: { topic: '老板IP成交脚本', prompt: '做一条成交视频' },
      selections: [{ step: '脚本类型', choice: '成交脚本', subChoice: '讲故事' }],
      context: { ipPositioning: { summary: '本地教育顾问IP' } },
    },
    result: {
      summary: '一条围绕信任和案例的成交脚本。',
      sections: [{ title: '结构', items: ['痛点进入', '案例证明', '行动指令'] }],
      riskNotes: ['测试记录'],
    },
  });

  assert.ok(record.id, 'recordGeneration should return a history record when details are provided');
  assert.equal(record.userId, creatorA.id);
  assert.equal(record.projectId, projectA.id);
  assert.equal(record.moduleId, 'script');
  assert.equal(record.moduleLabel, '脚本创作');
  assert.equal(record.model, 'test-model');
  assert.equal(record.request.formData.topic, '老板IP成交脚本');
  assert.equal(record.result.summary, '一条围绕信任和案例的成交脚本。');

  await recordGeneration(creatorA.id, secondProjectA.id, 'commerce', {
    moduleLabel: '带货',
    request: { moduleId: 'commerce', projectId: secondProjectA.id },
    result: { summary: '第二项目带货方案。' },
  });
  await recordGeneration(creatorB.id, projectB.id, 'script', {
    moduleLabel: '脚本创作',
    request: { moduleId: 'script', projectId: projectB.id },
    result: { summary: '另一个用户的记录。' },
  });

  const scriptRecordsA = await listGenerationRecordsForUser(creatorA.id, {
    projectId: projectA.id,
    moduleId: 'script',
    limit: 10,
  });
  assert.equal(scriptRecordsA.length, 1, 'user should only see matching project and module records');
  assert.equal(scriptRecordsA[0].id, record.id);

  const allRecordsA = await listGenerationRecordsForUser(creatorA.id, { limit: 9999 });
  assert.equal(allRecordsA.length, 2, 'limit should be clamped but still include two records');
  assert.ok(allRecordsA.every((item) => item.userId === creatorA.id), 'history list should be user-scoped');

  const crossUserRead = await getGenerationRecordForUser(creatorB.id, record.id);
  assert.equal(crossUserRead, null, 'users should not read another user history record');

  const adminReadUserRecord = await getGenerationRecordForUser(adminLogin.user.id, record.id);
  assert.equal(adminReadUserRecord, null, 'admin user-scoped read should not bypass ownership');

  const db = await getDb();
  const malformedId = crypto.randomUUID();
  db.run(`
    INSERT INTO generation_records (
      id, user_id, project_id, module_id, module_label, model, request_json, result_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    malformedId,
    creatorA.id,
    projectA.id,
    'script',
    '脚本创作',
    'broken-json-model',
    '{bad-json',
    '[]',
    new Date().toISOString(),
  ]);

  const malformed = await getGenerationRecordForUser(creatorA.id, malformedId);
  assert.deepEqual(malformed.request, {}, 'malformed request JSON should parse to empty object');
  assert.deepEqual(malformed.result, {}, 'non-object result JSON should parse to empty object');

  console.log(JSON.stringify({
    ok: true,
    scopedRecords: scriptRecordsA.length,
    allRecordsForUserA: allRecordsA.length,
    malformedSafe: Boolean(malformed),
    message: 'Generation history persistence and isolation passed.',
  }, null, 2));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
