import { t, tc } from '../i18n.js';
import { html, raw, icon, field, chipGroup, formData, wireForm, showErrors, summaryBox, withBusy, toast, confirmDialog,
  setDirty, skeletonHtml, errorStateHtml, downloadCsv, $, $$ } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { go, setQuery, back } from '../router.js';
import { fmtDate, todayIso, num } from '../format.js';
import { handleError, gradeOptions, emptyState, EVENT_TYPES, pickStudents, studentAvatar } from './common.js';

const typeIcon = (type) => ({ Meditation: 'lotus', PrefectProgram: 'award', Debate: 'users', Quiz: 'book', Essay: 'file' }[type] || 'star');

export async function listPage({ root, query }) {
  const d = store.data;
  let type = query.get('type') || '';
  let year = query.get('year') || '';
  const years = [...new Set(d.events.map((e) => e.date.slice(0, 4)))].sort().reverse();
  const counts = {};
  d.eventMarks.forEach((m) => { counts[m.eventId] = (counts[m.eventId] || 0) + 1; });

  root.innerHTML = String(html`
    <div class="page-head"><h1>${t('events.title')}</h1></div>
    <div class="grid-2 mb">
      <select class="input" data-type aria-label="${t('events.type')}"><option value="">${t('events.allTypes')}</option>
        ${EVENT_TYPES.map((x) => html`<option value="${x}" ${x === type ? raw('selected') : ''}>${tc('etype', x)}</option>`)}</select>
      <select class="input" data-year aria-label="${t('common.year')}"><option value="">${t('common.allYears')}</option>
        ${years.map((y) => html`<option ${y === year ? raw('selected') : ''}>${y}</option>`)}</select>
    </div>
    <div data-list></div>
    <a class="fab" href="#/events/new">${icon('plus')}<span>${t('events.new')}</span></a>`);

  const item = (e) => html`<a class="list-item" href="#/events/${encodeURIComponent(e.eventId)}">
    <div class="avatar" aria-hidden="true">${icon(typeIcon(e.type))}</div>
    <div class="main"><div class="title">${e.name}</div>
      <div class="sub">${tc('etype', e.type)} · ${fmtDate(e.date, { weekday: 'short' })}</div>
      <div class="sub">${e.grades.length ? e.grades.join(', ') : t('common.allGrades')} · ${t('events.participantsN', { n: counts[e.eventId] || 0 })}</div></div>
    ${icon('chevron', 'chev')}</a>`;

  const draw = () => {
    setQuery({ type, year });
    const today = todayIso();
    const list = d.events.filter((e) => (!type || e.type === type) && (!year || e.date.startsWith(year)));
    const up = list.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const past = list.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date));
    $('[data-list]', root).innerHTML = String(list.length ? html`
      ${up.length ? html`<h2 class="section-title">${t('events.upcoming')}</h2><div class="list mb">${up.map(item)}</div>` : ''}
      ${past.length ? html`<h2 class="section-title">${t('events.past')}</h2><div class="list">${past.map(item)}</div>` : ''}`
      : emptyState('star', d.events.length ? t('events.noMatch') : t('events.empty'), html`<a class="btn primary" href="#/events/new">${icon('plus')}${t('events.new')}</a>`));
  };
  $('[data-type]', root).addEventListener('change', (e) => { type = e.target.value; draw(); });
  $('[data-year]', root).addEventListener('change', (e) => { year = e.target.value; draw(); });
  draw();
}

