import { isDirty, setDirty, confirmDialog } from './ui.js';
import { t } from './i18n.js';

const routes = [];
let current = null;
let lastHash = location.hash;
let guardBusy = false;
let handler = () => {};

/** route('/students/:regNo', pageFn, {auth: true, tab: 'students'}) */
export function route(pattern, page, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (m, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  routes.push({ pattern, re, keys, page, ...opts });
}

export function parse(hash = location.hash) {
  const h = (hash || '').replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  for (const r of routes) {
    const m = r.re.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params, query: new URLSearchParams(qs || ''), path };
    }
  }
  return { route: null, params: {}, query: new URLSearchParams(qs || ''), path };
}

export function onRoute(fn) { handler = fn; }

export function go(path, { replace = false } = {}) {
  const h = '#' + path;
  if (location.hash === h) { render(); return; }
  if (replace) { history.replaceState(null, '', h); render(); } else location.hash = h;
}

/** Updates the query string of the current route without re-rendering. */
export function setQuery(params) {
  const { path } = parse();
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined && v !== false) q.set(k, v); });
  const s = q.toString();
  const h = '#' + path + (s ? '?' + s : '');
  history.replaceState(null, '', h);
  lastHash = h;
}

let navCount = 0;
export function back(fallback = '/') {
  if (navCount > 1) history.back();
  else go(fallback, { replace: true });
}

export function render() {
  navCount++;
  current = parse();
  lastHash = location.hash;
  handler(current);
}

export const currentRoute = () => current;

window.addEventListener('hashchange', async () => {
  if (guardBusy) return;
  if (isDirty() && location.hash !== lastHash) {
    const target = location.hash;
    guardBusy = true;
    history.replaceState(null, '', lastHash || '#/');
    const ok = await confirmDialog({ title: t('confirm.unsavedTitle'), message: t('confirm.unsaved'), okText: t('confirm.leave'), danger: true });
    guardBusy = false;
    if (!ok) return;
    setDirty(false);
    location.hash = target;
    return;
  }
  setDirty(false);
  render();
});
