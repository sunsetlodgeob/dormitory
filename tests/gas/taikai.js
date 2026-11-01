/*
 * gas/taikai/Code.gs（寮生大会の出欠フォーム）の確認。Google には出ない
 *   node tests/gas/taikai.js
 */
process.env.TZ = 'Asia/Tokyo';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const CODE = path.join(ROOT, 'gas', 'taikai', 'Code.gs');

// ---- Apps Script のまね（このしくみが使うところだけ） ----
function env(opts = {}) {
  const RealDate = Date;
  let nowMs = new RealDate(opts.now || '2026-11-05T10:00:00+09:00').getTime();
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(nowMs); else super(...a); }
    static now() { return nowMs; }
  }

  class Sheet {
    constructor(name) { this.name = name; this.rows = []; this.frozen = 0; }
    getLastRow() { let n = 0; this.rows.forEach((r, i) => { if (r && r.some((v) => v !== '' && v != null)) n = i + 1; }); return n; }
    getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0); }
    put(r, c, v) {
      while (this.rows.length < r) this.rows.push([]);
      const row = this.rows[r - 1];
      while (row.length < c) row.push('');
      row[c - 1] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
    }
    get(r, c) { const row = this.rows[r - 1] || []; return row[c - 1] == null ? '' : row[c - 1]; }
    getRange(r, c, nr = 1, nc = 1) {
      const sh = this;
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.get(r + i, c + j))),
        setValues: (v) => { v.forEach((row, i) => row.forEach((x, j) => sh.put(r + i, c + j, x))); },
        setValue: (x) => { sh.put(r, c, x); },
      };
    }
    appendRow(a) { const r = this.getLastRow() + 1; a.forEach((v, j) => this.put(r, j + 1, v)); }
    setFrozenRows(n) { this.frozen = n; }
    getName() { return this.name; }
    // テスト用
    recs() {
      const head = this.rows[0];
      return this.rows.slice(1).filter((r) => r.some((v) => v !== '')).map((r) => Object.fromEntries(head.map((h, j) => [h, r[j] == null ? '' : r[j]])));
    }
  }
  class Spreadsheet {
    constructor(name) { this.name = name; this.id = 'manage-1'; this.sheets = [new Sheet('シート1')]; }
    getId() { return this.id; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; }
    getSheets() { return this.sheets.slice(); }
    getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
    deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
  }
  let book = null;
  const SpreadsheetApp = {
    create: (n) => { book = new Spreadsheet(n); return book; },
    openById: (id) => { if (!book || id !== book.id) throw new Error('見つかりません'); return book; },
  };
  const form = { id: 'form-1' };
  const FormApp = { getActiveForm: () => form, ItemType: { GRID: 'GRID', TEXT: 'TEXT', PARAGRAPH_TEXT: 'PARAGRAPH_TEXT' } };
  const store = {};
  const PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = String(v); } }) };
  const triggers = [];
  const trig = (fn, kind) => ({ create: () => { const t = { fn, kind, getHandlerFunction: () => fn }; triggers.push(t); return t; } });
  const ScriptApp = {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: (fn) => ({
      forForm: (f) => ({ onFormSubmit: () => trig(fn, 'form:' + f.id) }),
      timeBased: () => ({ everyHours: (n) => trig(fn, 'every' + n + 'h') }),
    }),
  };
  // カレンダー：大会の日の 3 つの予定（opts.events で変えられる）
  const events = (opts.events || ['寮生大会（事前準備）', '寮生大会（1次会）', '寮生大会（2次会）']).map((title, i) => ({
    title, id: 'ev' + i, start: new RealDate('2026-11-28T' + ['10:00', '12:30', '16:30'][i % 3] + ':00+09:00'), attendees: [],
  }));
  const asked = [];
  const CalendarApp = {
    getDefaultCalendar: () => ({
      getEvents: (a, b) => { asked.push({ from: a, to: b }); return events.filter((e) => e.start >= a && e.start < b).map((e) => ({ getTitle: () => e.title, getId: () => e.id + '@google.com' })); },
    }),
  };
  const patches = [];
  const Calendar = {
    Events: {
      get: (cal, id) => { const e = events.find((x) => x.id === id); if (!e) throw new Error('not found'); return { attendees: e.attendees.map((a) => Object.assign({}, a)) }; },
      patch: (res, cal, id, o) => {
        if (opts.calendarFails) throw new Error('カレンダーに書けません');
        const e = events.find((x) => x.id === id);
        e.attendees = res.attendees.map((a) => Object.assign({}, a));
        patches.push({ id, cal, res, o });
        return {};
      },
    },
  };
  const mails = [];
  let mailFails = !!opts.mailFails;
  const MailApp = { sendEmail: (m) => { if (mailFails && m.to !== 'ob-kai@example.com') throw new Error('1 日の上限'); mails.push(m); } };
  const Session = { getEffectiveUser: () => ({ getEmail: () => 'ob-kai@example.com' }) };
  const LockService = { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) };
  const logs = [];
  const ctx = vm.createContext({
    Date: FakeDate, SpreadsheetApp, FormApp, PropertiesService, ScriptApp, CalendarApp, Calendar, MailApp, Session, LockService,
    Logger: { log: (...a) => logs.push(a.join(' ')) },
  });
  vm.runInContext(fs.readFileSync(CODE, 'utf8'), ctx, { filename: 'taikai/Code.gs' });
  return {
    ctx, events, patches, mails, triggers, store, logs, asked,
    book: () => book,
    sheet: (n) => book.getSheetByName(n),
    setNow: (iso) => { nowMs = new RealDate(iso).getTime(); },
    setMailFails: (b) => { mailFails = b; },
  };
}

