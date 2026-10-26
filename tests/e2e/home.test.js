/*
 * ホーム（index.html）の確認
 *   node tests/e2e/home.test.js
 * タイトル → モード選択 → ゲームの一覧 → コンテンツの地図 → 各ページへの移動を、
 * パソコン（キーボード・マウス）とスマホ（タップ・画面下のボタン）で通す。
 * 環境変数 HOME_SHOTS にフォルダを指定すると、途中の画面を保存する。
 */
const assert = require('assert');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.HOME_PORT) || 8802; // 確認役が別のポートで動かすときは HOME_PORT
const SHOTS = process.env.HOME_SHOTS || '';
const TARGETS = /\/(game|nenpyo|heya|meibo|sanpo)\/$/;
const STUB = '<!doctype html><html lang="ja"><meta charset="utf-8"><title>stub</title><p>stub</p></html>';

async function shot(page, name) {
  if (!SHOTS) return;
  await page.locator('#home-screen').screenshot({ path: path.join(SHOTS, name + '.png') });
}
// ほかのページはまだ作っている途中かもしれないので、行き先は仮のページで受ける
async function stubTargets(ctx) {
  await ctx.route((url) => TARGETS.test(url.pathname), (r) => r.fulfill({ status: 200, contentType: 'text/html', body: STUB }));
}
const state = (page) => page.evaluate(() => {
  const S = window.HOME.state;
  return { scene: S.scene, cur: S.cur, msg: S.msg && S.msg.lines.join(' '), wipe: !!S.wipe, leaving: S.leaving, mode: S.mode, game: S.game };
});
async function waitScene(page, scene) {
  await page.waitForFunction((sc) => window.HOME && window.HOME.state && window.HOME.state.scene === sc && !window.HOME.state.wipe && !window.HOME.state.leaving, scene, { timeout: 5000 });
}
async function items(page) {
  return page.evaluate(() => window.HOME.ITEMS.map((it) => {
    for (let y = 0; y < window.HOME.MAP.length; y++) {
      const x = window.HOME.MAP[y].indexOf(it.key);
      if (x >= 0) return { id: it.id, name: it.name, href: it.href || null, album: !!it.album, x, y };
    }
    return null;
  }));
}
// 画面の中の点（256×224 の座標）を、ページの座標にする
async function at(page, ix, iy) {
  const r = await page.locator('#home-screen').boundingBox();
  return { x: r.x + (ix / 256) * r.width, y: r.y + (iy / 224) * r.height };
}
async function tapAt(page, ix, iy) {
  const p = await at(page, ix, iy);
  await page.touchscreen.tap(p.x, p.y);
}
async function moveCursorTo(page, x, y) {
  for (let i = 0; i < 40; i++) {
    const { cur } = await state(page);
    if (cur.x === x && cur.y === y) return;
    const key = cur.x < x ? 'ArrowRight' : cur.x > x ? 'ArrowLeft' : cur.y < y ? 'ArrowDown' : 'ArrowUp';
    await page.keyboard.press(key);
    await page.waitForTimeout(30);
  }
  throw new Error('カーソルが ' + x + ',' + y + ' に届かない');
}
async function backHome(page) {
  await page.goBack();
  await page.waitForFunction(() => window.HOME && window.HOME.state && !window.HOME.state.wipe && !window.HOME.state.leaving, null, { timeout: 5000 });
}

