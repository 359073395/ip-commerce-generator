import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bot,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  Download,
  FileText,
  LogOut,
  Loader2,
  Moon,
  PanelLeft,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { modules, moduleMap } from './modules.js';
import { GenerationProgress } from './features/generation/GenerationProgress.jsx';
import { useGenerationJob } from './features/generation/useGenerationJob.js';
import { loadProjectDraft, saveProjectDraft } from './features/drafts/projectDraftStorage.js';
import { ModelSettingsModal } from './features/settings/ModelSettingsModal.jsx';

const SUB_CHOICE_SEPARATOR = '::';
const MULTI_CHOICE_SEPARATOR = '||';

function formatRequestError(error, fallback = 'Request failed') {
  const message = String(error?.message || error || '').trim();
  if (/load failed|failed to fetch|networkerror|network error|fetch failed/i.test(message)) {
    return '\u65e0\u6cd5\u8fde\u63a5\u670d\u52a1\u5668\u63a5\u53e3\u3002\u8bf7\u68c0\u67e5\u57df\u540d\u53cd\u4ee3\u662f\u5426\u628a /api \u8f6c\u53d1\u5230\u540e\u7aef\u7aef\u53e3\uff0c\u6216\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5\u3002';
  }
  if (/unexpected token|json/i.test(message)) {
    return '\u670d\u52a1\u5668\u8fd4\u56de\u5185\u5bb9\u4e0d\u662f\u63a5\u53e3\u6570\u636e\u3002\u901a\u5e38\u662f /api \u88ab\u53cd\u4ee3\u5230\u4e86\u524d\u7aef\u9875\u9762\uff0c\u8bf7\u68c0\u67e5\u53cd\u4ee3\u89c4\u5219\u3002';
  }
  return message || fallback;
}

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