// フォームの回答（e.response のまね）
function answer(o) {
  const items = [
    ['お名前', 'TEXT', o.name == null ? '先輩A' : o.name],
    ['メールアドレス', 'TEXT', o.email == null ? 'senpai.a@example.com' : o.email],
    ['電話番号', 'TEXT', o.phone || '090-0000-0000'],
    ['入学年次', 'TEXT', o.entry || '2003'],
    ['出欠回答', 'GRID', o.grid || ['不参加', '参加', '参加']],
    ['その他何かコメントなどございましたら！！！', 'PARAGRAPH_TEXT', o.comment || ''],
  ];
  const rows = o.rows || ['事前準備', '1次会', '2次会'];
  return {
    response: {
      getItemResponses: () => items.map(([title, type, v]) => ({
        getItem: () => ({ getTitle: () => title, getType: () => type, asGridItem: () => ({ getRows: () => rows }) }),
        getResponse: () => v,
      })),
      getRespondentEmail: () => o.respondent || '',
    },
  };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const ready = (opts) => { const e = env(opts); e.ctx.setup(); return e; };
const toMe = (e, to) => e.mails.filter((m) => m.to === to);

test('setup：管理用のスプレッドシート（参加者・設定・文面・記録）とトリガー 2 つ。カレンダーの予定を確かめる', () => {
  const e = env();
  const text = e.ctx.setup();
  const b = e.book();
  assert.ok(b && e.store.MANAGE_SS_ID === b.getId());
  assert.deepStrictEqual(b.getSheets().map((s) => s.name), ['参加者', '設定', '文面', '記録'], '空の「シート1」は消す');
  assert.deepStrictEqual(e.sheet('参加者').rows[0].slice(0, 7), ['メールアドレス', 'お名前', '電話番号', '入学年次', '事前準備', '1次会', '2次会']);
  const st = Object.fromEntries(e.sheet('設定').recs().map((r) => [r['項目'], r['値']]));
  assert.strictEqual(st['回答の締め切り'], '2026/11/14 23:59', '締め切りは大会の 2 週間前');
  assert.strictEqual(st['前日のお知らせ'], '2026/11/27 12:00');
  assert.strictEqual(st['会費：1次会'], 3000);
  assert.strictEqual(st['会費：2次会'], 7000);
  assert.strictEqual(st['会費の払い方'], '', '支払い先はコードに書かない（幹事が入れる）');
  assert.deepStrictEqual(e.sheet('文面').recs().map((r) => r['種類']), ['参加の確認', '出欠の変更', '不参加のお礼', '前日のお知らせ', '幹事への知らせ']);
  assert.deepStrictEqual(e.triggers.map((t) => [t.fn, t.kind]), [['onFormSubmit', 'form:form-1'], ['tick', 'every1h']]);
  assert.ok(text.includes('事前準備：見つかった') && text.includes('2次会：見つかった'), text);
  // 2 回目：トリガーは増えない。幹事が直した値は消さない
  e.sheet('設定').put(e.sheet('設定').recs().findIndex((r) => r['項目'] === '会費の払い方') + 2, 2, 'PayPay で送金してください');
  e.ctx.setup();
  assert.strictEqual(e.triggers.length, 2);
  assert.strictEqual(e.sheet('設定').recs().find((r) => r['項目'] === '会費の払い方')['値'], 'PayPay で送金してください');
  assert.strictEqual(e.sheet('文面').recs().length, 5);
});

test('回答：1次会・2次会に参加 → 確認のメール（案内・会費合計・払い方）と、その 2 つの招待。幹事に知らせ', () => {
  const e = ready();
  const st = e.sheet('設定');
  st.put(st.recs().findIndex((r) => r['項目'] === '会費の払い方') + 2, 2, 'PayPay（ID は幹事から）で送金してください。');
  const r = e.ctx.onFormSubmit(answer({ grid: ['不参加', '参加', '参加'], comment: 'たのしみ' }));
  assert.strictEqual(r.kind, '参加の確認');
  const mine = toMe(e, 'senpai.a@example.com');
  assert.strictEqual(mine.length, 1);
  assert.ok(mine[0].subject.includes('出欠を受けつけました'));
  for (const s of ['先輩A 様', '・1次会\n・2次会', '◆ 1次会', '本校舎306教室', '◆ 2次会', '合計：10,000円', 'PayPay（ID は幹事から）', '2026年11月14日（土） 23:59']) assert.ok(mine[0].body.includes(s), s);
  assert.ok(!mine[0].body.includes('◆ 事前準備'));
  assert.strictEqual(mine[0].name, '夕照寮OB会');
  // 招待
  assert.deepStrictEqual(e.patches.map((p) => p.id), ['ev1', 'ev2']);
  for (const p of e.patches) {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(p.res.attendees)), [{ email: 'senpai.a@example.com' }]);
    assert.strictEqual(p.res.guestsCanSeeOtherGuests, false, 'ほかのゲストは見えない');
    assert.strictEqual(p.o.sendUpdates, 'all', '招待のメールは Google カレンダーが送る');
    assert.strictEqual(p.cal, 'primary');
  }
  // 一覧
  const row = e.sheet('参加者').recs()[0];
  assert.deepStrictEqual([row['事前準備'], row['1次会'], row['2次会'], row['会費合計'], row['招待（1次会）'], row['招待（2次会）'], row['回答の回数'], row['メール']],
    ['不参加', '参加', '参加', 10000, '招待ずみ', '招待ずみ', 1, '送った：参加の確認']);
  // 幹事
  const k = toMe(e, 'ob-kai@example.com');
  assert.strictEqual(k.length, 1);
  assert.ok(k[0].subject.includes('先輩Aさん（2003）が回答') && k[0].body.includes('たのしみ') && k[0].body.includes('manage-1'), k[0].subject);
  assert.ok(!k[0].subject.includes('締め切り後'));
});

