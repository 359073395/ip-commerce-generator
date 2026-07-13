import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Loader2, RotateCcw, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import {
  deleteOwnProjectMemory,
  loadOwnProjectMemories,
  submitResultFeedback,
} from './knowledgeApi.js';

export function ResultFeedbackPanel({ projectId, moduleId, generationRecordId, result }) {
  const [helpful, setHelpful] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [correctedText, setCorrectedText] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memories, setMemories] = useState([]);

  useEffect(() => {
    setHelpful(null);
    setExpanded(false);
    setCorrectedText('');
    setNotes('');
    setMessage('');
  }, [generationRecordId]);

  if (!projectId || !generationRecordId || !result) return null;

  function choose(nextHelpful) {
    setHelpful(nextHelpful);
    setExpanded(true);
    setMessage('');
    if (!correctedText) setCorrectedText(formatResultText(result));
  }

  async function saveFeedback() {
    setBusy(true);
    setMessage('');
    try {
      const payload = await submitResultFeedback({
        projectId,
        moduleId,
        generationRecordId,
        helpful: helpful === true,
        correctedText,
        notes,
      });
      setMessage(payload.learning?.candidate ? '已保存到项目学习，并进入管理员待审核区。' : '已保存到当前项目学习。');
      await refreshMemories();
    } catch (error) {
      setMessage(error.message || '反馈保存失败。');
    } finally {
      setBusy(false);
    }
  }

  async function refreshMemories() {
    try {
      const payload = await loadOwnProjectMemories(projectId);
      setMemories(payload.memories || []);
    } catch (error) {
      setMessage(error.message || '项目学习读取失败。');
    }
  }

  async function toggleMemories() {
    const next = !memoryOpen;
    setMemoryOpen(next);
    if (next) await refreshMemories();
  }

  async function removeMemory(memoryId) {
    setBusy(true);
    try {
      await deleteOwnProjectMemory(projectId, memoryId);
      await refreshMemories();
      setMessage('错误偏好已从当前项目学习中删除。');
    } catch (error) {
      setMessage(error.message || '删除失败。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="result-feedback-panel">
      <div className="result-feedback-head">
        <div>
          <strong>这次结果是否可用？</strong>
          <span>反馈只先用于当前项目</span>
        </div>
        <button className="icon-button" type="button" onClick={toggleMemories} title="项目学习">
          {memoryOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
      </div>
      <div className="result-feedback-actions">
        <button className={`soft-button ${helpful === true ? 'ready' : ''}`} type="button" onClick={() => choose(true)}>
          <ThumbsUp size={16} /> 有用
        </button>
        <button className={`soft-button ${helpful === false ? 'danger' : ''}`} type="button" onClick={() => choose(false)}>
          <ThumbsDown size={16} /> 需要改进
        </button>
      </div>
      {expanded && (
        <div className="result-feedback-editor">
          <label>
            <span>最终采用版本</span>
            <textarea value={correctedText} onChange={(event) => setCorrectedText(event.target.value)} />
          </label>
          <label>
            <span>补充说明</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="哪些地方有效，哪些地方需要调整" />
          </label>
          <button className="primary-button" type="button" onClick={saveFeedback} disabled={busy || helpful === null}>
            {busy ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
            保存反馈
          </button>
        </div>
      )}
      {message && <div className="knowledge-inline-message">{message}</div>}
      {memoryOpen && (
        <div className="project-memory-list">
          {!memories.length && <div className="history-empty">当前项目还没有学习记录。</div>}
          {memories.map((memory) => (
            <div className="project-memory-row" key={memory.id}>
              <div>
                <strong>{memory.title}</strong>
                <span>{memory.summary || memory.content}</span>
              </div>
              <button className="icon-button danger" type="button" onClick={() => removeMemory(memory.id)} title="删除错误偏好" disabled={busy}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button className="soft-button" type="button" onClick={refreshMemories} disabled={busy}>
            <RotateCcw size={15} /> 刷新项目学习
          </button>
        </div>
      )}
    </div>
  );
}

function formatResultText(result = {}) {
  const lines = [];
  if (result.summary) lines.push(result.summary);
  for (const section of result.sections || []) {
    lines.push(`\n${section.title}`);
    lines.push(...(section.items || []));
  }
  for (const script of result.scripts || []) {
    lines.push(`\n${script.title || '脚本'}`);
    if (script.hook) lines.push(script.hook);
    if (Array.isArray(script.body)) lines.push(...script.body);
    else if (script.body) lines.push(script.body);
    if (script.cta) lines.push(script.cta);
  }
  return lines.filter(Boolean).join('\n').slice(0, 8000);
}
