import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  Download,
  FileText,
  Loader2,
  Moon,
  PanelLeft,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { modules, moduleMap } from './modules.js';

const SUB_CHOICE_SEPARATOR = '::';
const MULTI_CHOICE_SEPARATOR = '||';

function splitSelection(value = '') {
  const [choice = '', subChoice = ''] = String(value).split(SUB_CHOICE_SEPARATOR);
  return { choice, subChoice };
}

function splitMultiSelection(value = '') {
  return String(value).split(MULTI_CHOICE_SEPARATOR).filter(Boolean);
}

function selectionValue(group, option, subChoice) {
  if (group?.multiSelect) return option;
  const fallbackSubChoice = subChoice || group.subChoices?.[option]?.[0]?.label || '';
  return fallbackSubChoice ? `${option}${SUB_CHOICE_SEPARATOR}${fallbackSubChoice}` : option;
}

function optionsForGroup(module, selections, groupIndex) {
  const group = module.optionGroups?.[groupIndex];
  if (!group) return [];
  if (typeof group.dependsOn === 'number') {
    const parent = splitSelection(selections[group.dependsOn]).choice;
    return group.optionsByParent?.[parent] || [];
  }
  return group.options || [];
}

function defaultSelectionsFor(module) {
  const selections = [];
  for (let index = 0; index < (module.optionGroups?.length || 0); index += 1) {
    const group = module.optionGroups?.[index];
    const option = optionsForGroup(module, selections, index)[0] || '';
    selections[index] = group?.multiSelect ? '' : option ? selectionValue(group, option) : '';
  }
  return selections;
}

const initialSelections = Object.fromEntries(modules.map((module) => [module.id, defaultSelectionsFor(module)]));

function emptyFormState() {
  return Object.fromEntries(modules.map((module) => [module.id, {}]));
}

function serializeSelections(module, selections) {
  return (module.optionGroups || []).map((group, index) => {
    if (group.multiSelect) {
      const choices = splitMultiSelection(selections[index]);
      return {
        step: group.stepTitle || group.title,
        choices,
      };
    }
    const { choice, subChoice } = splitSelection(selections[index]);
    return {
      step: group.stepTitle || group.title,
      choice,
      subChoice,
    };
  }).filter((item) => item.choice || item.choices?.length);
}

function requiredFieldLabels(module, formData = {}) {
  return (module.formGroups || [])
    .filter((group) => group.required)
    .flatMap((group) => group.fields || [])
    .filter((field) => field[4]?.required !== false)
    .filter(([key]) => !String(formData[key] || '').trim())
    .map(([, label]) => label);
}

