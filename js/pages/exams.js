import { t } from '../i18n.js';
import { html, raw, icon, field, chipGroup, formData, wireForm, showErrors, summaryBox, withBusy, toast, confirmDialog,
  setDirty, skeletonHtml, errorStateHtml, downloadCsv, $, $$ } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { go, setQuery, back } from '../router.js';
import { fmtDate, todayIso, num } from '../format.js';
import { handleError, gradeOptions, emptyState, subjectOptions } from './common.js';

export async function listPage({ root, query }) {
  const d = store.data;
  let grade = query.get('grade') || '';
  let year = query.get('year') || '';
  const years = [...new Set(d.exams.map((e) => e.year))].sort().reverse();

  root.innerHTML = String(html`
    <div class="page-head"><h1>${t('exams.title')}</h1></div>
    <div class="grid-2 mb">
      <select class="input" data-grade aria-label="${t('common.grade')}"><option value="">${t('common.allGrades')}</option>
        ${d.settings.grades.map((g) => html`<option ${g === grade ? raw('selected') : ''}>${g}</option>`)}</select>
      <select class="input" data-year aria-label="${t('common.year')}"><option value="">${t('common.allYears')}</option>
        ${years.map((y) => html`<option ${y === year ? raw('selected') : ''}>${y}</option>`)}</select>
    </div>
    <div data-list></div>
    <a class="fab" href="#/exams/new${grade ? '?grade=' + encodeURIComponent(grade) : ''}" data-fab>${icon('plus')}<span>${t('exams.new')}</span></a>`);

  const draw = () => {
    setQuery({ grade, year });
    $('[data-fab]', root).href = '#/exams/new' + (grade ? '?grade=' + encodeURIComponent(grade) : '');
    const gi = (g) => d.settings.grades.indexOf(g);
    const list = d.exams.filter((e) => (!grade || e.grade === grade) && (!year || e.year === year))
      .sort((a, b) => b.year.localeCompare(a.year) || (b.term || '').localeCompare(a.term || '') || gi(a.grade) - gi(b.grade));
    $('[data-list]', root).innerHTML = String(list.length ? html`<div class="list">${list.map((e) => html`
      <a class="list-item" href="#/exams/${encodeURIComponent(e.examId)}">
        <div class="avatar" aria-hidden="true">${icon('book')}</div>
        <div class="main"><div class="title">${e.name}</div>
          <div class="sub">${e.grade} · ${e.year}${e.term ? ' · ' + t('exams.termN', { n: e.term }) : ''}${e.date ? ' · ' + fmtDate(e.date) : ''}</div>
          <div class="sub">${t('exams.subjectsN', { n: e.subjects.length })} · ${t('exams.outOf', { n: e.maxMarks })}</div></div>
        ${icon('chevron', 'chev')}</a>`)}</div>`
      : emptyState('book', d.exams.length ? t('exams.noMatch') : t('exams.empty'), html`<a class="btn primary" href="#/exams/new">${icon('plus')}${t('exams.new')}</a>`));
  };
  $('[data-grade]', root).addEventListener('change', (e) => { grade = e.target.value; draw(); });
  $('[data-year]', root).addEventListener('change', (e) => { year = e.target.value; draw(); });
  draw();
}

