import { t, terr } from './i18n.js';

/* ---------------- Safe HTML templating ---------------- */
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function fmt(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}
/** Tagged template: interpolated values are escaped unless wrapped with raw() or produced by html``. */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += fmt(v) + strings[i + 1]; });
  return new Safe(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- Icons (stroke icons, 24px grid) ---------------- */
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.6 3.2-6 6.5-6s6 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14c2.7.2 4.6 2.2 5 5"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  checkSquare: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7.5 12 3 3 6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/><path d="M8 7h8"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  filter: '<path d="M3 5h18l-7 8.5V20l-4-2v-4.5z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h11"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.1M6.6 6.6A17.6 17.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  lotus: '<path d="M12 20c-4.5 0-8-2-9-5 3 .2 5.5 1.2 7 3"/><path d="M12 20c4.5 0 8-2 9-5-3 .2-5.5 1.2-7 3"/><path d="M12 20c-2.5-2.2-3.8-5-3.8-8.2 0-2.7 1.3-5.3 3.8-7.8 2.5 2.5 3.8 5.1 3.8 7.8 0 3.2-1.3 6-3.8 8.2z"/><path d="M8.3 13.5C6.4 12.4 4.7 10.6 4 8.2c2.3.2 4.1 1 5.4 2.2M15.7 13.5c1.9-1.1 3.6-2.9 4.3-5.3-2.3.2-4.1 1-5.4 2.2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
  wifiOff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M2 9.5a15 15 0 0 1 4.3-2.7M14 10.2A10 10 0 0 1 19 13M17.7 6.8A15 15 0 0 1 22 9.5"/><circle cx="12" cy="20" r=".8"/>',
  lock: '<rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  move: '<path d="M5 12h14M15 8l4 4-4 4"/><path d="M5 5v14"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>'
};
export function icon(name, cls = '') {
  return raw(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`);
}

/* ---------------- Toasts ---------------- */
export function toast(msg, type = 'info', { action, onAction, timeout = 3800 } = {}) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = String(html`${icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info')}<div class="grow">${msg}</div>${action ? html`<button type="button">${action}</button>` : ''}`);
  if (action) el.querySelector('button').addEventListener('click', () => { el.remove(); onAction && onAction(); });
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? timeout + 2500 : timeout);
}

/* ---------------- Modal ---------------- */
/**
 * Opens a bottom-sheet modal. `body` is html; `onMount(el, close)` wires events.
 * Resolves with whatever close(value) is called with (undefined when dismissed).
 */
export function modal({ title, body, foot, onMount, wide }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = String(html`
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ${wide ? raw('style="max-width:720px"') : ''}>
        <div class="modal-head"><h2 id="modal-title">${title}</h2>
          <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('x')}</button></div>
        <div class="modal-body">${body}</div>
        ${foot ? html`<div class="modal-foot">${foot}</div>` : ''}
      </div>`);
    const close = (v) => {
      back.remove();
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    const m = back.querySelector('.modal');
    if (onMount) onMount(m, close);
    const first = m.querySelector('input:not([type=hidden]):not([disabled]), select, textarea') || m.querySelector('.modal-foot .btn.primary, .modal-foot .btn.danger');
    setTimeout(() => first && first.focus({ preventScroll: true }), 50);
  });
}

export function confirmDialog({ title, message, okText, danger }) {
  return modal({
    title: title || t('common.confirm'),
    body: html`<p>${message}</p>`,
    foot: html`<button class="btn outline" type="button" data-close>${t('common.cancel')}</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-ok>${okText || t('common.ok')}</button>`,
    onMount: (m, close) => m.querySelector('[data-ok]').addEventListener('click', () => close(true))
  }).then((v) => v === true);
}

/* ---------------- Loading states ---------------- */
export const loaderHtml = (msg) => html`<div class="loader"><div class="spinner"></div><div>${msg || t('common.loading')}</div></div>`;
export const skeletonHtml = (n = 5) => html`${Array.from({ length: n }, () => html`<div class="skeleton"></div>`)}`;

