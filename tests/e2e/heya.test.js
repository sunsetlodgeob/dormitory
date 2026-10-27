/*
 * 部屋割り（heya/）と、寮さんぽの「年度」（sanpo/?year=2005）の確認
 *   node tests/e2e/heya.test.js
 * サンプルデータで、年度の切りかえ・地図と一覧表・部屋の情報・寮さんぽへのリンク・ノックを、
 * パソコンとスマホで通す。環境変数 HEYA_SHOTS にフォルダを指定すると、途中の画面を保存する。
 * 確認役が別のポートで動かすときは HEYA_PORT=8823 のように指定する。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { withSite, realErrors, ROOT } = require('./lib');

const PORT = Number(process.env.HEYA_PORT || process.env.PORT) || 8803; // ARCH.md の割り当て（確認役が別のポートで動かすときは HEYA_PORT）
const SHOTS = process.env.HEYA_SHOTS || '';

async function shot(page, name, full) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full });
}

// サンプルデータ（js/site/sample.js）から、年度 → 部屋 → 名前 を作る
function sampleRooms() {
  const win = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'js/site/sample.js'), 'utf8'))(win);
  const by = {};
  for (const r of win.OB.SAMPLE.rooms) {
    by[r.year] = by[r.year] || {};
    (by[r.year][r.room] = by[r.year][r.room] || []).push(r.name);
  }
  return by;
}
const SAMPLE = sampleRooms();
const YEARS = Object.keys(SAMPLE).map(Number).sort((a, b) => a - b);
const LATEST = YEARS[YEARS.length - 1];

async function waitHeya(page) {
  await page.waitForFunction(() => window.HEYA && window.HEYA.S.loaded, null, { timeout: 5000 });
}
const roomState = (page) => page.evaluate(() => [...document.querySelectorAll('.heya-room')].map((b) => ({
  no: b.dataset.room, has: b.classList.contains('has-data'), tags: [...b.querySelectorAll('.heya-tag')].map((t) => t.textContent),
})));

// 地図の絵が描けているか（真っ黒・透明でないか）
const canvasesPainted = (page) => page.evaluate(() => [...document.querySelectorAll('.heya-canvas')].map((c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 60) lit++;
  return lit / (d.length / (4 * 97));
}));

// 地図の札：3 人までは全員、4 人からは 2 人と「ほか N人」
const tagsFor = (names) => (names.length > 3 ? names.slice(0, 2).concat('ほか' + (names.length - 2) + '人') : names);
function checkRooms(rooms, year, data) {
  const want = (data || SAMPLE)[year];
  assert.strictEqual(rooms.length, 35, '部屋は 35 室');
  for (const r of rooms) {
    const names = want[r.no] || [];
    assert.strictEqual(r.has, names.length > 0, year + ' ' + r.no + ' の色分け');
    assert.deepStrictEqual(r.tags, tagsFor(names), year + ' ' + r.no + ' の名前');
  }
}

// ── 部屋割り（パソコン） ───────────────────────────────
async function heyaDesktop(open) {
  const { page, errors } = await open('heya/');
  await waitHeya(page);
  assert.ok(await page.isVisible('#heya-sample'), 'サンプルのお知らせが出る');
  assert.strictEqual((await page.textContent('#heya-sample')).trim(), 'いまはサンプル（架空の名前）を表示しています');
  assert.ok((await page.textContent('footer')).includes('フィクション'), '注記');
  assert.strictEqual(await page.textContent('.ob-title'), '部屋割り年度をえらんで、部屋をのぞこう');
  assert.strictEqual(await page.getAttribute('.ob-back', 'href'), '../');

  // 年度の一覧と、はじめは最新の年度
  const opts = await page.$$eval('#year-select option', (os) => os.map((o) => o.value));
  assert.deepStrictEqual(opts.map(Number), YEARS);
  assert.strictEqual(+(await page.inputValue('#year-select')), LATEST);
  assert.ok(await page.isDisabled('#year-next'), '最新の年度では ▶ が押せない');
  checkRooms(await roomState(page), LATEST);
  const painted = await canvasesPainted(page);
  assert.strictEqual(painted.length, 3, '3F・2F・1F の 3 枚');
  for (const p of painted) assert.ok(p > 0.5, '地図が描けている ' + p);
  assert.deepStrictEqual(await page.$$eval('.heya-floor-tag', (n) => n.map((x) => x.textContent)), ['3F', '2F', '1F']);
  assert.ok(!(await page.evaluate(() => document.getElementById('map-view').classList.contains('is-compact'))), 'パソコンでは名前を地図に出す');
  assert.ok(await page.isHidden('#heya-zoom'), 'パソコンでは拡大ボタンはいらない');
  await shot(page, 'desk-map', true);

  // ◀ で前の年度、選択で好きな年度
  await page.click('#year-prev');
  assert.strictEqual(+(await page.inputValue('#year-select')), YEARS[YEARS.length - 2]);
  checkRooms(await roomState(page), YEARS[YEARS.length - 2]);
  await page.selectOption('#year-select', '2005');
  checkRooms(await roomState(page), 2005);
  assert.ok((await page.textContent('#heya-summary')).includes('2005年度'));
  assert.ok(page.url().endsWith('/heya/?year=2005'), 'URL に年度が残る ' + page.url());
  assert.strictEqual(await page.getAttribute('#walk-link', 'href'), '../sanpo/?year=2005');

  // 部屋をクリック → 下に情報
  const known = Object.keys(SAMPLE[2005])[0];
  await page.click('.heya-room[data-room="' + known + '"]');
  assert.ok(await page.isVisible('#heya-panel'));
  assert.strictEqual(await page.textContent('#panel-title'), known + '号室（2005年度）');
  assert.deepStrictEqual(await page.$$eval('.heya-panel-names li', (l) => l.map((x) => x.textContent)), SAMPLE[2005][known]);
  assert.ok(await page.evaluate((no) => document.querySelector('.heya-room[data-room="' + no + '"]').classList.contains('is-sel'), known));
  // 開いたまま年度を変えると、同じ部屋の別の年度になる
  await page.click('#year-next');
  assert.strictEqual(await page.textContent('#panel-title'), known + '号室（2006年度）');
  await page.click('#year-prev');
  const unknown = ['306', '315', '204'].find((n) => !SAMPLE[2005][n]);
  await page.click('.heya-room[data-room="' + unknown + '"]');
  assert.strictEqual(await page.textContent('#panel-title'), unknown + '号室（2005年度）');
  assert.strictEqual(await page.textContent('.heya-panel-none'), 'まだ情報がありません。情報募集中です。');
  assert.strictEqual(await page.$('.heya-panel-form'), null, 'フォームの URL が空なら、リンクは出さない');
  await shot(page, 'desk-panel');
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#heya-panel'), 'Esc でとじる');
  await page.click('.heya-room[data-room="' + known + '"]');
  await page.click('#panel-close');
  assert.ok(await page.isHidden('#heya-panel'), '✕ でとじる');

  // 一覧表
  await page.click('#view-list');
  assert.ok(await page.isHidden('#map-view'));
  assert.ok(await page.isVisible('#list-view'));
  assert.strictEqual(await page.getAttribute('#view-list', 'aria-pressed'), 'true');
  assert.ok(page.url().endsWith('?year=2005&view=list'), page.url());
  const rows = await page.$$eval('#heya-list tbody tr', (trs) => trs.map((tr) => ({ no: tr.querySelector('th').textContent, td: tr.querySelector('td').textContent })));
  assert.strictEqual(rows.length, 35);
  for (const r of rows) {
    const names = SAMPLE[2005][r.no];
    assert.strictEqual(r.td, names ? names.join(' ') : '？', '一覧表 ' + r.no);
  }
  await shot(page, 'desk-list', true);
  await page.selectOption('#year-select', String(YEARS[0]));
  assert.strictEqual(await page.$$eval('#heya-list tbody tr.has-data', (t) => t.length), Object.keys(SAMPLE[YEARS[0]]).length);
  await page.click('#view-map');
  assert.ok(await page.isVisible('#map-view'));
  checkRooms(await roomState(page), YEARS[0]);

  // データにない年度で開いたら、最新の年度にして URL も直す
  await page.goto(page.url().replace(/\?.*$/, '?year=1999'));
  await waitHeya(page);
  assert.strictEqual(+(await page.inputValue('#year-select')), LATEST);
  assert.ok(page.url().endsWith('/heya/?year=' + LATEST), 'URL を直す ' + page.url());

  // URL の年度・見かたで開ける（寮さんぽから戻ったとき）
  await page.goto(page.url().replace(/\?.*$/, '?year=2003&view=list'));
  await waitHeya(page);
  assert.strictEqual(+(await page.inputValue('#year-select')), 2003);
  assert.ok(await page.isVisible('#list-view'));

  // 「この年度の寮を歩く」
  await page.click('#view-map');
  await page.click('#walk-link');
  await page.waitForURL(/\/sanpo\/\?year=2003$/);
  await page.waitForFunction(() => window.DORM && window.DORM.debug && window.DORM.debug.yearRooms.state === 'ok');
  assert.strictEqual(await page.evaluate(() => window.DORM.debug.YEAR), 2003);
  assert.deepStrictEqual(realErrors(errors), [], 'エラーなし（パソコン）');
}

// ── 部屋割り（スマホ） ────────────────────────────────
async function heyaPhone(open) {
  const { page, errors } = await open('heya/?year=2005', { phone: true });
  await waitHeya(page);
  assert.strictEqual(+(await page.inputValue('#year-select')), 2005);
  const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert.ok(await noScroll(), 'ページが横にはみ出さない');
  assert.ok(await page.evaluate(() => document.getElementById('map-view').classList.contains('is-compact')), 'スマホでは地図を縮めて、名前は下に出す');
  const box = await page.locator('#heya-maps').boundingBox();
  assert.ok(box.x >= 14 && box.x + box.width <= 390 - 14, '地図が画面の幅に入る');
  checkRooms(await roomState(page), 2005);
  // 凡例の色見本と説明が、別の行に分かれない
  const legend = await page.$$eval('.heya-legend > span', (ss) => ss.map((s) => s.getBoundingClientRect().height));
  assert.strictEqual(legend.length, 2);
  for (const h of legend) assert.ok(h < 30, '凡例が 1 行に入る ' + h);
  await shot(page, 'phone-map', true);

  // タップで情報
  const known = Object.keys(SAMPLE[2005]).find((n) => n[0] === '3');
  await page.locator('.heya-room[data-room="' + known + '"]').tap();
  assert.ok(await page.isVisible('#heya-panel'));
  assert.ok((await page.textContent('#heya-panel')).includes(SAMPLE[2005][known][0]));
  const pb = await page.locator('#heya-panel').boundingBox();
  assert.ok(pb.x >= 14 && pb.x + pb.width <= 390 - 14, 'ウインドウが画面に入る');
  await shot(page, 'phone-panel');
  // 1 階の部屋をえらんでも、ウインドウに隠れない
  await page.locator('.heya-room[data-room="101"]').tap();
  await page.waitForTimeout(700);
  const rb = await page.locator('.heya-room[data-room="101"]').boundingBox();
  const pb2 = await page.locator('#heya-panel').boundingBox();
  assert.ok(rb.y + rb.height <= pb2.y + 2, 'えらんだ部屋が見える');
  await page.locator('#panel-close').tap();

  // 拡大すると名前が地図に出る。横にスクロールできる
  await page.locator('#heya-zoom').tap();
  assert.ok(await page.evaluate(() => !document.getElementById('map-view').classList.contains('is-compact')));
  assert.ok(await page.evaluate(() => { const m = document.getElementById('heya-maps'); return m.scrollWidth > m.clientWidth; }), '地図を横に送れる');
  assert.ok(await noScroll(), '拡大してもページははみ出さない');
  assert.strictEqual(await page.textContent('#heya-zoom'), '全体を見る');
  await shot(page, 'phone-zoom');
  await page.locator('#heya-zoom').tap();

  // 一覧表
  await page.locator('#view-list').tap();
  assert.ok(await page.isVisible('#list-view'));
  assert.ok(await noScroll(), '一覧表もはみ出さない');
  await shot(page, 'phone-list', true);
  assert.deepStrictEqual(realErrors(errors), [], 'エラーなし（スマホ）');
}

// ── スプレッドシートの文字は HTML にしない・データのそろえ方・フォームの URL ─────────────
async function heyaSafety(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const evil = '<img src=x onerror="window.__pwned=1">悪';
  const many = ['同期B 一', '同期B 二', '同期B 三', '同期B 四'];
  assert.ok(!SAMPLE[2005]['306'] && !SAMPLE[2005]['316'] && SAMPLE[2005]['305'], 'サンプルの前提');
  const extra = [
    { year: 2005, room: '306', name: evil },
    { year: '2005', room: '315号室', name: '  六浦 九郎  ' },
    { year: '２００５', room: '３１６', name: '全角 六郎' }, // 全角の数字
    { year: 2005, room: '999', name: '寮にない部屋' },
    { year: 1990, room: '218', name: '寮にない部屋' }, // 寮にない部屋だけの年度は出さない
  ].concat(many.map((name) => ({ year: 2005, room: '305', name })));
  await ctx.route('**/js/site/sample.js', async (route) => {
    const body = fs.readFileSync(path.join(ROOT, 'js/site/sample.js'), 'utf8') + '\nwindow.OB.SAMPLE.rooms.push(...' + JSON.stringify(extra) + ');';
    await route.fulfill({ status: 200, contentType: 'text/javascript', body });
  });
  let form = 'https://example.com/form';
  await ctx.route('**/js/site/config.js', async (route) => {
    const body = fs.readFileSync(path.join(ROOT, 'js/site/config.js'), 'utf8').replace("FORM_MEMBER_URL: ''", 'FORM_MEMBER_URL: ' + JSON.stringify(form));
    await route.fulfill({ status: 200, contentType: 'text/javascript', body });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + 'heya/?year=2005');
  await waitHeya(page);
  await page.click('.heya-room[data-room="306"]');
  assert.ok((await page.textContent('#panel-body')).includes(evil), '名前はそのまま文字で出る');
  assert.strictEqual(await page.$$eval('#heya-panel img, .heya-room img, #heya-list img', (x) => x.length), 0, 'HTML としては入らない');
  assert.strictEqual(await page.evaluate(() => window.__pwned), undefined);
  await page.click('.heya-room[data-room="315"]');
  assert.strictEqual(await page.textContent('.heya-panel-names li'), '六浦 九郎', '「315号室」や前後の空白もそろえる');
  await page.click('.heya-room[data-room="316"]');
  assert.strictEqual(await page.textContent('.heya-panel-names li'), '全角 六郎', '全角の数字もそろえる');
  // 寮にない部屋は数えない・年度にも出さない
  const opts = await page.$$eval('#year-select option', (os) => os.map((o) => +o.value));
  assert.deepStrictEqual(opts, YEARS, '寮にない部屋だけの年度は出さない');
  const known = Object.keys(SAMPLE[2005]).length + 3;
  assert.ok((await page.textContent('#heya-summary')).includes('わかっている部屋 ' + known + ' / 35'), await page.textContent('#heya-summary'));
  // 人が多い部屋は、札を 2 人と「ほか N人」にして、部屋からはみ出さない
  const all305 = SAMPLE[2005]['305'].concat(many);
  const r305 = (await roomState(page)).find((r) => r.no === '305');
  assert.deepStrictEqual(r305.tags, tagsFor(all305));
  const fit = await page.evaluate(() => {
    const b = document.querySelector('.heya-room[data-room="305"]').getBoundingClientRect();
    const n = document.querySelector('.heya-room[data-room="305"] .heya-room-names').getBoundingClientRect();
    return n.top >= b.top - 1 && n.bottom <= b.bottom + 1;
  });
  assert.ok(fit, '札が部屋の高さに入る');
  await page.click('.heya-room[data-room="305"]');
  assert.deepStrictEqual(await page.$$eval('.heya-panel-names li', (l) => l.map((x) => x.textContent)), all305, 'ウインドウには全員');
  const empty = Object.keys(SAMPLE[2005]).indexOf('307') < 0 ? '307' : '308';
  await page.click('.heya-room[data-room="' + empty + '"]');
  assert.strictEqual(await page.getAttribute('.heya-panel-form', 'href'), form, '情報募集のフォームへのリンク');
  assert.ok((await page.textContent('#heya-form')).includes('情報を送る'));
  await shot(page, 'safety-many');

  // 寮さんぽでも同じようにそろえる。人が多い部屋は 4 人ずつに分けて出す
  await page.goto(base + 'sanpo/?year=2005');
  await startSanpo(page);
  await page.waitForFunction(() => window.DORM.debug.yearRooms.state === 'ok');
  await page.evaluate(() => window.DORM.debug.enterMap('3F', 14, 7, 'up'));
  await page.keyboard.press('KeyZ');
  const head = '305号室（2005年度）\n';
  assert.deepStrictEqual((await dbg(page)).dialog, ['コンコン…', head + all305.slice(0, 4).join('\n'), head + all305.slice(4).join('\n')]);
  await readDialog(page);
  await page.evaluate(() => window.DORM.debug.enterMap('3F', 41, 8, 'down'));
  await page.keyboard.press('KeyZ');
  assert.deepStrictEqual((await dbg(page)).dialog, ['コンコン…', '316号室（2005年度）\n全角 六郎']);
  await readDialog(page);

  // javascript: などは出さない
  form = 'javascript:alert(1)';
  await page.goto(base + 'heya/?year=2005');
  await waitHeya(page);
  await page.click('.heya-room[data-room="' + empty + '"]');
  assert.strictEqual(await page.$('.heya-panel-form'), null, 'あやしい URL はリンクにしない');
  assert.deepStrictEqual(errors, []);
  await ctx.close();
}