export async function formPage({ root, params, query, showBack, setTitle }) {
  const isNew = !params.id;
  const ex = isNew ? { grade: query.get('grade') || '', year: String(new Date().getFullYear()), maxMarks: '100', subjects: store.settings.subjects.slice(), term: '' }
    : store.data.exams.find((e) => e.examId === params.id);
  showBack(isNew ? '/exams' : `/exams/${encodeURIComponent(params.id)}`);
  if (!ex) { root.innerHTML = String(emptyState('alert', t('err.EXAM_NOT_FOUND'))); return; }
  setTitle(isNew ? t('exams.new') : t('exams.edit'));
  const subjOpts = [...new Set([...store.settings.subjects, ...ex.subjects])].map((s) => ({ value: s, label: s }));

  root.innerHTML = String(html`<h1>${isNew ? t('exams.new') : t('exams.edit')}</h1>
    <form novalidate class="has-sticky">${summaryBox()}
      <div class="card"><div class="form-grid">
        ${field({ name: 'name', label: t('exams.name'), value: ex.name, required: true, placeholder: t('exams.namePh'), cls: 'full', attrs: 'maxlength="100"' })}
        ${field({ name: 'grade', type: 'select', label: t('common.grade'), value: ex.grade, required: true, placeholder: t('common.choose'), options: gradeOptions() })}
        ${field({ name: 'year', type: 'number', label: t('common.year'), value: ex.year, required: true, attrs: 'inputmode="numeric" min="2000" max="2100"' })}
        ${field({ name: 'term', type: 'select', label: t('exams.term'), value: ex.term, placeholder: t('common.none'), options: ['1', '2', '3'].map((n) => ({ value: n, label: t('exams.termN', { n }) })) })}
        ${field({ name: 'date', type: 'date', label: t('common.date'), value: ex.date })}
        ${field({ name: 'maxMarks', type: 'number', label: t('exams.maxMarks'), value: ex.maxMarks, required: true, hint: t('exams.maxMarksHint'), attrs: 'inputmode="numeric" min="1" max="1000"' })}
      </div>
      ${chipGroup({ name: 'subjects', label: t('exams.subjects'), options: subjOpts, values: ex.subjects, required: true, hint: t('exams.subjectsHint') })}
      </div>
      <div class="sticky-actions"><button class="btn outline" type="button" data-cancel>${t('common.cancel')}</button>
        <button class="btn primary" type="submit">${icon('check')}${t('common.save')}</button></div>
    </form>`);
  const form = $('form', root);
  wireForm(form);
  $('[data-cancel]', root).addEventListener('click', () => back('/exams'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(form);
    v.examId = isNew ? '' : ex.examId;
    const clean = window.cleanExam_(v);
    const errs = window.validateExam_(clean, store.settings);
    if (showErrors(form, errs)) return;
    withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const res = await api('saveExam', { exam: clean });
        store.upsert('exams', 'examId', res.exam);
        setDirty(false);
        toast(t('common.saved'), 'success');
        go(`/exams/${encodeURIComponent(res.exam.examId)}`, { replace: true });
      } catch (err) { handleError(err, form); }
    });
  });
}

