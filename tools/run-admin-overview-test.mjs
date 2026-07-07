import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-admin-overview-'));
process.env.APP_DATA_DIR = tempDir;
process.env.ADMIN_USERNAME = 'admin';
process.env.INITIAL_ADMIN_PASSWORD = 'admin-test-pass';

const {
  createProjectForUser,
  createUser,
  getAdminOverview,
  initializeDatabase,
  listProjectsForUser,
  loginUser,
  recordAgentTask,
  recordGeneration,
} = await import('../server/database.mjs');

try {
  await initializeDatabase();

  const adminLogin = await loginUser('admin', 'admin-test-pass');
  const createdUser = await createUser({
    username: 'creator-overview',
    password: 'creator-pass',
    role: 'user',
    dailyLimit: 3,
  });
  const userLogin = await loginUser('creator-overview', 'creator-pass');
  assert.equal(userLogin.user.role, 'user');

  const defaultProjects = await listProjectsForUser(createdUser.id);
  assert.equal(defaultProjects.length, 1, 'new user should receive a default project');

  const project = await createProjectForUser(createdUser.id, {
    name: 'overview project',
    profile: {
      projectName: 'overview project',
      industry: 'local service',
      persona: 'personal IP',
      offer: 'course and booking',
    },
  });

  await recordGeneration(createdUser.id, project.id, 'pain-topic');
  await recordGeneration(createdUser.id, project.id, 'deal-topic');
  await recordAgentTask(createdUser.id, project.id, 'help me plan a conversion content workflow', {
    status: 'ready',
    recommendedModuleId: 'deal-topic',
  });

  const overview = await getAdminOverview();
  assert.equal(overview.totals.totalUsers, 2, 'overview should include admin and created user');
  assert.equal(overview.totals.activeUsers, 2, 'both users should be active');
  assert.equal(overview.totals.totalProjects, 3, 'admin default, user default, and user second project should be counted');
  assert.equal(overview.totals.totalGenerations, 2, 'generation logs should be counted exactly once');
  assert.equal(overview.totals.todayGenerations, 2, 'today generation logs should be counted');
  assert.equal(overview.totals.totalAgentTasks, 1, 'agent task should be counted');
  assert.equal(overview.totals.todayAgentTasks, 1, 'today agent task should be counted');

  const userStats = overview.users.find((user) => user.id === createdUser.id);
  assert.ok(userStats, 'created user should have admin stats row');
  assert.equal(userStats.projectCount, 2, 'created user should have two projects');
  assert.equal(userStats.generationCount, 2, 'created user generation count should be exact');
  assert.equal(userStats.todayGenerationCount, 2, 'created user today count should be exact');
  assert.equal(userStats.agentTaskCount, 1, 'created user agent task count should be exact');
  assert.equal(userStats.quota.usedToday, 2, 'quota usage should match today generation count');
  assert.equal(userStats.quota.remainingToday, 1, 'quota remaining should respect daily limit');
  assert.ok(userStats.lastActivityAt, 'last activity should be available');

  const adminStats = overview.users.find((user) => user.id === adminLogin.user.id);
  assert.equal(adminStats.projectCount, 1, 'admin default project should be counted');
  assert.equal(adminStats.quota.remainingToday, null, 'admin unlimited quota should be represented as null remaining');

  assert.equal(overview.recentTasks.length, 1, 'recent task should be present');
  assert.equal(overview.recentTasks[0].username, 'creator-overview');
  assert.equal(overview.recentTasks[0].projectName, 'overview project');
  assert.equal(overview.recentGenerations.length, 2, 'recent generations should be present');
  assert.ok(overview.recentGenerations.some((item) => item.moduleId === 'pain-topic'));

  console.log(JSON.stringify({
    ok: true,
    totals: overview.totals,
    user: {
      username: userStats.username,
      projectCount: userStats.projectCount,
      generationCount: userStats.generationCount,
      agentTaskCount: userStats.agentTaskCount,
      quota: userStats.quota,
    },
    message: 'Admin overview statistics passed.',
  }, null, 2));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
