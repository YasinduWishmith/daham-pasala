import { t, tc } from '../i18n.js';
import { html, raw, icon, field, segmented, formData, wireForm, showErrors, summaryBox, withBusy, toast, modal,
  confirmDialog, setDirty, debounce, downloadCsv, skeletonHtml, errorStateHtml, $, $$ } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { go, setQuery, back } from '../router.js';
import { fmtDate, age, pct, todayIso, num, fmtMonth, monthName } from '../format.js';
import { handleError, gradeOptions, emptyState, studentAvatar, statusBadge, pctBar, REL, PREFECT_ROLES, STATUSES } from './common.js';

/* =================================================================== */
/* List + filters                                                       */
/* =================================================================== */

const FILTER_KEYS = ['q', 'grade', 'status', 'gender', 'ageMin', 'ageMax', 'bmonth', 'prefect', 'role', 'event', 'attBelow', 'sort'];

function readFilters(query) {
  const f = {};
  FILTER_KEYS.forEach((k) => { f[k] = query.get(k) || ''; });
  if (!f.status) f.status = 'Active';
  if (!f.sort) f.sort = 'name';
  return f;
}

function applyFilters(f) {
  const d = store.data;
  const q = f.q.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const prefByReg = {};
  d.prefects.forEach((p) => { (prefByReg[p.regNo] = prefByReg[p.regNo] || []).push(p); });
  const eventSet = f.event ? new Set(d.eventMarks.filter((m) => m.eventId === f.event).map((m) => m.regNo)) : null;
  const ageMin = f.ageMin === '' ? null : Number(f.ageMin);
  const ageMax = f.ageMax === '' ? null : Number(f.ageMax);
  const attBelow = f.attBelow === '' ? null : Number(f.attBelow);

  const list = d.students.filter((s) => {
    if (f.status !== 'all' && s.status !== f.status) return false;
    if (f.grade && s.grade !== f.grade) return false;
    if (f.gender && s.gender !== f.gender) return false;
    if (q) {
      const hay = [s.fullName, s.nameWithInitials, s.regNo, s.guardianName, s.address].join(' ').toLowerCase();
      const phones = (s.telephone + ' ' + s.guardianPhone);
      if (!hay.includes(q) && !(qDigits.length >= 3 && phones.includes(qDigits))) return false;
    }
    if (ageMin !== null || ageMax !== null) {
      const a = age(s.birthday);
      if (a === null || (ageMin !== null && a < ageMin) || (ageMax !== null && a > ageMax)) return false;
    }
    if (f.bmonth && Number((s.birthday || '').slice(5, 7)) !== Number(f.bmonth)) return false;
    const ps = prefByReg[s.regNo] || [];
    if (f.prefect === 'current' && !ps.some((p) => !p.endDate)) return false;
    if (f.prefect === 'past' && !ps.some((p) => p.endDate)) return false;
    if (f.prefect === 'ever' && !ps.length) return false;
    if (f.prefect === 'never' && ps.length) return false;
    if (f.role && !ps.some((p) => p.role === f.role && (f.prefect !== 'current' || !p.endDate))) return false;
    if (eventSet && !eventSet.has(s.regNo)) return false;
    if (attBelow !== null) {
      const a = store.attendanceOf(s.regNo);
      const p = pct(a.p, a.a);
      if (p === null || p >= attBelow) return false;
    }
    return true;
  });
  const gi = (g) => d.settings.grades.indexOf(g);
  const attP = (s) => { const a = store.attendanceOf(s.regNo); const p = pct(a.p, a.a); return p === null ? 101 : p; };
  const sorters = {
    name: (a, b) => a.fullName.localeCompare(b.fullName),
    regNo: (a, b) => a.regNo.localeCompare(b.regNo, undefined, { numeric: true }),
    grade: (a, b) => gi(a.grade) - gi(b.grade) || a.fullName.localeCompare(b.fullName),
    age: (a, b) => (a.birthday || '9').localeCompare(b.birthday || '9'),
    att: (a, b) => attP(a) - attP(b),
    recent: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
  };
  return list.sort(sorters[f.sort] || sorters.name);
}

