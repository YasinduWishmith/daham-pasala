// Shared helpers for pages.
import { t, tc, terr } from '../i18n.js';
import { html, raw, icon, toast, showErrors, modal, esc, initials } from '../ui.js';
import { store } from '../store.js';

export const REL = ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Guardian', 'Other'];
export const EVENT_TYPES = ['Debate', 'TalentShow', 'Meditation', 'PrefectProgram', 'Sports', 'Quiz', 'Essay', 'Art', 'Other'];
export const PREFECT_ROLES = ['HeadPrefect', 'DeputyHeadPrefect', 'SeniorPrefect', 'Prefect', 'JuniorPrefect', 'ClassMonitor', 'Other'];
export const STATUSES = ['Active', 'Left', 'Graduated'];

/** Handles an error from api(): field errors go to the form, everything else becomes a toast. */
export function handleError(err, form) {
  if (err && err.code === 'VALIDATION' && err.fields && form) {
    showErrors(form, err.fields);
    return;
  }
  if (err && err.code === 'VALIDATION' && err.fields) {
    toast(Object.values(err.fields).map(terr).join(' · '), 'error');
    return;
  }
  if (err && (err.code === 'SESSION_EXPIRED' || err.code === 'AUTH_REQUIRED')) return;
  console.error(err);
  toast(terr(err && err.code ? err.code : 'UNKNOWN'), 'error');
}

export const gradeOptions = () => (store.settings ? store.settings.grades : []).map((g) => ({ value: g, label: g }));
export const subjectOptions = () => (store.settings ? store.settings.subjects : []).map((g) => ({ value: g, label: g }));

export function emptyState(iconName, text, actionHtml) {
  return html`<div class="empty">${icon(iconName)}<p>${text}</p>${actionHtml || ''}</div>`;
}

export function studentAvatar(s, lg) {
  return html`<span class="avatar ${s.gender === 'F' ? 'f' : ''} ${lg ? 'lg' : ''}" aria-hidden="true">${initials(s.fullName)}</span>`;
}

export function statusBadge(status) {
  if (!status || status === 'Active') return '';
  return html`<span class="badge ${status === 'Graduated' ? 'success' : 'danger'}">${tc('status', status)}</span>`;
}

export function pctBar(p) {
  if (p === null) return '';
  return html`<div class="bar ${p < 60 ? 'bad' : p < 80 ? 'warn' : ''}" role="img" aria-label="${p}%"><i style="width:${p}%"></i></div>`;
}

/**
 * Student picker modal. Resolves with an array of regNos (or undefined when cancelled).
 * opts: {multi, exclude: Set, grades: [] (limit), title}
 */
export function pickStudents({ multi = true, exclude = new Set(), grades = [], title } = {}) {
  const all = store.data.students.filter((s) => s.status === 'Active' && !exclude.has(s.regNo));
  const gradeList = store.settings.grades;
  const chosen = new Set();
  let q = '';
  let g = grades.length === 1 ? grades[0] : '';
  const rows = () => {
    const ql = q.toLowerCase();
    const list = all.filter((s) => (!g || s.grade === g) && (!grades.length || grades.includes(s.grade)) &&
      (!ql || s.fullName.toLowerCase().includes(ql) || s.regNo.toLowerCase().includes(ql)))
      .sort((a, b) => a.fullName.localeCompare(b.fullName)).slice(0, 200);
    if (!list.length) return html`<div class="empty small">${t('students.noMatch')}</div>`;
    return html`${list.map((s) => html`<label class="list-item" style="cursor:pointer">
      <input type="${multi ? 'checkbox' : 'radio'}" name="pick" value="${s.regNo}" ${chosen.has(s.regNo) ? raw('checked') : ''} style="width:22px;height:22px;accent-color:var(--primary)">
      ${studentAvatar(s)}<div class="main"><div class="title">${s.fullName}</div><div class="sub">${s.regNo} · ${s.grade}</div></div></label>`)}`;
  };
  return modal({
    title: title || t('picker.title'),
    body: html`<div class="row mb">
        <input class="input grow" type="search" placeholder="${t('students.searchPh')}" aria-label="${t('students.searchPh')}" data-q>
        <select class="input" style="width:auto;max-width:45%" data-g aria-label="${t('common.grade')}">
          <option value="">${t('common.allGrades')}</option>
          ${gradeList.filter((x) => !grades.length || grades.includes(x)).map((x) => html`<option ${x === g ? raw('selected') : ''}>${x}</option>`)}
        </select></div>
      <div class="list" data-rows>${rows()}</div>`,
    foot: html`<button class="btn outline" type="button" data-close>${t('common.cancel')}</button>
      <button class="btn primary" type="button" data-ok>${t('picker.add')} <span data-n></span></button>`,
    onMount: (m, close) => {
      const box = m.querySelector('[data-rows]');
      const n = m.querySelector('[data-n]');
      const upd = () => { n.textContent = chosen.size ? `(${chosen.size})` : ''; };
      m.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; box.innerHTML = String(rows()); });
      m.querySelector('[data-g]').addEventListener('change', (e) => { g = e.target.value; box.innerHTML = String(rows()); });
      box.addEventListener('change', (e) => {
        if (!multi) chosen.clear();
        if (e.target.checked) chosen.add(e.target.value); else chosen.delete(e.target.value);
        upd();
        if (!multi) close([...chosen]);
      });
      m.querySelector('[data-ok]').addEventListener('click', () => close([...chosen]));
    }
  });
}

export { esc };
