import crypto from 'node:crypto';
import { emptyProjectProfile, loadProjectProfile, normalizeProjectProfile, projectProfileIsEmpty } from './projectProfile.mjs';
import { getDatabase, persistDatabase } from './storage/databaseStore.mjs';

const sessionCookieName = 'ip_commerce_session';
const sessionDays = Number(process.env.SESSION_DAYS || 14);

export async function getDb() {
  return getDatabase();
}

export async function initializeDatabase() {
  const db = await getDb();
  migrate(db);
  await bootstrapAdmin(db);
  await persistDb(db);
  return db;
}

export async function loginUser(username, password) {
  const db = await getDb();
  const user = getUserByUsername(db, username);
  if (!user || user.status !== 'active' || !verifyPassword(password, user.password_hash)) {
    const error = new Error('用户名或密码不正确。');
    error.code = 'INVALID_LOGIN';
    throw error;
  }
  const session = createSession(db, user.id);
  await persistDb(db);
  return { user: publicUser(user), session };
}

export async function logoutSession(token) {
  if (!token) return;
  const db = await getDb();
  run(db, 'DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
  await persistDb(db);
}

export async function getSessionUser(token) {
  if (!token) return null;
  const db = await getDb();
  const row = first(db, `
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `, [hashToken(token), nowIso()]);
  if (!row || row.status !== 'active') return null;
  return publicUser(row);
}

export async function listUsers() {
  const db = await getDb();
  return all(db, 'SELECT id, username, role, status, daily_limit, created_at, updated_at FROM users ORDER BY created_at ASC');
}

export async function getAdminOverview() {
  const db = await getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const totalsRow = first(db, `
    SELECT
      (SELECT COUNT(*) FROM users) AS totalUsers,
      (SELECT COUNT(*) FROM users WHERE status = 'active') AS activeUsers,
      (SELECT COUNT(*) FROM users WHERE status = 'disabled') AS disabledUsers,
      (SELECT COUNT(*) FROM users WHERE role = 'admin') AS adminUsers,
      (SELECT COUNT(*) FROM projects) AS totalProjects,
      (SELECT COUNT(*) FROM generation_logs) AS totalGenerations,
      (SELECT COUNT(*) FROM generation_logs WHERE created_at >= ?) AS todayGenerations,
      (SELECT COUNT(*) FROM agent_tasks) AS totalAgentTasks,
      (SELECT COUNT(*) FROM agent_tasks WHERE created_at >= ?) AS todayAgentTasks
  `, [todayIso, todayIso]) || {};

  const userRows = all(db, `
    SELECT
      users.id,
      users.username,
      users.role,
      users.status,
      users.daily_limit AS dailyLimit,
      users.created_at AS createdAt,
      users.updated_at AS updatedAt,
      COALESCE(project_stats.projectCount, 0) AS projectCount,
      project_stats.latestProjectAt AS latestProjectAt,
      COALESCE(generation_stats.generationCount, 0) AS generationCount,
      COALESCE(generation_stats.todayGenerationCount, 0) AS todayGenerationCount,
      generation_stats.latestGenerationAt AS latestGenerationAt,
      COALESCE(agent_stats.agentTaskCount, 0) AS agentTaskCount,
      COALESCE(agent_stats.todayAgentTaskCount, 0) AS todayAgentTaskCount,
      agent_stats.latestAgentTaskAt AS latestAgentTaskAt
    FROM users
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS projectCount, MAX(updated_at) AS latestProjectAt
      FROM projects
      GROUP BY user_id
    ) project_stats ON project_stats.user_id = users.id
    LEFT JOIN (
      SELECT
        user_id,
        COUNT(*) AS generationCount,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS todayGenerationCount,
        MAX(created_at) AS latestGenerationAt
      FROM generation_logs
      GROUP BY user_id
    ) generation_stats ON generation_stats.user_id = users.id
    LEFT JOIN (
      SELECT
        user_id,
        COUNT(*) AS agentTaskCount,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS todayAgentTaskCount,
        MAX(updated_at) AS latestAgentTaskAt
      FROM agent_tasks
      GROUP BY user_id
    ) agent_stats ON agent_stats.user_id = users.id
    ORDER BY users.created_at ASC
  `, [todayIso, todayIso]);

  const recentTasks = all(db, `
    SELECT
      agent_tasks.id,
      agent_tasks.user_id AS userId,
      users.username,
      agent_tasks.project_id AS projectId,
      projects.name AS projectName,
      agent_tasks.goal,
      agent_tasks.status,
      agent_tasks.created_at AS createdAt,
      agent_tasks.updated_at AS updatedAt
    FROM agent_tasks
    LEFT JOIN users ON users.id = agent_tasks.user_id
    LEFT JOIN projects ON projects.id = agent_tasks.project_id
    ORDER BY agent_tasks.created_at DESC
    LIMIT 10
  `);

  const recentGenerations = all(db, `
    SELECT
      generation_logs.id,
      generation_logs.user_id AS userId,
      users.username,
      generation_logs.project_id AS projectId,
      projects.name AS projectName,
      generation_logs.module_id AS moduleId,
      generation_logs.created_at AS createdAt
    FROM generation_logs
    LEFT JOIN users ON users.id = generation_logs.user_id
    LEFT JOIN projects ON projects.id = generation_logs.project_id
    ORDER BY generation_logs.created_at DESC
    LIMIT 10
  `);

  return {
    generatedAt: nowIso(),
    totals: {
      totalUsers: toNumber(totalsRow.totalUsers),
      activeUsers: toNumber(totalsRow.activeUsers),
      disabledUsers: toNumber(totalsRow.disabledUsers),
      adminUsers: toNumber(totalsRow.adminUsers),
      totalProjects: toNumber(totalsRow.totalProjects),
      totalGenerations: toNumber(totalsRow.totalGenerations),
      todayGenerations: toNumber(totalsRow.todayGenerations),
      totalAgentTasks: toNumber(totalsRow.totalAgentTasks),
      todayAgentTasks: toNumber(totalsRow.todayAgentTasks),
    },
    users: userRows.map((row) => {
      const dailyLimit = toNumber(row.dailyLimit);
      const todayGenerationCount = toNumber(row.todayGenerationCount);
      return {
        id: row.id,
        username: row.username,
        role: row.role,
        status: row.status,
        dailyLimit,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        projectCount: toNumber(row.projectCount),
        generationCount: toNumber(row.generationCount),
        todayGenerationCount,
        agentTaskCount: toNumber(row.agentTaskCount),
        todayAgentTaskCount: toNumber(row.todayAgentTaskCount),
        lastActivityAt: latestIso(row.updatedAt, row.latestProjectAt, row.latestGenerationAt, row.latestAgentTaskAt),
        quota: {
          usedToday: todayGenerationCount,
          dailyLimit,
          remainingToday: dailyLimit <= 0 ? null : Math.max(dailyLimit - todayGenerationCount, 0),
        },
      };
    }),
    recentTasks: recentTasks.map((row) => ({
      id: row.id,
      userId: row.userId,
      username: row.username || 'unknown',
      projectId: row.projectId || '',
      projectName: row.projectName || '',
      goal: row.goal || '',
      status: row.status || '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    recentGenerations: recentGenerations.map((row) => ({
      id: row.id,
      userId: row.userId,
      username: row.username || 'unknown',
      projectId: row.projectId || '',
      projectName: row.projectName || '',
      moduleId: row.moduleId || '',
      createdAt: row.createdAt,
    })),
  };
}

export async function createUser({ username, password, role = 'user', dailyLimit = 50 }) {
  const db = await getDb();
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !String(password || '').trim()) {
    const error = new Error('用户名和密码不能为空。');
    error.code = 'INVALID_USER';
    throw error;
  }
  const id = randomId();
  const timestamp = nowIso();
  run(db, `
    INSERT INTO users (id, username, password_hash, role, status, daily_limit, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
  `, [id, normalizedUsername, hashPassword(password), normalizeRole(role), normalizeLimit(dailyLimit), timestamp, timestamp]);
  createDefaultProject(db, id, '默认项目', emptyProjectProfile());
  await persistDb(db);
  return first(db, 'SELECT id, username, role, status, daily_limit, created_at, updated_at FROM users WHERE id = ?', [id]);
}

