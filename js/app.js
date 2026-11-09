import { loadData } from './data.js';
import { exportProgress, importProgress, loadProgress, saveProgress } from './progress.js';

const $ = id => document.getElementById(id);
const formatDate = date => date.split('-').reverse().join('.');
const normalize = value => value.trim().toLocaleLowerCase('de');
const groups = new Map([
  ['Fall der Woche', 'Fall der Woche'],
  ['Selbststudiumsfall', 'Fälle für das Selbststudium'],
  ['Didaktischer Beitrag', 'Empfohlene didaktische Beiträge und Fälle'],
  ['Lerngruppenfall', 'Fälle für die Lerngruppe'],
]);

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function link(label, url, className) {
  const address = new URL(url);
  if (address.protocol !== 'https:') throw new Error('Nur HTTPS-Quellen sind zulässig');
  const el = element('a', className, label);
  el.href = address.href;
  el.target = '_blank';
  el.rel = 'noopener noreferrer';
  return el;
}

function download(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = element('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCsv(name, records) {
  const quote = value => {
    const text = String(value ?? '');
    const safe = /^[=+@\-\t\r]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  download(name, '\ufeff' + records.map(row => row.map(quote).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

function start({ weeks, units }) {
  const tasks = weeks.flatMap(week => week.tasks);
  const byUnit = new Map(units.map(unit => [unit.id, unit]));
  const openWeeks = new Set(weeks.map(week => week.num));
  const openUnits = new Set();
  let progress = loadProgress({ getItem: key => window.localStorage.getItem(key) });
  let search = '';
  let area = 'all';
  let status = 'all';
  $('week-count').textContent = weeks.length;

  function persist() {
    try {
      saveProgress(window.localStorage, progress);
      $('progress-note').textContent = '';
      return true;
    } catch {
      $('progress-note').textContent = 'Der Browser speichert den Fortschritt gerade nicht dauerhaft. Sichere ihn als Datei.';
      return false;
    }
  }

  function checkbox(kind, id, label, onChange) {
    const el = element('input');
    el.type = 'checkbox';
    el.checked = Boolean(progress[kind][id]);
    el.dataset.progressId = id;
    el.setAttribute('aria-label', label);
    el.addEventListener('change', () => {
      progress[kind][id] = el.checked;
      persist();
      onChange();
    });
    return el;
  }

  function toggle(button, set, id, render) {
    button.type = 'button';
    button.setAttribute('aria-expanded', set.has(id));
    button.addEventListener('click', () => {
      if (set.has(id)) set.delete(id);
      else set.add(id);
      render();
    });
  }

  function matches(text) {
    return !search || normalize(text).includes(search);
  }

  function renderLiteratureItem(entry) {
    const label = element('label', 'lititem' + (progress.literatureChecks[entry.id] ? ' lit-checked' : ''));
    const check = checkbox('literatureChecks', entry.id, 'Gelesen: ' + entry.reference, render);
    const detail = element('div');
    detail.append(element('div', 'lit-ref', entry.reference));
    if (entry.description) detail.append(element('div', 'lit-desc', entry.description));
    if (entry.title && entry.title !== entry.description && !entry.reference.includes(entry.title)) {
      detail.append(element('div', 'lit-desc', entry.title));
    }
    if (entry.scheduledOn) detail.append(element('div', 'lit-desc', 'Lerngruppe am ' + formatDate(entry.scheduledOn)));
    if (entry.url) detail.append(link('Zur Fundstelle', entry.url));
    label.append(check, detail);
    return label;
  }

  function appendGroups(host, entries, includeGroupCases) {
    for (const [type, heading] of groups) {
      if (!includeGroupCases && type === 'Lerngruppenfall') continue;
      const items = entries.filter(entry => entry.type === type);
      if (items.length) host.append(element('div', 'literature-group-title', heading), ...items.map(renderLiteratureItem));
    }
  }

  function renderCatalog() {
    const host = $('literature-grid');
    host.replaceChildren();
    for (const unit of units) {
      if (area !== 'all' && area !== unit.subject) continue;
      const unitLabel = `${unit.section} · Lerneinheit ${unit.number}`;
      const unitMatches = matches([unitLabel, unit.topic, ...unit.objectives].join(' '));
      const visible = unitMatches ? unit.literature : unit.literature.filter(entry =>
        matches([entry.reference, entry.title, entry.description].join(' ')));
      if (!unitMatches && !visible.length) continue;

      const card = element('article', 'literature-unit');
      const count = unit.literature.filter(entry => progress.literatureChecks[entry.id]).length;
      const isOpen = openUnits.has(unit.id);
      const button = element('button', 'literature-unit-header',
        `${unitLabel} — ${count}/${unit.literature.length} gelesen ${isOpen ? '⌃' : '⌄'}`);
      toggle(button, openUnits, unit.id, renderCatalog);
      card.append(button);
      if (isOpen) {
        const detail = element('div', 'literature-unit-details');
        detail.append(element('div', 'reading-heading', unit.topic));
        if (unit.objectives.length) {
          const list = element('ul', 'learning-objectives');
          for (const objective of unit.objectives) list.append(element('li', '', objective));
          detail.append(list);
        }
        detail.append(link('Lerneinheitsübersicht in ILIAS öffnen', unit.sourceUrl, 'resource-btn'));
        appendGroups(detail, visible, true);
        card.append(detail);
      }
      host.append(card);
    }
    if (!host.childElementCount) host.append(element('p', 'empty', 'Keine passenden Leselisten gefunden.'));
  }

  function appendResources(body, task) {
    if (!task.unitId) return;
    const box = element('section', 'reading-box');
    const unit = byUnit.get(task.unitId);
    if (!unit) {
      box.append(element('div', 'litstat', 'Für diese Einheit liegt noch keine verifizierte Leseliste vor.'));
    } else {
      const entries = unit.literature.filter(entry => entry.type !== 'Lerngruppenfall');
      const completed = entries.filter(entry => progress.literatureChecks[entry.id]).length;
      box.append(
        element('div', 'reading-heading', `Lesestoff · ${unit.section} LE ${unit.number}`),
        element('div', 'litstat', `${completed} von ${entries.length} Literaturpositionen erledigt`),
      );
      const listing = element('div', 'lit-mini');
      appendGroups(listing, entries, false);
      const read = element('label', 'overview-read');
      read.append(checkbox('readChecks', unit.id, 'Übersicht gelesen: ' + unit.id, render), ' Übersicht gelesen');
      box.append(listing, link('Lerneinheitsübersicht in ILIAS öffnen', unit.sourceUrl, 'resource-btn'), read);
    }
    body.append(box);
  }

  function renderTask(task) {
    const className = task.area === 'Strafrecht' ? 'st' : 'oe';
    const card = element('div', `task ${className}` + (progress.checks[task.id] ? ' done' : ''));
    const body = element('div');
    const tags = element('div', 'tags');
    tags.append(element('span', 'tag', task.area), element('span', 'tag', task.category));
    body.append(
      element('div', 'day', task.day + ' · ' + formatDate(task.date)),
      element('div', 'tt', task.title),
      tags,
      element('div', 'hint', task.instructions),
    );
    appendResources(body, task);
    card.append(checkbox('checks', task.id, 'Aufgabe erledigt: ' + task.title, render), body);
    return card;
  }

  function renderWeeks() {
    const host = $('weeks');
    host.replaceChildren();
    for (const week of weeks) {
      const visible = week.tasks.filter(task =>
        (area === 'all' || task.area === area) &&
        (status === 'all' || (status === 'done') === Boolean(progress.checks[task.id])) &&
        matches([task.title, task.area, task.category].join(' ')));
      if (!visible.length) continue;

      const card = element('article', 'week');
      const head = element('button', 'week-head');
      const label = element('div');
      label.append(element('h2', '', `Woche ${week.num} · ${formatDate(week.from)} – ${formatDate(week.to)}`),
        element('small', '', 'Montag · Dienstag · Freitag · Samstag'));
      const isOpen = openWeeks.has(week.num);
      const count = week.tasks.filter(task => progress.checks[task.id]).length;
      head.append(label, element('span', 'count', `${count} / ${week.tasks.length} erledigt ${isOpen ? '⌃' : '⌄'}`));
      toggle(head, openWeeks, week.num, renderWeeks);
      card.append(head);
      if (isOpen) {
        const grid = element('div', 'tasks');
        grid.append(...visible.map(renderTask));
        card.append(grid);
      }
      host.append(card);
    }
    if (!host.childElementCount) host.append(element('div', 'empty', 'Keine passenden Aufgaben gefunden.'));
  }

  function render() {
    renderWeeks();
    renderCatalog();
    const metrics = [
      ['count', 'pall', tasks],
      ['st', 'pst', tasks.filter(task => task.area === 'Strafrecht')],
      ['oe', 'poe', tasks.filter(task => task.area === 'Öffentliches Recht')],
    ];
    for (const [count, bar, entries] of metrics) {
      const done = entries.filter(task => progress.checks[task.id]).length;
      $(count).textContent = `${done} / ${entries.length}`;
      $(bar).style.width = (entries.length ? 100 * done / entries.length : 0) + '%';
    }
  }

  for (const id of ['search', 'area', 'status']) {
    $(id).addEventListener('input', () => {
      search = normalize($('search').value);
      area = $('area').value;
      status = $('status').value;
      render();
    });
  }
  $('allopen').addEventListener('click', () => {
    for (const week of weeks) openWeeks.add(week.num);
    renderWeeks();
  });
  $('allclose').addEventListener('click', () => {
    openWeeks.clear();
    renderWeeks();
  });
  $('expand-literature').addEventListener('click', () => {
    for (const unit of units) openUnits.add(unit.id);
    renderCatalog();
  });
  $('collapse-literature').addEventListener('click', () => {
    openUnits.clear();
    renderCatalog();
  });
  $('backup').addEventListener('click', () =>
    download('Rep2plus_68_Fortschritt.json', exportProgress(progress), 'application/json'));
  $('restore').addEventListener('click', () => $('restore-file').click());
  $('restore-file').addEventListener('change', async event => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      progress = importProgress(await file.text(), progress);
      const stored = persist();
      render();
      alert(stored ? 'Fortschritt erfolgreich übernommen.' : 'Fortschritt für diese Sitzung übernommen. Bitte als Datei sichern.');
    } catch {
      alert('Diese Datei ist kein gültiges 68-Fortschrittsbackup.');
    } finally {
      input.value = '';
    }
  });
  $('csv').addEventListener('click', () => downloadCsv('Rep2plus_Selbststudium_68.csv', [
    ['Datum', 'Wochentag', 'Rechtsgebiet', 'Kategorie', 'Aufgabe', 'Erledigt', 'PDF gelesen'],
    ...tasks.map(task => [formatDate(task.date), task.day, task.area, task.category, task.title,
      progress.checks[task.id] ? 'Ja' : 'Nein', progress.readChecks[task.unitId] ? 'Ja' : 'Nein']),
  ]));
  $('literature-csv').addEventListener('click', () => downloadCsv('Rep2plus_68_Leseliste.csv', [
    ['Rechtsgebiet / Lerneinheit', 'Kategorie', 'Autor und Fundstelle', 'Titel / Inhalt', 'Gelesen'],
    ...units.flatMap(unit => unit.literature.map(entry => [unit.id, entry.type, entry.reference,
      entry.title ?? entry.description, progress.literatureChecks[entry.id] ? 'Ja' : 'Nein'])),
  ]));
  render();
}

try {
  start(await loadData());
  window.addEventListener('pageshow', event => {
    if (event.persisted) window.location.reload();
  });
} catch (error) {
  console.error(error);
  const message = element('p', 'empty', 'Die Lerninhalte konnten nicht geladen werden.');
  message.setAttribute('role', 'alert');
  const retry = element('button', '', 'Erneut laden');
  retry.addEventListener('click', () => window.location.reload());
  $('literature-grid').replaceChildren(message, retry);
}