function filterChips(f) {
  const d = store.data;
  const chips = [];
  if (f.grade) chips.push(['grade', f.grade]);
  if (f.status !== 'Active') chips.push(['status', f.status === 'all' ? t('filter.allStatuses') : tc('status', f.status)]);
  if (f.gender) chips.push(['gender', tc('gender', f.gender)]);
  if (f.ageMin || f.ageMax) chips.push(['age', t('filter.ageRange', { min: f.ageMin || '0', max: f.ageMax || '∞' })]);
  if (f.bmonth) chips.push(['bmonth', t('filter.bornIn', { m: monthName(f.bmonth) })]);
  if (f.prefect) chips.push(['prefect', t('filter.prefect.' + f.prefect)]);
  if (f.role) chips.push(['role', tc('role', f.role)]);
  if (f.event) { const e = d.events.find((x) => x.eventId === f.event); chips.push(['event', e ? e.name : f.event]); }
  if (f.attBelow) chips.push(['attBelow', t('filter.attBelowChip', { n: f.attBelow })]);
  return chips;
}

function countFilters(f) { return filterChips(f).length; }

export async function listPage({ root, query }) {
  const f = readFilters(query);
  const d = store.data;
  let selectMode = false;
  const selected = new Set();
  let shown = 60;

  root.innerHTML = String(html`
    <div class="page-head"><h1>${t('students.title')}</h1>
      <button class="btn outline small" type="button" data-select>${icon('checkSquare')}${t('students.select')}</button>
      <button class="icon-btn" type="button" data-csv aria-label="${t('students.downloadCsv')}" title="${t('students.downloadCsv')}">${icon('download')}</button>
    </div>
    <div class="searchbar">
      <div class="input-wrap">${icon('search', 'search-ico')}
        <input class="input" type="search" data-q value="${f.q}" placeholder="${t('students.searchPh')}" aria-label="${t('students.searchPh')}" enterkeyhint="search"></div>
      <button class="btn outline filter-btn" type="button" data-filters aria-label="${t('filter.title')}">${icon('filter')}<span class="count" data-fcount hidden></span></button>
    </div>
    <div class="chips scroll mb" data-gradechips>
      <button type="button" class="chip ${!f.grade ? 'on' : ''}" data-grade="">${t('common.allGrades')}</button>
      ${d.settings.grades.map((g) => html`<button type="button" class="chip ${f.grade === g ? 'on' : ''}" data-grade="${g}">${g}</button>`)}
    </div>
    <div class="active-filters" data-active></div>
    <div class="result-count" data-count aria-live="polite"></div>
    <div data-list></div>
    <div class="sticky-actions" data-selbar hidden>
      <button class="btn outline" type="button" data-selall>${t('students.selectAll')}</button>
      <button class="btn primary" type="button" data-move>${icon('move')}${t('students.moveSelected')} <span data-seln></span></button>
    </div>
    <a class="fab" href="#/students/new" data-fab>${icon('plus')}<span>${t('students.add')}</span></a>
  `);

  const listEl = $('[data-list]', root);
  let current = [];

  const draw = () => {
    current = applyFilters(f);
    const n = countFilters(f);
    const fc = $('[data-fcount]', root);
    fc.hidden = !n; fc.textContent = n;
    $('[data-active]', root).innerHTML = String(html`${filterChips(f).filter((c) => c[0] !== 'grade').map(([k, label]) => html`
      <button type="button" class="chip removable" data-clear="${k}">${label}<span class="x" aria-label="${t('common.remove')}">${icon('x')}</span></button>`)}
      ${n > 1 ? html`<button type="button" class="chip" data-clear="all">${t('filter.clearAll')}</button>` : ''}`);
    $('[data-count]', root).textContent = t('students.count', { n: num(current.length), total: num(d.students.length) });
    $$('[data-grade]', root).forEach((b) => b.classList.toggle('on', b.dataset.grade === f.grade));
    if (!d.students.length) {
      listEl.innerHTML = String(emptyState('users', t('students.emptyAll'), html`<a class="btn primary" href="#/students/new">${icon('plus')}${t('students.add')}</a>`));
      return;
    }
    if (!current.length) {
      listEl.innerHTML = String(emptyState('search', t('students.noMatch'), html`<button class="btn outline" type="button" data-clear="all">${t('filter.clearAll')}</button>`));
      return;
    }
    const items = current.slice(0, shown);
    listEl.innerHTML = String(html`<div class="list">${items.map((s) => {
      const a = store.attendanceOf(s.regNo);
      const p = pct(a.p, a.a);
      const pref = store.currentPrefect(s.regNo);
      const inner = html`${studentAvatar(s)}<div class="main"><div class="title">${s.fullName}</div>
        <div class="sub">${s.regNo} · ${s.grade}${s.birthday ? ' · ' + t('students.ageN', { n: age(s.birthday) }) : ''}</div>
        <div class="row" style="margin-top:4px;gap:4px">${statusBadge(s.status)}${pref ? html`<span class="badge accent">${icon('award')}${tc('role', pref.role)}</span>` : ''}</div></div>
        <div class="end">${p !== null ? html`<div class="small ${p < 60 ? 'mark-a' : ''}" title="${t('students.attendancePct')}">${p}%</div>` : ''}</div>`;
      return selectMode
        ? html`<label class="list-item" style="cursor:pointer"><input type="checkbox" data-sel="${s.regNo}" ${selected.has(s.regNo) ? raw('checked') : ''} style="width:22px;height:22px;accent-color:var(--primary)">${inner}</label>`
        : html`<a class="list-item" href="#/students/${encodeURIComponent(s.regNo)}">${inner}${icon('chevron', 'chev')}</a>`;
    })}</div>
    ${current.length > shown ? html`<button class="btn outline block mt" type="button" data-more>${t('common.showMore', { n: current.length - shown })}</button>` : ''}`);
  };

  const sync = () => { setQuery({ ...f, status: f.status === 'Active' ? '' : f.status, sort: f.sort === 'name' ? '' : f.sort }); shown = 60; draw(); };

  $('[data-q]', root).addEventListener('input', debounce((e) => { f.q = e.target.value; sync(); }, 200));
  $('[data-gradechips]', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-grade]');
    if (!b) return;
    f.grade = b.dataset.grade;
    sync();
  });
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-clear]');
    if (c) {
      const k = c.dataset.clear;
      if (k === 'all') { FILTER_KEYS.forEach((x) => { if (x !== 'sort') f[x] = ''; }); f.status = 'Active'; $('[data-q]', root).value = ''; }
      else if (k === 'age') { f.ageMin = ''; f.ageMax = ''; }
      else if (k === 'status') f.status = 'Active';
      else f[k] = '';
      sync();
      return;
    }
    if (e.target.closest('[data-more]')) { shown += 100; draw(); }
  });
  $('[data-filters]', root).addEventListener('click', async () => {
    const res = await openFilters(f);
    if (!res) return;
    Object.assign(f, res);
    sync();
  });
  $('[data-csv]', root).addEventListener('click', () => {
    const head = ['RegNo', 'FullName', 'NameWithInitials', 'Gender', 'Birthday', 'Age', 'Grade', 'Telephone', 'Address', 'GuardianName', 'GuardianRelationship', 'GuardianPhone', 'AdmissionDate', 'Status', 'Attendance%', 'Prefect'];
    downloadCsv([head.map((h) => t('csv.' + h))].concat(current.map((s) => {
      const a = store.attendanceOf(s.regNo);
      const p = store.currentPrefect(s.regNo);
      return [s.regNo, s.fullName, s.nameWithInitials, tc('gender', s.gender), s.birthday, age(s.birthday), s.grade, s.telephone, s.address,
        s.guardianName, tc('rel', s.guardianRelationship), s.guardianPhone, s.admissionDate, tc('status', s.status), pct(a.p, a.a) ?? '', p ? tc('role', p.role) : ''];
    })), `students-${todayIso()}.csv`);
  });

  // Select mode for bulk move / promote.
  const selbar = $('[data-selbar]', root);
  const updSel = () => { $('[data-seln]', root).textContent = selected.size ? `(${selected.size})` : ''; $('[data-move]', root).disabled = !selected.size; };
  $('[data-select]', root).addEventListener('click', (e) => {
    selectMode = !selectMode;
    selected.clear();
    e.currentTarget.classList.toggle('primary', selectMode);
    selbar.hidden = !selectMode;
    $('[data-fab]', root).hidden = selectMode;
    updSel();
    draw();
  });
  listEl.addEventListener('change', (e) => {
    const r = e.target.dataset.sel;
    if (!r) return;
    if (e.target.checked) selected.add(r); else selected.delete(r);
    updSel();
  });
  $('[data-selall]', root).addEventListener('click', () => {
    const all = current.every((s) => selected.has(s.regNo));
    current.forEach((s) => (all ? selected.delete(s.regNo) : selected.add(s.regNo)));
    updSel();
    draw();
  });
  $('[data-move]', root).addEventListener('click', async () => {
    const ok = await moveDialog([...selected]);
    if (ok) { selected.clear(); selectMode = false; selbar.hidden = true; $('[data-fab]', root).hidden = false; $('[data-select]', root).classList.remove('primary'); draw(); }
  });

  draw();
}