export async function updateUser(userId, updates = {}) {
  const db = await getDb();
  const user = first(db, 'SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    const error = new Error('用户不存在。');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  const next = {
    role: updates.role ? normalizeRole(updates.role) : user.role,
    status: updates.status ? normalizeStatus(updates.status) : user.status,
    dailyLimit: updates.dailyLimit === undefined ? user.daily_limit : normalizeLimit(updates.dailyLimit),
    passwordHash: String(updates.password || '').trim() ? hashPassword(updates.password) : user.password_hash,
  };
  run(db, `
    UPDATE users
    SET role = ?, status = ?, daily_limit = ?, password_hash = ?, updated_at = ?
    WHERE id = ?
  `, [next.role, next.status, next.dailyLimit, next.passwordHash, nowIso(), userId]);
  if (next.status !== 'active') {
    run(db, 'DELETE FROM sessions WHERE user_id = ?', [userId]);
  }
  await persistDb(db);
  return first(db, 'SELECT id, username, role, status, daily_limit, created_at, updated_at FROM users WHERE id = ?', [userId]);
}

export async function listProjectsForUser(userId) {
  const db = await getDb();
  const rows = all(db, 'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC, created_at ASC', [userId]);
  return rows.map(projectFromRow);
}

export async function getProjectForUser(userId, projectId) {
  const db = await getDb();
  const row = first(db, 'SELECT * FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  return row ? projectFromRow(row) : null;
}

export async function createProjectForUser(userId, { name, profile }) {
  const db = await getDb();
  const project = createDefaultProject(db, userId, normalizeProjectName(name), normalizeProjectProfile(profile || {}));
  await persistDb(db);
  return project;
}

export async function updateProjectForUser(userId, projectId, { name, profile }) {
  const db = await getDb();
  const existing = first(db, 'SELECT * FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  if (!existing) {
    const error = new Error('项目不存在或无权访问。');
    error.code = 'PROJECT_NOT_FOUND';
    throw error;
  }
  const nextProfile = normalizeProjectProfile(profile || JSON.parse(existing.profile_json || '{}'));
  nextProfile.updatedAt = nowIso();
  run(db, `
    UPDATE projects SET name = ?, profile_json = ?, updated_at = ? WHERE id = ? AND user_id = ?
  `, [
    normalizeProjectName(name || existing.name),
    JSON.stringify(nextProfile),
    nextProfile.updatedAt,
    projectId,
    userId,
  ]);
  await persistDb(db);
  return getProjectForUser(userId, projectId);
}

export async function deleteProjectForUser(userId, projectId) {
  const db = await getDb();
  const count = first(db, 'SELECT COUNT(*) AS count FROM projects WHERE user_id = ?', [userId])?.count || 0;
  if (count <= 1) {
    const error = new Error('至少需要保留一个项目。');
    error.code = 'LAST_PROJECT';
    throw error;
  }
  run(db, 'DELETE FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  await persistDb(db);
}

export async function recordGeneration(userId, projectId, moduleId, details = {}) {
  const db = await getDb();
  const id = randomId();
  const timestamp = nowIso();
  run(db, 'INSERT INTO generation_logs (id, user_id, project_id, module_id, created_at) VALUES (?, ?, ?, ?, ?)', [
    id,
    userId,
    projectId || '',
    moduleId || '',
    timestamp,
  ]);
  if (details && Object.keys(details).length) {
    run(db, `
      INSERT INTO generation_records (
        id, user_id, project_id, module_id, module_label, model, request_json, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      userId,
      projectId || '',
      moduleId || '',
      String(details.moduleLabel || details.moduleName || moduleId || '').slice(0, 120),
      String(details.model || '').slice(0, 120),
      JSON.stringify(details.request || {}),
      JSON.stringify(details.result || {}),
      timestamp,
    ]);
  }
  await persistDb(db);
  return getGenerationRecordForUser(userId, id);
}

export async function listGenerationRecordsForUser(userId, { projectId, moduleId, limit = 20 } = {}) {
  const db = await getDb();
  const safeLimit = clampLimit(limit, 1, 100, 20);
  const clauses = ['user_id = ?'];
  const params = [userId];
  if (projectId) {
    clauses.push('project_id = ?');
    params.push(projectId);
  }
  if (moduleId) {
    clauses.push('module_id = ?');
    params.push(moduleId);
  }
  params.push(safeLimit);
  const rows = all(db, `
    SELECT * FROM generation_records
    WHERE ${clauses.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `, params);
  return rows.map(generationRecordFromRow);
}

export async function getGenerationRecordForUser(userId, recordId) {
  if (!recordId) return null;
  const db = await getDb();
  const row = first(db, 'SELECT * FROM generation_records WHERE id = ? AND user_id = ?', [recordId, userId]);
  return row ? generationRecordFromRow(row) : null;
}

export async function listContentExperimentsForUser(userId, { projectId, limit = 20 } = {}) {
  const db = await getDb();
  const safeLimit = clampLimit(limit, 1, 100, 20);
  const clauses = ['user_id = ?'];
  const params = [userId];
  if (projectId) {
    clauses.push('project_id = ?');
    params.push(projectId);
  }
  params.push(safeLimit);
  const rows = all(db, `
    SELECT * FROM content_experiments
    WHERE ${clauses.join(' AND ')}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT ?
  `, params);
  return rows.map(contentExperimentFromRow);
}

export async function createContentExperimentForUser(userId, {
  projectId,
  generationRecordId,
  moduleId,
  title,
  contentType,
} = {}) {
  const db = await getDb();
  const record = generationRecordId ? getGenerationRecordForUserSync(db, userId, generationRecordId) : null;
  const derivedModuleId = moduleId || record?.moduleId || '';
  const derivedTitle = normalizeExperimentTitle(title || record?.summary || record?.moduleLabel || '内容实验');
  const analysis = buildExperimentAnalysis({ record, moduleId: derivedModuleId, contentType });
  const timestamp = nowIso();
  const id = randomId();
  run(db, `
    INSERT INTO content_experiments (
      id, user_id, project_id, generation_record_id, module_id, title, content_type,
      score_json, prediction_json, publish_json, review_json, rubric_json, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId,
    projectId || record?.projectId || '',
    generationRecordId || record?.id || '',
    derivedModuleId,
    derivedTitle,
    String(contentType || analysis.contentType || '未分类').slice(0, 80),
    JSON.stringify(analysis.score),
    JSON.stringify(analysis.prediction),
    JSON.stringify({}),
    JSON.stringify({}),
    JSON.stringify(analysis.rubric),
    'predicted',
    timestamp,
    timestamp,
  ]);
  await persistDb(db);
  return getContentExperimentForUser(userId, id);
}

export async function reviewContentExperimentForUser(userId, experimentId, updates = {}) {
  const db = await getDb();
  const existing = getContentExperimentForUserSync(db, userId, experimentId);
  if (!existing) {
    const error = new Error('内容实验不存在或无权访问。');
    error.code = 'CONTENT_EXPERIMENT_NOT_FOUND';
    throw error;
  }
  const publish = {
    ...(existing.publish || {}),
    url: String(updates.publishUrl || updates.url || existing.publish?.url || '').slice(0, 500),
    publishedAt: String(updates.publishedAt || existing.publish?.publishedAt || '').slice(0, 80),
  };
  const metrics = normalizeExperimentMetrics(updates.metrics || updates);
  const review = buildExperimentReview({
    score: existing.score,
    prediction: existing.prediction,
    metrics,
    notes: updates.notes,
  });
  const status = review.decision === '样本不足' ? 'reviewed' : 'learned';
  run(db, `
    UPDATE content_experiments
    SET publish_json = ?, review_json = ?, status = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `, [
    JSON.stringify(publish),
    JSON.stringify(review),
    status,
    nowIso(),
    experimentId,
    userId,
  ]);
  await persistDb(db);
  return getContentExperimentForUser(userId, experimentId);
}

export async function getContentExperimentForUser(userId, experimentId) {
  const db = await getDb();
  return getContentExperimentForUserSync(db, userId, experimentId);
}

export async function recordAgentTask(userId, projectId, goal, plan) {
  const db = await getDb();
  const timestamp = nowIso();
  const id = randomId();
  run(db, `
    INSERT INTO agent_tasks (id, user_id, project_id, goal, status, plan_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId,
    projectId || '',
    String(goal || '').slice(0, 4000),
    plan?.status || 'unknown',
    JSON.stringify(plan || {}),
    timestamp,
    timestamp,
  ]);
  await persistDb(db);
  return getAgentTaskForUser(userId, id);
}

export async function recordAgentRun(userId, projectId, goal, runDetails = {}) {
  const db = await getDb();
  const timestamp = nowIso();
  const id = runDetails.id || randomId();
  run(db, `
    INSERT INTO agent_runs (id, user_id, project_id, goal, status, plan_json, steps_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId,
    projectId || '',
    String(goal || '').slice(0, 4000),
    runDetails.status || 'unknown',
    JSON.stringify(runDetails.plan || {}),
    JSON.stringify(runDetails.steps || []),
    timestamp,
    timestamp,
  ]);
  await persistDb(db);
  return getAgentRunForUser(userId, id);
}

export async function listAgentTasksForUser(userId, { projectId, limit = 20 } = {}) {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const rows = projectId
    ? all(db, 'SELECT * FROM agent_tasks WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT ?', [userId, projectId, safeLimit])
    : all(db, 'SELECT * FROM agent_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, safeLimit]);
  return rows.map(agentTaskFromRow);
}

export async function getAgentTaskForUser(userId, taskId) {
  const db = await getDb();
  const row = first(db, 'SELECT * FROM agent_tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
  return row ? agentTaskFromRow(row) : null;
}

export async function listAgentRunsForUser(userId, { projectId, limit = 20 } = {}) {
  const db = await getDb();
  const safeLimit = clampLimit(limit, 1, 100, 20);
  const rows = projectId
    ? all(db, 'SELECT * FROM agent_runs WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT ?', [userId, projectId, safeLimit])
    : all(db, 'SELECT * FROM agent_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, safeLimit]);
  return rows.map(agentRunFromRow);
}

export async function getAgentRunForUser(userId, runId) {
  if (!runId) return null;
  const db = await getDb();
  const row = first(db, 'SELECT * FROM agent_runs WHERE id = ? AND user_id = ?', [runId, userId]);
  return row ? agentRunFromRow(row) : null;
}

export async function assertGenerationAllowed(user) {
  if (user.role === 'admin') return;
  const limit = Number(user.dailyLimit ?? user.daily_limit ?? 50);
  if (limit <= 0) return;
  const db = await getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const count = first(db, 'SELECT COUNT(*) AS count FROM generation_logs WHERE user_id = ? AND created_at >= ?', [user.id, today.toISOString()])?.count || 0;
  if (count >= limit) {
    const error = new Error(`今天生成次数已达上限（${limit}次），请联系管理员。`);
    error.code = 'DAILY_LIMIT_REACHED';
    throw error;
  }
}

export function getSessionCookie(req) {
  const cookies = String(req.headers.cookie || '').split(';').map((item) => item.trim());
  const pair = cookies.find((item) => item.startsWith(`${sessionCookieName}=`));
  return pair ? decodeURIComponent(pair.slice(sessionCookieName.length + 1)) : '';
}

export function buildSessionCookie(token) {
  const maxAge = sessionDays * 24 * 60 * 60;
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function migrate(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      daily_limit INTEGER NOT NULL DEFAULT 50,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS generation_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT,
      module_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS generation_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT,
      module_id TEXT,
      module_label TEXT,
      model TEXT,
      request_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      progress_json TEXT NOT NULL,
      request_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      error_json TEXT NOT NULL,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS generation_jobs_user_status_idx
      ON generation_jobs(user_id, status, created_at);
    CREATE INDEX IF NOT EXISTS generation_jobs_project_idx
      ON generation_jobs(user_id, project_id, created_at);
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT,
      goal TEXT NOT NULL,
      status TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT,
      goal TEXT NOT NULL,
      status TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS content_experiments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT,
      generation_record_id TEXT,
      module_id TEXT,
      title TEXT NOT NULL,
      content_type TEXT NOT NULL,
      score_json TEXT NOT NULL,
      prediction_json TEXT NOT NULL,
      publish_json TEXT NOT NULL,
      review_json TEXT NOT NULL,
      rubric_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

async function bootstrapAdmin(db) {
  const userCount = first(db, 'SELECT COUNT(*) AS count FROM users')?.count || 0;
  if (userCount > 0) return;

  const username = normalizeUsername(process.env.ADMIN_USERNAME || 'admin');
  const password = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || randomPassword();
  const timestamp = nowIso();
  const adminId = randomId();
  run(db, `
    INSERT INTO users (id, username, password_hash, role, status, daily_limit, created_at, updated_at)
    VALUES (?, ?, ?, 'admin', 'active', 0, ?, ?)
  `, [adminId, username, hashPassword(password), timestamp, timestamp]);

  const legacyProfile = await loadProjectProfile();
  const profile = projectProfileIsEmpty(legacyProfile) ? emptyProjectProfile() : legacyProfile;
  createDefaultProject(db, adminId, profile.projectName || '默认项目', profile);

  if (!process.env.INITIAL_ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD) {
    console.log(`Initial admin created: ${username} / ${password}`);
  }
}

function createDefaultProject(db, userId, name, profile) {
  const timestamp = nowIso();
  const normalizedProfile = normalizeProjectProfile(profile || {});
  normalizedProfile.projectName = normalizedProfile.projectName || name || '默认项目';
  normalizedProfile.updatedAt = timestamp;
  const id = randomId();
  run(db, `
    INSERT INTO projects (id, user_id, name, profile_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, userId, normalizeProjectName(name || normalizedProfile.projectName), JSON.stringify(normalizedProfile), timestamp, timestamp]);
  return { id, userId, name: normalizeProjectName(name || normalizedProfile.projectName), profile: normalizedProfile, createdAt: timestamp, updatedAt: timestamp };
}

async function persistDb(db) {
  await persistDatabase(db);
}

function run(db, sql, params = []) {
  db.run(sql, params);
}

function first(db, sql, params = []) {
  const stmt = db.prepare(sql, params);
  try {
    return stmt.step() ? stmt.getAsObject() : null;
  } finally {
    stmt.free();
  }
}

function all(db, sql, params = []) {
  const stmt = db.prepare(sql, params);
  const rows = [];
  try {
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function clampLimit(value, min, max, fallback) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(min, Math.min(Math.floor(limit), max));
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function latestIso(...values) {
  return values.filter(Boolean).sort().at(-1) || '';
}

function getUserByUsername(db, username) {
  return first(db, 'SELECT * FROM users WHERE username = ?', [normalizeUsername(username)]);
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000).toISOString();
  run(db, 'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', [
    randomId(),
    userId,
    hashToken(token),
    expiresAt,
    createdAt,
  ]);
  return { token, expiresAt };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    dailyLimit: Number(user.daily_limit),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function projectFromRow(row) {
  let profile = emptyProjectProfile();
  try {
    profile = normalizeProjectProfile(JSON.parse(row.profile_json || '{}'));
  } catch {
    profile = emptyProjectProfile();
  }
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    profile,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function agentTaskFromRow(row) {
  let plan = {};
  try {
    plan = JSON.parse(row.plan_json || '{}');
  } catch {
    plan = {};
  }
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    goal: row.goal,
    status: row.status,
    plan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function agentRunFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id || '',
    goal: row.goal || '',
    status: row.status || '',
    plan: parseJsonObject(row.plan_json),
    steps: parseJsonArray(row.steps_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generationRecordFromRow(row) {
  const request = parseJsonObject(row.request_json);
  const result = parseJsonObject(row.result_json);
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id || '',
    moduleId: row.module_id || '',
    moduleLabel: row.module_label || row.module_id || '',
    model: row.model || '',
    request,
    result,
    summary: String(result.summary || '').slice(0, 240),
    createdAt: row.created_at,
  };
}

function contentExperimentFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id || '',
    generationRecordId: row.generation_record_id || '',
    moduleId: row.module_id || '',
    title: row.title || '',
    contentType: row.content_type || '',
    score: parseJsonObject(row.score_json),
    prediction: parseJsonObject(row.prediction_json),
    publish: parseJsonObject(row.publish_json),
    review: parseJsonObject(row.review_json),
    rubric: parseJsonObject(row.rubric_json),
    status: row.status || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getGenerationRecordForUserSync(db, userId, recordId) {
  const row = first(db, 'SELECT * FROM generation_records WHERE id = ? AND user_id = ?', [recordId, userId]);
  return row ? generationRecordFromRow(row) : null;
}

function getContentExperimentForUserSync(db, userId, experimentId) {
  const row = first(db, 'SELECT * FROM content_experiments WHERE id = ? AND user_id = ?', [experimentId, userId]);
  return row ? contentExperimentFromRow(row) : null;
}

function buildExperimentAnalysis({ record, moduleId, contentType }) {
  const text = flattenText([
    record?.moduleLabel,
    record?.summary,
    record?.request,
    record?.result,
  ]);
  const inferredType = contentType || inferContentType(moduleId, text);
  const scoreItems = [
    scoreItem('开头强度', text, ['第一句', '开头', '黄金3秒', '金额', '结果', '反常识', '冲突', '痛点'], 14),
    scoreItem('目标用户精准度', text, ['目标用户', '人群', '老板', '客户', '工程老板', '实际施工人', '宝妈', '本地'], 14),
    scoreItem('痛点强度', text, ['痛点', '焦虑', '怕', '亏', '被拖欠', '没钱', '风险', '撑不住'], 14),
    scoreItem('信任证明', text, ['案例', '证明', '合同', '判决书', '评价', '胜诉', '金额', '资质', '过程'], 14),
    scoreItem('成交承接', text, ['私信', '电话', '表单', '预约', '到店', '评论关键词', 'CTA', '咨询'], 14),
    scoreItem('真实人设', text, ['方言', '真实', '情绪', '口播', '现场', '团队', '喝酒', '本地'], 14),
    scoreItem('可复盘性', text, ['发布', '复盘', '数据', '完播', '评论', '私信', '下一条', '测试'], 16),
  ];
  const totalScore = Math.min(100, scoreItems.reduce((sum, item) => sum + item.score, 0));
  const flags = buildExperimentFlags(scoreItems, text, inferredType);
  return {
    contentType: inferredType,
    score: {
      total: totalScore,
      level: totalScore >= 85 ? '强发布' : totalScore >= 70 ? '可测试' : '需打磨',
      items: scoreItems,
      flags,
      summary: buildScoreSummary(totalScore, inferredType, flags),
    },
    prediction: buildExperimentPrediction({ totalScore, scoreItems, flags, contentType: inferredType }),
    rubric: {
      version: '2026-07-11-content-loop-v1',
      principles: ['先盲预测再发布', 'T+3看干净数据', '每次只改一处', '低播放高咨询优先保留', '播放高不成交先查脏数据'],
      nextReviewFields: ['播放', '完播率', '点赞', '评论', '私信', '电话', '成交', '高意向原话'],
    },
  };
}

function scoreItem(name, text, terms, maxScore) {
  const hits = terms.filter((term) => text.includes(term));
  const ratio = hits.length >= 4 ? 1 : hits.length === 3 ? 0.85 : hits.length === 2 ? 0.65 : hits.length === 1 ? 0.4 : 0;
  const score = Math.min(maxScore, Math.round(maxScore * ratio));
  return {
    name,
    score,
    maxScore,
    hits: hits.slice(0, 6),
    advice: score >= Math.round(maxScore * 0.7) ? '保留' : `补强${name}`,
  };
}

function buildExperimentFlags(scoreItems, text, contentType) {
  const byName = Object.fromEntries(scoreItems.map((item) => [item.name, item.score]));
  const flags = [];
  if ((byName['开头强度'] || 0) < 8) flags.push('开头不够狠');
  if ((byName['目标用户精准度'] || 0) < 8) flags.push('目标用户不够准');
  if ((byName['信任证明'] || 0) < 8) flags.push('缺少证明材料');
  if ((byName['成交承接'] || 0) < 8 && /转化|成交|咨询|课程|服务/.test(contentType + text)) flags.push('成交入口不清楚');
  if (/泛流量|热点|反常识/.test(text) && !/私信|电话|评论关键词|表单/.test(text)) flags.push('可能有泛流量脏数据');
  return flags;
}

function buildScoreSummary(totalScore, contentType, flags) {
  if (totalScore >= 85) return `${contentType}发布前评分较强，可以发布并做T+3复盘。`;
  if (totalScore >= 70) return `${contentType}可以小流量测试，发布后重点观察评论和私信是否精准。`;
  return `${contentType}建议先补强：${flags.slice(0, 3).join('、') || '开头、痛点和证明'}。`;
}

function buildExperimentPrediction({ totalScore, scoreItems, flags, contentType }) {
  const item = (name) => scoreItems.find((entry) => entry.name === name)?.score || 0;
  const traffic = item('开头强度') + item('痛点强度') + item('真实人设');
  const conversion = item('目标用户精准度') + item('信任证明') + item('成交承接');
  const likelyOutcome = conversion >= traffic + 6
    ? '低播放高咨询'
    : traffic >= conversion + 10
      ? '高播放低转化'
      : totalScore >= 80
        ? '流量与转化均衡'
        : '需要小样本测试';
  return {
    blind: true,
    contentType,
    likelyOutcome,
    expectedSignals: [
      traffic >= 28 ? '开头有停留潜力' : '开头需要观察3秒留存',
      conversion >= 28 ? '咨询/私信质量可能较高' : '成交承接需要重点复盘',
      flags.includes('可能有泛流量脏数据') ? '评论热闹但不一定成交' : '优先看评论是否来自目标用户',
    ],
    watchMetrics: ['3秒留存', '完播率', '评论关键词', '私信数', '电话数', '成交线索'],
    publishAdvice: totalScore >= 70 ? '可以发布测试，T+3填写数据复盘。' : '建议修改后再发布。',
  };
}

function normalizeExperimentMetrics(input = {}) {
  const metric = (key) => Math.max(0, Number(input[key] ?? 0) || 0);
  return {
    views: metric('views'),
    completionRate: Math.max(0, Math.min(100, Number(input.completionRate ?? 0) || 0)),
    likes: metric('likes'),
    comments: metric('comments'),
    saves: metric('saves'),
    shares: metric('shares'),
    privateMessages: metric('privateMessages'),
    phoneCalls: metric('phoneCalls'),
    leads: metric('leads'),
    deals: metric('deals'),
    highIntentQuotes: String(input.highIntentQuotes || '').slice(0, 1000),
  };
}

function buildExperimentReview({ score, prediction, metrics, notes }) {
  const engagement = metrics.views > 0
    ? Number((((metrics.likes + metrics.comments + metrics.saves + metrics.shares) / metrics.views) * 100).toFixed(2))
    : 0;
  const consultRate = metrics.views > 0
    ? Number((((metrics.privateMessages + metrics.phoneCalls + metrics.leads) / metrics.views) * 100).toFixed(2))
    : 0;
  const hasConversion = metrics.privateMessages + metrics.phoneCalls + metrics.leads + metrics.deals > 0;
  const decision = metrics.views < 100
    ? '样本不足'
    : hasConversion && consultRate >= 0.3
      ? '干净数据'
      : metrics.views >= 2000 && !hasConversion
        ? '疑似脏数据'
        : '继续观察';
  const matchedPrediction = prediction?.likelyOutcome
    ? inferPredictionMatched(prediction.likelyOutcome, metrics, hasConversion)
    : false;
  return {
    reviewedAt: nowIso(),
    metrics,
    engagement,
    consultRate,
    decision,
    matchedPrediction,
    notes: String(notes || '').slice(0, 1200),
    diagnosis: buildReviewDiagnosis({ decision, metrics, score }),
    nextActions: buildReviewNextActions({ decision, metrics, score }),
    rubricUpdate: buildRubricUpdate({ decision, metrics, score }),
  };
}

function inferPredictionMatched(likelyOutcome, metrics, hasConversion) {
  if (likelyOutcome === '低播放高咨询') return metrics.views < 2000 && hasConversion;
  if (likelyOutcome === '高播放低转化') return metrics.views >= 2000 && !hasConversion;
  if (likelyOutcome === '流量与转化均衡') return metrics.views >= 500 && hasConversion;
  return metrics.views < 1000;
}

function buildReviewDiagnosis({ decision, metrics, score }) {
  if (decision === '样本不足') return '样本太少，先不要改太多变量，保留结构再测一条。';
  if (decision === '疑似脏数据') return '播放不少但咨询弱，优先检查目标用户、开头承诺和成交入口是否偏泛。';
  if (decision === '干净数据') return '数据较干净，保留开头结构、证明方式和承接路径，做同主题追投。';
  if ((score?.total || 0) < 70) return '发布前评分偏低，复盘时优先改开头、痛点和证明材料。';
  return `继续观察高意向信号：评论${metrics.comments}、私信${metrics.privateMessages}、电话${metrics.phoneCalls}。`;
}

function buildReviewNextActions({ decision, metrics }) {
  if (decision === '干净数据') return ['24-72小时内追一条同主题转化视频', '复用开头结构，只替换案例或证明材料', '把评论/私信原话沉淀进项目档案'];
  if (decision === '疑似脏数据') return ['下一条收窄目标人群', '第一句加入客户身份或具体场景', 'CTA从泛互动改成私信/电话/关键词'];
  if (decision === '样本不足') return ['保留原结构再发布一条', '只改一个变量', '不要用单条低播放否定方法'];
  return ['补充T+3后续数据', '对比预测与真实结果', '记录下一条实验假设'];
}

function buildRubricUpdate({ decision, metrics, score }) {
  if (decision === '干净数据') return '提高本条命中的开头、证明、承接因子权重。';
  if (decision === '疑似脏数据') return '降低泛流量钩子权重，提高目标用户精准度和成交入口权重。';
  if ((score?.total || 0) < 70) return '发布前评分低于70的内容不建议直接发布，先补强骨架。';
  return '保留当前评分规则，等待更多样本校准。';
}

function inferContentType(moduleId, text) {
  if (/转化|成交|私信|电话|表单|预约/.test(text) || moduleId === 'conversion-topics') return '成交转化型';
  if (/热点|爆款|反常识|泛流量/.test(text) || moduleId === 'viral-topics') return '泛流量/起量型';
  if (/信任|证明|案例|判决书|评价|资质/.test(text)) return '信任证明型';
  if (/人设|定位|自己人|方言|真实/.test(text) || moduleId === 'ip-positioning') return '立人设型';
  if (/带货|商品|TikTok|小黄车|团购/.test(text) || moduleId === 'commerce') return '带货转化型';
  return '内容测试型';
}

function flattenText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenText).join('\n');
  if (typeof value === 'object') return Object.values(value).map(flattenText).join('\n');
  return String(value);
}

function normalizeExperimentTitle(title) {
  return String(title || '').replace(/\s+/g, ' ').trim().slice(0, 120) || '内容实验';
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [, salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return safeEqual(actual, expected);
}

function safeEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function randomId() {
  return crypto.randomUUID();
}

function randomPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'user';
}

function normalizeStatus(status) {
  return status === 'disabled' ? 'disabled' : 'active';
}

function normalizeLimit(value) {
  const limit = Number(value);
  return Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 50;
}

function normalizeProjectName(name) {
  const value = String(name || '').trim();
  return value || '默认项目';
}
