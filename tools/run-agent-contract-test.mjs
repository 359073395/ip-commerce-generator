import assert from 'node:assert/strict';
import { buildPrompt } from '../server/prompt-engine/buildPrompt.mjs';
import { moduleDefinitions } from '../server/prompt-engine/modules.mjs';
import { getAgentProfile, getQualityChecklist } from '../server/prompt-engine/agentProfiles.mjs';

const sampleFormData = {
  prompt: '我是做本地美业服务的个人IP，想通过短视频获客成交。',
  industry: '美业',
  role: '服务型个人IP',
  conversion: '私信和预约到店',
};

for (const definition of moduleDefinitions) {
  const profile = getAgentProfile(definition.id);
  assert.ok(profile.role, `${definition.id} missing agent role`);
  assert.ok(profile.goal, `${definition.id} missing agent goal`);
  assert.ok(profile.tools.length >= 3, `${definition.id} should define tools`);
  assert.ok(profile.rules.length >= 3, `${definition.id} should define rules`);
  assert.ok(profile.outputFocus.length >= 3, `${definition.id} should define output focus`);

  const prompt = await buildPrompt({
    moduleId: definition.id,
    formData: sampleFormData,
    selections: [{ step: '主脚本选择', choice: '教知识', subChoice: '误区型' }],
    context: { ipPositioning: { summary: '美业服务型个人IP，主打专业信任和到店转化。' } },
    projectProfile: {
      projectName: '本地美业IP项目',
      industry: '美业',
      persona: '服务型个人IP',
      offer: '到店护理和团购券',
      audience: '本地有变美需求的年轻女性',
      conversion: '私信和预约到店',
    },
  });

  const combined = `${prompt.system}\n${prompt.user}`;
  assert.equal(prompt.agent.role, profile.role, `${definition.id} should return its agent profile`);
  assert.ok(combined.includes('Agent配置'), `${definition.id} prompt missing Agent配置`);
  assert.ok(combined.includes(profile.role), `${definition.id} prompt missing role`);
  assert.ok(combined.includes(profile.goal), `${definition.id} prompt missing goal`);
  assert.ok(combined.includes('Tools'), `${definition.id} prompt missing tools`);
  assert.ok(combined.includes('Rules'), `${definition.id} prompt missing rules`);
  assert.ok(combined.includes('Output'), `${definition.id} prompt missing output format`);
  assert.ok(combined.includes('生成前自检'), `${definition.id} prompt missing quality checklist`);
  assert.ok(combined.includes('长期项目档案'), `${definition.id} prompt missing project profile memory`);
  assert.ok(combined.includes('团购券'), `${definition.id} prompt missing profile content`);
  assert.ok(getQualityChecklist(profile).length >= 6, `${definition.id} quality checklist too small`);
}

console.log(JSON.stringify({
  ok: true,
  modules: moduleDefinitions.length,
  message: 'Agent profiles and prompt contracts passed.',
}, null, 2));
