import { t, LANGS, getLang } from '../i18n.js';
import { html, icon, field, chipGroup, formData, wireForm, showErrors, summaryBox, withBusy, toast, modal, confirmDialog,
  setDirty, listEditorHtml, mountListEditor, downloadBlob, $ } from '../ui.js';
import { api, setToken, DEMO, demoModule } from '../api.js';
import { store } from '../store.js';
import { go } from '../router.js';
import { handleError } from './common.js';
import { dayOptions, gradePresets, subjectPresets } from './auth.js';

export async function morePage({ root }) {
  const lang = LANGS.find((l) => l.code === getLang());
  root.innerHTML = String(html`<h1>${t('nav.more')}</h1>
    <div class="list menu-list">
      <a class="list-item" href="#/events">${icon('star')}<div class="main"><div class="title">${t('nav.events')}</div><div class="sub">${t('more.eventsSub')}</div></div>${icon('chevron', 'chev')}</a>
      <a class="list-item" href="#/prefects">${icon('award')}<div class="main"><div class="title">${t('nav.prefects')}</div><div class="sub">${t('more.prefectsSub')}</div></div>${icon('chevron', 'chev')}</a>
      <a class="list-item" href="#/attendance/report">${icon('chart')}<div class="main"><div class="title">${t('att.reportTitle')}</div></div>${icon('chevron', 'chev')}</a>
      <a class="list-item" href="#/settings">${icon('settings')}<div class="main"><div class="title">${t('nav.settings')}</div><div class="sub">${t('more.settingsSub')}</div></div>${icon('chevron', 'chev')}</a>
      <button class="list-item" type="button" data-lang>${icon('globe')}<div class="main"><div class="title">${t('lang.choose')}</div><div class="sub">${lang.label}</div></div>${icon('chevron', 'chev')}</button>
      <button class="list-item" type="button" data-export>${icon('download')}<div class="main"><div class="title">${t('settings.download')}</div><div class="sub">${t('settings.downloadSub')}</div></div></button>
      <button class="list-item" type="button" data-logout style="color:var(--danger)">${icon('logout')}<div class="main"><div class="title">${t('auth.logout')}</div></div></button>
    </div>
    <p class="small muted mt" style="text-align:center">${t('app.name')} · v${window.APP_VERSION || ''}</p>`);
  $('[data-lang]', root).addEventListener('click', () => document.getElementById('langBtn').click());
  $('[data-export]', root).addEventListener('click', (e) => exportXlsx(e.currentTarget.querySelector('.title')));
  $('[data-logout]', root).addEventListener('click', logout);
}

async function exportXlsx(btn) {
  const target = btn && btn.closest('button');
  return withBusy(target, async () => {
    try {
      const res = await api('exportXlsx');
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), res.filename);
      toast(t('settings.downloaded'), 'success');
    } catch (err) { handleError(err); }
  });
}

async function logout() {
  if (!(await confirmDialog({ title: t('auth.logout'), message: t('auth.logoutConfirm'), okText: t('auth.logout') }))) return;
  try { await api('logout'); } catch (e) { /* sign out locally anyway */ }
  setToken(null);
  store.clear();
  setDirty(false);
  go('/login', { replace: true });
}

