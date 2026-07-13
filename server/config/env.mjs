import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const envFilePath = process.env.APP_ENV_FILE || path.join(rootDir, '.env');
const defaultOpenAIModel = 'gpt-5.6-sol';
const defaultDeepSeekBaseUrl = 'https://api.deepseek.com/v1';
const defaultDeepSeekModel = 'deepseek-chat';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8790),
  host: process.env.HOST || '0.0.0.0',
  appAuthEnabled: parseBoolean(process.env.APP_AUTH_ENABLED || 'false'),
  appAuthUser: process.env.APP_AUTH_USER || 'admin',
  appAuthPassword: process.env.APP_AUTH_PASSWORD || '',
  agentReviewEnabled: parseBoolean(process.env.AGENT_REVIEW_ENABLED || 'true'),
  agentReviewMaxTokens: Number(process.env.AGENT_REVIEW_MAX_TOKENS || process.env.OPENAI_MAX_TOKENS || 1200),
  agentReviewTimeoutMs: Number(process.env.AGENT_REVIEW_TIMEOUT_MS || 20000),
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || '').replace(/\/$/, ''),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || defaultOpenAIModel,
  openaiFallbackModels: parseModelList(process.env.OPENAI_FALLBACK_MODELS || process.env.OPENAI_FALLBACK_MODEL || ''),
  openaiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 45000),
  openaiFallbackTimeoutMs: Number(process.env.OPENAI_FALLBACK_TIMEOUT_MS || 30000),
  deepseekEnabled: parseBoolean(process.env.DEEPSEEK_ENABLED || 'false'),
  deepseekBaseUrl: normalizeBaseUrl(process.env.DEEPSEEK_BASE_URL || defaultDeepSeekBaseUrl),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekModel: process.env.DEEPSEEK_MODEL || defaultDeepSeekModel,
  deepseekMode: normalizeDeepSeekMode(process.env.DEEPSEEK_MODE || 'fallback'),
  deepseekTimeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS || 45000),
};

export function getApiStatus() {
  const primary = {
    configured: Boolean(env.openaiBaseUrl && env.openaiApiKey && env.openaiModel),
    baseUrl: env.openaiBaseUrl || null,
    model: env.openaiModel || null,
    fallbackModels: env.openaiFallbackModels,
    hasApiKey: Boolean(env.openaiApiKey),
  };
  const deepseek = {
    configured: Boolean(env.deepseekBaseUrl && env.deepseekApiKey && env.deepseekModel),
    enabled: env.deepseekEnabled,
    baseUrl: env.deepseekBaseUrl || defaultDeepSeekBaseUrl,
    model: env.deepseekModel || defaultDeepSeekModel,
    mode: env.deepseekMode,
    hasApiKey: Boolean(env.deepseekApiKey),
  };
  const deepseekActive = deepseek.enabled && deepseek.configured;
  const activeProvider = deepseekActive && (deepseek.mode === 'primary' || !primary.configured) ? 'deepseek' : 'primary';
  const active = activeProvider === 'deepseek' ? deepseek : primary;
  return {
    configured: primary.configured || deepseekActive,
    provider: activeProvider,
    baseUrl: active.baseUrl || null,
    model: active.model || null,
    fallbackModels: env.openaiFallbackModels,
    hasApiKey: Boolean(active.hasApiKey),
    providers: { primary, deepseek },
  };
}

