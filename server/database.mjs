import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { emptyProjectProfile, loadProjectProfile, normalizeProjectProfile, projectProfileIsEmpty } from './projectProfile.mjs';

const rootDir = process.cwd();
const dataDir = process.env.APP_DATA_DIR || path.join(rootDir, 'data');
const dbPath = path.join(dataDir, 'app.db');
const sessionCookieName = 'ip_commerce_session';
const sessionDays = Number(process.env.SESSION_DAYS || 14);

let dbPromise;

export async function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
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

export async function recordGeneration(userId, projectId, moduleId) {
  const db = await getDb();
  run(db, 'INSERT INTO generation_logs (id, user_id, project_id, module_id, created_at) VALUES (?, ?, ?, ?, ?)', [
    randomId(),
    userId,
    projectId || '',
    moduleId || '',
    nowIso(),
  ]);
  await persistDb(db);
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

async function openDb() {
  await fs.mkdir(dataDir, { recursive: true });
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(rootDir, 'node_modules', 'sql.js', 'dist', file),
  });
  try {
    const bytes = await fs.readFile(dbPath);
    return new SQL.Database(bytes);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return new SQL.Database();
  }
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
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbPath, Buffer.from(db.export()));
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

