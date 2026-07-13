import { useEffect, useState } from 'react';
import {
  ArchiveRestore,
  BookOpenCheck,
  Check,
  DatabaseBackup,
  FileUp,
  FolderCog,
  LibraryBig,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  createKnowledgeBackup,
  ingestKnowledgeText,
  loadKnowledgeCandidates,
  loadKnowledgeCards,
  loadKnowledgeStatus,
  loadProjectMemories,
  publishKnowledgeCandidate,
  rejectKnowledgeCandidate,
  restoreKnowledgeBackup,
  setKnowledgeCardStatus,
  setProjectMemoryStatus,
  updateKnowledgeCandidate,
  updateKnowledgeCard,
  uploadKnowledgeFile,
} from './knowledgeApi.js';

const tabs = [
  { id: 'overview', label: '知识概览', icon: LibraryBig },
  { id: 'add', label: '添加知识', icon: Upload },
  { id: 'review', label: '待审核', icon: BookOpenCheck },
  { id: 'cards', label: '全局知识', icon: FolderCog },
  { id: 'projects', label: '项目学习', icon: ShieldCheck },
  { id: 'backups', label: '备份状态', icon: DatabaseBackup },
];

export function KnowledgeManagerModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [status, setStatus] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [cards, setCards] = useState([]);
  const [memories, setMemories] = useState([]);
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');

  useEffect(() => {
    void refreshInitial();
  }, []);

  useEffect(() => {
    if (activeTab === 'review' && !candidates.length) void refreshCandidates();
    if (activeTab === 'cards' && !cards.length) void refreshCards();
    if (activeTab === 'projects' && !memories.length) void refreshMemories();
  }, [activeTab]);

  async function refreshInitial() {
    setBusy('refresh');
    try {
      await refreshStatusOnly();
    } catch (error) {
      showMessage(error.message || '知识库状态读取失败。', 'error');
    } finally {
      setBusy('');
    }
  }

  async function refreshAll() {
    setBusy('refresh');
    try {
      const tasks = [refreshStatusOnly()];
      if (activeTab === 'review') tasks.push(refreshCandidates());
      if (activeTab === 'cards') tasks.push(refreshCards());
      if (activeTab === 'projects') tasks.push(refreshMemories());
      await Promise.all(tasks);
    } catch (error) {
      showMessage(error.message || '知识库状态读取失败。', 'error');
    } finally {
      setBusy('');
    }
  }

  function showMessage(text, type = 'ready') {
    setMessage(text);
    setMessageType(type);
  }

  async function handleIngestText(input) {
    setBusy('ingest');
    showMessage('正在提炼结构化方法卡，请保持页面打开。', 'info');
    try {
      const payload = await ingestKnowledgeText(input);
      setCandidates((current) => [...(payload.candidates || []), ...current]);
      setActiveTab('review');
      showMessage(`已生成 ${payload.candidates?.length || 0} 张待审核方法卡。`);
      await refreshStatusOnly();
    } catch (error) {
      showMessage(error.message || '知识提炼失败。', 'error');
    } finally {
      setBusy('');
    }
  }

  async function handleUpload(input) {
    setBusy('upload');
    showMessage('正在解析文件并提炼方法卡。', 'info');
    try {
      const payload = await uploadKnowledgeFile(input);
      setCandidates((current) => [...(payload.candidates || []), ...current]);
      setActiveTab('review');
      const warning = payload.source?.warnings?.length ? `，解析提示 ${payload.source.warnings.length} 条` : '';
      showMessage(`已生成 ${payload.candidates?.length || 0} 张待审核方法卡${warning}。`);
      await refreshStatusOnly();
    } catch (error) {
      showMessage(error.message || '文件提炼失败。', 'error');
    } finally {
      setBusy('');
    }
  }

  async function refreshStatusOnly() {
    const payload = await loadKnowledgeStatus();
    setStatus(payload);
    setBackups(payload.backups || []);
  }

  async function refreshCandidates() {
    setBusy('review');
    try {
      const payload = await loadKnowledgeCandidates('pending');
      setCandidates(payload.candidates || []);
    } finally {
      setBusy('');
    }
  }

  async function refreshCards(filters = {}) {
    setBusy('cards');
    try {
      const payload = await loadKnowledgeCards(filters);
      setCards(payload.cards || []);
    } finally {
      setBusy('');
    }
  }

  async function refreshMemories() {
    setBusy('projects');
    try {
      const payload = await loadProjectMemories('active');
      setMemories(payload.memories || []);
    } finally {
      setBusy('');
    }
  }

  async function refreshBackups() {
    setBusy('backups');
    try {
      await refreshStatusOnly();
    } finally {
      setBusy('');
    }
  }

  const database = status?.database || {};
  const overview = status?.overview || {};

  return (
    <div className="modal-backdrop knowledge-modal-backdrop">
      <div className="settings-modal knowledge-manager-modal">
        <div className="modal-header knowledge-modal-header">
          <div>
            <h2>知识库管理</h2>
            <p>私有方法、项目学习与审核发布</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭知识库管理">
            <X size={20} />
          </button>
        </div>

        <div className="knowledge-status-strip">
          <span className={database.ok ? 'ready' : 'error'}>{database.ok ? '私有库正常' : '私有库异常'}</span>
          <strong>{database.publishedCards || 0} 条已发布</strong>
          <span>{database.activeProjectMemories || 0} 条项目学习</span>
          <button className="icon-button" type="button" onClick={refreshAll} title="刷新" disabled={Boolean(busy)}>
            {busy === 'refresh' ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
          </button>
        </div>

        <div className="knowledge-tabs" role="tablist" aria-label="知识库视图">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? 'active' : ''}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                {tab.label}
                {tab.id === 'review' && candidates.length > 0 && <em>{candidates.length}</em>}
              </button>
            );
          })}
        </div>

        {message && <div className={`knowledge-message ${messageType}`}>{message}</div>}

        <div className="knowledge-tab-body">
          {activeTab === 'overview' && <KnowledgeOverview overview={overview} database={database} />}
          {activeTab === 'add' && (
            <KnowledgeAddPanel
              busy={Boolean(busy)}
              accept={status?.uploadAccept || '.txt,.md,.csv,.json,.docx,.pdf,.xlsx'}
              onText={handleIngestText}
              onUpload={handleUpload}
            />
          )}
          {activeTab === 'review' && (
            <CandidateReviewPanel
              candidates={candidates}
              busy={Boolean(busy)}
              onRefresh={refreshCandidates}
              onChanged={async (text) => {
                await refreshCandidates();
                await refreshStatusOnly();
                await refreshCards();
                showMessage(text);
              }}
              onError={(text) => showMessage(text, 'error')}
            />
          )}
          {activeTab === 'cards' && (
            <GlobalKnowledgePanel
              cards={cards}
              busy={Boolean(busy)}
              onSearch={refreshCards}
              onChanged={async (text) => {
                await refreshCards();
                await refreshStatusOnly();
                showMessage(text);
              }}
              onError={(text) => showMessage(text, 'error')}
            />
          )}
          {activeTab === 'projects' && (
            <ProjectLearningPanel
              memories={memories}
              busy={Boolean(busy)}
              onRefresh={refreshMemories}
              onChanged={async (text) => {
                await refreshMemories();
                await refreshStatusOnly();
                showMessage(text);
              }}
              onError={(text) => showMessage(text, 'error')}
            />
          )}
          {activeTab === 'backups' && (
            <BackupPanel
              backups={backups}
              busy={Boolean(busy)}
              onRefresh={refreshBackups}
              onMessage={showMessage}
              onBusy={setBusy}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function KnowledgeOverview({ overview = {}, database = {} }) {
  const totals = overview.totals || {};
  const stats = [
    ['已发布知识', totals.publishedCards || 0],
    ['待审核', totals.pendingCandidates || 0],
    ['项目学习', totals.activeProjectMemories || 0],
    ['历史版本', totals.versions || 0],
  ];
  return (
    <div className="knowledge-overview">
      <div className="knowledge-stat-grid">
        {stats.map(([label, value]) => (
          <div className="knowledge-stat" key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </div>
      <div className="knowledge-overview-grid">
        <section>
          <h3>模块覆盖</h3>
          <div className="knowledge-category-list">
            {(overview.categories || []).map((item) => (
              <div key={item.category}><span>{item.category}</span><strong>{item.count}</strong></div>
            ))}
            {!overview.categories?.length && <div className="history-empty">暂无已发布知识。</div>}
          </div>
        </section>
        <section>
          <h3>最近更新</h3>
          <div className="knowledge-recent-list">
            {(overview.recent || []).map((item) => (
              <div key={item.id}><strong>{item.title}</strong><span>{item.category} · {formatDate(item.updatedAt)}</span></div>
            ))}
          </div>
        </section>
      </div>
      {!database.ok && <div className="error-box">{database.error || '私有知识库不可用。'}</div>}
    </div>
  );
}

function KnowledgeAddPanel({ busy, accept, onText, onUpload }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  return (
    <div className="knowledge-add-grid">
      <section className="knowledge-tool-section">
        <div className="knowledge-section-title"><BookOpenCheck size={18} /><h3>粘贴资料</h3></div>
        <label><span>资料名称</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：工程律师成交方法" /></label>
        <label><span>资料正文</span><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="粘贴方法、案例复盘或课程笔记" /></label>
        <button className="primary-button" type="button" disabled={busy || text.trim().length < 40} onClick={() => onText({ title, text })}>
          {busy ? <Loader2 className="spin" size={17} /> : <BookOpenCheck size={17} />}
          AI 提炼
        </button>
      </section>
      <section className="knowledge-tool-section">
        <div className="knowledge-section-title"><FileUp size={18} /><h3>上传文件</h3></div>
        <label><span>资料名称</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="默认使用文件名" /></label>
        <label className="knowledge-file-field">
          <span>选择文件</span>
          <input type="file" accept={accept} onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <strong>{file?.name || 'TXT、Markdown、CSV、JSON、DOCX、PDF、XLSX'}</strong>
        </label>
        <button className="primary-button" type="button" disabled={busy || !file} onClick={() => onUpload({ title, file })}>
          {busy ? <Loader2 className="spin" size={17} /> : <FileUp size={17} />}
          上传并提炼
        </button>
      </section>
    </div>
  );
}

function CandidateReviewPanel({ candidates, busy, onRefresh, onChanged, onError }) {
  const [selectedId, setSelectedId] = useState('');
  const selected = candidates.find((item) => item.id === selectedId) || candidates[0] || null;
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
    if (!selected) setSelectedId('');
  }, [selected?.id, selectedId]);
  return (
    <div className="knowledge-split-view">
      <div className="knowledge-list-pane">
        <PaneHeader title={`待审核 ${candidates.length}`} busy={busy} onRefresh={onRefresh} />
        {!candidates.length && <div className="history-empty">没有待审核知识。</div>}
        {candidates.map((item) => (
          <button className={selected?.id === item.id ? 'selected' : ''} type="button" key={item.id} onClick={() => setSelectedId(item.id)}>
            <strong>{item.draft.title}</strong>
            <span>{item.sourceType} · {Math.round(item.qualityScore)}分</span>
            <p>{item.draft.summary}</p>
          </button>
        ))}
      </div>
      <div className="knowledge-editor-pane">
        {selected ? <CandidateEditor key={selected.id} candidate={selected} onChanged={onChanged} onError={onError} /> : <div className="history-empty">添加资料后在这里审核。</div>}
      </div>
    </div>
  );
}

function CandidateEditor({ candidate, onChanged, onError }) {
  const [draft, setDraft] = useState(() => editorDraft(candidate.draft));
  const [busy, setBusy] = useState('');
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    const payload = await updateKnowledgeCandidate(candidate.id, toApiDraft(draft));
    setDraft(editorDraft(payload.candidate.draft));
    return payload.candidate;
  }

  async function perform(action) {
    setBusy(action);
    try {
      if (action === 'save') {
        await save();
        await onChanged('候选知识已保存。');
      } else if (action === 'publish') {
        await save();
        await publishKnowledgeCandidate(candidate.id);
        await onChanged('知识已发布到全局私有库。');
      } else {
        await rejectKnowledgeCandidate(candidate.id, '管理员驳回');
        await onChanged('候选知识已驳回。');
      }
    } catch (error) {
      onError(error.message || '审核操作失败。');
    } finally {
      setBusy('');
    }
  }

  return (
    <KnowledgeEditorFields draft={draft} onChange={update} footer={(
      <div className="knowledge-editor-actions">
        <button className="soft-button" type="button" onClick={() => perform('save')} disabled={Boolean(busy)}><Save size={16} />保存草稿</button>
        <button className="soft-button danger" type="button" onClick={() => perform('reject')} disabled={Boolean(busy)}><Trash2 size={16} />驳回</button>
        <button className="primary-button" type="button" onClick={() => perform('publish')} disabled={Boolean(busy)}>
          {busy === 'publish' ? <Loader2 className="spin" size={16} /> : <Check size={16} />}确认发布
        </button>
      </div>
    )} />
  );
}

function GlobalKnowledgePanel({ cards, busy, onSearch, onChanged, onError }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('published');
  const [selectedId, setSelectedId] = useState('');
  const selected = cards.find((item) => item.id === selectedId) || cards[0] || null;
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
    if (!selected) setSelectedId('');
  }, [selected?.id, selectedId]);
  return (
    <div className="knowledge-split-view">
      <div className="knowledge-list-pane">
        <div className="knowledge-filter-row">
          <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索方法" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="published">已发布</option>
            <option value="disabled">已停用</option>
            <option value="">全部</option>
          </select>
          <button className="icon-button" type="button" onClick={() => onSearch({ status, query })} disabled={busy} title="搜索"><Search size={16} /></button>
        </div>
        {cards.map((item) => (
          <button className={selected?.id === item.id ? 'selected' : ''} type="button" key={item.id} onClick={() => setSelectedId(item.id)}>
            <strong>{item.title}</strong>
            <span>{item.category} · v{item.version} · {item.status}</span>
            <p>{item.summary}</p>
          </button>
        ))}
      </div>
      <div className="knowledge-editor-pane">
        {selected ? <KnowledgeCardEditor key={selected.id} card={selected} onChanged={onChanged} onError={onError} /> : <div className="history-empty">没有匹配的全局知识。</div>}
      </div>
    </div>
  );
}