async function desktop(open, base) {
  const { page, errors, ctx } = await open('', { wait: 800 });
  await stubTargets(ctx);

  // ページの基本
  assert.strictEqual(await page.title(), '夕照寮OB会');
  const footer = await page.locator('footer.ob-footer').innerText();
  assert.ok(footer.includes('すべてフィクションです'), '注記がない: ' + footer);
  const hrefs = await page.$$eval('.home-nav a', (as) => as.map((a) => a.getAttribute('href')));
  assert.deepStrictEqual(hrefs, ['game/', 'nenpyo/', 'heya/', 'meibo/', 'sanpo/']);
  assert.ok((await page.locator('#home-album').innerText()).includes('写真館'));
  assert.ok((await page.locator('#home-album-note').innerText()).includes('じゅんびちゅう'));
  assert.strictEqual(await page.locator('.home-keys').isVisible(), true, 'パソコンではキーの説明を出す');
  assert.strictEqual(await page.locator('.home-pad').isVisible(), false, 'パソコンでは画面下のボタンを出さない');
  const size = await page.evaluate(() => { const c = document.getElementById('home-screen'); return { w: c.width, h: c.height, cw: c.getBoundingClientRect().width }; });
  assert.ok(size.w % 256 === 0 && size.w / 256 >= 2, 'パソコンでは整数倍: ' + JSON.stringify(size));
  assert.strictEqual((await state(page)).scene, 'title');
  assert.strictEqual(await page.evaluate(() => window.HOME.audio.started()), false, '操作の前は音を用意しない');
  await shot(page, 'd1-title');

  // タイトル → モード選択（行進曲が鳴りはじめる）
  await page.keyboard.press('Enter');
  await waitScene(page, 'mode');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => window.HOME.audio.current()), 'march', 'スタートのあとは行進曲');
  await shot(page, 'd2-mode');

  // ゲームの一覧：野球大会は準備中
  await page.keyboard.press('Enter');
  await waitScene(page, 'games');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  let s = await state(page);
  assert.ok(s.msg && s.msg.includes('じゅんびちゅう'), '野球大会は準備中の知らせ: ' + s.msg);
  await shot(page, 'd3-soon');
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.strictEqual(s.msg, null);
  assert.strictEqual(s.scene, 'games', '準備中のあとも一覧のまま');

  // 男魂くんの1年 → game/
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForURL(base + 'game/', { timeout: 5000 });
  await backHome(page);
  s = await state(page);
  assert.strictEqual(s.scene, 'games', 'もどってきたら一覧から: ' + s.scene);

  // B でモード選択へ、コンテンツの地図へ
  await page.keyboard.press('Escape');
  await waitScene(page, 'mode');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitScene(page, 'map');
  assert.strictEqual(await page.evaluate(() => window.HOME.audio.current()), 'map', '地図では地図の曲');
  await shot(page, 'd4-map');

  // 地図の上の旗を、ひとつずつ
  for (const it of await items(page)) {
    await moveCursorTo(page, it.x, it.y);
    const info = await page.evaluate(() => {
      const S = window.HOME.state;
      const ch = window.HOME.MAP[S.cur.y][S.cur.x];
      const it = window.HOME.ITEMS.find((i) => i.key === ch);
      return it ? it.name : null;
    });
    assert.strictEqual(info, it.name);
    await shot(page, 'd5-map-' + it.id);
    if (it.album) {
      const said = await page.locator('#home-live').textContent();
      assert.ok(said.includes('じゅんびちゅう'), '写真館の説明も準備中: ' + said);
    }
    await page.keyboard.press('Enter');
    if (it.album) {
      await page.waitForTimeout(250);
      s = await state(page);
      assert.ok(s.msg && s.msg.includes('じゅんびちゅう'), '写真館は URL がないとき準備中: ' + s.msg);
      await page.keyboard.press('x');
      assert.strictEqual((await state(page)).msg, null);
      continue;
    }
    await page.waitForURL(base + it.href, { timeout: 5000 });
    await backHome(page);
    s = await state(page);
    assert.strictEqual(s.scene, 'map', 'もどってきたら地図から');
    assert.deepStrictEqual(s.cur, { x: it.x, y: it.y }, 'カーソルも元の場所');
  }

  // 何もないマスで A：ヒントを光らせるだけ
  await moveCursorTo(page, 0, 0);
  await page.keyboard.press('z');
  await page.waitForTimeout(100);
  s = await state(page);
  assert.strictEqual(s.scene, 'map');
  assert.strictEqual(s.leaving, false);

  // マウス：旗の上に乗せると選ばれ、クリックで入る
  const sanpo = (await items(page)).find((i) => i.id === 'sanpo');
  const p = await at(page, sanpo.x * 16 + 8, sanpo.y * 16 + 8);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(80);
  assert.deepStrictEqual((await state(page)).cur, { x: sanpo.x, y: sanpo.y }, 'マウスを乗せるとカーソルが動く');
  await page.mouse.click(p.x, p.y);
  await page.waitForURL(base + 'sanpo/', { timeout: 5000 });
  await backHome(page);
  await page.mouse.move(0, 0);

  // 地図の「B もどる」をクリック → モード選択、B → タイトル
  const chip = await page.evaluate(() => window.HOME.hit.backChip());
  const cp = await at(page, chip[0] + chip[2] / 2, chip[1] + chip[3] / 2);
  await page.mouse.click(cp.x, cp.y);
  await waitScene(page, 'mode');
  await page.mouse.move(0, 0);
  await page.keyboard.press('Escape');
  await waitScene(page, 'title');

  // 音のオン・オフは保存される
  const btn = page.locator('#home-sound');
  assert.strictEqual(await btn.getAttribute('aria-pressed'), 'true');
  await btn.click();
  assert.strictEqual(await btn.getAttribute('aria-pressed'), 'false');
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('ob-home-sound')), 'off');
  assert.strictEqual(await page.evaluate(() => window.HOME.audio.current()), null, 'オフにしたら止まる');
  await page.reload();
  await page.waitForTimeout(400);
  assert.strictEqual(await page.locator('#home-sound').getAttribute('aria-pressed'), 'false');
  assert.ok((await page.locator('#home-sound').innerText()).includes('OFF'));
  await page.locator('#home-sound').click();
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('ob-home-sound')), 'on');

  // 下のリンクにフォーカスがあるときは、キーを横取りしない（Z でスタートしない）
  await page.locator('.home-nav a').first().focus();
  await page.keyboard.press('z');
  await page.waitForTimeout(1000);
  assert.strictEqual((await state(page)).scene, 'title', 'リンクにフォーカスがあるときは Z で始まらない');

  // 下の一覧まで送ったら、矢印キーでページが動く（画面のカーソルは動かさない）
  await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, document.body.scrollHeight); });
  await page.waitForTimeout(200);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('z');
  await page.waitForTimeout(1000);
  const y1 = await page.evaluate(() => window.scrollY);
  assert.ok(y0 > 0 && y1 < y0, '矢印キーでページが上へ動く: ' + y0 + ' → ' + y1);
  assert.strictEqual((await state(page)).scene, 'title', '画面が見えていないときは Z で始まらない');
  await page.evaluate(() => window.scrollTo(0, 0));

  const errs = realErrors(errors);
  assert.deepStrictEqual(errs, [], 'パソコン：エラー ' + errs.join('\n'));
  await ctx.close();
}

