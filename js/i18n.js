import en from './i18n/en.js';
import si from './i18n/si.js';
import ta from './i18n/ta.js';

const DICTS = { en, si, ta };
export const LANGS = [
  { code: 'si', label: 'සිංහල', short: 'සිං' },
  { code: 'ta', label: 'தமிழ்', short: 'த' },
  { code: 'en', label: 'English', short: 'EN' }
];
const LOCALES = { en: 'en-GB', si: 'si-LK', ta: 'ta-LK' };
const KEY = 'dsm-lang';

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && DICTS[saved]) return saved;
  } catch (e) { /* storage blocked */ }
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('ta')) return 'ta';
  if (nav.startsWith('en')) return 'en';
  return 'si';
}

let lang = detect();
const listeners = new Set();

export function getLang() { return lang; }
export function locale() { return LOCALES[lang]; }

export function setLang(code) {
  if (!DICTS[code] || code === lang) return;
  lang = code;
  try { localStorage.setItem(KEY, code); } catch (e) { /* ignore */ }
  document.documentElement.lang = code;
  listeners.forEach((fn) => fn(code));
}

export function onLangChange(fn) { listeners.add(fn); }

/** Translate a key. Missing keys fall back to English, then to the key itself. */
export function t(key, vars) {
  let s = DICTS[lang][key];
  if (s === undefined) s = en[key];
  if (s === undefined) {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') console.warn('Missing i18n key', key);
    return key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : m));
  return s;
}

/** Translate a data code (e.g. 'Mother' with prefix 'rel') falling back to the raw value. */
export function tc(prefix, code) {
  if (!code) return '';
  const k = prefix + '.' + code;
  const s = DICTS[lang][k] ?? en[k];
  return s === undefined ? code : s;
}

/** Translate an error code, which may carry an argument after ':' (e.g. GRADE_HAS_STUDENTS:Grade 2). */
export function terr(code) {
  if (!code) return '';
  const i = code.indexOf(':');
  const base = i >= 0 ? code.slice(0, i) : code;
  const arg = i >= 0 ? code.slice(i + 1) : '';
  const key = 'err.' + base;
  if (DICTS[lang][key] === undefined && en[key] === undefined) return t('err.UNKNOWN');
  return t(key, { arg });
}

document.documentElement.lang = lang;
