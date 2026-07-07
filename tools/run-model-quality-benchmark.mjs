import dotenv from 'dotenv';
import { runOfflineQualityBenchmark } from '../server/quality/benchmarkRunner.mjs';
import { loadQualityBenchmarkCases } from '../server/knowledge/loadKnowledge.mjs';
import { buildPrompt } from '../server/prompt-engine/buildPrompt.mjs';
import { evaluateResultQuality } from '../server/quality/evaluateResultQuality.mjs';

dotenv.config();

const realRun = process.env.RUN_REAL_MODEL_BENCHMARK === 'true';
const limit = Number(process.env.BENCHMARK_LIMIT || (realRun ? 5 : 0));

if (!realRun) {
  const result = await runOfflineQualityBenchmark({ limit });
  console.log(JSON.stringify({
    mode: 'offline',
    ...result,
    note: 'Set RUN_REAL_MODEL_BENCHMARK=true with OPENAI_API_KEY to compare real models on benchmark cases.',
  }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

const apiKey = process.env.OPENAI_API_KEY;
const baseUrl = process.env.OPENAI_BASE_URL;
const models = (process.env.COMPARE_MODELS || process.env.OPENAI_MODEL || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (!apiKey || !baseUrl || !models.length) {
  throw new Error('OPENAI_BASE_URL, OPENAI_API_KEY, and COMPARE_MODELS or OPENAI_MODEL are required for real model benchmark.');
}

const benchmark = await loadQualityBenchmarkCases();
const cases = benchmark.cases.slice(0, Math.max(1, limit || 5));
const modelResults = [];

for (const model of models) {
  const caseResults = [];
  for (const testCase of cases) {
    const started = Date.now();
    const prompt = await buildPrompt({
      moduleId: testCase.moduleId,
      formData: testCase.formData || {},
      selections: testCase.selections || [],
      context: { projectProfile: testCase.projectProfile || {}, agentGoal: testCase.name },
      projectProfile: testCase.projectProfile || {},
    });
    try {
      const content = await callModel({ baseUrl, apiKey, model, messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ] });
      const parsed = parseJson(content);
      const quality = evaluateResultQuality({
        result: parsed,
        definition: prompt.definition,
        knowledge: prompt.knowledge,
        requestBody: {
          formData: testCase.formData || {},
          selections: testCase.selections || [],
          context: { projectProfile: testCase.projectProfile || {}, agentGoal: testCase.name },
          projectProfile: testCase.projectProfile || {},
        },
      });
      caseResults.push({
        id: testCase.id,
        score: quality.score,
        level: quality.level,
        elapsedMs: Date.now() - started,
        passed: quality.score >= Number(testCase.minimumScore || 70),
        missing: quality.missing,
      });
    } catch (error) {
      caseResults.push({
        id: testCase.id,
        score: 0,
        level: 'failed',
        elapsedMs: Date.now() - started,
        passed: false,
        error: error.message,
      });
    }
  }
  modelResults.push({
    model,
    total: caseResults.length,
    passed: caseResults.filter((item) => item.passed).length,
    averageScore: Math.round(caseResults.reduce((sum, item) => sum + item.score, 0) / Math.max(1, caseResults.length)),
    averageLatencyMs: Math.round(caseResults.reduce((sum, item) => sum + item.elapsedMs, 0) / Math.max(1, caseResults.length)),
    cases: caseResults,
  });
}

console.log(JSON.stringify({
  mode: 'real-model',
  baseUrl,
  version: benchmark.version,
  comparedCases: cases.length,
  results: modelResults.sort((a, b) => b.averageScore - a.averageScore || a.averageLatencyMs - b.averageLatencyMs),
}, null, 2));

async function callModel({ baseUrl, apiKey, model, messages }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.OPENAI_TIMEOUT_MS || 45000));
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: Number(process.env.OPENAI_TEMPERATURE || 0.4),
        max_tokens: Number(process.env.OPENAI_MAX_TOKENS || 1200),
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
    return payload.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(content) {
  const cleaned = String(content || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(cleaned);
}