async function phone(open, base) {
  const { page, errors, ctx } = await open('', { phone: true, wait: 800 });
  await stubTargets(ctx);
  assert.strictEqual(await page.locator('.home-pad').isVisible(), true, 'スマホでは画面下のボタンを出す');
  const lay = await page.evaluate(() => {
    const c = document.getElementById('home-screen').getBoundingClientRect();
    return { w: c.width, left: c.left, vw: innerWidth, sw: document.documentElement.scrollWidth };
  });
  assert.ok(lay.w >= lay.vw * 0.9 && lay.left >= 0, 'スマホでは画面いっぱい: ' + JSON.stringify(lay));
  assert.ok(lay.sw <= lay.vw, '横にはみ出さない: ' + JSON.stringify(lay));
  await shot(page, 'p1-title');

  // タップでスタート → コンテンツを選ぶ
  await tapAt(page, 128, 140);
  await waitScene(page, 'mode');
  const modeItem = await page.evaluate(() => window.HOME.hit.LAY.mode.item(1));
  await tapAt(page, modeItem[0] + modeItem[2] / 2, modeItem[1] + modeItem[3] / 2);
  await waitScene(page, 'map');
  await shot(page, 'p2-map');

  // 十字キー（画面下）でカーソルが動く
  let s = await state(page);
  const dpad = await page.locator('#home-dpad').boundingBox();
  await page.touchscreen.tap(dpad.x + dpad.width * 0.85, dpad.y + dpad.height / 2);
  await page.waitForTimeout(60);
  let s2 = await state(page);
  assert.deepStrictEqual(s2.cur, { x: s.cur.x + 1, y: s.cur.y }, '十字キーの右');

  // 旗をタップ → 説明、もう一度タップ → そのページへ
  for (const it of await items(page)) {
    await tapAt(page, it.x * 16 + 8, it.y * 16 + 8);
    await page.waitForTimeout(60);
    s = await state(page);
    assert.deepStrictEqual(s.cur, { x: it.x, y: it.y }, 'タップでカーソルが動く: ' + it.id);
    assert.strictEqual(s.leaving, false, '1 回目のタップでは入らない: ' + it.id);
    await tapAt(page, it.x * 16 + 8, it.y * 16 + 8);
    if (it.album) {
      await page.waitForTimeout(250);
      s = await state(page);
      assert.ok(s.msg && s.msg.includes('じゅんびちゅう'));
      await page.locator('#home-btn-a').tap();
      assert.strictEqual((await state(page)).msg, null, 'A ボタンで知らせを閉じる');
      continue;
    }
    await page.waitForURL(base + it.href, { timeout: 5000 });
    await backHome(page);
    await shot(page, 'p3-back-' + it.id);
  }

  // 説明のウインドウをタップしても入れる
  await tapAt(page, 8 * 16 + 8, 7 * 16 + 8); // 名簿
  await page.waitForTimeout(60);
  const box = await page.evaluate(() => window.HOME.hit.infoBox());
  await tapAt(page, box[0] + 40, box[1] + box[3] / 2);
  await page.waitForURL(base + 'meibo/', { timeout: 5000 });
  await backHome(page);

  // B ボタン → モード選択 → ゲーム → 一覧から game/
  await page.locator('#home-btn-b').tap();
  await waitScene(page, 'mode');
  const gameMode = await page.evaluate(() => window.HOME.hit.LAY.mode.item(0));
  await tapAt(page, gameMode[0] + gameMode[2] / 2, gameMode[1] + gameMode[3] / 2);
  await waitScene(page, 'games');
  await shot(page, 'p4-games');
  const g1 = await page.evaluate(() => window.HOME.hit.LAY.games.item(1));
  await tapAt(page, g1[0] + g1[2] / 2, g1[1] + g1[3] / 2);
  await page.waitForTimeout(250);
  s = await state(page);
  assert.ok(s.msg && s.msg.includes('じゅんびちゅう'), '野球大会は準備中（タップ）');
  await tapAt(page, 128, 112);
  assert.strictEqual((await state(page)).msg, null);
  const g0 = await page.evaluate(() => window.HOME.hit.LAY.games.item(0));
  await tapAt(page, g0[0] + g0[2] / 2, g0[1] + g0[3] / 2);
  await page.waitForURL(base + 'game/', { timeout: 5000 });
  await backHome(page);

  // 幅 360 のスマホでも、横にはみ出さない
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(200);
  const narrow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, cw: document.getElementById('home-screen').getBoundingClientRect().width }));
  assert.ok(narrow.sw <= narrow.vw && narrow.cw <= narrow.vw && narrow.cw >= 300, '幅 360：' + JSON.stringify(narrow));

  const errs = realErrors(errors);
  assert.deepStrictEqual(errs, [], 'スマホ：エラー ' + errs.join('\n'));
  await ctx.close();
}