function openFilters(f) {
  const d = store.data;
  const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) }));
  return modal({
    title: t('filter.title'),
    body: html`<form novalidate data-ff>
      ${field({ name: 'grade', type: 'select', label: t('common.grade'), value: f.grade, placeholder: t('common.allGrades'), options: gradeOptions() })}
      ${field({ name: 'status', type: 'select', label: t('students.status'), value: f.status, options: [...STATUSES.map((s) => ({ value: s, label: tc('status', s) })), { value: 'all', label: t('filter.allStatuses') }] })}
      ${segmented({ name: 'gender', label: t('students.gender'), value: f.gender, options: [{ value: '', label: t('common.all') }, { value: 'M', label: tc('gender', 'M') }, { value: 'F', label: tc('gender', 'F') }] })}
      <div class="grid-2">
        ${field({ name: 'ageMin', type: 'number', label: t('filter.ageMin'), value: f.ageMin, attrs: 'inputmode="numeric" min="0" max="99"' })}
        ${field({ name: 'ageMax', type: 'number', label: t('filter.ageMax'), value: f.ageMax, attrs: 'inputmode="numeric" min="0" max="99"' })}
      </div>
      ${field({ name: 'bmonth', type: 'select', label: t('filter.birthMonth'), value: f.bmonth, placeholder: t('common.any'), options: months })}
      ${field({ name: 'prefect', type: 'select', label: t('filter.prefectLabel'), value: f.prefect, placeholder: t('common.any'),
        options: ['current', 'past', 'ever', 'never'].map((v) => ({ value: v, label: t('filter.prefect.' + v) })) })}
      ${field({ name: 'role', type: 'select', label: t('prefects.role'), value: f.role, placeholder: t('common.any'), options: PREFECT_ROLES.map((r) => ({ value: r, label: tc('role', r) })) })}
      ${field({ name: 'event', type: 'select', label: t('filter.participated'), value: f.event, placeholder: t('common.any'),
        options: d.events.slice().sort((a, b) => b.date.localeCompare(a.date)).map((e) => ({ value: e.eventId, label: `${e.name} (${e.date.slice(0, 4)})` })) })}
      ${field({ name: 'attBelow', type: 'number', label: t('filter.attBelow'), value: f.attBelow, hint: t('filter.attBelowHint', { year: d.attendance.year }), attrs: 'inputmode="numeric" min="1" max="100"' })}
      ${field({ name: 'sort', type: 'select', label: t('filter.sort'), value: f.sort,
        options: ['name', 'regNo', 'grade', 'age', 'att', 'recent'].map((v) => ({ value: v, label: t('filter.sort.' + v) })) })}
    </form>`,
    foot: html`<button class="btn outline" type="button" data-reset>${t('filter.reset')}</button><button class="btn primary" type="button" data-apply>${t('filter.apply')}</button>`,
    onMount: (m, close) => {
      const form = $('[data-ff]', m);
      $('[data-apply]', m).addEventListener('click', () => {
        const v = formData(form);
        if (v.ageMin && v.ageMax && Number(v.ageMin) > Number(v.ageMax)) { showErrors(form, { ageMax: 'AGE_RANGE' }); return; }
        if (v.attBelow && (Number(v.attBelow) < 1 || Number(v.attBelow) > 100)) { showErrors(form, { attBelow: 'NUMBER_RANGE' }); return; }
        close({ ...v, q: f.q });
      });
      $('[data-reset]', m).addEventListener('click', () => close({ grade: '', status: 'Active', gender: '', ageMin: '', ageMax: '', bmonth: '', prefect: '', role: '', event: '', attBelow: '', sort: 'name', q: f.q }));
    }
  });
}

