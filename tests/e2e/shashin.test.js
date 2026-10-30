/*
 * 写真館（shashin/）の確認
 *   node tests/e2e/shashin.test.js        … ポートは ARCH.md の割り当て（8808）。PORT=8821 などで変えられる
 *  1. デモ（GAS_URL が空）：サンプルの絵が年度ごとに並ぶ・大きく見る（キーボード・はらう）・ダウンロード・年度へとぶ
 *  2. GAS_URL はあるがクライアント ID が空：準備中の表示
 *  3. 本番の形（パソコン・スマホ）：権限なし → 申請の欄、成功 → 年度ごと（年度不明は最後）、
 *     一覧の写真は 24 枚以下ずつ・画面の近くだけ・同時に 3 つまで、大きく見ると 1600、ダウンロードなし（download:false）
 *  4. ダウンロードあり（download:true）・止められたとき（not_allowed）
 *  5. 一覧の写真・大きい写真でログインが切れた（invalid_token）→ ログインの画面にもどる
 *  6. 動きをへらす設定
 * Google のスクリプト（gsi/client）と Apps Script の返事は、にせものに差しかえる。
 * 環境変数 SHASHIN_SHOTS にフォルダを指定すると、途中の画面を保存する。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8808; // ARCH.md の割り当て
const SHOTS = process.env.SHASHIN_SHOTS || '';
const GAS = 'https://script.google.com/macros/s/TEST/exec';
const GSI = 'https://accounts.google.com/gsi/client';
const CLIENT = '1234-test.apps.googleusercontent.com';
const ID_RE = /^[\w-]{1,200}$/;

const GSI_STUB = `
window.google = { accounts: { id: {
  initialize: function (o) { window.__gsi = { opts: o, disabled: 0, renders: 0 }; },
  renderButton: function (el, o) {
    window.__gsi.renders++; window.__gsi.btn = o;
    el.innerHTML = '<div class="fake-gsi" style="display:inline-block;padding:11px 18px;background:#1a73e8;color:#fff;font:14px sans-serif;border-radius:4px">Google でログイン（テスト）</div>';
  },
  disableAutoSelect: function () { window.__gsi.disabled++; },
  prompt: function () {}
} } };`;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (k, email) => b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ email, k, name: 'テスト' }) + '.sig';

// 本番の形の写真：2003（40 枚）・2004（50 枚。1 枚は日付なし）・2005（30 枚）・年度不明（20 枚）。わざと順番をまぜる
const GOOD = [];
const add = (year, n, pre) => {
  for (let i = 0; i < n; i++) {
    const m = 1 + (i % 12);
    GOOD.push({ id: pre + '-' + i, year, date: year == null ? '' : (m >= 4 ? year : year + 1) + '-' + String(m).padStart(2, '0') + '-' + String(1 + (i % 28)).padStart(2, '0'), w: 3072, h: 2304 });
  }
};
add(2003, 40, '1AbC');
add(2004, 50, '1DeF_x');
add(2005, 30, '1GhI');
add(null, 20, '1Zz');
GOOD.find((p) => p.id === '1DeF_x-7').date = '';
const XSS_ID = '<img src=x onerror="window.__xss=1">';
const BAD = [
  { id: XSS_ID, year: 2003, date: '2003-04-01', w: 1, h: 1 },
  { id: 'a"b', year: 2003, date: '', w: 1, h: 1 },
  { id: '../../etc', year: 2004, date: '', w: 1, h: 1 },
  { id: 'x'.repeat(201), year: 2004, date: '', w: 1, h: 1 },
  { id: '1AbC-0', year: 2005, date: '2005-04-01', w: 1, h: 1 }, // 同じ id の 2 つ目は捨てる
  { id: 'no year', year: 2005 },
  null,
];
// 年度の文字・おかしな値：'2005' は 2005 に、13 や 'abc' は年度不明に
const ODD = [
  { id: 'odd-1', year: '2005', date: '2005-05-05', w: 1, h: 1 },
  { id: 'odd-2', year: 13, date: 'きのう', w: 1, h: 1 },
];
const LIVE = (() => {
  const all = GOOD.concat(ODD);
  const out = [];
  for (let i = 0; i < all.length; i++) out.push(all[(i * 37) % all.length]); // 37 と 142 はたがいに素なので全部 1 回ずつ
  return out.concat(BAD);
})();
const VALID_N = GOOD.length + ODD.length; // 142

async function shot(page, name, full) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, 'shashin-' + name + '.png'), fullPage: !!full });
}

const svg = (id, size) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + Math.round(size * 0.75) + '"><rect width="100%" height="100%" fill="#3cbcfc"/><text x="4" y="20">' + id.slice(0, 10) + '</text></svg>');
const FILE_BYTES = (id) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JPEG-' + id)]);

async function openPage(browser, base, o = {}) {
  const ctx = await browser.newContext(Object.assign(o.phone
    ? { viewport: { width: o.width || 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1280, height: 800 } }, { acceptDownloads: true }, o.reduced ? { reducedMotion: 'reduce' } : {}));
  if (o.config) {
    await ctx.route('**/js/site/config.js', (r) => r.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8',
      body: 'window.OB_CONFIG = ' + JSON.stringify(Object.assign({ GAS_URL: '', GOOGLE_CLIENT_ID: '', ALBUM_URL: '', CONTACT_EMAIL: '' }, o.config)) + ';',
    }));
  }
  const gsiAsked = [];
  await ctx.route(GSI, (r) => {
    gsiAsked.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: GSI_STUB });
  });
  // にせものの Apps Script。srv の中身はテストの途中で変えられる
  const srv = { posts: [], inflight: 0, maxInflight: 0, delay: o.delay != null ? o.delay : 120, download: !!o.download, thumbsError: '', photoError: '', missing: new Set(['1AbC-3']), weird: '1AbC-4' };
  await ctx.route('https://script.google.com/**', async (r) => {
    const req = r.request();
    let d = {};
    try { d = JSON.parse(req.postData() || '{}'); } catch (e) { /* なにもしない */ }
    srv.posts.push({ method: req.method(), type: req.headers()['content-type'] || '', body: d, at: Date.now() });
    const k = d.idToken ? JSON.parse(Buffer.from(String(d.idToken).split('.')[1], 'base64url').toString()).k : '';
    const json = (obj) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(obj) });
    if (d.type === 'request') return json({ ok: true });
    if (d.type === 'photos') {
      if (k === 'ok') return json({ ok: true, download: srv.download, photos: o.photos || LIVE });
      return json({ ok: false, error: k || 'invalid_token' });
    }
    if (d.type === 'thumbs' || d.type === 'photo') {
      srv.inflight++;
      srv.maxInflight = Math.max(srv.maxInflight, srv.inflight);
      await new Promise((res) => setTimeout(res, srv.delay));
      srv.inflight--;
      if (k !== 'ok') return json({ ok: false, error: 'invalid_token' });
      if (d.type === 'thumbs') {
        if (srv.thumbsError) return json({ ok: false, error: srv.thumbsError });
        const images = {};
        for (const id of d.ids || []) {
          if (srv.missing.has(id)) continue;
          images[id] = id === srv.weird ? 'javascript:window.__xss3=1' : svg(id, d.size);
        }
        return json({ ok: true, images });
      }
      if (srv.photoError) return json({ ok: false, error: srv.photoError });
      if (!srv.download) return json({ ok: false, error: 'not_allowed' });
      return json({ ok: true, name: 'IMG_0001.JPG', mime: 'image/jpeg', data: FILE_BYTES(d.id).toString('base64') });
    }
    return json({ ok: false, error: 'bad_request' });
  });
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('dialog', (dl) => { dialogs.push(dl.message()); dl.dismiss().catch(() => {}); });
  await page.goto(base + 'shashin/');
  await page.waitForTimeout(o.wait != null ? o.wait : 500);
  return { page, ctx, errors, dialogs, srv, gsiAsked };
}