export async function settingsPage({ root, showBack }) {
  showBack('/more');
  const s = store.settings;
  let savedGrades = s.grades.slice();

  root.innerHTML = String(html`<h1>${t('nav.settings')}</h1>
    <form novalidate data-sf>
      ${summaryBox()}
      <div class="card"><h2>${t('reg.school')}</h2>
        ${field({ name: 'schoolName', label: t('reg.schoolName'), value: s.schoolName, required: true, attrs: 'maxlength="100"' })}
        ${field({ name: 'address', label: t('reg.address'), value: s.address, attrs: 'maxlength="200"' })}
        ${field({ name: 'academicYear', type: 'number', label: t('settings.academicYear'), value: s.academicYear, required: true, hint: t('settings.academicYearHint'), attrs: 'inputmode="numeric" min="2000" max="2100"' })}
        ${chipGroup({ name: 'workingDays', label: t('reg.workingDaysLabel'), options: dayOptions(), values: s.workingDays, required: true })}
      </div>
      <div class="card"><h2>${t('reg.grades')}</h2>
        ${listEditorHtml({ name: 'grades', label: t('reg.gradesLabel'), values: s.grades, placeholder: t('reg.gradePh'), presetLabel: t('reg.usePresetGrades'), hint: t('settings.gradesHint'), renamable: true })}
      </div>
      <div class="card"><h2>${t('reg.subjects')}</h2>
        ${listEditorHtml({ name: 'subjects', label: t('reg.subjectsLabel'), values: s.subjects, placeholder: t('reg.subjectPh'), presetLabel: t('reg.usePresetSubjects') })}
      </div>
      <button class="btn primary block mt" type="submit">${icon('check')}${t('settings.save')}</button>
    </form>

    <form novalidate class="card mt" data-pw autocomplete="off">
      <h2>${t('settings.changePassword')}</h2>
      ${summaryBox()}
      <input type="text" name="username" value="${store.data.school.username}" autocomplete="username" hidden>
      ${field({ name: 'currentPassword', type: 'password', label: t('settings.currentPassword'), required: true, autocomplete: 'current-password' })}
      ${field({ name: 'newPassword', type: 'password', label: t('settings.newPassword'), required: true, hint: t('reg.passwordHint'), autocomplete: 'new-password' })}
      ${field({ name: 'newPassword2', type: 'password', label: t('reg.confirmPassword'), required: true, autocomplete: 'new-password' })}
      <p class="hint">${t('settings.passwordOthers')}</p>
      <button class="btn outline block" type="submit">${icon('lock')}${t('settings.changePassword')}</button>
    </form>

    <div class="card mt"><h2>${t('settings.data')}</h2>
      <p class="small muted">${t('settings.dataIntro')}</p>
      <button class="btn outline block" type="button" data-export>${icon('download')}${t('settings.download')}</button>
      ${DEMO ? html`<button class="btn danger-outline block mt" type="button" data-reset>${icon('trash')}${t('demo.reset')}</button>`
        : html`<button class="btn outline block mt" type="button" data-share>${icon('share')}${t('settings.share')}</button>`}
    </div>
    <div class="card mt"><h2>${t('settings.account')}</h2>
      <p class="small"><span class="muted">${t('auth.username')}:</span> <b>${store.data.school.username}</b></p>
      <button class="btn danger-outline block" type="button" data-logout>${icon('logout')}${t('auth.logout')}</button>
    </div>`);

  const form = $('[data-sf]', root);
  wireForm(form);
  const gradesEd = mountListEditor($('[data-list=grades]', form), {
    preset: gradePresets,
    isSaved: (g) => savedGrades.includes(g),
    onRename: (oldName) => renameGrade(oldName).then((nv) => {
      if (nv) savedGrades = savedGrades.map((g) => (g === oldName ? nv : g));
      return nv;
    })
  });
  mountListEditor($('[data-list=subjects]', form), { preset: subjectPresets });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(form);
    v.grades = JSON.parse(v.grades);
    v.subjects = JSON.parse(v.subjects);
    v.workingDays = v.workingDays || [];
    const errs = window.validateSchoolSetup_(v, false);
    const busy = savedGrades.filter((g) => !v.grades.includes(g) && store.data.students.some((x) => x.grade === g && x.status === 'Active'));
    if (!errs.grades && busy.length) errs.grades = 'GRADE_HAS_STUDENTS:' + busy.join(', ');
    if (showErrors(form, errs)) return;
    withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const res = await api('saveSettings', v);
        store.set('settings', res.settings);
        store.set('school', { ...store.data.school, name: res.settings.schoolName });
        savedGrades = res.settings.grades.slice();
        gradesEd.set(res.settings.grades);
        document.getElementById('topTitle').textContent = res.settings.schoolName;
        setDirty(false);
        store.refresh(300);
        toast(t('common.saved'), 'success');
      } catch (err) { handleError(err, form); }
    });
  });

  const pw = $('[data-pw]', root);
  wireForm(pw, { trackDirty: false });
  pw.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formData(pw);
    const errs = {};
    if (!v.currentPassword) errs.currentPassword = 'REQUIRED';
    if (!v.newPassword) errs.newPassword = 'REQUIRED'; else if (v.newPassword.length < 8) errs.newPassword = 'PASSWORD_SHORT';
    if (!errs.newPassword && v.newPassword !== v.newPassword2) errs.newPassword2 = 'PASSWORD_MISMATCH';
    if (showErrors(pw, errs)) return;
    withBusy(pw.querySelector('[type=submit]'), async () => {
      try {
        await api('changePassword', { currentPassword: v.currentPassword, newPassword: v.newPassword });
        pw.reset();
        toast(t('settings.passwordChanged'), 'success');
      } catch (err) { handleError(err, pw); }
    });
  });

  $('[data-export]', root).addEventListener('click', (e) => exportXlsx(e.currentTarget));
  $('[data-logout]', root).addEventListener('click', logout);
  const reset = $('[data-reset]', root);
  if (reset) reset.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: t('demo.reset'), message: t('demo.resetConfirm'), okText: t('common.delete'), danger: true }))) return;
    (await demoModule()).resetDemo();
    setToken(null);
    store.clear();
    setDirty(false);
    go('/login', { replace: true });
  });
  const share = $('[data-share]', root);
  if (share) share.addEventListener('click', shareDialog);
}

