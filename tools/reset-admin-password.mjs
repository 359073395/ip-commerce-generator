import { createUser, initializeDatabase, listUsers, updateUser } from '../server/database.mjs';

const username = String(process.argv[2] || process.env.ADMIN_USERNAME || 'admin').trim();
const password = String(process.argv[3] || process.env.INITIAL_ADMIN_PASSWORD || 'lhw111111').trim();

if (!username || !password) {
  console.error('Usage: node tools/reset-admin-password.mjs <username> <new-password>');
  process.exit(1);
}

await initializeDatabase();

const users = await listUsers();
const existing = users.find((user) => user.username === username);

if (existing) {
  await updateUser(existing.id, {
    role: 'admin',
    status: 'active',
    dailyLimit: 0,
    password,
  });
  console.log(JSON.stringify({
    ok: true,
    action: 'updated',
    username,
    message: 'Admin password reset. Restart the app service before logging in.',
  }, null, 2));
} else {
  await createUser({
    username,
    password,
    role: 'admin',
    dailyLimit: 0,
  });
  console.log(JSON.stringify({
    ok: true,
    action: 'created',
    username,
    message: 'Admin user created. Restart the app service before logging in.',
  }, null, 2));
}
