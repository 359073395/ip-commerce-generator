import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const dataDir = process.env.APP_DATA_DIR || path.join(rootDir, 'data');
const profilePath = path.join(dataDir, 'project-profile.json');

const allowedFields = [
  'projectName',
  'industry',
  'persona',
  'offer',
  'audience',
  'proof',
  'conversion',
  'voice',
  'ipPositioningSummary',
  'notes',
];

export async function loadProjectProfile() {
  try {
    const raw = await fs.readFile(profilePath, 'utf8');
    return normalizeProfile(JSON.parse(raw));
  } catch (error) {
    if (error.code === 'ENOENT') return emptyProjectProfile();
    return {
      ...emptyProjectProfile(),
      loadError: error.message,
    };
  }
}

export async function saveProjectProfile(input = {}) {
  const profile = normalizeProfile(input);
  profile.updatedAt = new Date().toISOString();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  return profile;
}

export function projectProfileIsEmpty(profile = {}) {
  return allowedFields.every((field) => !String(profile[field] || '').trim());
}

export function formatProjectProfile(profile = {}) {
  if (projectProfileIsEmpty(profile)) return '尚未保存项目档案。';
  return allowedFields
    .map((field) => [field, String(profile[field] || '').trim()])
    .filter(([, value]) => value)
    .map(([field, value]) => `${field}=${value}`)
    .join('；');
}

function emptyProjectProfile() {
  return {
    projectName: '',
    industry: '',
    persona: '',
    offer: '',
    audience: '',
    proof: '',
    conversion: '',
    voice: '',
    ipPositioningSummary: '',
    notes: '',
    updatedAt: null,
  };
}

function normalizeProfile(input = {}) {
  const profile = emptyProjectProfile();
  for (const field of allowedFields) {
    profile[field] = truncate(String(input[field] || '').trim(), 3000);
  }
  profile.updatedAt = input.updatedAt || null;
  return profile;
}

function truncate(value, maxLength) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