export function normalizeBaseUrl(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

export async function detectOpenAIModels({ baseUrl, apiKey }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const token = String(apiKey || '').trim();
  if (!normalizedBaseUrl || !token) {
    const error = new Error('请先填写 Base URL 和 API Key。');
    error.code = 'INVALID_API_CONFIG';
    throw error;
  }

  const candidates = [normalizedBaseUrl];
  if (!/\/v1$/i.test(normalizedBaseUrl)) {
    candidates.push(`${normalizedBaseUrl}/v1`);
  }

  const errors = [];
  for (const candidate of candidates) {
    try {
      const response = await fetchWithTimeout(`${candidate}/models`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      if (!response.ok) {
        errors.push(`${candidate}/models -> ${response.status} ${text.slice(0, 160)}`);
        continue;
      }
      const payload = JSON.parse(text);
      const models = (payload.data || [])
        .map((item) => item?.id)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      if (!models.length) {
        errors.push(`${candidate}/models -> 没有返回可用模型`);
        continue;
      }
      return { baseUrl: candidate, models };
    } catch (error) {
      errors.push(`${candidate}/models -> ${error.message}`);
    }
  }

  const error = new Error(`模型检测失败。请确认 Base URL 是否兼容 OpenAI /v1，API Key 是否有效。${errors.join('；')}`);
  error.code = 'MODEL_DETECTION_FAILED';
  throw error;
}

export function detectDeepSeekModels({ baseUrl = defaultDeepSeekBaseUrl, apiKey }) {
  return detectOpenAIModels({ baseUrl, apiKey });
}

export function setApiConfig({ baseUrl, apiKey, model }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const token = String(apiKey || '').trim();
  const selectedModel = String(model || '').trim();
  if (!normalizedBaseUrl || !token || !selectedModel) {
    const error = new Error('请先填写 Base URL、API Key，并选择模型。');
    error.code = 'INVALID_API_CONFIG';
    throw error;
  }

  env.openaiBaseUrl = normalizedBaseUrl;
  env.openaiApiKey = token;
  env.openaiModel = selectedModel;
  process.env.OPENAI_BASE_URL = normalizedBaseUrl;
  process.env.OPENAI_API_KEY = token;
  process.env.OPENAI_MODEL = selectedModel;
  persistConfigValues({
    OPENAI_BASE_URL: env.openaiBaseUrl,
    OPENAI_API_KEY: env.openaiApiKey,
    OPENAI_MODEL: env.openaiModel,
  });
  return getApiStatus();
}

export function setDeepSeekConfig({ baseUrl, apiKey, model, mode = 'fallback', enabled = true }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl || defaultDeepSeekBaseUrl);
  const token = String(apiKey || env.deepseekApiKey || '').trim();
  const selectedModel = String(model || defaultDeepSeekModel).trim();
  const normalizedMode = normalizeDeepSeekMode(mode);
  if (!normalizedBaseUrl || !token || !selectedModel) {
    const error = new Error('请填写 DeepSeek API Key，并选择模型。');
    error.code = 'INVALID_DEEPSEEK_CONFIG';
    throw error;
  }

  env.deepseekEnabled = enabled !== false;
  env.deepseekBaseUrl = normalizedBaseUrl;
  env.deepseekApiKey = token;
  env.deepseekModel = selectedModel;
  env.deepseekMode = normalizedMode;
  process.env.DEEPSEEK_ENABLED = String(env.deepseekEnabled);
  process.env.DEEPSEEK_BASE_URL = normalizedBaseUrl;
  process.env.DEEPSEEK_API_KEY = token;
  process.env.DEEPSEEK_MODEL = selectedModel;
  process.env.DEEPSEEK_MODE = normalizedMode;
  persistConfigValues({
    DEEPSEEK_ENABLED: env.deepseekEnabled,
    DEEPSEEK_BASE_URL: env.deepseekBaseUrl,
    DEEPSEEK_API_KEY: env.deepseekApiKey,
    DEEPSEEK_MODEL: env.deepseekModel,
    DEEPSEEK_MODE: env.deepseekMode,
  });
  return getApiStatus();
}

export function disableDeepSeekConfig() {
  env.deepseekEnabled = false;
  process.env.DEEPSEEK_ENABLED = 'false';
  persistConfigValues({ DEEPSEEK_ENABLED: false });
  return getApiStatus();
}

function persistConfigValues(values) {
  const keys = new Set(Object.keys(values));
  const existing = fs.existsSync(envFilePath)
    ? fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/)
    : [];
  const kept = existing.filter((line) => {
    const key = line.split('=')[0]?.trim();
    return key && !keys.has(key);
  });
  for (const [key, value] of Object.entries(values)) {
    kept.push(`${key}=${formatEnvValue(value)}`);
  }
  fs.writeFileSync(envFilePath, `${kept.join('\n')}\n`, 'utf8');
}

function formatEnvValue(value) {
  return JSON.stringify(value === undefined || value === null ? '' : String(value));
}

function parseModelList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizeDeepSeekMode(value) {
  return String(value || '').trim().toLowerCase() === 'primary' ? 'primary' : 'fallback';
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
