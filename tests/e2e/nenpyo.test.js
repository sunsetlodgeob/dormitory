/*
 * 年表（nenpyo/）の確認
 *   node tests/e2e/nenpyo.test.js
 *  1. デモ（GAS_URL が空）：ログインなしでサンプルの事件。タグ・さがす・年度へとぶ（1b はキーボードだけで）
 *  2. GAS_URL はあるがクライアント ID が空：準備中の表示
 *  3. 本番の形：Google のログイン（にせもの）→ 権限なし・期限切れ・準備中・通信失敗・成功・ログアウト（3b は事件が 0 件）
 *  4. Google のログインが読み込めないとき
 * Google のスクリプト（gsi/client）と Apps Script の返事は、にせものに差しかえる。
 * 環境変数 NENPYO_SHOTS にフォルダを指定すると、途中の画面を保存する。
 */
const assert = require('assert');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.NENPYO_PORT) || 8804; // ARCH.md の割り当て（確認役が別のポートで動かすときは NENPYO_PORT）
const SHOTS = process.env.NENPYO_SHOTS || '';
const GAS = 'https://script.google.com/macros/s/TEST/exec';
const GSI = 'https://accounts.google.com/gsi/client';
const CLIENT = '1234-test.apps.googleusercontent.com';
const FORM = 'https://forms.gle/timeline-example';
const XSS = '<img src=x onerror="window.__xss=1">';

// にせものの Google ログイン。ボタンの代わりに印を描き、callback はテストから呼ぶ
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
// にせものの ID トークン。k で Apps Script（にせもの）の返事を決める
const token = (k, email) => b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ email, k, name: 'テスト' }) + '.sig';

const LIVE_EVENTS = [
  { id: 'e1', year: 2003, month: 4, title: XSS, body: '一行目\n二行目<script>window.__xss2=1</script>', tags: ['新歓', '<i>tag</i>'] },
  { id: 'e2', year: 2003, month: 1, title: '1月の事件', body: '', tags: [] },
  { id: 'e3', year: '2003', month: null, title: '時期のわからない事件', body: 'なにか起きた。', tags: 'コール、新歓' },
  { id: 'e4', year: null, month: null, title: '年度のわからない事件', body: 'だれも覚えていない。', tags: [] },
  { id: 'e5', year: 1998, month: 13, title: '月がおかしい事件', body: '13月はない。', tags: ['新歓'] },
];

async function shot(page, name, full) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOTS, 'nenpyo-' + name + '.png'), fullPage: !!full });
}

async function openPage(browser, base, o = {}) {
  const ctx = await browser.newContext(o.phone
    ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1280, height: 800 } });
  if (o.config) {
    await ctx.route('**/js/site/config.js', (r) => r.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8',
      body: 'window.OB_CONFIG = ' + JSON.stringify(Object.assign({
        GAS_URL: '', GOOGLE_CLIENT_ID: '', ALBUM_URL: '', FORM_TIMELINE_URL: '', FORM_MEMBER_URL: '', CONTACT_EMAIL: '',
      }, o.config)) + ';',
    }));
  }
  const gsiAsked = [];
  await ctx.route(GSI, (r) => {
    gsiAsked.push(r.request().url());
    if (o.gsi === 'fail') return r.abort();
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: GSI_STUB });
  });
  const posts = [];
  await ctx.route('https://script.google.com/**', (r) => {
    const req = r.request();
    let d = {};
    try { d = JSON.parse(req.postData() || '{}'); } catch (e) { /* なにもしない */ }
    posts.push({ method: req.method(), type: req.headers()['content-type'] || '', body: d });
    const k = d.idToken ? JSON.parse(Buffer.from(String(d.idToken).split('.')[1], 'base64url').toString()).k : '';
    const json = (obj) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(obj) });
    if (k === 'ok') return json({ ok: true, events: o.events || LIVE_EVENTS });
    if (k === 'http500') return r.fulfill({ status: 500, body: 'error', headers: { 'Access-Control-Allow-Origin': '*' } });
    if (k === 'abort') return r.abort();
    return json({ ok: false, error: k || 'invalid_token' });
  });
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.goto(base + 'nenpyo/' + (o.hash || ''));
  await page.waitForTimeout(o.wait != null ? o.wait : 500);
  return { page, ctx, errors, dialogs, posts, gsiAsked };
}

