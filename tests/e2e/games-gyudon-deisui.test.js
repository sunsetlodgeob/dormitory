/*
 * ミニゲーム「財布がない」（gyudon）と「同期Bをさがせ」（deisui）の確認
 *   node tests/e2e/games-gyudon-deisui.test.js
 *   SHOTS_DIR=/tmp/shots node tests/e2e/games-gyudon-deisui.test.js   … スクリーンショットも撮る（リポジトリの外に）
 *   ONLY=gyudon node tests/e2e/games-gyudon-deisui.test.js           … 片方だけ
 * ふつうの操作（キーボード・画面のボタン・タップ）で、クリアとしっぱいの両方にたどり着けること、
 * パソコンとスマホの大きさでエラーが出ないことを確かめる。
 */
const fs = require('fs');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8812; // ARCH.md の割り当て（ミニゲームは 8811〜8815）
const SHOTS = process.env.SHOTS_DIR || '';
const ONLY = process.env.ONLY || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

function check(cond, msg) {
  if (!cond) throw new Error('NG: ' + msg);
  console.log('  ok  ' + msg);
}
async function shot(page, name) {
  if (SHOTS) await page.locator('#otk-canvas').screenshot({ path: path.join(SHOTS, name + '.png') });
}
async function waitFor(page, fn, arg, timeout = 15000) {
  await page.waitForFunction(fn, arg, { timeout, polling: 20 });
}
const waitScene = (page, name, timeout) => waitFor(page, (n) => window.OTK && OTK.debug && OTK.debug.scene === n, name, timeout);
// いまのミニゲームを、種を決めて、説明をとばして始めなおす
async function restart(page, id, seed) {
  await page.evaluate(([i, s]) => { OTK.debug.speed = 1; OTK.debug.seed(s); OTK.debug.start(i, { quick: true }); }, [id, seed]);
  await waitScene(page, 'play');
  await waitFor(page, () => OTK.debug.run && OTK.debug.run.phase === 'play' && OTK.debug.run.t > 0.05);
}
const result = (page) => page.evaluate(() => (OTK.debug.run ? { result: OTK.debug.run.result, msg: OTK.debug.run.msg } : null));
// 画面が真っ黒・一色だけになっていないか
async function canvasColors(page) {
  return page.evaluate(() => {
    const c = document.getElementById('otk-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 37) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  });
}
// 鳴らした効果音の名前を記録する（音そのものは確かめられないので、鳴らそうとしたかを見る）
async function spySfx(page) {
  await page.evaluate(() => {
    window.__sfx = [];
    const orig = OTK.audio.sfx;
    OTK.audio.sfx = (name) => { window.__sfx.push(name); return orig(name); };
  });
}
// 幅 360px のスマホで、ページが横にはみ出さず、ゲーム画面が全部見えるか
async function check360(browser, base, rel) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  await page.goto(base + rel);
  await waitScene(page, 'play');
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const r = document.getElementById('otk-canvas').getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, left: r.left, right: r.right };
  });
  check(m.sw <= 360 && m.left >= 0 && m.right <= 360, '幅 360px：横にはみ出さない（' + Math.round(m.left) + '〜' + Math.round(m.right) + 'px）');
  check(errors.length === 0, '幅 360px：エラーなし');
  await ctx.close();
}
// 要素のまん中を、指（マウス）でおしっぱなしにする
async function holdAt(page, selector) {
  const b = await page.locator(selector).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
}

