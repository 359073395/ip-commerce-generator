import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';

let sqlPromise;

export function createSqlJsFileStore({ databasePath, rootDir = process.cwd() }) {
  let databasePromise;
  let persistenceQueue = Promise.resolve();

  async function getDatabase() {
    if (!databasePromise) databasePromise = openDatabase();
    return databasePromise;
  }

  async function persistDatabase(database) {
    const snapshot = Buffer.from(database.export());
    const write = persistenceQueue.then(() => writeSnapshot(snapshot));
    persistenceQueue = write.catch(() => {});
    return write;
  }

  async function waitForWrites() {
    await persistenceQueue;
  }

  async function replaceDatabase(snapshot) {
    await waitForWrites();
    const SQL = await getSql(rootDir);
    const nextDatabase = new SQL.Database(snapshot);
    const previousDatabase = await getDatabase();
    databasePromise = Promise.resolve(nextDatabase);
    await writeSnapshot(Buffer.from(snapshot));
    previousDatabase.close();
    return nextDatabase;
  }

  async function openDatabase() {
    await fs.mkdir(path.dirname(databasePath), { recursive: true });
    const SQL = await getSql(rootDir);

    try {
      const bytes = await fs.readFile(databasePath);
      return new SQL.Database(bytes);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return new SQL.Database();
    }
  }

  async function writeSnapshot(snapshot) {
    await fs.mkdir(path.dirname(databasePath), { recursive: true });
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
      await fs.copyFile(temporaryPath, databasePath);
      await fs.rm(temporaryPath, { force: true });
    }
  }

  return {
    databasePath,
    getDatabase,
    persistDatabase,
    replaceDatabase,
    waitForWrites,
  };
}

function getSql(rootDir) {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file) => path.join(rootDir, 'node_modules', 'sql.js', 'dist', file),
    });
  }
  return sqlPromise;
}