const cardTitles = (page) => page.$$eval('#np-timeline .np-ev-title', (els) => els.map((e) => e.textContent));
const yearIds = (page) => page.$$eval('#np-timeline .np-year', (els) => els.map((e) => e.id));
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const statusText = (page) => page.textContent('#np-status');
async function press(page, sel, phone) {
  if (phone) await page.tap(sel);
  else await page.click(sel);
}
async function signIn(page, k, email) {
  await page.evaluate((c) => window.__gsi.opts.callback({ credential: c }), token(k, email));
  await page.waitForFunction(() => !document.getElementById('np-status').classList.contains('is-busy'), null, { timeout: 5000 });
  await page.waitForTimeout(100);
}

withSite(PORT, async ({ browser, base }) => {
  // ── 1. デモ（パソコン・スマホ） ──
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'pc';
    const { page, ctx, errors, dialogs, gsiAsked } = await openPage(browser, base, { phone });
    const sample = await page.evaluate(() => window.OB.SAMPLE.events);
    assert.ok(await page.isVisible('#np-demo'), tag + ': デモの注記が出ていない');
    assert.ok((await page.textContent('#np-demo')).includes('デモ表示です（サンプルの事件）。本番では Google でログインした寮生だけが見られます。'));
    assert.ok(!(await page.isVisible('#np-login')) && !(await page.isVisible('#np-setup')), tag + ': デモなのにログインが出ている');
    assert.ok(!(await page.isVisible('#np-user')), tag + ': デモなのにログアウトが出ている');
    assert.strictEqual(gsiAsked.length, 0, tag + ': デモなのに Google のスクリプトを読んだ');
    assert.ok(await page.isVisible('#np-board'));
    assert.strictEqual((await cardTitles(page)).length, sample.length, tag + ': 事件の数がちがう');
    const ys = [...new Set(sample.filter((e) => e.year != null).map((e) => e.year))].sort().map((y) => 'ny' + y);
    assert.deepStrictEqual(await yearIds(page), ys.concat('ny-unknown'), tag + ': 年度の並びがちがう（不明は最後）');
    assert.strictEqual(await page.$$eval('.np-month.is-unknown', (els) => els.length), sample.filter((e) => e.month == null).length, tag + ': 時期不明の印がちがう');
    assert.ok((await page.textContent('#ny2000 .np-month')).includes('4'), tag + ': 月の印がない');
    assert.ok((await page.textContent('#np-count')).includes('全 ' + sample.length + '件'));
    assert.ok(!(await page.isVisible('#np-post')), tag + ': フォームが空なのに投稿ボタンが出ている');
    assert.ok(await page.isVisible('footer.ob-footer') && (await page.textContent('footer')).includes('フィクション'), tag + ': 注記がない');
    assert.ok(await page.isVisible('a.ob-back[href="../"]'));
    // 読み上げでの名前に ✕ や ▶ の文字がまざらない
    assert.strictEqual(await page.getByRole('searchbox', { name: 'ことばでさがす', exact: true }).count(), 1, tag + ': さがす欄の名前がおかしい');
    assert.strictEqual(await page.getByRole('button', { name: 'すべて 7', exact: true, pressed: true }).count(), 1, tag + ': 選んでいるタグの名前がおかしい');
    assert.ok(await noOverflow(page), tag + ': 横にはみ出している');
    await shot(page, tag + '-demo');
    await shot(page, tag + '-demo-full', true);

    // タグでしぼる（上のチップ）→ もう一度押すと元にもどる
    await press(page, '#np-tags .np-chip[data-tag="新歓"]', phone);
    assert.deepStrictEqual(await cardTitles(page), sample.filter((e) => e.tags.includes('新歓')).map((e) => e.title), tag + ': タグでしぼれない');
    assert.strictEqual(await page.getAttribute('#np-tags .np-chip[data-tag="新歓"]', 'aria-pressed'), 'true');
    assert.ok((await page.textContent('#np-count')).includes('のうち 1件'), tag + ': しぼった数が出ていない');
    await press(page, '#np-tags .np-chip[data-tag="新歓"]', phone);
    assert.strictEqual((await cardTitles(page)).length, sample.length, tag + ': タグを外しても元にもどらない');

    // カードのタグを押してもしぼれる
    await press(page, '#np-timeline .np-chip[data-tag="学祭"]', phone);
    assert.deepStrictEqual(await cardTitles(page), ['学祭で模擬店'], tag + ': カードのタグでしぼれない');
    assert.strictEqual(await page.getAttribute('#np-tags .np-chip[data-tag="学祭"]', 'aria-pressed'), 'true');
    await press(page, '#np-tags .np-chip[data-tag=""]', phone);
    assert.strictEqual((await cardTitles(page)).length, sample.length);

    // ことばでさがす（見つかった所に印）
    await page.fill('#np-q', '焼きそば');
    assert.deepStrictEqual(await cardTitles(page), ['学祭で模擬店'], tag + ': 本文でさがせない');
    assert.strictEqual(await page.textContent('#np-timeline mark'), '焼きそば', tag + ': 見つかった所に印がない');
    await page.fill('#np-q', 'ｂｂｑ');
    assert.deepStrictEqual(await cardTitles(page), ['屋上でBBQ'], tag + ': 全角・小文字でさがせない');
    // タグとことばを両方 → 当てはまらない → しぼりこみをやめる
    await page.fill('#np-q', '焼きそば');
    await press(page, '#np-tags .np-chip[data-tag="新歓"]', phone);
    assert.ok(await page.isVisible('#np-empty'), tag + ': 当てはまらないときの表示がない');
    const empty = await page.textContent('#np-empty-text');
    assert.ok(empty.includes('焼きそば') && empty.includes('新歓'), tag + ': 当てはまらない理由が出ていない: ' + empty);
    await shot(page, tag + '-empty');
    await press(page, '#np-reset', phone);
    assert.strictEqual((await cardTitles(page)).length, sample.length);
    assert.strictEqual(await page.inputValue('#np-q'), '');

    // 年度へとぶ
    await page.selectOption('#np-year', 'ny2006');
    await page.waitForTimeout(1200);
    const top = await page.evaluate(() => document.getElementById('ny2006').getBoundingClientRect().top);
    assert.ok(top >= 0 && top < 120, tag + ': 年度へとべない: ' + top);
    assert.strictEqual(await page.inputValue('#np-year'), '');
    await shot(page, tag + '-jump');
    assert.deepStrictEqual(realErrors(errors), [], tag + ': エラーが出た');
    assert.deepStrictEqual(dialogs, []);
    await ctx.close();
    console.log('ok: デモ（' + tag + '）');
  }

  // ── 1b. キーボードだけで：タグを押してもフォーカスが消えない・年度へ ↓ で順に進める ──
  {
    const { page, ctx, errors } = await openPage(browser, base, {});
    const focused = () => page.evaluate(() => {
      const a = document.activeElement;
      return { tag: a.dataset ? a.dataset.tag : undefined, card: a.closest('.np-ev') ? a.closest('.np-ev').id : '', pressed: a.getAttribute('aria-pressed') };
    });
    await page.focus('#np-tags .np-chip[data-tag="節分"]');
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await focused(), { tag: '節分', card: '', pressed: 'true' }, '上のタグを押すとフォーカスが消える');
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await focused(), { tag: '節分', card: '', pressed: 'false' }, 'もう一度押してもフォーカスが残らない');
    await page.focus('#np-timeline .np-chip[data-tag="学祭"]');
    const card = (await focused()).card;
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await focused(), { tag: '学祭', card, pressed: 'true' }, 'カードのタグを押すとフォーカスが消える');
    await page.keyboard.press('Enter');
    assert.strictEqual((await cardTitles(page)).length, 7);
    // しぼりこみをやめると、さがす欄にもどる
    await page.fill('#np-q', 'zzzz');
    await page.focus('#np-reset');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'np-q', 'しぼりこみをやめたあと、フォーカスが消える');

    await page.focus('#np-year');
    const tops = [];
    for (const id of ['ny2000', 'ny2001', 'ny2003']) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(900);
      tops.push(await page.evaluate((i) => Math.round(document.getElementById(i).getBoundingClientRect().top), id));
    }
    assert.ok(tops.every((t) => t >= 0 && t < 120), '↓ で順に年度へ進めない: ' + tops);
    await page.keyboard.press('Tab');
    assert.strictEqual(await page.inputValue('#np-year'), '', 'フォーカスが外れても年度の選択がもどらない');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: キーボードだけで（タグ・年度へとぶ）');
  }

  // ── 2. GAS_URL はあるが、クライアント ID が空 → 準備中 ──
  {
    const { page, ctx, errors, gsiAsked, posts } = await openPage(browser, base, { config: { GAS_URL: GAS } });
    assert.ok(await page.isVisible('#np-setup'), '準備中の表示がない');
    assert.ok((await page.textContent('#np-setup')).includes('GOOGLE_CLIENT_ID'));
    assert.ok(!(await page.isVisible('#np-login')) && !(await page.isVisible('#np-board')) && !(await page.isVisible('#np-demo')));
    assert.strictEqual(gsiAsked.length + posts.length, 0, '準備中なのに読みに行った');
    await shot(page, 'setup');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: クライアント ID が空のときは準備中');
  }

  // ── 3. 本番の形：ログイン（パソコン・スマホ） ──
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'pc';
    const { page, ctx, errors, dialogs, posts, gsiAsked } = await openPage(browser, base, {
      phone, config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT, FORM_TIMELINE_URL: FORM },
    });
    await page.waitForSelector('#np-gbtn .fake-gsi', { timeout: 5000 });
    assert.strictEqual(gsiAsked.length, 1, tag + ': Google のスクリプトを読んでいない');
    assert.ok(await page.isVisible('#np-login'), tag + ': ログインの表示がない');
    assert.ok((await page.textContent('#np-login')).includes('見る権限のある寮生だけ'));
    assert.ok(!(await page.isVisible('#np-board')) && !(await page.isVisible('#np-demo')), tag + ': ログイン前に年表が出ている');
    const opts = await page.evaluate(() => ({ id: window.__gsi.opts.client_id, cb: typeof window.__gsi.opts.callback, btn: window.__gsi.btn }));
    assert.strictEqual(opts.id, CLIENT, tag + ': クライアント ID が渡っていない');
    assert.strictEqual(opts.cb, 'function');
    assert.ok(opts.btn && opts.btn.width >= 200 && opts.btn.width <= 400, tag + ': ボタンの幅がおかしい');
    assert.strictEqual(await page.$$eval('#np-timeline .np-ev', (els) => els.length), 0);
    assert.ok(await noOverflow(page), tag + ': 横にはみ出している');
    await shot(page, tag + '-login');

    // 権限なし
    await signIn(page, 'not_member', 'kouhai@example.com');
    let st = await statusText(page);
    assert.ok(st.includes('このアカウントには見る権限がありません。幹事に連絡して、スプレッドシートを共有してもらってください。'), tag + ': 権限なしの文がちがう: ' + st);
    assert.ok(st.includes('kouhai@example.com'), tag + ': ためしたアカウントが出ていない');
    assert.ok(!(await page.isVisible('#np-board')), tag + ': 権限がないのに年表が出た');
    assert.strictEqual(await page.evaluate(() => window.__gsi.disabled), 1, tag + ': 自動ログインを止めていない');
    assert.ok(await page.isVisible('#np-gbtn .fake-gsi'), tag + ': ログインしなおすボタンがない');
    assert.strictEqual(posts.length, 1);
    assert.strictEqual(posts[0].method, 'POST');
    assert.ok(/^text\/plain/.test(posts[0].type), tag + ': text/plain で送っていない');
    assert.strictEqual(posts[0].body.type, 'timeline');
    await shot(page, tag + '-not-member');

    // ログインの期限切れ
    await signIn(page, 'invalid_token', 'senpai@example.com');
    st = await statusText(page);
    assert.ok(st.includes('もう一度ログインしてください'), tag + ': 期限切れの文がない: ' + st);
    // Apps Script の設定がまだ
    await signIn(page, 'not_configured', 'senpai@example.com');
    assert.ok((await statusText(page)).includes('準備がまだ'), tag + ': 準備中の文がない');
    // 知らない失敗
    await signIn(page, 'something_else', 'senpai@example.com');
    assert.ok((await statusText(page)).includes('うまく読み込めませんでした'), tag + ': 知らない失敗の文がない');
    // 通信の失敗（500・つながらない）
    await signIn(page, 'http500', 'senpai@example.com');
    assert.ok((await statusText(page)).includes('通信に失敗しました'), tag + ': 通信失敗（500）の文がない');
    await signIn(page, 'abort', 'senpai@example.com');
    assert.ok((await statusText(page)).includes('通信に失敗しました'), tag + ': 通信失敗の文がない');
    assert.ok(!(await page.isVisible('#np-board')));

    // 成功 → 年表が出る。データの HTML は文字のまま
    await signIn(page, 'ok', 'senpai@example.com');
    await page.waitForSelector('#np-board', { state: 'visible', timeout: 5000 });
    const last = posts[posts.length - 1];
    assert.strictEqual(last.body.idToken, token('ok', 'senpai@example.com'), tag + ': ID トークンを送っていない');
    assert.ok(!(await page.isVisible('#np-login')), tag + ': ログインの表示が残っている');
    assert.ok(!(await page.isVisible('#np-status')));
    assert.ok((await page.textContent('#np-user')).includes('senpai@example.com'), tag + ': ログイン中の表示がない');
    assert.deepStrictEqual(await yearIds(page), ['ny1998', 'ny2003', 'ny-unknown'], tag + ': 年度の並びがちがう');
    assert.deepStrictEqual(await cardTitles(page), ['月がおかしい事件', XSS, '1月の事件', '時期のわからない事件', '年度のわからない事件'],
      tag + ': 年度の中の並び（4月→3月→時期不明）がちがう');
    assert.strictEqual(await page.$$eval('#np-timeline img, #np-timeline i, #np-timeline script, #np-tags i', (els) => els.length), 0, tag + ': データの HTML が効いてしまった');
    const body = await page.$eval('#np-e0 .np-ev-body', (e) => ({ text: e.textContent, ws: getComputedStyle(e).whiteSpace }));
    assert.ok(body.text.startsWith('一行目\n二行目<script>'), tag + ': 本文の改行・文字がちがう');
    assert.strictEqual(body.ws, 'pre-wrap', tag + ': 改行が残らない');
    const box = await page.$eval('#np-e0 .np-ev-body', (e) => e.getBoundingClientRect().height);
    assert.ok(box > 40, tag + ': 本文が 2 行になっていない');
    assert.ok(await page.isVisible('#np-tags .np-chip[data-tag="<i>tag</i>"]'), tag + ': タグの HTML が文字になっていない');
    assert.strictEqual(await page.$eval('#np-tags .np-chip:nth-child(2)', (e) => e.dataset.tag), '新歓', tag + ': タグが多い順になっていない');
    assert.strictEqual(await page.$$eval('.np-month.is-unknown', (els) => els.length), 3, tag + ': 時期不明の数がちがう（13月も不明）');
    assert.strictEqual(await page.evaluate(() => [window.__xss, window.__xss2]).then((a) => a.filter(Boolean).length), 0, tag + ': スクリプトが動いた');
    assert.deepStrictEqual(dialogs, []);
    assert.ok(await page.isVisible('#np-post'), tag + ': 投稿ボタンがない');
    assert.strictEqual(await page.getAttribute('#np-post', 'href'), FORM);
    assert.ok((await page.textContent('#np-post')).includes('事件を投稿する'));
    assert.strictEqual(await page.getAttribute('#np-post2', 'href'), FORM);
    // トークンを保存していない
    const kept = await page.evaluate(() => JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage), document.cookie]));
    assert.ok(!kept.includes('ey') && kept === '[[],[],""]', tag + ': ブラウザに何か保存している: ' + kept);
    assert.ok(await noOverflow(page), tag + ': 横にはみ出している');
    await shot(page, tag + '-live');
    await shot(page, tag + '-live-full', true);

    // ログアウト
    const disabled = await page.evaluate(() => window.__gsi.disabled);
    await press(page, '#np-logout', phone);
    assert.ok(!(await page.isVisible('#np-board')), tag + ': ログアウトしても年表が出ている');
    assert.strictEqual(await page.$$eval('#np-timeline .np-ev, #np-tags .np-chip', (els) => els.length), 0, tag + ': 年表の中身が残っている');
    assert.ok(await page.isVisible('#np-login'));
    assert.ok(await page.isVisible('#np-gbtn .fake-gsi'), tag + ': ログアウト後にログインボタンがない');
    assert.strictEqual(await page.evaluate(() => window.__gsi.disabled), disabled + 1, tag + ': ログアウトで自動ログインを止めていない');
    assert.ok((await statusText(page)).includes('ログアウトしました'));
    assert.ok(!(await page.evaluate(() => document.body.innerText)).includes('月がおかしい事件'), tag + ': 事件の文字が残っている');
    await shot(page, tag + '-logout');
    // 500・つながらないときにブラウザが console に出す読み込み失敗は除く
    assert.deepStrictEqual(realErrors(errors).filter((e) => !/status of 500/.test(e)), [], tag + ': エラーが出た');
    await ctx.close();
    console.log('ok: 本番の形・ログインからログアウトまで（' + tag + '）');
  }

  // ── 3b. 見る権限はあるが、事件がまだ 0 件 ──
  {
    const { page, ctx, errors } = await openPage(browser, base, { events: [], config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT } });
    await page.waitForSelector('#np-gbtn .fake-gsi', { timeout: 5000 });
    await signIn(page, 'ok', 'senpai@example.com');
    await page.waitForSelector('#np-board', { state: 'visible', timeout: 5000 });
    assert.ok((await page.textContent('#np-timeline')).includes('まだ年表に載っている事件はありません'), '0 件のときの文がない');
    assert.strictEqual(await page.textContent('#np-count'), '全 0件');
    assert.ok(await page.isDisabled('#np-q') && await page.isDisabled('#np-year'), '0 件なのにさがせる');
    assert.ok(!(await page.isVisible('.np-tagbox')) && !(await page.isVisible('#np-empty')));
    assert.strictEqual(await page.$eval('#np-timeline', (e) => getComputedStyle(e, '::before').content), 'none', '0 件なのに点線の道が出ている');
    await shot(page, 'zero');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: 事件が 0 件のとき');
  }

  // ── 4. Google のログインが読み込めない ──
  {
    const { page, ctx, errors } = await openPage(browser, base, { gsi: 'fail', config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT } });
    await page.waitForSelector('#np-reload', { state: 'visible', timeout: 5000 });
    assert.ok((await statusText(page)).includes('Google のログインを読み込めませんでした'), 'Google が読めないときの文がない');
    assert.ok(!(await page.isVisible('#np-gbtn')), '空のログインボタンの場所が残っている');
    assert.ok(!(await page.isVisible('#np-board')));
    await shot(page, 'gsi-fail');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: Google のログインが読み込めないとき');
  }
}).then(() => {
  console.log('nenpyo: すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
