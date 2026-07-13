import path from 'node:path';
import { initializePrivateKnowledgeSystem } from '../server/knowledge/privateKnowledgeMigration.mjs';

const args = process.argv.slice(2);
const forceImport = args.includes('--force');
const sourceArg = args.find((item) => item !== '--force');
const legacyKnowledgeDir = sourceArg
  ? path.resolve(sourceArg)
  : process.env.LEGACY_KNOWLEDGE_DIR;

try {
  const result = await initializePrivateKnowledgeSystem({ legacyKnowledgeDir, forceImport });
  console.log(JSON.stringify({
    ok: result.ok,
    publishedCards: result.publishedCards,
    pendingCandidates: result.pendingCandidates,
    activeProjectMemories: result.activeProjectMemories,
    minimumCards: result.minimumCards,
    migration: result.migration,
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error.code || 'PRIVATE_KNOWLEDGE_MIGRATION_FAILED', message: error.message }, null, 2));
  process.exitCode = 1;
}
