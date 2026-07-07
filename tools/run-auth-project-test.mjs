import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-auth-'));
process.env.APP_DATA_DIR = tempDir;
process.env.ADMIN_USERNAME = 'admin';
process.env.INITIAL_ADMIN_PASSWORD = 'admin-test-pass';

const {
  assertGenerationAllowed,
  createProjectForUser,
  createUser,
  getProjectForUser,
  initializeDatabase,
  listProjectsForUser,
  listUsers,
  loginUser,
  recordGeneration,
  updateProjectForUser,
  updateUser,
} = await import('../server/database.mjs');

try {
  await initializeDatabase();

  const adminLogin = await loginUser('admin', 'admin-test-pass');
  assert.equal(adminLogin.user.role, 'admin', 'bootstrap user should be admin');

  const usersAfterBootstrap = await listUsers();
  assert.equal(usersAfterBootstrap.length, 1, 'bootstrap should create exactly one admin user');

  const adminProjects = await listProjectsForUser(adminLogin.user.id);
  assert.equal(adminProjects.length, 1, 'admin should receive a default project');

  const createdUser = await createUser({
    username: 'creator-a',
    password: 'creator-pass',
    role: 'user',
    dailyLimit: 1,
  });
  assert.equal(createdUser.username, 'creator-a');
  assert.equal(createdUser.role, 'user');
  assert.equal(createdUser.daily_limit, 1);

  const userLogin = await loginUser('creator-a', 'creator-pass');
  assert.equal(userLogin.user.dailyLimit, 1, 'login payload should include daily limit');

  const userProjects = await listProjectsForUser(userLogin.user.id);
  assert.equal(userProjects.length, 1, 'new user should receive a private default project');
  assert.notEqual(userProjects[0].id, adminProjects[0].id, 'user project should not reuse admin project');

  const blockedAdminProject = await getProjectForUser(userLogin.user.id, adminProjects[0].id);
  assert.equal(blockedAdminProject, null, 'user should not access admin project by id');

  const updatedUserProject = await updateProjectForUser(userLogin.user.id, userProjects[0].id, {
    name: 'creator-a project',
    profile: {
      projectName: 'creator-a project',
      industry: 'local beauty',
      persona: 'service IP',
      offer: 'store booking and coupons',
      audience: 'nearby users with beauty needs',
      proof: 'real customer feedback',
      conversion: 'DM and booking',
    },
  });
  assert.equal(updatedUserProject.profile.industry, 'local beauty');
  assert.equal(updatedUserProject.name, 'creator-a project');

  const secondProject = await createProjectForUser(userLogin.user.id, {
    name: 'creator-a second project',
    profile: { industry: 'storage service', persona: 'expert consultant' },
  });
  assert.equal(secondProject.profile.industry, 'storage service');

  const twoProjects = await listProjectsForUser(userLogin.user.id);
  assert.equal(twoProjects.length, 2, 'user should support multiple projects');

  await recordGeneration(userLogin.user.id, updatedUserProject.id, 'ip-positioning');
  await assert.rejects(
    () => assertGenerationAllowed(userLogin.user),
    (error) => error.code === 'DAILY_LIMIT_REACHED',
    'daily limit should block after one generation',
  );

  await updateUser(createdUser.id, { status: 'disabled' });
  await assert.rejects(
    () => loginUser('creator-a', 'creator-pass'),
    (error) => error.code === 'INVALID_LOGIN',
    'disabled user should not be able to login',
  );

  console.log(JSON.stringify({
    ok: true,
    users: (await listUsers()).length,
    adminProjects: adminProjects.length,
    userProjects: twoProjects.length,
    message: 'SQLite auth and per-user project isolation passed.',
  }, null, 2));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
