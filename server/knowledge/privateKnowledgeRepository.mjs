import crypto from 'node:crypto';
import {
  getPrivateKnowledgeDatabase,
  knowledgeAll,
  knowledgeFirst,
  knowledgeRun,
  persistPrivateKnowledgeDatabase,
} from './privateKnowledgeDatabase.mjs';

export async function getPrivateKnowledgeOverview() {
  const db = await getPrivateKnowledgeDatabase();
  const totals = knowledgeFirst(db, `
    SELECT
      (SELECT COUNT(*) FROM knowledge_cards) AS totalCards,
      (SELECT COUNT(*) FROM knowledge_cards WHERE status = 'published') AS publishedCards,
      (SELECT COUNT(*) FROM knowledge_cards WHERE status = 'disabled') AS disabledCards,
      (SELECT COUNT(*) FROM knowledge_candidates WHERE status = 'pending') AS pendingCandidates,
      (SELECT COUNT(*) FROM project_memories WHERE status = 'active') AS activeProjectMemories,
      (SELECT COUNT(*) FROM knowledge_versions) AS versions
  `) || {};
  const categories = knowledgeAll(db, `
    SELECT category, COUNT(*) AS count
    FROM knowledge_cards
    WHERE status = 'published'
    GROUP BY category
    ORDER BY count DESC, category ASC
  `).map((row) => ({ category: row.category || 'unknown', count: numberValue(row.count) }));
  const recent = knowledgeAll(db, `
    SELECT id, title, category, status, updated_at
    FROM knowledge_cards
    ORDER BY updated_at DESC
    LIMIT 8
  `).map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    updatedAt: row.updated_at,
  }));
  return {
    totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, numberValue(value)])),
    categories,
    recent,
  };
}

export async function listKnowledgeCards({ status, category, query, limit = 100 } = {}) {
  const db = await getPrivateKnowledgeDatabase();
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push('status = ?');
    params.push(normalizeCardStatus(status));
  }
  if (category) {
    clauses.push('category = ?');
    params.push(normalizeShortText(category, 80));
  }
  if (query) {
    clauses.push('(title LIKE ? OR summary LIKE ? OR content LIKE ? OR keywords_json LIKE ?)');
    const pattern = `%${normalizeShortText(query, 120)}%`;
    params.push(pattern, pattern, pattern, pattern);
  }
  params.push(clampInteger(limit, 1, 300, 100));
  const rows = knowledgeAll(db, `
    SELECT * FROM knowledge_cards
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, updated_at DESC
    LIMIT ?
  `, params);
  return rows.map(cardFromRow);
}

export async function getKnowledgeCard(cardId) {
  const db = await getPrivateKnowledgeDatabase();
  const row = knowledgeFirst(db, 'SELECT * FROM knowledge_cards WHERE id = ?', [cardId]);
  return row ? cardFromRow(row) : null;
}

export async function createKnowledgeCandidate({
  userId = '',
  projectId = '',
  sourceType = 'admin_text',
  sourceRef = '',
  sourceSummary = '',
  draft = {},
  qualityScore,
  createdBy = '',
} = {}) {
  const db = await getPrivateKnowledgeDatabase();
  const timestamp = nowIso();
  const id = randomId();
  const normalizedDraft = normalizeCardDraft(draft);
  const score = normalizeScore(qualityScore ?? normalizedDraft.qualityScore, 50);
  knowledgeRun(db, `
    INSERT INTO knowledge_candidates (
      id, user_id, project_id, source_type, source_ref, source_summary, draft_json,
      quality_score, status, created_by, reviewed_by, reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, '', NULL, ?, ?)
  `, [
    id,
    normalizeId(userId),
    normalizeId(projectId),
    normalizeShortText(sourceType, 80),
    normalizeText(sourceRef, 500),
    normalizeText(sourceSummary, 2000),
    JSON.stringify(normalizedDraft),
    score,
    normalizeId(createdBy),
    timestamp,
    timestamp,
  ]);
  recordAudit(db, 'candidate', id, 'created', createdBy, { sourceType, qualityScore: score });
  await persistPrivateKnowledgeDatabase(db);
  return getKnowledgeCandidate(id);
}