/** Move / promote students. Resolves true when saved. */
export function moveDialog(regNos) {
  const opts = [...gradeOptions(), { value: '@Graduated', label: t('students.markGraduated') }, { value: '@Left', label: t('students.markLeft') }];
  return modal({
    title: t('students.moveTitle', { n: regNos.length }),
    body: html`<form novalidate data-mf>${summaryBox()}
      ${field({ name: 'toGrade', type: 'select', label: t('students.moveTo'), required: true, placeholder: t('common.choose'), options: opts })}
      ${field({ name: 'date', type: 'date', label: t('students.moveDate'), value: todayIso(), attrs: `max="${todayIso()}"` })}
      <p class="hint">${t('students.moveHint')}</p></form>`,
    foot: html`<button class="btn outline" type="button" data-close>${t('common.cancel')}</button><button class="btn primary" type="button" data-ok>${t('common.save')}</button>`,
    onMount: (m, close) => {
      const form = $('[data-mf]', m);
      $('[data-ok]', m).addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        const v = formData(form);
        if (!v.toGrade) { showErrors(form, { toGrade: 'REQUIRED' }); return; }
        try {
          const res = await api('moveStudents', { regNos, toGrade: v.toGrade, date: v.date });
          res.students.forEach((s) => store.upsert('students', 'regNo', s));
          store.refresh(1000);
          toast(t('students.moved', { n: res.students.length }), 'success');
          close(true);
        } catch (err) { handleError(err, form); }
      }));
    }
  });
}

