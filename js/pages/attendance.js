import { t, tc } from '../i18n.js';
import { html, raw, icon, toast, withBusy, setDirty, confirmDialog, skeletonHtml, errorStateHtml, $, $$ } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { setQuery } from '../router.js';
import { fmtDate, todayIso, lastWorkingDay, dayCode, fmtMonth, pct, num } from '../format.js';
import { handleError, emptyState, studentAvatar, pctBar } from './common.js';

function gradeChips(selected) {
  return html`<div class="chips scroll" role="radiogroup" aria-label="${t('common.grade')}">${store.settings.grades.map((g) => html`
    <button type="button" class="chip ${g === selected ? 'on' : ''}" role="radio" aria-checked="${g === selected}" data-grade="${g}">${g}</button>`)}</div>`;
}

function rememberGrade(g) { try { localStorage.setItem('dsm-att-grade', g); } catch (e) { /* ignore */ } }
function lastGrade() { try { return localStorage.getItem('dsm-att-grade') || ''; } catch (e) { return ''; } }

export async function takePage({ root, query, isCurrent }) {
  const s = store.settings;
  if (!s.grades.length) { root.innerHTML = String(emptyState('calendar', t('att.noGrades'), html`<a class="btn primary" href="#/settings">${t('nav.settings')}</a>`)); return; }
  let grade = query.get('grade') || lastGrade();
  if (!s.grades.includes(grade)) grade = s.grades[0];
  let date = query.get('date') || lastWorkingDay(s.workingDays);
  let data = null;
  let marks = {};
  let original = '';

  root.innerHTML = String(html`
    <div class="page-head"><h1>${t('att.title')}</h1>
      <a class="btn outline small" href="#/attendance/report?grade=${encodeURIComponent(grade)}" data-report>${icon('chart')}${t('att.report')}</a></div>
    <div data-grades class="mb"></div>
    <div class="field">
      <label for="att-date">${t('common.date')}</label>
      <input class="input" type="date" id="att-date" value="${date}" max="${todayIso()}">
    </div>
    <div data-body class="has-sticky"></div>
    <div class="sticky-actions" data-bar hidden>
      <button class="btn outline" type="button" data-allp>${icon('check')}${t('att.allPresent')}</button>
      <button class="btn primary" type="button" data-save>${t('common.save')}</button>
    </div>`);

  const body = $('[data-body]', root);
  const bar = $('[data-bar]', root);
  const counts = () => {
    let p = 0, a = 0;
    data.students.forEach((st) => { if (marks[st.regNo] === 'P') p++; else if (marks[st.regNo] === 'A') a++; });
    return { p, a, n: data.students.length - p - a };
  };
  const isChanged = () => JSON.stringify(marks) !== original;

  const drawSummary = () => {
    const c = counts();
    const el = $('[data-summary]', body);
    if (el) el.innerHTML = String(html`<div class="p"><b>${c.p}</b>${t('att.present')}</div><div class="a"><b>${c.a}</b>${t('att.absent')}</div><div class="n"><b>${c.n}</b>${t('att.notMarked')}</div>`);
    setDirty(isChanged());
  };

  const drawRow = (st) => {
    const m = marks[st.regNo] || '';
    return html`<div class="att-row ${m ? '' : 'unmarked'}" data-row="${st.regNo}">
      ${studentAvatar(st)}
      <div class="main"><div class="title">${st.fullName}</div><div class="sub small muted">${st.regNo}</div></div>
      <div class="att-toggle" role="group" aria-label="${st.fullName}">
        <button type="button" class="p" data-mark="P" aria-pressed="${m === 'P'}" aria-label="${t('att.present')}">${icon('check')}</button>
        <button type="button" class="a" data-mark="A" aria-pressed="${m === 'A'}" aria-label="${t('att.absent')}">${icon('x')}</button>
      </div></div>`;
  };

  const drawBody = () => {
    $('[data-grades]', root).innerHTML = String(gradeChips(grade));
    $('[data-report]', root).href = `#/attendance/report?grade=${encodeURIComponent(grade)}&month=${date.slice(0, 7)}`;
    if (!data) { body.innerHTML = String(skeletonHtml(6)); bar.hidden = true; return; }
    const notWorking = !data.workingDay;
    if (!data.students.length) {
      bar.hidden = true;
      body.innerHTML = String(emptyState('users', t('att.noStudents', { grade }), html`<a class="btn primary" href="#/students/new">${icon('plus')}${t('students.add')}</a>`));
      return;
    }
    bar.hidden = false;
    body.innerHTML = String(html`
      ${notWorking ? html`<div class="alert warn">${icon('alert')}<div>${t('att.notWorkingDay', { day: tc('day', dayCode(date)) })}</div></div>` : ''}
      ${data.saved ? html`<div class="alert info">${icon('info')}<div>${t('att.alreadySaved', { date: fmtDate(date, { weekday: 'long' }) })}
        <div><button type="button" class="btn ghost small" data-del style="padding-left:0">${icon('trash')}${t('att.deleteDay')}</button></div></div></div>` : ''}
      <div class="att-summary" data-summary aria-live="polite"></div>
      <div class="list">${data.students.map(drawRow)}</div>
      <p class="hint mt">${t('att.tip')}</p>`);
    drawSummary();
  };

  const load = async () => {
    data = null;
    setQuery({ grade, date });
    drawBody();
    try {
      const res = await api('getAttendance', { grade, date });
      if (!isCurrent() || res.grade !== grade || res.date !== date) return;
      data = res;
      marks = {};
      res.students.forEach((st) => { if (st.status) marks[st.regNo] = st.status; });
      original = JSON.stringify(marks);
      drawBody();
    } catch (err) {
      if (!isCurrent()) return;
      if (err.code === 'VALIDATION') { body.innerHTML = String(html`<div class="alert danger">${icon('alert')}<div>${Object.values(err.fields).map((c) => t('err.' + c.split(':')[0])).join(' · ')}</div></div>`); return; }
      body.innerHTML = String(errorStateHtml(err));
      $('[data-retry]', body).addEventListener('click', load);
    }
  };

  const confirmDiscard = async () => !isChanged() || confirmDialog({ title: t('confirm.unsavedTitle'), message: t('att.discard'), okText: t('confirm.leave'), danger: true });

  $('[data-grades]', root).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-grade]');
    if (!b || b.dataset.grade === grade) return;
    if (data && !(await confirmDiscard())) return;
    grade = b.dataset.grade;
    rememberGrade(grade);
    setDirty(false);
    load();
  });
  const dateInput = $('#att-date', root);
  dateInput.addEventListener('change', async () => {
    const v = dateInput.value;
    if (!v) { dateInput.value = date; return; }
    if (v > todayIso()) { toast(t('err.DATE_FUTURE'), 'error'); dateInput.value = date; return; }
    if (data && !(await confirmDiscard())) { dateInput.value = date; return; }
    date = v;
    setDirty(false);
    load();
  });

  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mark]');
    if (b) {
      const row = b.closest('[data-row]');
      const reg = row.dataset.row;
      const v = b.dataset.mark;
      marks[reg] = marks[reg] === v ? '' : v;
      if (!marks[reg]) delete marks[reg];
      row.outerHTML = String(drawRow(data.students.find((x) => x.regNo === reg)));
      drawSummary();
      return;
    }
    if (e.target.closest('[data-del]')) {
      const ok = await confirmDialog({ title: t('att.deleteDay'), message: t('att.deleteConfirm', { grade, date: fmtDate(date) }), okText: t('common.delete'), danger: true });
      if (!ok) return;
      try {
        await api('deleteAttendance', { grade, date });
        store.refresh(300);
        toast(t('att.deleted'), 'success');
        setDirty(false);
        load();
      } catch (err) { handleError(err); }
    }
  });

  $('[data-allp]', root).addEventListener('click', () => {
    if (!data) return;
    data.students.forEach((st) => { if (!marks[st.regNo]) marks[st.regNo] = 'P'; });
    drawBody();
  });

  $('[data-save]', root).addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    if (!data) return;
    const c = counts();
    if (c.p + c.a === 0) { toast(t('att.nothingMarked'), 'error'); return; }
    if (c.n > 0) {
      const ok = await confirmDialog({ title: t('att.someUnmarkedTitle'), message: t('att.someUnmarked', { n: c.n }), okText: t('att.saveAnyway') });
      if (!ok) return;
    }
    const records = {};
    data.students.forEach((st) => { records[st.regNo] = marks[st.regNo] || ''; });
    try {
      const res = await api('saveAttendance', { grade, date, records });
      original = JSON.stringify(marks);
      data.saved = true;
      setDirty(false);
      store.refresh(300);
      toast(t('att.saved', { grade, p: res.p, a: res.a }), 'success');
      drawBody();
    } catch (err) { handleError(err); }
  }));

  rememberGrade(grade);
  load();
}