const thumbsPosts = (srv, size) => srv.posts.filter((p) => p.body.type === 'thumbs' && (size == null || p.body.size === size));
const askedIds = (srv) => new Set([].concat(...thumbsPosts(srv, 400).map((p) => p.body.ids)));
const sectionIds = (page) => page.$$eval('#ps-years .ps-year', (els) => els.map((e) => e.id));
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const lbCount = (page) => page.textContent('#ps-lb-count');
const focusId = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.id || (a.dataset && a.dataset.n != null ? 'thumb-' + a.dataset.n : a.tagName)) : '';
});
const nothingKept = (page) => page.evaluate(() => JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage), document.cookie]));
async function press(page, sel, phone) {
  if (phone) await page.tap(sel);
  else await page.click(sel);
}
async function signIn(page, k, email) {
  await page.evaluate((c) => window.__gsi.opts.callback({ credential: c }), token(k, email));
  await page.waitForFunction(() => !document.getElementById('ps-status').classList.contains('is-busy'), null, { timeout: 5000 });
  await page.waitForTimeout(100);
}
// 左右にはらう（スマホ）
async function swipe(page, dx, wait = 50) {
  await page.evaluate((dx) => {
    const st = document.getElementById('ps-lb-stage');
    const r = st.getBoundingClientRect();
    const y = r.top + r.height / 2, x0 = r.left + r.width / 2 - dx / 2;
    const t = (x) => new Touch({ identifier: 1, target: st, clientX: x, clientY: y });
    st.dispatchEvent(new TouchEvent('touchstart', { touches: [t(x0)], changedTouches: [t(x0)], bubbles: true }));
    st.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(x0 + dx)], bubbles: true }));
  }, dx);
  if (wait) await page.waitForTimeout(wait);
}
async function waitLoaded(page, n) {
  await page.waitForFunction((n) => document.querySelectorAll('.ps-thumb.is-loaded').length >= n, n, { timeout: 8000 });
}
// 大きく見る画面の Tab：何回押しても、外に出ない
async function tabStaysInside(page, tag) {
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
    const inside = await page.evaluate(() => document.getElementById('ps-lb').contains(document.activeElement));
    assert.ok(inside, tag + ': Tab で大きく見る画面の外に出た');
  }
}