export async function formPage({ root, params, showBack, setTitle }) {
  const isNew = !params.id;
  const ev = isNew ? { type: '', date: todayIso(), grades: [], maxMarks: '' } : store.data.events.find((e) => e.eventId === params.id);
  showBack(isNew ? '/events' : `/events/${encodeURIComponent(params.id)}`);
  if (!ev) { root.innerHTML = String(emptyState('alert', t('err.EVENT_NOT_FOUND'))); return; }
  setTitle(isNew ? t('events.new') : t('events.edit'));
  root.innerHTML = String(html`<h1>${isNew ? t('events.new') : t('events.edit')}</h1>
    <form novalidate class="has-sticky">${summaryBox()}
      <div class="card"><div class="form-grid">
        ${field({ name: 'name', label: t('events.name'), value: ev.name, required: true, placeholder: t('events.namePh'), cls: 'full', attrs: 'maxlength="100"' })}
        ${field({ name: 'type', type: 'select', label: t('events.type'), value: ev.type, required: true, placeholder: t('common.choose'), options: EVENT_TYPES.map((x) => ({ value: x, label: tc('etype', x) })) })}
        ${field({ name: 'date', type: 'date', label: t('common.date'), value: ev.date, required: true })}
        ${field({ name: 'maxMarks', type: 'number', label: t('events.maxMarks'), value: ev.maxMarks, hint: t('events.maxMarksHint'), attrs: 'inputmode="numeric" min="0" max="1000"' })}
      </div>
      ${chipGroup({ name: 'grades', label: t('events.grades'), options: gradeOptions(), values: ev.grades, hint: t('events.gradesHint') })}
      ${field({ name: 'description', type: 'textarea', label: t('events.description'), value: ev.description, attrs: 'maxlength="500"' })}
      </div>
      <div class="sticky-actions"><button class="btn outline" type="button" data-cancel>${t('common.cancel')}</button>
        <button class="btn primary" type="submit">${icon('check')}${t('common.save')}</button></div>
    </form>`);
  const form = $('form', root);
  wireForm(form);
  $('[data-cancel]', root).addEventListener('click', () => back('/events'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(form);
    v.eventId = isNew ? '' : ev.eventId;
    v.grades = v.grades || [];
    const clean = window.cleanEvent_(v);
    const errs = window.validateEvent_(clean, store.settings);
    if (showErrors(form, errs)) return;
    withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const res = await api('saveEvent', { event: clean });
        store.upsert('events', 'eventId', res.event);
        setDirty(false);
        toast(t('common.saved'), 'success');
        go(`/events/${encodeURIComponent(res.event.eventId)}`, { replace: true });
      } catch (err) { handleError(err, form); }
    });
  });
}

