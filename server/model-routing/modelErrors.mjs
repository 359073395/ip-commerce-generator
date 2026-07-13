export function createModelHttpError(status, responseText = '') {
  const detail = String(responseText || '').slice(0, 500);
  const error = new Error(`模型接口请求失败：${status}${detail ? ` ${detail}` : ''}`);
  error.status = Number(status || 0);
  if (status === 429) {
    error.code = 'MODEL_RATE_LIMIT';
    error.retryable = true;
  } else if (status === 408 || status === 425 || status >= 500) {
    error.code = 'MODEL_UPSTREAM_ERROR';
    error.retryable = true;
  } else if (status === 401 || status === 403) {
    error.code = 'MODEL_AUTH_FAILED';
    error.retryable = false;
  } else {
    error.code = 'MODEL_REQUEST_FAILED';
    error.retryable = false;
  }
  return error;
}

export function normalizeModelError(error) {
  if (error?.code) return error;
  const normalized = new Error(error?.message || '模型网络请求失败。');
  normalized.code = 'MODEL_NETWORK_ERROR';
  normalized.retryable = true;
  normalized.cause = error;
  return normalized;
}

export function isRetryableModelError(error) {
  return error?.retryable === true || ['MODEL_TIMEOUT', 'MODEL_RATE_LIMIT', 'MODEL_UPSTREAM_ERROR', 'MODEL_NETWORK_ERROR', 'MODEL_INVALID_RESPONSE'].includes(error?.code);
}

export function isCancellationError(error) {
  return error?.code === 'JOB_CANCELLED';
}