export function errorStateHtml(err) {
  const code = err && err.code ? err.code : 'UNKNOWN';
  return html`<div class="error-state">${icon(code === 'NETWORK' ? 'wifiOff' : 'alert')}
    <p><b>${terr(code)}</b></p>
    <button class="btn primary" type="button" data-retry>${icon('refresh')}${t('common.retry')}</button></div>`;
}

export async function withBusy(btn, fn) {
  if (!btn) return fn();
  if (btn.classList.contains('loading')) return undefined;
  btn.classList.add('loading');
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  try { return await fn(); } finally {
    btn.classList.remove('loading');
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
  }
}

/* ---------------- Form fields ---------------- */
/**
 * field({name, label, type, value, required, options:[{value,label}], hint, attrs, cls, placeholder})
 */
export function field(o) {
  const id = 'f-' + o.name.replace(/[^\w-]/g, '_');
  const req = o.required ? html`<span class="req" aria-hidden="true">*</span>` : '';
  const common = raw(`id="${id}" name="${esc(o.name)}" aria-describedby="${id}-err${o.hint ? ' ' + id + '-hint' : ''}" ${o.required ? 'aria-required="true"' : ''} ${o.attrs || ''}`);
  let control;
  if (o.type === 'select') {
    control = html`<select class="input" ${common}>
      ${o.placeholder !== undefined ? html`<option value="">${o.placeholder}</option>` : ''}
      ${(o.options || []).map((op) => html`<option value="${op.value}" ${String(op.value) === String(o.value ?? '') ? raw('selected') : ''}>${op.label}</option>`)}
    </select>`;
  } else if (o.type === 'textarea') {
    control = html`<textarea class="input" ${common} placeholder="${o.placeholder || ''}">${o.value ?? ''}</textarea>`;
  } else if (o.type === 'password') {
    control = html`<div class="input-wrap"><input class="input" type="password" ${common} value="${o.value ?? ''}" autocomplete="${o.autocomplete || 'current-password'}">
      <button class="icon-btn" type="button" data-toggle-pw aria-label="${t('common.showPassword')}">${icon('eye')}</button></div>`;
  } else {
    control = html`<input class="input" type="${o.type || 'text'}" ${common} value="${o.value ?? ''}" placeholder="${o.placeholder || ''}">`;
  }
  return html`<div class="field ${o.cls || ''}" data-field="${o.name}">
    <label for="${id}">${o.label}${req}</label>
    ${control}
    ${o.hint ? html`<p class="hint" id="${id}-hint">${o.hint}</p>` : ''}
    <p class="field-err" id="${id}-err" hidden></p>
  </div>`;
}

/** A group of chip checkboxes / radios. */
export function chipGroup({ name, label, options, values = [], type = 'checkbox', required, hint }) {
  return html`<div class="field" data-field="${name}" role="group" aria-labelledby="lbl-${name}">
    <span class="field-label" id="lbl-${name}">${label}${required ? html`<span class="req" aria-hidden="true">*</span>` : ''}</span>
    <div class="chips">${options.map((op) => html`<label class="chip"><input type="${type}" name="${name}" value="${op.value}" data-group="1" ${values.includes(op.value) ? raw('checked') : ''}>${op.label}</label>`)}</div>
    ${hint ? html`<p class="hint">${hint}</p>` : ''}
    <p class="field-err" hidden></p>
  </div>`;
}

export function segmented({ name, label, options, value, required }) {
  return html`<div class="field" data-field="${name}" role="radiogroup" aria-labelledby="lbl-${name}">
    <span class="field-label" id="lbl-${name}">${label}${required ? html`<span class="req" aria-hidden="true">*</span>` : ''}</span>
    <div class="segmented">${options.map((op) => html`<label><input type="radio" name="${name}" value="${op.value}" ${op.value === value ? raw('checked') : ''}><span>${op.label}</span></label>`)}</div>
    <p class="field-err" hidden></p>
  </div>`;
}