// ── スプレッドシートから読むとき（GAS_URL あり）：読み込み中・失敗・もう一度 ─────────────
async function heyaLive(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await ctx.route('**/js/site/config.js', async (route) => {
    const body = fs.readFileSync(path.join(ROOT, 'js/site/config.js'), 'utf8').replace("GAS_URL: ''", "GAS_URL: 'https://gas.example.test/exec'");
    await route.fulfill({ status: 200, contentType: 'text/javascript', body });
  });
  let release;
  let mode = 'fail';
  const gate = new Promise((r) => { release = r; });
  await ctx.route('https://gas.example.test/**', async (route) => {
    await gate;
    if (mode === 'fail') return route.fulfill({ status: 500, body: 'error' });
    const rooms = [{ year: 2007, room: '305', name: '先輩A' }];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, members: [], rooms }) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + 'heya/?year=2007');
  await page.waitForTimeout(300);
  // 読み込み中：寮の絵は出ている。年度はまだえらべない
  assert.strictEqual(await page.textContent('#heya-summary'), '読み込み中…');
  assert.ok(await page.isDisabled('#year-select') && await page.isDisabled('#year-prev') && await page.isDisabled('#year-next'));
  for (const p of await canvasesPainted(page)) assert.ok(p > 0.5, '読み込み中も地図が出る ' + p);
  assert.strictEqual(await page.$$eval('.heya-room.no-data', (x) => x.length), 0, '読み込み中は「わからない」にしない');
  // 失敗
  release();
  await page.waitForFunction(() => window.HEYA.S.loaded);
  assert.ok(await page.isVisible('#heya-error'), '失敗のお知らせ');
  assert.strictEqual((await page.textContent('#heya-summary')).trim(), '', '失敗したときは「情報がない」とは言わない');
  assert.ok(page.url().endsWith('?year=2007'), '失敗しても URL の年度は残す');
  assert.ok(await page.isHidden('#heya-sample'));
  // もう一度
  mode = 'ok';
  await page.click('#heya-retry');
  await page.waitForFunction(() => window.HEYA.S.year === 2007);
  assert.ok(await page.isHidden('#heya-error'));
  assert.ok(await page.isHidden('#heya-sample'), '本番のデータではサンプルのお知らせを出さない');
  assert.deepStrictEqual((await roomState(page)).find((r) => r.no === '305').tags, ['先輩A']);
  assert.ok(await page.isEnabled('#year-select'));
  assert.deepStrictEqual(errors, []);
  await ctx.close();
}