function App() {
  const [activeModule, setActiveModule] = useState('ip-positioning');
  const [forms, setForms] = useState(emptyFormState);
  const [selections, setSelections] = useState(initialSelections);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const module = moduleMap[activeModule];
  const currentResult = results[activeModule];
  const ipContext = results['ip-positioning']?.result || null;
  const isOriginalMode = module.frontendMode === 'original';

  function refreshHealth() {
    return fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, api: { configured: false } }));
  }

  useEffect(() => {
    refreshHealth();
  }, []);

  function selectModule(moduleId) {
    setActiveModule(moduleId);
    setError('');
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  const completion = useMemo(() => {
    const groups = module.formGroups || [];
    const fields = groups.flatMap((group) => group.fields);
    if (!fields.length) return 0;
    const filled = fields.filter(([key]) => Boolean(forms[activeModule]?.[key]?.trim())).length;
    return Math.round((filled / fields.length) * 100);
  }, [activeModule, forms, module]);

  function updateField(key, value) {
    setForms((prev) => ({
      ...prev,
      [activeModule]: {
        ...prev[activeModule],
        [key]: value,
      },
    }));
  }

  function updateSelection(groupIndex, value, subChoice = '') {
    setSelections((prev) => {
      const next = [...(prev[activeModule] || [])];
      const activeDefinition = moduleMap[activeModule];
      const activeGroup = activeDefinition.optionGroups?.[groupIndex];
      if (activeGroup?.multiSelect) {
        const current = splitMultiSelection(next[groupIndex]);
        const exists = current.includes(value);
        next[groupIndex] = (exists ? current.filter((item) => item !== value) : [...current, value]).join(MULTI_CHOICE_SEPARATOR);
      } else {
        next[groupIndex] = selectionValue(activeGroup, value, subChoice);
      }
      for (let index = groupIndex + 1; index < (activeDefinition.optionGroups?.length || 0); index += 1) {
        const group = activeDefinition.optionGroups[index];
        if (group.dependsOn === groupIndex) {
          const option = optionsForGroup(activeDefinition, next, index)[0] || '';
          next[index] = group.multiSelect ? '' : option ? selectionValue(group, option) : '';
        }
      }
      return { ...prev, [activeModule]: next };
    });
  }

  async function generate() {
    setError('');
    const missingFields = requiredFieldLabels(module, forms[activeModule] || {});
    if (missingFields.length) {
      setError(`请先填写：${missingFields.join('、')}。这些是结合知识库生成完整骨架的必要信息。`);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: activeModule,
          formData: forms[activeModule],
          selections: serializeSelections(module, selections[activeModule] || []),
          context: activeModule === 'ip-positioning' ? {} : { ipPositioning: ipContext },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || '生成失败');
      }
      setResults((prev) => ({
        ...prev,
        [activeModule]: { module, result: payload.result, generatedAt: new Date().toISOString() },
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function clearCurrent() {
    setForms((prev) => ({ ...prev, [activeModule]: {} }));
    setResults((prev) => {
      const next = { ...prev };
      delete next[activeModule];
      return next;
    });
    setError('');
  }

  function copyResult() {
    const text = JSON.stringify(currentResult?.result || {}, null, 2);
    navigator.clipboard?.writeText(text);
  }

  function exportMarkdown() {
    if (!currentResult?.result) return;
    const lines = [`# ${module.name}`, '', currentResult.result.summary || ''];
    for (const section of currentResult.result.sections || []) {
      lines.push('', `## ${section.title}`);
      for (const item of section.items || []) lines.push(`- ${item}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${module.name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isOriginalMode) {
    return (
      <div className="original-app-shell">
        <TopBar module={module} health={health} onSettings={() => setSettingsOpen(true)} originalMode />
        <div className="original-body">
          <ModuleRail
            activeModule={activeModule}
            onSelect={selectModule}
            items={modules.filter((item) => item.frontendMode === 'original')}
            originalMode
          />
          <main className="workspace original-workspace">
            <div className="workspace-grid original-workspace-grid">
              <section className="input-panel original-input-panel">
                <FormGroups module={module} values={forms[activeModule] || {}} onChange={updateField} />
                <OptionGroups module={module} selections={selections[activeModule] || []} onChange={updateSelection} />
                {error && <ErrorBox message={error} />}
                <ActionBar
                  loading={loading}
                  apiConfigured={health?.api?.configured}
                  primaryLabel={module.generateLabel}
                  onGenerate={generate}
                  onClear={clearCurrent}
                  onCopy={copyResult}
                  onExport={exportMarkdown}
                  hasResult={Boolean(currentResult)}
                />
              </section>

              <ResultPanel module={module} result={currentResult?.result} loading={loading} error={error} />
            </div>
          </main>
        </div>
        {settingsOpen && (
          <SettingsModal
            health={health}
            onConfigured={(api) => setHealth((prev) => ({ ...(prev || {}), api }))}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <OuterSidebar health={health} onSettings={() => setSettingsOpen(true)} />
      <ModuleRail activeModule={activeModule} onSelect={selectModule} />

      <main className="workspace">
        <TopBar module={module} health={health} onSettings={() => setSettingsOpen(true)} />
        <div className="workspace-grid">
          <section className="input-panel">
            <ModuleHeader module={module} completion={completion} hasContext={Boolean(ipContext)} />
            {module.inherited && module.frontendMode !== 'original' && <InheritedContext hasContext={Boolean(ipContext)} />}
            <OptionGroups module={module} selections={selections[activeModule] || []} onChange={updateSelection} />
            <FormGroups module={module} values={forms[activeModule] || {}} onChange={updateField} />
            {error && <ErrorBox message={error} />}
            <ActionBar
              loading={loading}
              apiConfigured={health?.api?.configured}
              primaryLabel={module.generateLabel}
              onGenerate={generate}
              onClear={clearCurrent}
              onCopy={copyResult}
              onExport={exportMarkdown}
              hasResult={Boolean(currentResult)}
            />
          </section>

          <ResultPanel module={module} result={currentResult?.result} loading={loading} error={error} />
        </div>
      </main>

      {settingsOpen && (
        <SettingsModal
          health={health}
          onConfigured={(api) => setHealth((prev) => ({ ...(prev || {}), api }))}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function OuterSidebar({ health, onSettings }) {
  return (
    <aside className="outer-sidebar">
      <div className="brand">
        <div className="brand-mark">创</div>
        <span>创作者工具</span>
      </div>
      <button className="outer-nav active">
        <Sparkles size={18} />
        新方案
      </button>
      <button className="outer-nav">
        <ClipboardCopy size={18} />
        我的结果
      </button>
      <button className="outer-nav">
        <Bot size={18} />
        我的创作
      </button>
      <div className="outer-spacer" />
      <div className="profile-row">
        <div className="avatar">你</div>
        <span>{health?.api?.configured ? 'API已配置' : 'API未配置'}</span>
        <Moon size={18} />
        <button className="icon-button" onClick={onSettings} aria-label="API设置">
          <Settings size={18} />
        </button>
      </div>
    </aside>
  );
}

function ModuleRail({ activeModule, onSelect, items = modules, originalMode = false }) {
  return (
    <nav className={`module-rail ${originalMode ? 'original-module-rail' : ''}`}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={`module-tab ${activeModule === item.id ? 'selected' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <Icon size={24} />
            <span>{item.name}</span>
          </button>
        );
      })}
    </nav>
  );

}

function TopBar({ module, health, onSettings, originalMode = false }) {
  if (originalMode) {
    return (
      <header className="topbar original-topbar">
        <div className="original-topbar-title">
          <h1>短视频文案创作</h1>
        </div>
        <button className="original-share-button" type="button" onClick={onSettings}>
          <Settings size={18} />
          配置API
        </button>
      </header>
    );
  }

  return (
    <header className="topbar">
      <div className="title-stack">
        <div className="crumb">
          <PanelLeft size={20} />
          <span>短视频文案创作</span>
        </div>
        <h1>{module.name}</h1>
      </div>
      <div className="top-actions">
        <span className={`status-pill ${health?.api?.configured ? 'ok' : 'warn'}`}>
          {health?.api?.configured ? 'API已配置' : 'API未配置'}
        </span>
        <button className="soft-button" onClick={onSettings}>
          <Settings size={16} />
          API设置
        </button>
      </div>
    </header>
  );
}

function ModuleHeader({ module, completion, hasContext }) {
  const isOriginalMode = module.frontendMode === 'original';
  const contextLabel = module.id === 'ip-positioning'
    ? '定位入口'
    : hasContext
      ? '已继承IP定位'
      : '等待定位上下文';

  return (
    <div className="module-header">
      <div>
        <p className="module-kicker">知识库驱动</p>
        <h2>{module.name}</h2>
        <p>{module.description}</p>
      </div>
      {!isOriginalMode && (
        <div className="completion">
          <span>{completion}%</span>
          <small>{contextLabel}</small>
        </div>
      )}
    </div>
  );
}

function InheritedContext({ hasContext }) {
  return (
    <div className={`context-strip ${hasContext ? 'ready' : ''}`}>
      <CheckCircle2 size={18} />
      {hasContext
        ? '已读取IP定位结果，当前模块会自动继承定位上下文。'
        : '建议先完成IP定位；当前模块仍可单独填写生成。'}
    </div>
  );
}

function OptionGroups({ module, selections, onChange }) {
  if (!module.optionGroups?.length) return null;
  if (module.frontendMode === 'original') {
    return (
      <div className="original-step-list">
        {module.optionGroups.map((group, groupIndex) => {
          const options = optionsForGroup(module, selections, groupIndex);
          if (!options.length) return null;
          return (
            <section className="original-step" key={group.title}>
              <div className="original-step-title">
                <FileText size={22} />
                <span>{group.stepTitle || `${groupIndex + 1}. ${group.title}`}</span>
              </div>
              <div className="original-card-list">
                {options.map((option) => {
                  const detail = group.details?.[option] || {};
                  const subChoices = group.subChoices?.[option] || [];
                  const selected = splitSelection(selections[groupIndex]);
                  const selectedChoices = splitMultiSelection(selections[groupIndex]);
                  const active = group.multiSelect ? selectedChoices.includes(option) : selected.choice === option;
                  return (
                    <div
                      key={option}
                      className={`original-choice-card ${group.multiSelect ? 'multi' : ''} ${active ? 'active' : ''}`}
                      onClick={() => onChange(groupIndex, option)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') onChange(groupIndex, option);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="original-card-heading">
                        {group.multiSelect && <span className="original-checkbox" aria-hidden="true" />}
                        <strong>{option}</strong>
                      </div>
                      {detail.subtitle && <span>{detail.subtitle}</span>}
                      {active && Boolean(subChoices.length) && (
                        <div className="original-subchoice-wrap" onClick={(event) => event.stopPropagation()}>
                          <p>分脚本选择（非必选）：</p>
                          <div className="original-subchoice-list">
                            {subChoices.map((item) => (
                              <button
                                key={item.label}
                                className={`original-subchoice ${selected.subChoice === item.label ? 'active' : ''}`}
                                type="button"
                                onClick={() => onChange(groupIndex, option, item.label)}
                              >
                                <span>{item.label}：{item.description}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {!subChoices.length && Boolean(detail.lines?.length) && (
                        <div className="original-choice-lines">
                          {detail.lines.map((line) => <p key={line}>{line}</p>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="section-block option-flow">
      <div className="section-title">原版选择</div>
      {module.optionGroups.map((group, groupIndex) => {
        const options = optionsForGroup(module, selections, groupIndex);
        if (!options.length) return null;
        return (
          <div className="option-group" key={group.title}>
            <div className="option-title">{group.title}</div>
            <div className={`option-grid ${group.variant === 'primary' ? 'primary-choice-grid' : ''}`}>
              {options.map((option) => (
                <button
                  key={option}
                  className={`choice ${selections[groupIndex] === option ? 'active' : ''}`}
                  onClick={() => onChange(groupIndex, option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FormGroups({ module, values, onChange }) {
  const visibleGroups = module.formGroups.filter((group) => !group.advanced);
  const advancedGroups = module.formGroups.filter((group) => group.advanced);

  return (
    <div className="form-groups">
      {visibleGroups.map((group) => (
        <FieldGroup key={group.title} group={group} values={values} onChange={onChange} />
      ))}
      {advancedGroups.length > 0 && (
        <details className="advanced-block">
          <summary>补充信息（选填）</summary>
          {advancedGroups.map((group) => (
            <FieldGroup key={group.title} group={group} values={values} onChange={onChange} compact />
          ))}
        </details>
      )}
    </div>
  );
}

function FieldGroup({ group, values, onChange, compact = false }) {
  if (group.original) {
    return (
      <div className="section-block original-input-block">
        {group.fields.map(([key, label, placeholder, , meta]) => (
          <label className="original-prompt" key={key}>
            <div className="original-optional-title">
              <FileText size={22} />
              <span>{label}</span>
              {group.required && meta?.required !== false && <em>必填</em>}
            </div>
            <textarea
              value={values[key] || ''}
              placeholder={placeholder}
              onChange={(event) => onChange(key, event.target.value)}
            />
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className={`section-block ${compact ? 'compact-fields' : ''}`}>
      <div className="section-title">{group.title}</div>
      <div className="field-table">
        {group.fields.map(([key, label, placeholder, choices, meta]) => {
          const fieldRequired = group.required && meta?.required !== false;
          if (choices?.length) {
            return (
              <div className="field-row" key={key}>
                <div className="field-label">{label}{fieldRequired && <em>必填</em>}</div>
                <div className="field-control">
                  <div className="field-choice-grid">
                    {choices.map((choice) => (
                      <button
                        type="button"
                        className={`field-choice ${values[key] === choice ? 'active' : ''}`}
                        key={choice}
                        onClick={() => onChange(key, choice)}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field-hint">{placeholder}</div>
              </div>
            );
          }
          return (
            <label className="field-row" key={key}>
              <div className="field-label">{label}{fieldRequired && <em>必填</em>}</div>
              <div className="field-control">
                <textarea value={values[key] || ''} placeholder={placeholder} onChange={(event) => onChange(key, event.target.value)} />
              </div>
              <div className="field-hint">需要具体信息时填写</div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ActionBar({ loading, apiConfigured, primaryLabel, onGenerate, onClear, onCopy, onExport, hasResult }) {
  return (
    <div className="action-bar">
      <button className="primary-button" onClick={onGenerate} disabled={loading}>
        {loading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
        {loading ? '生成中' : primaryLabel || '生成完整结果'}
      </button>
      <button className="soft-button" onClick={onGenerate} disabled={loading}>
        <RefreshCw size={16} />
        重新生成
      </button>
      <button className="soft-button" onClick={onCopy} disabled={!hasResult}>
        <ClipboardCopy size={16} />
        复制
      </button>
      <button className="soft-button" onClick={onExport} disabled={!hasResult}>
        <Download size={16} />
        导出
      </button>
      <button className="soft-button danger" onClick={onClear}>
        <Trash2 size={16} />
        清空
      </button>
      {!apiConfigured && <span className="inline-warning">API未配置，生成前请点击右上角配置API。</span>}
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div className="error-box">
      <CircleAlert size={18} />
      <span>{message}</span>
    </div>
  );
}

function ResultPanel({ module, result, loading, error }) {
  return (
    <aside className="result-panel">
      <div className="result-header">
        <div>
          <p className="module-kicker">生成结果</p>
          <h2>{module.name}输出</h2>
        </div>
        <Bot size={24} />
      </div>
      {loading && <StateMessage title="正在组装知识库提示词" body="后台会读取模块知识库、用户输入和输出结构，再调用模型。" />}
      {!loading && error && <StateMessage title="生成未完成" body="请根据左侧提示处理 API 或输入问题。" warning />}
      {!loading && !error && !result && <EmptyResult module={module} />}
      {!loading && result && <RenderedResult result={result} />}
    </aside>
  );
}

function EmptyResult({ module }) {
  return (
    <div className="empty-result">
      <Sparkles size={28} />
      <h3>等待生成完整骨架</h3>
      <p>{module.name}会输出完整结构，包括表格、脚本、行动建议和风险提醒。</p>
    </div>
  );
}

function StateMessage({ title, body, warning }) {
  return (
    <div className={`state-message ${warning ? 'warning' : ''}`}>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function RenderedResult({ result }) {
  return (
    <div className="rendered-result">
      <div className="summary-box">{result.summary}</div>
      {(result.sections || []).map((section) => (
        <div className="result-section" key={section.title}>
          <h3>{section.title}</h3>
          <ul>
            {(section.items || []).map((item, index) => (
              <li key={`${section.title}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      {(result.tables || []).map((table) => (
        <div className="result-section" key={table.title}>
          <h3>{table.title}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{(table.columns || []).map((column) => <th key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {(table.rows || []).map((row, index) => (
                  <tr key={`${table.title}-${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {(result.scripts || []).map((script) => (
        <div className="script-card" key={script.title}>
          <h3>{script.title}</h3>
          <p><strong>黄金3秒：</strong>{script.hook}</p>
          {(script.body || []).map((line, index) => <p key={index}>{line}</p>)}
          <p><strong>CTA：</strong>{script.cta}</p>
        </div>
      ))}
      {Boolean(result.nextActions?.length) && (
        <div className="result-section">
          <h3>下一步动作</h3>
          <ul>{result.nextActions.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      )}
      {Boolean(result.riskNotes?.length) && (
        <div className="risk-notes">
          <h3>风险提醒</h3>
          <ul>{result.riskNotes.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function SettingsModal({ health, onConfigured, onClose }) {
  const [baseUrl, setBaseUrl] = useState(health?.api?.baseUrl || '');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(health?.api?.model || '');
  const [models, setModels] = useState(health?.api?.model ? [health.api.model] : []);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(health?.api?.configured ? 'ready' : 'info');

  async function detectModels() {
    setDetecting(true);
    setMessage('');
    try {
      const response = await fetch('/api/config/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '模型检测失败');
      setBaseUrl(payload.baseUrl);
      setModels(payload.models);
      setModel((current) => (payload.models.includes(current) ? current : payload.models[0]));
      setMessage(`检测到 ${payload.models.length} 个模型，请选择一个用于生成。`);
      setMessageType('ready');
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    } finally {
      setDetecting(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey, model }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '保存失败');
      onConfigured?.(payload.api);
      setMessage('API 配置已保存，当前服务已立即生效。');
      setMessageType('ready');
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="settings-modal">
        <div className="modal-header">
          <h2>配置API</h2>
          <button className="icon-button" onClick={onClose}>x</button>
        </div>
        <div className="settings-grid">
          <label className="settings-field">
            <span>Base URL</span>
            <input
              value={baseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>API Key</span>
            <input
              type="password"
              value={apiKey}
              placeholder={health?.api?.hasApiKey ? '已配置，重新保存时需要再次输入' : 'sk-...'}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
          <button className="soft-button settings-detect" type="button" onClick={detectModels} disabled={detecting || !baseUrl || !apiKey}>
            {detecting ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            {detecting ? '检测中' : '检测模型'}
          </button>
          <label className="settings-field">
            <span>模型</span>
            {models.length ? (
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                {models.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            ) : (
              <input value={model} placeholder="先检测模型，或手动输入模型名" onChange={(event) => setModel(event.target.value)} />
            )}
          </label>
        </div>
        {message && (
          <div className={`context-strip ${messageType === 'ready' ? 'ready' : ''} ${messageType === 'error' ? 'error' : ''}`}>
            <ShieldCheck size={18} />
            {message}
          </div>
        )}
        {!message && (
          <div className={`context-strip ${health?.api?.configured ? 'ready' : ''}`}>
            <ShieldCheck size={18} />
            {health?.api?.configured ? `当前模型：${health.api.model}` : '填写 URL 和 API Key 后先检测模型，再保存配置。'}
          </div>
        )}
        <button className="primary-button full" onClick={saveConfig} disabled={saving || !baseUrl || !apiKey || !model}>
          {saving ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
          {saving ? '保存中' : '保存配置'}
        </button>
      </div>
    </div>
  );
}

export default App;
