/*
 * D-1選手権（d1/）の確認
 *   node tests/e2e/d1.test.js
 *  1. デモ（GAS_URL が空）：ログインなしでサンプルの記録。説明の文・年度の並び・優勝・準優勝・裏方・補足
 *  2. GAS_URL はあるがクライアント ID が空：準備中の表示
 *  3. 本番の形：Google のログイン（にせもの）→ 権限なし・準備中・成功（HTML は文字のまま）・キーボードでログアウト
 *  4. 見る権限はあるが、記録が来ない（Apps Script が d1 を返さない）
 * Google のスクリプト（gsi/client）と Apps Script の返事は、にせものに差しかえる（tests/e2e/nenpyo.test.js と同じ）。
 * 環境変数 D1_SHOTS にフォルダを指定すると、途中の画面を保存する。
 */
const assert = require('assert');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8807; // ARCH.md の割り当て
const SHOTS = process.env.D1_SHOTS || '';
const GAS = 'https://script.google.com/macros/s/TEST/exec';
const GSI = 'https://accounts.google.com/gsi/client';
const CLIENT = '1234-test.apps.googleusercontent.com';
const XSS = '<img src=x onerror="window.__xss=1">';
const MOTTO = '童貞の、童貞による、童貞のための闘い。その先に得られるのは富か、名誉か、それとも・・・。';

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

const LIVE_D1 = [
  { year: 2006, winner: ['港 一郎'], second: ['港 二郎'], members: ['港 一郎', '港 二郎', '港 三郎'], host: '港 四郎', referee: '港 五郎', kuroko: '港 六郎', note: '一行目\n二行目<script>window.__xss2=1</script>' },
  { year: null, winner: [], second: [], members: [], host: '', referee: '', kuroko: '', note: '年度がわからない' },
  { year: '2004', winner: [XSS], second: [], members: 'みなと 一、みなと 二', host: '<b>主催</b>', referee: '', kuroko: '', note: '' },
];

async function shot(page, name, full) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOTS, 'd1-' + name + '.png'), fullPage: !!full });
}

async function openPage(browser, base, o = {}) {
  const ctx = await browser.newContext(o.phone
    ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1280, height: 800 } });
  if (o.config) {
    await ctx.route('**/js/site/config.js', (r) => r.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8',
      body: 'window.OB_CONFIG = ' + JSON.stringify(Object.assign({
        GAS_URL: '', GOOGLE_CLIENT_ID: '', ALBUM_URL: '', CONTACT_EMAIL: '',
      }, o.config)) + ';',
    }));
  }
  const gsiAsked = [];
  await ctx.route(GSI, (r) => {
    gsiAsked.push(r.request().url());
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
    if (k === 'ok') return json(o.noD1 ? { ok: true, events: [] } : { ok: true, events: [], d1: LIVE_D1 });
    return json({ ok: false, error: k || 'invalid_token' });
  });
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.goto(base + 'd1/');
  await page.waitForTimeout(500);
  return { page, ctx, errors, dialogs, posts, gsiAsked };
}

const yearIds = (page) => page.$$eval('#d1-list .d1-year', (els) => els.map((e) => e.id));
const heads = (page) => page.$$eval('#d1-list .d1-name', (els) => els.map((e) => e.textContent));
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const statusText = (page) => page.textContent('#d1-status');
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());
async function signIn(page, k, email) {
  await page.evaluate((c) => window.__gsi.opts.callback({ credential: c }), token(k, email));
  await page.waitForFunction(() => !document.getElementById('d1-status').classList.contains('is-busy'), null, { timeout: 5000 });
  await page.waitForTimeout(100);
}

