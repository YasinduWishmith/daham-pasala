// Holds the school's data loaded from the backend, with a local cache for instant start-up.
import { api, getToken, DEMO } from './api.js';

const CACHE_KEY = DEMO ? 'dsm-cache-demo' : 'dsm-cache';
const listeners = new Set();
let data = null;
let pending = null;
let refreshTimer = null;

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (c && c.token === getToken()) return c.data;
  } catch (e) { /* ignore */ }
  return null;
}

function writeCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ token: getToken(), data })); } catch (e) { /* quota: ignore */ }
}

export const store = {
  get data() { return data; },
  get settings() { return data ? data.settings : null; },

  /** Returns data immediately when cached; otherwise waits for the server. */
  async ensure() {
    if (data) return data;
    const cached = readCache();
    if (cached) {
      data = cached;
      this.refresh();
      return data;
    }
    return this.load();
  },

  load() {
    if (pending) return pending;
    pending = api('load').then((d) => {
      data = d;
      writeCache();
      listeners.forEach((fn) => fn(d));
      return d;
    }).finally(() => { pending = null; });
    return pending;
  },

  /** Background refresh; errors are ignored (the next action will report them). */
  refresh(delay = 0) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { this.load().catch(() => {}); }, delay);
  },

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  clear() {
    data = null;
    try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
  },

  /** Local patch helpers used right after a successful save. */
  upsert(list, key, obj) {
    if (!data) return;
    const arr = data[list];
    const i = arr.findIndex((x) => x[key] === obj[key]);
    if (i >= 0) arr[i] = obj; else arr.push(obj);
    writeCache();
  },
  remove(list, key, value) {
    if (!data) return;
    data[list] = data[list].filter((x) => x[key] !== value);
    writeCache();
  },
  set(key, value) {
    if (!data) return;
    data[key] = value;
    writeCache();
  },

  /* Lookups */
  student(regNo) { return data && data.students.find((s) => s.regNo === regNo); },
  currentPrefect(regNo) { return data && data.prefects.find((p) => p.regNo === regNo && !p.endDate); },
  attendanceOf(regNo) { return (data && data.attendance.byStudent[regNo]) || { p: 0, a: 0 }; }
};