function KnowledgeCardEditor({ card, onChanged, onError }) {
  const [draft, setDraft] = useState(() => editorDraft(card));
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  async function save() {
    setBusy(true);
    try {
      await updateKnowledgeCard(card.id, toApiDraft(draft));
      await onChanged('全局知识已更新并生成新版本。');
    } catch (error) {
      onError(error.message || '知识更新失败。');
    } finally {
      setBusy(false);
    }
  }
  async function toggleStatus() {
    setBusy(true);
    try {
      const next = card.status === 'published' ? 'disabled' : 'published';
      await setKnowledgeCardStatus(card.id, next);
      await onChanged(next === 'published' ? '知识已重新启用。' : '知识已停用，不再参与生成。');
    } catch (error) {
      onError(error.message || '状态更新失败。');
    } finally {
      setBusy(false);
    }
  }
  return <KnowledgeEditorFields draft={draft} onChange={update} footer={(
    <div className="knowledge-editor-actions">
      <button className={`soft-button ${card.status === 'published' ? 'danger' : 'ready'}`} type="button" onClick={toggleStatus} disabled={busy}>
        {card.status === 'published' ? <Trash2 size={16} /> : <ArchiveRestore size={16} />}
        {card.status === 'published' ? '停用' : '重新启用'}
      </button>
      <button className="primary-button" type="button" onClick={save} disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <Save size={16} />}保存新版本</button>
    </div>
  )} />;
}

