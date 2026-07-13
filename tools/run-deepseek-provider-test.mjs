import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-deepseek-'));
const temporaryEnvFile = path.join(temporaryDir, '.env');
let primaryRequests = 0;
let deepseekRequests = 0;

const primaryServer = http.createServer(async (req, res) => {
  if (req.url === '/v1/chat/completions') {
    primaryRequests += 1;
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'primary rate limit' } }));
    return;
  }
  res.writeHead(404).end();
});

const deepseekServer = http.createServer(async (req, res) => {
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }));
    return;
  }
  if (req.url === '/v1/chat/completions') {
    deepseekRequests += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      model: 'deepseek-chat',
      choices: [{
        message: {
          content: JSON.stringify({
            module: 'DeepSeek测试',
            summary: 'DeepSeek跨服务接管成功。',
            sections: [],
            tables: [],
            scripts: [],
            nextActions: [],
            riskNotes: [],
          }),
        },
      }],
    }));
    return;
  }
  res.writeHead(404).end();
});

await Promise.all([
  listen(primaryServer),
  listen(deepseekServer),
]);
const primaryAddress = primaryServer.address();
const deepseekAddress = deepseekServer.address();

process.env.APP_ENV_FILE = temporaryEnvFile;
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${primaryAddress.port}/v1`;
process.env.OPENAI_API_KEY = 'primary-test-key';
process.env.OPENAI_MODEL = 'primary-model';
process.env.OPENAI_FALLBACK_MODELS = '';
process.env.DEEPSEEK_ENABLED = 'false';
process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${deepseekAddress.port}/v1`;
process.env.DEEPSEEK_API_KEY = '';
process.env.DEEPSEEK_MODEL = 'deepseek-chat';
process.env.OPENAI_TIMEOUT_MS = '2000';
process.env.DEEPSEEK_TIMEOUT_MS = '2000';

const config = await import('../server/config/env.mjs');
const { callOpenAICompatible } = await import('../server/providers/openaiCompatible.mjs');

try {
  const detected = await config.detectDeepSeekModels({
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    apiKey: 'deepseek-test-key',
  });
  assert.deepEqual(detected.models, ['deepseek-chat', 'deepseek-reasoner']);

  const fallbackStatus = config.setDeepSeekConfig({
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    apiKey: 'deepseek-test-key',
    model: 'deepseek-chat',
    mode: 'fallback',
    enabled: true,
  });
  assert.equal(fallbackStatus.providers.deepseek.enabled, true);
  assert.equal(fallbackStatus.providers.deepseek.hasApiKey, true);
  assert.equal(JSON.stringify(fallbackStatus).includes('deepseek-test-key'), false, 'API status must not expose the DeepSeek key');

  const fallbackEvents = [];
  let fallbackMetadata;
  const fallbackResult = await callOpenAICompatible([{ role: 'user', content: 'test fallback' }], {
    onModelEvent: (event) => fallbackEvents.push(event),
    onModelResolved: (metadata) => { fallbackMetadata = metadata; },
  });
  assert.equal(fallbackResult.summary, 'DeepSeek跨服务接管成功。');
  assert.equal(fallbackMetadata.provider, 'deepseek');
  assert.equal(fallbackMetadata.crossProviderFallback, true);
  assert.ok(fallbackEvents.some((event) => event.type === 'fallback' && event.nextProvider === 'deepseek'));
  assert.equal(primaryRequests, 1);
  assert.equal(deepseekRequests, 1);

  config.setDeepSeekConfig({
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    apiKey: '',
    model: 'deepseek-chat',
    mode: 'primary',
    enabled: true,
  });
  const primaryCountBeforePriorityTest = primaryRequests;
  let priorityMetadata;
  await callOpenAICompatible([{ role: 'user', content: 'test priority' }], {
    onModelResolved: (metadata) => { priorityMetadata = metadata; },
  });
  assert.equal(priorityMetadata.provider, 'deepseek');
  assert.equal(priorityMetadata.fallbackUsed, false);
  assert.equal(primaryRequests, primaryCountBeforePriorityTest, 'DeepSeek priority mode should not call the primary API first');

  const disabledStatus = config.disableDeepSeekConfig();
  assert.equal(disabledStatus.providers.deepseek.enabled, false);
  const persisted = await fs.readFile(temporaryEnvFile, 'utf8');
  assert.ok(persisted.includes('DEEPSEEK_ENABLED="false"'));

  console.log(JSON.stringify({
    ok: true,
    detectedModels: detected.models,
    fallbackProvider: fallbackMetadata.provider,
    priorityProvider: priorityMetadata.provider,
    primaryRequests,
    deepseekRequests,
    message: 'DeepSeek configuration, detection, cross-provider fallback, priority mode, and secret-safe status passed.',
  }, null, 2));
} finally {
  await Promise.all([close(primaryServer), close(deepseekServer)]);
  await fs.rm(temporaryDir, { recursive: true, force: true });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