export async function reportPage({ root, query, showBack, isCurrent }) {
  showBack('/attendance');
  const s = store.settings;
  let grade = query.get('grade') || lastGrade() || s.grades[0];
  if (!s.grades.includes(grade)) grade = s.grades[0];
  let month = query.get('month') || todayIso().slice(0, 7);

  root.innerHTML = String(html`
    <div class="page-head"><h1>${t('att.reportTitle')}</h1>
      <button class="icon-btn" type="button" data-csv aria-label="${t('common.downloadCsv')}">${icon('download')}</button></div>
    <div data-grades class="mb"></div>
    <div class="row mb">
      <button class="icon-btn" type="button" data-prev aria-label="${t('common.previous')}">${icon('back')}</button>
      <input class="input grow" type="month" value="${month}" data-month aria-label="${t('att.month')}" max="${todayIso().slice(0, 7)}">
      <button class="icon-btn" type="button" data-next aria-label="${t('common.next')}">${icon('chevron')}</button>
    </div>
    <div data-body></div>`);
  const body = $('[data-body]', root);
  let rep = null;

  const shift = (n) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    $('[data-month]', root).value = month;
    load();
  };

  const draw = () => {
    $('[data-grades]', root).innerHTML = String(gradeChips(grade));
    if (!rep) { body.innerHTML = String(skeletonHtml(5)); return; }
    if (!rep.dates.length) { body.innerHTML = String(emptyState('calendar', t('att.reportEmpty', { month: fmtMonth(month) }))); return; }
    const totP = rep.rows.reduce((x, r) => x + r.p, 0);
    const totA = rep.rows.reduce((x, r) => x + r.a, 0);
    body.innerHTML = String(html`
      <div class="card mb"><div class="row between"><b>${fmtMonth(month)} · ${grade}</b><b>${pct(totP, totA) ?? '–'}%</b></div>
        <p class="small muted" style="margin:4px 0 8px">${t('att.reportSummary', { days: rep.dates.length, n: rep.rows.length })}</p>${pctBar(pct(totP, totA))}</div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th class="sticky-col">${t('students.name')}</th>${rep.dates.map((d) => html`<th class="c">${Number(d.slice(8))}</th>`)}<th class="num">%</th></tr></thead>
        <tbody>${rep.rows.map((r) => {
          const p = pct(r.p, r.a);
          return html`<tr><td class="sticky-col"><a href="#/students/${encodeURIComponent(r.regNo)}">${r.fullName}</a></td>
            ${rep.dates.map((d) => html`<td class="c ${r.marks[d] === 'P' ? 'mark-p' : r.marks[d] === 'A' ? 'mark-a' : 'muted'}">${r.marks[d] === 'P' ? '✓' : r.marks[d] === 'A' ? '✗' : '·'}</td>`)}
            <td class="num ${p !== null && p < 60 ? 'mark-a' : ''}">${p ?? '–'}</td></tr>`;
        })}</tbody></table></div>`);
  };

  const load = async () => {
    rep = null;
    setQuery({ grade, month });
    draw();
    try {
      const r = await api('attendanceReport', { grade, month });
      if (!isCurrent() || r.grade !== grade || r.month !== month) return;
      rep = r;
      draw();
    } catch (err) {
      if (!isCurrent()) return;
      body.innerHTML = String(errorStateHtml(err));
      $('[data-retry]', body).addEventListener('click', load);
    }
  };

  $('[data-grades]', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-grade]');
    if (!b) return;
    grade = b.dataset.grade;
    rememberGrade(grade);
    load();
  });
  $('[data-month]', root).addEventListener('change', (e) => { if (e.target.value) { month = e.target.value; load(); } });
  $('[data-prev]', root).addEventListener('click', () => shift(-1));
  $('[data-next]', root).addEventListener('click', () => { if (month < todayIso().slice(0, 7)) shift(1); });
  $('[data-csv]', root).addEventListener('click', async () => {
    if (!rep || !rep.dates.length) return;
    const { downloadCsv } = await import('../ui.js');
    downloadCsv([[t('csv.RegNo'), t('csv.FullName'), ...rep.dates, t('att.present'), t('att.absent'), '%']]
      .concat(rep.rows.map((r) => [r.regNo, r.fullName, ...rep.dates.map((d) => r.marks[d] || ''), r.p, r.a, pct(r.p, r.a) ?? ''])),
    `attendance-${grade}-${month}.csv`);
  });
  load();
}

export { raw, num, $$ };
