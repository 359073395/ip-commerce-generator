import { env } from './config/env.mjs';
import { assertGenerationAllowed, recordGeneration } from './database.mjs';
import { loadKnowledgePack } from './knowledge/loadKnowledge.mjs';
import { buildPrompt } from './prompt-engine/buildPrompt.mjs';
import { buildReviewPrompt } from './prompt-engine/reviewPrompt.mjs';
import { callOpenAICompatible } from './providers/openaiCompatible.mjs';
import { evaluateResultQuality } from './quality/evaluateResultQuality.mjs';

export async function generateModuleForUser({
  user,
  project,
  requestBody = {},
  callModel = callOpenAICompatible,
  qualityEvaluator = evaluateResultQuality,
} = {}) {
  if (!user) {
    const error = new Error('请先登录。');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  if (!project) {
    const error = new Error('请先创建项目档案。');
    error.code = 'PROJECT_REQUIRED';
    throw error;
  }

  await assertGenerationAllowed(user);
  const requestWithMemory = {
    ...requestBody,
    projectProfile: project.profile,
  };
  const { system, user: userPrompt, definition, agent, knowledge } = await buildPrompt(requestWithMemory);
  const draftResult = await callModel([
    { role: 'system', content: system },
    { role: 'user', content: userPrompt },
  ]);
  const result = await reviewAndImproveResult({
    definition,
    agent,
    knowledge,
    requestBody: requestWithMemory,
    draftResult,
    callModel,
  });
  const resultWithQuality = qualityEvaluator
    ? {
      ...result,
      quality: qualityEvaluator({
        result,
        definition,
        knowledge,
        requestBody: requestWithMemory,
      }),
    }
    : result;

  const record = await recordGeneration(user.id, project.id, definition.id, {
    moduleLabel: definition.label || definition.name || definition.id,
    model: env.openaiModel,
    request: {
      moduleId: definition.id,
      projectId: project.id,
      formData: requestBody.formData || {},
      selections: requestBody.selections || [],
      context: requestBody.context || {},
    },
    result: resultWithQuality,
  });

  return {
    module: definition,
    result: resultWithQuality,
    record,
    agent,
    knowledge,
  };
}

export async function getKnowledgePreviewForRequest(requestBody = {}) {
  const { definition } = await buildPrompt(requestBody);
  const knowledgePack = await loadKnowledgePack({
    taskType: definition.taskType,
    moduleId: definition.id,
    label: definition.label,
    knowledge: definition.knowledge,
    output: definition.output,
    formData: requestBody.formData || {},
    selections: requestBody.selections || [],
    context: requestBody.context || {},
  });
  return { definition, knowledgePack };
}

export async function reviewAndImproveResult({ definition, agent, knowledge, requestBody, draftResult, callModel = callOpenAICompatible }) {
  if (!env.agentReviewEnabled) {
    return appendRiskNote(draftResult, 'Agent自检未开启。');
  }

  try {
    const reviewPrompt = buildReviewPrompt({
      definition,
      agentProfile: agent,
      formData: requestBody.formData || {},
      selections: requestBody.selections || [],
      context: {
        ...(requestBody.context || {}),
        projectProfile: requestBody.projectProfile,
      },
      knowledge,
      draftResult,
    });
    const reviewedResult = await callModel([
      { role: 'system', content: reviewPrompt.system },
      { role: 'user', content: reviewPrompt.user },
    ], {
      temperature: 0.2,
      maxTokens: env.agentReviewMaxTokens,
      reasoningEffort: 'low',
      timeoutMs: env.agentReviewTimeoutMs,
      disableFallback: true,
    });
    return appendRiskNote(reviewedResult, 'Agent自检已完成。');
  } catch (error) {
    console.warn(`Agent review failed for ${definition.id}: ${error.message}`);
    return appendRiskNote(draftResult, `Agent自检修正未完成，已返回初稿：${error.message}`);
  }
}

function appendRiskNote(result, note) {
  const normalized = normalizeResult(result);
  if (!normalized.riskNotes.includes(note)) {
    normalized.riskNotes.push(note);
  }
  return normalized;
}

function normalizeResult(result) {
  return {
    module: result?.module || '模型结果',
    summary: result?.summary || '已生成结果，请结合下方结构查看。',
    sections: Array.isArray(result?.sections) ? result.sections : [],
    tables: Array.isArray(result?.tables) ? result.tables : [],
    scripts: Array.isArray(result?.scripts) ? result.scripts : [],
    nextActions: Array.isArray(result?.nextActions) ? result.nextActions : [],
    riskNotes: Array.isArray(result?.riskNotes) ? [...result.riskNotes] : [],
  };
}
