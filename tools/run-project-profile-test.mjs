import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-commerce-profile-'));
process.env.APP_DATA_DIR = tempDir;

const {
  formatProjectProfile,
  loadProjectProfile,
  projectProfileIsEmpty,
  saveProjectProfile,
} = await import('../server/projectProfile.mjs');

const empty = await loadProjectProfile();
assert.equal(projectProfileIsEmpty(empty), true, 'new profile should be empty');

const saved = await saveProjectProfile({
  projectName: '本地美业IP项目',
  industry: '美业',
  persona: '服务型个人IP',
  offer: '到店护理和团购券',
  audience: '本地有变美需求的年轻女性',
  proof: '真实客户反馈和前后对比',
  conversion: '私信、预约到店、团购券',
  voice: '专业、直接、有陪伴感',
  ipPositioningSummary: '用专业审美和真实案例帮助本地用户做选择。',
  notes: '不要夸大效果。',
});

assert.equal(projectProfileIsEmpty(saved), false, 'saved profile should not be empty');
assert.ok(saved.updatedAt, 'saved profile should have updatedAt');

const loaded = await loadProjectProfile();
assert.equal(loaded.industry, '美业');
assert.ok(formatProjectProfile(loaded).includes('美业'));
assert.ok(formatProjectProfile(loaded).includes('团购券'));

await fs.rm(tempDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  message: 'Project profile storage passed.',
}, null, 2));