// ── 財布がない（gyudon） ────────────────────────────────
// 店員も客もこっちを見ていない間だけ進むボット。見えている合図（「！」「？」）だけで判断する
async function gyudonBot(page, startMove, stopMove, label) {
  let moving = false;
  const seen = { tell: false, watch: false, glance: false };
  for (let i = 0; i < 3000; i++) {
    const s = await page.evaluate(() => {
      const g = OTK.debug.game;
      return { res: OTK.debug.run.result, x: g.me.x, tenin: g.tenin.state, kyaku: g.kyaku.map((k) => k.state) };
    });
    if (s.res) break;
    const busy = s.tenin === 'kitchen' && s.kyaku.every((k) => k === 'eat');
    if (busy && !moving) { await startMove(); moving = true; }
    if (!busy && moving) { await stopMove(); moving = false; }
    // 見どころをスクリーンショットに
    if (s.tenin === 'tell' && !seen.tell) { seen.tell = true; await page.waitForTimeout(150); await shot(page, label + '-tell'); }
    if (s.tenin === 'watch' && !seen.watch && s.x > 40) { seen.watch = true; await page.waitForTimeout(300); await shot(page, label + '-watch'); }
    if (s.kyaku.includes('tell') && !seen.glance) { seen.glance = true; await shot(page, label + '-glance'); }
    await page.waitForTimeout(15);
  }
  if (moving) await stopMove();
  return seen;
}

async function gyudonDesktop(open) {
  console.log('財布がない（パソコン・キーボード）');
  const { page, errors } = await open('game/?play=gyudon&seed=11', { wait: 300 });
  await waitScene(page, 'intro');
  await shot(page, 'gyudon-intro');
  await page.keyboard.press('KeyZ');
  await waitScene(page, 'countdown');
  await shot(page, 'gyudon-countdown');
  await waitScene(page, 'play');
  await page.waitForTimeout(300);
  await shot(page, 'gyudon-start');
  check((await canvasColors(page)) > 12, 'お店の絵が描けている');
  // 音のオン・オフ（ボタン）。切りかえてもゲームは続く
  const pressed = () => page.locator('#otk-sound').getAttribute('aria-pressed');
  const before = await pressed();
  await page.locator('#otk-sound').click();
  const after = await pressed();
  await page.locator('#otk-sound').click();
  check(before !== after && (await pressed()) === before && (await page.evaluate(() => OTK.debug.scene)) === 'play', '音のボタンでオン・オフできる（' + before + ' → ' + after + '）');
  await spySfx(page);

  // クリア：見られていない間だけ → をおす
  const seen = await gyudonBot(page, () => page.keyboard.down('ArrowRight'), () => page.keyboard.up('ArrowRight'), 'gyudon');
  let r = await result(page);
  check(r && r.result === 'win', '見られていない間だけ進むと、外に出られる（' + (r && r.result) + '）');
  check(seen.tell, '店員がふり向く前に「！」の合図が出る');
  const rattles = await page.evaluate(() => window.__sfx.filter((n) => n === 'cursor').length);
  check(rattles >= 4, '合図の間、鍋のふたがカタカタ鳴る（' + rattles + ' 回）');
  await page.waitForTimeout(900);
  await shot(page, 'gyudon-escape');
  await waitScene(page, 'result', 8000);
  r = await result(page);
  check(/払いに/.test(r.msg), 'クリアのあとに「翌日、ちゃんと払いに行きました」');
  await page.waitForTimeout(500);
  await shot(page, 'gyudon-result-win');

  // しっぱい：→ をおしっぱなし
  await restart(page, 'gyudon', 11);
  await page.keyboard.down('ArrowRight');
  await waitFor(page, () => OTK.debug.run.result, null, 15000);
  await page.keyboard.up('ArrowRight');
  r = await result(page);
  check(r.result === 'lose' && /店員に見つかった/.test(r.msg), '見られているのに進むと、店員に見つかる');
  await page.waitForTimeout(400);
  await shot(page, 'gyudon-caught');
  await waitScene(page, 'result', 8000);
  await shot(page, 'gyudon-result-lose');

  // 客のふり返り：客が見ている間に進むと見つかる
  let glanced = false;
  for (let seed = 1; seed <= 40 && !glanced; seed++) {
    await restart(page, 'gyudon', seed);
    let moving = false;
    for (let i = 0; i < 2000; i++) {
      const s = await page.evaluate(() => { const g = OTK.debug.game; return { res: OTK.debug.run.result, tenin: g.tenin.state, kyaku: g.kyaku.map((k) => k.state) }; });
      if (s.res) break;
      // 店員だけを気にして、客は見ない（客が見ているときに進んでしまう）
      const go = s.tenin === 'kitchen';
      if (go && !moving) { await page.keyboard.down('ArrowRight'); moving = true; }
      if (!go && moving) { await page.keyboard.up('ArrowRight'); moving = false; }
      await page.waitForTimeout(15);
    }
    if (moving) await page.keyboard.up('ArrowRight');
    r = await result(page);
    if (r.result === 'lose' && /客に見つかった/.test(r.msg)) {
      glanced = true;
      await page.waitForTimeout(400);
      await shot(page, 'gyudon-caught-kyaku');
    }
  }
  check(glanced, 'ふり返った客に見られても、見つかる');

  // 時間切れ：じっとしていると、時間切れでしっぱい（早送り）
  await restart(page, 'gyudon', 3);
  await page.evaluate(() => { OTK.debug.speed = 6; });
  await waitFor(page, () => OTK.debug.run.result, null, 20000);
  await page.evaluate(() => { OTK.debug.speed = 1; });
  r = await result(page);
  check(r.result === 'lose' && /お会計/.test(r.msg), '時間切れでしっぱい（' + r.msg.replace(/\n/g, ' ') + '）');

  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：' + errs.join(' / ') : ''));
  await page.context().close();
}