export async function detailPage({ root, params, query, showBack, isCurrent }) {
  showBack('/exams');
  const ex0 = store.data.exams.find((e) => e.examId === params.id);
  if (!ex0) { root.innerHTML = String(emptyState('alert', t('err.EXAM_NOT_FOUND'), html`<a class="btn outline" href="#/exams">${t('exams.title')}</a>`)); return; }
  let data = null;
  let tab = query.get('tab') || 'marks';
  let subject = query.get('subject') || ex0.subjects[0];
  let edits = {};

  root.innerHTML = String(html`
    <div class="card"><div class="row between" style="align-items:flex-start">
      <div class="grow"><h1 style="margin:0">${ex0.name}</h1>
        <div class="muted small">${ex0.grade} · ${ex0.year}${ex0.term ? ' · ' + t('exams.termN', { n: ex0.term }) : ''}${ex0.date ? ' · ' + fmtDate(ex0.date) : ''} · ${t('exams.outOf', { n: ex0.maxMarks })}</div></div>
      <a class="icon-btn" href="#/exams/${encodeURIComponent(ex0.examId)}/edit" aria-label="${t('common.edit')}">${icon('edit')}</a>
      <button class="icon-btn" type="button" data-delete aria-label="${t('common.delete')}">${icon('trash')}</button>
    </div></div>
    <div class="tabs mt" role="tablist">
      <button type="button" role="tab" data-tab="marks">${t('exams.enterMarks')}</button>
      <button type="button" role="tab" data-tab="results">${t('exams.results')}</button></div>
    <div data-body></div>
    <div class="sticky-actions" data-bar hidden><button class="btn primary" type="button" data-save>${icon('check')}${t('exams.saveSubject')}</button></div>`);

  const body = $('[data-body]', root);
  const bar = $('[data-bar]', root);
  const max = Number(ex0.maxMarks) || 100;

  const markOf = (reg, subj) => data.marks.find((m) => m.regNo === reg && m.subject === subj);

  const drawMarks = () => {
    const entered = data.students.filter((s) => { const m = edits[s.regNo]; return m && (m.absent || m.marks !== ''); }).length;
    body.innerHTML = String(html`
      <div class="chips scroll mb" role="radiogroup" aria-label="${t('exams.subject')}">${data.exam.subjects.map((s) => html`
        <button type="button" class="chip ${s === subject ? 'on' : ''}" role="radio" aria-checked="${s === subject}" data-subject="${s}">${s}</button>`)}</div>
      ${data.students.length ? html`
        <p class="small muted" data-progress>${t('exams.progress', { n: entered, total: data.students.length })}</p>
        <form novalidate data-mform class="has-sticky">${summaryBox()}
          <div class="list">${data.students.map((s, i) => {
            const m = edits[s.regNo] || { marks: '', absent: false };
            return html`<div class="marks-row" data-field="marks_${s.regNo}">
              <div class="main"><label class="title" for="mk-${i}">${s.fullName}</label><div class="sub small muted">${s.regNo}</div>
                <p class="field-err" hidden></p></div>
              <input class="input" id="mk-${i}" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" data-reg="${s.regNo}"
                value="${m.absent ? '' : m.marks}" ${m.absent ? raw('disabled') : ''} placeholder="/${max}" aria-label="${t('exams.marksFor', { name: s.fullName })}">
              <label class="absent"><input type="checkbox" data-absent="${s.regNo}" ${m.absent ? raw('checked') : ''}>${t('exams.absentShort')}</label>
            </div>`;
          })}</div></form>` : emptyState('users', t('exams.noStudents', { grade: data.exam.grade }))}`);
    bar.hidden = !data.students.length;
  };

  const loadEdits = () => {
    edits = {};
    data.students.forEach((s) => {
      const m = markOf(s.regNo, subject);
      edits[s.regNo] = m ? { marks: m.marks, absent: m.absent === 'Y' } : { marks: '', absent: false };
    });
    setDirty(false);
  };

  const drawResults = () => {
    bar.hidden = true;
    const subs = data.exam.subjects;
    const rows = data.students.map((s) => {
      const per = {};
      let total = 0, count = 0, any = false;
      subs.forEach((sub) => {
        const m = markOf(s.regNo, sub);
        if (!m) return;
        any = true;
        if (m.absent === 'Y') { per[sub] = 'AB'; return; }
        per[sub] = Number(m.marks);
        total += Number(m.marks);
        count++;
      });
      return { s, per, total, avg: count ? total / count : null, any };
    }).filter((r) => r.any).sort((a, b) => b.total - a.total);
    let rank = 0, prev = null;
    rows.forEach((r, i) => { if (r.total !== prev) { rank = i + 1; prev = r.total; } r.rank = rank; });
    const subStats = subs.map((sub) => {
      const vals = data.marks.filter((m) => m.subject === sub && m.absent !== 'Y').map((m) => Number(m.marks));
      return { sub, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, hi: vals.length ? Math.max(...vals) : null, n: vals.length };
    });
    if (!rows.length) { body.innerHTML = String(emptyState('chart', t('exams.noResults'))); return; }
    body.innerHTML = String(html`
      <div class="row between mb"><span class="small muted">${t('exams.resultsN', { n: rows.length })}</span>
        <button class="btn outline small" type="button" data-csv>${icon('download')}${t('common.downloadCsv')}</button></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th class="num">#</th><th class="sticky-col">${t('students.name')}</th>${subs.map((s) => html`<th class="num">${s}</th>`)}<th class="num">${t('exams.total')}</th><th class="num">${t('exams.avg')}</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr><td class="num">${r.rank}</td>
          <td class="sticky-col"><a href="#/students/${encodeURIComponent(r.s.regNo)}">${r.s.fullName}</a></td>
          ${subs.map((sub) => html`<td class="num ${r.per[sub] === 'AB' ? 'mark-a' : ''}">${r.per[sub] === undefined ? '–' : r.per[sub] === 'AB' ? t('exams.absentShort') : num(r.per[sub], 1)}</td>`)}
          <td class="num"><b>${num(r.total, 1)}</b></td><td class="num">${num(r.avg, 1)}</td></tr>`)}
        </tbody>
        <tfoot><tr><td></td><td class="sticky-col"><b>${t('exams.subjectAvg')}</b></td>${subStats.map((x) => html`<td class="num">${num(x.avg, 1)}</td>`)}<td></td><td></td></tr>
          <tr><td></td><td class="sticky-col"><b>${t('exams.highest')}</b></td>${subStats.map((x) => html`<td class="num">${num(x.hi, 1)}</td>`)}<td></td><td></td></tr></tfoot>
      </table></div>`);
    $('[data-csv]', body).addEventListener('click', () => {
      downloadCsv([['#', t('csv.RegNo'), t('csv.FullName'), ...subs, t('exams.total'), t('exams.avg')]]
        .concat(rows.map((r) => [r.rank, r.s.regNo, r.s.fullName, ...subs.map((sub) => (r.per[sub] === undefined ? '' : r.per[sub])), r.total, r.avg === null ? '' : r.avg.toFixed(1)])),
      `${data.exam.name}-${data.exam.grade}.csv`);
    });
  };

  const draw = () => {
    setQuery({ tab, subject });
    $$('[data-tab]', root).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    if (!data) { body.innerHTML = String(skeletonHtml(6)); bar.hidden = true; return; }
    if (tab === 'marks') drawMarks(); else drawResults();
  };

  const load = async () => {
    data = null;
    draw();
    try {
      data = await api('getExamMarks', { examId: ex0.examId });
      if (!isCurrent()) return;
      if (!data.exam.subjects.includes(subject)) subject = data.exam.subjects[0];
      loadEdits();
      draw();
    } catch (err) {
      if (!isCurrent()) return;
      body.innerHTML = String(errorStateHtml(err));
      $('[data-retry]', body).addEventListener('click', load);
    }
  };

  const updateProgress = () => {
    const el = $('[data-progress]', body);
    if (!el) return;
    const n = data.students.filter((s) => { const m = edits[s.regNo]; return m && (m.absent || m.marks !== ''); }).length;
    el.textContent = t('exams.progress', { n, total: data.students.length });
  };

  const confirmDiscard = async () => {
    const changed = data && data.students.some((s) => {
      const m = markOf(s.regNo, subject);
      const e = edits[s.regNo];
      return (m ? m.marks : '') !== (e.absent ? '' : e.marks) || (m ? m.absent === 'Y' : false) !== e.absent;
    });
    return !changed || confirmDialog({ title: t('confirm.unsavedTitle'), message: t('exams.discard'), okText: t('confirm.leave'), danger: true });
  };

  root.querySelector('.tabs').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    if (tab === 'marks' && !(await confirmDiscard())) return;
    tab = b.dataset.tab;
    if (data) loadEdits();
    draw();
  });

  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-subject]');
    if (!b || b.dataset.subject === subject) return;
    if (!(await confirmDiscard())) return;
    subject = b.dataset.subject;
    loadEdits();
    draw();
  });
  body.addEventListener('input', (e) => {
    const reg = e.target.dataset.reg;
    if (!reg) return;
    edits[reg].marks = e.target.value.trim();
    const wrap = e.target.closest('[data-field]');
    const err = window.marksError_(edits[reg].marks, max);
    const el = wrap.querySelector('.field-err');
    el.hidden = !err;
    el.textContent = err ? t('err.' + err, { arg: '' }).replace('{max}', max) : '';
    if (err) e.target.setAttribute('aria-invalid', 'true'); else e.target.removeAttribute('aria-invalid');
    setDirty(true);
    updateProgress();
  });
  body.addEventListener('change', (e) => {
    const reg = e.target.dataset.absent;
    if (!reg) return;
    edits[reg].absent = e.target.checked;
    const inp = body.querySelector(`[data-reg="${CSS.escape(reg)}"]`);
    inp.disabled = e.target.checked;
    if (e.target.checked) inp.value = '';
    setDirty(true);
    updateProgress();
  });
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.dataset.reg) return;
    e.preventDefault();
    const inputs = $$('[data-reg]:not([disabled])', body);
    const i = inputs.indexOf(e.target);
    if (inputs[i + 1]) inputs[i + 1].focus(); else e.target.blur();
  });

  $('[data-save]', root).addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    const form = $('[data-mform]', body);
    const entries = data.students.map((s) => ({ regNo: s.regNo, marks: edits[s.regNo].absent ? '' : edits[s.regNo].marks, absent: edits[s.regNo].absent }));
    const errs = {};
    entries.forEach((en) => { const er = en.absent ? '' : window.marksError_(en.marks, max); if (er) errs['marks_' + en.regNo] = er; });
    if (showErrors(form, errs)) return;
    try {
      const res = await api('saveExamMarks', { examId: ex0.examId, subject, entries });
      data.marks = data.marks.filter((m) => m.subject !== subject).concat(entries.filter((en) => en.absent || en.marks !== '')
        .map((en) => ({ examId: ex0.examId, regNo: en.regNo, subject, marks: en.absent ? '' : String(Number(en.marks)), absent: en.absent ? 'Y' : '' })));
      setDirty(false);
      toast(t('exams.savedSubject', { subject, n: res.saved }), 'success');
      const idx = data.exam.subjects.indexOf(subject);
      const nextSub = data.exam.subjects[idx + 1];
      if (nextSub) {
        toast(t('exams.nextSubjectQ', { subject: nextSub }), 'info', { action: t('common.yes'), onAction: () => { subject = nextSub; loadEdits(); draw(); window.scrollTo(0, 0); } });
      }
    } catch (err) { handleError(err, form); }
  }));

  $('[data-delete]', root).addEventListener('click', async () => {
    const ok = await confirmDialog({ title: t('exams.deleteTitle'), message: t('exams.deleteConfirm', { name: ex0.name }), okText: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await api('deleteExam', { examId: ex0.examId });
      store.remove('exams', 'examId', ex0.examId);
      toast(t('common.deleted'), 'success');
      go('/exams', { replace: true });
    } catch (err) { handleError(err); }
  });

  load();
}

export { todayIso, subjectOptions };