test('出欠の変更：同じメールアドレス（大文字小文字ちがい）でもう一度 → 招待を足す・消す、「変更しました」のメール。1 人 1 行のまま', () => {
  const e = ready();
  e.ctx.onFormSubmit(answer({ grid: ['不参加', '参加', '参加'] }));
  e.patches.length = 0;
  e.mails.length = 0;
  const r = e.ctx.onFormSubmit(answer({ email: 'Senpai.A@Example.com', grid: ['参加', '参加', '不参加'] }));
  assert.strictEqual(r.kind, '出欠の変更');
  assert.deepStrictEqual(e.patches.map((p) => p.id).sort(), ['ev0', 'ev2'], '変わった会だけ');
  assert.strictEqual(e.events[2].attendees.length, 0, '2次会の招待を取り消す');
  assert.strictEqual(e.events[0].attendees.length, 1, '事前準備に招待');
  assert.strictEqual(e.events[1].attendees.length, 1, '1次会はそのまま');
  const mine = toMe(e, 'Senpai.A@Example.com');
  assert.strictEqual(mine.length, 1);
  assert.ok(mine[0].body.includes('変更前：1次会・2次会') && mine[0].body.includes('変更後：事前準備・1次会') && mine[0].body.includes('合計：3,000円'), mine[0].body);
  const rows = e.sheet('参加者').recs();
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual([rows[0]['事前準備'], rows[0]['2次会'], rows[0]['回答の回数'], rows[0]['招待（2次会）']], ['参加', '不参加', 2, '']);
  // まったく同じ回答をもう一度：本人にはメールしない（幹事にだけ）
  e.mails.length = 0;
  e.patches.length = 0;
  e.ctx.onFormSubmit(answer({ grid: ['参加', '参加', '不参加'] }));
  assert.strictEqual(toMe(e, 'senpai.a@example.com').length, 0);
  assert.strictEqual(e.patches.length, 0);
  assert.strictEqual(toMe(e, 'ob-kai@example.com').length, 1);
});

