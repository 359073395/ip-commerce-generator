import { useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { apiRequest } from '../../api/client.js';

const defaultDeepSeekBaseUrl = 'https://api.deepseek.com/v1';
const defaultDeepSeekModels = ['deepseek-chat', 'deepseek-reasoner'];

export function ModelSettingsModal({ health, onConfigured, onClose }) {
  const primaryStatus = health?.api?.providers?.primary || {
    configured: health?.api?.configured,
    baseUrl: health?.api?.baseUrl,
    model: health?.api?.model,
    hasApiKey: health?.api?.hasApiKey,
  };
  const deepseekStatus = health?.api?.providers?.deepseek || {};
  const [activeProvider, setActiveProvider] = useState('primary');

  const [baseUrl, setBaseUrl] = useState(primaryStatus.baseUrl || '');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(primaryStatus.model || '');
  const [models, setModels] = useState(primaryStatus.model ? [primaryStatus.model] : []);
  const [primaryBusy, setPrimaryBusy] = useState('');
  const [primaryMessage, setPrimaryMessage] = useState('');
  const [primaryMessageType, setPrimaryMessageType] = useState(primaryStatus.configured ? 'ready' : 'info');

  const [deepseekBaseUrl, setDeepseekBaseUrl] = useState(deepseekStatus.baseUrl || defaultDeepSeekBaseUrl);
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [deepseekModel, setDeepseekModel] = useState(deepseekStatus.model || defaultDeepSeekModels[0]);
  const [deepseekModels, setDeepseekModels] = useState(uniqueModels([deepseekStatus.model, ...defaultDeepSeekModels]));
  const [deepseekMode, setDeepseekMode] = useState(deepseekStatus.mode || 'fallback');
  const [deepseekBusy, setDeepseekBusy] = useState('');
  const [deepseekMessage, setDeepseekMessage] = useState('');
  const [deepseekMessageType, setDeepseekMessageType] = useState(deepseekStatus.configured ? 'ready' : 'info');

  async function detectPrimaryModels() {
    setPrimaryBusy('detect');
    setPrimaryMessage('');
    try {
      const payload = await apiRequest('/api/config/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey }),
      });
      setBaseUrl(payload.baseUrl);
      setModels(payload.models);
      setModel((current) => (payload.models.includes(current) ? current : payload.models[0]));
      setPrimaryMessage(`检测到 ${payload.models.length} 个模型，请选择主模型。`);
      setPrimaryMessageType('ready');
    } catch (error) {
      setPrimaryMessage(error.message);
      setPrimaryMessageType('error');
    } finally {
      setPrimaryBusy('');
    }
  }

  async function savePrimaryConfig() {
    setPrimaryBusy('save');
    setPrimaryMessage('');
    try {
      const payload = await apiRequest('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey, model }),
      });
      onConfigured?.(payload.api);
      setPrimaryMessage('主 API 已保存并立即生效。');
      setPrimaryMessageType('ready');
    } catch (error) {
      setPrimaryMessage(error.message);
      setPrimaryMessageType('error');
    } finally {
      setPrimaryBusy('');
    }
  }

  async function detectDeepSeek() {
    setDeepseekBusy('detect');
    setDeepseekMessage('');
    try {
      const payload = await apiRequest('/api/config/deepseek/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: deepseekBaseUrl, apiKey: deepseekApiKey }),
      });
      const detectedModels = uniqueModels([...payload.models, ...defaultDeepSeekModels]);
      setDeepseekBaseUrl(payload.baseUrl);
      setDeepseekModels(detectedModels);
      setDeepseekModel((current) => (detectedModels.includes(current) ? current : detectedModels[0]));
      setDeepseekMessage(`DeepSeek 接口正常，检测到 ${payload.models.length} 个模型。`);
      setDeepseekMessageType('ready');
    } catch (error) {
      setDeepseekMessage(error.message);
      setDeepseekMessageType('error');
    } finally {
      setDeepseekBusy('');
    }
  }

  async function saveDeepSeek() {
    setDeepseekBusy('save');
    setDeepseekMessage('');
    try {
      const payload = await apiRequest('/api/config/deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: deepseekBaseUrl,
          apiKey: deepseekApiKey,
          model: deepseekModel,
          mode: deepseekMode,
          enabled: true,
        }),
      });
      onConfigured?.(payload.api);
      setDeepseekMessage(deepseekMode === 'primary' ? 'DeepSeek 已启用并设为优先调用。' : 'DeepSeek 已启用，主 API 异常时会自动接管。');
      setDeepseekMessageType('ready');
    } catch (error) {
      setDeepseekMessage(error.message);
      setDeepseekMessageType('error');
    } finally {
      setDeepseekBusy('');
    }
  }

  async function disableDeepSeek() {
    setDeepseekBusy('disable');
    setDeepseekMessage('');
    try {
      const payload = await apiRequest('/api/config/deepseek/disable', { method: 'POST' });
      onConfigured?.(payload.api);
      setDeepseekMessage('DeepSeek 已停用，已保存的配置仍保留。');
      setDeepseekMessageType('info');
    } catch (error) {
      setDeepseekMessage(error.message);
      setDeepseekMessageType('error');
    } finally {
      setDeepseekBusy('');
    }
  }

  const primaryCanSave = Boolean(baseUrl && apiKey && model && !primaryBusy);
  const deepseekCanSave = Boolean(
    deepseekBaseUrl && deepseekModel && (deepseekApiKey || deepseekStatus.hasApiKey) && !deepseekBusy,
  );

  return (
    <div className="modal-backdrop">
      <div className="settings-modal model-settings-modal">
        <div className="modal-header">
          <div>
            <h2>配置模型API</h2>
            <p className="settings-subtitle">主接口与 DeepSeek 使用独立密钥，故障时可跨服务切换。</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭配置">
            <X size={18} />
          </button>
        </div>

        <div className="provider-status-row">
          <ProviderStatus label="主 API" configured={primaryStatus.configured} detail={primaryStatus.model} />
          <ProviderStatus
            label="DeepSeek"
            configured={Boolean(deepseekStatus.configured && deepseekStatus.enabled)}
            detail={deepseekStatus.enabled ? deepseekStatus.model : deepseekStatus.configured ? '已配置 · 未启用' : ''}
          />
        </div>

        <div className="settings-tabs" role="tablist" aria-label="模型服务商">
          <button type="button" role="tab" aria-selected={activeProvider === 'primary'} className={activeProvider === 'primary' ? 'active' : ''} onClick={() => setActiveProvider('primary')}>
            主 API
          </button>
          <button type="button" role="tab" aria-selected={activeProvider === 'deepseek'} className={activeProvider === 'deepseek' ? 'active' : ''} onClick={() => setActiveProvider('deepseek')}>
            DeepSeek
          </button>
        </div>

        {activeProvider === 'primary' ? (
          <div className="provider-settings-section" role="tabpanel">
            <div className="settings-grid">
              <SettingsInput label="Base URL" value={baseUrl} placeholder="https://api.openai.com/v1" onChange={setBaseUrl} />
              <SettingsInput label="API Key" type="password" value={apiKey} placeholder={primaryStatus.hasApiKey ? '已配置，重新保存时需要再次输入' : 'sk-...'} onChange={setApiKey} />
              <button className="soft-button settings-detect" type="button" onClick={detectPrimaryModels} disabled={Boolean(primaryBusy) || !baseUrl || !apiKey}>
                {primaryBusy === 'detect' ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                {primaryBusy === 'detect' ? '检测中' : '检测模型'}
              </button>
              <ModelField model={model} models={models} onChange={setModel} />
            </div>
            <ConfigMessage message={primaryMessage} type={primaryMessageType} fallback={primaryStatus.configured ? `当前主模型：${primaryStatus.model}` : '填写主接口 URL 和 API Key 后检测模型。'} />
            <button className="primary-button full" type="button" onClick={savePrimaryConfig} disabled={!primaryCanSave}>
              {primaryBusy === 'save' ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
              {primaryBusy === 'save' ? '保存中' : '保存主 API'}
            </button>
          </div>
        ) : (
          <div className="provider-settings-section" role="tabpanel">
            <div className="settings-grid">
              <SettingsInput label="DeepSeek Base URL" value={deepseekBaseUrl} placeholder={defaultDeepSeekBaseUrl} onChange={setDeepseekBaseUrl} />
              <SettingsInput label="DeepSeek API Key" type="password" value={deepseekApiKey} placeholder={deepseekStatus.hasApiKey ? '已配置，可直接调整模型或调用顺序' : 'sk-...'} onChange={setDeepseekApiKey} />
              <button className="soft-button settings-detect" type="button" onClick={detectDeepSeek} disabled={Boolean(deepseekBusy) || !deepseekBaseUrl || !deepseekApiKey}>
                {deepseekBusy === 'detect' ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                {deepseekBusy === 'detect' ? '检测中' : '检测 DeepSeek 模型'}
              </button>
              <ModelField model={deepseekModel} models={deepseekModels} onChange={setDeepseekModel} />
              <div className="settings-field">
                <span>调用顺序</span>
                <div className="settings-segmented">
                  <button type="button" className={deepseekMode === 'fallback' ? 'active' : ''} onClick={() => setDeepseekMode('fallback')}>作为备用</button>
                  <button type="button" className={deepseekMode === 'primary' ? 'active' : ''} onClick={() => setDeepseekMode('primary')}>优先使用</button>
                </div>
                <small>{deepseekMode === 'fallback' ? '主 API 超时、限流或上游异常时自动切换。' : '优先调用 DeepSeek，失败后再回到主 API。'}</small>
              </div>
            </div>
            <ConfigMessage
              message={deepseekMessage}
              type={deepseekMessageType}
              fallback={deepseekStatus.enabled ? `已启用：${deepseekStatus.model} · ${deepseekStatus.mode === 'primary' ? '优先使用' : '备用接管'}` : deepseekStatus.configured ? 'DeepSeek 已配置但当前未启用。' : '填写 DeepSeek API Key 后即可启用。'}
            />
            <div className="settings-action-row">
              {deepseekStatus.configured && deepseekStatus.enabled ? (
                <button className="soft-button danger" type="button" onClick={disableDeepSeek} disabled={Boolean(deepseekBusy)}>
                  {deepseekBusy === 'disable' ? <Loader2 className="spin" size={16} /> : <X size={16} />}
                  停用 DeepSeek
                </button>
              ) : null}
              <button className="primary-button" type="button" onClick={saveDeepSeek} disabled={!deepseekCanSave}>
                {deepseekBusy === 'save' ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
                {deepseekBusy === 'save' ? '保存中' : '保存并启用 DeepSeek'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsInput({ label, type = 'text', value, placeholder, onChange }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ModelField({ model, models, onChange }) {
  return (
    <label className="settings-field">
      <span>模型</span>
      {models.length ? (
        <select value={model} onChange={(event) => onChange(event.target.value)}>
          {models.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      ) : (
        <input value={model} placeholder="检测模型，或手动输入模型名" onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function ProviderStatus({ label, configured, detail }) {
  return (
    <div className={`provider-status ${configured ? 'ready' : ''}`}>
      <span>{label}</span>
      <strong>{configured ? detail || '已配置' : '未启用'}</strong>
    </div>
  );
}

function ConfigMessage({ message, type, fallback }) {
  const text = message || fallback;
  return (
    <div className={`context-strip ${type === 'ready' ? 'ready' : ''} ${type === 'error' ? 'error' : ''}`}>
      <ShieldCheck size={18} />
      {text}
    </div>
  );
}

function uniqueModels(models) {
  return [...new Set((models || []).filter(Boolean))];
}
