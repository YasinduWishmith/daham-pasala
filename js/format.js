import { locale, t } from './i18n.js';

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => iso(new Date());
export const parseIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };

// Some phones/browsers have no Sinhala (or Tamil) date data; then we format with our own month/day names.
const supportCache = {};
function intlSupported() {
  const loc = locale();
  if (!(loc in supportCache)) {
    try { supportCache[loc] = Intl.DateTimeFormat.supportedLocalesOf([loc]).length > 0; } catch (e) { supportCache[loc] = false; }
  }
  return supportCache[loc];
}

export const monthName = (m) => t('month.' + Number(m));

export function fmtDate(s, opts = {}) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '';
  const o = { year: 'numeric', month: 'short', day: 'numeric', ...opts };
  if (intlSupported()) {
    try { return new Intl.DateTimeFormat(locale(), o).format(parseIso(s)); } catch (e) { /* fall through */ }
  }
  const [y, m, d] = s.split('-');
  const date = t('fmt.date', { y, m: monthName(m), d: Number(d) });
  return o.weekday ? `${t('day.' + DAYS[parseIso(s).getDay()])}, ${date}` : date;
}

export function fmtMonth(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  if (intlSupported()) {
    try { return new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'long' }).format(parseIso(ym + '-01')); } catch (e) { /* fall through */ }
  }
  return t('fmt.month', { y: ym.slice(0, 4), m: monthName(ym.slice(5, 7)) });
}

export function fmtDayShort(s) {
  return parseIso(s).getDate();
}

export const dayCode = (s) => DAYS[parseIso(s).getDay()];

export function age(birthday, at = new Date()) {
  if (!birthday) return null;
  const b = parseIso(birthday);
  let a = at.getFullYear() - b.getFullYear();
  if (at.getMonth() < b.getMonth() || (at.getMonth() === b.getMonth() && at.getDate() < b.getDate())) a--;
  return a;
}

export function pct(p, a) {
  const total = (p || 0) + (a || 0);
  return total ? Math.round((p / total) * 100) : null;
}

/** The latest date <= today that is one of the working days. */
export function lastWorkingDay(workingDays) {
  const d = new Date();
  if (!workingDays || !workingDays.length) return iso(d);
  for (let i = 0; i < 7; i++) {
    if (workingDays.includes(DAYS[d.getDay()])) return iso(d);
    d.setDate(d.getDate() - 1);
  }
  return todayIso();
}

/** The next date >= today that is a working day. */
export function nextWorkingDay(workingDays) {
  const d = new Date();
  if (!workingDays || !workingDays.length) return null;
  for (let i = 0; i < 7; i++) {
    if (workingDays.includes(DAYS[d.getDay()])) return iso(d);
    d.setDate(d.getDate() + 1);
  }
  return null;
}

export function num(n, digits = 0) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '–';
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(n);
}

export function relDay(s) {
  const today = todayIso();
  if (s === today) return t('common.today');
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (s === iso(y)) return t('common.yesterday');
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  if (s === iso(tm)) return t('common.tomorrow');
  return fmtDate(s, { weekday: 'short' });
}