/* =================================================================== */
/* Add / edit                                                           */
/* =================================================================== */

export async function formPage({ root, params, showBack, setTitle }) {
  const isNew = !params.regNo;
  const s = isNew ? { status: 'Active', admissionDate: todayIso() } : store.student(params.regNo);
  showBack(isNew ? '/students' : `/students/${encodeURIComponent(params.regNo)}`);
  if (!s) { root.innerHTML = String(emptyState('alert', t('err.STUDENT_NOT_FOUND'), html`<a class="btn outline" href="#/students">${t('students.backToList')}</a>`)); return; }
  setTitle(isNew ? t('students.addTitle') : t('students.editTitle'));
  const today = todayIso();
  const lastGrade = (() => { try { return sessionStorage.getItem('dsm-last-grade') || ''; } catch (e) { return ''; } })();

  root.innerHTML = String(html`
    <h1>${isNew ? t('students.addTitle') : s.fullName}</h1>
    <form novalidate class="has-sticky">
      ${summaryBox()}
      <div class="card"><h2>${t('students.sectionStudent')}</h2><div class="form-grid">
        ${field({ name: 'regNo', label: t('students.regNo'), value: s.regNo, required: true, hint: isNew ? t('students.regNoHint') : t('students.regNoLocked'), attrs: `maxlength="20" autocapitalize="characters" spellcheck="false" ${isNew ? '' : 'readonly'}` })}
        ${field({ name: 'fullName', label: t('students.fullName'), value: s.fullName, required: true, attrs: 'maxlength="150" autocomplete="off"' })}
        ${field({ name: 'nameWithInitials', label: t('students.nameWithInitials'), value: s.nameWithInitials, attrs: 'maxlength="80" autocomplete="off"' })}
        ${segmented({ name: 'gender', label: t('students.gender'), value: s.gender, required: true, options: [{ value: 'M', label: tc('gender', 'M') }, { value: 'F', label: tc('gender', 'F') }] })}
        ${field({ name: 'birthday', type: 'date', label: t('students.birthday'), value: s.birthday, required: true, attrs: `max="${today}"` })}
        ${field({ name: 'grade', type: 'select', label: t('common.grade'), value: s.grade || (isNew ? lastGrade : ''), required: true, placeholder: t('common.choose'), options: gradeOptions() })}
        ${field({ name: 'telephone', type: 'tel', label: t('students.telephone'), value: s.telephone, hint: t('students.phoneHint'), attrs: 'inputmode="tel" autocomplete="off" maxlength="16"' })}
        ${field({ name: 'address', label: t('students.address'), value: s.address, attrs: 'maxlength="200"' })}
      </div></div>
      <div class="card"><h2>${t('students.sectionGuardian')}</h2><div class="form-grid">
        ${field({ name: 'guardianName', label: t('students.guardianName'), value: s.guardianName, required: true, attrs: 'maxlength="150"' })}
        ${field({ name: 'guardianRelationship', type: 'select', label: t('students.relationship'), value: s.guardianRelationship, required: true, placeholder: t('common.choose'), options: REL.map((r) => ({ value: r, label: tc('rel', r) })) })}
        ${field({ name: 'guardianPhone', type: 'tel', label: t('students.guardianPhone'), value: s.guardianPhone, required: true, hint: t('students.phoneHint'), attrs: 'inputmode="tel" maxlength="16"' })}
      </div></div>
      <div class="card"><h2>${t('students.sectionSchool')}</h2><div class="form-grid">
        ${field({ name: 'admissionDate', type: 'date', label: t('students.admissionDate'), value: s.admissionDate, attrs: `max="${today}"` })}
        ${isNew ? '' : field({ name: 'status', type: 'select', label: t('students.status'), value: s.status, options: STATUSES.map((x) => ({ value: x, label: tc('status', x) })), hint: t('students.statusHint') })}
        ${field({ name: 'notes', type: 'textarea', label: t('students.notes'), value: s.notes, cls: 'full', attrs: 'maxlength="500"' })}
      </div></div>
      <div class="sticky-actions">
        <button class="btn outline" type="button" data-cancel>${t('common.cancel')}</button>
        <button class="btn primary" type="submit">${icon('check')}${t('common.save')}</button>
      </div>
    </form>`);

  const form = $('form', root);
  wireForm(form);
  $('[data-cancel]', root).addEventListener('click', () => back(isNew ? '/students' : `/students/${encodeURIComponent(params.regNo)}`));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(form);
    if (!isNew) v.regNo = s.regNo;
    const clean = window.cleanStudent_(v);
    const errs = window.validateStudent_(clean, store.settings);
    if (isNew && !errs.regNo && store.student(clean.regNo)) errs.regNo = 'REGNO_EXISTS';
    if (showErrors(form, errs)) return;
    withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const res = await api('saveStudent', { isNew, student: clean });
        store.upsert('students', 'regNo', res.student);
        try { sessionStorage.setItem('dsm-last-grade', res.student.grade); } catch (err) { /* ignore */ }
        setDirty(false);
        toast(isNew ? t('students.added', { name: res.student.fullName }) : t('common.saved'), 'success', isNew ? {
          action: t('students.addAnother'), onAction: () => go('/students/new')
        } : {});
        go(`/students/${encodeURIComponent(res.student.regNo)}`, { replace: true });
      } catch (err) { handleError(err, form); }
    });
  });
}