async function gyudonPhone(open) {
  console.log('財布がない（スマホ・画面のボタン）');
  const { page, errors } = await open('game/?play=gyudon&quick=1&seed=21', { phone: true, wait: 300 });
  await waitScene(page, 'play');
  await page.waitForTimeout(200);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'gyudon-phone-page.png') });
  // クリア：A ボタンをおしっぱなしにして進む
  await gyudonBot(page, () => holdAt(page, '[data-otk-key="a"]'), () => page.mouse.up(), 'gyudon-phone');
  let r = await result(page);
  check(r.result === 'win', 'スマホ：A ボタンをおす間だけ進んで、外に出られる');
  // しっぱい：画面をおしっぱなし
  await waitScene(page, 'result', 8000);
  await restart(page, 'gyudon', 21);
  await holdAt(page, '#otk-canvas');
  await waitFor(page, () => OTK.debug.run.result, null, 15000);
  await page.mouse.up();
  r = await result(page);
  check(r.result === 'lose', 'スマホ：画面をおしっぱなしでも進む（見られて、しっぱい）');
  await shot(page, 'gyudon-phone-caught');
  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：' + errs.join(' / ') : ''));
  await page.context().close();
}

// ── 同期Bをさがせ（deisui） ───────────────────────────────
const HOME = 5; // 金沢八景
const dstate = (page) => page.evaluate(() => {
  const g = OTK.debug.game;
  return { cur: g.st.cur, mode: g.st.mode, trains: g.st.trains, clues: g.st.clues.slice(), searched: Object.assign({}, g.st.searched), msg: g.st.msgT > 0 ? g.st.msg : '', bAt: g.bAt, side: g.side, dist: g.dist, res: OTK.debug.run.result };
});
const waitIdle = (page) => waitFor(page, () => { const g = OTK.debug.game; return OTK.debug.run.result || (g.st.mode === 'idle' && !g.st.out); }, null, 8000);
// 1 回ぶんの操作（'left' 'right' 'a'）をして、終わるのを待つ。act は操作のしかた（キー・タップ・ボタン）
async function dstep(page, act, what) {
  await waitIdle(page);
  await act(what);
  await page.waitForTimeout(60);
  await waitIdle(page);
}
// 落とし物を手がかりに、同期Bをさがす（わざと、反対側から先に見る）
async function deisuiSolve(page, act, label) {
  const s0 = await dstate(page);
  const wrong = s0.side > 0 ? 'left' : 'right', right = s0.side > 0 ? 'right' : 'left';
  await dstep(page, act, wrong);
  await shot(page, label + '-arrive');
  await dstep(page, act, 'a');
  let s = await dstate(page);
  check(s.cur === HOME - s0.side && ['none', 'oji'].includes(s.searched[s.cur]), '反対側の 1 駅目には、何もない（' + s.msg + '）');
  await shot(page, label + '-nothing');
  await dstep(page, act, right);
  await dstep(page, act, right);
  for (let k = 1; k <= s0.dist; k++) {
    await dstep(page, act, 'a');
    s = await dstate(page);
    if (k < s0.dist) {
      check(s.searched[s.cur] === 'clue' && s.clues.length === k, k + ' 駅目に落とし物（' + s.msg + '）');
      if (k === 1) await shot(page, label + '-clue');
      await dstep(page, act, right);
    }
  }
  await waitFor(page, () => OTK.debug.run.result, null, 5000);
  await page.waitForTimeout(500);
  await shot(page, label + '-found');
  return dstate(page);
}