export async function listKnowledgeCandidates({ status = 'pending', userId, projectId, limit = 100 } = {}) {
  const db = await getPrivateKnowledgeDatabase();
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push('status = ?');
    params.push(normalizeCandidateStatus(status));
  }
  if (userId) {
    clauses.push('user_id = ?');
    params.push(normalizeId(userId));
  }
  if (projectId) {
    clauses.push('project_id = ?');
    params.push(normalizeId(projectId));
  }
  params.push(clampInteger(limit, 1, 300, 100));
  return knowledgeAll(db, `
    SELECT * FROM knowledge_candidates
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY updated_at DESC
    LIMIT ?
  `, params).map(candidateFromRow);
}

export async function getKnowledgeCandidate(candidateId) {
  const db = await getPrivateKnowledgeDatabase();
  const row = knowledgeFirst(db, 'SELECT * FROM knowledge_candidates WHERE id = ?', [candidateId]);
  return row ? candidateFromRow(row) : null;
}

export async function findKnowledgeCandidateBySource({ sourceType, sourceRef, userId = '', projectId = '' } = {}) {
  if (!sourceType || !sourceRef) return null;
  const db = await getPrivateKnowledgeDatabase();
  const row = knowledgeFirst(db, `
    SELECT * FROM knowledge_candidates
    WHERE source_type = ? AND source_ref = ? AND user_id = ? AND project_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [
    normalizeShortText(sourceType, 80),
    normalizeText(sourceRef, 500),
    normalizeId(userId),
    normalizeId(projectId),
  ]);
  return row ? candidateFromRow(row) : null;
}

export async function updateKnowledgeCandidate(candidateId, updates = {}, actorId = '') {
  const db = await getPrivateKnowledgeDatabase();
  const currentRow = knowledgeFirst(db, 'SELECT * FROM knowledge_candidates WHERE id = ?', [candidateId]);
  if (!currentRow) throw notFound('KNOWLEDGE_CANDIDATE_NOT_FOUND', '待审核知识不存在。');
  if (!['pending', 'draft'].includes(currentRow.status)) {
    throw invalidState('KNOWLEDGE_CANDIDATE_LOCKED', '该候选知识已经处理，不能继续修改。');
  }
  const current = candidateFromRow(currentRow);
  const draft = normalizeCardDraft({ ...current.draft, ...(updates.draft || updates) });
  const qualityScore = normalizeScore(updates.qualityScore ?? current.qualityScore, current.qualityScore);
  const timestamp = nowIso();
  knowledgeRun(db, `
    UPDATE knowledge_candidates
    SET draft_json = ?, quality_score = ?, updated_at = ?
    WHERE id = ?
  `, [JSON.stringify(draft), qualityScore, timestamp, candidateId]);
  recordAudit(db, 'candidate', candidateId, 'updated', actorId, { qualityScore });
  await persistPrivateKnowledgeDatabase(db);
  return getKnowledgeCandidate(candidateId);
}

export async function rejectKnowledgeCandidate(candidateId, actorId = '', reason = '') {
  const db = await getPrivateKnowledgeDatabase();
  const current = knowledgeFirst(db, 'SELECT * FROM knowledge_candidates WHERE id = ?', [candidateId]);
  if (!current) throw notFound('KNOWLEDGE_CANDIDATE_NOT_FOUND', '待审核知识不存在。');
  const timestamp = nowIso();
  knowledgeRun(db, `
    UPDATE knowledge_candidates
    SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
  `, [normalizeId(actorId), timestamp, timestamp, candidateId]);
  recordAudit(db, 'candidate', candidateId, 'rejected', actorId, { reason: normalizeText(reason, 500) });
  await persistPrivateKnowledgeDatabase(db);
  return getKnowledgeCandidate(candidateId);
}

export async function publishKnowledgeCandidate(candidateId, actorId = '') {
  const db = await getPrivateKnowledgeDatabase();
  const candidateRow = knowledgeFirst(db, 'SELECT * FROM knowledge_candidates WHERE id = ?', [candidateId]);
  if (!candidateRow) throw notFound('KNOWLEDGE_CANDIDATE_NOT_FOUND', '待审核知识不存在。');
  if (!['pending', 'draft'].includes(candidateRow.status)) {
    throw invalidState('KNOWLEDGE_CANDIDATE_LOCKED', '该候选知识已经处理。');
  }
  const candidate = candidateFromRow(candidateRow);
  const timestamp = nowIso();
  const card = normalizeCardDraft(candidate.draft);
  const cardId = randomId();
  begin(db);
  try {
    insertCard(db, {
      ...card,
      id: cardId,
      sourceType: candidate.sourceType,
      sourceRef: candidate.sourceRef || candidate.id,
      evidence: {
        ...(card.evidence || {}),
        candidateId: candidate.id,
        projectId: candidate.projectId,
        userId: candidate.userId,
      },
      qualityScore: candidate.qualityScore,
      confidence: card.confidence,
      status: 'published',
      createdBy: candidate.createdBy || actorId,
      reviewedBy: actorId,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: timestamp,
    });
    insertVersion(db, cardId, 1, 'published', cardSnapshot({ ...card, id: cardId, version: 1, status: 'published' }), actorId, timestamp);
    knowledgeRun(db, `
      UPDATE knowledge_candidates
      SET status = 'published', reviewed_by = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `, [normalizeId(actorId), timestamp, timestamp, candidateId]);
    recordAudit(db, 'candidate', candidateId, 'published', actorId, { cardId });
    recordAudit(db, 'card', cardId, 'created', actorId, { candidateId });
    commit(db);
  } catch (error) {
    rollback(db);
    throw error;
  }
  await persistPrivateKnowledgeDatabase(db);
  return getKnowledgeCard(cardId);
}

export async function upsertPublishedKnowledgeCard(draft = {}, {
  legacyKey = '',
  actorId = 'system',
  sourceType = 'legacy_import',
  sourceRef = '',
} = {}) {
  const db = await getPrivateKnowledgeDatabase();
  const normalized = normalizeCardDraft(draft);
  const existing = legacyKey
    ? knowledgeFirst(db, 'SELECT * FROM knowledge_cards WHERE legacy_key = ?', [legacyKey])
    : null;
  if (existing) return cardFromRow(existing);
  const timestamp = nowIso();
  const cardId = randomId();
  begin(db);
  try {
    insertCard(db, {
      ...normalized,
      id: cardId,
      legacyKey,
      sourceType,
      sourceRef,
      status: 'published',
      createdBy: actorId,
      reviewedBy: actorId,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: timestamp,
    });
    insertVersion(db, cardId, 1, 'imported', cardSnapshot({ ...normalized, id: cardId, version: 1, status: 'published' }), actorId, timestamp);
    recordAudit(db, 'card', cardId, 'imported', actorId, { legacyKey, sourceRef });
    commit(db);
  } catch (error) {
    rollback(db);
    throw error;
  }
  await persistPrivateKnowledgeDatabase(db);
  return getKnowledgeCard(cardId);
}

export async function bulkImportPublishedKnowledgeCards(entries = [], actorId = 'system') {
  if (!Array.isArray(entries) || !entries.length) return { imported: 0, skipped: 0 };
  const db = await getPrivateKnowledgeDatabase();
  const timestamp = nowIso();
  let imported = 0;
  let skipped = 0;
  begin(db);
  try {
    for (const entry of entries) {
      const legacyKey = normalizeShortText(entry.legacyKey, 500);
      if (legacyKey && knowledgeFirst(db, 'SELECT id FROM knowledge_cards WHERE legacy_key = ?', [legacyKey])) {
        skipped += 1;
        continue;
      }
      const normalized = normalizeCardDraft(entry.draft || entry);
      const cardId = randomId();
      insertCard(db, {
        ...normalized,
        id: cardId,
        legacyKey,
        sourceType: entry.sourceType || 'legacy_import',
        sourceRef: entry.sourceRef || legacyKey,
        evidence: entry.evidence || normalized.evidence,
        status: 'published',
        createdBy: actorId,
        reviewedBy: actorId,
        createdAt: timestamp,
        updatedAt: timestamp,
        publishedAt: timestamp,
      });
      insertVersion(db, cardId, 1, 'imported', {
        ...cardSnapshot(normalized),
        id: cardId,
        version: 1,
        status: 'published',
      }, actorId, timestamp);
      recordAudit(db, 'card', cardId, 'imported', actorId, { legacyKey, sourceRef: entry.sourceRef || '' });
      imported += 1;
    }
    commit(db);
  } catch (error) {
    rollback(db);
    throw error;
  }
  await persistPrivateKnowledgeDatabase(db);
  return { imported, skipped };
}

export async function updateKnowledgeCard(cardId, updates = {}, actorId = '') {
  const db = await getPrivateKnowledgeDatabase();
  const row = knowledgeFirst(db, 'SELECT * FROM knowledge_cards WHERE id = ?', [cardId]);
  if (!row) throw notFound('KNOWLEDGE_CARD_NOT_FOUND', '知识卡不存在。');
  const current = cardFromRow(row);
  const nextDraft = normalizeCardDraft({ ...current, ...updates });
  const nextStatus = updates.status ? normalizeCardStatus(updates.status) : current.status;
  const nextVersion = current.version + 1;
  const timestamp = nowIso();
  begin(db);
  try {
    updateCardRow(db, cardId, {
      ...nextDraft,
      status: nextStatus,
      version: nextVersion,
      reviewedBy: actorId || current.reviewedBy,
      updatedAt: timestamp,
      publishedAt: nextStatus === 'published' ? (current.publishedAt || timestamp) : current.publishedAt,
    });
    insertVersion(db, cardId, nextVersion, 'updated', cardSnapshot({ ...nextDraft, id: cardId, version: nextVersion, status: nextStatus }), actorId, timestamp);
    recordAudit(db, 'card', cardId, 'updated', actorId, { version: nextVersion, status: nextStatus });
    commit(db);
  } catch (error) {
    rollback(db);
    throw error;
  }
  await persistPrivateKnowledgeDatabase(db);
  return getKnowledgeCard(cardId);
}

export async function setKnowledgeCardStatus(cardId, status, actorId = '') {
  return updateKnowledgeCard(cardId, { status: normalizeCardStatus(status) }, actorId);
}

export async function listKnowledgeCardVersions(cardId) {
  const db = await getPrivateKnowledgeDatabase();
  return knowledgeAll(db, `
    SELECT * FROM knowledge_versions
    WHERE card_id = ?
    ORDER BY version DESC
  `, [cardId]).map((row) => ({
    id: row.id,
    cardId: row.card_id,
    version: numberValue(row.version),
    action: row.action,
    snapshot: parseObject(row.snapshot_json),
    actorId: row.actor_id,
    createdAt: row.created_at,
  }));
}

export async function restoreKnowledgeCardVersion(cardId, versionId, actorId = '') {
  const db = await getPrivateKnowledgeDatabase();
  const version = knowledgeFirst(db, `
    SELECT * FROM knowledge_versions WHERE id = ? AND card_id = ?
  `, [versionId, cardId]);
  if (!version) throw notFound('KNOWLEDGE_VERSION_NOT_FOUND', '知识版本不存在。');
  const snapshot = parseObject(version.snapshot_json);
  return updateKnowledgeCard(cardId, snapshot, actorId);
}

export async function upsertProjectMemory({
  userId,
  projectId,
  moduleId = '',
  title,
  summary = '',
  content = '',
  keywords = [],
  evidence = {},
  sourceType = 'user_feedback',
  sourceRef = '',
  qualityScore = 50,
} = {}) {
  if (!userId || !projectId) throw invalidState('PROJECT_MEMORY_SCOPE_REQUIRED', '项目记忆必须绑定用户和项目。');
  const db = await getPrivateKnowledgeDatabase();
  const timestamp = nowIso();
  const existing = sourceRef
    ? knowledgeFirst(db, `
        SELECT * FROM project_memories
        WHERE user_id = ? AND project_id = ? AND source_type = ? AND source_ref = ?
      `, [userId, projectId, sourceType, sourceRef])
    : null;
  if (existing) {
    knowledgeRun(db, `
      UPDATE project_memories
      SET module_id = ?, title = ?, summary = ?, content = ?, keywords_json = ?, evidence_json = ?,
          quality_score = ?, status = 'active', updated_at = ?
      WHERE id = ?
    `, [
      normalizeShortText(moduleId, 80),
      normalizeShortText(title || existing.title, 180),
      normalizeText(summary, 2000),
      normalizeText(content, 12000),
      JSON.stringify(normalizeArray(keywords, 40, 80)),
      JSON.stringify(evidence || {}),
      normalizeScore(qualityScore, 50),
      timestamp,
      existing.id,
    ]);
    recordAudit(db, 'project_memory', existing.id, 'updated', userId, { projectId, sourceRef });
    await persistPrivateKnowledgeDatabase(db);
    return getProjectMemory(existing.id);
  }
  const id = randomId();
  knowledgeRun(db, `
    INSERT INTO project_memories (
      id, user_id, project_id, module_id, title, summary, content, keywords_json,
      evidence_json, source_type, source_ref, quality_score, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `, [
    id,
    normalizeId(userId),
    normalizeId(projectId),
    normalizeShortText(moduleId, 80),
    normalizeShortText(title || '项目反馈', 180),
    normalizeText(summary, 2000),
    normalizeText(content, 12000),
    JSON.stringify(normalizeArray(keywords, 40, 80)),
    JSON.stringify(evidence || {}),
    normalizeShortText(sourceType, 80),
    normalizeText(sourceRef, 500),
    normalizeScore(qualityScore, 50),
    timestamp,
    timestamp,
  ]);
  recordAudit(db, 'project_memory', id, 'created', userId, { projectId, sourceRef });
  await persistPrivateKnowledgeDatabase(db);
  return getProjectMemory(id);
}

export async function listProjectMemories({ userId, projectId, status = 'active', limit = 100 } = {}) {
  const db = await getPrivateKnowledgeDatabase();
  const clauses = [];
  const params = [];
  if (userId) {
    clauses.push('user_id = ?');
    params.push(normalizeId(userId));
  }
  if (projectId) {
    clauses.push('project_id = ?');
    params.push(normalizeId(projectId));
  }
  if (status) {
    clauses.push('status = ?');
    params.push(status === 'deleted' ? 'deleted' : 'active');
  }
  params.push(clampInteger(limit, 1, 300, 100));
  return knowledgeAll(db, `
    SELECT * FROM project_memories
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY updated_at DESC
    LIMIT ?
  `, params).map(memoryFromRow);
}

export async function getProjectMemory(memoryId) {
  const db = await getPrivateKnowledgeDatabase();
  const row = knowledgeFirst(db, 'SELECT * FROM project_memories WHERE id = ?', [memoryId]);
  return row ? memoryFromRow(row) : null;
}

export async function deleteProjectMemoryForUser(userId, projectId, memoryId) {
  const db = await getPrivateKnowledgeDatabase();
  const row = knowledgeFirst(db, `
    SELECT * FROM project_memories WHERE id = ? AND user_id = ? AND project_id = ?
  `, [memoryId, userId, projectId]);
  if (!row) throw notFound('PROJECT_MEMORY_NOT_FOUND', '项目学习记录不存在或无权访问。');
  knowledgeRun(db, `
    UPDATE project_memories SET status = 'deleted', updated_at = ? WHERE id = ?
  `, [nowIso(), memoryId]);
  recordAudit(db, 'project_memory', memoryId, 'deleted', userId, { projectId });
  await persistPrivateKnowledgeDatabase(db);
}

export async function setProjectMemoryStatusByAdmin(memoryId, status, actorId = '') {
  const db = await getPrivateKnowledgeDatabase();
  const row = knowledgeFirst(db, 'SELECT * FROM project_memories WHERE id = ?', [memoryId]);
  if (!row) throw notFound('PROJECT_MEMORY_NOT_FOUND', '项目学习记录不存在。');
  const nextStatus = status === 'active' ? 'active' : 'deleted';
  knowledgeRun(db, `
    UPDATE project_memories SET status = ?, updated_at = ? WHERE id = ?
  `, [nextStatus, nowIso(), memoryId]);
  recordAudit(db, 'project_memory', memoryId, nextStatus === 'active' ? 'restored' : 'deleted', actorId, {
    userId: row.user_id,
    projectId: row.project_id,
  });
  await persistPrivateKnowledgeDatabase(db);
  return getProjectMemory(memoryId);
}

export async function getPublishedKnowledgeForRetrieval({ userId = '', projectId = '' } = {}) {
  const db = await getPrivateKnowledgeDatabase();
  const cards = knowledgeAll(db, `
    SELECT * FROM knowledge_cards WHERE status = 'published' ORDER BY quality_score DESC, updated_at DESC
  `).map(cardFromRow);
  const memories = userId && projectId
    ? knowledgeAll(db, `
        SELECT * FROM project_memories
        WHERE user_id = ? AND project_id = ? AND status = 'active'
        ORDER BY quality_score DESC, updated_at DESC
      `, [userId, projectId]).map(memoryFromRow)
    : [];
  return { cards, memories };
}

export async function setKnowledgeMeta(key, value) {
  const db = await getPrivateKnowledgeDatabase();
  knowledgeRun(db, `
    INSERT INTO knowledge_meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `, [normalizeShortText(key, 120), JSON.stringify(value), nowIso()]);
  await persistPrivateKnowledgeDatabase(db);
}

export async function getKnowledgeMeta(key) {
  const db = await getPrivateKnowledgeDatabase();
  const row = knowledgeFirst(db, 'SELECT value FROM knowledge_meta WHERE key = ?', [normalizeShortText(key, 120)]);
  return row ? parseValue(row.value) : null;
}

export function normalizeCardDraft(input = {}) {
  return {
    title: normalizeShortText(input.title || '未命名方法卡', 180),
    summary: normalizeText(input.summary, 2000),
    content: normalizeText(input.content || input.description || input.summary, 20000),
    category: normalizeShortText(input.category || 'combined', 80),
    moduleIds: normalizeArray(input.moduleIds || input.modules, 30, 80),
    industries: normalizeArray(input.industries, 30, 100),
    stages: normalizeArray(input.stages, 20, 80),
    goals: normalizeArray(input.goals, 30, 100),
    methods: normalizeArray(input.methods, 60, 500),
    keywords: normalizeArray(input.keywords, 60, 100),
    scenarios: normalizeArray(input.scenarios, 40, 300),
    requiredInputs: normalizeArray(input.requiredInputs, 40, 200),
    outputTemplate: normalizeArray(input.outputTemplate, 40, 300),
    example: normalizeText(input.example, 5000),
    applicableWhen: normalizeText(input.applicableWhen, 2000),
    avoidWhen: normalizeText(input.avoidWhen, 2000),
    evidence: input.evidence && typeof input.evidence === 'object' ? input.evidence : {},
    qualityScore: normalizeScore(input.qualityScore, 60),
    confidence: normalizeConfidence(input.confidence, 0.6),
  };
}

function insertCard(db, input) {
  knowledgeRun(db, `
    INSERT INTO knowledge_cards (
      id, legacy_key, title, summary, content, category, module_ids_json, industries_json,
      stages_json, goals_json, methods_json, keywords_json, scenarios_json, required_inputs_json,
      output_template_json, example, applicable_when, avoid_when, source_type, source_ref,
      evidence_json, quality_score, confidence, status, version, created_by, reviewed_by,
      created_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `, [
    input.id,
    input.legacyKey || null,
    input.title,
    input.summary,
    input.content,
    input.category,
    JSON.stringify(input.moduleIds),
    JSON.stringify(input.industries),
    JSON.stringify(input.stages),
    JSON.stringify(input.goals),
    JSON.stringify(input.methods),
    JSON.stringify(input.keywords),
    JSON.stringify(input.scenarios),
    JSON.stringify(input.requiredInputs),
    JSON.stringify(input.outputTemplate),
    input.example,
    input.applicableWhen,
    input.avoidWhen,
    input.sourceType || 'manual',
    input.sourceRef || '',
    JSON.stringify(input.evidence || {}),
    normalizeScore(input.qualityScore, 60),
    normalizeConfidence(input.confidence, 0.6),
    normalizeCardStatus(input.status),
    normalizeId(input.createdBy),
    normalizeId(input.reviewedBy),
    input.createdAt || nowIso(),
    input.updatedAt || nowIso(),
    input.publishedAt || null,
  ]);
}

function updateCardRow(db, cardId, input) {
  knowledgeRun(db, `
    UPDATE knowledge_cards SET
      title = ?, summary = ?, content = ?, category = ?, module_ids_json = ?, industries_json = ?,
      stages_json = ?, goals_json = ?, methods_json = ?, keywords_json = ?, scenarios_json = ?,
      required_inputs_json = ?, output_template_json = ?, example = ?, applicable_when = ?,
      avoid_when = ?, evidence_json = ?, quality_score = ?, confidence = ?, status = ?, version = ?,
      reviewed_by = ?, updated_at = ?, published_at = ?
    WHERE id = ?
  `, [
    input.title,
    input.summary,
    input.content,
    input.category,
    JSON.stringify(input.moduleIds),
    JSON.stringify(input.industries),
    JSON.stringify(input.stages),
    JSON.stringify(input.goals),
    JSON.stringify(input.methods),
    JSON.stringify(input.keywords),
    JSON.stringify(input.scenarios),
    JSON.stringify(input.requiredInputs),
    JSON.stringify(input.outputTemplate),
    input.example,
    input.applicableWhen,
    input.avoidWhen,
    JSON.stringify(input.evidence || {}),
    normalizeScore(input.qualityScore, 60),
    normalizeConfidence(input.confidence, 0.6),
    normalizeCardStatus(input.status),
    input.version,
    normalizeId(input.reviewedBy),
    input.updatedAt,
    input.publishedAt || null,
    cardId,
  ]);
}

function insertVersion(db, cardId, version, action, snapshot, actorId, timestamp = nowIso()) {
  knowledgeRun(db, `
    INSERT INTO knowledge_versions (id, card_id, version, action, snapshot_json, actor_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [randomId(), cardId, version, action, JSON.stringify(snapshot), normalizeId(actorId), timestamp]);
}

function recordAudit(db, entityType, entityId, action, actorId, details = {}) {
  knowledgeRun(db, `
    INSERT INTO knowledge_audit (id, entity_type, entity_id, action, actor_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [randomId(), entityType, entityId, action, normalizeId(actorId), JSON.stringify(details || {}), nowIso()]);
}

function cardFromRow(row) {
  return {
    id: row.id,
    legacyKey: row.legacy_key || '',
    title: row.title || '',
    summary: row.summary || '',
    content: row.content || '',
    category: row.category || 'combined',
    moduleIds: parseArray(row.module_ids_json),
    industries: parseArray(row.industries_json),
    stages: parseArray(row.stages_json),
    goals: parseArray(row.goals_json),
    methods: parseArray(row.methods_json),
    keywords: parseArray(row.keywords_json),
    scenarios: parseArray(row.scenarios_json),
    requiredInputs: parseArray(row.required_inputs_json),
    outputTemplate: parseArray(row.output_template_json),
    example: row.example || '',
    applicableWhen: row.applicable_when || '',
    avoidWhen: row.avoid_when || '',
    sourceType: row.source_type || '',
    sourceRef: row.source_ref || '',
    evidence: parseObject(row.evidence_json),
    qualityScore: numberValue(row.quality_score),
    confidence: numberValue(row.confidence),
    status: row.status || 'draft',
    version: numberValue(row.version),
    createdBy: row.created_by || '',
    reviewedBy: row.reviewed_by || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    publishedAt: row.published_at || '',
  };
}

function candidateFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id || '',
    projectId: row.project_id || '',
    sourceType: row.source_type || '',
    sourceRef: row.source_ref || '',
    sourceSummary: row.source_summary || '',
    draft: normalizeCardDraft(parseObject(row.draft_json)),
    qualityScore: numberValue(row.quality_score),
    status: row.status || 'pending',
    createdBy: row.created_by || '',
    reviewedBy: row.reviewed_by || '',
    reviewedAt: row.reviewed_at || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function memoryFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id || '',
    projectId: row.project_id || '',
    moduleId: row.module_id || '',
    title: row.title || '',
    summary: row.summary || '',
    content: row.content || '',
    keywords: parseArray(row.keywords_json),
    evidence: parseObject(row.evidence_json),
    sourceType: row.source_type || '',
    sourceRef: row.source_ref || '',
    qualityScore: numberValue(row.quality_score),
    status: row.status || 'active',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function cardSnapshot(card) {
  return normalizeCardDraft(card);
}

function begin(db) {
  db.run('BEGIN TRANSACTION;');
}

function commit(db) {
  db.run('COMMIT;');
}

function rollback(db) {
  try {
    db.run('ROLLBACK;');
  } catch {
    // The original transaction error is more useful than a rollback error.
  }
}

function normalizeText(value, maxLength) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function normalizeShortText(value, maxLength) {
  return normalizeText(value, maxLength).replace(/\s+/g, ' ');
}

function normalizeId(value) {
  return normalizeShortText(value, 160);
}

function normalizeArray(value, maxItems, maxItemLength) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,，、;；|]/);
  const seen = new Set();
  const output = [];
  for (const item of source) {
    const normalized = normalizeShortText(item, maxItemLength);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }
  return output;
}

function normalizeScore(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(number, 100)) : fallback;
}

function normalizeConfidence(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(number, 1)) : fallback;
}

function normalizeCardStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return ['draft', 'published', 'disabled'].includes(status) ? status : 'draft';
}

function normalizeCandidateStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return ['pending', 'draft', 'published', 'rejected'].includes(status) ? status : 'pending';
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(Math.floor(number), max));
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function randomId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function notFound(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function invalidState(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
