import { planAgentTask } from './agentPlanner.mjs';
import { recordAgentRun } from './database.mjs';
import { generateModuleForUser } from './generationService.mjs';
import { getModuleDefinition } from './prompt-engine/modules.mjs';

const defaultFlows = {
  personal_ip: ['ip-positioning', 'viral-topics', 'script'],
  commerce_video: ['commerce', 'script'],
  combined: ['ip-positioning', 'conversion-topics', 'script'],
  unknown: ['ip-positioning'],
};

const explicitIntentMap = [
  ['pain-topics', ['痛点', '焦虑', '需求', '用户问题']],
  ['conversion-topics', ['成交选题', '成交', '转化', '咨询', '私域', '预约']],
  ['viral-topics', ['爆款选题', '选题', '标题', '涨粉', '爆款']],
  ['script', ['脚本', '口播', '拍摄', '短视频文案', '分镜']],
  ['commerce', ['带货', '卖货', '产品', '商品', '小黄车', 'TikTok Shop', '商品卡']],
  ['viral-analysis', ['拆解', '分析', '复盘', '对标']],
  ['rewrite', ['二创', '改写', '仿写', '重写']],
  ['polish', ['洗稿', '润色', '优化文案']],
];

export async function runAgentExecution({
  user,
  project,
  goal,
  maxSteps = 4,
  generateStep = generateModuleForUser,
} = {}) {
  if (!project) {
    const error = new Error('请先创建项目档案。');
    error.code = 'PROJECT_REQUIRED';
    throw error;
  }

  const plan = planAgentTask({
    goal,
    project,
    projectProfile: project.profile,
  });

  if (plan.status !== 'ready') {
    const run = await recordAgentRun(user.id, project.id, goal, {
      status: plan.status,
      plan,
      steps: [],
    });
    return { run, plan, steps: [], status: plan.status };
  }

  const plannedSteps = buildExecutionSteps(plan, goal, maxSteps);
  const completedSteps = [];
  let status = 'completed';

  for (const step of plannedSteps) {
    const startedAt = new Date().toISOString();
    try {
      const requestBody = buildStepRequest({
        step,
        goal,
        project,
        previousSteps: completedSteps,
      });
      const generated = await generateStep({
        user,
        project,
        requestBody,
      });
      completedSteps.push({
        ...step,
        status: 'completed',
        startedAt,
        completedAt: new Date().toISOString(),
        request: {
          moduleId: requestBody.moduleId,
          formData: requestBody.formData,
          selections: requestBody.selections,
          context: requestBody.context,
        },
        recordId: generated.record?.id || '',
        summary: generated.result?.summary || '',
        result: generated.result || {},
      });
    } catch (error) {
      status = 'failed';
      completedSteps.push({
        ...step,
        status: 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        error: {
          code: error.code || 'STEP_FAILED',
          message: error.message,
        },
      });
      break;
    }
  }

  const run = await recordAgentRun(user.id, project.id, goal, {
    status,
    plan,
    steps: completedSteps,
  });
  return { run, plan, steps: completedSteps, status };
}

export function buildExecutionSteps(plan = {}, goal = '', maxSteps = 4) {
  const safeMax = Math.max(1, Math.min(Number(maxSteps) || 4, 4));
  const moduleIds = [];
  const add = (moduleId, reason = '') => {
    const definition = getModuleDefinition(moduleId);
    if (!definition || moduleIds.includes(definition.id)) return;
    moduleIds.push(definition.id);
  };

  for (const moduleId of defaultFlows[plan.taskType] || defaultFlows.unknown) add(moduleId, 'default_flow');
  for (const module of plan.recommendedModules || []) add(module.id, module.reason);
  for (const moduleId of detectExplicitModules(goal)) add(moduleId, 'explicit_goal');

  return moduleIds.slice(0, safeMax).map((moduleId, index) => {
    const definition = getModuleDefinition(moduleId);
    return {
      index: index + 1,
      moduleId,
      moduleLabel: definition.label || definition.id,
      purpose: stepPurpose(moduleId, plan.taskType),
    };
  });
}