/** Reads a form into an object. Checkbox groups become arrays. */
export function formData(form) {
  const out = {};
  const groups = {};
  $$('input[type=checkbox]', form).forEach((c) => { if (c.name) groups[c.name] = (groups[c.name] || 0) + 1; });
  Array.from(form.elements).forEach((el) => {
    if (!el.name || el.disabled && !el.dataset.keep) return;
    if (el.type === 'checkbox') {
      if (groups[el.name] > 1 || el.dataset.group) { out[el.name] = out[el.name] || []; if (el.checked) out[el.name].push(el.value); }
      else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = '';
    } else {
      out[el.name] = el.value;
    }
  });
  return out;
}

export function clearErrors(root) {
  $$('.field-err', root).forEach((e) => { e.hidden = true; e.textContent = ''; });
  $$('[aria-invalid]', root).forEach((e) => e.removeAttribute('aria-invalid'));
  const s = $('.form-summary', root);
  if (s) { s.hidden = true; s.innerHTML = ''; }
}

/**
 * Shows field errors ({field: code}) next to inputs, a summary at the top of the form,
 * and focuses the first invalid input. Returns true when any error was shown.
 */
export function showErrors(root, fields, labels = {}) {
  clearErrors(root);
  const keys = Object.keys(fields || {});
  if (!keys.length) return false;
  const summary = [];
  let first = null;
  keys.forEach((k) => {
    const msg = terr(fields[k]);
    const wrap = root.querySelector(`[data-field="${CSS.escape(k)}"]`);
    if (wrap) {
      const err = wrap.querySelector('.field-err');
      if (err) { err.textContent = msg; err.hidden = false; }
      const input = wrap.querySelector('input:not([type=hidden]), select, textarea');
      if (input) { input.setAttribute('aria-invalid', 'true'); if (!first) first = input; }
      const lbl = labels[k] || (wrap.querySelector('label, .field-label') || {}).textContent || '';
      summary.push({ k, text: (lbl.replace('*', '').trim() ? lbl.replace('*', '').trim() + ': ' : '') + msg });
    } else {
      summary.push({ k, text: msg });
    }
  });
  const s = $('.form-summary', root);
  if (s) {
    s.innerHTML = String(html`${icon('alert')}<div><b>${t('form.fixErrors', { n: keys.length })}</b>
      <ul>${summary.map((x) => html`<li>${x.text}</li>`)}</ul></div>`);
    s.hidden = false;
  }
  if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  else if (s) s.scrollIntoView({ block: 'start', behavior: 'smooth' });
  return true;
}

export const summaryBox = () => html`<div class="alert danger form-summary" role="alert" tabindex="-1" hidden></div>`;

/** Wires common form behaviours: clear a field's error on input, password show/hide, dirty tracking. */
export function wireForm(form, { trackDirty = true } = {}) {
  form.addEventListener('input', (e) => {
    const wrap = e.target.closest('[data-field]');
    if (wrap) {
      const err = wrap.querySelector('.field-err');
      if (err) err.hidden = true;
      e.target.removeAttribute('aria-invalid');
    }
    if (trackDirty) setDirty(true);
  });
  form.addEventListener('change', () => { if (trackDirty) setDirty(true); });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-toggle-pw]');
    if (!b) return;
    const inp = b.parentElement.querySelector('input');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.innerHTML = String(icon(show ? 'eyeOff' : 'eye'));
    b.setAttribute('aria-label', t(show ? 'common.hidePassword' : 'common.showPassword'));
  });
}

