import { CheckCircle2, CircleAlert, Clock3, Loader2, RotateCcw, X } from 'lucide-react';

const activeStatuses = new Set(['queued', 'running']);
const retryableStatuses = new Set(['failed', 'cancelled', 'interrupted']);

export function GenerationProgress({ job, elapsedSeconds = 0, connectionError = '', onCancel, onRetry, compact = false }) {
  if (!job) return null;
  const active = activeStatuses.has(job.status);
  const completed = job.status === 'completed' || job.status === 'needs_review';
  const percent = Math.max(0, Math.min(100, Number(job.progress?.percent || 0)));
  const currentStep = Number(job.progress?.currentStep || 0);
  const totalSteps = Number(job.progress?.totalSteps || 0);
  const statusClass = completed ? 'completed' : active ? 'active' : 'failed';

  return (
    <section className={`generation-progress ${statusClass} ${compact ? 'compact' : ''}`} aria-live="polite">
      <div className="generation-progress-head">
        <div className="generation-progress-title">
          {active ? <Loader2 className="spin" size={18} /> : completed ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
          <div>
            <strong>{job.progress?.label || statusLabel(job.status)}</strong>
            <span>
              {totalSteps > 0 ? `第 ${Math.min(currentStep || 1, totalSteps)}/${totalSteps} 步` : statusLabel(job.status)}
              {job.progress?.model ? ` · ${job.progress.model}` : ''}
            </span>
          </div>
        </div>
        <div className="generation-elapsed"><Clock3 size={14} />{formatElapsed(elapsedSeconds)}</div>
      </div>

      <div className="generation-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="generation-progress-meta">
        <span>{progressHint(job)}</span>
        <strong>{Math.round(percent)}%</strong>
      </div>

      {connectionError ? <p className="generation-connection-note">{connectionError}</p> : null}
      {!active && !completed && job.error?.message ? <p className="generation-error-note">{job.error.message}</p> : null}

      {active || retryableStatuses.has(job.status) ? (
        <div className="generation-progress-actions">
          {active ? (
            <button className="soft-button danger" type="button" onClick={onCancel} disabled={job.cancelRequested}>
              <X size={15} />
              {job.cancelRequested ? '正在停止' : '取消任务'}
            </button>
          ) : null}
          {retryableStatuses.has(job.status) ? (
            <button className="soft-button ready" type="button" onClick={onRetry}>
              <RotateCcw size={15} />
              直接重试
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function progressHint(job) {
  if (job.status === 'queued') return '可以停留在当前页面，也可以切换模块继续查看内容。';
  if (job.status === 'running') {
    if (job.progress?.stage === 'model_fallback') return '已自动切换备用模型，不需要重新提交。';
    return '知识库、项目档案和表单内容正在共同参与生成。';
  }
  if (job.status === 'completed') return '结果已保存到当前项目历史记录。';
  if (job.status === 'needs_review' && job.progress?.stage === 'needs_input') return '信息不足时不会消耗模型调用，补充目标后重新执行即可。';
  if (job.status === 'needs_review') return '结果已保存，质量门禁建议再人工确认一次。';
  return '表单内容没有丢失，可以直接重试。';
}

function statusLabel(status) {
  const labels = {
    queued: '等待执行',
    running: '正在生成',
    completed: '生成完成',
    needs_review: '需要复核',
    failed: '生成未完成',
    cancelled: '任务已取消',
    interrupted: '任务被服务重启中断',
  };
  return labels[status] || '生成任务';
}

function formatElapsed(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return minutes ? `${minutes}:${String(rest).padStart(2, '0')}` : `${rest}秒`;
}