export function buildStepRequest({ step, goal, project, previousSteps = [] } = {}) {
  const profile = project?.profile || {};
  const previousSummaries = previousSteps.map((item) => ({
    moduleId: item.moduleId,
    moduleLabel: item.moduleLabel,
    recordId: item.recordId || '',
    summary: item.summary || item.result?.summary || '',
  }));
  const baseContext = {
    agentGoal: goal,
    agentRunMode: 'auto_chain',
    agentPreviousSteps: previousSummaries,
  };
  const profileLine = [
    profile.industry,
    profile.persona,
    profile.offer,
    profile.audience,
    profile.proof,
    profile.conversion,
  ].filter(Boolean).join(' / ');
  const prompt = [
    goal,
    profileLine ? `项目档案：${profileLine}` : '',
    previousSummaries.length ? `承接前面步骤：${previousSummaries.map((item) => `${item.moduleLabel}=${item.summary}`).join('；')}` : '',
  ].filter(Boolean).join('\n');

  return {
    moduleId: step.moduleId,
    formData: formDataForModule(step.moduleId, { goal, profile, prompt }),
    selections: selectionsForModule(step.moduleId, goal),
    context: baseContext,
  };
}

function formDataForModule(moduleId, { goal, profile, prompt }) {
  if (moduleId === 'ip-positioning') {
    return {
      industry: profile.industry || '',
      role: profile.persona || '',
      offer: profile.offer || '',
      buyer: profile.audience || '',
      proof: profile.proof || '',
      conversion: profile.conversion || '',
      details: prompt,
    };
  }
  if (moduleId === 'pain-topics') {
    return {
      industryBackground: [profile.industry, profile.persona, profile.offer].filter(Boolean).join(' / ') || goal,
      targetCustomer: profile.audience || '',
    };
  }
  if (moduleId === 'commerce') {
    return {
      product: profile.offer || goal,
      audience: profile.audience || '',
      proof: profile.proof || '',
      scene: '',
      sellingPoint: '',
    };
  }
  return { prompt };
}

function selectionsForModule(moduleId, goal) {
  if (moduleId === 'script') {
    if (hasAny(goal, ['带货', '产品', '商品', '小黄车', 'TikTok Shop'])) {
      return [
        { step: '第一步：主脚本选择', choice: '带货脚本', subChoice: '' },
        { step: '第二步：继续选择', choice: '种草', subChoice: '' },
      ];
    }
    if (hasAny(goal, ['成交', '转化', '咨询', '私域', '预约'])) {
      return [
        { step: '第一步：主脚本选择', choice: '成交脚本', subChoice: '' },
        { step: '第二步：继续选择', choice: '痛点成交', subChoice: '' },
      ];
    }
    return [
      { step: '第一步：主脚本选择', choice: '个人IP脚本', subChoice: '' },
      { step: '第二步：继续选择', choice: '教知识', subChoice: '' },
    ];
  }
  if (moduleId === 'conversion-topics') {
    return [
      { step: '第二步：主脚本选择', choice: '讲故事', subChoice: '客户案例' },
      { step: '第三步：进店/成交理由选择', choices: ['效果好', '好评多', '案例多'] },
    ];
  }
  if (moduleId === 'viral-topics') {
    return [{ step: '第二步：主脚本选择', choice: '教知识', subChoice: '解题型' }];
  }
  if (moduleId === 'commerce') {
    return [
      { step: '带货链路', choice: '产品需求', subChoice: '' },
      { step: '成交入口', choice: '商品卡', subChoice: '' },
    ];
  }
  return [];
}

function detectExplicitModules(goal) {
  const text = String(goal || '');
  return explicitIntentMap
    .filter(([, keywords]) => hasAny(text, keywords))
    .map(([moduleId]) => moduleId);
}

function stepPurpose(moduleId, taskType) {
  const purposes = {
    'ip-positioning': '先把账号身份、商业路径、目标用户和承接方式定清楚。',
    'viral-topics': '基于定位生成爆款选题入口，补齐内容矩阵。',
    'conversion-topics': '把定位转成成交型选题和承接理由。',
    'pain-topics': '挖掘目标用户痛点、场景和情绪钩子。',
    script: '把前面结果写成可拍摄短视频脚本。',
    commerce: '拆解产品需求、成交理由和带货视频表达。',
    rewrite: '把已有内容改成更适合当前账号的原创表达。',
    polish: '优化已有文案结构、钩子和口播表达。',
    'viral-analysis': '拆解参考内容并提炼可复用结构。',
  };
  return purposes[moduleId] || `执行 ${taskType || 'Agent'} 任务步骤。`;
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => String(text || '').includes(keyword));
}