test('すべて不参加：お礼のメールだけ（招待なし）。あとから参加にすると招待', () => {
  const e = ready();
  const r = e.ctx.onFormSubmit(answer({ email: 'kouhai@example.com', grid: ['不参加', '不参加', '不参加'] }));
  assert.strictEqual(r.kind, '不参加のお礼');
  assert.strictEqual(e.patches.length, 0);
  const m = toMe(e, 'kouhai@example.com')[0];
  assert.ok(m.subject.includes('ありがとうございます') && m.body.includes('すべて不参加'));
  assert.ok(!m.body.includes('会費'));
  e.ctx.onFormSubmit(answer({ email: 'kouhai@example.com', grid: ['不参加', '参加', '不参加'] }));
  assert.deepStrictEqual(e.patches.map((p) => p.id), ['ev1']);
  assert.ok(toMe(e, 'kouhai@example.com')[1].body.includes('変更前：すべて不参加'));
});

test('締め切り後の回答も受ける（幹事への知らせに【締め切り後】）。表の行の答えがなければ不参加', () => {
  const e = ready();
  e.setNow('2026-11-15T09:00:00+09:00');
  e.ctx.onFormSubmit(answer({ grid: [null, '参加', ''] }));
  const row = e.sheet('参加者').recs()[0];
  assert.deepStrictEqual([row['事前準備'], row['1次会'], row['2次会'], row['締め切り後']], ['不参加', '参加', '不参加', '締め切り後']);
  assert.ok(toMe(e, 'ob-kai@example.com')[0].subject.startsWith('【締め切り後】'));
  // 締め切りの日の 23:59 までは、締め切り前
  const e2 = ready({ now: '2026-11-14T23:30:00+09:00' });
  e2.ctx.onFormSubmit(answer({}));
  assert.strictEqual(e2.sheet('参加者').recs()[0]['締め切り後'], '');
  // 幹事が「設定」で締め切りを変えれば、そのとおり
  const e3 = ready({ now: '2026-11-15T09:00:00+09:00' });
  const st = e3.sheet('設定');
  st.put(st.recs().findIndex((r) => r['項目'] === '回答の締め切り') + 2, 2, '2026/11/20');
  e3.ctx.onFormSubmit(answer({}));
  assert.strictEqual(e3.sheet('参加者').recs()[0]['締め切り後'], '');
});

test('メールアドレスがおかしい：本人には送らず、幹事に知らせる。一覧にも入れない', () => {
  const e = ready();
  const r = e.ctx.onFormSubmit(answer({ email: 'senpai a@example' }));
  assert.strictEqual(r.error, 'bad_email');
  assert.strictEqual(e.sheet('参加者').recs().length, 0);
  assert.strictEqual(e.patches.length, 0);
  assert.ok(toMe(e, 'ob-kai@example.com')[0].subject.includes('メールアドレスがおかしい'));
  // 全角のアドレスや空白はそろえる
  e.ctx.onFormSubmit(answer({ email: ' ｓｅｎｐａｉ＠ｅｘａｍｐｌｅ．ｃｏｍ ' }));
  assert.strictEqual(e.sheet('参加者').recs()[0]['メールアドレス'], 'senpai@example.com');
});

test('カレンダーの予定がない・書けない：メールは送り、メモに残す', () => {
  const e = ready({ events: ['寮生大会（事前準備）', '寮生大会（1次会）'] });
  e.ctx.onFormSubmit(answer({ grid: ['不参加', '参加', '参加'] }));
  const row = e.sheet('参加者').recs()[0];
  assert.strictEqual(row['招待（1次会）'], '招待ずみ');
  assert.strictEqual(row['招待（2次会）'], '');
  assert.ok(row['メモ'].includes('2次会の招待を送れませんでした') && row['メモ'].includes('寮生大会（2次会）'), row['メモ']);
  assert.strictEqual(toMe(e, 'senpai.a@example.com').length, 1);
  // 予定ができてから同じ回答を送りなおすと、足りない招待だけ送る
  const e2 = ready({ calendarFails: true });
  e2.ctx.onFormSubmit(answer({}));
  assert.ok(e2.sheet('参加者').recs()[0]['メモ'].includes('カレンダーに書けません'));
});

