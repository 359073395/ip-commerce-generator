import { createPrivateKnowledgeBackup, getPrivateKnowledgeDatabaseStatus } from '../server/knowledge/privateKnowledgeDatabase.mjs';

try {
  const backup = await createPrivateKnowledgeBackup({ kind: 'manual' });
  const status = await getPrivateKnowledgeDatabaseStatus();
  console.log(JSON.stringify({ ok: true, backup, knowledge: status }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error.code || 'PRIVATE_KNOWLEDGE_BACKUP_FAILED', message: error.message }, null, 2));
  process.exitCode = 1;
}