/* =================================================================== */
/* Profile / history                                                    */
/* =================================================================== */

export async function profilePage({ root, params, showBack, isCurrent }) {
  showBack('/students');
  const s = store.student(params.regNo);
  if (!s) { root.innerHTML = String(emptyState('alert', t('err.STUDENT_NOT_FOUND'), html`<a class="btn outline" href="#/students">${t('students.backToList')}</a>`)); return; }
  const pref = store.currentPrefect(s.regNo);
  const a = store.attendanceOf(s.regNo);
  const p = pct(a.p, a.a);
  const tabs = ['details', 'attendance', 'exams', 'events', 'prefect', 'grades'];
  let tab = 'details';
  let hist = null;
  let histErr = null;

  root.innerHTML = String(html`
    <div class="card">
      <div class="profile-head">${studentAvatar(s, true)}
        <div class="info"><h1>${s.fullName}</h1>
          <div class="muted small">${s.regNo} · ${s.grade}${s.birthday ? ' · ' + t('students.ageN', { n: age(s.birthday) }) : ''}</div>
          <div class="row" style="margin-top:6px;gap:6px">${statusBadge(s.status)}${pref ? html`<span class="badge accent">${icon('award')}${tc('role', pref.role)}</span>` : ''}
            ${p !== null ? html`<span class="badge ${p < 60 ? 'danger' : 'success'}">${t('students.attShort', { p })}</span>` : ''}</div>
        </div></div>
      <div class="profile-actions">
        ${s.guardianPhone ? html`<a class="btn outline" href="tel:${s.guardianPhone}">${icon('phone')}${t('students.callGuardian')}</a>` : html`<span></span>`}
        <a class="btn outline" href="#/students/${encodeURIComponent(s.regNo)}/edit">${icon('edit')}${t('common.edit')}</a>
        <button class="btn outline" type="button" data-actions>${icon('more')}${t('common.more')}</button>
      </div>
    </div>
    <div class="tabs mt" role="tablist">${tabs.map((x) => html`<button type="button" role="tab" data-tab="${x}" aria-selected="${x === tab}">${t('profile.tab.' + x)}</button>`)}</div>
    <div data-panel role="tabpanel"></div>`);

  const panel = $('[data-panel]', root);
  const drawPanel = () => {
    $$('[data-tab]', root).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    if (tab === 'details') { panel.innerHTML = String(detailsHtml(s)); return; }
    if (histErr) {
      panel.innerHTML = String(errorStateHtml(histErr));
      $('[data-retry]', panel).addEventListener('click', loadHist);
      return;
    }
    if (!hist) { panel.innerHTML = String(skeletonHtml(4)); return; }
    panel.innerHTML = String({ attendance: attendanceHtml, exams: examsHtml, events: eventsHtml, prefect: prefectHtml, grades: gradesHtml }[tab](hist));
  };
  const loadHist = async () => {
    histErr = null;
    drawPanel();
    try {
      hist = await api('studentHistory', { regNo: s.regNo });
    } catch (err) {
      histErr = err;
    }
    if (isCurrent()) drawPanel();
  };
  $('.tabs', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    drawPanel();
  });
  $('[data-actions]', root).addEventListener('click', () => studentActions(s));
  drawPanel();
  loadHist();
}

