import { t, LANGS, getLang, setLang } from '../i18n.js';
import { html, raw, icon, field, chipGroup, formData, wireForm, showErrors, summaryBox, withBusy, toast,
  listEditorHtml, mountListEditor, setDirty, $ } from '../ui.js';
import { api, setToken, DEMO, demoModule } from '../api.js';
import { store } from '../store.js';
import { go } from '../router.js';
import { handleError } from './common.js';
import { DAYS } from '../format.js';

function langChips() {
  return html`<div class="lang-chips" role="group" aria-label="${t('lang.choose')}">${LANGS.map((l) => html`
    <button type="button" class="chip ${l.code === getLang() ? 'on' : ''}" data-lang="${l.code}" lang="${l.code}" aria-pressed="${l.code === getLang()}">${l.label}</button>`)}</div>`;
}

function wireLangChips(root) {
  root.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
}

function signedIn(res) {
  setToken(res.token);
  store.clear();
  setDirty(false);
}

export async function loginPage({ root }) {
  root.innerHTML = String(html`<div class="auth">
    <div class="auth-hero">${icon('lotus', 'logo')}<h1>${t('app.name')}</h1><p class="muted">${t('auth.tagline')}</p></div>
    ${langChips()}
    ${DEMO ? html`<div class="alert warn">${icon('info')}<div>${t('demo.loginHint')}
      <div class="mt"><button class="btn outline small" type="button" data-demo>${icon('star')}${t('demo.openSample')}</button></div></div></div>` : ''}
    <form class="card" novalidate>
      <h2>${t('auth.login')}</h2>
      ${summaryBox()}
      ${field({ name: 'username', label: t('auth.username'), required: true, attrs: 'autocomplete="username" autocapitalize="none" spellcheck="false" enterkeyhint="next"' })}
      ${field({ name: 'password', type: 'password', label: t('auth.password'), required: true, autocomplete: 'current-password' })}
      <button class="btn primary block" type="submit">${t('auth.loginBtn')}</button>
    </form>
    <p class="muted" style="text-align:center;margin-top:20px">${t('auth.noAccount')}</p>
    <a class="btn outline block" href="#/register">${icon('plus')}${t('auth.registerSchool')}</a>
  </div>`);
  wireLangChips(root);
  const form = $('form', root);
  wireForm(form, { trackDirty: false });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(form);
    const errs = {};
    if (!d.username.trim()) errs.username = 'REQUIRED';
    if (!d.password) errs.password = 'REQUIRED';
    if (showErrors(form, errs)) return;
    withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const res = await api('login', { username: d.username, password: d.password });
        signedIn(res);
        toast(t('auth.welcome', { name: res.school.name }), 'success');
        go('/', { replace: true });
      } catch (err) {
        if (err.code === 'LOGIN_INVALID' || err.code === 'TOO_MANY_ATTEMPTS') {
          showErrors(form, { password: err.code });
        } else handleError(err, form);
      }
    });
  });
  const demoBtn = root.querySelector('[data-demo]');
  if (demoBtn) demoBtn.addEventListener('click', () => withBusy(demoBtn, async () => {
    const m = await demoModule();
    const res = m.seedDemo();
    signedIn(res);
    go('/', { replace: true });
  }));
}

export function gradePresets() {
  return t('preset.grades').split('|');
}
export function subjectPresets() {
  return t('preset.subjects').split('|');
}

export function dayOptions() {
  return DAYS.map((d) => ({ value: d, label: t('day.' + d) }));
}

export async function registerPage({ root, showBack }) {
  showBack('/login');
  root.innerHTML = String(html`<div class="auth" style="max-width:640px">
    ${langChips()}
    <h1>${t('reg.title')}</h1>
    <p class="muted">${t('reg.intro')}</p>
    <form novalidate class="has-sticky">
      ${summaryBox()}
      <div class="card">
        <h2>${t('reg.school')}</h2>
        ${field({ name: 'schoolName', label: t('reg.schoolName'), required: true, attrs: 'maxlength="100" autocomplete="organization"' })}
        ${field({ name: 'address', label: t('reg.address'), attrs: 'maxlength="200"' })}
      </div>
      <div class="card">
        <h2>${t('reg.loginDetails')}</h2>
        ${field({ name: 'username', label: t('auth.username'), required: true, hint: t('reg.usernameHint'), attrs: 'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="30"' })}
        ${field({ name: 'password', type: 'password', label: t('auth.password'), required: true, hint: t('reg.passwordHint'), autocomplete: 'new-password' })}
        ${field({ name: 'password2', type: 'password', label: t('reg.confirmPassword'), required: true, autocomplete: 'new-password' })}
      </div>
      <div class="card">
        <h2>${t('reg.workingDays')}</h2>
        ${chipGroup({ name: 'workingDays', label: t('reg.workingDaysLabel'), options: dayOptions(), values: ['Sun'], required: true })}
      </div>
      <div class="card">
        <h2>${t('reg.grades')}</h2>
        ${listEditorHtml({ name: 'grades', label: t('reg.gradesLabel'), values: [], placeholder: t('reg.gradePh'), presetLabel: t('reg.usePresetGrades'), hint: t('reg.gradesHint') })}
      </div>
      <div class="card">
        <h2>${t('reg.subjects')}</h2>
        ${listEditorHtml({ name: 'subjects', label: t('reg.subjectsLabel'), values: [], placeholder: t('reg.subjectPh'), presetLabel: t('reg.usePresetSubjects') })}
      </div>
      <div class="sticky-actions"><button class="btn primary" type="submit">${icon('check')}${t('reg.create')}</button></div>
    </form>
  </div>`);
  wireLangChips(root);
  const form = $('form', root);
  wireForm(form);
  mountListEditor($('[data-list=grades]', form), { preset: gradePresets });
  mountListEditor($('[data-list=subjects]', form), { preset: subjectPresets });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(form);
    d.grades = JSON.parse(d.grades);
    d.subjects = JSON.parse(d.subjects);
    const errs = window.validateSchoolSetup_(d, true);
    if (!errs.password && d.password !== d.password2) errs.password2 = 'PASSWORD_MISMATCH';
    if (showErrors(form, errs)) return;
    withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const res = await api('register', d);
        signedIn(res);
        toast(t('reg.done'), 'success');
        go('/', { replace: true });
      } catch (err) { handleError(err, form); }
    });
  });
}

export { raw };
