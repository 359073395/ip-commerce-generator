import { isRetryableModelError } from '../model-routing/modelErrors.mjs';
import {
  countActiveGenerationJobsForUser,
  createGenerationJobRecord,
  getGenerationJobById,
  getGenerationJobForUser,
  listGenerationJobsForUser,
  markUnfinishedGenerationJobsInterrupted,
  requestGenerationJobCancellation,
  updateGenerationJobRecord,
} from './jobRepository.mjs';
import { executeGenerationJob } from './jobWorker.mjs';

const globalConcurrency = positiveInteger(process.env.JOB_GLOBAL_CONCURRENCY, 2);
const maxQueuedPerUser = positiveInteger(process.env.JOB_MAX_QUEUED_PER_USER, 3);
const queuedJobIds = [];
const jobContexts = new Map();
const runningControllers = new Map();
const runningUsers = new Set();
let pumpScheduled = false;

export async function initializeGenerationJobService() {
  return markUnfinishedGenerationJobsInterrupted();
}

export async function enqueueGenerationJob({ user, project, kind = 'generate', request = {} }) {
  const counts = await countActiveGenerationJobsForUser(user.id);
  if (counts.queued >= maxQueuedPerUser) {
    const error = new Error(`已有 ${counts.queued} 个任务正在排队，请等待完成后再提交。`);
    error.code = 'JOB_QUEUE_FULL';
    throw error;
  }

  const job = await createGenerationJobRecord({
    userId: user.id,
    projectId: project.id,
    kind,
    request,
  });
  jobContexts.set(job.id, { user, project });
  queuedJobIds.push(job.id);
  schedulePump();
  return job;
}

export async function retryGenerationJob({ user, project, jobId }) {
  const previous = await getGenerationJobForUser(user.id, jobId);
  if (!previous) return null;
  if (['queued', 'running'].includes(previous.status)) {
    const error = new Error('这个任务仍在执行，不需要重复提交。');
    error.code = 'JOB_ALREADY_ACTIVE';
    throw error;
  }
  return enqueueGenerationJob({
    user,
    project,
    kind: previous.kind,
    request: previous.request,
  });
}

export async function cancelGenerationJob(userId, jobId) {
  const requested = await requestGenerationJobCancellation(userId, jobId);
  if (!requested) return null;

  if (requested.status === 'queued') {
    removeQueuedJob(jobId);
    jobContexts.delete(jobId);
    return updateGenerationJobRecord(jobId, {
      status: 'cancelled',
      cancelRequested: true,
      progress: { ...requested.progress, stage: 'cancelled', label: '任务已取消', percent: requested.progress?.percent || 0 },
      error: { code: 'JOB_CANCELLED', message: '任务已取消。' },
      completedAt: new Date().toISOString(),
    });
  }

  runningControllers.get(jobId)?.abort();
  return requested;
}

export { getGenerationJobForUser, listGenerationJobsForUser };

function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  queueMicrotask(() => {
    pumpScheduled = false;
    void pumpQueue();
  });
}

async function pumpQueue() {
  while (runningControllers.size < globalConcurrency) {
    const queueIndex = queuedJobIds.findIndex((jobId) => {
      const context = jobContexts.get(jobId);
      return context && !runningUsers.has(context.user.id);
    });
    if (queueIndex < 0) return;

    const [jobId] = queuedJobIds.splice(queueIndex, 1);
    const context = jobContexts.get(jobId);
    if (!context) continue;
    const controller = new AbortController();
    runningControllers.set(jobId, controller);
    runningUsers.add(context.user.id);
    void runQueuedJob(jobId, context, controller)
      .catch((error) => console.error(`Generation job ${jobId} crashed: ${error.message}`))
      .finally(() => {
        runningControllers.delete(jobId);
        runningUsers.delete(context.user.id);
        jobContexts.delete(jobId);
        schedulePump();
      });
  }
}

async function runQueuedJob(jobId, context, controller) {
  let job = await getGenerationJobById(jobId);
  if (!job || job.cancelRequested || job.status !== 'queued') return;
  const startedAt = new Date().toISOString();
  job = await updateGenerationJobRecord(jobId, {
    status: 'running',
    startedAt,
    progress: { ...job.progress, stage: 'starting', label: '任务已开始执行', percent: 2, elapsedMs: 0 },
  });

  let progressWrites = Promise.resolve();
  const updateProgress = (event = {}) => {
    progressWrites = progressWrites
      .catch(() => null)
      .then(async () => {
        const latest = await getGenerationJobById(jobId);
        if (!latest || !['queued', 'running'].includes(latest.status)) return latest;
        return updateGenerationJobRecord(jobId, {
          progress: {
            ...latest.progress,
            ...event,
            elapsedMs: Date.now() - new Date(startedAt).getTime(),
          },
        });
      })
      .catch((error) => {
        console.warn(`Generation job ${jobId} progress update failed: ${error.message}`);
        return null;
      });
    return progressWrites;
  };

  try {
    const executed = await executeGenerationJob({
      job,
      user: context.user,
      project: context.project,
      onProgress: updateProgress,
      signal: controller.signal,
    });
    await progressWrites;
    if (executed.status === 'cancelled' || controller.signal.aborted) {
      await markJobCancelled(jobId, startedAt);
      return;
    }
    const needsInput = executed.status === 'needs_review' && ['invalid', 'needs_input'].includes(executed.result?.status);
    await updateGenerationJobRecord(jobId, {
      status: executed.status,
      result: executed.result,
      error: {},
      progress: {
        stage: needsInput ? 'needs_input' : executed.status === 'needs_review' ? 'needs_review' : 'completed',
        label: needsInput ? '需要补充信息后再执行' : executed.status === 'needs_review' ? '生成完成，建议人工复核' : '生成完成',
        percent: 100,
        elapsedMs: Date.now() - new Date(startedAt).getTime(),
        model: findActualModel(executed.result),
      },
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    await progressWrites;
    if (error.code === 'JOB_CANCELLED' || controller.signal.aborted) {
      await markJobCancelled(jobId, startedAt);
      return;
    }
    const current = await getGenerationJobById(jobId);
    await updateGenerationJobRecord(jobId, {
      status: 'failed',
      error: {
        code: error.code || 'GENERATION_FAILED',
        message: error.message || '生成任务未完成。',
        retryable: isRetryableModelError(error),
      },
      progress: {
        ...(current?.progress || {}),
        stage: 'failed',
        label: '生成任务未完成',
        elapsedMs: Date.now() - new Date(startedAt).getTime(),
      },
      completedAt: new Date().toISOString(),
    });
  }
}

async function markJobCancelled(jobId, startedAt) {
  const current = await getGenerationJobById(jobId);
  await updateGenerationJobRecord(jobId, {
    status: 'cancelled',
    cancelRequested: true,
    error: { code: 'JOB_CANCELLED', message: '任务已取消。' },
    progress: {
      ...(current?.progress || {}),
      stage: 'cancelled',
      label: '任务已取消',
      elapsedMs: Date.now() - new Date(startedAt).getTime(),
    },
    completedAt: new Date().toISOString(),
  });
}

function removeQueuedJob(jobId) {
  const index = queuedJobIds.indexOf(jobId);
  if (index >= 0) queuedJobIds.splice(index, 1);
}

function findActualModel(result = {}) {
  if (result.result?.generationMeta?.actualModel) return result.result.generationMeta.actualModel;
  const steps = result.steps || result.result?.steps || [];
  return [...steps].reverse().find((step) => step.result?.generationMeta?.actualModel)?.result?.generationMeta?.actualModel || '';
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