function restoreSelections(module, savedSelections = []) {
  const byStep = new Map((savedSelections || []).map((item) => [item.step, item]));
  return (module.optionGroups || []).map((group, index) => {
    const saved = byStep.get(group.stepTitle || group.title) || savedSelections[index] || {};
    if (group.multiSelect) {
      return Array.isArray(saved.choices) ? saved.choices.join(MULTI_CHOICE_SEPARATOR) : '';
    }
    return saved.choice ? selectionValue(group, saved.choice, saved.subChoice) : defaultSelectionsFor(module)[index] || '';
  });
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
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [agentGoal, setAgentGoal] = useState('');
  const [agentPlan, setAgentPlan] = useState(null);
  const [agentTask, setAgentTask] = useState(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [agentRun, setAgentRun] = useState(null);
  const [generationHistory, setGenerationHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [contentExperiments, setContentExperiments] = useState([]);
  const [experimentLoading, setExperimentLoading] = useState(false);
  const [experimentError, setExperimentError] = useState('');
  const [draftReadyKey, setDraftReadyKey] = useState('');

  const generationJobStorageKey = authUser?.id && activeProjectId
    ? `ip-commerce-generation-job:${authUser.id}:${activeProjectId}`
    : '';
  const agentJobStorageKey = authUser?.id && activeProjectId
    ? `ip-commerce-agent-job:${authUser.id}:${activeProjectId}`
    : '';
  const draftStorageKey = authUser?.id && activeProjectId
    ? `ip-commerce-project-draft:${authUser.id}:${activeProjectId}`
    : '';

  const generationJob = useGenerationJob({
    storageKey: generationJobStorageKey,
    onCompleted: (job) => {
      const payload = job.result || {};
      const moduleId = payload.module?.id || job.moduleId;
      if (!moduleId || !payload.result) return;
      setResults((previous) => ({
        ...previous,
        [moduleId]: {
          module: payload.module || moduleMap[moduleId],
          result: payload.result,
          generatedAt: job.completedAt || new Date().toISOString(),
          recordId: payload.record?.id,
        },
      }));
      refreshGenerationHistory();
    },
  });

  const agentGenerationJob = useGenerationJob({
    storageKey: agentJobStorageKey,
    onCompleted: (job) => {
      const payload = job.result || {};
      setAgentPlan(payload.plan || null);
      setAgentRun(payload.run || null);
      const completedSteps = (payload.steps || []).filter((step) => step.status === 'completed' && step.result);
      if (!completedSteps.length) return;
      const resultUpdates = {};
      for (const step of completedSteps) {
        const stepModule = moduleMap[step.moduleId];
        if (!stepModule) continue;
        resultUpdates[step.moduleId] = {
          module: stepModule,
          result: step.result,
          generatedAt: step.completedAt || job.completedAt || new Date().toISOString(),
          recordId: step.recordId,
        };
      }
      setResults((previous) => ({ ...previous, ...resultUpdates }));
      const lastStep = completedSteps[completedSteps.length - 1];
      if (moduleMap[lastStep.moduleId]) setActiveModule(lastStep.moduleId);
      refreshGenerationHistory();
    },
  });

  const loading = generationJob.isActive;
  const agentRunLoading = agentGenerationJob.isActive;
  const agentRunError = agentGenerationJob.error;
  const generationError = error || generationJob.error;

  const module = moduleMap[activeModule];
  const currentResult = results[activeModule];
  const ipContext = results['ip-positioning']?.result || null;
  const isOriginalMode = module.frontendMode === 'original';
  const activeProject = projects.find((item) => item.id === activeProjectId) || projects[0] || null;
  const projectProfile = activeProject?.profile || null;

  function refreshHealth() {
    return fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, api: { configured: false } }));
  }

  function refreshProjects(preferredProjectId = activeProjectId) {
    return fetch('/api/projects')
      .then((res) => {
        if (res.status === 401) throw new Error('AUTH_REQUIRED');
        return res.json();
      })
      .then((payload) => {
        const nextProjects = payload.projects || [];
        setProjects(nextProjects);
        const storedProjectId = window.localStorage?.getItem('ip-commerce-project-id') || '';
        const nextProjectId = [preferredProjectId, storedProjectId, nextProjects[0]?.id]
          .find((id) => id && nextProjects.some((project) => project.id === id)) || '';
        setActiveProjectId(nextProjectId);
        if (nextProjectId) window.localStorage?.setItem('ip-commerce-project-id', nextProjectId);
        return nextProjects;
      })
      .catch((err) => {
        if (err.message === 'AUTH_REQUIRED') setAuthUser(null);
        setProjects([]);
      });
  }

  async function refreshSession() {
    setAuthLoading(true);
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        setAuthUser(null);
        return;
      }
      const payload = await response.json();
      setAuthUser(payload.user);
      await Promise.all([refreshHealth(), refreshProjects()]);
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    refreshSession();
  }, []);

  useEffect(() => {
    if (!authUser || !activeProjectId || !activeModule) return;
    refreshGenerationHistory();
    refreshContentExperiments();
  }, [authUser?.id, activeProjectId, activeModule]);

  useEffect(() => {
    setDraftReadyKey('');
    if (!draftStorageKey) return;
    const saved = loadProjectDraft(draftStorageKey);
    setForms({ ...emptyFormState(), ...(saved?.forms || {}) });
    setSelections({ ...initialSelections, ...(saved?.selections || {}) });
    setAgentGoal(saved?.agentGoal || '');
    if (saved?.activeModule && moduleMap[saved.activeModule]) setActiveModule(saved.activeModule);
    setDraftReadyKey(draftStorageKey);
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey || draftReadyKey !== draftStorageKey) return undefined;
    const timer = window.setTimeout(() => {
      saveProjectDraft(draftStorageKey, {
        activeModule,
        forms,
        selections,
        agentGoal,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftStorageKey, draftReadyKey, activeModule, forms, selections, agentGoal]);

  async function handleLogin(user) {
    setAuthUser(user);
    await Promise.all([refreshHealth(), refreshProjects()]);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthUser(null);
    setProjects([]);
    setActiveProjectId('');
    setResults({});
  }

  function selectModule(moduleId) {
    setActiveModule(moduleId);
    setError('');
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  async function runAgentPlanner() {
    setAgentLoading(true);
    setAgentError('');
    try {
      const response = await fetch('/api/agent/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: agentGoal,
          projectId: activeProjectId,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '智能任务规划失败');
      setAgentPlan(payload.plan);
      setAgentTask(payload.task);
    } catch (error) {
      setAgentError(formatRequestError(error, '智能任务规划失败'));
    } finally {
      setAgentLoading(false);
    }
  }

  function applyAgentPlan(plan = agentPlan) {
    const moduleId = plan?.recommendedModuleId;
    if (!moduleId || !moduleMap[moduleId]) return;
    setActiveModule(moduleId);
    if (plan.suggestedFormData) {
      setForms((prev) => ({
        ...prev,
        [moduleId]: {
          ...(prev[moduleId] || {}),
          ...plan.suggestedFormData,
        },
      }));
    }
    setError('');
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  async function runAgentAutoChain() {
    setError('');
    try {
      await agentGenerationJob.start('/api/jobs/agent-run', {
        goal: agentGoal,
        projectId: activeProjectId,
        maxSteps: 4,
      });
    } catch (error) {
      setError(formatRequestError(error, 'Agent自动执行失败'));
    }
  }

  async function refreshGenerationHistory() {
    if (!activeProjectId || !activeModule) return [];
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        projectId: activeProjectId,
        moduleId: activeModule,
        limit: '12',
      });
      const response = await fetch(`/api/generations?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '读取历史记录失败');
      setGenerationHistory(payload.records || []);
      return payload.records || [];
    } catch {
      setGenerationHistory([]);
      return [];
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshContentExperiments() {
    if (!activeProjectId) return [];
    setExperimentLoading(true);
    try {
      const params = new URLSearchParams({
        projectId: activeProjectId,
        limit: '20',
      });
      const response = await fetch(`/api/content-experiments?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '读取内容实验失败');
      setContentExperiments(payload.experiments || []);
      return payload.experiments || [];
    } catch (error) {
      setExperimentError(formatRequestError(error));
      return [];
    } finally {
      setExperimentLoading(false);
    }
  }

  async function createContentExperiment() {
    if (!currentResult?.recordId) {
      setExperimentError('请先生成一次内容，系统会基于生成记录创建发布前实验。');
      return null;
    }
    setExperimentLoading(true);
    setExperimentError('');
    try {
      const response = await fetch('/api/content-experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId,
          generationRecordId: currentResult.recordId,
          moduleId: activeModule,
          title: currentResult.result?.summary || module.name,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '创建内容实验失败');
      await refreshContentExperiments();
      return payload.experiment;
    } catch (error) {
      setExperimentError(formatRequestError(error));
      return null;
    } finally {
      setExperimentLoading(false);
    }
  }

  async function reviewContentExperiment(experimentId, reviewData) {
    setExperimentLoading(true);
    setExperimentError('');
    try {
      const response = await fetch(`/api/content-experiments/${experimentId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewData),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '保存复盘失败');
      await refreshContentExperiments();
      return payload.experiment;
    } catch (error) {
      setExperimentError(formatRequestError(error));
      return null;
    } finally {
      setExperimentLoading(false);
    }
  }

  function applyGenerationRecord(record) {
    const moduleId = record?.moduleId;
    const targetModule = moduleMap[moduleId];
    if (!record || !targetModule) return;
    setActiveModule(moduleId);
    setForms((prev) => ({
      ...prev,
      [moduleId]: {
        ...(prev[moduleId] || {}),
        ...(record.request?.formData || {}),
      },
    }));
    setSelections((prev) => ({
      ...prev,
      [moduleId]: restoreSelections(targetModule, record.request?.selections || []),
    }));
    setResults((prev) => ({
      ...prev,
      [moduleId]: {
        module: targetModule,
        result: record.result,
        generatedAt: record.createdAt,
        recordId: record.id,
      },
    }));
    setError('');
  }

  async function applyProfileSuggestions(suggestions) {
    if (!activeProject || !suggestions?.draftProfile) return;
    setError('');
    try {
      const nextProfile = {
        ...(activeProject.profile || {}),
        ...suggestions.draftProfile,
      };
      const response = await fetch(`/api/projects/${activeProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: activeProject.name,
          profile: nextProfile,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '项目档案更新失败');
      await refreshProjects(payload.project?.id || activeProject.id);
      setResults((prev) => {
        const current = prev[activeModule];
        if (!current?.result) return prev;
        return {
          ...prev,
          [activeModule]: {
            ...current,
            result: {
              ...current.result,
              profileSuggestions: {
                ...(current.result.profileSuggestions || {}),
                appliedAt: new Date().toISOString(),
              },
            },
          },
        };
      });
    } catch (error) {
      setError(formatRequestError(error));
    }
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

    try {
      await generationJob.start('/api/jobs/generate', {
        moduleId: activeModule,
        projectId: activeProjectId,
        formData: forms[activeModule],
        selections: serializeSelections(module, selections[activeModule] || []),
        context: activeModule === 'ip-positioning' ? {} : { ipPositioning: ipContext },
      });
    } catch (err) {
      setError(formatRequestError(err));
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
    generationJob.dismiss();
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
    if (authLoading) return <BootScreen />;
    if (!authUser) return <LoginScreen onLogin={handleLogin} />;
    return (
      <div className="original-app-shell">
        <TopBar
          module={module}
          health={health}
          projectProfile={projectProfile}
          projects={projects}
          activeProjectId={activeProjectId}
          authUser={authUser}
          onProjectChange={(projectId) => {
            setActiveProjectId(projectId);
            window.localStorage?.setItem('ip-commerce-project-id', projectId);
          }}
          onSettings={() => setSettingsOpen(true)}
          onProjectProfile={() => setProfileOpen(true)}
          onAdmin={() => setAdminOpen(true)}
          onLogout={logout}
          originalMode
        />
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
                {activeModule === 'operation-plan' && (
                  <AgentPlannerPanel
                    goal={agentGoal}
                    onGoalChange={setAgentGoal}
                    plan={agentPlan}
                    task={agentTask}
                    loading={agentLoading}
                    error={agentError}
                    run={agentRun}
                    runLoading={agentRunLoading}
                    runError={agentRunError}
                    runJob={agentGenerationJob.job}
                    runElapsedSeconds={agentGenerationJob.elapsedSeconds}
                    runConnectionError={agentGenerationJob.connectionError}
                    onPlan={runAgentPlanner}
                    onApply={applyAgentPlan}
                    onRun={runAgentAutoChain}
                    onCancelRun={agentGenerationJob.cancel}
                    onRetryRun={agentGenerationJob.retry}
                  />
                )}
                <FormGroups module={module} values={forms[activeModule] || {}} onChange={updateField} />
                <OptionGroups module={module} selections={selections[activeModule] || []} onChange={updateSelection} />
                {generationError && !generationJob.job && <ErrorBox message={generationError} />}
                <GenerationProgress
                  job={generationJob.job}
                  elapsedSeconds={generationJob.elapsedSeconds}
                  connectionError={generationJob.connectionError}
                  onCancel={generationJob.cancel}
                  onRetry={generationJob.retry}
                />
                <ActionBar
                  loading={loading}
                  apiConfigured={health?.api?.configured}
                  canConfigureApi={authUser?.role === 'admin'}
                  primaryLabel={module.generateLabel}
                  onGenerate={generate}
                  onClear={clearCurrent}
                  onCopy={copyResult}
                  onExport={exportMarkdown}
                  hasResult={Boolean(currentResult)}
                />
              </section>

              <ResultPanel
                module={module}
                result={currentResult?.result}
                loading={loading}
                error={generationError}
                job={generationJob.job}
                elapsedSeconds={generationJob.elapsedSeconds}
                history={generationHistory}
                historyLoading={historyLoading}
                onRefreshHistory={refreshGenerationHistory}
                onLoadHistory={applyGenerationRecord}
                onApplyProfileSuggestions={applyProfileSuggestions}
                experiments={contentExperiments}
                experimentLoading={experimentLoading}
                experimentError={experimentError}
                onCreateExperiment={createContentExperiment}
                onReviewExperiment={reviewContentExperiment}
                onRefreshExperiments={refreshContentExperiments}
              />
            </div>
          </main>
        </div>
        {settingsOpen && authUser?.role === 'admin' && (
          <ModelSettingsModal
            health={health}
            onConfigured={(api) => setHealth((prev) => ({ ...(prev || {}), api }))}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {profileOpen && (
          <ProjectProfileModal
            profile={projectProfile}
            project={activeProject}
            ipContext={ipContext}
            onSaved={(project) => {
              refreshProjects(project.id);
              refreshHealth();
            }}
            onClose={() => setProfileOpen(false)}
          />
        )}
        {adminOpen && authUser?.role === 'admin' && <EnhancedAdminUsersModal onClose={() => setAdminOpen(false)} />}
      </div>
    );
  }

  if (authLoading) return <BootScreen />;
  if (!authUser) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="app-shell">
      <OuterSidebar
        health={health}
        projectProfile={projectProfile}
        authUser={authUser}
        onSettings={() => setSettingsOpen(true)}
        onProjectProfile={() => setProfileOpen(true)}
        onAdmin={() => setAdminOpen(true)}
      />
      <ModuleRail activeModule={activeModule} onSelect={selectModule} />

      <main className="workspace">
        <TopBar
          module={module}
          health={health}
          projectProfile={projectProfile}
          projects={projects}
          activeProjectId={activeProjectId}
          authUser={authUser}
          onProjectChange={(projectId) => {
            setActiveProjectId(projectId);
            window.localStorage?.setItem('ip-commerce-project-id', projectId);
          }}
          onSettings={() => setSettingsOpen(true)}
          onProjectProfile={() => setProfileOpen(true)}
          onAdmin={() => setAdminOpen(true)}
          onLogout={logout}
        />
        <div className="workspace-grid">
          <section className="input-panel">
            <AgentPlannerPanel
              goal={agentGoal}
              onGoalChange={setAgentGoal}
              plan={agentPlan}
              task={agentTask}
              loading={agentLoading}
              error={agentError}
              run={agentRun}
              runLoading={agentRunLoading}
              runError={agentRunError}
              runJob={agentGenerationJob.job}
              runElapsedSeconds={agentGenerationJob.elapsedSeconds}
              runConnectionError={agentGenerationJob.connectionError}
              onPlan={runAgentPlanner}
              onApply={applyAgentPlan}
              onRun={runAgentAutoChain}
              onCancelRun={agentGenerationJob.cancel}
              onRetryRun={agentGenerationJob.retry}
            />
            <ModuleHeader module={module} completion={completion} hasContext={Boolean(ipContext)} />
            {module.inherited && module.frontendMode !== 'original' && <InheritedContext hasContext={Boolean(ipContext)} />}
            <OptionGroups module={module} selections={selections[activeModule] || []} onChange={updateSelection} />
            <FormGroups module={module} values={forms[activeModule] || {}} onChange={updateField} />
            {generationError && !generationJob.job && <ErrorBox message={generationError} />}
            <GenerationProgress
              job={generationJob.job}
              elapsedSeconds={generationJob.elapsedSeconds}
              connectionError={generationJob.connectionError}
              onCancel={generationJob.cancel}
              onRetry={generationJob.retry}
            />
            <ActionBar
              loading={loading}
              apiConfigured={health?.api?.configured}
              canConfigureApi={authUser?.role === 'admin'}
              primaryLabel={module.generateLabel}
              onGenerate={generate}
              onClear={clearCurrent}
              onCopy={copyResult}
              onExport={exportMarkdown}
              hasResult={Boolean(currentResult)}
            />
          </section>

          <ResultPanel
            module={module}
            result={currentResult?.result}
            loading={loading}
            error={generationError}
            job={generationJob.job}
            elapsedSeconds={generationJob.elapsedSeconds}
            history={generationHistory}
            historyLoading={historyLoading}
            onRefreshHistory={refreshGenerationHistory}
            onLoadHistory={applyGenerationRecord}
            onApplyProfileSuggestions={applyProfileSuggestions}
            experiments={contentExperiments}
            experimentLoading={experimentLoading}
            experimentError={experimentError}
            onCreateExperiment={createContentExperiment}
            onReviewExperiment={reviewContentExperiment}
            onRefreshExperiments={refreshContentExperiments}
          />
        </div>
      </main>

      {settingsOpen && authUser?.role === 'admin' && (
        <ModelSettingsModal
          health={health}
          onConfigured={(api) => setHealth((prev) => ({ ...(prev || {}), api }))}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {profileOpen && (
        <ProjectProfileModal
          profile={projectProfile}
          project={activeProject}
          ipContext={ipContext}
          onSaved={(project) => {
            refreshProjects(project.id);
            refreshHealth();
          }}
          onClose={() => setProfileOpen(false)}
        />
      )}
      {adminOpen && authUser?.role === 'admin' && <EnhancedAdminUsersModal onClose={() => setAdminOpen(false)} />}
    </div>
  );
}

function hasProjectProfile(profile) {
  return Boolean(profile && ['industry', 'persona', 'offer', 'audience', 'conversion', 'ipPositioningSummary']
    .some((field) => String(profile[field] || '').trim()));
}

function AgentPlannerPanel({
  goal,
  onGoalChange,
  plan,
  task,
  loading,
  error,
  run,
  runLoading,
  runError,
  runJob,
  runElapsedSeconds,
  runConnectionError,
  onPlan,
  onApply,
  onRun,
  onCancelRun,
  onRetryRun,
}) {
  const canSubmit = Boolean(String(goal || '').trim()) && !loading && !runLoading;
  const statusLabel = plan?.status === 'ready' ? '可执行' : plan?.status === 'needs_input' ? '需补充' : plan?.status === 'invalid' ? '无法判断' : '';
  const canRun = Boolean(String(goal || '').trim()) && !loading && !runLoading;

  return (
    <section className="agent-planner">
      <div className="agent-planner-head">
        <div>
          <p className="module-kicker">Agent流程中枢</p>
          <h2>智能任务入口</h2>
        </div>
        {plan && <span className={`agent-status ${plan.status}`}>{statusLabel}</span>}
      </div>
      <textarea
        className="agent-goal-input"
        value={goal}
        onChange={(event) => onGoalChange(event.target.value)}
        placeholder="输入你的目标，例如：我是做本地美业的老板，想做一个能获客成交的个人IP账号。"
      />
      <div className="agent-actions">
        <button className="primary-button" type="button" onClick={onPlan} disabled={!canSubmit}>
          {loading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
          {loading ? '规划中' : '智能规划'}
        </button>
        {plan?.recommendedModuleId && (
          <button className="soft-button" type="button" onClick={() => onApply(plan)}>
            <CheckCircle2 size={16} />
            套用到推荐模块
          </button>
        )}
        <button className="soft-button ready" type="button" onClick={onRun} disabled={!canRun}>
          {runLoading ? <Loader2 className="spin" size={16} /> : <Bot size={16} />}
          {runLoading ? '自动执行中' : '自动执行链'}
        </button>
      </div>
      {error && <ErrorBox message={error} />}
      {runError && !runJob && <ErrorBox message={runError} />}
      <GenerationProgress
        job={runJob}
        elapsedSeconds={runElapsedSeconds}
        connectionError={runConnectionError}
        onCancel={onCancelRun}
        onRetry={onRetryRun}
        compact
      />
      {plan && (
        <div className="agent-plan-card">
          <div className="agent-plan-summary">
            <strong>{plan.taskTypeLabel}</strong>
            <span>推荐：{plan.recommendedModuleLabel} / 置信度 {Math.round((plan.confidence || 0) * 100)}%</span>
          </div>
          <div className="agent-mini-grid">
            <div>
              <h3>判断依据</h3>
              <ul>{(plan.reasoning || []).map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
            <div>
              <h3>{plan.missingQuestions?.length ? '需要补充' : '下一步'}</h3>
              <ul>
                {(plan.missingQuestions?.length ? plan.missingQuestions : plan.actionPlan || []).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          {Boolean(plan.recommendedModules?.length) && (
            <div className="agent-module-row">
              {plan.recommendedModules.map((item) => (
                <button className="agent-module-chip" type="button" key={item.id} onClick={() => onApply({ ...plan, recommendedModuleId: item.id, suggestedFormData: plan.suggestedFormData })}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {Boolean(plan.dirtyFlags?.length || plan.riskNotes?.length) && (
            <div className="agent-risk-line">
              <CircleAlert size={16} />
              <span>{[...(plan.riskNotes || []), task?.id ? `已记录任务：${task.id.slice(0, 8)}` : ''].filter(Boolean).join(' / ')}</span>
            </div>
          )}
        </div>
      )}
      {run && (
        <div className="agent-run-card">
          <div className="agent-plan-summary">
            <strong>Agent执行链</strong>
            <span>{run.status} / {formatAdminDate(run.createdAt)}</span>
          </div>
          {!run.steps?.length && (
            <div className="agent-risk-line">
              <CircleAlert size={16} />
              <span>信息不足时不会消耗模型调用，请先补齐上方追问。</span>
            </div>
          )}
          {Boolean(run.steps?.length) && (
            <div className="agent-run-steps">
              {run.steps.map((step) => (
                <div className={`agent-run-step ${step.status}`} key={`${run.id}-${step.index}-${step.moduleId}`}>
                  <span>{step.index}</span>
                  <div>
                    <strong>{step.moduleLabel || moduleLabelFor(step.moduleId)}</strong>
                    <p>{step.status === 'completed' ? (step.summary || '已生成并保存结果') : step.error?.message || step.purpose}</p>
                    {step.recordId && <small>记录 {step.recordId.slice(0, 8)}</small>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BootScreen() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <Loader2 className="spin" size={24} />
        <h1>流量IP核爆引擎</h1>
        <p>正在检查登录状态</p>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '登录失败');
      onLogin(payload.user);
    } catch (err) {
      setError(formatRequestError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={login}>
        <div className="brand-mark auth-mark">创</div>
        <h1>流量IP核爆引擎</h1>
        <p>使用你的独立账号登录，每个用户只能看到自己的项目档案。</p>
        <label className="settings-field">
          <span>用户名</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label className="settings-field">
          <span>密码</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        {error && <ErrorBox message={error} />}
        <button className="primary-button full" disabled={loading || !username || !password}>
          {loading ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
          {loading ? '登录中' : '登录'}
        </button>
      </form>
    </div>
  );
}

function OuterSidebar({ health, projectProfile, authUser, onSettings, onProjectProfile, onAdmin }) {
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
      <button className={`outer-nav ${hasProjectProfile(projectProfile) ? 'ready' : ''}`} onClick={onProjectProfile}>
        <UserRound size={18} />
        项目档案
      </button>
      {authUser?.role === 'admin' && (
        <button className="outer-nav" onClick={onAdmin}>
          <UserPlus size={18} />
          用户管理
        </button>
      )}
      <div className="outer-spacer" />
      <div className="profile-row">
        <div className="avatar">你</div>
        <span>{health?.api?.configured ? 'API已配置' : 'API未配置'}</span>
        <Moon size={18} />
        {authUser?.role === 'admin' && (
        <button className="icon-button" onClick={onSettings} aria-label="API设置">
          <Settings size={18} />
        </button>
        )}
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

function TopBar({
  module,
  health,
  projectProfile,
  projects = [],
  activeProjectId,
  authUser,
  onProjectChange,
  onSettings,
  onProjectProfile,
  onAdmin,
  onLogout,
  originalMode = false,
}) {
  const profileReady = hasProjectProfile(projectProfile);
  const projectSelector = (
    <select className="project-select" value={activeProjectId || ''} onChange={(event) => onProjectChange?.(event.target.value)}>
      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
  );
  if (originalMode) {
    return (
      <header className="topbar original-topbar">
        <div className="original-topbar-title">
          <h1>流量IP核爆引擎</h1>
        </div>
        <div className="original-top-actions">
          {projectSelector}
          <button className={`original-share-button ${profileReady ? 'ready' : ''}`} type="button" onClick={onProjectProfile}>
            <UserRound size={18} />
            {profileReady ? '档案已保存' : '项目档案'}
          </button>
          {authUser?.role === 'admin' && (
            <button className="original-share-button" type="button" onClick={onAdmin}>
              <UserPlus size={18} />
              用户管理
            </button>
          )}
          {authUser?.role === 'admin' && (
            <button className="original-share-button" type="button" onClick={onSettings}>
              <Settings size={18} />
            配置API
            </button>
          )}
          <button className="original-share-button" type="button" onClick={onLogout}>
            <LogOut size={18} />
            退出
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="topbar">
      <div className="title-stack">
        <div className="crumb">
          <PanelLeft size={20} />
          <span>流量IP核爆引擎</span>
        </div>
        <h1>{module.name}</h1>
      </div>
      <div className="top-actions">
        {projectSelector}
        <span className={`status-pill ${health?.api?.configured ? 'ok' : 'warn'}`}>
          {health?.api?.configured ? 'API已配置' : 'API未配置'}
        </span>
        <button className={`soft-button ${profileReady ? 'ready' : ''}`} onClick={onProjectProfile}>
          <UserRound size={16} />
          {profileReady ? '档案已保存' : '项目档案'}
        </button>
        {authUser?.role === 'admin' && (
          <button className="soft-button" onClick={onSettings}>
            <Settings size={16} />
          API设置
          </button>
        )}
        {authUser?.role === 'admin' && (
          <button className="soft-button" onClick={onAdmin}>
            <UserPlus size={16} />
            用户管理
          </button>
        )}
        <button className="soft-button" onClick={onLogout}>
          <LogOut size={16} />
          退出
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

function ActionBar({ loading, apiConfigured, canConfigureApi, primaryLabel, onGenerate, onClear, onCopy, onExport, hasResult }) {
  return (
    <div className="action-bar">
      <button className="primary-button" onClick={onGenerate} disabled={loading}>
        {loading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
        {loading ? '后台生成中' : primaryLabel || '生成完整结果'}
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
      {!apiConfigured && (
        <span className="inline-warning">
          {canConfigureApi ? 'API未配置，生成前请点击右上角配置API。' : 'API未配置，请联系管理员配置后再生成。'}
        </span>
      )}
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

function ResultPanel({
  module,
  result,
  loading,
  error,
  job,
  elapsedSeconds = 0,
  history = [],
  historyLoading,
  onRefreshHistory,
  onLoadHistory,
  onApplyProfileSuggestions,
  experiments = [],
  experimentLoading,
  experimentError,
  onCreateExperiment,
  onReviewExperiment,
  onRefreshExperiments,
}) {
  return (
    <aside className="result-panel">
      <div className="result-header">
        <div>
          <p className="module-kicker">生成结果</p>
          <h2>{module.name}输出</h2>
        </div>
        <Bot size={24} />
      </div>
      {loading && (
        <StateMessage
          title={job?.progress?.label || '任务已提交到后台'}
          body={`已运行 ${formatElapsedTime(elapsedSeconds)}。页面会自动获取结果，切换模块或短暂断网都不会丢失任务。`}
        />
      )}
      {!loading && error && <StateMessage title="生成未完成" body="请根据左侧提示处理 API 或输入问题。" warning />}
      {!loading && !error && !result && <EmptyResult module={module} />}
      {!loading && result && <RenderedResult result={result} onApplyProfileSuggestions={onApplyProfileSuggestions} />}
      <ContentExperimentPanel
        hasResult={Boolean(result)}
        experiments={experiments}
        loading={experimentLoading}
        error={experimentError}
        onCreate={onCreateExperiment}
        onReview={onReviewExperiment}
        onRefresh={onRefreshExperiments}
      />
      <GenerationHistoryPanel
        history={history}
        loading={historyLoading}
        onRefresh={onRefreshHistory}
        onLoad={onLoadHistory}
      />
    </aside>
  );
}

function formatElapsedTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  if (safeSeconds < 60) return `${safeSeconds}秒`;
  return `${Math.floor(safeSeconds / 60)}分${safeSeconds % 60}秒`;
}

function ContentExperimentPanel({
  hasResult,
  experiments = [],
  loading,
  error,
  onCreate,
  onReview,
  onRefresh,
}) {
  const latest = experiments[0] || null;
  return (
    <div className="content-experiment-panel">
      <div className="history-head">
        <div>
          <h3>内容实验闭环</h3>
          <span>发布前评分、盲预测、T+3复盘和下一条建议</span>
        </div>
        <button className="soft-button history-refresh" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
          刷新
        </button>
      </div>
      {error && <ErrorBox message={error} />}
      <button className="primary-button full" type="button" onClick={onCreate} disabled={!hasResult || loading}>
        {loading ? <Loader2 className="spin" size={18} /> : <BarChart3 size={18} />}
        加入发布前实验
      </button>
      {!hasResult && <div className="history-empty">先生成内容，再创建发布前实验。</div>}
      {latest && (
        <div className="experiment-card">
          <div className="experiment-title">
            <strong>{latest.title}</strong>
            <span>{latest.contentType} / {latest.status}</span>
          </div>
          <div className="experiment-score-row">
            <div className="experiment-score">
              <span>发布前评分</span>
              <strong>{latest.score?.total ?? 0}</strong>
              <small>{latest.score?.level || '未评分'}</small>
            </div>
            <div className="experiment-prediction">
              <span>盲预测</span>
              <strong>{latest.prediction?.likelyOutcome || '待预测'}</strong>
              <small>{latest.prediction?.publishAdvice || ''}</small>
            </div>
          </div>
          {Boolean(latest.score?.flags?.length) && (
            <div className="experiment-tags">
              {latest.score.flags.map((flag) => <span key={flag}>{flag}</span>)}
            </div>
          )}
          <div className="experiment-mini-list">
            {(latest.prediction?.expectedSignals || []).map((item) => <p key={item}>{item}</p>)}
          </div>
          {latest.review?.diagnosis && (
            <div className="experiment-review-result">
              <strong>{latest.review.decision}</strong>
              <p>{latest.review.diagnosis}</p>
              <ul>{(latest.review.nextActions || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          <ContentExperimentReviewForm experiment={latest} loading={loading} onReview={onReview} />
        </div>
      )}
      {experiments.length > 1 && (
        <div className="experiment-archive">
          {experiments.slice(1, 4).map((item) => (
            <div className="experiment-archive-row" key={item.id}>
              <span>{item.title}</span>
              <strong>{item.score?.total ?? 0}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContentExperimentReviewForm({ experiment, loading, onReview }) {
  const [draft, setDraft] = useState(() => ({
    publishUrl: experiment?.publish?.url || '',
    publishedAt: experiment?.publish?.publishedAt || '',
    views: experiment?.review?.metrics?.views || '',
    completionRate: experiment?.review?.metrics?.completionRate || '',
    likes: experiment?.review?.metrics?.likes || '',
    comments: experiment?.review?.metrics?.comments || '',
    saves: experiment?.review?.metrics?.saves || '',
    shares: experiment?.review?.metrics?.shares || '',
    privateMessages: experiment?.review?.metrics?.privateMessages || '',
    phoneCalls: experiment?.review?.metrics?.phoneCalls || '',
    leads: experiment?.review?.metrics?.leads || '',
    deals: experiment?.review?.metrics?.deals || '',
    highIntentQuotes: experiment?.review?.metrics?.highIntentQuotes || '',
    notes: experiment?.review?.notes || '',
  }));

  useEffect(() => {
    setDraft({
      publishUrl: experiment?.publish?.url || '',
      publishedAt: experiment?.publish?.publishedAt || '',
      views: experiment?.review?.metrics?.views || '',
      completionRate: experiment?.review?.metrics?.completionRate || '',
      likes: experiment?.review?.metrics?.likes || '',
      comments: experiment?.review?.metrics?.comments || '',
      saves: experiment?.review?.metrics?.saves || '',
      shares: experiment?.review?.metrics?.shares || '',
      privateMessages: experiment?.review?.metrics?.privateMessages || '',
      phoneCalls: experiment?.review?.metrics?.phoneCalls || '',
      leads: experiment?.review?.metrics?.leads || '',
      deals: experiment?.review?.metrics?.deals || '',
      highIntentQuotes: experiment?.review?.metrics?.highIntentQuotes || '',
      notes: experiment?.review?.notes || '',
    });
  }, [experiment?.id]);

  const update = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  function submit(event) {
    event.preventDefault();
    onReview?.(experiment.id, {
      publishUrl: draft.publishUrl,
      publishedAt: draft.publishedAt,
      notes: draft.notes,
      metrics: {
        views: draft.views,
        completionRate: draft.completionRate,
        likes: draft.likes,
        comments: draft.comments,
        saves: draft.saves,
        shares: draft.shares,
        privateMessages: draft.privateMessages,
        phoneCalls: draft.phoneCalls,
        leads: draft.leads,
        deals: draft.deals,
        highIntentQuotes: draft.highIntentQuotes,
      },
    });
  }

  return (
    <form className="experiment-review-form" onSubmit={submit}>
      <div className="experiment-form-grid">
        <label><span>发布链接</span><input value={draft.publishUrl} onChange={(event) => update('publishUrl', event.target.value)} /></label>
        <label><span>发布时间</span><input value={draft.publishedAt} onChange={(event) => update('publishedAt', event.target.value)} placeholder="2026-07-11" /></label>
        <label><span>播放</span><input type="number" min="0" value={draft.views} onChange={(event) => update('views', event.target.value)} /></label>
        <label><span>完播率%</span><input type="number" min="0" max="100" value={draft.completionRate} onChange={(event) => update('completionRate', event.target.value)} /></label>
        <label><span>点赞</span><input type="number" min="0" value={draft.likes} onChange={(event) => update('likes', event.target.value)} /></label>
        <label><span>评论</span><input type="number" min="0" value={draft.comments} onChange={(event) => update('comments', event.target.value)} /></label>
        <label><span>收藏</span><input type="number" min="0" value={draft.saves} onChange={(event) => update('saves', event.target.value)} /></label>
        <label><span>转发</span><input type="number" min="0" value={draft.shares} onChange={(event) => update('shares', event.target.value)} /></label>
        <label><span>私信</span><input type="number" min="0" value={draft.privateMessages} onChange={(event) => update('privateMessages', event.target.value)} /></label>
        <label><span>电话</span><input type="number" min="0" value={draft.phoneCalls} onChange={(event) => update('phoneCalls', event.target.value)} /></label>
        <label><span>线索</span><input type="number" min="0" value={draft.leads} onChange={(event) => update('leads', event.target.value)} /></label>
        <label><span>成交</span><input type="number" min="0" value={draft.deals} onChange={(event) => update('deals', event.target.value)} /></label>
      </div>
      <label className="experiment-wide"><span>高意向原话</span><textarea value={draft.highIntentQuotes} onChange={(event) => update('highIntentQuotes', event.target.value)} /></label>
      <label className="experiment-wide"><span>复盘备注</span><textarea value={draft.notes} onChange={(event) => update('notes', event.target.value)} /></label>
      <button className="soft-button ready" type="submit" disabled={loading}>
        {loading ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
        保存T+3复盘
      </button>
    </form>
  );
}

function GenerationHistoryPanel({ history = [], loading, onRefresh, onLoad }) {
  return (
    <div className="generation-history">
      <div className="history-head">
        <div>
          <h3>历史记录</h3>
          <span>当前项目和模块的成功生成结果</span>
        </div>
        <button className="soft-button history-refresh" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
          刷新
        </button>
      </div>
      {!history.length && (
        <div className="history-empty">{loading ? '正在读取历史记录...' : '暂无历史记录，生成成功后会自动保存。'}</div>
      )}
      {Boolean(history.length) && (
        <div className="history-list">
          {history.map((record) => (
            <div className="history-item" key={record.id}>
              <div>
                <strong>{record.moduleLabel || moduleLabelFor(record.moduleId)}</strong>
                <span>{formatAdminDate(record.createdAt)}{record.model ? ` / ${record.model}` : ''}</span>
                <p>{record.summary || record.result?.summary || '已保存结构化生成结果'}</p>
              </div>
              <button className="soft-button" type="button" onClick={() => onLoad?.(record)}>载入</button>
            </div>
          ))}
        </div>
      )}
    </div>
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

function RenderedResult({ result, onApplyProfileSuggestions }) {
  return (
    <div className="rendered-result">
      {result.quality && <QualityCard quality={result.quality} />}
      {result.knowledgeCitations?.length > 0 && <KnowledgeCitations citations={result.knowledgeCitations} />}
      {result.profileSuggestions?.hasSuggestions && (
        <ProfileSuggestionCard suggestions={result.profileSuggestions} onApply={onApplyProfileSuggestions} />
      )}
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

function QualityCard({ quality }) {
  const levelLabel = quality.level === 'excellent' ? '优秀' : quality.level === 'pass' ? '通过' : '需复核';
  const repairText = quality.repair?.attempted
    ? quality.repair.status === 'completed'
      ? `已自动修复一次：${quality.repair.beforeScore ?? 0} -> ${quality.score ?? 0}`
      : `自动修复未完成：${quality.repair.message || '模型未返回可用结果'}`
    : '';
  return (
    <div className={`quality-card ${quality.level || 'needs_review'}`}>
      <div>
        <strong>质量评估 {quality.score ?? 0}</strong>
        <span>{levelLabel}</span>
      </div>
      <p>{quality.missing?.length ? `需关注：${quality.missing.join('、')}` : '已通过完整度、用户事实、知识库证据和可执行性检查。'}</p>
      {repairText && <p>{repairText}</p>}
    </div>
  );
}

function KnowledgeCitations({ citations = [] }) {
  return (
    <div className="knowledge-citations">
      <div className="mini-card-head">
        <strong>本次引用知识</strong>
        <span>{citations.length} 条</span>
      </div>
      <div className="citation-list">
        {citations.map((item, index) => (
          <div className="citation-item" key={`${item.source}-${item.heading}-${index}`}>
            <strong>{item.heading || item.source}</strong>
            <span>{item.source}{item.score ? ` / ${Math.round(item.score)}分` : ''}</span>
            {Boolean(item.matchedTerms?.length) && <p>{item.matchedTerms.slice(0, 6).join('、')}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileSuggestionCard({ suggestions, onApply }) {
  const items = suggestions.items || [];
  return (
    <div className="profile-suggestion-card">
      <div className="mini-card-head">
        <strong>项目档案建议</strong>
        <button className="soft-button" type="button" onClick={() => onApply?.(suggestions)} disabled={Boolean(suggestions.appliedAt)}>
          <Save size={15} />
          {suggestions.appliedAt ? '已写入' : '写入档案'}
        </button>
      </div>
      <div className="profile-suggestion-list">
        {items.slice(0, 6).map((item) => (
          <div className="profile-suggestion-item" key={item.field}>
            <span>{item.label}</span>
            <strong>{item.suggested}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectProfileModal({ profile, project, ipContext, onSaved, onClose }) {
  const [draft, setDraft] = useState({
    projectName: profile?.projectName || '',
    industry: profile?.industry || '',
    persona: profile?.persona || '',
    offer: profile?.offer || '',
    audience: profile?.audience || '',
    proof: profile?.proof || '',
    conversion: profile?.conversion || '',
    voice: profile?.voice || '',
    ipPositioningSummary: profile?.ipPositioningSummary || '',
    notes: profile?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');

  function updateProfileField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function useCurrentIpPositioning() {
    if (!ipContext) {
      setMessage('当前还没有 IP定位结果。可以先生成 IP定位，或手动填写档案。');
      setMessageType('error');
      return;
    }
    const summary = [
      ipContext.summary,
      ...(ipContext.sections || []).slice(0, 4).map((section) => `${section.title}：${(section.items || []).join('；')}`),
    ].filter(Boolean).join('\n');
    setDraft((prev) => ({
      ...prev,
      ipPositioningSummary: summary,
    }));
    setMessage('已把当前 IP定位结果写入档案草稿，记得保存。');
    setMessageType('ready');
  }

  async function saveProfile() {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(project?.id ? `/api/projects/${project.id}` : '/api/projects', {
        method: project?.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.projectName || project?.name || '默认项目', profile: draft }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '保存失败');
      onSaved?.(payload.project);
      setMessage('项目档案已保存，后续所有模块会自动继承。');
      setMessageType('ready');
    } catch (error) {
      setMessage(formatRequestError(error));
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  }

  async function saveAsNewProject() {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.projectName || '新项目', profile: draft }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '创建失败');
      onSaved?.(payload.project);
      setMessage('新项目已创建并保存。');
      setMessageType('ready');
    } catch (error) {
      setMessage(formatRequestError(error));
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="settings-modal profile-modal">
        <div className="modal-header">
          <h2>{project?.id ? '项目档案' : '新建项目档案'}</h2>
          <button className="icon-button" onClick={onClose}>x</button>
        </div>
        <div className="profile-help">
          保存一次长期信息，IP定位、选题、脚本、带货都会自动继承，不需要每个模块重复填写。
        </div>
        <div className="settings-grid profile-grid">
          <label className="settings-field">
            <span>项目名称</span>
            <input value={draft.projectName} placeholder="例如：杭州高端收纳整理师IP" onChange={(event) => updateProfileField('projectName', event.target.value)} />
          </label>
          <label className="settings-field">
            <span>行业/赛道</span>
            <input value={draft.industry} placeholder="例如：美业、收纳、团购、本地生活" onChange={(event) => updateProfileField('industry', event.target.value)} />
          </label>
          <label className="settings-field">
            <span>人设/身份</span>
            <input value={draft.persona} placeholder="例如：老板IP、专家顾问、服务型个人IP" onChange={(event) => updateProfileField('persona', event.target.value)} />
          </label>
          <label className="settings-field">
            <span>产品/服务</span>
            <textarea value={draft.offer} placeholder="卖什么、价格、交付形式、核心卖点" onChange={(event) => updateProfileField('offer', event.target.value)} />
          </label>
          <label className="settings-field">
            <span>目标用户</span>
            <textarea value={draft.audience} placeholder="目标人群、场景、痛点、购买动机" onChange={(event) => updateProfileField('audience', event.target.value)} />
          </label>
          <label className="settings-field">
            <span>信任证据</span>
            <textarea value={draft.proof} placeholder="案例、评价、资质、经验、前后对比、数据" onChange={(event) => updateProfileField('proof', event.target.value)} />
          </label>
          <label className="settings-field">
            <span>成交承接</span>
            <input value={draft.conversion} placeholder="评论关键词、私信、表单、到店、商品卡、直播间" onChange={(event) => updateProfileField('conversion', event.target.value)} />
          </label>
          <label className="settings-field">
            <span>表达风格</span>
            <input value={draft.voice} placeholder="专业、犀利、陪伴感、老板视角、顾问感" onChange={(event) => updateProfileField('voice', event.target.value)} />
          </label>
          <label className="settings-field profile-wide">
            <span>IP定位结果</span>
            <textarea value={draft.ipPositioningSummary} placeholder="可手动填写，也可以用当前 IP定位结果写入" onChange={(event) => updateProfileField('ipPositioningSummary', event.target.value)} />
          </label>
          <label className="settings-field profile-wide">
            <span>补充备注</span>
            <textarea value={draft.notes} placeholder="禁忌表达、地区、平台、拍摄条件、特殊要求" onChange={(event) => updateProfileField('notes', event.target.value)} />
          </label>
        </div>
        {message && (
          <div className={`context-strip ${messageType === 'ready' ? 'ready' : ''} ${messageType === 'error' ? 'error' : ''}`}>
            <ShieldCheck size={18} />
            {message}
          </div>
        )}
        <div className="modal-actions-row">
          <button className="soft-button" type="button" onClick={useCurrentIpPositioning}>
            <RefreshCw size={16} />
            写入当前IP定位
          </button>
          {project?.id && (
            <button className="soft-button" type="button" onClick={saveAsNewProject} disabled={saving}>
              <UserPlus size={16} />
              另存为新项目
            </button>
          )}
          <button className="primary-button" onClick={saveProfile} disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            {saving ? '保存中' : '保存项目档案'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatAdminDate(value) {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function moduleLabelFor(moduleId) {
  return moduleMap[moduleId]?.label || moduleId || '未知模块';
}

function SystemStatusBlock({ health }) {
  if (!health) {
    return (
      <div className="system-status-block">
        <div className="mini-card-head">
          <strong>系统状态</strong>
          <span>读取中</span>
        </div>
      </div>
    );
  }
  const features = health.system?.features || {};
  const featureLabels = {
    agentRuns: 'Agent执行链',
    qualityEvaluation: '质量评估',
    qualityAutoRepair: '自动修复',
    knowledgeCitations: '知识引用',
    profileSuggestions: '档案建议',
    structuredKnowledge: '结构化知识',
    qualityBenchmark: '质量测试集',
  };
  const optimization = health.knowledge?.optimization || {};
  return (
    <div className="system-status-block">
      <div className="mini-card-head">
        <strong>系统状态</strong>
        <span>{health.system?.version || 'unknown'}</span>
      </div>
      <div className="system-status-grid">
        <div className={`system-status-item ${health.api?.configured ? 'ready' : 'warn'}`}>
          <span>API</span>
          <strong>{health.api?.configured ? health.api.model : '未配置'}</strong>
        </div>
        <div className={`system-status-item ${health.knowledge?.ok ? 'ready' : 'warn'}`}>
          <span>知识库</span>
          <strong>{health.knowledge?.ok ? `${health.knowledge.files || 0} 文件正常` : '需检查'}</strong>
        </div>
        <div className={`system-status-item ${optimization.structuredBlocks?.ok ? 'ready' : 'warn'}`}>
          <span>知识块</span>
          <strong>{optimization.structuredBlocks?.count || 0} 个</strong>
        </div>
        <div className={`system-status-item ${optimization.benchmarkCases?.ok ? 'ready' : 'warn'}`}>
          <span>测试集</span>
          <strong>{optimization.benchmarkCases?.count || 0} 条</strong>
        </div>
        <div className="system-status-item ready">
          <span>模块</span>
          <strong>{health.modules?.length || 0} 个</strong>
        </div>
        <div className="system-status-item ready">
          <span>用户体系</span>
          <strong>{health.system?.auth || 'sqlite-users'}</strong>
        </div>
      </div>
      <div className="feature-chip-row">
        {Object.entries(featureLabels).map(([key, label]) => (
          <span className={features[key] ? 'ready' : 'warn'} key={key}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function EnhancedAdminUsersModal({ onClose }) {
  const [overview, setOverview] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState({ username: '', password: '', role: 'user', dailyLimit: 50 });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [loading, setLoading] = useState(false);

  async function loadUsers() {
    const [overviewResponse, healthResponse] = await Promise.all([
      fetch('/api/admin/overview'),
      fetch('/api/health'),
    ]);
    const payload = await overviewResponse.json();
    if (!overviewResponse.ok || !payload.ok) throw new Error(payload.message || '读取管理员统计失败');
    const healthPayload = await healthResponse.json().catch(() => null);
    setOverview(payload.overview || null);
    setUsers(payload.overview?.users || []);
    setSystemHealth(healthPayload || null);
  }

  useEffect(() => {
    loadUsers().catch((error) => {
      setMessage(formatRequestError(error));
      setMessageType('error');
    });
  }, []);

  async function createNewUser() {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '创建失败');
      setDraft({ username: '', password: '', role: 'user', dailyLimit: 50 });
      await loadUsers();
      setMessage('用户已创建。');
      setMessageType('ready');
    } catch (error) {
      setMessage(formatRequestError(error));
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }

  async function patchUser(userId, updates) {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '更新失败');
      await loadUsers();
      setMessage('用户已更新。');
      setMessageType('ready');
    } catch (error) {
      setMessage(formatRequestError(error));
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }

  const totals = overview?.totals || {};
  const recentActivities = [
    ...(overview?.recentTasks || []).map((item) => ({
      id: `task-${item.id}`,
      type: 'Agent',
      title: item.goal || '智能任务',
      detail: `${item.username} / ${item.projectName || '默认项目'} / ${item.status || 'unknown'}`,
      createdAt: item.createdAt,
    })),
    ...(overview?.recentGenerations || []).map((item) => ({
      id: `generation-${item.id}`,
      type: '生成',
      title: moduleLabelFor(item.moduleId),
      detail: `${item.username} / ${item.projectName || '默认项目'}`,
      createdAt: item.createdAt,
    })),
  ].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 8);

  return (
    <div className="modal-backdrop">
      <div className="settings-modal admin-modal">
        <div className="modal-header">
          <h2>用户与用量管理</h2>
          <button className="icon-button" onClick={onClose}>x</button>
        </div>
        <div className="profile-help">
          管理员创建账号并分配每日生成额度。普通用户只能访问自己的项目档案、生成记录和智能任务；API 配置仍只允许管理员操作。
        </div>

        <div className="admin-metrics">
          <div className="admin-metric">
            <span>用户</span>
            <strong>{totals.totalUsers ?? 0}</strong>
            <small>启用 {totals.activeUsers ?? 0} / 禁用 {totals.disabledUsers ?? 0}</small>
          </div>
          <div className="admin-metric">
            <span>项目档案</span>
            <strong>{totals.totalProjects ?? 0}</strong>
            <small>每个用户独立隔离</small>
          </div>
          <div className="admin-metric">
            <span>今日生成</span>
            <strong>{totals.todayGenerations ?? 0}</strong>
            <small>累计 {totals.totalGenerations ?? 0}</small>
          </div>
          <div className="admin-metric">
            <span>Agent 任务</span>
            <strong>{totals.totalAgentTasks ?? 0}</strong>
            <small>今日 {totals.todayAgentTasks ?? 0}</small>
          </div>
        </div>

        <SystemStatusBlock health={systemHealth} />

        <div className="user-create-grid">
          <label className="settings-field">
            <span>用户名</span>
            <input value={draft.username} onChange={(event) => setDraft((prev) => ({ ...prev, username: event.target.value }))} />
          </label>
          <label className="settings-field">
            <span>初始密码</span>
            <input type="password" value={draft.password} onChange={(event) => setDraft((prev) => ({ ...prev, password: event.target.value }))} />
          </label>
          <label className="settings-field">
            <span>角色</span>
            <select value={draft.role} onChange={(event) => setDraft((prev) => ({ ...prev, role: event.target.value }))}>
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </label>
          <label className="settings-field">
            <span>每日次数</span>
            <input type="number" min="0" value={draft.dailyLimit} onChange={(event) => setDraft((prev) => ({ ...prev, dailyLimit: event.target.value }))} />
          </label>
          <button className="primary-button user-create-button" disabled={loading || !draft.username || !draft.password} onClick={createNewUser}>
            <UserPlus size={18} />
            创建用户
          </button>
        </div>
        {message && (
          <div className={`context-strip ${messageType === 'ready' ? 'ready' : ''} ${messageType === 'error' ? 'error' : ''}`}>
            <ShieldCheck size={18} />
            {message}
          </div>
        )}

        <div className="admin-section-title">用户明细</div>
        <div className="user-list">
          {users.map((user) => (
            <div className="user-row" key={user.id}>
              <div className="user-main">
                <strong>{user.username}</strong>
                <span>{user.role === 'admin' ? '管理员' : '普通用户'} / {user.status === 'active' ? '启用' : '禁用'} / 最后活跃 {formatAdminDate(user.lastActivityAt)}</span>
                <div className="user-meta-grid">
                  <small>项目 {user.projectCount ?? 0}</small>
                  <small>生成 {user.generationCount ?? 0}</small>
                  <small>今日 {user.todayGenerationCount ?? 0} / {user.dailyLimit === 0 ? '不限' : user.dailyLimit}</small>
                  <small>任务 {user.agentTaskCount ?? 0}</small>
                </div>
              </div>
              <div className="user-actions">
                <button className="soft-button" disabled={loading} onClick={() => patchUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' })}>
                  {user.status === 'active' ? '禁用' : '启用'}
                </button>
                <button
                  className="soft-button"
                  disabled={loading}
                  onClick={() => {
                    const password = window.prompt(`给 ${user.username} 设置新密码`);
                    if (password) patchUser(user.id, { password });
                  }}
                >
                  重置密码
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="admin-section-title">最近活动</div>
        <div className="activity-list">
          {recentActivities.length ? recentActivities.map((item) => (
            <div className="activity-row" key={item.id}>
              <span className="activity-type">{item.type}</span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.detail} / {formatAdminDate(item.createdAt)}</small>
              </div>
            </div>
          )) : (
            <div className="activity-empty">暂无生成或 Agent 任务记录。</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminUsersModal({ onClose }) {
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState({ username: '', password: '', role: 'user', dailyLimit: 50 });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [loading, setLoading] = useState(false);

  async function loadUsers() {
    const response = await fetch('/api/admin/users');
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.message || '读取用户失败');
    setUsers(payload.users || []);
  }

  useEffect(() => {
    loadUsers().catch((error) => {
      setMessage(formatRequestError(error));
      setMessageType('error');
    });
  }, []);

  async function createNewUser() {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '创建失败');
      setDraft({ username: '', password: '', role: 'user', dailyLimit: 50 });
      await loadUsers();
      setMessage('用户已创建。');
      setMessageType('ready');
    } catch (error) {
      setMessage(formatRequestError(error));
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }

  async function patchUser(userId, updates) {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '更新失败');
      await loadUsers();
      setMessage('用户已更新。');
      setMessageType('ready');
    } catch (error) {
      setMessage(formatRequestError(error));
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="settings-modal admin-modal">
        <div className="modal-header">
          <h2>用户管理</h2>
          <button className="icon-button" onClick={onClose}>x</button>
        </div>
        <div className="profile-help">
          管理员手动创建账号。普通用户只能访问自己的项目档案和生成内容；API 配置仅管理员可操作。
        </div>
        <div className="user-create-grid">
          <label className="settings-field">
            <span>用户名</span>
            <input value={draft.username} onChange={(event) => setDraft((prev) => ({ ...prev, username: event.target.value }))} />
          </label>
          <label className="settings-field">
            <span>初始密码</span>
            <input type="password" value={draft.password} onChange={(event) => setDraft((prev) => ({ ...prev, password: event.target.value }))} />
          </label>
          <label className="settings-field">
            <span>角色</span>
            <select value={draft.role} onChange={(event) => setDraft((prev) => ({ ...prev, role: event.target.value }))}>
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </label>
          <label className="settings-field">
            <span>每日次数</span>
            <input type="number" min="0" value={draft.dailyLimit} onChange={(event) => setDraft((prev) => ({ ...prev, dailyLimit: event.target.value }))} />
          </label>
          <button className="primary-button user-create-button" disabled={loading || !draft.username || !draft.password} onClick={createNewUser}>
            <UserPlus size={18} />
            创建用户
          </button>
        </div>
        {message && (
          <div className={`context-strip ${messageType === 'ready' ? 'ready' : ''} ${messageType === 'error' ? 'error' : ''}`}>
            <ShieldCheck size={18} />
            {message}
          </div>
        )}
        <div className="user-list">
          {users.map((user) => (
            <div className="user-row" key={user.id}>
              <div>
                <strong>{user.username}</strong>
                <span>{user.role === 'admin' ? '管理员' : '普通用户'} / {user.status === 'active' ? '启用' : '禁用'} / 每日 {user.daily_limit ?? user.dailyLimit} 次</span>
              </div>
              <div className="user-actions">
                <button className="soft-button" disabled={loading} onClick={() => patchUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' })}>
                  {user.status === 'active' ? '禁用' : '启用'}
                </button>
                <button
                  className="soft-button"
                  disabled={loading}
                  onClick={() => {
                    const password = window.prompt(`给 ${user.username} 设置新密码`);
                    if (password) patchUser(user.id, { password });
                  }}
                >
                  重置密码
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
