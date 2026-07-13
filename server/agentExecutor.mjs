import { planAgentTask } from './agentPlanner.mjs';
import { recordAgentRun } from './database.mjs';
import { generateModuleForUser } from './generationService.mjs';
import { getModuleDefinition } from './prompt-engine/modules.mjs';

const agentQualityGateThreshold = Number(process.env.AGENT_QUALITY_GATE_THRESHOLD || process.env.QUALITY_REPAIR_THRESHOLD || 70);

const defaultFlows = {
  personal_ip: ['ip-positioning', 'operation-plan', 'viral-topics', 'script'],
  commerce_video: ['commerce', 'script'],
  combined: ['ip-positioning', 'operation-plan', 'conversion-topics', 'script'],
  unknown: ['ip-positioning'],
};

const explicitIntentMap = [
  ['operation-plan', ['运营规划', '账号规划', '账号阶段', '选题排序', '选题编排', '发布节奏', '发布计划', '7天', '14天', '30天', '爆款后', '接转化', '转化接力', '内容比例', '选题比例', '复盘', '数据调整']],
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
  onProgress,
  signal,
} = {}) {
  if (!project) {
    const error = new Error('请先创建项目档案。');
    error.code = 'PROJECT_REQUIRED';
    throw error;
  }

  throwIfAborted(signal);
  await reportProgress(onProgress, { stage: 'agent_planning', label: '正在拆解目标并规划执行链', percent: 4 });
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
  await reportProgress(onProgress, {
    stage: 'agent_plan_ready',
    label: `执行链已规划，共 ${plannedSteps.length} 步`,
    percent: 8,
    totalSteps: plannedSteps.length,
    steps: plannedSteps,
  });
  const completedSteps = [];
  let status = 'completed';

  for (let stepIndex = 0; stepIndex < plannedSteps.length; stepIndex += 1) {
    const step = plannedSteps[stepIndex];
    const startedAt = new Date().toISOString();
    try {
      throwIfAborted(signal);
      const rangeStart = 10 + (stepIndex / plannedSteps.length) * 85;
      const rangeEnd = 10 + ((stepIndex + 1) / plannedSteps.length) * 85;
      await reportProgress(onProgress, {
        stage: 'agent_step',
        label: `第 ${step.index}/${plannedSteps.length} 步：${step.moduleLabel}`,
        percent: Math.round(rangeStart),
        currentStep: step.index,
        totalSteps: plannedSteps.length,
        moduleId: step.moduleId,
        moduleLabel: step.moduleLabel,
      });
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
        signal,
        onProgress: (event) => reportProgress(onProgress, {
          ...event,
          stage: `agent_${event.stage || 'step'}`,
          label: `${step.moduleLabel}：${event.label || '正在生成'}`,
          percent: Math.round(rangeStart + (Number(event.percent || 0) / 100) * (rangeEnd - rangeStart)),
          currentStep: step.index,
          totalSteps: plannedSteps.length,
          moduleId: step.moduleId,
          moduleLabel: step.moduleLabel,
        }),
      });
      const qualityScore = Number(generated.result?.quality?.score ?? 100);
      const stepStatus = qualityScore < agentQualityGateThreshold ? 'needs_review' : 'completed';
      completedSteps.push({
        ...step,
        status: stepStatus,
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
      if (stepStatus === 'needs_review') {
        status = 'needs_review';
        break;
      }
    } catch (error) {
      status = error.code === 'JOB_CANCELLED' || signal?.aborted ? 'cancelled' : 'failed';
      completedSteps.push({
        ...step,
        status,
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

  await reportProgress(onProgress, {
    stage: status === 'completed' ? 'agent_completed' : `agent_${status}`,
    label: status === 'completed' ? '自动执行链已完成' : status === 'needs_review' ? '执行链需要人工复核' : status === 'cancelled' ? '自动执行链已取消' : '自动执行链未完成',
    percent: status === 'completed' ? 100 : Math.min(96, 10 + (completedSteps.length / Math.max(plannedSteps.length, 1)) * 85),
    currentStep: completedSteps.length,
    totalSteps: plannedSteps.length,
  });
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
  if (moduleId === 'operation-plan') {
    return {
      prompt,
      recentData: '',
      assets: profile.proof || '',
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
  if (moduleId === 'operation-plan') {
    const stage = hasAny(goal, ['爆款后', '爆了']) ? '爆款后' : '不确定/让系统判断';
    const cycle = hasAny(goal, ['30天']) ? '30天' : hasAny(goal, ['7天']) ? '7天' : '14天';
    return [
      { step: '第一步：账号阶段选择', choice: stage, subChoice: '' },
      { step: '第二步：运营目标选择', choices: hasAny(goal, ['咨询', '私信', '电话', '预约']) ? ['私信咨询', '电话/预约'] : ['涨粉起量', '建立信任'] },
      { step: '第三步：规划周期选择', choice: cycle, subChoice: '' },
    ];
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
    'operation-plan': '判断账号阶段，安排选题排序、发布节奏、爆款后接力和复盘规则。',
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

async function reportProgress(callback, event) {
  if (typeof callback !== 'function') return;
  await callback({ ...event, updatedAt: new Date().toISOString() });
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('任务已取消。');
  error.code = 'JOB_CANCELLED';
  throw error;
}
