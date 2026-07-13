import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-jobs-'));
const fakeServer = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (body.model === 'primary-test-model') {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'rate limited for fallback test' } }));
    return;
  }

  const slow = JSON.stringify(body.messages || []).includes('slow-cancel');
  const respond = () => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      model: 'fallback-test-model-resolved',
      choices: [{
        message: {
          content: JSON.stringify({
            module: 'IP定位',
            summary: '工程纠纷律师面向实际施工人，用真实胜诉案例建立信任并承接电话咨询。',
            sections: [
              { title: '定位', items: ['河南工程老板的自己人', '用大金额胜诉和风险共担建立信任'] },
              { title: '执行', items: ['热点起量', '案例建信任', '电话承接高意向咨询'] },
            ],
            tables: [],
            scripts: [{ title: '案例口播', hook: '拖了3年的工程款，今天终于到账了。', body: '讲清金额、对手身份、过程与风险共担。', cta: '具体案件可以电话沟通。' }],
            nextActions: ['生成14天运营规划'],
            riskNotes: ['案件材料需要打码。'],
          }),
        },
      }],
    }));
  };
  if (!slow) {
    respond();
    return;
  }
  const timer = setTimeout(respond, 5000);
  req.on('close', () => clearTimeout(timer));
});

await new Promise((resolve) => fakeServer.listen(0, '127.0.0.1', resolve));
const address = fakeServer.address();

process.env.APP_DATA_DIR = temporaryDataDir;
process.env.ADMIN_USERNAME = 'job-admin';
process.env.INITIAL_ADMIN_PASSWORD = 'job-password-123';
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
process.env.OPENAI_API_KEY = 'test-key';
process.env.OPENAI_MODEL = 'primary-test-model';
process.env.OPENAI_FALLBACK_MODELS = 'fallback-test-model';
process.env.OPENAI_TIMEOUT_MS = '3000';
process.env.OPENAI_FALLBACK_TIMEOUT_MS = '7000';
process.env.AGENT_REVIEW_ENABLED = 'false';
process.env.QUALITY_REPAIR_ENABLED = 'false';
process.env.JOB_GLOBAL_CONCURRENCY = '1';

const database = await import('../server/database.mjs');
const jobs = await import('../server/jobs/jobService.mjs');

try {
  await database.initializeDatabase();
  await jobs.initializeGenerationJobService();
  const { user } = await database.loginUser('job-admin', 'job-password-123');
  const [baseProject] = await database.listProjectsForUser(user.id);
  const project = await database.updateProjectForUser(user.id, baseProject.id, {
    name: '工程律师Agent测试',
    profile: {
      industry: '工程纠纷',
      persona: '河南工程律师',
      offer: '工程款全风险代理',
      audience: '实际施工人、材料商、包工头',
      proof: '大金额胜诉案例和判决书',
      conversion: '电话咨询',
    },
  });

  const request = {
    moduleId: 'ip-positioning',
    projectId: project.id,
    formData: {
      industry: '工程纠纷',
      role: '律师',
      offer: '全风险代理',
      buyer: '实际施工人、材料商、包工头',
      proof: '大金额胜诉案例',
      conversion: '电话咨询',
      details: '用河南方言和真实案例建立信任。',
    },
    selections: [],
    context: {},
  };

  const acceptedAt = Date.now();
  const accepted = await jobs.enqueueGenerationJob({ user, project, kind: 'generate', request });
  assert.ok(Date.now() - acceptedAt < 2000, 'job acceptance should return within two seconds');
  assert.equal(accepted.status, 'queued');

  const completed = await waitForJob(user.id, accepted.id, jobs, ['completed']);
  assert.equal(completed.progress.percent, 100);
  assert.equal(completed.result.result.generationMeta.actualModel, 'fallback-test-model-resolved');
  assert.equal(completed.result.result.generationMeta.fallbackUsed, true);
  assert.ok(completed.result.result.generationMeta.attempts.some((event) => event.type === 'fallback'));
  assert.equal(completed.result.record.model, 'fallback-test-model-resolved');

  const agentJob = await jobs.enqueueGenerationJob({
    user,
    project,
    kind: 'agent-run',
    request: {
      projectId: project.id,
      maxSteps: 4,
      goal: '我是河南工程纠纷律师，服务实际施工人、材料商和包工头，用大金额胜诉案例建立信任，通过电话咨询成交，请完成IP定位、运营规划、成交选题和口播脚本。',
    },
  });
  const completedAgent = await waitForJob(user.id, agentJob.id, jobs, ['completed']);
  assert.equal(completedAgent.result.steps.length, 4, 'background Agent job should complete the full four-step chain');
  assert.equal(completedAgent.result.steps.at(-1).moduleId, 'script');

  const needsInputJob = await jobs.enqueueGenerationJob({
    user,
    project,
    kind: 'agent-run',
    request: { projectId: project.id, maxSteps: 4, goal: '' },
  });
  const needsInput = await waitForJob(user.id, needsInputJob.id, jobs, ['needs_review']);
  assert.equal(needsInput.result.steps.length, 0, 'insufficient Agent input should not consume model steps');

  const slowJob = await jobs.enqueueGenerationJob({
    user,
    project,
    kind: 'generate',
    request: {
      ...request,
      formData: { ...request.formData, details: 'slow-cancel' },
    },
  });
  await waitForJob(user.id, slowJob.id, jobs, ['running']);
  await jobs.cancelGenerationJob(user.id, slowJob.id);
  const cancelled = await waitForJob(user.id, slowJob.id, jobs, ['cancelled']);
  assert.equal(cancelled.error.code, 'JOB_CANCELLED');

  console.log(JSON.stringify({
    ok: true,
    acceptedInMs: completed.startedAt ? new Date(completed.startedAt).getTime() - new Date(completed.createdAt).getTime() : 0,
    actualModel: completed.result.result.generationMeta.actualModel,
    fallbackUsed: completed.result.result.generationMeta.fallbackUsed,
    agentSteps: completedAgent.result.steps.length,
    dirtyAgentStatus: needsInput.status,
    cancelledStatus: cancelled.status,
    message: 'Persistent generation jobs, 429 fallback, model metadata, progress, and cancellation passed.',
  }, null, 2));
} finally {
  await jobs.waitForGenerationJobsIdle({ timeoutMs: 15000 });
  await new Promise((resolve) => fakeServer.close(resolve));
  await fs.rm(temporaryDataDir, { recursive: true, force: true });
}

async function waitForJob(userId, jobId, jobsApi, expectedStatuses, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await jobsApi.getGenerationJobForUser(userId, jobId);
    if (expectedStatuses.includes(job?.status)) return job;
    if (job && ['failed', 'cancelled', 'interrupted'].includes(job.status) && !expectedStatuses.includes(job.status)) {
      throw new Error(`Job entered ${job.status}: ${job.error?.message || 'unknown error'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for job ${jobId} to reach ${expectedStatuses.join(', ')}`);
}
