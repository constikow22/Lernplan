const format = 'rep2plus-68-progress-v1';
const keys = {
  checks: 'rep2plus-selfstudy-68-v1',
  readChecks: 'rep2plus-68-reading-v1',
  literatureChecks: 'rep2plus-68-literature-v1',
};

function checkboxMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Ungültige Häkchenliste');
  }
  const entries = Object.entries(value);
  if (entries.some(([id, checked]) => !/^[\p{L}\p{N}][\p{L}\p{N}:_-]*$/u.test(id) || typeof checked !== 'boolean')) {
    throw new Error('Ungültiger Häkcheneintrag');
  }
  return Object.assign(Object.create(null), Object.fromEntries(entries));
}

export function loadProgress(storage) {
  return Object.fromEntries(Object.entries(keys).map(([name, key]) => {
    try {
      return [name, checkboxMap(JSON.parse(storage.getItem(key) ?? '{}'))];
    } catch {
      return [name, Object.create(null)];
    }
  }));
}

export function saveProgress(storage, progress) {
  for (const [name, key] of Object.entries(keys)) {
    storage.setItem(key, JSON.stringify(progress[name]));
  }
}

export function exportProgress(progress) {
  return JSON.stringify({ format, ...progress }, null, 2);
}

export function importProgress(text, current) {
  const backup = JSON.parse(text);
  if (!backup || backup.format !== format) throw new Error('Ungültiges Backupformat');
  const imported = { checks: checkboxMap(backup.checks) };
  for (const name of ['readChecks', 'literatureChecks']) {
    imported[name] = Object.hasOwn(backup, name) ? checkboxMap(backup[name]) : {};
  }
  return Object.fromEntries(Object.keys(keys).map(name => [
    name,
    Object.assign(Object.create(null), current[name], imported[name]),
  ]));
}
