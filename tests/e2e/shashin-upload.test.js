/*
 * 写真館（shashin/）の「写真を送る」の確認
 *   node tests/e2e/shashin-upload.test.js   … ポートは ARCH.md の割り当て（8809）。PORT=8821 などで変えられる
 *  0. ZIP を開く道具（js/site/zip.js）：Shift_JIS・UTF-8 の名前、そのまま・deflate、フォルダ・__MACOSX/・ドットファイルをとばす、
 *     パスワード付き・ZIP64・ZIP でないもの
 *  1. 本番の形（パソコン）：はじめは閉じている、ZIP と写真をまとめて送る（base64・年度・ひとこと・同時に 2 つまで・順番）、
 *     大きすぎるものは送らない、写真でないもの・開けない ZIP・受けとってもらえなかったものの一覧、重複、送ったあと一覧を読みなおす
 *  2. スマホ：たくさん送った（too_many）→ 止まる、もう一度押すと残りだけ送る、横にはみ出さない
 *  3. 「やめる」
 *  4. 送っている途中でログインが切れた（invalid_token）→ ログインの画面にもどる
 *  5. デモ（GAS_URL が空）：通信せずに送ったふり（5 枚目ごとに重複）、ドラッグで入れる
 * ZIP はこの中で Node の zlib を使って作る。Google のスクリプトと Apps Script の返事は、にせものに差しかえる。
 * 環境変数 SHASHIN_SHOTS にフォルダを指定すると、途中の画面を保存する。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8809; // ARCH.md の割り当て
const SHOTS = process.env.SHASHIN_SHOTS || '';
const GAS = 'https://script.google.com/macros/s/TEST/exec';
const GSI = 'https://accounts.google.com/gsi/client';
const CLIENT = '1234-test.apps.googleusercontent.com';
const MB = 1024 * 1024;

const GSI_STUB = `
window.google = { accounts: { id: {
  initialize: function (o) { window.__gsi = { opts: o }; },
  renderButton: function (el) { el.innerHTML = '<div class="fake-gsi">Google でログイン（テスト）</div>'; },
  disableAutoSelect: function () {},
  prompt: function () {}
} } };`;

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (k, email) => b64u({ alg: 'RS256', typ: 'JWT' }) + '.' + b64u({ email, k }) + '.sig';

// ── 小さな ZIP 作り ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// entries: [{ name: Buffer|string, data: Buffer, method: 0|8, utf8: bool, flags: 追加のフラグ, zip64: bool }]
function makeZip(entries, o = {}) {
  const locals = [];
  const cens = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.isBuffer(e.name) ? e.name : Buffer.from(e.name, 'utf8');
    const data = e.data || Buffer.alloc(0);
    const comp = e.method === 8 ? zlib.deflateRawSync(data) : data;
    const flags = (e.utf8 ? 0x800 : 0) | (e.flags || 0);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(e.method || 0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x5b21, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flags, 8); ch.writeUInt16LE(e.method || 0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x5b21, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(e.zip64 ? 0xffffffff : comp.length, 20); ch.writeUInt32LE(e.zip64 ? 0xffffffff : data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, comp);
    cens.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(cens);
  const comment = Buffer.from(o.comment || '', 'utf8');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16); end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([Buffer.from(o.prefix || ''), ...locals, cd, end, comment]);
}

// にせの写真（中身はちがえば何でもよい）
let seed = 1;
function fakeJpeg(n) {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; b[i] = (seed >> 16) & 0xff; }
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
  return b;
}
const SJIS_NAME = Buffer.from([0x8e, 0xca, 0x90, 0x5e, 0x2e, 0x6a, 0x70, 0x67]); // 「写真.jpg」の Shift_JIS
const IMG1 = fakeJpeg(3000);            // そのまま
const IMG2 = fakeJpeg(150 * 1024);      // deflate・UTF-8 の名前（100KB をこえる大きさでも、base64 が正しいか）
const IMG3 = Buffer.concat([fakeJpeg(500), Buffer.alloc(4000, 7)]); // deflate・Shift_JIS の名前
const PHOTO_ZIP = makeZip([
  { name: '2005/', data: Buffer.alloc(0) },
  { name: 'IMG_0001.JPG', data: IMG1, method: 0 },
  { name: '2005/新歓/IMG_0002.jpg', data: IMG2, method: 8, utf8: true },
  { name: SJIS_NAME, data: IMG3, method: 8 },
  { name: 'memo.txt', data: Buffer.from('メモです'), method: 8, utf8: true },
  { name: '__MACOSX/._IMG_0001.JPG', data: Buffer.from('mac'), method: 0 },
  { name: '.DS_Store', data: Buffer.from('ds'), method: 0 },
  { name: '2005/.hidden.jpg', data: Buffer.from('x'), method: 0 },
  { name: 'big.png', data: Buffer.alloc(21 * MB), method: 8 }, // ほどくと 21MB（ZIP の中では小さい）
], { prefix: '', comment: 'テストの ZIP' });
const SECRET_ZIP = makeZip([{ name: 'a.jpg', data: IMG1, method: 0, flags: 1 }]);
const HUGE_ZIP = makeZip([{ name: 'a.jpg', data: IMG1, method: 0, zip64: true }]);
const BROKEN_ZIP = Buffer.from('これは ZIP ではありません。'.repeat(20));
const A_JPG = fakeJpeg(5000);
const TOOLARGE_JPG = fakeJpeg(1200);
const BIG_JPG = Buffer.alloc(21 * MB, 1); // 20MB をこえる（送らない）

const file = (name, buffer, mimeType) => ({ name, mimeType: mimeType || 'application/octet-stream', buffer });

async function shot(page, name, full) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, 'shashin-upload-' + name + '.png'), fullPage: !!full });
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const nothingKept = (page) => page.evaluate(() => JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage), document.cookie]));
const thumbCount = (page) => page.$$eval('.ps-thumb', (els) => els.length);

async function openPage(browser, base, o = {}) {
  const ctx = await browser.newContext(o.phone
    ? { viewport: { width: o.width || 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1280, height: 800 } });
  if (o.config) {
    await ctx.route('**/js/site/config.js', (r) => r.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8',
      body: 'window.OB_CONFIG = ' + JSON.stringify(Object.assign({ GAS_URL: '', GOOGLE_CLIENT_ID: '', ALBUM_URL: '', CONTACT_EMAIL: '' }, o.config)) + ';',
    }));
  }
  await ctx.route(GSI, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: GSI_STUB }));
  // にせものの Apps Script。srv.answer(body, n) で upload の返事を決める（n は何枚目か。1 から）
  const srv = {
    posts: [], uploads: [], started: [], inflight: 0, maxInflight: 0, delay: o.delay != null ? o.delay : 150,
    photos: [{ id: 'p-1', year: 2004, date: '2004-05-01' }, { id: 'p-2', year: 2005, date: '2005-06-01' }],
    answer: () => ({ ok: true, id: 'x', year: null }),
  };
  await ctx.route('https://script.google.com/**', async (r) => {
    const req = r.request();
    let d = {};
    try { d = JSON.parse(req.postData() || '{}'); } catch (e) { /* なにもしない */ }
    srv.posts.push({ body: d, type: req.headers()['content-type'] || '' });
    const json = (obj) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(obj) });
    const k = d.idToken ? JSON.parse(Buffer.from(String(d.idToken).split('.')[1], 'base64url').toString()).k : '';
    if (d.type === 'photos') return json(k === 'ok' ? { ok: true, download: false, photos: srv.photos } : { ok: false, error: 'invalid_token' });
    if (d.type === 'thumbs') {
      const images = {};
      for (const id of d.ids || []) images[id] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
      return json({ ok: true, images });
    }
    if (d.type === 'upload') {
      const n = srv.started.length + 1;
      srv.started.push(d.name);
      srv.inflight++;
      srv.maxInflight = Math.max(srv.maxInflight, srv.inflight);
      await new Promise((res) => setTimeout(res, srv.delay));
      srv.inflight--;
      srv.uploads.push(d);
      const a = srv.answer(d, n);
      if (a.ok && !a.duplicate) srv.photos = srv.photos.concat({ id: 'new-' + srv.photos.length, year: 2005, date: '2005-07-0' + (1 + (srv.photos.length % 9)) });
      return json(a);
    }
    return json({ ok: false, error: 'bad_request' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  await page.goto(base + 'shashin/');
  await page.waitForTimeout(400);
  if (o.config && o.config.GAS_URL) {
    await page.waitForSelector('#ps-gbtn .fake-gsi', { timeout: 5000 });
    await page.evaluate((c) => window.__gsi.opts.callback({ credential: c }), token(o.k || 'ok', 'senpai@example.com'));
    await page.waitForSelector('#ps-board', { state: 'visible', timeout: 5000 });
  } else {
    await page.waitForSelector('#ps-board', { state: 'visible', timeout: 5000 });
  }
  return { page, ctx, errors, srv };
}
async function press(page, sel, phone) {
  if (phone) await page.tap(sel);
  else await page.click(sel);
}
async function openSend(page, phone) {
  assert.ok(!(await page.isVisible('#ps-send')), 'はじめから送る欄が開いている');
  assert.strictEqual((await page.textContent('#ps-send-toggle')).trim(), '写真を送る ▶');
  assert.strictEqual(await page.getAttribute('#ps-send-toggle', 'aria-expanded'), 'false');
  await press(page, '#ps-send-toggle', phone);
  await page.waitForSelector('#ps-send', { state: 'visible' });
  assert.strictEqual(await page.getAttribute('#ps-send-toggle', 'aria-expanded'), 'true');
}
const waitIdle = (page, ms = 15000) => page.waitForFunction(() => !document.getElementById('ps-send-go').disabled, null, { timeout: ms });
const progText = (page) => page.textContent('#ps-prog-text');
const statusText = (page) => page.textContent('#ps-send-status');
const problems = (page) => page.$$eval('#ps-problem-list li', (els) => els.map((e) => e.textContent));

withSite(PORT, async ({ browser, base }) => {
  // ── 0. ZIP を開く道具 ──
  {
    const { page, ctx, errors } = await openPage(browser, base);
    const run = (buf) => page.evaluate(async (b64) => {
      const bin = atob(b64);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      try {
        const list = await OB.zip.entries(new File([u], 't.zip'));
        const out = [];
        for (const en of list) {
          let sum = null, err = null;
          if (en.size < 1024 * 1024) {
            try { const b = await en.read(); sum = b.length + ':' + b.reduce((a, x) => (a * 31 + x) >>> 0, 0); } catch (e) { err = e.code; }
          }
          out.push({ name: en.name, size: en.size, sum, err });
        }
        return { list: out };
      } catch (e) {
        return { error: e.code };
      }
    }, buf.toString('base64'));
    const sum = (b) => b.length + ':' + [...b].reduce((a, x) => (a * 31 + x) >>> 0, 0);
    const r = await run(PHOTO_ZIP);
    assert.deepStrictEqual(r.list.map((e) => e.name), ['IMG_0001.JPG', '2005/新歓/IMG_0002.jpg', '写真.jpg', 'memo.txt', 'big.png'], 'ZIP の一覧: ' + JSON.stringify(r));
    assert.strictEqual(r.list[0].sum, sum(IMG1), 'そのまま入れたものが読めない');
    assert.strictEqual(r.list[1].sum, sum(IMG2), 'deflate したものが読めない');
    assert.strictEqual(r.list[2].sum, sum(IMG3), 'Shift_JIS の名前のものが読めない');
    assert.strictEqual(r.list[4].size, 21 * MB);
    // ZIP の前に何か付いている（自己解凍など）
    const pre = makeZip([{ name: 'a.jpg', data: IMG1, method: 8 }], { prefix: 'MZ'.repeat(500) });
    const r2 = await run(pre);
    assert.strictEqual(r2.list && r2.list[0].sum, sum(IMG1), '前に何か付いた ZIP: ' + JSON.stringify(r2));
    assert.deepStrictEqual(await run(SECRET_ZIP), { error: 'zip_encrypted' });
    assert.deepStrictEqual(await run(HUGE_ZIP), { error: 'zip64' });
    assert.deepStrictEqual(await run(BROKEN_ZIP), { error: 'zip_not' });
    assert.deepStrictEqual(await run(Buffer.alloc(10)), { error: 'zip_not' });
    // 入れ方が deflate 以外（12 = bzip2）
    const bz = makeZip([{ name: 'a.jpg', data: IMG1, method: 0 }]);
    bz.writeUInt16LE(12, 8);
    const cenAt = bz.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bz.writeUInt16LE(12, cenAt + 10);
    const r3 = await run(bz);
    assert.strictEqual(r3.list[0].err, 'zip_method');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: ZIP を開く道具（Shift_JIS・UTF-8・そのまま・deflate・とばすもの・開けない ZIP）');
  }

  // ── 1. 本番の形（パソコン） ──
  {
    const { page, ctx, errors, srv } = await openPage(browser, base, { config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT } });
    srv.answer = (d) => {
      if (d.name === 'IMG_0002.jpg') return { ok: true, duplicate: true, same: 'old.jpg' };
      if (d.name === 'toolarge.jpg') return { ok: false, error: 'too_large' };
      return { ok: true, id: '1New' + d.name.length, year: 2005 };
    };
    assert.strictEqual(await thumbCount(page), 2);
    await openSend(page, false);
    const note = await page.textContent('#ps-send');
    assert.ok(note.includes('1 枚 20MB まで。ZIP の中の写真も 1 枚ずつ送ります。送った写真は、重複を見て、年度に分けてから写真館に並びます。'), '注意書き');
    assert.ok(note.includes('わかれば。例：2005、平成17年度。書いておくと、撮影日よりこちらを使います'), '年度の説明');
    assert.strictEqual(await page.getAttribute('#ps-files', 'accept'), 'image/*,.zip,application/zip');
    assert.strictEqual(await page.getAttribute('#ps-files', 'multiple'), '');
    assert.strictEqual(await page.getAttribute('#ps-send-note', 'maxlength'), '200');
    // 何もえらばずに送る
    await page.click('#ps-send-go');
    assert.ok((await statusText(page)).includes('えらんでください'));
    assert.strictEqual(srv.uploads.length, 0);

    await page.setInputFiles('#ps-files', [
      file('photos.zip', PHOTO_ZIP, 'application/zip'),
      file('a.jpg', A_JPG, 'image/jpeg'),
      file('toolarge.jpg', TOOLARGE_JPG, 'image/jpeg'),
      file('big.jpg', BIG_JPG, 'image/jpeg'),
      file('notes.pdf', Buffer.from('%PDF-1.4'), 'application/pdf'),
      file('secret.zip', SECRET_ZIP, 'application/zip'),
      file('huge.zip', HUGE_ZIP, 'application/zip'),
      file('broken.zip', BROKEN_ZIP, 'application/zip'),
      file('clip.mov', Buffer.from('mov'), 'video/quicktime'),
    ]);
    assert.ok((await page.textContent('#ps-picked')).includes('photos.zip ほか 8 個（ZIP 4 個）'), await page.textContent('#ps-picked'));
    await page.fill('#ps-send-year', '平成17年度');
    await page.fill('#ps-send-note', '新歓のときの写真です');
    await page.click('#ps-send-go');
    await page.waitForFunction(() => document.getElementById('ps-send-go').disabled, null, { timeout: 3000 });
    assert.ok(await page.isVisible('#ps-send-stop'), '送っている間に「やめる」がない');
    await waitIdle(page);
    assert.ok(!(await page.isVisible('#ps-send-stop')), '終わっても「やめる」が出ている');

    // 送ったもの：順番どおり・同時に 2 つまで・base64 がもとの中身・年度とひとこと
    assert.deepStrictEqual(srv.started, ['IMG_0001.JPG', 'IMG_0002.jpg', '写真.jpg', 'a.jpg', 'toolarge.jpg'], '送った順番: ' + srv.started);
    assert.strictEqual(srv.maxInflight, 2, '同時に送る数: ' + srv.maxInflight);
    const byName = Object.fromEntries(srv.uploads.map((u) => [u.name, u]));
    const want = { 'IMG_0001.JPG': IMG1, 'IMG_0002.jpg': IMG2, '写真.jpg': IMG3, 'a.jpg': A_JPG, 'toolarge.jpg': TOOLARGE_JPG };
    for (const [name, bytes] of Object.entries(want)) {
      const u = byName[name];
      assert.ok(u, name + ' を送っていない');
      assert.ok(Buffer.from(u.data, 'base64').equals(bytes), name + ' の中身（base64）がちがう');
      assert.deepStrictEqual(Object.keys(u).sort(), ['data', 'idToken', 'mime', 'name', 'note', 'type', 'year']);
      assert.strictEqual(u.type, 'upload');
      assert.strictEqual(u.mime, 'image/jpeg');
      assert.strictEqual(u.year, '平成17年度');
      assert.strictEqual(u.note, '新歓のときの写真です');
      assert.ok(u.idToken.split('.').length === 3);
    }
    assert.ok(srv.posts.filter((p) => p.body.type === 'upload').every((p) => /^text\/plain/.test(p.type)), 'text/plain で送っていない');
    assert.strictEqual(await progText(page), '4 / 5 枚 送りました（同じ写真がもうあったので とばした：1 枚）　送れなかった：1 枚');
    assert.strictEqual(await page.$eval('#ps-prog-fill', (e) => e.style.width), '100%');
    const ps = await problems(page);
    const has = (label, text) => assert.ok(ps.some((p) => p.startsWith(label + '：') && p.includes(text)), label + ' の問題が出ていない: ' + JSON.stringify(ps));
    has('photos.zip の中の memo.txt', '写真ではない');
    has('photos.zip の中の big.png', '大きすぎる');
    has('big.jpg', '20MB');
    has('notes.pdf', '写真ではない');
    has('clip.mov', '動画');
    has('secret.zip', 'パスワード');
    has('huge.zip', '大きすぎて開けません');
    has('broken.zip', 'ZIP を開けませんでした');
    has('toolarge.jpg', '受けとってもらえません');
    assert.strictEqual(ps.length, 9, '問題の数: ' + JSON.stringify(ps));
    assert.ok((await statusText(page)).includes('送り終わりました'));
    // 送ったあと、一覧を読みなおす（新しい 3 枚がふえる）
    await page.waitForFunction(() => document.querySelectorAll('.ps-thumb').length === 5, null, { timeout: 5000 });
    assert.strictEqual(srv.posts.filter((p) => p.body.type === 'photos').length, 2, '一覧を読みなおしていない');
    assert.ok(await page.isVisible('#ps-send'), '送ったあと、送る欄が閉じた');
    // 送れなかったものがあるので、えらんだものは残る。もう一度押すと、送れなかったものだけ送る
    srv.answer = () => ({ ok: true, id: 'again', year: null });
    srv.started.length = 0;
    await page.click('#ps-send-go');
    await waitIdle(page);
    assert.deepStrictEqual(srv.started, ['toolarge.jpg'], 'もう一度押したとき、送れたものまで送った: ' + srv.started);
    assert.strictEqual(await progText(page), '1 / 1 枚 送りました');
    assert.ok((await statusText(page)).includes('送り終わりました'));
    assert.strictEqual(await page.inputValue('#ps-files'), '', '全部送れたのに、えらんだものが残っている');
    assert.ok((await page.textContent('#ps-picked')).includes('まだ何もえらんでいません'));
    await shot(page, 'pc-done', true);
    // 閉じる・開く
    await page.click('#ps-send-toggle');
    assert.ok(!(await page.isVisible('#ps-send')));
    assert.strictEqual(await nothingKept(page), '[[],[],""]', 'ブラウザに何か保存している');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: 本番の形（ZIP と写真・大きすぎる・写真でない・開けない ZIP・重複・読みなおし）');
  }

  // ── 2. スマホ：たくさん送った（too_many） ──
  {
    const { page, ctx, errors, srv } = await openPage(browser, base, { phone: true, width: 360, config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT } });
    let busy = true;
    srv.answer = (d, n) => (busy && n >= 4 ? { ok: false, error: 'too_many' } : { ok: true, id: 'n' + n, year: null });
    await openSend(page, true);
    assert.ok(await noOverflow(page), '幅 360 で横にはみ出す（送る欄）');
    const files = [];
    for (let i = 1; i <= 8; i++) files.push(file('IMG_' + i + '.jpg', fakeJpeg(800 + i), 'image/jpeg'));
    await page.setInputFiles('#ps-files', files);
    await page.tap('#ps-send-go');
    await waitIdle(page);
    assert.strictEqual(await statusText(page), 'たくさん送られたので、少し休んでいます。1 時間ほどしてから、残りを送ってください。');
    assert.ok(srv.started.length <= 5, '休みのあとも送りつづけた: ' + srv.started.length);
    const okNames = srv.uploads.filter((u, i) => i < 3).map((u) => u.name);
    assert.deepStrictEqual(okNames, ['IMG_1.jpg', 'IMG_2.jpg', 'IMG_3.jpg']);
    assert.ok((await progText(page)).startsWith('3 / 8 枚 送りました'), await progText(page));
    assert.ok(await noOverflow(page), '幅 360 で横にはみ出す（送ったあと）');
    await shot(page, 'phone-too-many', true);
    // 1 時間後：もう一度押すと残りだけ
    busy = false;
    srv.started.length = 0;
    await page.tap('#ps-send-go');
    await waitIdle(page);
    assert.deepStrictEqual(srv.started, ['IMG_4.jpg', 'IMG_5.jpg', 'IMG_6.jpg', 'IMG_7.jpg', 'IMG_8.jpg'], '残りだけを送っていない: ' + srv.started);
    assert.strictEqual(await progText(page), '5 / 5 枚 送りました');
    await page.waitForFunction(() => document.querySelectorAll('.ps-thumb').length === 10, null, { timeout: 5000 });
    assert.strictEqual(await nothingKept(page), '[[],[],""]');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: スマホ・たくさん送った（休み → 残りだけ）・幅 360');
  }

  // ── 3. やめる ──
  {
    const { page, ctx, errors, srv } = await openPage(browser, base, { delay: 400, config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT } });
    await openSend(page, false);
    const files = [];
    for (let i = 1; i <= 10; i++) files.push(file('S_' + i + '.png', fakeJpeg(500 + i), 'image/png'));
    await page.setInputFiles('#ps-files', files);
    await page.click('#ps-send-go');
    await page.waitForFunction(() => /^[1-9]/.test(document.getElementById('ps-prog-text').textContent), null, { timeout: 5000 });
    await page.click('#ps-send-stop');
    assert.ok(await page.isDisabled('#ps-send-stop'));
    await waitIdle(page);
    assert.ok(srv.started.length < 10 && srv.started.length >= 2, 'やめたのに全部送った: ' + srv.started.length);
    assert.strictEqual(srv.uploads.length, srv.started.length, '送っている途中のものを待たなかった');
    assert.ok(srv.uploads.every((u) => u.mime === 'image/png'));
    assert.ok((await statusText(page)).includes('やめました'), await statusText(page));
    assert.ok((await progText(page)).startsWith(srv.started.length + ' / 10 枚'), await progText(page));
    assert.ok(await page.isEnabled('#ps-send-go'));
    await page.waitForFunction((n) => document.querySelectorAll('.ps-thumb').length === n, 2 + srv.started.length, { timeout: 5000 });
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: やめる（送っている分が終わってから止まる）');
  }

  // ── 4. 送っている途中でログインが切れた ──
  {
    const { page, ctx, errors, srv } = await openPage(browser, base, { config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT } });
    srv.answer = (d, n) => (n >= 2 ? { ok: false, error: 'invalid_token' } : { ok: true, id: 'n' + n, year: null });
    await openSend(page, false);
    const files = [];
    for (let i = 1; i <= 6; i++) files.push(file('T_' + i + '.jpg', fakeJpeg(600 + i), 'image/jpeg'));
    await page.setInputFiles('#ps-files', files);
    await page.click('#ps-send-go');
    await page.waitForSelector('#ps-login', { state: 'visible', timeout: 8000 });
    await page.waitForTimeout(500);
    assert.ok(!(await page.isVisible('#ps-board')), '期限切れなのに写真館が残っている');
    const st = await page.textContent('#ps-status');
    assert.ok(st.includes('期限が切れました') && st.includes('/ 6 枚まで送れています'), '期限切れの文: ' + st);
    assert.ok(srv.started.length <= 3, '期限切れのあとも送りつづけた: ' + srv.started.length);
    // もう一度ログインすると、送る欄は閉じて空
    await page.evaluate((c) => window.__gsi.opts.callback({ credential: c }), token('ok', 'senpai@example.com'));
    await page.waitForSelector('#ps-board', { state: 'visible', timeout: 5000 });
    assert.ok(!(await page.isVisible('#ps-send')));
    await page.click('#ps-send-toggle');
    assert.ok((await page.textContent('#ps-picked')).includes('まだ何もえらんでいません'));
    assert.ok(await page.isEnabled('#ps-send-go'));
    assert.ok(!(await page.isVisible('#ps-prog')));
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: 送っている途中でログインが切れた → ログインの画面');
  }

  // ── 5. デモ（GAS_URL が空）・ドラッグで入れる ──
  {
    const { page, ctx, errors, srv } = await openPage(browser, base);
    const before = await thumbCount(page);
    await openSend(page, false);
    // ドラッグで入れる
    await page.evaluate(() => {
      const dt = new DataTransfer();
      for (let i = 1; i <= 6; i++) dt.items.add(new File([new Uint8Array([0xff, 0xd8, 0xff, i])], 'D_' + i + '.jpg', { type: 'image/jpeg' }));
      const box = document.getElementById('ps-send');
      box.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
      window.__dragClass = box.classList.contains('is-drag');
      box.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    assert.ok(await page.evaluate(() => window.__dragClass), 'ドラッグ中の見た目にならない');
    assert.ok((await page.textContent('#ps-picked')).includes('D_1.jpg ほか 5 個'), await page.textContent('#ps-picked'));
    await page.click('#ps-send-go');
    await waitIdle(page);
    assert.strictEqual(await progText(page), '6 / 6 枚 送りました（同じ写真がもうあったので とばした：1 枚）');
    assert.strictEqual(srv.posts.length, 0, 'デモなのに通信した');
    assert.strictEqual(await thumbCount(page), before);
    assert.ok(!(await page.isVisible('#ps-problems')));
    assert.strictEqual(await nothingKept(page), '[[],[],""]');
    await shot(page, 'demo', true);
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: デモ（送ったふり）・ドラッグで入れる');
  }
}).then(() => {
  console.log('shashin-upload: すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