// ── 寮さんぽ ─────────────────────────────────────
const dbg = (page) => page.evaluate(() => {
  const d = window.DORM.debug;
  const dl = d.S.dialog;
  return { scene: d.S.scene, map: d.S.mapId, x: d.S.p.x, y: d.S.p.y, fade: !!d.S.fade, dialog: dl ? dl.lines.map((l) => l.text) : null, name: dl ? dl.lines[dl.i].name : null, i: dl ? dl.i : -1, hud: document.getElementById('hud-loc').textContent };
});
async function startSanpo(page) {
  await page.waitForFunction(() => window.DORM && window.DORM.debug);
  await page.click('#start-btn');
  for (let i = 0; i < 30; i++) {
    const s = await dbg(page);
    if (s.scene === 'play' && !s.fade && !s.dialog) return;
    if (s.dialog) await page.keyboard.press('KeyZ');
    await page.waitForTimeout(80);
  }
  throw new Error('寮さんぽが始まらない');
}
async function waitIdle(page) {
  await page.waitForFunction(() => { const S = window.DORM.debug.S; return !S.fade && !S.p.move && !S.path.length && !S.pending; }, null, { timeout: 8000 });
}
// 会話を最後まで読み、全部の行を返す
async function readDialog(page) {
  const seen = [];
  for (let i = 0; i < 20; i++) {
    const s = await dbg(page);
    if (!s.dialog) return seen;
    if (!seen.length) seen.push(...s.dialog);
    await page.keyboard.press('KeyZ');
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(40);
  }
  throw new Error('会話が終わらない');
}
// マス (tx, ty) を画面でタップする
async function tapTile(page, tx, ty) {
  const p = await page.evaluate(([tx, ty]) => {
    const d = window.DORM.debug, r = document.getElementById('screen').getBoundingClientRect();
    return { x: r.left + ((tx * 16 + 8 - d.S.cam.x) / d.VW) * r.width, y: r.top + ((ty * 16 + 8 - d.S.cam.y) / d.VH) * r.height };
  }, [tx, ty]);
  await page.touchscreen.tap(p.x, p.y);
}

