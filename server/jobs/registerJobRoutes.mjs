import { getProjectForUser, listProjectsForUser } from '../database.mjs';
import {
  cancelGenerationJob,
  enqueueGenerationJob,
  getGenerationJobForUser,
  listGenerationJobsForUser,
  retryGenerationJob,
} from './jobService.mjs';

export function registerGenerationJobRoutes(app) {
  app.get('/api/jobs', async (req, res) => {
    const jobs = await listGenerationJobsForUser(req.user.id, {
      projectId: String(req.query.projectId || '') || undefined,
      limit: req.query.limit,
    });
    res.json({ ok: true, jobs: jobs.map(publicJob) });
  });

  app.get('/api/jobs/:jobId', async (req, res) => {
    const job = await getGenerationJobForUser(req.user.id, req.params.jobId);
    if (!job) {
      res.status(404).json({ ok: false, code: 'JOB_NOT_FOUND', message: '生成任务不存在或无权访问。' });
      return;
    }
    res.json({ ok: true, job: publicJob(job) });
  });

  app.post('/api/jobs/generate', async (req, res) => {
    try {
      const request = req.body || {};
      const project = await resolveProject(req.user.id, request.projectId);
      const job = await enqueueGenerationJob({ user: req.user, project, kind: 'generate', request });
      res.status(202).json({ ok: true, job: publicJob(job) });
    } catch (error) {
      sendJobError(res, error);
    }
  });

  app.post('/api/jobs/agent-run', async (req, res) => {
    try {
      const request = { ...(req.body || {}), maxSteps: Math.max(1, Math.min(Number(req.body?.maxSteps) || 4, 4)) };
      const project = await resolveProject(req.user.id, request.projectId);
      const job = await enqueueGenerationJob({ user: req.user, project, kind: 'agent-run', request });
      res.status(202).json({ ok: true, job: publicJob(job) });
    } catch (error) {
      sendJobError(res, error);
    }
  });

  app.post('/api/jobs/:jobId/cancel', async (req, res) => {
    const job = await cancelGenerationJob(req.user.id, req.params.jobId);
    if (!job) {
      res.status(404).json({ ok: false, code: 'JOB_NOT_FOUND', message: '生成任务不存在或无权访问。' });
      return;
    }
    res.json({ ok: true, job: publicJob(job) });
  });

  app.post('/api/jobs/:jobId/retry', async (req, res) => {
    try {
      const previous = await getGenerationJobForUser(req.user.id, req.params.jobId);
      if (!previous) {
        res.status(404).json({ ok: false, code: 'JOB_NOT_FOUND', message: '生成任务不存在或无权访问。' });
        return;
      }
      const project = await resolveProject(req.user.id, previous.projectId);
      const job = await retryGenerationJob({ user: req.user, project, jobId: previous.id });
      res.status(202).json({ ok: true, job: publicJob(job) });
    } catch (error) {
      sendJobError(res, error);
    }
  });
}

async function resolveProject(userId, projectId) {
  const project = projectId
    ? await getProjectForUser(userId, String(projectId))
    : (await listProjectsForUser(userId))[0];
  if (project) return project;
  const error = new Error('请先创建项目档案。');
  error.code = 'PROJECT_REQUIRED';
  throw error;
}

function publicJob(job) {
  return {
    id: job.id,
    projectId: job.projectId,
    kind: job.kind,
    moduleId: String(job.request?.moduleId || ''),
    status: job.status,
    progress: job.progress || {},
    result: job.result || {},
    error: job.error || {},
    cancelRequested: job.cancelRequested,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    updatedAt: job.updatedAt,
  };
}

function sendJobError(res, error) {
  const clientErrors = ['PROJECT_REQUIRED', 'JOB_QUEUE_FULL', 'JOB_ALREADY_ACTIVE', 'DAILY_LIMIT_REACHED'];
  const status = error.code === 'JOB_QUEUE_FULL' ? 429 : clientErrors.includes(error.code) ? 400 : 500;
  res.status(status).json({
    ok: false,
    code: error.code || 'JOB_CREATE_FAILED',
    message: error.message || '生成任务提交失败。',
  });
}