// 写真館の URL が設定されているとき：新しいタブで開く。下のリンクも写真館に
async function album(open) {
  const { page, errors, ctx } = await open('', { wait: 100 });
  await ctx.route('**/js/site/config.js', (r) => r.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: "window.OB_CONFIG = { GAS_URL: '', GOOGLE_CLIENT_ID: '', ALBUM_URL: 'https://example.com/album', FORM_TIMELINE_URL: '', FORM_MEMBER_URL: '', CONTACT_EMAIL: '' };",
  }));
  await ctx.route('https://example.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: STUB }));
  await page.reload();
  await page.waitForTimeout(500);
  const link = page.locator('a#home-album');
  assert.strictEqual(await link.getAttribute('href'), 'https://example.com/album');
  assert.strictEqual(await link.getAttribute('target'), '_blank');
  await page.keyboard.press('Enter');
  await waitScene(page, 'mode');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitScene(page, 'map');
  const it = (await items(page)).find((i) => i.album);
  await moveCursorTo(page, it.x, it.y);
  assert.ok((await page.locator('#home-live').textContent()).includes('ログイン'), 'URL があるときは、ふつうの説明');
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.keyboard.press('Enter')]);
  await popup.waitForLoadState().catch(() => {});
  assert.strictEqual(popup.url(), 'https://example.com/album');
  const s = await state(page);
  assert.ok(s.msg && s.msg.includes('新しいタブ'), s.msg);
  assert.strictEqual(page.url().endsWith(':' + PORT + '/'), true, 'ホームはそのまま');

  // javascript: などは通さない
  await ctx.unroute('**/js/site/config.js');
  await ctx.route('**/js/site/config.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: "window.OB_CONFIG = { ALBUM_URL: 'javascript:alert(1)' };",
  }));
  await page.reload();
  await page.waitForTimeout(400);
  assert.strictEqual(await page.locator('a#home-album').count(), 0, 'あやしい URL はリンクにしない');
  const errs = realErrors(errors);
  assert.deepStrictEqual(errs, [], '写真館：エラー ' + errs.join('\n'));
  await ctx.close();
}

