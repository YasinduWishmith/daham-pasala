/**
 * A small in-memory mock of the Google Apps Script services used by backend/Code.js.
 * Used for demo mode in the browser (data kept in localStorage) and for the Node tests.
 */

const STORE_KEY = 'dsm-demo-v1';

function sha256Bytes(str) {
  const bytes = new TextEncoder().encode(str);
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const len = bytes.length;
  const padLen = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[len] = 0x80;
  const bitLen = len * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(padLen - 4, bitLen >>> 0);
  dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = [];
  H.forEach((v) => { for (let s = 24; s >= 0; s -= 8) { const b = (v >>> s) & 255; out.push(b > 127 ? b - 256 : b); } });
  return out;
}

function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function installGasMock({ storage } = {}) {
  let db = { props: {}, files: {} };
  if (storage) {
    try { db = JSON.parse(storage.getItem(STORE_KEY)) || db; } catch (e) { /* start empty */ }
  }

  class MockRange {
    constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.sheet.data[this.r - 1 + i] || [];
        const o = [];
        for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined ? '' : v); }
        out.push(o);
      }
      return out;
    }
    setValues(values) {
      if (values.length !== this.nr || values.some((r) => r.length !== this.nc)) throw new Error('Range size mismatch');
      values.forEach((row, i) => {
        const ri = this.r - 1 + i;
        while (this.sheet.data.length <= ri) this.sheet.data.push([]);
        row.forEach((v, j) => { this.sheet.data[ri][this.c - 1 + j] = v; });
      });
      return this;
    }
    setNumberFormat() { return this; }
    setFontWeight() { return this; }
    setBackground() { return this; }
  }

  class MockSheet {
    constructor(file, obj) { this.file = file; this.obj = obj; }
    get data() { return this.obj.data; }
    getName() { return this.obj.name; }
    setName(n) { this.obj.name = n; return this; }
    getLastRow() {
      let last = 0;
      this.data.forEach((r, i) => { if (r && r.some((v) => v !== '' && v !== undefined && v !== null)) last = i + 1; });
      return last;
    }
    getLastColumn() {
      let last = 0;
      this.data.forEach((r) => (r || []).forEach((v, j) => { if (v !== '' && v !== undefined && v !== null) last = Math.max(last, j + 1); }));
      return last;
    }
    getMaxRows() { return Math.max(1000, this.data.length); }
    getMaxColumns() { return Math.max(26, ...this.data.map((r) => (r ? r.length : 0))); }
    insertRowsAfter() { return this; }
    insertColumnsAfter() { return this; }
    getDataRange() { return new MockRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    getRange(r, c, nr = 1, nc = 1) { return new MockRange(this, r, c, nr, nc); }
    clearContents() { this.obj.data = []; return this; }
    setFrozenRows() { return this; }
  }

  class MockSpreadsheet {
    constructor(id) { this.id = id; }
    get f() { return db.files[this.id]; }
    getId() { return this.id; }
    getName() { return this.f.name; }
    rename(n) { this.f.name = n; }
    getUrl() { return 'demo://spreadsheet/' + this.id; }
    getSheets() { return this.f.sheets.map((s) => new MockSheet(this, s)); }
    getSheetByName(n) { const s = this.f.sheets.find((x) => x.name === n); return s ? new MockSheet(this, s) : null; }
    insertSheet(n) {
      if (this.getSheetByName(n)) throw new Error('Sheet exists: ' + n);
      const s = { name: n, data: [] };
      this.f.sheets.push(s);
      return new MockSheet(this, s);
    }
    addViewer() { return this; }
    addEditor() { return this; }
  }

  const cache = new Map();

  const g = globalThis;
  g.SpreadsheetApp = {
    create(name) {
      const id = 'demo_' + uuid().replace(/-/g, '').slice(0, 16);
      db.files[id] = { name, sheets: [{ name: 'Sheet1', data: [] }] };
      return new MockSpreadsheet(id);
    },
    openById(id) {
      if (!db.files[id]) throw new Error('Not found: ' + id);
      return new MockSpreadsheet(id);
    },
    flush() {}
  };
  g.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (k in db.props ? db.props[k] : null),
      setProperty: (k, v) => { db.props[k] = String(v); }
    })
  };
  g.CacheService = {
    getScriptCache: () => ({
      get(k) {
        const e = cache.get(k);
        if (!e) return null;
        if (e.exp < Date.now()) { cache.delete(k); return null; }
        return e.v;
      },
      put(k, v, sec = 600) { cache.set(k, { v: String(v), exp: Date.now() + sec * 1000 }); },
      remove(k) { cache.delete(k); }
    })
  };
  g.LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) };
  g.Utilities = {
    getUuid: uuid,
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (alg, s) => sha256Bytes(String(s)),
    base64Encode: (bytes) => {
      let bin = '';
      bytes.forEach((b) => { bin += String.fromCharCode((b + 256) % 256); });
      return btoa(bin);
    }
  };
  g.Logger = { log: (...a) => console.log(...a) };

  return {
    persist() {
      if (storage) {
        try { storage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { console.warn('Demo storage full', e); }
      }
    },
    reset() { db = { props: {}, files: {} }; cache.clear(); if (storage) storage.removeItem(STORE_KEY); },
    /** Returns the sheets of a mock spreadsheet as {name, rows[][]} for exporting. */
    sheetsOf(id) { return (db.files[id] ? db.files[id].sheets : []).map((s) => ({ name: s.name, rows: s.data })); },
    db: () => db
  };
}
