import crypto from 'node:crypto';
import { getDb } from '../database.mjs';
import { persistDatabase } from '../storage/databaseStore.mjs';

const activeStatuses = ['queued', 'running'];

export async function createGenerationJobRecord({ userId, projectId, kind, request }) {
  const db = await getDb();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  db.run(`
    INSERT INTO generation_jobs (
      id, user_id, project_id, kind, status, progress_json, request_json,
      result_json, error_json, cancel_requested, created_at, started_at,
      completed_at, updated_at
    ) VALUES (?, ?, ?, ?, 'queued', ?, ?, '{}', '{}', 0, ?, '', '', ?)
  `, [
    id,
    userId,
    projectId || '',
    kind,
    JSON.stringify({ stage: 'queued', label: '任务已进入队列', percent: 0 }),
    JSON.stringify(request || {}),
    timestamp,
    timestamp,
  ]);
  await persistDatabase(db);
  return getGenerationJobById(id);
}

export async function getGenerationJobById(jobId) {
  const db = await getDb();
  const row = first(db, 'SELECT * FROM generation_jobs WHERE id = ?', [jobId]);
  return row ? generationJobFromRow(row) : null;
}

export async function getGenerationJobForUser(userId, jobId) {
  const db = await getDb();
  const row = first(db, 'SELECT * FROM generation_jobs WHERE id = ? AND user_id = ?', [jobId, userId]);
  return row ? generationJobFromRow(row) : null;
}

export async function listGenerationJobsForUser(userId, { projectId, limit = 20 } = {}) {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const rows = projectId
    ? all(db, 'SELECT * FROM generation_jobs WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT ?', [userId, projectId, safeLimit])
    : all(db, 'SELECT * FROM generation_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, safeLimit]);
  return rows.map(generationJobFromRow);
}

export async function updateGenerationJobRecord(jobId, updates = {}) {
  const db = await getDb();
  if (!first(db, 'SELECT id FROM generation_jobs WHERE id = ?', [jobId])) return null;
  const fields = [];
  const values = [];
  addUpdate(fields, values, updates, 'status', 'status', (value) => String(value || ''));
  addUpdate(fields, values, updates, 'progress', 'progress_json', (value) => JSON.stringify(value || {}));
  addUpdate(fields, values, updates, 'result', 'result_json', (value) => JSON.stringify(value || {}));
  addUpdate(fields, values, updates, 'error', 'error_json', (value) => JSON.stringify(value || {}));
  addUpdate(fields, values, updates, 'cancelRequested', 'cancel_requested', (value) => value ? 1 : 0);
  addUpdate(fields, values, updates, 'startedAt', 'started_at', (value) => value || '');
  addUpdate(fields, values, updates, 'completedAt', 'completed_at', (value) => value || '');
  fields.push('updated_at = ?');
  values.push(new Date().toISOString(), jobId);
  db.run(`UPDATE generation_jobs SET ${fields.join(', ')} WHERE id = ?`, values);
  await persistDatabase(db);
  return getGenerationJobById(jobId);
}

export async function countActiveGenerationJobsForUser(userId) {
  const db = await getDb();
  const rows = all(db, `
    SELECT status, COUNT(*) AS count
    FROM generation_jobs
    WHERE user_id = ? AND status IN ('queued', 'running')
    GROUP BY status
  `, [userId]);
  return rows.reduce((counts, row) => ({ ...counts, [row.status]: Number(row.count || 0) }), {
    queued: 0,
    running: 0,
  });
}

export async function markUnfinishedGenerationJobsInterrupted() {
  const db = await getDb();
  const timestamp = new Date().toISOString();
  db.run(`
    UPDATE generation_jobs
    SET status = 'interrupted',
        error_json = ?,
        completed_at = ?,
        updated_at = ?
    WHERE status IN ('queued', 'running')
  `, [
    JSON.stringify({ code: 'JOB_INTERRUPTED', message: '服务重启中断了这次任务，可以直接重试。' }),
    timestamp,
    timestamp,
  ]);
  const changed = db.getRowsModified();
  if (changed) await persistDatabase(db);
  return changed;
}

export async function requestGenerationJobCancellation(userId, jobId) {
  const job = await getGenerationJobForUser(userId, jobId);
  if (!job) return null;
  if (!activeStatuses.includes(job.status)) return job;
  return updateGenerationJobRecord(jobId, {
    cancelRequested: true,
    progress: {
      ...job.progress,
      label: job.status === 'queued' ? '正在取消排队任务' : '正在停止模型生成',
    },
  });
}

function generationJobFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id || '',
    kind: row.kind,
    status: row.status,
    progress: parseJsonObject(row.progress_json),
    request: parseJsonObject(row.request_json),
    result: parseJsonObject(row.result_json),
    error: parseJsonObject(row.error_json),
    cancelRequested: Number(row.cancel_requested || 0) === 1,
    createdAt: row.created_at,
    startedAt: row.started_at || '',
    completedAt: row.completed_at || '',
    updatedAt: row.updated_at,
  };
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function addUpdate(fields, values, updates, property, column, normalize) {
  if (!Object.prototype.hasOwnProperty.call(updates, property)) return;
  fields.push(`${column} = ?`);
  values.push(normalize(updates[property]));
}

function first(db, sql, params = []) {
  const statement = db.prepare(sql, params);
  try {
    return statement.step() ? statement.getAsObject() : null;
  } finally {
    statement.free();
  }
}

function all(db, sql, params = []) {
  const statement = db.prepare(sql, params);
  const rows = [];
  try {
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}