// 動きをへらす設定：点滅や行進を止める
async function reduced(open) {
  const { page, errors, ctx } = await open('', { wait: 100 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.waitForTimeout(400);
  const grab = () => page.evaluate(() => document.getElementById('home-screen').toDataURL());
  const a = await grab();
  await page.waitForTimeout(900);
  const b = await grab();
  assert.ok(a === b, 'タイトルが動かない');
  await page.keyboard.press('Enter');
  await waitScene(page, 'mode');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitScene(page, 'map');
  await page.waitForTimeout(200);
  const c = await grab();
  await page.waitForTimeout(900);
  const d = await grab();
  assert.ok(c === d, '地図が動かない');
  const errs = realErrors(errors);
  assert.deepStrictEqual(errs, [], '動きをへらす：エラー ' + errs.join('\n'));
  await ctx.close();
}

// JS なし：下のメニューだけで行き先がわかる
async function noJs(browser, base) {
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  await page.goto(base);
  assert.strictEqual(await page.locator('.home-console').isVisible(), false);
  const hrefs = await page.$$eval('.home-nav a', (as) => as.map((a) => a.getAttribute('href')));
  assert.deepStrictEqual(hrefs, ['game/', 'nenpyo/', 'heya/', 'meibo/', 'sanpo/']);
  await ctx.close();
}

// 横向きのスマホ：ボタンが画面の左右に来て、はみ出さない
async function landscape(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base);
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const c = document.getElementById('home-screen').getBoundingClientRect();
    const d = document.getElementById('home-dpad').getBoundingClientRect();
    const a = document.getElementById('home-btn-a').getBoundingClientRect();
    return { c: [c.left, c.top, c.right, c.bottom], d: [d.left, d.right], a: [a.left, a.right], vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth };
  });
  assert.ok(r.d[1] <= r.c[0] && r.a[0] >= r.c[2], 'ボタンは画面の左右: ' + JSON.stringify(r));
  assert.ok(r.c[3] <= r.vh, '画面が縦に収まる: ' + JSON.stringify(r));
  assert.ok(r.sw <= r.vw, '横にはみ出さない');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'l1-landscape.png') });
  assert.deepStrictEqual(errors, []);
  await ctx.close();
}

withSite(PORT, async ({ open, base, browser }) => {
  await desktop(open, base);
  console.log('ok パソコン');
  await phone(open, base);
  console.log('ok スマホ');
  await album(open);
  console.log('ok 写真館');
  await reduced(open);
  console.log('ok 動きをへらす');
  await noJs(browser, base);
  console.log('ok JS なし');
  await landscape(browser, base);
  console.log('ok 横向き');
}).then(() => {
  console.log('home: すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