async function sanpoYear(open) {
  // パソコン：ドアの前で A（Z キー）
  {
    const { page, errors } = await open('sanpo/?year=2005');
    assert.strictEqual(await page.textContent('.logo-home'), '◀ 部屋割り');
    assert.strictEqual(await page.getAttribute('.logo-home', 'href'), '../heya/?year=2005');
    assert.ok((await page.textContent('footer')).includes('フィクション'), '注記');
    await startSanpo(page);
    assert.ok((await dbg(page)).hud.startsWith('2005年度 '), 'HUD に年度 ' + (await dbg(page)).hud);
    await page.evaluate(() => window.DORM.debug.enterMap('3F', 14, 7, 'up'));
    await page.waitForTimeout(100);
    assert.strictEqual((await dbg(page)).hud, '2005年度 3F 廊下');
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(60);
    let s = await dbg(page);
    const names = SAMPLE[2005]['305'];
    assert.deepStrictEqual(s.dialog, ['コンコン…', '305号室（2005年度）\n' + names.join('\n')]);
    await page.keyboard.press('KeyZ');
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(400);
    const text = await page.textContent('#msg-text');
    assert.ok(text.includes('305号室（2005年度）') && text.includes(names[0]), '名前が画面に出る: ' + text);
    await shot(page, 'sanpo-knock');
    await readDialog(page);
    // わからない部屋（306 号室のドアは廊下の下側）
    await page.evaluate(() => window.DORM.debug.enterMap('3F', 11, 8, 'down'));
    await page.keyboard.press('KeyZ');
    s = await dbg(page);
    assert.deepStrictEqual(s.dialog.slice(0, 2), ['コンコン…', '返事がない。']);
    await readDialog(page);
    // 部屋の中からはノックしない（ドアを通って出入りできる）
    await page.evaluate(() => window.DORM.debug.enterMap('3F', 14, 5, 'down'));
    await page.keyboard.press('KeyZ');
    assert.strictEqual((await dbg(page)).dialog, null, '部屋の中からはノックしない');
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(260);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(400);
    assert.ok((await dbg(page)).y >= 6, 'ドアを通れる');
    assert.deepStrictEqual(realErrors(errors), [], 'エラーなし（寮さんぽ・年度）');
  }
  // スマホ：ドアをタップするとノック
  {
    const { page, errors } = await open('sanpo/?year=2005', { phone: true });
    await startSanpo(page);
    await page.evaluate(() => window.DORM.debug.enterMap('2F', 6, 8, 'right'));
    await page.waitForTimeout(150);
    const room = Object.keys(SAMPLE[2005]).find((n) => n === '208' || n === '203');
    const door = { '208': [16, 9], '203': [9, 6] }[room];
    await tapTile(page, door[0], door[1]);
    await page.waitForFunction(() => window.DORM.debug.S.dialog, null, { timeout: 6000 });
    const s = await dbg(page);
    assert.deepStrictEqual(s.dialog, ['コンコン…', room + '号室（2005年度）\n' + SAMPLE[2005][room].join('\n')]);
    assert.ok(s.map === '2F' && s.y >= 7 && s.y <= 8, 'ノックは廊下から');
    await page.locator('#msg').tap();
    await page.locator('#msg').tap();
    await page.waitForTimeout(300);
    await shot(page, 'sanpo-knock-phone');
    assert.deepStrictEqual(realErrors(errors), [], 'エラーなし（寮さんぽ・スマホ）');
  }
}