function KnowledgeEditorFields({ draft, onChange, footer }) {
  return (
    <div className="knowledge-editor-form">
      <div className="knowledge-editor-grid">
        <label><span>标题</span><input value={draft.title} onChange={(event) => onChange('title', event.target.value)} /></label>
        <label><span>分类</span><select value={draft.category} onChange={(event) => onChange('category', event.target.value)}><option value="personal_ip">个人IP</option><option value="commerce_video">带货视频</option><option value="combined">综合</option></select></label>
      </div>
      <label><span>一句话摘要</span><textarea value={draft.summary} onChange={(event) => onChange('summary', event.target.value)} /></label>
      <label><span>完整方法</span><textarea className="knowledge-content-textarea" value={draft.content} onChange={(event) => onChange('content', event.target.value)} /></label>
      <div className="knowledge-editor-grid">
        <label><span>适用模块</span><input value={draft.moduleIds} onChange={(event) => onChange('moduleIds', event.target.value)} /></label>
        <label><span>关键词</span><input value={draft.keywords} onChange={(event) => onChange('keywords', event.target.value)} /></label>
      </div>
      <label><span>方法步骤</span><textarea value={draft.methods} onChange={(event) => onChange('methods', event.target.value)} /></label>
      <div className="knowledge-editor-grid">
        <label><span>适用条件</span><textarea value={draft.applicableWhen} onChange={(event) => onChange('applicableWhen', event.target.value)} /></label>
        <label><span>禁用条件</span><textarea value={draft.avoidWhen} onChange={(event) => onChange('avoidWhen', event.target.value)} /></label>
      </div>
      {footer}
    </div>
  );
}

