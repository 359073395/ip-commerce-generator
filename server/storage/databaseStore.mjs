import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';

const rootDir = process.cwd();
const dataDir = process.env.APP_DATA_DIR || path.join(rootDir, 'data');
const databasePath = path.join(dataDir, 'app.db');

let databasePromise;
let persistenceQueue = Promise.resolve();

export async function getDatabase() {
  if (!databasePromise) databasePromise = openDatabase();
  return databasePromise;
}

export async function persistDatabase(database) {
  const snapshot = Buffer.from(database.export());
  const write = persistenceQueue.then(() => writeSnapshot(snapshot));
  persistenceQueue = write.catch(() => {});
  return write;
}

export async function waitForDatabaseWrites() {
  await persistenceQueue;
}

async function openDatabase() {
  await fs.mkdir(dataDir, { recursive: true });
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(rootDir, 'node_modules', 'sql.js', 'dist', file),
  });

  try {
    const bytes = await fs.readFile(databasePath);
    return new SQL.Database(bytes);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return new SQL.Database();
  }
}

async function writeSnapshot(snapshot) {
  await fs.mkdir(dataDir, { recursive: true });
  const temporaryPath = `${databasePath}.${process.pid}.${Date.now()}.tmp`;
  const handle = await fs.open(temporaryPath, 'w');

  try {
    await handle.writeFile(snapshot);
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await fs.rename(temporaryPath, databasePath);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error.code)) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
    // Windows cannot always replace an open destination with rename. Linux/VPS uses
    // the atomic path above; this fallback still keeps the fully flushed temp file.
    await fs.copyFile(temporaryPath, databasePath);
    await fs.rm(temporaryPath, { force: true });
  }
}
