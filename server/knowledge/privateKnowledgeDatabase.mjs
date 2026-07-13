import fs from 'node:fs/promises';
import path from 'node:path';
import { createSqlJsFileStore } from '../storage/sqlJsFileStore.mjs';

const rootDir = process.cwd();
const defaultDataDir = process.env.APP_DATA_DIR || path.join(rootDir, 'data');
export const privateKnowledgeDatabasePath = process.env.KNOWLEDGE_DB_PATH
  || path.join(defaultDataDir, 'private-knowledge.db');
export const privateKnowledgeBackupDir = process.env.KNOWLEDGE_BACKUP_DIR
  || path.join(path.dirname(privateKnowledgeDatabasePath), 'backups');

const store = createSqlJsFileStore({ databasePath: privateKnowledgeDatabasePath, rootDir });
let initializationPromise;
let backupTimer;

export function initializePrivateKnowledgeDatabase() {
  if (!initializationPromise) initializationPromise = initialize();
  return initializationPromise;
}

export async function getPrivateKnowledgeDatabase() {
  await initializePrivateKnowledgeDatabase();
  return store.getDatabase();
}

export async function persistPrivateKnowledgeDatabase(database) {
  return store.persistDatabase(database);
}

export async function getPrivateKnowledgeDatabaseStatus() {
  try {
    const db = await getPrivateKnowledgeDatabase();
    const counts = first(db, `
      SELECT
        (SELECT COUNT(*) FROM knowledge_cards) AS totalCards,
        (SELECT COUNT(*) FROM knowledge_cards WHERE status = 'published') AS publishedCards,
        (SELECT COUNT(*) FROM knowledge_candidates WHERE status = 'pending') AS pendingCandidates,
        (SELECT COUNT(*) FROM project_memories WHERE status = 'active') AS activeProjectMemories,
        (SELECT COUNT(*) FROM knowledge_versions) AS versions
    `) || {};
    return {
      ok: true,
      required: privateKnowledgeRequired(),
      totalCards: numberValue(counts.totalCards),
      publishedCards: numberValue(counts.publishedCards),
      pendingCandidates: numberValue(counts.pendingCandidates),
      activeProjectMemories: numberValue(counts.activeProjectMemories),
      versions: numberValue(counts.versions),
    };
  } catch (error) {
    return {
      ok: false,
      required: privateKnowledgeRequired(),
      error: error.message,
    };
  }
}

export function privateKnowledgeRequired() {
  return parseBoolean(process.env.PRIVATE_KNOWLEDGE_REQUIRED || 'false');
}

export async function createPrivateKnowledgeBackup({ kind = 'manual' } = {}) {
  const db = await getPrivateKnowledgeDatabase();
  await persistPrivateKnowledgeDatabase(db);
  await store.waitForWrites();
  await fs.mkdir(privateKnowledgeBackupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeKind = ['daily', 'weekly', 'manual', 'pre-migration'].includes(kind) ? kind : 'manual';
  const fileName = `private-knowledge-${safeKind}-${timestamp}.db`;
  const targetPath = path.join(privateKnowledgeBackupDir, fileName);
  await fs.copyFile(privateKnowledgeDatabasePath, targetPath);
  await pruneBackups();
  return publicBackupInfo(await backupInfo(targetPath));
}

export async function listPrivateKnowledgeBackups() {
  await fs.mkdir(privateKnowledgeBackupDir, { recursive: true });
  const entries = await fs.readdir(privateKnowledgeBackupDir, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^private-knowledge-(daily|weekly|manual|pre-migration)-.+\.db$/.test(entry.name)) continue;
    backups.push(publicBackupInfo(await backupInfo(path.join(privateKnowledgeBackupDir, entry.name))));
  }
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPrivateKnowledgeBackupPath(fileName) {
  const safeName = path.basename(String(fileName || ''));
  if (!/^private-knowledge-(daily|weekly|manual|pre-migration)-.+\.db$/.test(safeName)) return null;
  const targetPath = path.join(privateKnowledgeBackupDir, safeName);
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile() ? targetPath : null;
  } catch {
    return null;
  }
}

export async function restorePrivateKnowledgeBackup(fileName) {
  const backupPath = await getPrivateKnowledgeBackupPath(fileName);
  if (!backupPath) {
    const error = new Error('备份文件不存在。');
    error.code = 'KNOWLEDGE_BACKUP_NOT_FOUND';
    throw error;
  }
  await createPrivateKnowledgeBackup({ kind: 'pre-migration' });
  const bytes = await fs.readFile(backupPath);
  const database = await store.replaceDatabase(bytes);
  migrate(database);
  await persistPrivateKnowledgeDatabase(database);
  return getPrivateKnowledgeDatabaseStatus();
}

export function startPrivateKnowledgeBackupScheduler() {
  if (backupTimer || !parseBoolean(process.env.KNOWLEDGE_BACKUP_ENABLED || 'true')) return;
  const run = () => {
    void ensureScheduledBackups().catch((error) => {
      console.warn(`Private knowledge backup failed: ${error.message}`);
    });
  };
  run();
  backupTimer = setInterval(run, 60 * 60 * 1000);
  backupTimer.unref?.();
}

