import { env } from './config/env.mjs';
import { assertGenerationAllowed, recordGeneration } from './database.mjs';
import { loadKnowledgePack } from './knowledge/loadKnowledge.mjs';
import { buildPrompt } from './prompt-engine/buildPrompt.mjs';
import { buildQualityRepairPrompt } from './prompt-engine/repairPrompt.mjs';
import { buildReviewPrompt } from './prompt-engine/reviewPrompt.mjs';
import { callOpenAICompatible } from './providers/openaiCompatible.mjs';
import { evaluateResultQuality } from './quality/evaluateResultQuality.mjs';

const qualityRepairThreshold = Number(process.env.QUALITY_REPAIR_THRESHOLD || 70);
const qualityRepairEnabled = parseBoolean(process.env.QUALITY_REPAIR_ENABLED || 'true');

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
  const resultWithQuality = await finalizeGeneratedResult({
    result,
    definition,
    knowledge,
    requestBody: requestWithMemory,
    qualityEvaluator,
    callModel,
  });

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

async function finalizeGeneratedResult({ result, definition, knowledge, requestBody, qualityEvaluator, callModel }) {
  let enriched = addProductMetadata({
    result,
    definition,
    knowledge,
    requestBody,
    qualityEvaluator,
    repair: null,
  });

  if (!qualityEvaluator || !qualityRepairEnabled || enriched.quality?.score >= qualityRepairThreshold) {
    return enriched;
  }

  try {
    const repairPrompt = buildQualityRepairPrompt({
      definition,
      formData: requestBody.formData || {},
      selections: requestBody.selections || [],
      context: {
        ...(requestBody.context || {}),
        projectProfile: requestBody.projectProfile,
      },
      knowledge,
      currentResult: enriched,
      quality: enriched.quality,
    });
    const repairedResult = await callModel([
      { role: 'system', content: repairPrompt.system },
      { role: 'user', content: repairPrompt.user },
    ], {
      temperature: 0.25,
      maxTokens: env.agentReviewMaxTokens,
      reasoningEffort: 'low',
      timeoutMs: env.agentReviewTimeoutMs,
      disableFallback: true,
    });
    const normalizedRepair = appendRiskNote(repairedResult, '质量低于阈值，Agent已自动修复一次。');
    enriched = addProductMetadata({
      result: normalizedRepair,
      definition,
      knowledge,
      requestBody,
      qualityEvaluator,
      repair: {
        attempted: true,
        reason: `quality_score_below_${qualityRepairThreshold}`,
        beforeScore: enriched.quality?.score ?? 0,
        status: 'completed',
      },
    });
    return enriched;
  } catch (error) {
    return addProductMetadata({
      result: appendRiskNote(enriched, `质量自动修复未完成：${error.message}`),
      definition,
      knowledge,
      requestBody,
      qualityEvaluator,
      repair: {
        attempted: true,
        reason: `quality_score_below_${qualityRepairThreshold}`,
        beforeScore: enriched.quality?.score ?? 0,
        status: 'failed',
        message: error.message,
      },
    });
  }
}

function addProductMetadata({ result, definition, knowledge, requestBody, qualityEvaluator, repair }) {
  const normalized = normalizeResult(result);
  const quality = qualityEvaluator
    ? qualityEvaluator({ result: normalized, definition, knowledge, requestBody })
    : null;
  return {
    ...normalized,
    knowledgeCitations: buildKnowledgeCitations(knowledge),
    profileSuggestions: buildProfileSuggestions({ requestBody, result: normalized, definition }),
    quality: quality ? {
      ...quality,
      repair,
      gate: {
        threshold: qualityRepairThreshold,
        passed: quality.score >= qualityRepairThreshold,
      },
    } : undefined,
  };
}

function buildKnowledgeCitations(knowledge = []) {
  return (knowledge || []).slice(0, 6).map((item) => ({
    source: item.source || '',
    heading: item.heading || '',
    score: Number(item.score || 0),
    matchedTerms: Array.isArray(item.matchedTerms) ? item.matchedTerms.slice(0, 8) : [],
    reasons: Array.isArray(item.scoreReasons) ? item.scoreReasons.slice(0, 6) : [],
  })).filter((item) => item.source || item.heading);
}

function buildProfileSuggestions({ requestBody = {}, result = {}, definition = {} }) {
  const current = requestBody.projectProfile || {};
  const formData = requestBody.formData || {};
  const context = requestBody.context || {};
  const candidates = {
    industry: firstNonEmpty(formData.industry, formData.industryBackground, current.industry),
    persona: firstNonEmpty(formData.role, formData.persona, current.persona),
    offer: firstNonEmpty(formData.offer, formData.product, current.offer),
    audience: firstNonEmpty(formData.buyer, formData.audience, formData.targetCustomer, current.audience),
    proof: firstNonEmpty(formData.proof, current.proof),
    conversion: firstNonEmpty(formData.conversion, current.conversion),
    ipPositioningSummary: definition.id === 'ip-positioning' ? firstNonEmpty(result.summary, current.ipPositioningSummary) : current.ipPositioningSummary,
    notes: firstNonEmpty(context.agentGoal, current.notes),
  };
  const labels = {
    industry: '行业/赛道',
    persona: '身份/人设',
    offer: '产品/服务',
    audience: '目标用户',
    proof: '信任资产',
    conversion: '承接方式',
    ipPositioningSummary: 'IP定位摘要',
    notes: '项目备注',
  };
  const items = Object.entries(candidates)
    .filter(([field, value]) => value && String(value).trim() && String(value).trim() !== String(current[field] || '').trim())
    .map(([field, value]) => ({
      field,
      label: labels[field] || field,
      current: current[field] || '',
      suggested: String(value).trim().slice(0, 800),
      reason: field === 'ipPositioningSummary' ? '来自本次IP定位结果' : '来自本次用户输入或Agent上下文',
    }));
  return {
    hasSuggestions: items.length > 0,
    items,
    draftProfile: Object.fromEntries(items.map((item) => [item.field, item.suggested])),
  };
}

function firstNonEmpty(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}
