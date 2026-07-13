export async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch (error) {
    const networkError = new Error('暂时无法连接服务器，系统会保留当前输入。');
    networkError.code = 'NETWORK_ERROR';
    networkError.cause = error;
    throw networkError;
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      const invalidResponse = new Error('服务器返回内容异常，请检查反向代理的 /api 配置。');
      invalidResponse.code = 'INVALID_API_RESPONSE';
      throw invalidResponse;
    }
  }

  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || `请求未完成（${response.status}）`);
    error.code = payload.code || 'REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }

  return payload;
}
