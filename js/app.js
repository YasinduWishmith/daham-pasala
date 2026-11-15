import { route, onRoute, render, go, back, currentRoute } from './router.js';
import { t, LANGS, getLang, setLang, onLangChange } from './i18n.js';
import { html, raw, icon, modal, toast, errorStateHtml, loaderHtml, isDirty, confirmDialog, setDirty, esc } from './ui.js';
import { getToken, setAuthLostHandler, DEMO } from './api.js';
import { store } from './store.js';

import * as auth from './pages/auth.js';
import * as dashboard from './pages/dashboard.js';
import * as students from './pages/students.js';
import * as attendance from './pages/attendance.js';
import * as exams from './pages/exams.js';
import * as events from './pages/events.js';
import * as prefects from './pages/prefects.js';
import * as settings from './pages/settings.js';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const titleEl = document.getElementById('topTitle');
const backBtn = document.getElementById('backBtn');
const langBtn = document.getElementById('langBtn');

/* ---------------- Routes ---------------- */
route('/login', auth.loginPage, { public: true });
route('/register', auth.registerPage, { public: true });
route('/', dashboard.page, { tab: 'home' });
route('/students', students.listPage, { tab: 'students' });
route('/students/new', students.formPage, { tab: 'students' });
route('/students/:regNo/edit', students.formPage, { tab: 'students' });
route('/students/:regNo', students.profilePage, { tab: 'students' });
route('/attendance', attendance.takePage, { tab: 'attendance' });
route('/attendance/report', attendance.reportPage, { tab: 'attendance' });
route('/exams', exams.listPage, { tab: 'exams' });
route('/exams/new', exams.formPage, { tab: 'exams' });
route('/exams/:id/edit', exams.formPage, { tab: 'exams' });
route('/exams/:id', exams.detailPage, { tab: 'exams' });
route('/events', events.listPage, { tab: 'events' });
route('/events/new', events.formPage, { tab: 'events' });
route('/events/:id/edit', events.formPage, { tab: 'events' });
route('/events/:id', events.detailPage, { tab: 'events' });
route('/prefects', prefects.page, { tab: 'prefects' });
route('/more', settings.morePage, { tab: 'more' });
route('/settings', settings.settingsPage, { tab: 'settings' });

/* ---------------- Shell ---------------- */
const TABS = [
  { id: 'home', href: '#/', icon: 'home', label: 'nav.home' },
  { id: 'students', href: '#/students', icon: 'users', label: 'nav.students' },
  { id: 'attendance', href: '#/attendance', icon: 'checkSquare', label: 'nav.attendance' },
  { id: 'exams', href: '#/exams', icon: 'book', label: 'nav.exams' },
  { id: 'events', href: '#/events', icon: 'star', label: 'nav.events', side: true },
  { id: 'prefects', href: '#/prefects', icon: 'award', label: 'nav.prefects', side: true },
  { id: 'settings', href: '#/settings', icon: 'settings', label: 'nav.settings', side: true },
  { id: 'more', href: '#/more', icon: 'menu', label: 'nav.more', more: true }
];

function renderTabbar(active) {
  const moreActive = ['events', 'prefects', 'settings', 'more'].includes(active);
  tabbar.innerHTML = String(html`${TABS.map((tb) => html`
    <a href="${tb.href}" class="${tb.side ? 'side-only' : ''} ${tb.more ? 'tab-more' : ''} ${tb.id === active || (tb.more && moreActive) ? 'active' : ''}"
      ${tb.id === active ? raw('aria-current="page"') : ''}>${icon(tb.icon)}<span>${t(tb.label)}</span></a>`)}`);
}

function updateLangBtn() {
  const l = LANGS.find((x) => x.code === getLang());
  langBtn.textContent = l.short;
  langBtn.setAttribute('aria-label', t('lang.choose') + ' (' + l.label + ')');
}

