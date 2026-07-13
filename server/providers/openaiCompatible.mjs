import { env } from '../config/env.mjs';
import {
  createModelHttpError,
  isRetryableModelError,
  normalizeModelError,
} from '../model-routing/modelErrors.mjs';
import { buildModelAttempts } from '../model-routing/modelRoutes.mjs';

export async function callOpenAICompatible(messages, options = {}) {
  const attempts = buildModelAttempts(options);
  if (!attempts.length) {
    const error = new Error('API 未配置，请先配置主API或启用 DeepSeek API。');
    error.code = 'API_NOT_CONFIGURED';
    throw error;
  }

  const payload = {
    model: attempts[0].model,
    messages,
    temperature: Number(options.temperature ?? process.env.OPENAI_TEMPERATURE ?? 0.4),
    max_tokens: Number(options.maxTokens ?? process.env.OPENAI_MAX_TOKENS ?? 1200),
    reasoning_effort: options.reasoningEffort ?? process.env.OPENAI_REASONING_EFFORT ?? 'low',
    response_format: { type: 'json_object' },
  };

  const { data, metadata } = await requestWithModelFallback(payload, options, attempts);
  notify(options.onModelResolved, metadata);
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    const error = new Error('模型接口没有返回内容。');
    error.code = 'MODEL_EMPTY_RESPONSE';
    throw error;
  }

  try {
    return JSON.parse(content);
  } catch {
    return {
      module: '模型结果',
      summary: '模型返回了非 JSON 内容，已按文本展示。',
      sections: [{ title: '原始结果', items: [content] }],
      tables: [],
      scripts: [],
      nextActions: [],
      riskNotes: ['建议检查当前模型是否支持 JSON 输出，或更换兼容 OpenAI API 的模型。'],
    };
  }
}

async function requestWithModelFallback(payload, options = {}, attempts = []) {
  let lastError;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const model = attempt.model;
    const timeoutMs = attempt.timeoutMs;
    const startedAt = Date.now();
    notify(options.onModelEvent, {
      type: 'attempt',
      provider: attempt.provider,
      providerLabel: attempt.providerLabel,
      model,
      attempt: index + 1,
      totalAttempts: attempts.length,
      timeoutMs,
    });

    try {
      const response = await requestWithCompatibility(
        { ...payload, model },
        { ...options, timeoutMs },
        attempt,
      );
      let data;
      try {
        data = await response.json();
      } catch (error) {
        const invalidResponse = new Error('模型接口返回了无法解析的数据。');
        invalidResponse.code = 'MODEL_INVALID_RESPONSE';
        invalidResponse.retryable = true;
        invalidResponse.cause = error;
        throw invalidResponse;
      }
      const metadata = {
        requestedModel: attempts[0].model,
        requestedProvider: attempts[0].provider,
        provider: attempt.provider,
        providerLabel: attempt.providerLabel,
        attemptedModel: model,
        actualModel: String(data.model || model),
        attempt: index + 1,
        fallbackUsed: index > 0,
        crossProviderFallback: attempt.provider !== attempts[0].provider,
        elapsedMs: Date.now() - startedAt,
      };
      notify(options.onModelEvent, { type: 'success', ...metadata });
      return { data, metadata };
    } catch (error) {
      lastError = normalizeModelError(error);
      notify(options.onModelEvent, {
        type: 'error',
        provider: attempt.provider,
        providerLabel: attempt.providerLabel,
        model,
        attempt: index + 1,
        code: lastError.code,
        message: lastError.message,
        elapsedMs: Date.now() - startedAt,
      });
      const hasNextModel = index < attempts.length - 1;
      if (!hasNextModel || !isRetryableModelError(lastError)) throw lastError;
      const nextAttempt = attempts[index + 1];
      notify(options.onModelEvent, {
        type: 'fallback',
        provider: attempt.provider,
        providerLabel: attempt.providerLabel,
        model,
        nextProvider: nextAttempt.provider,
        nextProviderLabel: nextAttempt.providerLabel,
        nextModel: nextAttempt.model,
        reason: lastError.code,
      });
      console.warn(`${attempt.providerLabel} model ${model} failed with ${lastError.code}, trying ${nextAttempt.providerLabel} model ${nextAttempt.model}.`);
    }
  }

  throw lastError;
}

async function requestWithCompatibility(payload, options = {}, connection) {
  let response = await requestChatCompletion(payload, options, connection);
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 400 && /response_format|json_object|max_tokens|reasoning_effort/i.test(text)) {
      response = await requestChatCompletion({
        ...payload,
        response_format: undefined,
        max_tokens: undefined,
        reasoning_effort: undefined,
      }, options, connection);
    } else {
      throw createModelHttpError(response.status, text);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw createModelHttpError(response.status, text);
  }

  return response;
}

async function requestChatCompletion(payload, options = {}, connection = {}) {
  const body = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Number(options.timeoutMs ?? process.env.OPENAI_TIMEOUT_MS ?? 25000));
  const abortFromCaller = () => controller.abort();
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    return await fetch(`${connection.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      if (options.signal?.aborted && !timedOut) {
        const cancelledError = new Error('任务已取消。');
        cancelledError.code = 'JOB_CANCELLED';
        cancelledError.retryable = false;
        throw cancelledError;
      }
      const timeoutError = new Error('模型响应超时。系统会自动尝试可用的备用模型。');
      timeoutError.code = 'MODEL_TIMEOUT';
      timeoutError.retryable = true;
      throw timeoutError;
    }
    throw normalizeModelError(error);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

function notify(callback, event) {
  if (typeof callback !== 'function') return;
  try {
    callback(event);
  } catch {
    // Observability callbacks must never break a model request.
  }
}
