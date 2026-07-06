import { env } from '../config/env.mjs';

export async function callOpenAICompatible(messages) {
  if (!env.openaiBaseUrl || !env.openaiApiKey || !env.openaiModel) {
    const error = new Error('API 未配置，请先设置 OPENAI_BASE_URL、OPENAI_API_KEY、OPENAI_MODEL。');
    error.code = 'API_NOT_CONFIGURED';
    throw error;
  }

  const payload = {
    model: env.openaiModel,
    messages,
    temperature: Number(process.env.OPENAI_TEMPERATURE || 0.4),
    max_tokens: Number(process.env.OPENAI_MAX_TOKENS || 1200),
    reasoning_effort: process.env.OPENAI_REASONING_EFFORT || 'low',
    response_format: { type: 'json_object' },
  };

  const data = await requestWithModelFallback(payload);
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('模型接口没有返回内容。');
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

async function requestWithModelFallback(payload) {
  const models = [payload.model, ...env.openaiFallbackModels].filter((model, index, list) => model && list.indexOf(model) === index);
  let lastError;

  for (const model of models) {
    try {
      const response = await requestWithCompatibility({ ...payload, model });
      return await response.json();
    } catch (error) {
      lastError = error;
      const canTryNext = error.code === 'MODEL_TIMEOUT' && model !== models[models.length - 1];
      if (!canTryNext) throw error;
      console.warn(`Model ${model} timed out, trying fallback model.`);
    }
  }

  throw lastError;
}

async function requestWithCompatibility(payload) {
  let response = await requestChatCompletion(payload);
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 400 && /response_format|json_object|max_tokens|reasoning_effort/i.test(text)) {
      response = await requestChatCompletion({
        ...payload,
        response_format: undefined,
        max_tokens: undefined,
        reasoning_effort: undefined,
      });
    } else {
      throw new Error(`模型接口请求失败：${response.status} ${text.slice(0, 500)}`);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`模型接口请求失败：${response.status} ${text.slice(0, 500)}`);
  }

  return response;
}

async function requestChatCompletion(payload) {
  const body = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OPENAI_TIMEOUT_MS || 25000));

  try {
    return await fetch(`${env.openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('模型响应超时。已限制知识库长度后仍超时，建议换更快模型或调低输出规模。');
      timeoutError.code = 'MODEL_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