function detailsHtml(s) {
  const row = (k, v) => (v ? html`<dt>${k}</dt><dd>${v}</dd>` : '');
  return html`<div class="card"><dl class="details">
    ${row(t('students.regNo'), s.regNo)}
    ${row(t('students.fullName'), s.fullName)}
    ${row(t('students.nameWithInitials'), s.nameWithInitials)}
    ${row(t('students.gender'), tc('gender', s.gender))}
    ${row(t('students.birthday'), s.birthday ? `${fmtDate(s.birthday, { month: 'long' })} (${t('students.ageN', { n: age(s.birthday) })})` : '')}
    ${row(t('common.grade'), s.grade)}
    ${row(t('students.telephone'), s.telephone ? html`<a href="tel:${s.telephone}">${s.telephone}</a>` : '')}
    ${row(t('students.address'), s.address)}
    ${row(t('students.status'), tc('status', s.status))}
    ${row(t('students.admissionDate'), fmtDate(s.admissionDate, { month: 'long' }))}
    ${row(t('students.notes'), s.notes)}
  </dl></div>
  <div class="card"><h2>${t('students.sectionGuardian')}</h2><dl class="details">
    ${row(t('students.guardianName'), s.guardianName)}
    ${row(t('students.relationship'), tc('rel', s.guardianRelationship))}
    ${row(t('students.guardianPhone'), s.guardianPhone ? html`<a href="tel:${s.guardianPhone}">${s.guardianPhone}</a>` : '')}
  </dl></div>`;
}

function attendanceHtml(h) {
  if (!h.attendance.length) return emptyState('calendar', t('profile.noAttendance'));
  const byYear = {};
  h.attendance.forEach((r) => {
    const y = r.date.slice(0, 4);
    const m = r.date.slice(0, 7);
    const Y = byYear[y] = byYear[y] || { p: 0, a: 0, months: {} };
    if (r.status === 'P') Y.p++; else Y.a++;
    (Y.months[m] = Y.months[m] || []).push(r);
  });
  return html`${Object.keys(byYear).sort().reverse().map((y) => {
    const Y = byYear[y];
    const p = pct(Y.p, Y.a);
    return html`<div class="card">
      <div class="row between"><h2 style="margin:0">${y}</h2><b>${p}%</b></div>
      <p class="small muted" style="margin:4px 0 8px">${t('profile.attSummary', { p: Y.p, a: Y.a, n: Y.p + Y.a })}</p>
      ${pctBar(p)}
      <div class="mt">${Object.keys(Y.months).sort().reverse().map((m) => html`<div class="month-block">
        <div class="small"><b>${fmtMonth(m)}</b></div>
        <div class="dates">${Y.months[m].slice().sort((a, b) => a.date.localeCompare(b.date)).map((r) => html`
          <span class="${r.status === 'P' ? 'p' : 'a'}" title="${r.grade}">${Number(r.date.slice(8))} ${r.status === 'P' ? '✓' : '✗'}</span>`)}</div></div>`)}</div>
    </div>`;
  })}`;
}