export async function detailPage({ root, params, showBack, isCurrent }) {
  showBack('/events');
  const ev = store.data.events.find((e) => e.eventId === params.id);
  if (!ev) { root.innerHTML = String(emptyState('alert', t('err.EVENT_NOT_FOUND'), html`<a class="btn outline" href="#/events">${t('events.title')}</a>`)); return; }
  const max = Number(ev.maxMarks) || 0;
  let entries = null;
  let saved = '';

  root.innerHTML = String(html`
    <div class="card"><div class="row" style="align-items:flex-start">
      <div class="avatar" aria-hidden="true">${icon(typeIcon(ev.type))}</div>
      <div class="grow"><h1 style="margin:0">${ev.name}</h1>
        <div class="muted small">${tc('etype', ev.type)} · ${fmtDate(ev.date, { weekday: 'long', month: 'long' })}</div>
        <div class="muted small">${ev.grades.length ? ev.grades.join(', ') : t('common.allGrades')}${max ? ' · ' + t('exams.outOf', { n: max }) : ''}</div></div>
      <a class="icon-btn" href="#/events/${encodeURIComponent(ev.eventId)}/edit" aria-label="${t('common.edit')}">${icon('edit')}</a>
      <button class="icon-btn" type="button" data-delete aria-label="${t('common.delete')}">${icon('trash')}</button></div>
      ${ev.description ? html`<p class="mt" style="margin-bottom:0">${ev.description}</p>` : ''}
    </div>
    <div class="row between mt mb"><h2 style="margin:0">${t('events.participants')}</h2>
      <div class="row"><button class="icon-btn" type="button" data-csv aria-label="${t('common.downloadCsv')}">${icon('download')}</button>
      <button class="btn outline small" type="button" data-add>${icon('plus')}${t('events.addParticipants')}</button></div></div>
    <form novalidate data-body class="has-sticky"></form>
    <div class="sticky-actions" data-bar hidden><button class="btn primary" type="button" data-save>${icon('check')}${t('common.save')}</button></div>`);

  const body = $('[data-body]', root);
  const bar = $('[data-bar]', root);
  const nameOf = (r) => { const s = store.student(r); return s ? s.fullName : r; };
  const changed = () => JSON.stringify(entries) !== saved;

  const draw = () => {
    if (!entries) { body.innerHTML = String(skeletonHtml(3)); return; }
    bar.hidden = !entries.length && !changed();
    if (!entries.length) {
      body.innerHTML = String(html`${summaryBox()}${emptyState('users', t('events.noParticipants'), html`<button class="btn primary" type="button" data-add2>${icon('plus')}${t('events.addParticipants')}</button>`)}`);
      return;
    }
    body.innerHTML = String(html`${summaryBox()}<div class="list">${entries.map((en, i) => {
      const s = store.student(en.regNo) || { fullName: en.regNo, regNo: en.regNo };
      return html`<div class="ev-row" data-i="${i}">
        <div class="row">${studentAvatar(s)}<div class="grow"><div class="title"><b>${s.fullName}</b></div><div class="small muted">${en.regNo}${s.grade ? ' · ' + s.grade : ''}</div></div>
          <button class="icon-btn" type="button" data-remove="${i}" aria-label="${t('common.remove')} ${s.fullName}">${icon('x')}</button></div>
        <div class="fields">
          <div data-field="marks_${en.regNo}"><input class="input" type="text" inputmode="decimal" data-k="marks" value="${en.marks}" placeholder="${t('events.marks')}${max ? ' /' + max : ''}" aria-label="${t('events.marks')}"><p class="field-err" hidden></p></div>
          <div data-field="place_${en.regNo}"><input class="input" type="text" data-k="place" value="${en.place}" list="places" maxlength="40" placeholder="${t('events.place')}" aria-label="${t('events.place')}"><p class="field-err" hidden></p></div>
          <div class="full" data-field="remarks_${en.regNo}"><input class="input" type="text" data-k="remarks" value="${en.remarks}" maxlength="200" placeholder="${t('events.remarks')}" aria-label="${t('events.remarks')}"><p class="field-err" hidden></p></div>
        </div></div>`;
    })}</div>
    <datalist id="places">${['1', '2', '3'].map((n) => html`<option value="${t('events.placeN.' + n)}">`)}<option value="${t('events.merit')}"><option value="${t('events.participation')}"></datalist>`);
  };

  const load = async () => {
    entries = null;
    draw();
    try {
      const res = await api('getEventMarks', { eventId: ev.eventId });
      if (!isCurrent()) return;
      entries = res.entries.map((m) => ({ regNo: m.regNo, marks: m.marks, place: m.place, remarks: m.remarks }))
        .sort((a, b) => (Number(b.marks) || 0) - (Number(a.marks) || 0) || nameOf(a.regNo).localeCompare(nameOf(b.regNo)));
      saved = JSON.stringify(entries);
      draw();
    } catch (err) {
      if (!isCurrent()) return;
      body.innerHTML = String(errorStateHtml(err));
      $('[data-retry]', body).addEventListener('click', load);
    }
  };

  const add = async () => {
    if (!entries) return;
    const regs = await pickStudents({ exclude: new Set(entries.map((e) => e.regNo)), grades: ev.grades, title: t('events.addParticipants') });
    if (!regs || !regs.length) return;
    regs.forEach((r) => entries.push({ regNo: r, marks: '', place: '', remarks: '' }));
    setDirty(true);
    draw();
  };

  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-add], [data-add2]')) { add(); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) { entries.splice(Number(rm.dataset.remove), 1); setDirty(true); draw(); }
  });
  body.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const i = Number(e.target.closest('[data-i]').dataset.i);
    entries[i][k] = e.target.value;
    const wrap = e.target.closest('[data-field]');
    const err = k === 'marks' ? window.marksError_(e.target.value.trim(), max) : '';
    const el = wrap.querySelector('.field-err');
    el.hidden = !err;
    el.textContent = err ? t('err.' + err) : '';
    setDirty(true);
    bar.hidden = false;
  });
  body.addEventListener('submit', (e) => e.preventDefault());

  $('[data-save]', root).addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    const errs = {};
    const labels = {};
    entries.forEach((en) => {
      const er = window.marksError_(String(en.marks).trim(), max);
      if (er) { errs['marks_' + en.regNo] = er; labels['marks_' + en.regNo] = nameOf(en.regNo); }
    });
    if (showErrors(body, errs, labels)) return;
    try {
      const res = await api('saveEventMarks', { eventId: ev.eventId, entries });
      store.set('eventMarks', store.data.eventMarks.filter((m) => m.eventId !== ev.eventId).concat(res.entries));
      entries = res.entries.map((m) => ({ regNo: m.regNo, marks: m.marks, place: m.place, remarks: m.remarks }));
      saved = JSON.stringify(entries);
      setDirty(false);
      toast(t('common.saved'), 'success');
      draw();
    } catch (err) { handleError(err, body); }
  }));

  $('[data-csv]', root).addEventListener('click', () => {
    if (!entries || !entries.length) return;
    downloadCsv([[t('csv.RegNo'), t('csv.FullName'), t('events.marks'), t('events.place'), t('events.remarks')]]
      .concat(entries.map((en) => [en.regNo, nameOf(en.regNo), en.marks, en.place, en.remarks])), `${ev.name}.csv`);
  });

  $('[data-delete]', root).addEventListener('click', async () => {
    const ok = await confirmDialog({ title: t('events.deleteTitle'), message: t('events.deleteConfirm', { name: ev.name }), okText: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await api('deleteEvent', { eventId: ev.eventId });
      store.remove('events', 'eventId', ev.eventId);
      store.set('eventMarks', store.data.eventMarks.filter((m) => m.eventId !== ev.eventId));
      setDirty(false);
      toast(t('common.deleted'), 'success');
      go('/events', { replace: true });
    } catch (err) { handleError(err); }
  });

  load();
}

export { num, $$ };
