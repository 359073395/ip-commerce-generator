import { env } from '../config/env.mjs';

export function buildModelAttempts(options = {}) {
  const primaryConfigured = Boolean(env.openaiBaseUrl && env.openaiApiKey && env.openaiModel);
  const deepseekConfigured = Boolean(
    env.deepseekEnabled && env.deepseekBaseUrl && env.deepseekApiKey && env.deepseekModel,
  );
  const primaryAttempts = primaryConfigured
    ? [env.openaiModel, ...env.openaiFallbackModels]
      .filter((model, index, list) => model && list.indexOf(model) === index)
      .map((model, index) => ({
        provider: 'primary',
        providerLabel: '主API',
        baseUrl: env.openaiBaseUrl,
        apiKey: env.openaiApiKey,
        model,
        timeoutMs: index === 0
          ? options.timeoutMs ?? env.openaiTimeoutMs
          : options.fallbackTimeoutMs ?? env.openaiFallbackTimeoutMs,
      }))
    : [];
  const deepseekAttempts = deepseekConfigured
    ? [{
        provider: 'deepseek',
        providerLabel: 'DeepSeek',
        baseUrl: env.deepseekBaseUrl,
        apiKey: env.deepseekApiKey,
        model: env.deepseekModel,
        timeoutMs: options.deepseekTimeoutMs ?? env.deepseekTimeoutMs,
      }]
    : [];
  const attempts = env.deepseekMode === 'primary'
    ? [...deepseekAttempts, ...primaryAttempts]
    : [...primaryAttempts, ...deepseekAttempts];
  return options.disableFallback ? attempts.slice(0, 1) : attempts;
}
