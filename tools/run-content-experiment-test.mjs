import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-content-experiment-'));
process.env.APP_DATA_DIR = tempDir;
process.env.ADMIN_USERNAME = 'admin';
process.env.INITIAL_ADMIN_PASSWORD = 'admin-test-pass';

const {
  createContentExperimentForUser,
  createUser,
  getContentExperimentForUser,
  initializeDatabase,
  listContentExperimentsForUser,
  listProjectsForUser,
  loginUser,
  recordGeneration,
  reviewContentExperimentForUser,
} = await import('../server/database.mjs');

try {
  await initializeDatabase();

  const admin = await loginUser('admin', 'admin-test-pass');
  const creatorA = await createUser({ username: 'experiment-a', password: 'pass-a', dailyLimit: 20 });
  const creatorB = await createUser({ username: 'experiment-b', password: 'pass-b', dailyLimit: 20 });
  const projectA = (await listProjectsForUser(creatorA.id))[0];
  const projectB = (await listProjectsForUser(creatorB.id))[0];

  const record = await recordGeneration(creatorA.id, projectA.id, 'script', {
    moduleLabel: '脚本创作',
    model: 'test-model',
    request: {
      moduleId: 'script',
      formData: {
        prompt: '工程律师IP，目标实际施工人，做一条大金额胜诉和电话咨询的成交脚本。',
      },
      selections: [{ step: '主脚本选择', choice: '成交脚本', subChoice: '案例成交' }],
    },
    result: {
      summary: '拖了3年的工程款终于到账，用胜诉金额、判决书打码和电话咨询做承接。',
      sections: [
        {
          title: '脚本结构',
          items: ['第一句讲金额结果', '中段讲国央企和客户撑不住', '结尾引导电话咨询'],
        },
      ],
      scripts: [
        {
          title: '工程款回款脚本',
          hook: '拖了3年的工程款，今天终于到账了。',
          body: ['客户是实际施工人，前期没钱打官司。', '我们愿意和工程老板风险共担。'],
          cta: '工程款被拖欠，可以私信或电话沟通。',
        },
      ],
    },
  });

  const experiment = await createContentExperimentForUser(creatorA.id, {
    projectId: projectA.id,
    generationRecordId: record.id,
    moduleId: 'script',
    title: '工程律师大金额胜诉脚本实验',
  });

  assert.equal(experiment.userId, creatorA.id);
  assert.equal(experiment.projectId, projectA.id);
  assert.equal(experiment.generationRecordId, record.id);
  assert.ok(experiment.score.total >= 70, 'proof-heavy conversion script should be publishable');
  assert.ok(experiment.prediction.blind, 'experiment should keep blind prediction metadata');
  assert.ok(experiment.prediction.watchMetrics.includes('私信数'), 'prediction should include conversion metrics');

  const crossRead = await getContentExperimentForUser(creatorB.id, experiment.id);
  assert.equal(crossRead, null, 'another user should not read the experiment');
  const adminRead = await getContentExperimentForUser(admin.user.id, experiment.id);
  assert.equal(adminRead, null, 'admin user-scoped read should not bypass ownership');

  await recordGeneration(creatorB.id, projectB.id, 'script', {
    moduleLabel: '脚本创作',
    request: { moduleId: 'script' },
    result: { summary: '另一个用户的内容。' },
  });
  const listedA = await listContentExperimentsForUser(creatorA.id, { projectId: projectA.id });
  assert.equal(listedA.length, 1, 'list should be scoped to creator A project');

  const reviewed = await reviewContentExperimentForUser(creatorA.id, experiment.id, {
    publishUrl: 'https://example.com/video/1',
    publishedAt: '2026-07-11',
    metrics: {
      views: 3600,
      completionRate: 42,
      likes: 180,
      comments: 22,
      saves: 30,
      shares: 6,
      privateMessages: 0,
      phoneCalls: 0,
      leads: 0,
      deals: 0,
      highIntentQuotes: '',
    },
    notes: '播放还可以，但没有电话咨询。',
  });

  assert.equal(reviewed.publish.url, 'https://example.com/video/1');
  assert.equal(reviewed.review.decision, '疑似脏数据');
  assert.ok(reviewed.review.nextActions.some((item) => item.includes('目标人群')), 'dirty data review should recommend audience narrowing');
  assert.ok(reviewed.review.rubricUpdate.includes('目标用户精准度'), 'review should produce rubric update advice');

  console.log(JSON.stringify({
    ok: true,
    score: experiment.score.total,
    decision: reviewed.review.decision,
    experimentsForA: listedA.length,
    message: 'Content experiment scoring, review, and user isolation passed.',
  }, null, 2));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