/* ---------------- Unsaved changes ---------------- */
let dirty = false;
export const isDirty = () => dirty;
export function setDirty(v) { dirty = !!v; }
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------------- List editor (grades / subjects) ---------------- */
export function listEditorHtml({ name, label, values, placeholder, presetLabel, hint, renamable }) {
  return html`<div class="field list-editor" data-field="${name}" data-list="${name}" data-renamable="${renamable ? '1' : ''}">
    <span class="field-label">${label}<span class="req" aria-hidden="true">*</span></span>
    <div class="items"></div>
    <div class="add">
      <input class="input" type="text" placeholder="${placeholder}" aria-label="${placeholder}" maxlength="40" enterkeyhint="done">
      <button class="btn outline" type="button" data-add>${icon('plus')}${t('common.add')}</button>
    </div>
    ${presetLabel ? html`<button class="btn ghost small" type="button" data-preset>${presetLabel}</button>` : ''}
    ${hint ? html`<p class="hint">${hint}</p>` : ''}
    <p class="field-err" hidden></p>
    <input type="hidden" name="${name}" value="${JSON.stringify(values || [])}">
  </div>`;
}

/** Mounts a list editor. Options: preset() => string[]; onRename(oldName) => Promise<newName|null>. */
export function mountListEditor(wrap, { preset, onRename, isSaved } = {}) {
  const hidden = wrap.querySelector('input[type=hidden]');
  const input = wrap.querySelector('.add input');
  let items = JSON.parse(hidden.value || '[]');
  const render = () => {
    hidden.value = JSON.stringify(items);
    wrap.querySelector('.items').innerHTML = String(html`${items.map((v, i) => html`
      <div class="item"><span class="name">${v}</span>
        ${i > 0 ? html`<button class="icon-btn" type="button" data-up="${i}" aria-label="${t('common.moveUp')}">${icon('arrowUp')}</button>` : ''}
        ${onRename && isSaved && isSaved(v) ? html`<button class="icon-btn" type="button" data-rename="${i}" aria-label="${t('common.rename')}">${icon('edit')}</button>` : ''}
        <button class="icon-btn" type="button" data-del="${i}" aria-label="${t('common.remove')} ${v}">${icon('x')}</button>
      </div>`)}`);
  };
  const showErr = (code) => {
    const e = wrap.querySelector('.field-err');
    e.textContent = code ? terr(code) : '';
    e.hidden = !code;
  };
  const add = () => {
    const v = input.value.replace(/\s+/g, ' ').trim();
    if (!v) return;
    if (/[|\[\]:*?\/\\]/.test(v)) return showErr('INVALID_CHARS');
    if (items.some((x) => x.toLowerCase() === v.toLowerCase())) return showErr('DUPLICATE');
    items.push(v);
    input.value = '';
    showErr('');
    setDirty(true);
    render();
    input.focus();
  };
  wrap.querySelector('[data-add]').addEventListener('click', add);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const pb = wrap.querySelector('[data-preset]');
  if (pb && preset) pb.addEventListener('click', () => {
    preset().forEach((v) => { if (!items.some((x) => x.toLowerCase() === v.toLowerCase())) items.push(v); });
    showErr('');
    setDirty(true);
    render();
  });
  wrap.querySelector('.items').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.del !== undefined) items.splice(Number(b.dataset.del), 1);
    else if (b.dataset.up !== undefined) { const i = Number(b.dataset.up); [items[i - 1], items[i]] = [items[i], items[i - 1]]; }
    else if (b.dataset.rename !== undefined) {
      const i = Number(b.dataset.rename);
      const nv = await onRename(items[i]);
      if (!nv) return;
      items[i] = nv;
    }
    setDirty(true);
    render();
  });
  render();
  return { get: () => items, set: (v) => { items = v.slice(); render(); } };
}

/* ---------------- Misc ---------------- */
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0] || '?')[0]).toUpperCase();
}

export function debounce(fn, ms = 200) {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Download rows as a CSV that Excel opens correctly with Sinhala/Tamil text. */
export function downloadCsv(rows, filename) {
  const csv = rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
  downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), filename);
}
