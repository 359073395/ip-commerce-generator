import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-productized-generation-'));
process.env.APP_DATA_DIR = tempDir;
process.env.ADMIN_USERNAME = 'admin';
process.env.INITIAL_ADMIN_PASSWORD = 'admin-test-pass';
process.env.AGENT_REVIEW_ENABLED = 'false';
process.env.QUALITY_REPAIR_THRESHOLD = '70';
process.env.QUALITY_REPAIR_ENABLED = 'true';

const {
  createUser,
  getGenerationRecordForUser,
  initializeDatabase,
  listProjectsForUser,
} = await import('../server/database.mjs');
const { generateModuleForUser } = await import('../server/generationService.mjs');

try {
  await initializeDatabase();
  const user = await createUser({ username: 'productized-generation', password: 'pass', dailyLimit: 20 });
  const project = (await listProjectsForUser(user.id))[0];
  let calls = 0;

  const generated = await generateModuleForUser({
    user,
    project,
    requestBody: {
      moduleId: 'script',
      formData: {
        prompt: '本地美业老板IP，卖到店护理和团购券，目标用户是本地年轻女性，私信预约到店',
      },
      selections: [
        { step: '第一步：主脚本选择', choice: '成交脚本' },
        { step: '第二步：继续选择', choice: '痛点成交' },
      ],
      context: {
        agentGoal: '先定位，再做成交选题，最后生成完整短视频脚本',
      },
    },
    callModel: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          module: '脚本创作',
          summary: '给你一些建议。',
          sections: [],
          tables: [],
          scripts: [],
          nextActions: [],
          riskNotes: [],
        };
      }
      return {
        module: '脚本创作',
        summary: '为本地美业老板IP生成一条围绕年轻女性到店护理痛点成交的短视频脚本。',
        sections: [
          { title: '定位承接', items: ['本地美业老板IP', '目标用户是本地年轻女性', '私信预约到店'] },
          { title: '痛点成交逻辑', items: ['用痛点成交切入', '加入案例证明和CTA'] },
        ],
        tables: [
          { title: '拍摄表', columns: ['镜头', '内容'], rows: [['开头', '黄金3秒痛点'], ['结尾', 'CTA私信预约']] },
        ],
        scripts: [
          {
            title: '成交脚本',
            hook: '很多本地年轻女性不是不护肤，是第一步就做错了。',
            body: ['我是本地美业老板IP。', '想少走弯路可以先做一次基础检测。'],
            shots: ['门店检测', '前后对比'],
            cta: '评论护理，私信预约到店。',
          },
        ],
        nextActions: ['准备门店检测镜头', '准备客户评价'],
        riskNotes: ['效果和案例需要人工核验。'],
      };
    },
  });

  assert.equal(calls, 2, 'low quality result should trigger one repair call');
  assert.ok(generated.result.quality.score >= 70, 'repaired result should pass quality gate');
  assert.equal(generated.result.quality.repair.status, 'completed');
  assert.ok(generated.result.knowledgeCitations.length > 0, 'result should include knowledge citations');
  assert.ok(generated.result.profileSuggestions.hasSuggestions, 'result should include project profile suggestions');
  assert.ok(generated.result.profileSuggestions.items.some((item) => item.field === 'notes'), 'agent goal should be suggested as notes');

  const stored = await getGenerationRecordForUser(user.id, generated.record.id);
  assert.equal(stored.result.quality.repair.status, 'completed', 'history should preserve repair metadata');
  assert.ok(stored.result.knowledgeCitations.length > 0, 'history should preserve citations');

  console.log(JSON.stringify({
    ok: true,
    calls,
    score: generated.result.quality.score,
    citations: generated.result.knowledgeCitations.length,
    suggestions: generated.result.profileSuggestions.items.length,
    message: 'Productized generation metadata and auto repair passed.',
  }, null, 2));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