function examsHtml(h) {
  if (!h.exams.length) return emptyState('book', t('profile.noExams'));
  return html`${h.exams.map((r) => {
    const max = Number(r.exam.maxMarks) || 100;
    const counted = r.marks.filter((m) => !m.absent);
    const avg = counted.length ? r.total / counted.length : null;
    return html`<a class="card card-link" href="#/exams/${encodeURIComponent(r.exam.examId)}">
      <div class="row between"><h2 style="margin:0">${r.exam.name}</h2><span class="badge primary">${t('profile.rank', { r: r.rank, n: r.of })}</span></div>
      <p class="small muted">${r.exam.grade} · ${r.exam.year}${r.exam.term ? ' · ' + t('exams.termN', { n: r.exam.term }) : ''}</p>
      <table class="data"><tbody>${r.marks.map((m) => html`<tr><td>${m.subject}</td><td class="num">${m.absent ? html`<span class="badge danger">${t('exams.absent')}</span>` : html`<b>${m.marks}</b> / ${max}`}</td></tr>`)}
        <tr><td><b>${t('exams.total')}</b></td><td class="num"><b>${num(r.total)}</b>${avg !== null ? html` <span class="muted small">(${t('exams.avg')} ${num(avg, 1)})</span>` : ''}</td></tr></tbody></table>
    </a>`;
  })}`;
}

function eventsHtml(h) {
  if (!h.events.length) return emptyState('star', t('profile.noEvents'));
  return html`<div class="list">${h.events.map((r) => html`<a class="list-item" href="#/events/${encodeURIComponent(r.event.eventId)}">
    <div class="main"><div class="title">${r.event.name}</div>
      <div class="sub">${tc('etype', r.event.type)} · ${fmtDate(r.event.date)}${r.remarks ? ' · ' + r.remarks : ''}</div></div>
    <div class="end">${r.place ? html`<div><span class="badge accent">${icon('award')}${r.place}</span></div>` : ''}
      ${r.marks !== '' ? html`<div class="small"><b>${r.marks}</b>${r.event.maxMarks ? ' / ' + r.event.maxMarks : ''}</div>` : ''}</div></a>`)}</div>`;
}

function prefectHtml(h) {
  if (!h.prefects.length) return emptyState('award', t('profile.noPrefect'));
  return html`<div class="card"><ul class="timeline">${h.prefects.map((p) => html`<li class="${p.endDate ? '' : 'current'}">
    <b>${tc('role', p.role)}</b> ${p.endDate ? '' : html`<span class="badge success">${t('prefects.current')}</span>`}
    <div class="small muted">${fmtDate(p.startDate)} – ${p.endDate ? fmtDate(p.endDate) : t('prefects.present')}</div>
    ${p.notes ? html`<div class="small">${p.notes}</div>` : ''}</li>`)}</ul></div>`;
}

function gradesHtml(h) {
  if (!h.gradeHistory.length) return emptyState('calendar', t('profile.noGrades'));
  return html`<div class="card"><ul class="timeline">${h.gradeHistory.map((g) => html`<li class="${g.toDate ? '' : 'current'}">
    <b>${g.grade}</b> <span class="muted small">(${g.year})</span>
    <div class="small muted">${fmtDate(g.fromDate)} – ${g.toDate ? fmtDate(g.toDate) : t('prefects.present')}</div></li>`)}</ul></div>`;
}

async function studentActions(s) {
  const choice = await modal({
    title: s.fullName,
    body: html`<div class="list menu-list">
      <button class="list-item" type="button" data-a="move">${icon('move')}<div class="main"><div class="title">${t('students.moveOne')}</div><div class="sub">${t('students.moveOneHint')}</div></div></button>
      <a class="list-item" href="#/prefects?appoint=${encodeURIComponent(s.regNo)}" data-a="prefect">${icon('award')}<div class="main"><div class="title">${t('prefects.appoint')}</div></div></a>
      <button class="list-item" type="button" data-a="delete" style="color:var(--danger)">${icon('trash')}<div class="main"><div class="title">${t('students.delete')}</div><div class="sub">${t('students.deleteHint')}</div></div></button>
    </div>`,
    onMount: (m, close) => m.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) close(b.dataset.a); })
  });
  if (choice === 'move') {
    if (await moveDialog([s.regNo])) go(`/students/${encodeURIComponent(s.regNo)}`, { replace: true });
  } else if (choice === 'delete') {
    const ok = await confirmDialog({ title: t('students.deleteTitle'), message: t('students.deleteConfirm', { name: s.fullName, reg: s.regNo }), okText: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await api('deleteStudent', { regNo: s.regNo });
      store.remove('students', 'regNo', s.regNo);
      store.refresh(500);
      toast(t('students.deleted'), 'success');
      go('/students', { replace: true });
    } catch (err) { handleError(err); }
  }
}
