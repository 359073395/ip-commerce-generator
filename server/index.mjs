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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors());
app.use(requireBasicAuth);
app.use(express.json({ limit: '2mb' }));

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

app.get('/api/knowledge/verify', async (_req, res) => {
  res.json(await verifyKnowledgeFiles());
});

app.post('/api/config/models', async (req, res) => {
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

app.post('/api/config', async (req, res) => {
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

app.post('/api/generate', async (req, res) => {
  try {
    const requestBody = req.body || {};
    const { system, user, definition, agent, knowledge } = await buildPrompt(requestBody);
    const draftResult = await callOpenAICompatible([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    const result = await reviewAndImproveResult({
      definition,
      agent,
      knowledge,
      requestBody,
      draftResult,
    });
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
      context: requestBody.context || {},
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
