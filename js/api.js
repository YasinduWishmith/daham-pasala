import { SCRIPT_URL, REQUEST_TIMEOUT } from './config.js';

export const DEMO = !SCRIPT_URL || new URLSearchParams(location.search).has('demo');

export class ApiError extends Error {
  constructor(code, fields, detail) {
    super(code);
    this.code = code;
    this.fields = fields || null;
    this.detail = detail || null;
  }
}

const TOKEN_KEY = DEMO ? 'dsm-token-demo' : 'dsm-token';
let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { /* storage blocked */ }

export const getToken = () => token;
export function setToken(v) {
  token = v || null;
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
}

let onAuthLost = () => {};
export function setAuthLostHandler(fn) { onAuthLost = fn; }

const READS = new Set(['load', 'ping', 'studentHistory', 'getAttendance', 'attendanceReport', 'getExamMarks', 'getEventMarks']);

async function remote(payload) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      // text/plain keeps this a "simple" request: Apps Script cannot answer CORS preflights.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: ctl.signal
    });
    if (!res.ok) throw new ApiError('SERVER_ERROR', null, 'HTTP ' + res.status);
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { throw new ApiError('SERVER_ERROR', null, 'Bad JSON'); }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e.name === 'AbortError') throw new ApiError('TIMEOUT');
    throw new ApiError(navigator.onLine === false ? 'OFFLINE' : 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
}

let demo = null;
async function demoCall(payload) {
  if (!demo) demo = await import('./demo/demo-backend.js');
  // Simulate a little latency so loading states are visible.
  await new Promise((r) => setTimeout(r, 250));
  return demo.handle(payload);
}

/**
 * Calls a backend action. Resolves with `data`; rejects with ApiError
 * (code VALIDATION carries `fields` = {field: errorCode}).
 */
export async function api(action, data = {}) {
  const payload = { action, data, token };
  let res;
  try {
    res = DEMO ? await demoCall(payload) : await remote(payload);
  } catch (e) {
    // One automatic retry for reads that failed because of the network.
    if (READS.has(action) && e instanceof ApiError && (e.code === 'NETWORK' || e.code === 'TIMEOUT')) {
      res = DEMO ? await demoCall(payload) : await remote(payload);
    } else {
      throw e;
    }
  }
  if (!res || typeof res !== 'object') throw new ApiError('SERVER_ERROR');
  if (!res.ok) {
    if (res.code === 'SESSION_EXPIRED' || res.code === 'AUTH_REQUIRED') {
      setToken(null);
      onAuthLost(res.code);
    }
    if (res.detail) console.error('Server error:', res.detail);
    throw new ApiError(res.code || 'SERVER_ERROR', res.extra && res.extra.fields, res.detail);
  }
  return res.data;
}

export const isDemo = () => DEMO;
export const demoModule = async () => { if (!demo) demo = await import('./demo/demo-backend.js'); return demo; };