export function knowledgeRun(db, sql, params = []) {
  db.run(sql, params);
}

export function knowledgeFirst(db, sql, params = []) {
  return first(db, sql, params);
}

export function knowledgeAll(db, sql, params = []) {
  return all(db, sql, params);
}

async function initialize() {
  const db = await store.getDatabase();
  migrate(db);
  await persistPrivateKnowledgeDatabase(db);
  return db;
}

function migrate(db) {
  db.run('PRAGMA foreign_keys = ON;');
  db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS knowledge_cards (
      id TEXT PRIMARY KEY,
      legacy_key TEXT UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      module_ids_json TEXT NOT NULL,
      industries_json TEXT NOT NULL,
      stages_json TEXT NOT NULL,
      goals_json TEXT NOT NULL,
      methods_json TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      scenarios_json TEXT NOT NULL,
      required_inputs_json TEXT NOT NULL,
      output_template_json TEXT NOT NULL,
      example TEXT NOT NULL,
      applicable_when TEXT NOT NULL,
      avoid_when TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      quality_score REAL NOT NULL DEFAULT 60,
      confidence REAL NOT NULL DEFAULT 0.6,
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      reviewed_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT
    );
    CREATE INDEX IF NOT EXISTS knowledge_cards_status_idx
      ON knowledge_cards(status, updated_at);
    CREATE INDEX IF NOT EXISTS knowledge_cards_category_idx
      ON knowledge_cards(category, status);
    CREATE TABLE IF NOT EXISTS knowledge_versions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      action TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(card_id) REFERENCES knowledge_cards(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS knowledge_versions_card_version_idx
      ON knowledge_versions(card_id, version);
    CREATE TABLE IF NOT EXISTS knowledge_candidates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      source_summary TEXT NOT NULL,
      draft_json TEXT NOT NULL,
      quality_score REAL NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL,
      reviewed_by TEXT NOT NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS knowledge_candidates_status_idx
      ON knowledge_candidates(status, updated_at);
    CREATE INDEX IF NOT EXISTS knowledge_candidates_project_idx
      ON knowledge_candidates(user_id, project_id, status);
    CREATE TABLE IF NOT EXISTS project_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      quality_score REAL NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS project_memories_scope_idx
      ON project_memories(user_id, project_id, status, updated_at);
    CREATE TABLE IF NOT EXISTS knowledge_audit (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS knowledge_audit_entity_idx
      ON knowledge_audit(entity_type, entity_id, created_at);
  `);
  const timestamp = new Date().toISOString();
  db.run(`
    INSERT INTO knowledge_meta (key, value, updated_at)
    VALUES ('schema_version', '1', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `, [timestamp]);
}

async function ensureScheduledBackups() {
  const backups = await listPrivateKnowledgeBackups();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (!backups.some((item) => item.kind === 'daily' && item.createdAt.startsWith(today))) {
    await createPrivateKnowledgeBackup({ kind: 'daily' });
  }
  if (now.getUTCDay() === 0 && !backups.some((item) => item.kind === 'weekly' && sameIsoWeek(item.createdAt, now))) {
    await createPrivateKnowledgeBackup({ kind: 'weekly' });
  }
}

async function pruneBackups() {
  const backups = await listPrivateKnowledgeBackupsWithoutPrune();
  const limits = { daily: 7, weekly: 4, manual: 20, 'pre-migration': 5 };
  for (const [kind, limit] of Object.entries(limits)) {
    const overflow = backups.filter((item) => item.kind === kind).slice(limit);
    await Promise.all(overflow.map((item) => fs.rm(item.path, { force: true })));
  }
}

async function listPrivateKnowledgeBackupsWithoutPrune() {
  await fs.mkdir(privateKnowledgeBackupDir, { recursive: true });
  const entries = await fs.readdir(privateKnowledgeBackupDir, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.db')) continue;
    const match = /^private-knowledge-(daily|weekly|manual|pre-migration)-/.exec(entry.name);
    if (!match) continue;
    const info = await backupInfo(path.join(privateKnowledgeBackupDir, entry.name));
    backups.push({ ...info, kind: match[1] });
  }
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function backupInfo(filePath) {
  const stat = await fs.stat(filePath);
  const fileName = path.basename(filePath);
  const kind = /^private-knowledge-(daily|weekly|manual|pre-migration)-/.exec(fileName)?.[1] || 'manual';
  return {
    fileName,
    path: filePath,
    kind,
    size: stat.size,
    createdAt: stat.mtime.toISOString(),
  };
}

function publicBackupInfo(info) {
  const { path: _path, ...publicInfo } = info;
  return publicInfo;
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

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

function sameIsoWeek(value, targetDate) {
  const source = new Date(value);
  if (Number.isNaN(source.getTime())) return false;
  return isoWeekKey(source) === isoWeekKey(targetDate);
}

function isoWeekKey(date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  copy.setUTCDate(copy.getUTCDate() + 4 - (copy.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}