withSite(PORT, async ({ browser, base }) => {
  // ── 1. デモ（パソコン・スマホ） ──
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'pc';
    const { page, ctx, errors, dialogs, gsiAsked } = await openPage(browser, base, { phone });
    const sample = await page.evaluate(() => window.OB.SAMPLE.d1);
    assert.ok(sample.length >= 4, tag + ': サンプルの記録が少ない');
    assert.ok(await page.isVisible('#d1-demo'), tag + ': デモの注記が出ていない');
    assert.ok((await page.textContent('#d1-demo')).includes('本番では Google でログインした寮生だけが見られます'));
    assert.strictEqual(await page.textContent('#d1-motto'), MOTTO, tag + ': 説明の文が持ち主の言葉のままでない');
    assert.ok(!(await page.isVisible('#d1-login')) && !(await page.isVisible('#d1-setup')), tag + ': デモなのにログインが出ている');
    assert.ok(!(await page.isVisible('#d1-user')), tag + ': デモなのにログアウトが出ている');
    assert.strictEqual(gsiAsked.length, 0, tag + ': デモなのに Google のスクリプトを読んだ');
    assert.ok(await page.isVisible('#d1-board'));
    // 古い年度から
    const years = sample.map((r) => r.year).sort((a, b) => a - b);
    assert.deepStrictEqual(await heads(page), years.map((y) => 'D-1-' + y), tag + ': 年度の並びがちがう');
    assert.deepStrictEqual(await yearIds(page), years.map((y) => 'd1-y' + y));
    const first = sample.find((r) => r.year === years[0]);
    const id = '#d1-y' + first.year;
    assert.ok((await text(page, id + ' .d1-era')).includes('平成' + (first.year - 1988) + '年度'), tag + ': 和暦がない');
    assert.strictEqual(await text(page, id + ' .d1-winner'), first.winner.join('、'), tag + ': 優勝がちがう');
    assert.strictEqual(await text(page, id + ' .d1-second'), first.second.join('、'), tag + ': 準優勝がちがう');
    assert.strictEqual(await text(page, id + ' .d1-members'), first.members.join('、'), tag + ': 出場メンバーがちがう');
    assert.ok((await text(page, id + ' .is-members dt')).includes(first.members.length + '人'), tag + ': 出場の人数がない');
    for (const k of ['host', 'referee', 'kuroko']) assert.strictEqual(await text(page, id + ' .d1-' + k), first[k], tag + ': ' + k);
    const labels = await page.$$eval(id + ' dt', (els) => els.map((e) => e.firstChild.textContent.trim()));
    assert.deepStrictEqual(labels, ['優勝', '準優勝', '出場メンバー', '主催者', 'レフェリー', '黒子'], tag + ': 項目の名前がちがう');
    if (first.note) assert.strictEqual(await text(page, id + ' .d1-note-text'), first.note, tag + ': 補足がちがう');
    // 優勝が 2 人・優勝なし・空の欄は出さない
    const two = sample.find((r) => r.winner.length > 1);
    if (two) assert.strictEqual(await text(page, '#d1-y' + two.year + ' .d1-winner'), two.winner.join('、'), tag + ': 優勝 2 人');
    const none = sample.find((r) => !r.winner.length);
    if (none) {
      assert.strictEqual(await text(page, '#d1-y' + none.year + ' .d1-winner'), '記録なし', tag + ': 優勝なしの表示');
      assert.strictEqual(await page.$$eval('#d1-y' + none.year + ' .d1-second, #d1-y' + none.year + ' .d1-kuroko', (e) => e.length), 0, tag + ': 空の欄が出ている');
    }
    assert.strictEqual(await page.$$eval('.d1-badge.is-gold', (els) => els.length), sample.length, tag + ': 優勝の印の数');
    assert.ok((await page.textContent('#d1-count')).includes('全 ' + sample.length + '回'), tag + ': 回数がない');
    assert.ok(await page.isVisible('footer.ob-footer') && (await page.textContent('footer')).includes('フィクション'), tag + ': 注記がない');
    assert.ok(await page.isVisible('a.ob-back[href="../"]'));
    assert.ok(await noOverflow(page), tag + ': 横にはみ出している');
    await shot(page, tag + '-demo', true);
    assert.deepStrictEqual(realErrors(errors), [], tag + ': エラーが出た');
    assert.deepStrictEqual(dialogs, []);
    await ctx.close();
    console.log('ok: デモ（' + tag + '）');
  }

  // ── 2. GAS_URL はあるが、クライアント ID が空 → 準備中 ──
  {
    const { page, ctx, errors, gsiAsked, posts } = await openPage(browser, base, { config: { GAS_URL: GAS } });
    assert.ok(await page.isVisible('#d1-setup'), '準備中の表示がない');
    assert.ok((await page.textContent('#d1-setup')).includes('GOOGLE_CLIENT_ID'));
    assert.ok(!(await page.isVisible('#d1-login')) && !(await page.isVisible('#d1-board')) && !(await page.isVisible('#d1-demo')));
    assert.strictEqual(gsiAsked.length + posts.length, 0, '準備中なのに読みに行った');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: クライアント ID が空のときは準備中');
  }

  // ── 3. 本番の形：ログイン（パソコン・スマホ） ──
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'pc';
    const { page, ctx, errors, dialogs, posts, gsiAsked } = await openPage(browser, base, {
      phone, config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT },
    });
    await page.waitForSelector('#d1-gbtn .fake-gsi', { timeout: 5000 });
    assert.strictEqual(gsiAsked.length, 1, tag + ': Google のスクリプトを読んでいない');
    assert.ok((await page.textContent('#d1-login')).includes('D-1選手権の記録は、見る権限のある寮生だけが見られます'), tag + ': ログインの文');
    assert.ok(await page.isVisible('#d1-motto'), tag + ': ログイン前にも説明の文は出す');
    assert.ok(!(await page.isVisible('#d1-board')) && !(await page.isVisible('#d1-demo')), tag + ': ログイン前に記録が出ている');
    assert.strictEqual(await page.$$eval('#d1-list .d1-year', (els) => els.length), 0);
    assert.strictEqual(await page.evaluate(() => window.__gsi.opts.client_id), CLIENT);
    assert.ok(await noOverflow(page), tag + ': 横にはみ出している');
    await shot(page, tag + '-login');

    // 権限なし
    await signIn(page, 'not_member', 'kouhai@example.com');
    let st = await statusText(page);
    assert.ok(st.includes('このアカウントには見る権限がありません'), tag + ': 権限なしの文がちがう: ' + st);
    assert.ok(st.includes('kouhai@example.com'), tag + ': ためしたアカウントが出ていない');
    assert.ok(!(await page.isVisible('#d1-board')), tag + ': 権限がないのに記録が出た');
    assert.strictEqual(await page.evaluate(() => window.__gsi.disabled), 1, tag + ': 自動ログインを止めていない');
    assert.strictEqual(posts.length, 1);
    assert.ok(/^text\/plain/.test(posts[0].type), tag + ': text/plain で送っていない');
    assert.strictEqual(posts[0].body.type, 'timeline', tag + ': 年表といっしょに読む');
    // Apps Script の設定がまだ
    await signIn(page, 'not_configured', 'senpai@example.com');
    st = await statusText(page);
    assert.ok(st.includes('D-1選手権の準備がまだ'), tag + ': 準備中の文がない: ' + st);

    // 成功 → 記録が出る。データの HTML は文字のまま
    await signIn(page, 'ok', 'senpai@example.com');
    await page.waitForSelector('#d1-board', { state: 'visible', timeout: 5000 });
    assert.ok(!(await page.isVisible('#d1-login')) && !(await page.isVisible('#d1-status')), tag + ': ログインの表示が残っている');
    assert.ok((await page.textContent('#d1-user')).includes('senpai@example.com'), tag + ': ログイン中の表示がない');
    assert.deepStrictEqual(await heads(page), ['D-1-2004', 'D-1-2006', 'D-1（年度不明）'], tag + ': 年度の並び（不明は最後）');
    assert.deepStrictEqual(await yearIds(page), ['d1-y2004', 'd1-y2006', 'd1-y-unknown']);
    assert.strictEqual(await text(page, '#d1-y2004 .d1-winner'), XSS, tag + ': 名前の HTML が文字になっていない');
    assert.strictEqual(await text(page, '#d1-y2004 .d1-host'), '<b>主催</b>');
    assert.strictEqual(await text(page, '#d1-y2004 .d1-members'), 'みなと 一、みなと 二', tag + ': 文字で来たメンバーを分けられない');
    assert.strictEqual(await page.$$eval('#d1-list img, #d1-list b, #d1-list script', (els) => els.length), 0, tag + ': データの HTML が効いてしまった');
    const note = await page.$eval('#d1-y2006 .d1-note-text', (e) => ({ text: e.textContent, ws: getComputedStyle(e).whiteSpace }));
    assert.ok(note.text.startsWith('一行目\n二行目<script>') && note.ws === 'pre-wrap', tag + ': 補足の改行・文字がちがう');
    assert.strictEqual(await text(page, '#d1-y-unknown .d1-winner'), '記録なし');
    assert.strictEqual(await page.$$eval('#d1-y-unknown .d1-facts', (e) => e.length), 0, tag + ': 空の欄が出ている');
    assert.strictEqual(await page.evaluate(() => [window.__xss, window.__xss2].filter(Boolean).length), 0, tag + ': スクリプトが動いた');
    assert.deepStrictEqual(dialogs, []);
    const kept = await page.evaluate(() => JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage), document.cookie]));
    assert.strictEqual(kept, '[[],[],""]', tag + ': ブラウザに何か保存している: ' + kept);
    assert.ok(await noOverflow(page), tag + ': 横にはみ出している');
    await shot(page, tag + '-live', true);

    // ログアウト（キーボードで）
    const disabled = await page.evaluate(() => window.__gsi.disabled);
    await page.focus('#d1-logout');
    await page.keyboard.press('Enter');
    assert.ok(!(await page.isVisible('#d1-board')), tag + ': ログアウトしても記録が出ている');
    assert.strictEqual(await page.$$eval('#d1-list .d1-year', (els) => els.length), 0, tag + ': 記録の中身が残っている');
    assert.ok(await page.isVisible('#d1-gbtn .fake-gsi'), tag + ': ログアウト後にログインボタンがない');
    assert.strictEqual(await page.evaluate(() => window.__gsi.disabled), disabled + 1, tag + ': ログアウトで自動ログインを止めていない');
    assert.ok((await statusText(page)).includes('ログアウトしました'));
    assert.ok(!(await page.evaluate(() => document.body.innerText)).includes('港 一郎'), tag + ': 名前が残っている');
    assert.deepStrictEqual(realErrors(errors), [], tag + ': エラーが出た');
    await ctx.close();
    console.log('ok: 本番の形・ログインからログアウトまで（' + tag + '）');
  }

  // ── 4. 見る権限はあるが、記録が来ない ──
  {
    const { page, ctx, errors } = await openPage(browser, base, { noD1: true, config: { GAS_URL: GAS, GOOGLE_CLIENT_ID: CLIENT } });
    await page.waitForSelector('#d1-gbtn .fake-gsi', { timeout: 5000 });
    await signIn(page, 'ok', 'senpai@example.com');
    await page.waitForSelector('#d1-board', { state: 'visible', timeout: 5000 });
    assert.ok(await page.isVisible('#d1-none'), '0 件のときの文がない');
    assert.ok((await page.textContent('#d1-none')).includes('まだ D-1選手権の記録はありません'));
    assert.strictEqual(await page.$$eval('#d1-list .d1-year', (els) => els.length), 0);
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: 記録が 0 件のとき');
  }
}).then(() => {
  console.log('d1: すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
