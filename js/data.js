const unitsFile = new URL('../data/lerneinheiten.json', import.meta.url);

export async function loadData() {
  const url = new URL(unitsFile);
  url.searchParams.set('v', Date.now());
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Lerninhalte: HTTP ${response.status}`);
  const data = await response.json();
  validateRelations(data);
  return data;
}

export function validateRelations(data) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.weeks) || !Array.isArray(data.units)) {
    throw new Error('Unbekanntes Datenformat');
  }
  const ids = new Set();
  const weekNumbers = new Set();
  const unique = (set, key, label) => {
    if (set.has(key)) throw new Error(`Doppelte ${label}: ${key}`);
    set.add(key);
  };

  for (const week of data.weeks) {
    unique(weekNumbers, week.num, 'Wochennummer');
    if (week.from > week.to) throw new Error(`Ungültiger Zeitraum in Woche ${week.num}`);
    for (const task of week.tasks) {
      unique(ids, task.id, 'ID');
      const date = new Date(`${task.date}T00:00:00Z`);
      const day = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][date.getUTCDay()];
      if (task.date < week.from || task.date > week.to || day !== task.day) {
        throw new Error(`Ungültiger Lerntag: ${task.id}`);
      }
      if (task.unitId && (task.unitId.startsWith('Strafrecht:') !== (task.area === 'Strafrecht'))) {
        throw new Error(`Falsches Rechtsgebiet: ${task.id}`);
      }
    }
  }
  for (const unit of data.units) {
    unique(ids, unit.id, 'ID');
    if (unit.id !== `${unit.section}:${unit.number}` ||
        unit.subject !== (unit.section === 'Strafrecht' ? 'Strafrecht' : 'Öffentliches Recht')) {
      throw new Error(`Falsche Zuordnung: ${unit.id}`);
    }
    const refs = new Set();
    for (const entry of unit.literature) {
      unique(ids, entry.id, 'ID');
      if (!entry.id.startsWith(unit.id + ':')) throw new Error(`Falsche Einheit: ${entry.id}`);
      const reference = entry.reference.normalize('NFKC').trim().toLocaleLowerCase('de').replace(/\s+/g, ' ');
      unique(refs, entry.type + '|' + reference, 'Fundstelle in ' + unit.id);
      if (entry.scheduledOn && (entry.type !== 'Lerngruppenfall' ||
          new Date(`${entry.scheduledOn}T00:00:00Z`).getUTCDay() !== 0 ||
          (unit.publishedOn && entry.scheduledOn < unit.publishedOn))) {
        throw new Error(`Ungültiger Lerngruppentermin: ${entry.id}`);
      }
    }
  }
}

export function validateRetainedIds(previous, current) {
  const tasks = new Map(current.weeks.flatMap(week => week.tasks).map(task => [task.id, task]));
  const units = new Map(current.units.map(unit => [unit.id, unit]));
  for (const task of previous.weeks.flatMap(week => week.tasks)) {
    if (tasks.get(task.id)?.area !== task.area) throw new Error(`Aufgaben-ID fehlt oder wurde umgewidmet: ${task.id}`);
  }
  for (const unit of previous.units) {
    const replacement = units.get(unit.id);
    if (!replacement) throw new Error(`Lerneinheit fehlt: ${unit.id}`);
    const entries = new Map(replacement.literature.map(entry => [entry.id, entry]));
    for (const entry of unit.literature) {
      if (entries.get(entry.id)?.type !== entry.type) {
        throw new Error(`Literatur-ID fehlt oder wurde umgewidmet: ${entry.id}`);
      }
    }
  }
}
