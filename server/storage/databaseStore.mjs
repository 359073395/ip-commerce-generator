import path from 'node:path';
import { createSqlJsFileStore } from './sqlJsFileStore.mjs';

const rootDir = process.cwd();
const dataDir = process.env.APP_DATA_DIR || path.join(rootDir, 'data');
const databasePath = path.join(dataDir, 'app.db');
const store = createSqlJsFileStore({ databasePath, rootDir });

export async function getDatabase() {
  return store.getDatabase();
}

export async function persistDatabase(database) {
  return store.persistDatabase(database);
}

export async function waitForDatabaseWrites() {
  await store.waitForWrites();
}
