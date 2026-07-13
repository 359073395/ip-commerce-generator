import path from 'node:path';
import multer from 'multer';
import { getGenerationRecordForUser, getProjectForUser } from '../database.mjs';
import { parseKnowledgeDocument, knowledgeUploadAccept } from './knowledgeDocumentParser.mjs';
import {
  createPrivateKnowledgeBackup,
  getPrivateKnowledgeBackupPath,
  getPrivateKnowledgeDatabaseStatus,
  listPrivateKnowledgeBackups,
  restorePrivateKnowledgeBackup,
} from './privateKnowledgeDatabase.mjs';
import { createKnowledgeCandidatesFromText } from './privateKnowledgeIngestion.mjs';
import { recordResultFeedback } from './privateKnowledgeFeedback.mjs';
import {
  deleteProjectMemoryForUser,
  getPrivateKnowledgeOverview,
  listKnowledgeCards,
  listKnowledgeCandidates,
  listKnowledgeCardVersions,
  listProjectMemories,
  publishKnowledgeCandidate,
  rejectKnowledgeCandidate,
  restoreKnowledgeCardVersion,
  setProjectMemoryStatusByAdmin,
  setKnowledgeCardStatus,
  updateKnowledgeCandidate,
  updateKnowledgeCard,
} from './privateKnowledgeRepository.mjs';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: positiveInteger(process.env.KNOWLEDGE_UPLOAD_MAX_BYTES, 10 * 1024 * 1024),
  },
});

