/*
 * D-1選手権（d1/）の確認
 *   node tests/e2e/d1.test.js
 *  1. デモ（GAS_URL が空）：サンプルの記録。説明の文・年度の並び・優勝・準優勝・裏方・補足
 *  2. 本番の形：だれでも見られる（ログインなし）。?type=public の d1 を出す。HTML は文字のまま
 *  3. 記録が来ない（d1 がない）とき・読み込みに失敗して、もう一度読み込むとき
 * Apps Script の返事は、にせものに差しかえる。
 * 環境変数 D1_SHOTS にフォルダを指定すると、途中の画面を保存する。
 */
const assert = require('assert');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8807; // ARCH.md の割り当て
const SHOTS = process.env.D1_SHOTS || '';
const GAS = 'https://script.google.com/macros/s/TEST/exec';
const XSS = '<img src=x onerror="window.__xss=1">';
const MOTTO = '童貞の、童貞による、童貞のための闘い。その先に得られるのは富か、名誉か、それとも・・・。';


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
  await ctx.route('https://accounts.google.com/**', (r) => { gsiAsked.push(r.request().url()); return r.abort(); });
  const asked = [];
  await ctx.route('https://script.google.com/**', (r) => {
    const req = r.request();
    asked.push({ method: req.method(), url: req.url() });
    if (o.fail && o.fail()) return r.fulfill({ status: 500, body: 'error' });
    return r.fulfill({
      status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(Object.assign({ ok: true, updated: '2026-11-01T12:00:00+09:00', members: [], rooms: [] }, o.noD1 ? {} : { d1: LIVE_D1 })),
    });
  });
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.goto(base + 'd1/');
  await page.waitForTimeout(500);
  return { page, ctx, errors, dialogs, asked, gsiAsked };
}

const yearIds = (page) => page.$$eval('#d1-list .d1-year', (els) => els.map((e) => e.id));
const heads = (page) => page.$$eval('#d1-list .d1-name', (els) => els.map((e) => e.textContent));
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());
withSite(PORT, async ({ browser, base }) => {
  // ── 1. デモ（パソコン・スマホ） ──
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'pc';
    const { page, ctx, errors, dialogs, gsiAsked } = await openPage(browser, base, { phone });
    const sample = await page.evaluate(() => window.OB.SAMPLE.d1);
    assert.ok(sample.length >= 4, tag + ': サンプルの記録が少ない');
    assert.ok(await page.isVisible('#d1-demo'), tag + ': デモの注記が出ていない');
    assert.ok((await page.textContent('#d1-demo')).includes('デモ表示です'));
    assert.strictEqual(await page.textContent('#d1-motto'), MOTTO, tag + ': 説明の文が持ち主の言葉のままでない');
    assert.strictEqual(await page.$$('#d1-login, #d1-setup, #d1-user, #d1-gbtn').then((x) => x.length), 0, tag + ': ログインのしくみが残っている');
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

  // ── 2. 本番の形：ログインなしで、?type=public の d1 を出す ──
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'pc';
    const { page, ctx, errors, dialogs, asked, gsiAsked } = await openPage(browser, base, { phone, config: { GAS_URL: GAS } });
    await page.waitForSelector('#d1-board', { state: 'visible', timeout: 5000 });
    assert.ok(asked.length >= 1 && asked.every((a) => a.method === 'GET' && a.url.startsWith(GAS + '?type=public')), tag + ': 公開データを読んでいない ' + JSON.stringify(asked));
    assert.strictEqual(gsiAsked.length, 0, tag + ': Google のログインを読みに行った');
    assert.ok(!(await page.isVisible('#d1-demo')), tag + ': 本番なのにデモの注記');
    assert.strictEqual(await page.textContent('#d1-motto'), MOTTO);
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
    assert.deepStrictEqual(realErrors(errors), [], tag + ': エラーが出た');
    await ctx.close();
    console.log('ok: 本番の形（' + tag + '）');
  }

  // ── 3. 記録が来ない・読み込みに失敗 → もう一度 ──
  {
    const { page, ctx, errors } = await openPage(browser, base, { noD1: true, config: { GAS_URL: GAS } });
    await page.waitForSelector('#d1-board', { state: 'visible', timeout: 5000 });
    assert.ok(await page.isVisible('#d1-none'), '0 件のときの文がない');
    assert.ok((await page.textContent('#d1-none')).includes('まだ D-1選手権の記録はありません'));
    assert.strictEqual(await page.$$eval('#d1-list .d1-year', (els) => els.length), 0);
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: 記録が 0 件のとき');
  }
  {
    let failing = true;
    const { page, ctx } = await openPage(browser, base, { config: { GAS_URL: GAS }, fail: () => failing });
    await page.waitForSelector('#d1-error', { state: 'visible', timeout: 5000 });
    assert.ok(!(await page.isVisible('#d1-board')), '失敗したのに記録の欄が出ている');
    assert.ok((await page.textContent('#d1-error')).includes('読み込めませんでした'));
    failing = false;
    await page.click('#d1-retry');
    await page.waitForSelector('#d1-board', { state: 'visible', timeout: 5000 });
    assert.ok(!(await page.isVisible('#d1-error')));
    assert.deepStrictEqual(await yearIds(page), ['d1-y2004', 'd1-y2006', 'd1-y-unknown']);
    await ctx.close();
    console.log('ok: 読み込みの失敗と、もう一度読み込む');
  }
}).then(() => {
  console.log('d1: すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
