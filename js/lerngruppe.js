const storageKey = 'rep2plus_dashboard_2026_27_v1';
const backupFormat = 'rep2plus-68-lerngruppe-v1';
const $ = id => document.getElementById(id);

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function formatDate(date) {
  return date.split('-').reverse().join('.');
}

function unitLabel(unitId) {
  return unitId.replace(':', ' LE ');
}

function caseLabel(entry) {
  if (entry.status === 'placeholder') return `${unitLabel(entry.unitId)} – Fall ${entry.slot}`;
  const reference = `${entry.authors.join('/')}, ${entry.reference}`;
  return entry.title ? `${reference} – ${entry.title}` : reference;
}

function getProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter(id => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function importCsv(text, sessions) {
  // The old dashboard exports each field quoted, including fields containing semicolons.
  const rows = text.trim().split(/\r?\n/).map(line => {
    if (!/^"(?:[^"]|"")*"(?:;"(?:[^"]|"")*"){4}$/.test(line)) throw new Error('Ungültige CSV-Zeile');
    return [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(match => match[1].replaceAll('""', '"'));
  });
  if (rows.shift()?.join(';') !== 'Datum;Rechtsgebiet;Fall;Status;Typ') throw new Error('Unbekanntes CSV-Format');
  const lookup = new Map(sessions.flatMap(s => s.cases.map(c => [
    [formatDate(s.date), s.subject, caseLabel(c)].join('\u0000'), c.id,
  ])));
  const ids = [];
  let unmatched = 0;
  for (const [date, subject, name, status] of rows) {
    if (status !== 'Erledigt') continue;
    const id = lookup.get([date, subject, name].join('\u0000'));
    if (id) ids.push(id);
    else unmatched++;
  }
  return { ids, unmatched };
}

function start(sessions) {
  const checked = getProgress();
  const cases = sessions.flatMap(session => session.cases);
  const host = $('group-weeks');
  const open = new Set([sessions[0].id]);
  const note = $('group-note');
  const subjectFilter = $('group-subject');
  const statusFilter = $('group-status');
  $('group-sessions').textContent = sessions.length;
  $('group-placeholders').textContent = cases.filter(entry => entry.status === 'placeholder').length;

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...checked]));
      return true;
    } catch {
      note.textContent = 'Der Browser kann den Fortschritt gerade nur für diese Sitzung halten. Sichere ihn als Datei.';
      return false;
    }
  }

  function render(focusId) {
    const count = cases.filter(entry => checked.has(entry.id)).length;
    $('group-done').textContent = `${count} / ${cases.length}`;
    $('group-bar').style.width = `${100 * count / cases.length}%`;
    host.replaceChildren();
    const area = subjectFilter.value;
    const status = statusFilter.value;
    let focus;
    for (const session of sessions) {
      if (area !== 'all' && area !== session.subject) continue;
      const visible = session.cases.filter(entry =>
        status === 'all' || checked.has(entry.id) === (status === 'done'));
      if (!visible.length) continue;

      const card = element('details', 'week');
      card.open = open.has(session.id);
      card.addEventListener('toggle', () => {
        if (!card.isConnected) return;
        if (card.open) open.add(session.id);
        else open.delete(session.id);
      });
      const head = element('summary', 'week-head group-summary');
      const label = element('div');
      const units = [...new Set(session.cases.map(entry => unitLabel(entry.unitId)))];
      label.append(element('strong', '', `Sonntag · ${formatDate(session.date)}`),
        element('div', 'group-subject', session.subject),
        element('div', 'group-units', units.join(' · ')));
      const completed = session.cases.filter(entry => checked.has(entry.id)).length;
      head.append(label, element('span', 'count', `${completed} / ${session.cases.length} Fälle erledigt`));
      const list = element('div', 'group-cases');
      for (const entry of visible) {
        const row = element('label', `task ${session.subject === 'Strafrecht' ? 'st' : 'oe'}` + (checked.has(entry.id) ? ' done' : ''));
        const checkbox = element('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked.has(entry.id);
        checkbox.dataset.caseId = entry.id;
        const body = element('div');
        body.append(element('div', 'tt', caseLabel(entry)), element('span', 'tag', unitLabel(entry.unitId)));
        if (entry.status === 'placeholder') body.append(element('span', 'tag group-placeholder', 'Platzhalter'));
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) checked.add(entry.id);
          else checked.delete(entry.id);
          if (card.open) open.add(session.id);
          if (persist()) note.textContent = '';
          render(entry.id);
        });
        if (entry.id === focusId) focus = checkbox;
        row.append(checkbox, body);
        list.append(row);
      }
      card.append(head, list);
      host.append(card);
    }
    if (!host.childElementCount) host.append(element('p', 'empty', 'Keine passenden Fälle gefunden.'));
    focus?.focus({ preventScroll: true });
  }

  subjectFilter.addEventListener('change', () => render());
  statusFilter.addEventListener('change', () => render());
  $('group-backup').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ format: backupFormat, checked: [...checked] }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = element('a');
    anchor.href = url;
    anchor.download = 'Rep2plus_68_Lerngruppe_Fortschritt.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const input = $('group-file');
  $('group-restore').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      let result;
      if (!content.trimStart().startsWith('{')) {
        result = importCsv(content, sessions);
      } else {
        const data = JSON.parse(content);
        if (data.format !== backupFormat || !Array.isArray(data.checked) ||
            data.checked.some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id))) {
          throw new Error('Unbekanntes Backup-Format');
        }
        result = { ids: data.checked, unmatched: 0 };
      }
      for (const id of result.ids) checked.add(id);
      if (persist()) {
        note.textContent = `${result.ids.length} Häkchen übernommen.` +
          (result.unmatched ? ` ${result.unmatched} CSV-Einträge konnten nicht eindeutig zugeordnet werden.` : '');
      }
      render();
    } catch {
      note.textContent = 'Die Datei konnte nicht als Lerngruppen-Fortschritt geladen werden.';
    } finally {
      input.value = '';
    }
  });
  render();
}

const calendar = $('calendar-url');
calendar.textContent = calendar.href;
$('copy-calendar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(calendar.href);
    $('group-note').textContent = 'ICS-Adresse kopiert.';
  } catch {
    $('group-note').textContent = 'Kopiere die oben angezeigte ICS-Adresse.';
  }
});

try {
  const url = new URL('../data/lerngruppenplan.json', import.meta.url);
  url.searchParams.set('v', Date.now());
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Lerngruppe: HTTP ${response.status}`);
  const data = await response.json();
  if (data.schemaVersion !== 1 || !Array.isArray(data.sessions) || !data.sessions.length) {
    throw new Error('Ungültige Lerngruppendaten');
  }
  start(data.sessions);
  window.addEventListener('pageshow', event => {
    if (event.persisted) window.location.reload();
  });
} catch (error) {
  console.error(error);
  $('group-weeks').replaceChildren(element('p', 'empty', 'Der Lerngruppenplan konnte nicht geladen werden. Lade die Seite erneut.'));
}