function ProjectLearningPanel({ memories, busy, onRefresh, onChanged, onError }) {
  async function remove(memory) {
    try {
      await setProjectMemoryStatus(memory.id, 'deleted');
      await onChanged('项目学习记录已停用。');
    } catch (error) {
      onError(error.message || '项目学习记录处理失败。');
    }
  }
  return (
    <div className="project-learning-panel">
      <PaneHeader title={`项目学习 ${memories.length}`} busy={busy} onRefresh={onRefresh} />
      <div className="project-learning-list">
        {!memories.length && <div className="history-empty">暂无项目学习记录。</div>}
        {memories.map((memory) => (
          <div className="project-learning-item" key={memory.id}>
            <div>
              <strong>{memory.title}</strong>
              <span>{memory.moduleId || '通用'} · {memory.sourceType} · {Math.round(memory.qualityScore)}分</span>
              <p>{memory.summary || memory.content}</p>
              <small>用户 {shortId(memory.userId)} · 项目 {shortId(memory.projectId)}</small>
            </div>
            <button className="icon-button danger" type="button" onClick={() => remove(memory)} title="停用项目学习"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BackupPanel({ backups, busy, onRefresh, onMessage, onBusy }) {
  async function createBackup() {
    onBusy('backups');
    try {
      await createKnowledgeBackup();
      await onRefresh();
      onMessage('私有知识库备份已创建。');
    } catch (error) {
      onMessage(error.message || '备份创建失败。', 'error');
    } finally {
      onBusy('');
    }
  }
  async function restore(backup) {
    if (!window.confirm(`确认恢复备份 ${backup.fileName}？当前知识库会先自动备份。`)) return;
    onBusy('backups');
    try {
      await restoreKnowledgeBackup(backup.fileName);
      await onRefresh();
      onMessage('知识库已恢复到所选备份。');
    } catch (error) {
      onMessage(error.message || '知识库恢复失败。', 'error');
    } finally {
      onBusy('');
    }
  }
  return (
    <div className="knowledge-backup-panel">
      <div className="knowledge-backup-actions">
        <button className="primary-button" type="button" onClick={createBackup} disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <DatabaseBackup size={16} />}立即备份</button>
        <button className="soft-button" type="button" onClick={onRefresh} disabled={busy}><RefreshCw size={16} />刷新</button>
      </div>
      <div className="knowledge-backup-list">
        {backups.map((backup) => (
          <div className="knowledge-backup-row" key={backup.fileName}>
            <div><strong>{backup.fileName}</strong><span>{formatBytes(backup.size)} · {formatDate(backup.createdAt)}</span></div>
            <div>
              <a className="soft-button" href={`/api/admin/knowledge/backups/${encodeURIComponent(backup.fileName)}/download`}><DatabaseBackup size={15} />下载</a>
              <button className="icon-button" type="button" onClick={() => restore(backup)} title="恢复备份"><ArchiveRestore size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaneHeader({ title, busy, onRefresh }) {
  return <div className="knowledge-pane-header"><h3>{title}</h3><button className="icon-button" type="button" onClick={onRefresh} disabled={busy} title="刷新">{busy ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}</button></div>;
}

function editorDraft(card = {}) {
  return {
    title: card.title || '',
    summary: card.summary || '',
    content: card.content || '',
    category: card.category || 'combined',
    moduleIds: (card.moduleIds || []).join(', '),
    methods: (card.methods || []).join('\n'),
    keywords: (card.keywords || []).join(', '),
    applicableWhen: card.applicableWhen || '',
    avoidWhen: card.avoidWhen || '',
  };
}

function toApiDraft(draft) {
  return {
    ...draft,
    moduleIds: splitList(draft.moduleIds),
    methods: splitList(draft.methods),
    keywords: splitList(draft.keywords),
  };
}

function splitList(value) {
  return String(value || '').split(/[\n,，、;；|]/).map((item) => item.trim()).filter(Boolean);
}

function formatDate(value) {
  if (!value) return '未知时间';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function shortId(value) {
  const text = String(value || '');
  return text.length > 10 ? `${text.slice(0, 6)}…${text.slice(-4)}` : text || '-';
}
