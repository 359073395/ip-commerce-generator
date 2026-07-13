import { apiRequest } from '../../api/client.js';

export function loadKnowledgeStatus() {
  return apiRequest('/api/admin/knowledge/status');
}

export function loadKnowledgeCandidates(status = 'pending') {
  return apiRequest(`/api/admin/knowledge/candidates?status=${encodeURIComponent(status)}&limit=200`);
}

export function loadKnowledgeCards({ status = '', query = '' } = {}) {
  const params = new URLSearchParams({ limit: '200' });
  if (status) params.set('status', status);
  if (query) params.set('q', query);
  return apiRequest(`/api/admin/knowledge/cards?${params.toString()}`);
}

export function loadProjectMemories(status = 'active') {
  return apiRequest(`/api/admin/knowledge/project-memories?status=${encodeURIComponent(status)}&limit=200`);
}

export function ingestKnowledgeText({ title, text }) {
  return apiRequest('/api/admin/knowledge/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, text }),
  });
}

export function uploadKnowledgeFile({ title, file }) {
  const body = new FormData();
  body.set('title', title || '');
  body.set('file', file);
  return apiRequest('/api/admin/knowledge/upload', { method: 'POST', body });
}

export function updateKnowledgeCandidate(candidateId, draft) {
  return apiRequest(`/api/admin/knowledge/candidates/${candidateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft }),
  });
}

export function publishKnowledgeCandidate(candidateId) {
  return apiRequest(`/api/admin/knowledge/candidates/${candidateId}/publish`, { method: 'POST' });
}

export function rejectKnowledgeCandidate(candidateId, reason = '') {
  return apiRequest(`/api/admin/knowledge/candidates/${candidateId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

export function updateKnowledgeCard(cardId, updates) {
  return apiRequest(`/api/admin/knowledge/cards/${cardId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export function setKnowledgeCardStatus(cardId, status) {
  return apiRequest(`/api/admin/knowledge/cards/${cardId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function setProjectMemoryStatus(memoryId, status) {
  return apiRequest(`/api/admin/knowledge/project-memories/${memoryId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function createKnowledgeBackup() {
  return apiRequest('/api/admin/knowledge/backups', { method: 'POST' });
}

export function restoreKnowledgeBackup(fileName) {
  return apiRequest(`/api/admin/knowledge/backups/${encodeURIComponent(fileName)}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: fileName }),
  });
}

export function submitResultFeedback(payload) {
  return apiRequest('/api/knowledge/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function loadOwnProjectMemories(projectId) {
  return apiRequest(`/api/knowledge/project-memories?projectId=${encodeURIComponent(projectId)}&limit=50`);
}

export function deleteOwnProjectMemory(projectId, memoryId) {
  return apiRequest(`/api/knowledge/project-memories/${memoryId}?projectId=${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
}
