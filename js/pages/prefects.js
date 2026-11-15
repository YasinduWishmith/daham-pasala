import { t, tc } from '../i18n.js';
import { html, icon, field, formData, showErrors, summaryBox, withBusy, toast, modal, confirmDialog, $ } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { setQuery } from '../router.js';
import { fmtDate, todayIso } from '../format.js';
import { handleError, emptyState, PREFECT_ROLES, pickStudents, studentAvatar } from './common.js';

export async function page({ root, query }) {
  const d = store.data;
  let show = query.get('show') || 'current';

  root.innerHTML = String(html`
    <div class="page-head"><h1>${t('prefects.title')}</h1></div>
    <div class="segmented mb" role="radiogroup">
      <label><input type="radio" name="show" value="current" ${show === 'current' ? 'checked' : ''}><span>${t('prefects.currentTab')}</span></label>
      <label><input type="radio" name="show" value="past" ${show === 'past' ? 'checked' : ''}><span>${t('prefects.pastTab')}</span></label>
    </div>
    <div data-list></div>
    <button class="fab" type="button" data-appoint>${icon('plus')}<span>${t('prefects.appoint')}</span></button>`);

  const roleOrder = (r) => PREFECT_ROLES.indexOf(r);
  const draw = () => {
    setQuery({ show: show === 'current' ? '' : show });
    const list = d.prefects.filter((p) => (show === 'current' ? !p.endDate : !!p.endDate) && store.student(p.regNo))
      .sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || b.startDate.localeCompare(a.startDate));
    if (!list.length) {
      $('[data-list]', root).innerHTML = String(emptyState('award', show === 'current' ? t('prefects.emptyCurrent') : t('prefects.emptyPast')));
      return;
    }
    const groups = {};
    list.forEach((p) => { (groups[p.role] = groups[p.role] || []).push(p); });
    $('[data-list]', root).innerHTML = String(html`${Object.keys(groups).map((role) => html`
      <h2 class="section-title">${tc('role', role)} (${groups[role].length})</h2>
      <div class="list mb">${groups[role].map((p) => {
        const s = store.student(p.regNo);
        return html`<div class="list-item">
          ${studentAvatar(s)}
          <a class="main" href="#/students/${encodeURIComponent(s.regNo)}" style="color:inherit;text-decoration:none">
            <div class="title">${s.fullName}</div>
            <div class="sub">${s.regNo} · ${s.grade}</div>
            <div class="sub">${fmtDate(p.startDate)} – ${p.endDate ? fmtDate(p.endDate) : t('prefects.present')}</div></a>
          <button class="icon-btn" type="button" data-edit="${p.prefectId}" aria-label="${t('common.edit')}">${icon('edit')}</button>
        </div>`;
      })}</div>`)}`);
  };

  root.addEventListener('change', (e) => { if (e.target.name === 'show') { show = e.target.value; draw(); } });
  root.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) {
      const p = d.prefects.find((x) => x.prefectId === ed.dataset.edit);
      if (await prefectDialog(p)) draw();
      return;
    }
    if (e.target.closest('[data-appoint]')) {
      const regs = await pickStudents({ multi: false, title: t('prefects.chooseStudent') });
      if (!regs || !regs.length) return;
      if (await prefectDialog({ regNo: regs[0], role: '', startDate: todayIso(), endDate: '', notes: '' })) { show = 'current'; $('input[value=current]', root).checked = true; draw(); }
    }
  });

  draw();
  const appoint = query.get('appoint');
  if (appoint && store.student(appoint)) {
    setQuery({});
    if (await prefectDialog({ regNo: appoint, role: '', startDate: todayIso(), endDate: '', notes: '' })) draw();
  }
}

/** Create / edit / end / delete a prefect appointment. Resolves true when something changed. */
function prefectDialog(p) {
  const isNew = !p.prefectId;
  const s = store.student(p.regNo);
  return modal({
    title: isNew ? t('prefects.appoint') : t('prefects.editTitle'),
    body: html`<div class="row mb">${studentAvatar(s)}<div><b>${s.fullName}</b><div class="small muted">${s.regNo} · ${s.grade}</div></div></div>
      <form novalidate data-pf>${summaryBox()}
        ${field({ name: 'role', type: 'select', label: t('prefects.role'), value: p.role, required: true, placeholder: t('common.choose'), options: PREFECT_ROLES.map((r) => ({ value: r, label: tc('role', r) })) })}
        <div class="grid-2">
          ${field({ name: 'startDate', type: 'date', label: t('prefects.start'), value: p.startDate, required: true })}
          ${field({ name: 'endDate', type: 'date', label: t('prefects.end'), value: p.endDate, hint: t('prefects.endHint') })}
        </div>
        ${field({ name: 'notes', type: 'textarea', label: t('students.notes'), value: p.notes, attrs: 'maxlength="300"' })}
        ${!isNew && !p.endDate ? html`<button class="btn outline block mb" type="button" data-end>${t('prefects.endToday')}</button>` : ''}
        ${!isNew ? html`<button class="btn danger-outline block" type="button" data-del>${icon('trash')}${t('prefects.deleteRecord')}</button>` : ''}
      </form>`,
    foot: html`<button class="btn outline" type="button" data-close>${t('common.cancel')}</button><button class="btn primary" type="button" data-ok>${t('common.save')}</button>`,
    onMount: (m, close) => {
      const form = $('[data-pf]', m);
      const save = (btn) => withBusy(btn, async () => {
        const v = { ...formData(form), regNo: p.regNo, prefectId: p.prefectId || '' };
        const clean = window.cleanPrefect_(v);
        const errs = window.validatePrefect_(clean);
        if (showErrors(form, errs)) return;
        try {
          const res = await api('savePrefect', { prefect: clean });
          store.upsert('prefects', 'prefectId', res.prefect);
          toast(t('common.saved'), 'success');
          close(true);
        } catch (err) { handleError(err, form); }
      });
      $('[data-ok]', m).addEventListener('click', (e) => save(e.currentTarget));
      const end = $('[data-end]', m);
      if (end) end.addEventListener('click', () => { form.endDate.value = todayIso(); save($('[data-ok]', m)); });
      const del = $('[data-del]', m);
      if (del) del.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: t('prefects.deleteRecord'), message: t('prefects.deleteConfirm'), okText: t('common.delete'), danger: true }))) return;
        try {
          await api('deletePrefect', { prefectId: p.prefectId });
          store.remove('prefects', 'prefectId', p.prefectId);
          toast(t('common.deleted'), 'success');
          close(true);
        } catch (err) { handleError(err); }
      });
    }
  });
}
