import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { detectOpenAIModels, env, getApiStatus, setApiConfig } from './config/env.mjs';
import { buildPrompt } from './prompt-engine/buildPrompt.mjs';
import { buildReviewPrompt } from './prompt-engine/reviewPrompt.mjs';
import { moduleDefinitions } from './prompt-engine/modules.mjs';
import { callOpenAICompatible } from './providers/openaiCompatible.mjs';
import { loadManifest, verifyKnowledgeFiles } from './knowledge/loadKnowledge.mjs';
import {
  assertGenerationAllowed,
  buildSessionCookie,
  clearSessionCookie,
  createProjectForUser,
  createUser,
  deleteProjectForUser,
  getProjectForUser,
  getSessionCookie,
  getSessionUser,
  initializeDatabase,
  listProjectsForUser,
  listUsers,
  loginUser,
  logoutSession,
  recordGeneration,
  updateProjectForUser,
  updateUser,
} from './database.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors());
app.use(requireBasicAuth);
app.use(express.json({ limit: '2mb' }));

await initializeDatabase();

function requireBasicAuth(req, res, next) {
  if (!env.appAuthEnabled || req.method === 'OPTIONS') {
    next();
    return;
  }

  if (!env.appAuthPassword) {
    res.status(503).json({
      ok: false,
      code: 'APP_AUTH_NOT_CONFIGURED',
      message: '网页访问密码未配置，请在服务端 .env 中设置 APP_AUTH_PASSWORD。',
    });
    return;
  }

  const credentials = parseBasicCredentials(req.headers.authorization);
  if (
    credentials &&
    safeEqual(credentials.username, env.appAuthUser) &&
    safeEqual(credentials.password, env.appAuthPassword)
  ) {
    next();
    return;
  }

  res.set('WWW-Authenticate', 'Basic realm="IP Commerce Generator", charset="UTF-8"');
  res.status(401).send('Authentication required');
}

function parseBasicCredentials(header) {
  const match = /^Basic\s+(.+)$/i.exec(String(header || ''));
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) return null;
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function safeEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

app.get('/api/health', async (_req, res) => {
  const manifest = await loadManifest();
  res.json({
    ok: true,
    api: getApiStatus(),
    manifest,
    modules: moduleDefinitions.map(({ id, label }) => ({ id, label })),
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { user, session } = await loginUser(req.body?.username, req.body?.password);
    res.setHeader('Set-Cookie', buildSessionCookie(session.token));
    res.json({ ok: true, user, expiresAt: session.expiresAt });
  } catch (error) {
    res.status(401).json({
      ok: false,
      code: error.code || 'LOGIN_FAILED',
      message: error.message,
    });
  }
});

app.get('/api/auth/me', requireUser, async (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.post('/api/auth/logout', requireUser, async (req, res) => {
  await logoutSession(getSessionCookie(req));
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ ok: true });
});

app.use('/api', requireUser);

async function requireUser(req, res, next) {
  const user = await getSessionUser(getSessionCookie(req));
  if (!user) {
    res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', message: '请先登录。' });
    return;
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ ok: false, code: 'ADMIN_REQUIRED', message: '需要管理员权限。' });
    return;
  }
  next();
}

app.get('/api/knowledge/verify', async (_req, res) => {
  res.json(await verifyKnowledgeFiles());
});

app.post('/api/config/models', requireAdmin, async (req, res) => {
  try {
    const result = await detectOpenAIModels(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({
      ok: false,
      code: error.code || 'MODEL_DETECTION_FAILED',
      message: error.message,
    });
  }
});

app.post('/api/config', requireAdmin, async (req, res) => {
  try {
    const api = setApiConfig(req.body || {});
    res.json({ ok: true, api });
  } catch (error) {
    res.status(400).json({
      ok: false,
      code: error.code || 'API_CONFIG_SAVE_FAILED',
      message: error.message,
    });
  }
});

app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  res.json({ ok: true, users: await listUsers() });
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const user = await createUser(req.body || {});
    res.json({ ok: true, user });
  } catch (error) {
    res.status(400).json({ ok: false, code: error.code || 'USER_CREATE_FAILED', message: error.message });
  }
});

app.patch('/api/admin/users/:userId', requireAdmin, async (req, res) => {
  try {
    const user = await updateUser(req.params.userId, req.body || {});
    res.json({ ok: true, user });
  } catch (error) {
    res.status(400).json({ ok: false, code: error.code || 'USER_UPDATE_FAILED', message: error.message });
  }
});

app.get('/api/projects', async (req, res) => {
  res.json({ ok: true, projects: await listProjectsForUser(req.user.id) });
});

app.post('/api/projects', async (req, res) => {
  try {
    const project = await createProjectForUser(req.user.id, req.body || {});
    res.json({ ok: true, project });
  } catch (error) {
    res.status(400).json({ ok: false, code: error.code || 'PROJECT_CREATE_FAILED', message: error.message });
  }
});

app.get('/api/projects/:projectId', async (req, res) => {
  const project = await getProjectForUser(req.user.id, req.params.projectId);
  if (!project) {
    res.status(404).json({ ok: false, code: 'PROJECT_NOT_FOUND', message: '项目不存在或无权访问。' });
    return;
  }
  res.json({ ok: true, project });
});

app.put('/api/projects/:projectId', async (req, res) => {
  try {
    const project = await updateProjectForUser(req.user.id, req.params.projectId, req.body || {});
    res.json({ ok: true, project });
  } catch (error) {
    res.status(400).json({ ok: false, code: error.code || 'PROJECT_UPDATE_FAILED', message: error.message });
  }
});

app.delete('/api/projects/:projectId', async (req, res) => {
  try {
    await deleteProjectForUser(req.user.id, req.params.projectId);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, code: error.code || 'PROJECT_DELETE_FAILED', message: error.message });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    const requestBody = req.body || {};
    await assertGenerationAllowed(req.user);
    const projectId = String(requestBody.projectId || '');
    const project = projectId ? await getProjectForUser(req.user.id, projectId) : (await listProjectsForUser(req.user.id))[0];
    if (!project) {
      res.status(400).json({ ok: false, code: 'PROJECT_REQUIRED', message: '请先创建项目档案。' });
      return;
    }
    const requestWithMemory = {
      ...requestBody,
      projectProfile: project.profile,
    };
    const { system, user, definition, agent, knowledge } = await buildPrompt(requestWithMemory);
    const draftResult = await callOpenAICompatible([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    const result = await reviewAndImproveResult({
      definition,
      agent,
      knowledge,
      requestBody: requestWithMemory,
      draftResult,
    });
    await recordGeneration(req.user.id, project.id, definition.id);
    res.json({ ok: true, module: definition, result });
  } catch (error) {
    const status = error.code === 'API_NOT_CONFIGURED' ? 400 : 500;
    res.status(status).json({
      ok: false,
      code: error.code || 'GENERATION_FAILED',
      message: error.message,
    });
  }
});

async function reviewAndImproveResult({ definition, agent, knowledge, requestBody, draftResult }) {
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
    const reviewedResult = await callOpenAICompatible([
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

if (env.nodeEnv === 'production') {
  const distDir = path.resolve(__dirname, '..', 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }
}

app.listen(env.port, env.host, () => {
  console.log(`IP commerce generator server running on http://${env.host}:${env.port}`);
});