function renameGrade(oldName) {
  return modal({
    title: t('settings.renameGrade'),
    body: html`<form novalidate data-rf>${summaryBox()}
      ${field({ name: 'to', label: t('settings.newGradeName'), value: oldName, required: true, attrs: 'maxlength="40"' })}
      <p class="hint">${t('settings.renameHint', { name: oldName })}</p></form>`,
    foot: html`<button class="btn outline" type="button" data-close>${t('common.cancel')}</button><button class="btn primary" type="button" data-ok>${t('common.save')}</button>`,
    onMount: (m, close) => {
      const form = $('[data-rf]', m);
      form.addEventListener('submit', (e) => { e.preventDefault(); $('[data-ok]', m).click(); });
      $('[data-ok]', m).addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        const to = form.to.value.replace(/\s+/g, ' ').trim();
        if (!to) { showErrors(form, { to: 'REQUIRED' }); return; }
        if (to === oldName) { close(null); return; }
        try {
          const res = await api('renameGrade', { from: oldName, to });
          store.set('settings', res.settings);
          store.data.students.forEach((s) => { if (s.grade === oldName) s.grade = to; });
          store.data.exams.forEach((x) => { if (x.grade === oldName) x.grade = to; });
          store.refresh(300);
          toast(t('settings.renamed'), 'success');
          close(to);
        } catch (err) { handleError(err, form); }
      }));
    }
  });
}

function shareDialog() {
  return modal({
    title: t('settings.share'),
    body: html`<p class="small muted">${t('settings.shareIntro')}</p>
      <form novalidate data-shf>${summaryBox()}
        ${field({ name: 'email', type: 'email', label: t('settings.googleEmail'), required: true, attrs: 'inputmode="email" autocomplete="email"' })}
        ${field({ name: 'role', type: 'select', label: t('settings.access'), value: 'view', options: [{ value: 'view', label: t('settings.viewOnly') }, { value: 'edit', label: t('settings.canEdit') }] })}
      </form>`,
    foot: html`<button class="btn outline" type="button" data-close>${t('common.cancel')}</button><button class="btn primary" type="button" data-ok>${t('settings.shareBtn')}</button>`,
    onMount: (m, close) => {
      const form = $('[data-shf]', m);
      $('[data-ok]', m).addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        const v = formData(form);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) { showErrors(form, { email: v.email.trim() ? 'EMAIL_INVALID' : 'REQUIRED' }); return; }
        try {
          const res = await api('shareSheet', v);
          close();
          modal({ title: t('settings.shared'), body: html`<p>${t('settings.sharedMsg', { email: v.email })}</p><a class="btn primary block" href="${res.url}" target="_blank" rel="noopener">${t('settings.openSheet')}</a>` });
        } catch (err) { handleError(err, form); }
      }));
    }
  });
}