export function openLangMenu() {
  return modal({
    title: t('lang.choose'),
    body: html`<div class="list menu-list">${LANGS.map((l) => html`
      <button class="list-item" type="button" data-lang="${l.code}" lang="${l.code}">
        ${icon('globe')}<div class="main"><div class="title">${l.label}</div></div>
        ${l.code === getLang() ? icon('check', 'chev') : ''}</button>`)}</div>`,
    onMount: (m, close) => m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lang]');
      if (b) close(b.dataset.lang);
    })
  }).then(async (code) => {
    if (!code || code === getLang()) return;
    if (isDirty() && !(await confirmDialog({ title: t('confirm.unsavedTitle'), message: t('confirm.unsaved'), okText: t('confirm.leave'), danger: true }))) return;
    setDirty(false);
    setLang(code);
  });
}

langBtn.addEventListener('click', openLangMenu);
backBtn.innerHTML = String(icon('back'));
backBtn.addEventListener('click', () => back(backBtn.dataset.fallback || '/'));

onLangChange(() => {
  updateLangBtn();
  render();
});

if (DEMO) {
  const b = document.getElementById('demoBanner');
  b.hidden = false;
}

setAuthLostHandler((code) => {
  store.clear();
  setDirty(false);
  if (!currentRoute() || !currentRoute().route || !currentRoute().route.public) {
    toast(t(code === 'SESSION_EXPIRED' ? 'err.SESSION_EXPIRED' : 'err.AUTH_REQUIRED'), 'error');
    go('/login', { replace: true });
  }
});

/* ---------------- Page rendering ---------------- */
let renderSeq = 0;

onRoute(async ({ route: r, params, query }) => {
  const seq = ++renderSeq;
  updateLangBtn();
  if (DEMO) document.getElementById('demoBanner').textContent = t('demo.banner');
  if (!r) { go('/', { replace: true }); return; }
  if (!r.public && !getToken()) { go('/login', { replace: true }); return; }
  if (r.public && getToken() && (r.pattern === '/login' || r.pattern === '/register')) { go('/', { replace: true }); return; }

  document.body.classList.toggle('no-nav', !!r.public);
  if (!r.public) renderTabbar(r.tab);
  setTitle(r.public ? t('app.name') : (store.data ? store.data.school.name : t('app.name')));
  backBtn.hidden = true;
  view.innerHTML = String(loaderHtml());
  window.scrollTo(0, 0);

  const ctx = {
    root: view,
    params,
    query,
    isCurrent: () => seq === renderSeq,
    setTitle,
    showBack: (fallback) => { backBtn.hidden = false; backBtn.dataset.fallback = fallback || '/'; backBtn.setAttribute('aria-label', t('common.back')); }
  };
  try {
    if (!r.public) await store.ensure();
    if (seq !== renderSeq) return;
    if (!r.public && !ctx._titleSet) setTitle(store.data.school.name);
    await r.page(ctx);
  } catch (err) {
    if (seq !== renderSeq) return;
    if (err && (err.code === 'SESSION_EXPIRED' || err.code === 'AUTH_REQUIRED')) return;
    console.error(err);
    view.innerHTML = String(errorStateHtml(err));
    view.querySelector('[data-retry]').addEventListener('click', () => render());
  }
});

function setTitle(text) {
  titleEl.textContent = text;
  document.title = text === t('app.name') ? text : `${text} · ${t('app.name')}`;
}

// Re-render list pages when fresh data arrives in the background (never while editing).
let lastLoadSig = '';
store.onChange((d) => {
  const sig = JSON.stringify([d.students.length, d.exams.length, d.events.length, d.prefects.length, d.eventMarks.length, d.school.name]);
  const changed = sig !== lastLoadSig && lastLoadSig !== '';
  lastLoadSig = sig;
  const r = currentRoute();
  if (changed && r && r.route && !r.route.public && !isDirty() && r.route.refreshable !== false && ['home', 'students'].includes(r.route.tab) && !/new|edit/.test(r.path)) render();
});

/* ---------------- Start ---------------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.addEventListener('offline', () => toast(t('err.OFFLINE'), 'error'));
window.addEventListener('online', () => toast(t('common.backOnline'), 'success'));

updateLangBtn();
render();

export { esc };
