import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../api/client.js';

const terminalStatuses = new Set(['completed', 'failed', 'needs_review', 'cancelled', 'interrupted']);
const activeStatuses = new Set(['queued', 'running']);

export function useGenerationJob({ storageKey, onCompleted } = {}) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const completedHandlerRef = useRef(onCompleted);
  const handledJobIdsRef = useRef(new Set());

  useEffect(() => {
    completedHandlerRef.current = onCompleted;
  }, [onCompleted]);

  const rememberJob = useCallback((nextJob) => {
    setJob(nextJob || null);
    if (!storageKey || !nextJob?.id) return;
    if (activeStatuses.has(nextJob.status)) {
      window.localStorage?.setItem(storageKey, JSON.stringify({ version: 1, jobId: nextJob.id }));
    } else {
      window.localStorage?.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    setJob(null);
    setError('');
    setConnectionError('');
    if (!storageKey) return undefined;
    let cancelled = false;
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) return undefined;
    let jobId = '';
    try {
      jobId = JSON.parse(raw)?.jobId || '';
    } catch {
      window.localStorage?.removeItem(storageKey);
    }
    if (!jobId) return undefined;

    apiRequest(`/api/jobs/${encodeURIComponent(jobId)}`)
      .then((payload) => {
        if (!cancelled) rememberJob(payload.job);
      })
      .catch(() => {
        if (!cancelled) window.localStorage?.removeItem(storageKey);
      });
    return () => {
      cancelled = true;
    };
  }, [rememberJob, storageKey]);

  useEffect(() => {
    if (!job?.id || !activeStatuses.has(job.status)) return undefined;
    let cancelled = false;
    let timer;

    const poll = async () => {
      try {
        const payload = await apiRequest(`/api/jobs/${encodeURIComponent(job.id)}`);
        if (cancelled) return;
        setConnectionError('');
        rememberJob(payload.job);
        if (activeStatuses.has(payload.job.status)) timer = window.setTimeout(poll, 1000);
      } catch (pollError) {
        if (cancelled) return;
        setConnectionError('网络波动，正在自动重新连接任务状态…');
        timer = window.setTimeout(poll, 2000);
      }
    };

    timer = window.setTimeout(poll, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [job?.id, job?.status, rememberJob]);

  useEffect(() => {
    if (!job?.id) {
      setElapsedSeconds(0);
      return undefined;
    }
    const started = new Date(job.startedAt || job.createdAt || Date.now()).getTime();
    const update = () => {
      const storedElapsed = Number(job.progress?.elapsedMs || 0);
      const liveElapsed = activeStatuses.has(job.status) ? Math.max(0, Date.now() - started) : storedElapsed;
      setElapsedSeconds(Math.round(Math.max(storedElapsed, liveElapsed) / 1000));
    };
    update();
    if (!activeStatuses.has(job.status)) return undefined;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, job?.startedAt, job?.createdAt, job?.progress?.elapsedMs]);

  useEffect(() => {
    if (!job?.id || !terminalStatuses.has(job.status) || handledJobIdsRef.current.has(job.id)) return;
    handledJobIdsRef.current.add(job.id);
    if (job.status === 'completed' || job.status === 'needs_review') {
      setError('');
      completedHandlerRef.current?.(job);
      return;
    }
    setError(job.error?.message || terminalStatusMessage(job.status));
  }, [job]);

  const start = useCallback(async (endpoint, body) => {
    setError('');
    setConnectionError('');
    const payload = await apiRequest(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    rememberJob(payload.job);
    return payload.job;
  }, [rememberJob]);

  const cancel = useCallback(async () => {
    if (!job?.id || !activeStatuses.has(job.status)) return null;
    const payload = await apiRequest(`/api/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST' });
    rememberJob(payload.job);
    return payload.job;
  }, [job?.id, job?.status, rememberJob]);

  const retry = useCallback(async () => {
    if (!job?.id || activeStatuses.has(job.status)) return null;
    setError('');
    const payload = await apiRequest(`/api/jobs/${encodeURIComponent(job.id)}/retry`, { method: 'POST' });
    rememberJob(payload.job);
    return payload.job;
  }, [job?.id, job?.status, rememberJob]);

  const dismiss = useCallback(() => {
    if (job && activeStatuses.has(job.status)) return;
    setJob(null);
    setError('');
    setConnectionError('');
    if (storageKey) window.localStorage?.removeItem(storageKey);
  }, [job, storageKey]);

  return {
    job,
    error,
    connectionError,
    elapsedSeconds,
    isActive: Boolean(job && activeStatuses.has(job.status)),
    start,
    cancel,
    retry,
    dismiss,
  };
}

function terminalStatusMessage(status) {
  const messages = {
    cancelled: '任务已取消，输入内容仍然保留。',
    interrupted: '服务重启中断了任务，可以直接重试。',
    failed: '生成任务未完成，可以直接重试。',
  };
  return messages[status] || '任务未完成。';
}