test('メールが送れない（1 日の上限など）：「送れなかった」にして、1 時間ごとに送りなおす', () => {
  const e = ready({ mailFails: true });
  e.ctx.onFormSubmit(answer({}));
  const row = () => e.sheet('参加者').recs()[0];
  assert.strictEqual(row()['メール'], '送れなかった：参加の確認');
  assert.ok(row()['メモ'].includes('送りなおします'));
  e.ctx.tick();
  assert.strictEqual(row()['メール'], '送れなかった：参加の確認', 'まだ送れない');
  e.setMailFails(false);
  e.ctx.tick();
  assert.strictEqual(row()['メール'], '送った：参加の確認');
  assert.strictEqual(toMe(e, 'senpai.a@example.com').length, 1);
});

test('前日のお知らせ：設定の日時をすぎたら、参加する人に 1 回だけ（参加する会の案内）', () => {
  const e = ready();
  e.ctx.onFormSubmit(answer({ email: 'a@example.com', grid: ['不参加', '参加', '参加'] }));
  e.ctx.onFormSubmit(answer({ email: 'b@example.com', grid: ['参加', '不参加', '不参加'] }));
  e.ctx.onFormSubmit(answer({ email: 'c@example.com', grid: ['不参加', '不参加', '不参加'] }));
  e.mails.length = 0;
  e.setNow('2026-11-27T11:30:00+09:00');
  e.ctx.tick();
  assert.strictEqual(e.mails.length, 0, 'まだ早い');
  e.setNow('2026-11-27T12:05:00+09:00');
  e.ctx.tick();
  const tos = e.mails.map((m) => m.to).sort();
  assert.deepStrictEqual(tos, ['a@example.com', 'b@example.com'], '参加する人だけ');
  const a = e.mails.find((m) => m.to === 'a@example.com');
  assert.ok(a.subject.includes('明日は寮生大会') && a.body.includes('◆ 1次会') && a.body.includes('◆ 2次会') && !a.body.includes('◆ 事前準備'));
  const b = e.mails.find((m) => m.to === 'b@example.com');
  assert.ok(b.body.includes('◆ 事前準備') && !b.body.includes('◆ 1次会'));
  assert.ok(String(e.sheet('設定').recs().find((r) => r['項目'] === '前日のお知らせを送った日時')['値']).includes('2 人'));
  e.ctx.tick();
  assert.strictEqual(e.mails.length, 2, '2 回は送らない');
});

test('名前が = で始まっても、シートで式にならない。appsscript.json の中身', () => {
  const e = ready();
  e.ctx.onFormSubmit(answer({ name: '=IMPORTXML("http://x","//a")' }));
  const sh = e.sheet('参加者');
  assert.strictEqual(sh.rows[1][1], '=IMPORTXML("http://x","//a")'.replace(/^/, ''), '先頭に \' を付けて入れる（シートでは文字）');
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'gas', 'taikai', 'appsscript.json'), 'utf8'));
  assert.strictEqual(m.timeZone, 'Asia/Tokyo');
  assert.deepStrictEqual(m.dependencies.enabledAdvancedServices, [{ userSymbol: 'Calendar', serviceId: 'calendar', version: 'v3' }]);
  for (const s of ['forms.currentonly', 'spreadsheets', 'calendar', 'script.send_mail', 'script.scriptapp']) assert.ok(m.oauthScopes.some((x) => x.endsWith('/auth/' + s)), s);
  assert.ok(!m.oauthScopes.some((x) => /\/auth\/(drive|gmail\.|forms)$/.test(x)), '要らない権限はない');
  // 公開しているコードに、支払い先や担当者の名前を書いていない
  const code = fs.readFileSync(CODE, 'utf8');
  assert.ok(!/paypay\s*id|会計担当：/i.test(code));
});

(async () => {
  let fail = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('ok   ' + t.name); } catch (e) { fail++; console.log('NG   ' + t.name + '\n     ' + String(e.stack || e).split('\n').slice(0, 6).join('\n     ')); }
  }
  console.log('\n' + (tests.length - fail) + ' / ' + tests.length + ' 件 OK');
  process.exit(fail ? 1 : 0);
})();