// 年度なし：今までどおり遊べる（はじめる → 寮に入る → 管理人さんと話す）
async function sanpoPlain(open) {
  const { page, errors } = await open('sanpo/');
  assert.strictEqual(await page.textContent('.logo-home'), '◀ ホーム');
  await startSanpo(page);
  let s = await dbg(page);
  assert.strictEqual(s.map, 'EXT');
  assert.ok(!/年度/.test(s.hud), '年度なしでは HUD に年度を出さない');
  await page.evaluate(() => window.DORM.debug.tapTile(31, 11, null));
  await page.waitForFunction(() => window.DORM.debug.S.mapId === '1F' && !window.DORM.debug.S.fade, null, { timeout: 8000 });
  await waitIdle(page);
  await page.evaluate(() => { const d = window.DORM.debug; d.tapTile(22, 5, d.npcs.find((n) => n.id === 'kanri')); });
  await page.waitForFunction(() => window.DORM.debug.S.dialog, null, { timeout: 8000 });
  s = await dbg(page);
  assert.strictEqual(s.name, '管理人さん');
  assert.ok(s.dialog[0].includes('新入生'));
  await readDialog(page);
  assert.ok(await page.evaluate(() => window.DORM.debug.S.flags.metKanri), '管理人さんに会えた');
  // ノック：年度なしでは返事がない（同室の先輩がいる部屋は返事がある）
  await page.evaluate(() => window.DORM.debug.enterMap('3F', 9, 7, 'up'));
  await page.keyboard.press('KeyZ');
  assert.deepStrictEqual((await dbg(page)).dialog, ['コンコン…返事がない。']);
  await readDialog(page);
  await page.evaluate(() => window.DORM.debug.enterMap('3F', 14, 7, 'up'));
  await page.keyboard.press('KeyZ');
  assert.deepStrictEqual((await dbg(page)).dialog, ['コンコン…', '「開いてるよー」']);
  await readDialog(page);
  // 年度なしでドアをタップしたら、今までどおりドアまで歩く
  await page.evaluate(() => window.DORM.debug.tapTile(9, 6, null));
  await waitIdle(page);
  s = await dbg(page);
  assert.ok(s.x === 9 && s.y === 6 && !s.dialog, 'ドアまで歩く');
  // 廊下の東のつきあたりの非常口：1階は外（建物の東の面の下）に出られて、もどれる。2階・3階は調べるだけ
  await page.evaluate(() => window.DORM.debug.enterMap('1F', 53, 8, 'right'));
  await page.evaluate(() => window.DORM.debug.tapTile(55, 8, null));
  await page.waitForFunction(() => window.DORM.debug.S.mapId === 'EXT' && !window.DORM.debug.S.fade, null, { timeout: 8000 });
  await waitIdle(page);
  s = await dbg(page);
  assert.ok(s.x === 60 && s.y === 12, '1階の非常口から外へ: ' + JSON.stringify(s));
  await page.evaluate(() => window.DORM.debug.tapTile(60, 11, null));
  await page.waitForFunction(() => window.DORM.debug.S.mapId === '1F' && !window.DORM.debug.S.fade, null, { timeout: 8000 });
  await waitIdle(page);
  s = await dbg(page);
  assert.ok(s.x === 54 && s.y === 8, '外から1階の非常口で中へ: ' + JSON.stringify(s));
  await page.evaluate(() => window.DORM.debug.enterMap('2F', 54, 7, 'right'));
  await page.keyboard.press('KeyZ');
  assert.ok(/非常口/.test(((await dbg(page)).dialog || [])[0] || ''), '2階の非常口は調べられる');
  await readDialog(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  s = await dbg(page);
  assert.ok(s.map === '2F' && s.x === 54, '2階の非常口からは出られない');
  assert.deepStrictEqual(realErrors(errors), [], 'エラーなし（寮さんぽ）');
}

withSite(PORT, async ({ open, browser, base }) => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const steps = [
    ['部屋割り（パソコン）', () => heyaDesktop(open)],
    ['部屋割り（スマホ）', () => heyaPhone(open)],
    ['名前のエスケープ・データのそろえ方・フォームの URL', () => heyaSafety(browser, base)],
    ['読み込み中・失敗・もう一度', () => heyaLive(browser, base)],
    ['寮さんぽ（年度つき）', () => sanpoYear(open)],
    ['寮さんぽ（年度なし）', () => sanpoPlain(open)],
  ];
  for (const [name, fn] of steps) {
    await fn();
    console.log('ok -', name);
  }
}).then(() => {
  console.log('heya: all ok');
}).catch((e) => {
  console.error('NG:', e && e.stack ? e.stack : e);
  process.exit(1);
});
