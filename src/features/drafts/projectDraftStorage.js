const draftVersion = 1;

export function loadProjectDraft(storageKey) {
  if (!storageKey) return null;
  try {
    const parsed = JSON.parse(window.localStorage?.getItem(storageKey) || 'null');
    if (!parsed || parsed.version !== draftVersion) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProjectDraft(storageKey, draft) {
  if (!storageKey) return;
  window.localStorage?.setItem(storageKey, JSON.stringify({
    version: draftVersion,
    savedAt: new Date().toISOString(),
    ...draft,
  }));
}
