/*
 * サイト全体の確認（ページどうしのつながり）
 *   node tests/e2e/site.test.js          … ポートは ARCH.md の割り当て（8805）。PORT=8821 などで変えられる
 *   SHOTS_DIR=/tmp/shots node tests/e2e/site.test.js   … スクリーンショットも撮る（リポジトリの外に）
 * GitHub Pages と同じように、サイトを /dormitory/ の下に置いて開く。
 *  - どのページも（進捗の status/ も）：題名、フィクションの注記、ホームへもどるリンク、ドット絵ふうの文字、
 *    コンソールにエラーがない、幅 360px のスマホで横にはみ出さない
 *  - ドメインの直下（/js/… など）を読みに行かない
 *  - ホームの下のリンクと、地図の旗から、各ページへ行ける
 *  - ゲームのメニューの「ホームへもどる」、部屋割り →「この年度の寮を歩く」→ 寮さんぽ
 *  - HTML・CSS・JS に、/ から始まるパスを書いていない
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { withSite, realErrors, ROOT } = require('./lib');

const PORT = Number(process.env.PORT) || 8805; // ARCH.md の割り当て（サイト全体）
const SHOTS = process.env.SHOTS_DIR || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const SUB = '/dormitory/';

const DISCLAIMER = 'このサイトに出てくる事件やゲームの題材は誇張であり、すべてフィクションです。';
const NOT_OFFICIAL = '横浜市立大学の公式サイトではありません。';
const PAGES = [
  { rel: '', title: '夕照寮OB会', head: '.home-name' },
  { rel: 'game/', title: '男魂くんの1年 ― 夕照寮OB会', head: '.otk-name' },
  { rel: 'nenpyo/', title: '年表 ― 夕照寮OB会', head: '.ob-title' },
  { rel: 'heya/', title: '部屋割り ― 夕照寮OB会', head: '.ob-title' },
  { rel: 'meibo/', title: '名簿 ― 夕照寮OB会', head: '.ob-title' },
  { rel: 'sanpo/', title: '寮さんぽ ― 夕照寮OB会', head: '.logo-name' },
  { rel: 'status/', title: /夕照寮OB会/, head: '.ob-title' }, // 進捗（作る人と幹事向け。ホームからはリンクしない）
];
const titleOk = (p, t) => (p.title instanceof RegExp ? p.title.test(t) : p.title === t);

function check(cond, msg) {
  if (!cond) throw new Error('NG: ' + msg);
  console.log('  ok  ' + msg);
}

// ── 1. ファイルを読むだけの確認 ─────────────────────────
function staticChecks() {
  console.log('ファイル');
  const files = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      if (/^(\.git|node_modules|docs|tests|dist|tools|gas)$/.test(name)) continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(html|css|js)$/.test(name)) files.push(p);
    }
  })(ROOT);
  const bad = [];
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    // / から始まるパス（// から始まる外のアドレスはのぞく）
    const re = /(?:href|src|action)\s*=\s*["'](\/(?!\/)[^"']*)["']|url\(\s*["']?(\/(?!\/)[^)"']*)|(?:location\.href|location)\s*=\s*["'](\/(?!\/)[^"']*)["']|fetch\(\s*["'](\/(?!\/)[^"']*)["']/g;
    let m;
    while ((m = re.exec(s))) bad.push(rel + ': ' + m[0]);
  }
  check(bad.length === 0, 'HTML・CSS・JS に / から始まるパスがない' + (bad.length ? '：\n' + bad.join('\n') : ''));

  for (const p of PAGES) {
    const f = path.join(ROOT, p.rel, 'index.html');
    const s = fs.readFileSync(f, 'utf8');
    const name = p.rel || 'index.html';
    assert.ok(/<html lang="ja"/.test(s), name + ': lang="ja"');
    assert.ok(/<meta name="viewport" content="width=device-width/.test(s), name + ': viewport');
    assert.ok(/<link rel="icon"/.test(s), name + ': アイコン');
    assert.ok(/<footer[^>]*data-ob-footer/.test(s), name + ': <footer data-ob-footer>');
    assert.ok(/js\/site\/common\.js/.test(s), name + ': js/site/common.js を読む');
    assert.ok(/family=[^"]*DotGothic16/.test(s), name + ': DotGothic16 を読む');
    // 外のスクリプトは使わない（Google のログイン用は年表の JS が必要なときだけ読む）
    const ext = (s.match(/<script[^>]+src="https?:[^"]+"/g) || []);
    assert.deepStrictEqual(ext, [], name + ': 外のスクリプトを読んでいる');
  }
  check(true, 'どのページも lang・viewport・アイコン・注記・共通の JS・フォントがそろう');
}

// ── ブラウザ ────────────────────────────────────────
// サイトを /dormitory/ の下に置いたことにする。/dormitory/ の外を読みに行ったら記録して 404
async function openSub(browser, base, rel, o = {}) {
  const ctx = await browser.newContext(o.phone
    ? { viewport: { width: o.width || 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1280, height: 800 } });
  const origin = base.replace(/\/$/, '');
  const outside = [];
  await ctx.route((url) => url.origin === origin, async (route) => {
    const u = new URL(route.request().url());
    if (!u.pathname.startsWith(SUB)) {
      outside.push(u.pathname);
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not under ' + SUB });
    }
    const res = await route.fetch({ url: origin + '/' + u.pathname.slice(SUB.length) + u.search });
    return route.fulfill({ response: res });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  const top = origin + SUB;
  await page.goto(top + rel);
  await page.waitForTimeout(o.wait != null ? o.wait : 700);
  return { page, ctx, errors, outside, top };
}
async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}

// ── 2. どのページも ───────────────────────────────────
async function eachPage(browser, base, phone) {
  console.log(phone ? 'スマホ（幅 360px）' : 'パソコン');
  for (const p of PAGES) {
    const tag = (p.rel || 'home') + (phone ? '（スマホ）' : '');
    const { page, ctx, errors, outside, top } = await openSub(browser, base, p.rel, { phone });
    const title = await page.title();
    assert.ok(titleOk(p, title), tag + ': 題名: ' + title);
    const foot = await page.locator('footer[data-ob-footer]').innerText();
    assert.ok(foot.includes(DISCLAIMER) && foot.includes(NOT_OFFICIAL), tag + ': 注記がない: ' + foot);
    assert.ok(await page.locator('footer[data-ob-footer]').isVisible(), tag + ': 注記が見えない');
    const font = await page.evaluate((sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontFamily : ''; }, p.head);
    assert.ok(/DotGothic16/.test(font), tag + ': 見出しがドット絵ふうの文字でない: ' + font);
    if (phone) {
      const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      assert.ok(ov.sw <= ov.cw + 1, tag + ': 横にはみ出している ' + JSON.stringify(ov));
    }
    await shot(page, (phone ? 'p-' : 'd-') + (p.rel.replace('/', '') || 'home'));
    // ホームへもどるリンク
    if (p.rel) {
      const back = page.locator('a[href="../"]').first();
      assert.ok(await back.isVisible(), tag + ': ホームへもどるリンクが見えない');
      assert.ok((await back.innerText()).includes('ホーム'), tag + ': もどるリンクの文字');
      await back.click();
      await page.waitForURL(top, { timeout: 5000 });
      assert.strictEqual(await page.title(), '夕照寮OB会', tag + ': もどった先がホームでない');
    }
    const errs = realErrors(errors);
    assert.deepStrictEqual(errs, [], tag + ': コンソールにエラー');
    assert.deepStrictEqual(outside, [], tag + ': /dormitory/ の外を読みに行った');
    await ctx.close();
  }
  check(true, '題名・注記・文字・もどるリンク・エラーなし' + (phone ? '・横にはみ出さない' : '') + '（' + PAGES.length + ' ページ）');
}

// ── 3. ホームから各ページへ ─────────────────────────────
async function fromHome(browser, base) {
  console.log('ホームから');
  const { page, ctx, errors, outside, top } = await openSub(browser, base, '');
  // 下のリンクの一覧
  const links = await page.$$eval('.home-nav a', (as) => as.map((a) => a.getAttribute('href')));
  assert.deepStrictEqual(links, ['game/', 'nenpyo/', 'heya/', 'meibo/', 'sanpo/']);
  for (const href of links) {
    await page.locator('.home-nav a[href="' + href + '"]').click();
    await page.waitForURL(top + href, { timeout: 5000 });
    assert.ok(titleOk(PAGES.find((p) => p.rel === href), await page.title()), href + ' の題名');
    await page.goBack();
    await page.waitForURL(top, { timeout: 5000 });
  }
  check(true, 'ホームの下のリンクから 5 ページへ行って、もどれる');

  // 地図の旗（部屋割り）から
  await page.waitForFunction(() => window.HOME && window.HOME.state && !window.HOME.state.wipe && !window.HOME.state.leaving);
  await page.locator('#home-screen').focus();
  const scene = () => page.evaluate(() => window.HOME.state.scene);
  for (let i = 0; i < 10 && (await scene()) === 'title'; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); }
  // モード選択 → コンテンツ
  await page.waitForFunction(() => window.HOME.state.scene === 'mode' && !window.HOME.state.wipe);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.HOME.state.scene === 'map' && !window.HOME.state.wipe);
  const flag = await page.evaluate(() => {
    const it = window.HOME.ITEMS.find((i) => i.id === 'heya');
    for (let y = 0; y < window.HOME.MAP.length; y++) { const x = window.HOME.MAP[y].indexOf(it.key); if (x >= 0) return { x, y }; }
    return null;
  });
  for (let i = 0; i < 40; i++) {
    const cur = await page.evaluate(() => window.HOME.state.cur);
    if (cur.x === flag.x && cur.y === flag.y) break;
    await page.keyboard.press(cur.x < flag.x ? 'ArrowRight' : cur.x > flag.x ? 'ArrowLeft' : cur.y < flag.y ? 'ArrowDown' : 'ArrowUp');
    await page.waitForTimeout(30);
  }
  await page.keyboard.press('Enter');
  await page.waitForURL(top + 'heya/', { timeout: 5000 });
  check(true, '地図の旗（部屋割り）から入れる');
  assert.deepStrictEqual(realErrors(errors), [], 'ホーム: コンソールにエラー');
  assert.deepStrictEqual(outside, [], 'ホーム: /dormitory/ の外を読みに行った');
  await ctx.close();
}

// ── 4. ゲームの「ホームへもどる」 ─────────────────────────
async function gameHome(browser, base) {
  console.log('ゲーム');
  const { page, ctx, errors, outside, top } = await openSub(browser, base, 'game/', { wait: 300 });
  await page.evaluate(() => localStorage.removeItem('otk-save'));
  await page.reload();
  const scene = () => page.evaluate(() => (window.OTK && OTK.debug ? OTK.debug.scene : null));
  await page.waitForFunction(() => window.OTK && OTK.debug && OTK.debug.scene === 'title');
  for (let i = 0; i < 20 && (await scene()) !== 'menu'; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); }
  assert.strictEqual(await scene(), 'menu');
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowUp'); // いちばん下の「ホームへもどる」
  await page.waitForTimeout(60);
  await page.keyboard.press('Enter');
  await page.waitForURL(top, { timeout: 5000 });
  assert.strictEqual(await page.title(), '夕照寮OB会');
  check(true, 'ゲームのメニューの「ホームへもどる」で、/dormitory/ のホームへ');
  assert.deepStrictEqual(realErrors(errors), [], 'ゲーム: コンソールにエラー');
  assert.deepStrictEqual(outside, [], 'ゲーム: /dormitory/ の外を読みに行った');
  await ctx.close();
}

// ── 5. 部屋割り → 寮さんぽ ──────────────────────────────
async function heyaToSanpo(browser, base, phone) {
  console.log('部屋割り → 寮さんぽ' + (phone ? '（スマホ）' : ''));
  const { page, ctx, errors, outside, top } = await openSub(browser, base, 'heya/', { phone });
  await page.waitForFunction(() => !document.getElementById('year-select').disabled);
  const year = Number(await page.locator('#year-select').inputValue());
  const href = await page.locator('#walk-link').getAttribute('href');
  assert.strictEqual(href, '../sanpo/?year=' + year, '歩くリンク: ' + href);
  await page.locator('#walk-link').click();
  await page.waitForURL(top + 'sanpo/?year=' + year, { timeout: 5000 });
  await page.waitForFunction(() => window.DORM && DORM.debug && DORM.debug.yearRooms.state !== 'loading');
  const yr = await page.evaluate(() => ({ year: DORM.debug.YEAR, state: DORM.debug.yearRooms.state, rooms: Object.keys(DORM.debug.yearRooms.byRoom).length }));
  assert.ok(yr.year === year && yr.state === 'ok' && yr.rooms > 0, 'その年度の部屋割りを読む: ' + JSON.stringify(yr));
  // 部屋割りのページと同じ人が、同じ部屋にいる
  const same = await page.evaluate((y) => {
    const m = OB.data.roomsByYear(OB.SAMPLE.rooms).get(y);
    return [...m].every(([room, names]) => JSON.stringify(DORM.debug.yearRooms.byRoom[room]) === JSON.stringify(names));
  }, year);
  assert.ok(same, '部屋割りのページと寮さんぽで、住人がそろう');
  // はじめる → 歩ける画面になる
  await page.locator('#start-btn').click();
  await page.waitForTimeout(600);
  assert.ok(await page.locator('#screen').isVisible(), '寮さんぽの画面が出る');
  await shot(page, (phone ? 'p-' : 'd-') + 'sanpo-year');
  check(true, '「この年度の寮を歩く」で ' + year + ' 年度の寮さんぽへ（部屋 ' + yr.rooms + ' 室）');
  // もどるリンクは、同じ年度の部屋割りへ
  const back = page.locator('.logo-home');
  assert.strictEqual(await back.getAttribute('href'), '../heya/?year=' + year, '寮さんぽのもどるリンク');
  assert.ok((await back.innerText()).includes('部屋割り'), 'もどるリンクの文字: ' + (await back.innerText()));
  await back.click();
  await page.waitForURL(top + 'heya/?year=' + year, { timeout: 5000 });
  await page.waitForFunction(() => !document.getElementById('year-select').disabled);
  assert.strictEqual(Number(await page.locator('#year-select').inputValue()), year, '部屋割りにもどると、同じ年度');
  check(true, '寮さんぽの「◀ 部屋割り」で、同じ年度の部屋割りへもどる');
  assert.deepStrictEqual(realErrors(errors), [], '寮さんぽ: コンソールにエラー');
  assert.deepStrictEqual(outside, [], '寮さんぽ: /dormitory/ の外を読みに行った');
  await ctx.close();
}

staticChecks();
withSite(PORT, async ({ browser, base }) => {
  await eachPage(browser, base, false);
  await eachPage(browser, base, true);
  await fromHome(browser, base);
  await gameHome(browser, base);
  await heyaToSanpo(browser, base, false);
  await heyaToSanpo(browser, base, true);
  console.log('すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