async function deisuiDesktop(open) {
  console.log('同期Bをさがせ（パソコン・キーボード）');
  const { page, errors } = await open('game/?play=deisui&seed=5', { wait: 300 });
  await waitScene(page, 'intro');
  await shot(page, 'deisui-intro');
  await page.keyboard.press('Enter');
  await waitScene(page, 'play', 8000);
  await page.waitForTimeout(300);
  await shot(page, 'deisui-start');
  check((await canvasColors(page)) > 12, '路線図と駅の絵が描けている');
  const keys = { left: 'ArrowLeft', right: 'ArrowRight', a: 'KeyZ' };
  const act = (w) => page.keyboard.press(keys[w]);

  // 電車に乗っているところ
  await act('right');
  await page.waitForTimeout(500);
  await shot(page, 'deisui-ride');
  await waitIdle(page);
  await act('left');
  await waitIdle(page);

  // クリア（いろいろな種で）
  for (const seed of [5, 8, 13]) {
    await restart(page, 'deisui', seed);
    const before = await dstate(page);
    const s = await deisuiSolve(page, act, 'deisui-' + seed);
    check(s.res === 'win', '種 ' + seed + '：' + (before.side > 0 ? '下り' : '上り') + before.dist + '駅目の同期Bを見つけてクリア（のこり ' + s.trains + ' 本、落とし物 ' + s.clues.length + ' こ）');
    check(s.clues.length === before.dist - 1, '八景と同期Bの間の駅に、落とし物が ' + (before.dist - 1) + ' こ');
  }
  await waitScene(page, 'result', 8000);
  let r = await result(page);
  check(/パンツ/.test(r.msg), 'クリアのひとこと（' + r.msg.replace(/\n/g, ' ') + '）');
  await page.waitForTimeout(400);
  await shot(page, 'deisui-result-win');

  // しっぱい：電車を使いきる（八景と反対側の駅を行ったり来たり）
  await restart(page, 'deisui', 5);
  let s = await dstate(page);
  const wrong = s.side > 0 ? 'left' : 'right', back = s.side > 0 ? 'right' : 'left';
  while ((await dstate(page)).trains > 0) {
    s = await dstate(page);
    await dstep(page, act, s.cur === HOME ? wrong : back);
  }
  s = await dstate(page);
  await act(s.cur === HOME ? wrong : back);
  await page.waitForTimeout(100);
  s = await dstate(page);
  check(s.trains === 0 && /電車がない/.test(s.msg) && !s.res, '電車がなくなると、もう乗れない');
  await shot(page, 'deisui-no-train');
  await act('a'); // さがしても、ここにはいない
  await waitFor(page, () => OTK.debug.run.result, null, 8000);
  r = await result(page);
  check(r.result === 'lose' && /終電/.test(r.msg), '終電がなくなって、しっぱい');
  await page.waitForTimeout(400);
  await shot(page, 'deisui-lose');
  await waitScene(page, 'result', 8000);
  await shot(page, 'deisui-result-lose');

  // 時間切れ（早送り）
  await restart(page, 'deisui', 6);
  await page.evaluate(() => { OTK.debug.speed = 8; });
  await waitFor(page, () => OTK.debug.run.result, null, 20000);
  await page.evaluate(() => { OTK.debug.speed = 1; });
  r = await result(page);
  check(r.result === 'lose' && /朝/.test(r.msg), '時間切れでしっぱい（' + r.msg.replace(/\n/g, ' ') + '）');

  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：' + errs.join(' / ') : ''));
  await page.context().close();
}

