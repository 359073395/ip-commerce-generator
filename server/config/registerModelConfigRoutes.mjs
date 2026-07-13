import {
  detectDeepSeekModels,
  detectOpenAIModels,
  disableDeepSeekConfig,
  setApiConfig,
  setDeepSeekConfig,
} from './env.mjs';

export function registerModelConfigRoutes(app, requireAdmin) {
  app.post('/api/config/models', requireAdmin, async (req, res) => {
    await detectModels(req, res, detectOpenAIModels);
  });

  app.post('/api/config', requireAdmin, async (req, res) => {
    saveConfig(req, res, setApiConfig, 'API_CONFIG_SAVE_FAILED');
  });

  app.post('/api/config/deepseek/models', requireAdmin, async (req, res) => {
    await detectModels(req, res, detectDeepSeekModels);
  });

  app.post('/api/config/deepseek', requireAdmin, async (req, res) => {
    saveConfig(req, res, setDeepSeekConfig, 'DEEPSEEK_CONFIG_SAVE_FAILED');
  });

  app.post('/api/config/deepseek/disable', requireAdmin, async (_req, res) => {
    res.json({ ok: true, api: disableDeepSeekConfig() });
  });
}

async function detectModels(req, res, detector) {
  try {
    const result = await detector(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({
      ok: false,
      code: error.code || 'MODEL_DETECTION_FAILED',
      message: error.message,
    });
  }
}

function saveConfig(req, res, save, fallbackCode) {
  try {
    const api = save(req.body || {});
    res.json({ ok: true, api });
  } catch (error) {
    res.status(400).json({
      ok: false,
      code: error.code || fallbackCode,
      message: error.message,
    });
  }
}