export function registerKnowledgeRoutes(app, requireAdmin) {
  app.get('/api/admin/knowledge/status', requireAdmin, asyncRoute(async (_req, res) => {
    const [database, overview, backups] = await Promise.all([
      getPrivateKnowledgeDatabaseStatus(),
      getPrivateKnowledgeOverview(),
      listPrivateKnowledgeBackups(),
    ]);
    res.json({
      ok: true,
      database,
      overview,
      backups: backups.slice(0, 10),
      uploadAccept: knowledgeUploadAccept(),
    });
  }));

  app.get('/api/admin/knowledge/cards', requireAdmin, asyncRoute(async (req, res) => {
    res.json({
      ok: true,
      cards: await listKnowledgeCards({
        status: String(req.query.status || '') || undefined,
        category: String(req.query.category || '') || undefined,
        query: String(req.query.q || '') || undefined,
        limit: req.query.limit,
      }),
    });
  }));

  app.patch('/api/admin/knowledge/cards/:cardId', requireAdmin, asyncRoute(async (req, res) => {
    const card = await updateKnowledgeCard(req.params.cardId, req.body || {}, req.user.id);
    res.json({ ok: true, card });
  }));

  app.post('/api/admin/knowledge/cards/:cardId/status', requireAdmin, asyncRoute(async (req, res) => {
    const card = await setKnowledgeCardStatus(req.params.cardId, req.body?.status, req.user.id);
    res.json({ ok: true, card });
  }));

  app.get('/api/admin/knowledge/cards/:cardId/versions', requireAdmin, asyncRoute(async (req, res) => {
    res.json({ ok: true, versions: await listKnowledgeCardVersions(req.params.cardId) });
  }));

  app.post('/api/admin/knowledge/cards/:cardId/versions/:versionId/restore', requireAdmin, asyncRoute(async (req, res) => {
    const card = await restoreKnowledgeCardVersion(req.params.cardId, req.params.versionId, req.user.id);
    res.json({ ok: true, card });
  }));

  app.get('/api/admin/knowledge/candidates', requireAdmin, asyncRoute(async (req, res) => {
    res.json({
      ok: true,
      candidates: await listKnowledgeCandidates({
        status: String(req.query.status || 'pending'),
        userId: String(req.query.userId || '') || undefined,
        projectId: String(req.query.projectId || '') || undefined,
        limit: req.query.limit,
      }),
    });
  }));

  app.patch('/api/admin/knowledge/candidates/:candidateId', requireAdmin, asyncRoute(async (req, res) => {
    const candidate = await updateKnowledgeCandidate(req.params.candidateId, req.body || {}, req.user.id);
    res.json({ ok: true, candidate });
  }));

  app.post('/api/admin/knowledge/candidates/:candidateId/publish', requireAdmin, asyncRoute(async (req, res) => {
    const card = await publishKnowledgeCandidate(req.params.candidateId, req.user.id);
    res.json({ ok: true, card });
  }));

  app.post('/api/admin/knowledge/candidates/:candidateId/reject', requireAdmin, asyncRoute(async (req, res) => {
    const candidate = await rejectKnowledgeCandidate(req.params.candidateId, req.user.id, req.body?.reason);
    res.json({ ok: true, candidate });
  }));

  app.post('/api/admin/knowledge/ingest', requireAdmin, asyncRoute(async (req, res) => {
    const title = String(req.body?.title || '管理员补充资料').trim();
    const result = await createKnowledgeCandidatesFromText({
      text: req.body?.text,
      title,
      sourceType: 'admin_text',
      sourceRef: `admin-text:${Date.now()}:${title.slice(0, 80)}`,
      adminUserId: req.user.id,
    });
    res.json({ ok: true, ...result });
  }));

  app.post('/api/admin/knowledge/upload', requireAdmin, uploadSingle, asyncRoute(async (req, res) => {
    if (!req.file) throw requestError('KNOWLEDGE_FILE_REQUIRED', '请选择要上传的资料文件。');
    const parsed = await parseKnowledgeDocument({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    const result = await createKnowledgeCandidatesFromText({
      text: parsed.text,
      title: String(req.body?.title || parsed.title).trim(),
      sourceType: 'admin_upload',
      sourceRef: `upload:${Date.now()}:${parsed.originalName}`,
      adminUserId: req.user.id,
    });
    res.json({
      ok: true,
      ...result,
      source: { ...result.source, originalName: parsed.originalName, warnings: parsed.warnings },
    });
  }));

  app.get('/api/admin/knowledge/project-memories', requireAdmin, asyncRoute(async (req, res) => {
    res.json({
      ok: true,
      memories: await listProjectMemories({
        userId: String(req.query.userId || '') || undefined,
        projectId: String(req.query.projectId || '') || undefined,
        status: String(req.query.status || 'active'),
        limit: req.query.limit,
      }),
    });
  }));

  app.post('/api/admin/knowledge/project-memories/:memoryId/status', requireAdmin, asyncRoute(async (req, res) => {
    const memory = await setProjectMemoryStatusByAdmin(req.params.memoryId, req.body?.status, req.user.id);
    res.json({ ok: true, memory });
  }));

  app.get('/api/admin/knowledge/backups', requireAdmin, asyncRoute(async (_req, res) => {
    res.json({ ok: true, backups: await listPrivateKnowledgeBackups() });
  }));

  app.post('/api/admin/knowledge/backups', requireAdmin, asyncRoute(async (_req, res) => {
    res.json({ ok: true, backup: await createPrivateKnowledgeBackup({ kind: 'manual' }) });
  }));

  app.get('/api/admin/knowledge/backups/:fileName/download', requireAdmin, asyncRoute(async (req, res) => {
    const backupPath = await getPrivateKnowledgeBackupPath(req.params.fileName);
    if (!backupPath) throw requestError('KNOWLEDGE_BACKUP_NOT_FOUND', '备份文件不存在。', 404);
    res.download(backupPath, path.basename(backupPath));
  }));

  app.post('/api/admin/knowledge/backups/:fileName/restore', requireAdmin, asyncRoute(async (req, res) => {
    if (req.body?.confirm !== req.params.fileName) {
      throw requestError('KNOWLEDGE_RESTORE_CONFIRMATION_REQUIRED', '恢复知识库前必须确认备份文件名。');
    }
    const database = await restorePrivateKnowledgeBackup(req.params.fileName);
    res.json({ ok: true, database });
  }));

  app.get('/api/knowledge/project-memories', asyncRoute(async (req, res) => {
    const projectId = String(req.query.projectId || '');
    const project = await getProjectForUser(req.user.id, projectId);
    if (!project) throw requestError('PROJECT_NOT_FOUND', '项目不存在或无权访问。', 404);
    res.json({
      ok: true,
      memories: await listProjectMemories({ userId: req.user.id, projectId, status: 'active', limit: req.query.limit }),
    });
  }));

  app.delete('/api/knowledge/project-memories/:memoryId', asyncRoute(async (req, res) => {
    const projectId = String(req.query.projectId || req.body?.projectId || '');
    const project = await getProjectForUser(req.user.id, projectId);
    if (!project) throw requestError('PROJECT_NOT_FOUND', '项目不存在或无权访问。', 404);
    await deleteProjectMemoryForUser(req.user.id, projectId, req.params.memoryId);
    res.json({ ok: true });
  }));

  app.post('/api/knowledge/feedback', asyncRoute(async (req, res) => {
    const projectId = String(req.body?.projectId || '');
    const project = await getProjectForUser(req.user.id, projectId);
    if (!project) throw requestError('PROJECT_NOT_FOUND', '项目不存在或无权访问。', 404);
    const record = await getGenerationRecordForUser(req.user.id, String(req.body?.generationRecordId || ''));
    const learning = await recordResultFeedback({
      userId: req.user.id,
      projectId,
      moduleId: String(req.body?.moduleId || ''),
      generationRecord: record,
      helpful: req.body?.helpful === true,
      correctedText: req.body?.correctedText,
      notes: req.body?.notes,
    });
    res.json({ ok: true, learning });
  }));
}

function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({
      ok: false,
      code: error.code || 'KNOWLEDGE_UPLOAD_FAILED',
      message: error.code === 'LIMIT_FILE_SIZE' ? '上传文件超过大小限制。' : error.message,
    });
  });
}

function asyncRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const status = Number(error.statusCode || error.status) || statusForCode(error.code);
      res.status(status).json({
        ok: false,
        code: error.code || 'KNOWLEDGE_REQUEST_FAILED',
        message: error.message,
      });
    }
  };
}

function statusForCode(code) {
  if (String(code || '').includes('NOT_FOUND')) return 404;
  if (String(code || '').includes('UNAVAILABLE')) return 503;
  return 400;
}

function requestError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}
