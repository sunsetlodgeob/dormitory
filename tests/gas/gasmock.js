/*
 * Apps Script のまね（node で gas/Code.gs を動かして確かめるため）
 *   const env = loadGas({ props: { CLIENT_ID: '…' }, viewers: ['a@example.com'], fetch: (url, params) => ({ code: 200, body: {...} }) });
 *   env.ctx.setup(); env.ss.getSheetByName('名簿') …
 * 本物と同じに動かすのは、Code.gs が使うところだけ。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// GAS_CODE で別のファイルを読ませられる（テストがちゃんと失敗するかの確認用）
const CODE_PATH = process.env.GAS_CODE || path.resolve(__dirname, '..', '..', 'gas', 'Code.gs');

// スプレッドシートに文字を入れたときの「化け方」（本物の一部だけ）
function coerce(s) {
  const t = s.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
  const m = t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/) || t.match(/^()(\d{1,2})\/(\d{1,2})$/);
  if (m) return new Date(Number(m[1] || 2026), Number(m[2]) - 1, Number(m[3]));
  return s;
}

function loadGas(opts = {}) {
  const logs = [];
  const calls = { fetch: [], lock: 0, sleep: 0 };
  let sheetSeq = 100;
  let formSeq = 1;
  let trigSeq = 1;

  // ---- スプレッドシート ----
  class Range {
    constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = [];
        for (let j = 0; j < this.nc; j++) row.push(this.sheet.cell(this.r + i, this.c + j));
        out.push(row);
      }
      return out;
    }
    // 見えているとおりの文字（化ける前に入れた文字があれば、それ）
    getDisplayValues() {
      return this.getValues().map((row, i) => row.map((v, j) => this.sheet.shown(this.r + i, this.c + j, v)));
    }
    getValue() { return this.sheet.cell(this.r, this.c); }
    setValues(v) {
      if (v.length !== this.nr || v.some((row) => row.length !== this.nc)) throw new Error('setValues: 大きさが合いません');
      v.forEach((row, i) => row.forEach((x, j) => this.sheet.write(this.r + i, this.c + j, x)));
      return this;
    }
    setValue(x) { this.sheet.write(this.r, this.c, x); return this; }
    // 字の色・太さ（sheet.rich に 'r,c' → [{ text, color, bold }] で入れておく。なければ 1 つの黒い字）
    getRichTextValue() {
      const runs = this.sheet.rich.get(this.r + ',' + this.c) || [{ text: String(this.sheet.cell(this.r, this.c) == null ? '' : this.sheet.cell(this.r, this.c)), color: '#000000', bold: false }];
      return {
        getText: () => runs.map((x) => x.text).join(''),
        getRuns: () => runs.map((x) => ({ getText: () => x.text, getTextStyle: () => ({ getForegroundColor: () => x.color || '#000000', isBold: () => !!x.bold }) })),
      };
    }
    each(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j); }
    setDataValidation(rule) { this.each((r, c) => this.sheet.validation.set(r + ',' + c, rule)); return this; }
    insertCheckboxes() {
      this.each((r, c) => { this.sheet.validation.set(r + ',' + c, { kind: 'checkbox' }); this.sheet.write(r, c, false); });
      return this;
    }
    setNumberFormat(f) { this.each((r, c) => this.sheet.formats.set(r + ',' + c, f)); return this; }
    setFontWeight() { return this; }
    getRow() { return this.r; }
    getColumn() { return this.c; }
    getNumRows() { return this.nr; }
    getSheet() { return this.sheet; }
  }

  class Sheet {
    constructor(ss, name) {
      this.ss = ss; this.name = name; this.id = sheetSeq++;
      this.rows = []; this.maxRows = 1000; this.maxCols = 26;
      this.formulas = new Set(); this.validation = new Map(); this.formats = new Map(); this.display = new Map();
      this.formUrl = null; this.frozen = 0; this.reads = 0; this.rich = new Map();
    }
    // 本物のように：' で始まる文字は ' をとって文字として、= で始まる文字は式として入る。
    // 書式が「書式なしテキスト（@）」でなければ、数・TRUE/FALSE・日付に見える文字は、その形に化ける
    write(r, c, v) {
      if (r > this.maxRows) this.maxRows = r;
      if (c > this.maxCols) this.maxCols = c;
      while (this.rows.length < r) this.rows.push([]);
      const k = r + ',' + c;
      const typed = v;
      if (typeof v === 'string' && v.startsWith("'")) { v = v.slice(1); this.formulas.delete(k); }
      else if (typeof v === 'string' && v.startsWith('=')) this.formulas.add(k);
      else {
        this.formulas.delete(k);
        if (typeof v === 'string' && this.formats.get(k) !== '@') v = coerce(v);
      }
      this.display.delete(k);
      if (typeof v !== 'string' && typeof typed === 'string') this.display.set(k, typed.trim());
      this.rows[r - 1][c - 1] = v;
    }
    shown(r, c, v) {
      const k = r + ',' + c;
      if (this.display.has(k)) return this.display.get(k);
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      if (v instanceof Date || Object.prototype.toString.call(v) === '[object Date]') return v.getFullYear() + '/' + (v.getMonth() + 1) + '/' + v.getDate();
      return String(v);
    }
    cell(r, c) {
      const row = this.rows[r - 1];
      const v = row ? row[c - 1] : undefined;
      return v === undefined || v === null ? '' : v;
    }
    isFormula(r, c) { return this.formulas.has(r + ',' + c); }
    getLastRow() {
      for (let r = this.rows.length; r >= 1; r--) if ((this.rows[r - 1] || []).some((v) => v !== '' && v != null)) return r;
      return 0;
    }
    getLastColumn() {
      let m = 0;
      this.rows.forEach((row) => row.forEach((v, j) => { if (v !== '' && v != null) m = Math.max(m, j + 1); }));
      return m;
    }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(after, n) { this.maxRows += n; return this; }
    getMaxColumns() { return this.maxCols; }
    getRange(r, c, nr = 1, nc = 1) {
      if (r < 1 || c < 1 || nr < 1 || nc < 1 || r + nr - 1 > this.maxRows) throw new Error('getRange: シートの外です ' + [r, c, nr, nc]);
      return new Range(this, r, c, nr, nc);
    }
    getDataRange() { this.reads++; return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    appendRow(arr) { const r = this.getLastRow() + 1; arr.forEach((v, j) => this.write(r, j + 1, v)); return this; }
    setFrozenRows(n) { this.frozen = n; return this; }
    setColumnWidth() { return this; }
    getName() { return this.name; }
    setName(n) {
      if (this.ss.sheets.some((s) => s !== this && s.name === n)) throw new Error('同じ名前のシートがあります');
      this.name = n; return this;
    }
    getSheetId() { return this.id; }
    getFormUrl() { return this.formUrl; }
    getParent() { return this.ss; }
    // テスト用：値の表（見出しをのぞく）
    table() { return this.rows.slice(1).map((row) => row.slice()); }
    header() { return (this.rows[0] || []).slice(); }
  }

  const user = (email) => ({ getEmail: () => email });
  const access = { owner: opts.owner || 'ob-kai@example.com', editors: opts.editors || [], viewers: opts.viewers || [] };

  class Spreadsheet {
    constructor() { this.id = 'ss-1'; this.sheets = [new Sheet(this, 'シート1')]; }
    getId() { return this.id; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; }
    getSheets() { return this.sheets.slice(); }
    getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
    insertSheet(n) {
      if (this.getSheetByName(n)) throw new Error('同じ名前のシートがあります: ' + n);
      const s = new Sheet(this, n); this.sheets.push(s); return s;
    }
    deleteSheet(s) {
      if (this.sheets.length === 1) throw new Error('最後のシートは消せません');
      this.sheets = this.sheets.filter((x) => x !== s);
    }
    getOwner() { return access.owner ? user(access.owner) : null; }
    getEditors() { return [access.owner, ...access.editors].filter(Boolean).map(user); }
    getViewers() { return access.viewers.map(user); }
  }
  const ss = new Spreadsheet();

  const SpreadsheetApp = {
    getActive: () => (opts.noActive ? null : ss),
    getActiveSpreadsheet: () => (opts.noActive ? null : ss),
    openById: (id) => { if (id !== ss.id) throw new Error('見つかりません'); return ss; },
    flush: () => {},
    newDataValidation: () => {
      const b = { kind: '', requireCheckbox() { b.kind = 'checkbox'; return b; }, setAllowInvalid() { return b; }, build() { return { kind: b.kind }; } };
      return b;
    },
  };

  // ---- フォーム ----
  const forms = new Map();
  class Item {
    constructor(type, form) { this.type = type; this.form = form; this.title = ''; this.help = ''; this.required = false; this.choices = null; }
    setTitle(t) { this.title = t; return this; }
    setHelpText(t) { this.help = t; return this; }
    setRequired(b) { this.required = b; return this; }
    setChoiceValues(v) { this.choices = v.slice(); return this; }
    getTitle() { return this.title; }
  }
  class Form {
    constructor(title) {
      this.id = 'form-' + formSeq++; this.title = title; this.items = []; this.dest = null; this.destSheet = null;
      this.published = false; this.accepting = false; this.collectEmail = true;
    }
    getId() { return this.id; }
    getTitle() { return this.title; }
    setDescription(d) { this.description = d; return this; }
    setConfirmationMessage(m) { this.confirmation = m; return this; }
    setCollectEmail(b) { this.collectEmail = b; return this; }
    setAllowResponseEdits(b) { this.allowEdits = b; return this; }
    setAcceptingResponses(b) { this.accepting = b; return this; }
    setPublished(b) { this.published = b; return this; }
    isPublished() { return this.published; }
    addTextItem() { const it = new Item('TEXT', this); this.items.push(it); return it; }
    addParagraphTextItem() { const it = new Item('PARAGRAPH_TEXT', this); this.items.push(it); return it; }
    addMultipleChoiceItem() { const it = new Item('MULTIPLE_CHOICE', this); this.items.push(it); return it; }
    getItems() { return this.items.slice(); }
    setDestination(type, id) {
      if (type !== 'SPREADSHEET') throw new Error('行き先の種類が違います');
      if (id !== ss.id) throw new Error('スプレッドシートが見つかりません');
      let n = 1;
      while (ss.getSheetByName('フォームの回答 ' + n)) n++;
      const sh = ss.insertSheet('フォームの回答 ' + n);
      sh.formUrl = this.getPublishedUrl();
      ['タイムスタンプ', ...this.items.map((i) => i.title)].forEach((h, j) => sh.write(1, j + 1, h));
      this.dest = id; this.destSheet = sh;
      return this;
    }
    removeDestination() {
      if (this.destSheet) this.destSheet.formUrl = null; // 本物も、シートは残って、つながりだけ切れる
      this.dest = null; this.destSheet = null;
      return this;
    }
    getDestinationId() { if (!this.dest) throw new Error('行き先がありません'); return this.dest; }
    getPublishedUrl() { return 'https://docs.google.com/forms/d/e/pub-' + this.id + '/viewform'; }
    getEditUrl() { return 'https://docs.google.com/forms/d/' + this.id + '/edit'; }
  }
  const FormApp = {
    DestinationType: { SPREADSHEET: 'SPREADSHEET' },
    create: (title) => { const f = new Form(title); forms.set(f.id, f); return f; },
    openById: (id) => { if (!forms.has(id)) throw new Error('フォームが見つかりません'); return forms.get(id); },
    openByUrl: (u) => {
      const m = String(u).match(/\/forms\/d\/(?:e\/pub-)?([\w-]+)\//);
      if (!m || !forms.has(m[1])) throw new Error('フォームが見つかりません');
      return forms.get(m[1]);
    },
  };

  // ---- そのほかのサービス ----
  const store = Object.assign({}, opts.props || {});
  const scriptProps = {
    getProperty: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setProperty: (k, v) => { store[k] = String(v); return scriptProps; },
    setProperties: (o) => { Object.keys(o).forEach((k) => { store[k] = String(o[k]); }); return scriptProps; },
    getProperties: () => Object.assign({}, store),
    deleteProperty: (k) => { delete store[k]; return scriptProps; },
  };
  const PropertiesService = { getScriptProperties: () => scriptProps };

  // 本物と同じく、1 つの値は 100KB まで
  const cacheStore = new Map();
  const cache = {
    get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
    put: (k, v, t) => { cache.putAll({ [k]: v }, t); },
    getAll: (keys) => { const o = {}; keys.forEach((k) => { if (cacheStore.has(k)) o[k] = cacheStore.get(k); }); return o; },
    putAll: (o) => {
      Object.keys(o).forEach((k) => { if (Buffer.byteLength(String(o[k]), 'utf8') > 100 * 1024) throw new Error('値が大きすぎます'); });
      // 本物は UTF-8 でしまうので、半分に切れた絵文字（サロゲートの片方）は「�」に化ける
      Object.keys(o).forEach((k) => cacheStore.set(k, Buffer.from(String(o[k]), 'utf8').toString('utf8')));
    },
    remove: (k) => { cacheStore.delete(k); },
    removeAll: (keys) => keys.forEach((k) => cacheStore.delete(k)),
  };
  const CacheService = { getScriptCache: () => cache };

  const ContentService = {
    MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
    createTextOutput: (text) => {
      const o = { text: String(text), mime: 'TEXT' };
      o.setMimeType = (m) => { o.mime = m; return o; };
      o.getContent = () => o.text;
      o.getMimeType = () => o.mime;
      return o;
    },
  };

  const LockService = {
    getScriptLock: () => ({
      tryLock: () => { calls.lock++; return true; },
      waitLock: () => { calls.lock++; },
      releaseLock: () => {},
      hasLock: () => true,
    }),
  };

  const triggers = [];
  const ScriptApp = {
    EventType: { ON_FORM_SUBMIT: 'ON_FORM_SUBMIT', ON_EDIT: 'ON_EDIT' },
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: (fn) => ({
      forSpreadsheet: (s) => ({
        onFormSubmit: () => ({
          create: () => {
            const t = { id: 'trig-' + trigSeq++, fn, source: s, type: 'ON_FORM_SUBMIT' };
            t.getHandlerFunction = () => t.fn;
            t.getEventType = () => t.type;
            t.getUniqueId = () => t.id;
            triggers.push(t);
            return t;
          },
        }),
      }),
    }),
  };

  const UrlFetchApp = {
    fetch: (url, params) => {
      calls.fetch.push({ url, params: params || {} });
      if (!opts.fetch) throw new Error('fetch は用意されていません: ' + url);
      const r = opts.fetch(url, params || {});
      const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
      return { getResponseCode: () => r.code, getContentText: () => body };
    },
  };

  const Session = {
    // runAs：setup を実行した人（ふつうはオーナー）
    getEffectiveUser: () => user(opts.runAs || access.owner),
    getActiveUser: () => user(''),
    getScriptTimeZone: () => 'Asia/Tokyo',
  };

  const pad = (n) => String(n).padStart(2, '0');
  const Utilities = {
    sleep: () => { calls.sleep++; },
    formatDate: (d, tz, fmt) => {
      if (tz !== 'Asia/Tokyo' || fmt !== "yyyy-MM-dd'T'HH:mm:ssXXX") throw new Error('formatDate: 想定外の書式 ' + fmt);
      const j = new Date(d.getTime() + 9 * 3600 * 1000);
      return j.getUTCFullYear() + '-' + pad(j.getUTCMonth() + 1) + '-' + pad(j.getUTCDate()) + 'T' +
        pad(j.getUTCHours()) + ':' + pad(j.getUTCMinutes()) + ':' + pad(j.getUTCSeconds()) + '+09:00';
    },
  };

  const Logger = { log: (...a) => { logs.push(a.map(String).join(' ')); } };
  const quiet = { log: Logger.log, info: Logger.log, warn: Logger.log, error: Logger.log };

  const ctx = vm.createContext({
    SpreadsheetApp, FormApp, UrlFetchApp, PropertiesService, CacheService, ContentService,
    LockService, ScriptApp, Session, Utilities, Logger, console: quiet,
  });
  vm.runInContext(fs.readFileSync(CODE_PATH, 'utf8'), ctx, { filename: 'Code.gs' });

  return {
    ctx, ss, forms, triggers, store, cacheStore, logs, calls, access,
    // Code.gs の中の値（const）を読む
    get: (expr) => vm.runInContext(expr, ctx),
    setFetch: (fn) => { opts.fetch = fn; },
  };
}

module.exports = { loadGas, CODE_PATH };
