import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-agent-execution-'));
process.env.APP_DATA_DIR = tempDir;
process.env.ADMIN_USERNAME = 'admin';
process.env.INITIAL_ADMIN_PASSWORD = 'admin-test-pass';

const {
  createUser,
  getAgentRunForUser,
  initializeDatabase,
  listAgentRunsForUser,
  listProjectsForUser,
  updateProjectForUser,
} = await import('../server/database.mjs');
const {
  buildExecutionSteps,
  buildStepRequest,
  runAgentExecution,
} = await import('../server/agentExecutor.mjs');

try {
  await initializeDatabase();
  const creatorA = await createUser({ username: 'agent-run-a', password: 'pass-a', dailyLimit: 20 });
  const creatorB = await createUser({ username: 'agent-run-b', password: 'pass-b', dailyLimit: 20 });
  const projectA = (await listProjectsForUser(creatorA.id))[0];
  const projectB = (await listProjectsForUser(creatorB.id))[0];
  const projectWithProfile = await updateProjectForUser(creatorA.id, projectA.id, {
    name: 'Local Beauty IP',
    profile: {
      industry: '本地美业',
      persona: '老板IP',
      offer: '到店护理和团购券',
      audience: '本地年轻女性',
      proof: '客户评价和前后对比',
      conversion: '私信预约到店',
    },
  });

  const combinedGoal = '我是本地美业老板，想做个人IP获客成交，最后要生成一条成交脚本，私信预约到店';
  const directSteps = buildExecutionSteps({
    status: 'ready',
    taskType: 'combined',
    recommendedModules: [{ id: 'ip-positioning' }, { id: 'conversion-topics' }],
  }, combinedGoal, 3);
  assert.deepEqual(directSteps.map((item) => item.moduleId), ['ip-positioning', 'conversion-topics', 'script']);

  const firstRequest = buildStepRequest({
    step: directSteps[0],
    goal: combinedGoal,
    project: projectWithProfile,
    previousSteps: [],
  });
  assert.equal(firstRequest.moduleId, 'ip-positioning');
  assert.equal(firstRequest.formData.industry, '本地美业');
  assert.equal(firstRequest.context.agentPreviousSteps.length, 0);

  const secondRequest = buildStepRequest({
    step: directSteps[1],
    goal: combinedGoal,
    project: projectWithProfile,
    previousSteps: [{
      moduleId: 'ip-positioning',
      moduleLabel: 'IP定位',
      recordId: 'record-1',
      summary: '定位为本地美业老板IP',
      result: { summary: '定位为本地美业老板IP' },
    }],
  });
  assert.equal(secondRequest.context.agentPreviousSteps[0].summary, '定位为本地美业老板IP');
  assert.ok(secondRequest.formData.prompt.includes('承接前面步骤'));

  let generatedCount = 0;
  const execution = await runAgentExecution({
    user: creatorA,
    project: projectWithProfile,
    goal: combinedGoal,
    maxSteps: 3,
    generateStep: async ({ requestBody }) => {
      generatedCount += 1;
      return {
        module: { id: requestBody.moduleId, label: requestBody.moduleId },
        record: { id: `record-${generatedCount}` },
        result: {
          summary: `${requestBody.moduleId} generated with ${requestBody.context.agentPreviousSteps.length} previous steps`,
          sections: [{ title: '测试', items: ['自动执行链上下文正常'] }],
          tables: [],
          scripts: [],
          nextActions: [],
          riskNotes: ['测试生成器'],
        },
      };
    },
  });

  assert.equal(execution.status, 'completed');
  assert.equal(execution.steps.length, 3);
  assert.deepEqual(execution.steps.map((item) => item.moduleId), ['ip-positioning', 'conversion-topics', 'script']);
  assert.equal(generatedCount, 3);
  assert.equal(execution.steps[0].recordId, 'record-1');
  assert.ok(execution.steps[1].request.context.agentPreviousSteps[0].summary, 'later steps should receive previous summaries');
  assert.ok(execution.run.id, 'completed execution should be persisted');

  const runsA = await listAgentRunsForUser(creatorA.id, { projectId: projectWithProfile.id, limit: 10 });
  assert.equal(runsA.length, 1);
  assert.equal(runsA[0].steps.length, 3);
  const crossUserRead = await getAgentRunForUser(creatorB.id, execution.run.id);
  assert.equal(crossUserRead, null, 'agent run reads must be user-scoped');

  const lowQualityExecution = await runAgentExecution({
    user: creatorA,
    project: projectWithProfile,
    goal: combinedGoal,
    maxSteps: 3,
    generateStep: async ({ requestBody }) => ({
      module: { id: requestBody.moduleId, label: requestBody.moduleId },
      record: { id: 'low-quality-record' },
      result: {
        summary: '质量不足的测试结果',
        sections: [],
        tables: [],
        scripts: [],
        nextActions: [],
        riskNotes: [],
        quality: {
          score: 42,
          level: 'needs_review',
          missing: ['完整骨架'],
        },
      },
    }),
  });
  assert.equal(lowQualityExecution.status, 'needs_review', 'agent run should stop when a step remains below quality gate');
  assert.equal(lowQualityExecution.steps.length, 1, 'low quality first step should prevent downstream steps');
  assert.equal(lowQualityExecution.steps[0].status, 'needs_review');

  const invalidExecution = await runAgentExecution({
    user: creatorB,
    project: projectB,
    goal: '',
    generateStep: async () => {
      throw new Error('should not generate for invalid planner status');
    },
  });
  assert.equal(invalidExecution.status, 'invalid');
  assert.equal(invalidExecution.steps.length, 0);

  const clampedSteps = buildExecutionSteps({
    status: 'ready',
    taskType: 'personal_ip',
    recommendedModules: [{ id: 'ip-positioning' }, { id: 'viral-topics' }, { id: 'script' }, { id: 'rewrite' }],
  }, '做个人IP脚本改写洗稿拆解', 99);
  assert.ok(clampedSteps.length <= 4, 'maxSteps should be clamped to 4');

  console.log(JSON.stringify({
    ok: true,
    completedSteps: execution.steps.map((item) => item.moduleId),
    persistedRuns: runsA.length,
    lowQualityStatus: lowQualityExecution.status,
    invalidStatus: invalidExecution.status,
    message: 'Agent execution chain tests passed.',
  }, null, 2));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
