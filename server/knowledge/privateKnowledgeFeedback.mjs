import {
  createKnowledgeCandidate,
  findKnowledgeCandidateBySource,
  upsertProjectMemory,
} from './privateKnowledgeRepository.mjs';

export async function recordResultFeedback({
  userId,
  projectId,
  moduleId,
  generationRecord,
  helpful,
  correctedText = '',
  notes = '',
} = {}) {
  if (!generationRecord || generationRecord.userId !== userId || generationRecord.projectId !== projectId) {
    const error = new Error('生成记录不存在或不属于当前项目。');
    error.code = 'GENERATION_NOT_FOUND';
    throw error;
  }
  const resultText = flattenText(generationRecord.result).slice(0, 6000);
  const correction = sanitizePrivateText(correctedText).slice(0, 8000);
  const noteText = sanitizePrivateText(notes).slice(0, 2000);
  const sourceRef = `generation:${generationRecord.id}:feedback`;
  const qualityScore = helpful === true ? (correction ? 82 : 68) : (correction ? 72 : 35);
  const summary = helpful === true
    ? '用户确认该生成结果有用。'
    : '用户认为该生成结果需要改进。';
  const content = [summary, correction ? `用户采用的修改版本：${correction}` : '', noteText ? `用户反馈：${noteText}` : '', `原结果摘要：${resultText.slice(0, 1200)}`]
    .filter(Boolean)
    .join('\n');
  const memory = await upsertProjectMemory({
    userId,
    projectId,
    moduleId: moduleId || generationRecord.moduleId,
    title: correction ? '用户修改后的有效表达' : '用户对生成结果的偏好反馈',
    summary,
    content,
    keywords: extractKeywords(`${correction}\n${noteText}\n${resultText}`),
    evidence: {
      helpful: helpful === true,
      generationRecordId: generationRecord.id,
      corrected: Boolean(correction),
    },
    sourceType: 'result_feedback',
    sourceRef,
    qualityScore,
  });

  let candidate = null;
  if (correction.length >= 80) {
    candidate = await createCandidateOnce({
      userId,
      projectId,
      sourceType: 'result_feedback',
      sourceRef,
      sourceSummary: '用户对生成结果进行了较完整的有效修改。',
      qualityScore,
      createdBy: userId,
      draft: {
        title: '用户验证后的内容表达方法',
        summary: noteText || summary,
        content: correction,
        category: 'combined',
        moduleIds: [moduleId || generationRecord.moduleId].filter(Boolean),
        methods: ['对比原结果与用户最终采用版本', '提炼用户保留和修改的结构'],
        keywords: extractKeywords(correction),
        scenarios: ['同类项目后续生成'],
        evidence: { generationRecordId: generationRecord.id, projectMemoryId: memory.id },
        qualityScore,
        confidence: 0.7,
      },
    });
  }

  return { memory, candidate };
}

export async function learnFromContentExperiment({ userId, experiment, generationRecord } = {}) {
  if (!experiment?.id || !experiment.projectId || experiment.userId !== userId) return null;
  const metrics = experiment.review?.metrics || {};
  const highIntentCount = Number(metrics.privateMessages || 0) + Number(metrics.phoneCalls || 0);
  const hasOutcome = Number(metrics.deals || 0) > 0 || Number(metrics.leads || 0) >= 3 || highIntentCount >= 5;
  const score = hasOutcome ? 92 : experiment.status === 'learned' ? 68 : 45;
  const sourceRef = `experiment:${experiment.id}`;
  const resultSummary = sanitizePrivateText(generationRecord?.result?.summary || '').slice(0, 1200);
  const reviewText = sanitizePrivateText([
    experiment.review?.decision,
    experiment.review?.diagnosis,
    ...(experiment.review?.nextActions || []),
    experiment.review?.notes,
  ].filter(Boolean).join('；'));
  const memory = await upsertProjectMemory({
    userId,
    projectId: experiment.projectId,
    moduleId: experiment.moduleId,
    title: hasOutcome ? '已验证的发布与转化经验' : '内容实验复盘经验',
    summary: reviewText.slice(0, 600) || '已完成内容实验复盘。',
    content: [resultSummary, reviewText].filter(Boolean).join('\n'),
    keywords: extractKeywords(`${resultSummary}\n${reviewText}`),
    evidence: { metrics, experimentId: experiment.id, status: experiment.status },
    sourceType: 'experiment_review',
    sourceRef,
    qualityScore: score,
  });

  let candidate = null;
  if (hasOutcome) {
    candidate = await createCandidateOnce({
      userId,
      projectId: experiment.projectId,
      sourceType: 'experiment_review',
      sourceRef,
      sourceSummary: '项目实验产生了明确咨询、线索或成交结果。',
      qualityScore: score,
      createdBy: userId,
      draft: {
        title: '有真实效果数据的内容方法',
        summary: reviewText.slice(0, 800),
        content: [resultSummary, reviewText].filter(Boolean).join('\n'),
        category: 'combined',
        moduleIds: [experiment.moduleId].filter(Boolean),
        methods: ['保留产生高意向信号的开头、证明和承接方式', '结合真实数据判断是否可跨项目复用'],
        keywords: extractKeywords(`${resultSummary}\n${reviewText}`),
        scenarios: ['同类型账号和同阶段内容'],
        evidence: { metrics, experimentId: experiment.id, projectMemoryId: memory.id },
        qualityScore: score,
        confidence: 0.82,
      },
    });
  }
  return { memory, candidate };
}

async function createCandidateOnce(input) {
  const existing = await findKnowledgeCandidateBySource(input);
  return existing || createKnowledgeCandidate(input);
}

function flattenText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join('\n');
  if (typeof value === 'object') return Object.values(value).map(flattenText).join('\n');
  return '';
}

function sanitizePrivateText(value) {
  return String(value || '')
    .replace(/\b1[3-9]\d{9}\b/g, '[手机号已移除]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已移除]')
    .replace(/\b\d{15,18}[0-9Xx]\b/g, '[证件号已移除]')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(value) {
  const matches = String(value || '').match(/[A-Za-z][A-Za-z0-9+.-]{2,20}|[\u4e00-\u9fff]{2,8}/g) || [];
  return [...new Set(matches.map((item) => item.trim()))].slice(0, 40);
}
