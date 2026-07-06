import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { detectOpenAIModels, env, getApiStatus, setApiConfig } from './config/env.mjs';
import { buildPrompt } from './prompt-engine/buildPrompt.mjs';
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
    const { system, user, definition } = await buildPrompt(req.body || {});
    const result = await callOpenAICompatible([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
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