withSite(PORT, async ({ browser, base }) => {
  // ── 1. デモ（パソコン・スマホ） ──
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'pc';
    const { page, ctx, errors, dialogs, gsiAsked } = await openPage(browser, base, { phone });
    const sample = await page.evaluate(() => window.OB.SAMPLE.photos);
    assert.ok(sample.length >= 25 && sample.some((p) => p.year == null), tag + ': サンプルの写真が少ない');
    assert.ok(await page.isVisible('#ps-demo'), tag + ': デモの注記が出ていない');
    assert.ok((await page.textContent('.ps-intro')).includes('寮の写真を、年度ごとに見られます。写真は承認された寮生だけが見られます。'));
    assert.ok((await page.textContent('.ps-intro')).includes('年度は写真の撮影日から自動で分けています。まちがいがあれば幹事に知らせてください。'));
    assert.ok(!(await page.isVisible('#ps-login')) && !(await page.isVisible('#ps-setup')) && !(await page.isVisible('#ps-user')), tag + ': デモなのにログインが出ている');
    assert.strictEqual(gsiAsked.length, 0, tag + ': デモなのに Google のスクリプトを読んだ');
    const years = [...new Set(sample.filter((p) => p.year != null).map((p) => p.year))].sort();
    assert.deepStrictEqual(await sectionIds(page), years.map((y) => 'py' + y).concat('py-unknown'), tag + ': 年度の並びがちがう（不明は最後）');
    assert.strictEqual(await page.$$eval('.ps-thumb', (els) => els.length), sample.length, tag + ': 写真の数がちがう');
    const head = await page.textContent('#py2005-h');
    assert.ok(head.includes('2005年度（平成17年度）') && head.includes(sample.filter((p) => p.year === 2005).length + '枚'), tag + ': 年度の見出し: ' + head);
    assert.ok((await page.textContent('#py-unknown-h')).includes('年度不明'));
    assert.strictEqual((await page.textContent('#ps-count')).trim(), '全 ' + sample.length + '枚');
    assert.strictEqual(await page.$$eval('#ps-jump .ps-chip', (els) => els.length), years.length + 1, tag + ': 年度へとぶボタンの数');
    await waitLoaded(page, 6);
    const src = await page.$eval('.ps-thumb.is-loaded img', (i) => i.getAttribute('src'));
    assert.ok(src.startsWith('data:image/svg+xml'), tag + ': サンプルの絵になっていない');
    assert.ok(await page.isVisible('footer.ob-footer') && (await page.textContent('footer')).includes('フィクション'), tag + ': 注記がない');
    assert.ok(await page.isVisible('a.ob-back[href="../"]'));
    if (phone) {
      const cols = await page.$eval('.ps-grid', (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
      assert.strictEqual(cols, 3, tag + ': スマホは 3 列');
    } else {
      const cols = await page.$eval('.ps-grid', (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
      assert.ok(cols >= 5, tag + ': パソコンは 5 列以上: ' + cols);
    }
    assert.ok(await noOverflow(page), tag + ': 横にはみ出している');
    await shot(page, tag + '-demo');

    // 大きく見る
    await press(page, '.ps-thumb[data-n="0"]', phone);
    await page.waitForSelector('#ps-lb', { state: 'visible' });
    assert.strictEqual(await focusId(page), 'ps-lb-close', tag + ': 開いたら閉じるボタンにフォーカス');
    assert.strictEqual(await lbCount(page), '1 / ' + sample.length);
    assert.strictEqual(await page.textContent('#ps-lb-title'), '2003年度（平成15年度）');
    assert.ok((await page.textContent('#ps-lb-info')).includes(sample[0].date.slice(0, 4) + '年'), tag + ': 撮影日が出ていない');
    assert.ok(await page.isDisabled('#ps-lb-prev'), tag + ': 最初の写真で「前」が押せる');
    assert.ok(await page.isVisible('#ps-dl'), tag + ': デモではダウンロードできる');
    await page.waitForFunction(() => { const i = document.getElementById('ps-lb-img'); return !i.hidden && !i.classList.contains('is-preview') && i.src.startsWith('data:image/svg'); }, null, { timeout: 5000 });
    assert.strictEqual(await page.evaluate(() => document.querySelector('.ob-main').inert), true, tag + ': うしろのページが操作できる');
    assert.ok(await noOverflow(page), tag + ': 大きく見る画面で横にはみ出す');
    await shot(page, tag + '-demo-lightbox');
    if (phone) {
      await swipe(page, -120);
      assert.strictEqual(await lbCount(page), '2 / ' + sample.length, tag + ': 左にはらって次へ行けない');
      await swipe(page, 120);
      assert.strictEqual(await lbCount(page), '1 / ' + sample.length, tag + ': 右にはらって前へ行けない');
      await swipe(page, 20);
      assert.strictEqual(await lbCount(page), '1 / ' + sample.length, tag + ': 少し動かしただけで切りかわった');
      await page.tap('#ps-lb-next');
      assert.strictEqual(await lbCount(page), '2 / ' + sample.length, tag + ': 「次」のボタン');
    } else {
      await page.keyboard.press('ArrowRight');
      assert.strictEqual(await lbCount(page), '2 / ' + sample.length, tag + ': → で次へ行けない');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowLeft');
      assert.strictEqual(await lbCount(page), '2 / ' + sample.length, tag + ': ← で前へ行けない');
      await tabStaysInside(page, tag);
    }
    // ダウンロード（デモはサンプルの絵）
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), press(page, '#ps-dl', phone)]);
    assert.strictEqual(dl.suggestedFilename(), sample[1].id + '.svg', tag + ': ファイルの名前');
    const saved = fs.readFileSync(await dl.path(), 'utf8');
    assert.ok(saved.startsWith('<svg') && saved.includes(String(sample[1].year)), tag + ': 保存した中身がちがう');
    await page.waitForSelector('#ps-dl-status.is-done', { timeout: 5000 });
    // 閉じる → 最後に見た写真にフォーカスがもどる
    if (phone) await page.tap('#ps-lb-close');
    else await page.keyboard.press('Escape');
    assert.ok(!(await page.isVisible('#ps-lb')), tag + ': 閉じない');
    assert.strictEqual(await focusId(page), 'thumb-1', tag + ': 閉じたあと、見ていた写真にフォーカスがもどらない');
    assert.strictEqual(await page.evaluate(() => document.querySelector('.ob-main').inert), false);

    // 年度へとぶ
    await press(page, '#ps-jump .ps-chip[data-target="py2006"]', phone);
    await page.waitForTimeout(1200);
    const top = await page.evaluate(() => document.getElementById('py2006').getBoundingClientRect().top);
    assert.ok(top >= 0 && top < 120, tag + ': 年度へとべない: ' + top);
    await page.waitForFunction(() => [...document.querySelectorAll('#py2006 .ps-thumb')].every((b) => b.classList.contains('is-loaded')), null, { timeout: 5000 });
    assert.strictEqual(await nothingKept(page), '[[],[],""]', tag + ': ブラウザに何か保存している');
    assert.deepStrictEqual(realErrors(errors), [], tag + ': エラーが出た');
    assert.deepStrictEqual(dialogs, []);
    await ctx.close();
    console.log('ok: デモ（' + tag + '）');
  }

  // ── 2. GAS_URL はあるが、クライアント ID が空 → 準備中 ──
  {
    const { page, ctx, errors, gsiAsked, srv } = await openPage(browser, base, { config: { GAS_URL: GAS } });
    assert.ok(await page.isVisible('#ps-setup'), '準備中の表示がない');
    assert.ok(!(await page.isVisible('#ps-login')) && !(await page.isVisible('#ps-board')) && !(await page.isVisible('#ps-demo')));
    assert.strictEqual(gsiAsked.length + srv.posts.length, 0, '準備中なのに読みに行った');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: クライアント ID が空のときは準備中');
  }

  // ── 3. 本番の形（パソコン・スマホ） ──
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'pc';
    const { page, ctx, errors, dialogs, srv } = await openPage(browser, base, { phone, config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT } });
    await page.waitForSelector('#ps-gbtn .fake-gsi', { timeout: 5000 });
    assert.ok((await page.textContent('#ps-login')).includes('見る権限のある寮生だけ'));
    assert.ok(!(await page.isVisible('#ps-board')) && !(await page.isVisible('#ps-demo')), tag + ': ログイン前に写真が出ている');
    assert.ok(await noOverflow(page), tag + ': 横にはみ出している（ログイン）');

    // 権限なし → 申請の欄
    await signIn(page, 'not_member', 'kouhai@example.com');
    assert.ok((await page.textContent('#ps-status')).includes('まだ見る権限がありません'), tag + ': 権限なしの文');
    assert.ok(await page.isVisible('#ps-req'), tag + ': 申請の欄が出ていない');
    assert.strictEqual(await page.textContent('#ps-req-email'), 'kouhai@example.com');
    assert.strictEqual(srv.posts.length, 1);
    assert.ok(/^text\/plain/.test(srv.posts[0].type) && srv.posts[0].method === 'POST', tag + ': text/plain の POST で送っていない');
    assert.deepStrictEqual(Object.keys(srv.posts[0].body).sort(), ['idToken', 'type']);
    assert.strictEqual(srv.posts[0].body.type, 'photos');
    await page.fill('#ps-req [name=name]', '後輩 一郎');
    await press(page, '#ps-req button[type=submit]', phone);
    await page.waitForSelector('#ps-req-status.is-done', { timeout: 5000 });
    assert.strictEqual(srv.posts[srv.posts.length - 1].body.type, 'request', tag + ': 申請を送っていない');
    assert.ok(!(await page.isVisible('#ps-board')));
    await shot(page, tag + '-not-member');

    // 成功
    srv.posts.length = 0;
    await signIn(page, 'ok', 'senpai@example.com');
    await page.waitForSelector('#ps-board', { state: 'visible', timeout: 5000 });
    assert.ok(!(await page.isVisible('#ps-req')) && !(await page.isVisible('#ps-login')), tag + ': ログインの表示が残っている');
    assert.ok((await page.textContent('#ps-user')).includes('senpai@example.com'), tag + ': ログイン中の表示がない');
    assert.deepStrictEqual(await sectionIds(page), ['py2003', 'py2004', 'py2005', 'py-unknown'], tag + ': 年度の並びがちがう');
    assert.strictEqual(await page.$$eval('.ps-thumb', (els) => els.length), VALID_N, tag + ': あやしい id を捨てていない');
    const dataIds = await page.$$eval('.ps-thumb', (els) => els.map((e) => e.dataset.id));
    assert.ok(dataIds.every((id) => ID_RE.test(id)), tag + ': あやしい id が入った');
    assert.strictEqual(new Set(dataIds).size, dataIds.length, tag + ': 同じ id が 2 つ');
    assert.strictEqual(await page.$$eval('#py2005 .ps-thumb', (els) => els.length), 31, tag + ': 年度の文字 "2005" を 2005 年度にしていない');
    assert.strictEqual(await page.$$eval('#py-unknown .ps-thumb', (els) => els.length), 21, tag + ': おかしな年度を年度不明にしていない');
    // 年度の中は撮影日の順。日付のないものはその年度の最後
    const order2004 = await page.$$eval('#py2004 .ps-thumb', (els) => els.map((e) => e.dataset.id));
    assert.strictEqual(order2004[order2004.length - 1], '1DeF_x-7', tag + ': 日付のない写真が年度の最後にない');
    const dates = order2004.slice(0, -1).map((id) => GOOD.find((p) => p.id === id).date);
    assert.deepStrictEqual(dates, dates.slice().sort(), tag + ': 撮影日の順になっていない');
    assert.ok((await page.textContent('#py2003-h')).includes('2003年度（平成15年度）40枚'), tag + ': 見出し');
    assert.strictEqual(await page.evaluate(() => [window.__xss, window.__xss3].filter(Boolean).length), 0, tag + ': スクリプトが動いた');

    // 一覧の写真：24 枚以下ずつ、画面の近くだけ、同時に 3 つまで
    await page.waitForTimeout(1500);
    let tp = thumbsPosts(srv, 400);
    assert.ok(tp.length >= 1, tag + ': 一覧の写真を頼んでいない');
    assert.ok(tp.every((p) => Array.isArray(p.body.ids) && p.body.ids.length >= 1 && p.body.ids.length <= 24), tag + ': 1 回に 24 枚より多く頼んだ: ' + tp.map((p) => p.body.ids.length));
    assert.ok(tp.every((p) => p.body.idToken === token('ok', 'senpai@example.com') && /^text\/plain/.test(p.type)), tag + ': ID トークンを送っていない');
    let asked = askedIds(srv);
    assert.ok(asked.has(dataIds[0]), tag + ': 最初の写真を頼んでいない');
    assert.ok(asked.size < VALID_N / 2, tag + ': 見えていない写真まで頼んだ（' + asked.size + ' 枚）');
    assert.ok(![...asked].some((id) => id.startsWith('1Zz') || id.startsWith('1GhI')), tag + ': 下のほうの年度まで頼んだ');
    assert.ok(![...asked].some((id) => !ID_RE.test(id)), tag + ': あやしい id を送った');
    assert.ok(srv.maxInflight <= 3, tag + ': 同時に送りすぎ: ' + srv.maxInflight);
    await waitLoaded(page, 6);
    assert.ok(await page.$eval('.ps-thumb[data-id="1AbC-3"]', (b) => b.classList.contains('is-fail')), tag + ': 返ってこなかった写真に印がない');
    assert.ok(await page.$eval('.ps-thumb[data-id="1AbC-4"]', (b) => b.classList.contains('is-fail') && !b.querySelector('img').getAttribute('src')), tag + ': data URL でないものを使った');
    assert.ok(await page.isVisible('#ps-retry'), tag + ': 読めなかったときの「もう一度」がない');
    // 「もう一度」→ 読めなかった 2 枚だけ頼みなおす
    const before = thumbsPosts(srv, 400).length;
    await press(page, '#ps-retry-btn', phone);
    await page.waitForTimeout(800);
    const again = thumbsPosts(srv, 400).slice(before).map((p) => p.body.ids.slice().sort().join(','));
    assert.deepStrictEqual(again, ['1AbC-3,1AbC-4'], tag + ': 頼みなおしがちがう: ' + again);
    assert.ok(await noOverflow(page), tag + ': 横にはみ出している');
    await shot(page, tag + '-live');

    // 下まで送ると、年度不明の写真も読む（同時に 3 つまで）
    srv.delay = 300;
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(2500);
    asked = askedIds(srv);
    assert.ok([...asked].some((id) => id.startsWith('1Zz')), tag + ': 下まで送っても年度不明の写真を頼まない');
    assert.ok(asked.size < VALID_N, tag + ': とばした所まで全部頼んだ（' + asked.size + ' 枚）');
    tp = thumbsPosts(srv, 400);
    assert.ok(tp.every((p) => p.body.ids.length <= 24));
    assert.ok(srv.maxInflight <= 3, tag + ': 同時に送りすぎ: ' + srv.maxInflight);
    srv.delay = 120;
    assert.ok(await page.isVisible('#ps-top'), tag + ': 上へもどるボタンがない');

    // 大きく見る：1600 で頼む。download:false なのでダウンロードはない
    const last = await page.$eval('#py-unknown li:last-child .ps-thumb', (b) => b.dataset.id);
    const lastN = Number(await page.$eval('#py-unknown li:last-child .ps-thumb', (b) => b.dataset.n));
    assert.strictEqual(lastN, VALID_N - 1);
    const bigBefore = thumbsPosts(srv, 1600).length;
    await press(page, '#py-unknown li:last-child .ps-thumb', phone);
    await page.waitForSelector('#ps-lb', { state: 'visible' });
    await page.waitForFunction(() => { const i = document.getElementById('ps-lb-img'); return !i.hidden && !i.classList.contains('is-preview'); }, null, { timeout: 5000 });
    const big = thumbsPosts(srv, 1600).slice(bigBefore);
    assert.strictEqual(big.length, 1, tag + ': 大きい写真の頼み方');
    assert.deepStrictEqual(big[0].body.ids, [last]);
    assert.ok((await page.getAttribute('#ps-lb-img', 'src')).includes('width%3D%221600%22'), tag + ': 1600 の写真になっていない');
    assert.strictEqual(await lbCount(page), VALID_N + ' / ' + VALID_N);
    assert.strictEqual(await page.textContent('#ps-lb-title'), '年度不明');
    assert.ok((await page.textContent('#ps-lb-info')).includes('撮影日不明'));
    assert.ok(await page.isDisabled('#ps-lb-next'), tag + ': 最後の写真で「次」が押せる');
    assert.ok(!(await page.isVisible('#ps-dl')), tag + ': download:false なのにダウンロードがある');
    const deter = await page.evaluate(() => {
      const img = document.getElementById('ps-lb-img');
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      img.dispatchEvent(ev);
      const cs = getComputedStyle(img);
      return { prevented: ev.defaultPrevented, drag: img.draggable, sel: cs.userSelect || cs.webkitUserSelect, nosave: document.getElementById('ps-board').classList.contains('is-nosave') };
    });
    assert.deepStrictEqual(deter, { prevented: true, drag: false, sel: 'none', nosave: true }, tag + ': 保存しにくくする工夫: ' + JSON.stringify(deter));
    assert.ok(await noOverflow(page), tag + ': 大きく見る画面で横にはみ出す');
    await shot(page, tag + '-live-lightbox');
    // 前へ（とちゅうを続けて押しても、とばした写真は頼まない）
    const b2 = thumbsPosts(srv, 1600).length;
    if (phone) { await swipe(page, 120, 0); await swipe(page, 120, 0); await swipe(page, 120, 0); }
    else { await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); }
    assert.strictEqual(await lbCount(page), (VALID_N - 3) + ' / ' + VALID_N);
    await page.waitForTimeout(700);
    assert.strictEqual(thumbsPosts(srv, 1600).length - b2, 1, tag + ': 続けて切りかえたとき、とばした写真まで頼んだ');
    if (phone) await page.tap('#ps-lb-close');
    else await page.keyboard.press('Escape');
    assert.ok(!(await page.isVisible('#ps-lb')));
    assert.strictEqual(await focusId(page), 'thumb-' + (VALID_N - 4), tag + ': 閉じたあとのフォーカス');

    assert.strictEqual(srv.posts.filter((p) => p.body.type === 'photo').length, 0, tag + ': ダウンロードしていないのにファイルを頼んだ');
    const kept = await nothingKept(page);
    assert.ok(!kept.includes('ey') && kept === '[[],[],""]', tag + ': ブラウザに何か保存している: ' + kept);
    assert.deepStrictEqual(dialogs, []);

    // ログアウト：写真が消える
    await press(page, '#ps-logout', phone);
    assert.ok(!(await page.isVisible('#ps-board')) && await page.isVisible('#ps-login'));
    assert.strictEqual(await page.$$eval('#ps-years .ps-thumb, #ps-years img', (els) => els.length), 0, tag + ': 写真が残っている');
    assert.ok((await page.textContent('#ps-status')).includes('ログアウトしました'));
    assert.deepStrictEqual(realErrors(errors), [], tag + ': エラーが出た');
    await ctx.close();
    console.log('ok: 本番の形・権限なし・一覧・大きく見る・ログアウト（' + tag + '）');
  }

  // ── 4. ダウンロードあり（download:true） ──
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'pc';
    const { page, ctx, errors, srv } = await openPage(browser, base, { phone, download: true, config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT } });
    await page.waitForSelector('#ps-gbtn .fake-gsi', { timeout: 5000 });
    await signIn(page, 'ok', 'senpai@example.com');
    await page.waitForSelector('#ps-board', { state: 'visible', timeout: 5000 });
    assert.ok(!(await page.$eval('#ps-board', (b) => b.classList.contains('is-nosave'))), tag + ': ダウンロードできるのに保存しにくくしている');
    await press(page, '.ps-thumb[data-n="0"]', phone);
    await page.waitForSelector('#ps-dl', { state: 'visible' });
    const id0 = await page.$eval('.ps-thumb[data-n="0"]', (b) => b.dataset.id);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), press(page, '#ps-dl', phone)]);
    assert.strictEqual(dl.suggestedFilename(), 'IMG_0001.JPG', tag + ': ファイルの名前');
    assert.ok(fs.readFileSync(await dl.path()).equals(FILE_BYTES(id0)), tag + ': 保存した中身がもとのファイルとちがう');
    const fp = srv.posts.filter((p) => p.body.type === 'photo');
    assert.strictEqual(fp.length, 1);
    assert.deepStrictEqual([fp[0].body.id, fp[0].body.idToken], [id0, token('ok', 'senpai@example.com')]);
    await page.waitForSelector('#ps-dl-status.is-done', { timeout: 5000 });
    assert.ok((await page.textContent('#ps-dl-status')).includes('IMG_0001.JPG'));
    await shot(page, tag + '-download');
    // 幹事がダウンロードを止めた（not_allowed）
    srv.photoError = 'not_allowed';
    await press(page, '#ps-dl', phone);
    await page.waitForSelector('#ps-dl-status.is-error', { timeout: 5000 });
    assert.ok((await page.textContent('#ps-dl-status')).includes('止めてあります'), tag + ': 止めたときの文');
    assert.ok(!(await page.isVisible('#ps-dl')), tag + ': 止めたあともボタンがある');
    assert.ok(await page.evaluate(() => document.getElementById('ps-lb').contains(document.activeElement)), tag + ': フォーカスが外に出た');
    await page.keyboard.press('ArrowRight');
    assert.ok(!(await page.isVisible('#ps-dl')), tag + ': 次の写真でボタンがもどった');
    assert.strictEqual(await nothingKept(page), '[[],[],""]');
    assert.deepStrictEqual(realErrors(errors), [], tag + ': エラーが出た');
    await ctx.close();
    console.log('ok: ダウンロード（' + tag + '）');
  }

  // ── 5. ログインが切れた（invalid_token） ──
  {
    // 一覧の写真で
    const { page, ctx, errors, srv } = await openPage(browser, base, { config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT } });
    await page.waitForSelector('#ps-gbtn .fake-gsi', { timeout: 5000 });
    srv.thumbsError = 'invalid_token';
    await signIn(page, 'ok', 'senpai@example.com');
    await page.waitForSelector('#ps-login', { state: 'visible', timeout: 5000 });
    assert.ok(!(await page.isVisible('#ps-board')), '期限切れなのに写真の一覧が残っている');
    assert.ok((await page.textContent('#ps-status')).includes('期限が切れました'), '期限切れの文: ' + await page.textContent('#ps-status'));
    assert.ok(await page.isVisible('#ps-gbtn .fake-gsi'), 'ログインしなおすボタンがない');
    assert.strictEqual(await page.$$eval('#ps-years .ps-thumb', (els) => els.length), 0);
    // もう一度ログイン → 見られる
    srv.thumbsError = '';
    await signIn(page, 'ok', 'senpai@example.com');
    await page.waitForSelector('#ps-board', { state: 'visible', timeout: 5000 });
    await waitLoaded(page, 6);
    // 大きい写真で
    await page.click('.ps-thumb[data-n="2"]');
    await page.waitForSelector('#ps-lb', { state: 'visible' });
    srv.thumbsError = 'invalid_token';
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector('#ps-login', { state: 'visible', timeout: 5000 });
    assert.ok(!(await page.isVisible('#ps-lb')), '期限切れなのに大きく見る画面が残っている');
    assert.strictEqual(await page.evaluate(() => [document.querySelector('.ob-main').inert, document.documentElement.classList.contains('ps-lock')]).then(String), 'false,false', 'うしろのページが操作できないまま');
    assert.ok((await page.textContent('#ps-status')).includes('期限が切れました'));
    await shot(page, 'expired');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: ログインが切れたとき（一覧・大きく見る）');
  }

  // ── 5b. 写真が 0 枚 ──
  {
    const { page, ctx, errors, srv } = await openPage(browser, base, { photos: [], config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT } });
    await page.waitForSelector('#ps-gbtn .fake-gsi', { timeout: 5000 });
    await signIn(page, 'ok', 'senpai@example.com');
    await page.waitForSelector('#ps-board', { state: 'visible', timeout: 5000 });
    assert.ok((await page.textContent('#ps-years')).includes('まだ写真はありません'));
    assert.ok(!(await page.isVisible('.ps-bar')));
    await page.waitForTimeout(300);
    assert.strictEqual(thumbsPosts(srv).length, 0);
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: 写真が 0 枚のとき');
  }

  // ── 6. 動きをへらす設定・幅 360 ──
  {
    const { page, ctx, errors } = await openPage(browser, base, { phone: true, width: 360, reduced: true });
    const anim = await page.$eval('.ps-thumb', (b) => getComputedStyle(b, '::after').animationName);
    assert.strictEqual(anim, 'none', '動きをへらす設定でも点滅する');
    assert.ok(await noOverflow(page), '幅 360 で横にはみ出す');
    await page.tap('.ps-thumb[data-n="0"]');
    await page.waitForSelector('#ps-lb', { state: 'visible' });
    assert.ok(await noOverflow(page), '幅 360 の大きく見る画面で横にはみ出す');
    await shot(page, 'p360-lightbox');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: 動きをへらす設定・幅 360');
  }
}).then(() => {
  console.log('shashin: すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