async function deisuiPhone(open) {
  console.log('同期Bをさがせ（スマホ・タップと画面のボタン）');
  const { page, errors } = await open('game/?play=deisui&quick=1&seed=9', { phone: true, wait: 300 });
  await waitScene(page, 'play');
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'deisui-phone-page.png') });
  const cv = page.locator('#otk-canvas');
  const box = await cv.boundingBox();
  const k = box.width / 256;
  // 画面の下（駅）の左はし・右はしをタップで移動、A ボタンでさがす
  const act = async (w) => {
    if (w === 'a') await page.locator('[data-otk-key="a"]').tap();
    else await cv.tap({ position: { x: (w === 'left' ? 20 : 236) * k, y: 170 * k } });
  };
  const s0 = await dstate(page);
  const s = await deisuiSolve(page, act, 'deisui-phone');
  check(s.res === 'win', 'スマホ：タップと A ボタンで、同期Bを見つけてクリア（' + (s0.side > 0 ? '下り' : '上り') + s0.dist + '駅目）');
  // 路線図のタップと十字キーでも動ける
  await waitScene(page, 'result', 8000);
  await restart(page, 'deisui', 9);
  const dp = page.locator('#otk-dpad');
  const db = await dp.boundingBox();
  await dp.tap({ position: { x: db.width * 0.88, y: db.height / 2 } });
  await page.waitForTimeout(60);
  await waitIdle(page);
  let st = await dstate(page);
  check(st.cur === HOME + 1, 'スマホ：十字キーの右で、下りの駅へ');
  await cv.tap({ position: { x: (18 + (HOME + 1) * 22) * k, y: 60 * k } }); // 路線図の、いまの駅をタップ → さがす
  await page.waitForTimeout(60);
  await waitIdle(page);
  st = await dstate(page);
  check(!!st.searched[HOME + 1] || st.res === 'win', 'スマホ：路線図のいまの駅をタップすると、さがす');
  if (!st.res) {
    // ベンチ（寝ている人）をタップしても、移動せずにさがす
    await dp.tap({ position: { x: db.width * 0.88, y: db.height / 2 } });
    await page.waitForTimeout(60);
    await waitIdle(page);
    await cv.tap({ position: { x: 190 * k, y: 166 * k } });
    await page.waitForTimeout(60);
    await waitIdle(page);
    st = await dstate(page);
    check(st.cur === HOME + 2 && (!!st.searched[HOME + 2] || st.res === 'win'), 'スマホ：ベンチをタップすると、さがす（移動しない）');
  }
  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：' + errs.join(' / ') : ''));
  await page.context().close();
}

withSite(PORT, async ({ open, browser, base }) => {
  if (!ONLY || ONLY === 'gyudon') {
    await gyudonDesktop(open);
    await gyudonPhone(open);
    await check360(browser, base, 'game/?play=gyudon&quick=1&seed=2');
  }
  if (!ONLY || ONLY === 'deisui') {
    await deisuiDesktop(open);
    await deisuiPhone(open);
    await check360(browser, base, 'game/?play=deisui&quick=1&seed=2');
  }
  console.log('すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
