import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const envFilePath = path.join(rootDir, '.env');

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8790),
  host: process.env.HOST || '0.0.0.0',
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || '').replace(/\/$/, ''),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || '',
  openaiFallbackModels: parseModelList(process.env.OPENAI_FALLBACK_MODELS || process.env.OPENAI_FALLBACK_MODEL || ''),
};

export function getApiStatus() {
  return {
    configured: Boolean(env.openaiBaseUrl && env.openaiApiKey && env.openaiModel),
    baseUrl: env.openaiBaseUrl || null,
    model: env.openaiModel || null,
    fallbackModels: env.openaiFallbackModels,
    hasApiKey: Boolean(env.openaiApiKey),
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
  persistApiConfig();
  return getApiStatus();
}

function persistApiConfig() {
  const keys = new Set(['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL']);
  const existing = fs.existsSync(envFilePath)
    ? fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/)
    : [];
  const kept = existing.filter((line) => {
    const key = line.split('=')[0]?.trim();
    return key && !keys.has(key);
  });
  kept.push(`OPENAI_BASE_URL=${formatEnvValue(env.openaiBaseUrl)}`);
  kept.push(`OPENAI_API_KEY=${formatEnvValue(env.openaiApiKey)}`);
  kept.push(`OPENAI_MODEL=${formatEnvValue(env.openaiModel)}`);
  fs.writeFileSync(envFilePath, `${kept.join('\n')}\n`, 'utf8');
}

function formatEnvValue(value) {
  return JSON.stringify(String(value || ''));
}

function parseModelList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
