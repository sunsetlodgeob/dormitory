/*
 * ミニゲーム「全裸コンビニ」（conveni）と「寮ゾンビ」（zombie）の確認
 *   node tests/e2e/games-conveni-zombie.test.js
 *   SHOTS_DIR=/tmp/shots node tests/e2e/games-conveni-zombie.test.js   … スクリーンショットも撮る（リポジトリの外に）
 *   ONLY=conveni node tests/e2e/games-conveni-zombie.test.js           … 片方だけ
 *   NO_PHONE=1 …スマホの確認をとばす
 * ふつうの操作（キーボード・画面のボタン・タップ）で、クリアとしっぱいの両方にたどり着けること、
 * パソコンとスマホの大きさでエラーが出ないことを確かめる。
 * ボットは画面に見えているもの（赤い輪・じゃま物・ゾンビの位置）だけを見て動く。連打は人と同じくらいの速さ。
 */
const fs = require('fs');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8813; // ARCH.md の割り当て（ミニゲームは 8811〜8815）
const SHOTS = process.env.SHOTS_DIR || '';
const ONLY = process.env.ONLY || '';
const NO_PHONE = !!process.env.NO_PHONE;
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
// 種を決めて、説明をとばして始めなおす
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
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

// ── 操作のしかた（キーボード／画面のボタン） ─────────────────────
function keyboardCtl(page) {
  const held = new Set();
  const KEY = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
  return {
    name: 'キーボード',
    tap: (k) => page.keyboard.press(k === 'a' ? 'KeyZ' : KEY[k]),
    async setDir(want) {
      for (const k of Object.keys(KEY)) {
        const on = want.includes(k);
        if (on && !held.has(k)) { held.add(k); await page.keyboard.down(KEY[k]); }
        if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(KEY[k]); }
      }
    },
    async release() { await this.setDir([]); },
  };
}
// スマホ：十字キーは指（マウス）でおさえたまま動かし、A ボタンはタッチでたたく
async function padCtl(page) {
  const pad = center(await page.locator('#otk-dpad').boundingBox());
  const padR = (await page.locator('#otk-dpad').boundingBox()).width / 2;
  const btnA = center(await page.locator('[data-otk-key="a"]').boundingBox());
  let down = false, cur = '';
  const at = (dirs) => {
    const dx = (dirs.includes('right') ? 1 : 0) - (dirs.includes('left') ? 1 : 0);
    const dy = (dirs.includes('down') ? 1 : 0) - (dirs.includes('up') ? 1 : 0);
    const n = Math.hypot(dx, dy) || 1;
    return { x: pad.x + (dx / n) * padR * 0.6, y: pad.y + (dy / n) * padR * 0.6 };
  };
  return {
    name: '画面のボタン',
    async tap(k) {
      if (k === 'a') return page.touchscreen.tap(btnA.x, btnA.y);
      const p = at([k]);
      return page.touchscreen.tap(p.x, p.y);
    },
    async setDir(want) {
      const key = want.slice().sort().join(' ');
      if (key === cur) return;
      cur = key;
      if (!want.length) {
        if (down) { await page.mouse.up(); down = false; }
        return;
      }
      const p = at(want);
      await page.mouse.move(p.x, p.y);
      if (!down) { await page.mouse.down(); down = true; }
    },
    async release() { await this.setDir([]); },
  };
}

// ── 全裸コンビニ（conveni） ────────────────────────────────
const LANES = [64, 96, 128, 160, 192];
// 赤い輪とじゃま物をよけ、mash 回/秒で A を連打する（0 なら連打しない）
async function conveniBot(page, ctl, o) {
  o = o || {};
  const seen = { marker: false, multi: false, switch: false, chase: false, obstacle: false, gate: false, bump: false, maxThrows: 0 };
  let lastMove = 0, lastMash = 0;
  for (let i = 0; i < 6000; i++) {
    const s = await page.evaluate(() => {
      const g = OTK.debug.game, r = OTK.debug.run;
      return {
        res: r.result, t: r.t, phase: g.phase, lane: g.me.lane, x: g.me.x, dist: g.dist, goal: g.goal, gap: g.gap, bumps: g.bumps,
        balls: g.balls.filter((b) => !b.out).map((b) => ({ tx: b.tx, left: b.dur - b.t })),
        obs: g.obs.filter((ob) => !ob.hit).map((ob) => ({ lane: ob.lane, dy: ob.wy - g.dist })),
      };
    });
    if (s.res) break;
    const danger = new Set();
    if (s.phase === 'balls') s.balls.forEach((b) => danger.add(LANES.indexOf(b.tx)));
    else s.obs.forEach((ob) => { if (ob.dy > -8 && ob.dy < 75) danger.add(ob.lane); });
    let best = s.lane, bd = 99;
    for (let ln = 0; ln < 5; ln++) {
      if (danger.has(ln)) continue;
      const d = Math.abs(ln - s.lane) + Math.abs(ln - 2) * 0.1;
      if (d < bd) { bd = d; best = ln; }
    }
    // となりの列にもうすぐボールが落ちるなら、落ちてから通りぬける
    const step = best < s.lane ? -1 : 1;
    const busy = s.phase === 'balls' && s.balls.some((b) => LANES.indexOf(b.tx) === s.lane + step && b.left < 0.2);
    if (!o.still && best !== s.lane && !busy && Date.now() - lastMove > 45) {
      lastMove = Date.now();
      await ctl.tap(step < 0 ? 'left' : 'right');
    }
    if (o.mash && (s.phase === 'chase' || s.phase === 'switch') && Date.now() - lastMash > 1000 / o.mash) {
      lastMash = Date.now();
      await ctl.tap('a');
    }
    // 見どころをスクリーンショットに
    const label = o.label || 'conveni';
    if (s.balls.length && s.balls.some((b) => b.left < 0.45) && !seen.marker) { seen.marker = true; await shot(page, label + '-ball'); }
    if (s.balls.length >= 2) seen.multi = true;
    if (s.phase === 'switch' && !seen.switch && s.t > 15.4) { seen.switch = true; await shot(page, label + '-switch'); }
    if (s.phase === 'chase') seen.chase = true;
    if (s.phase === 'chase' && s.obs.some((ob) => ob.dy > 20 && ob.dy < 110) && !seen.obstacle) { seen.obstacle = true; await shot(page, label + '-obstacle'); }
    if (s.goal && s.goal - s.dist < 110 && !seen.gate) { seen.gate = true; await shot(page, label + '-gate'); }
    if (s.bumps > 0) seen.bump = true;
    await page.waitForTimeout(8);
  }
  return seen;
}

async function conveniDesktop(open) {
  console.log('全裸コンビニ（パソコン・キーボード）');
  const { page, errors } = await open('game/?play=conveni&seed=21', { wait: 300 });
  await waitScene(page, 'intro');
  await page.waitForTimeout(500);
  await shot(page, 'conveni-intro');
  await page.keyboard.press('KeyZ');
  await waitScene(page, 'countdown');
  await page.waitForTimeout(300);
  await shot(page, 'conveni-countdown');
  await waitScene(page, 'play');
  await page.waitForTimeout(400);
  await shot(page, 'conveni-start');
  check((await canvasColors(page)) > 12, '夜の道とコンビニが描けている');
  const ctl = keyboardCtl(page);

  // クリア：赤い輪をよけ、後半は 7 回/秒で連打してじゃま物をよける
  const seen = await conveniBot(page, ctl, { mash: 7 });
  let r = await result(page);
  check(r && r.result === 'win', 'ボールをよけて連打すると、寮に逃げこめる（' + (r && r.result) + '）');
  check(seen.marker && seen.multi, '落ちる所に赤い輪が出る。2 つ以上いっしょに来ることもある');
  check(seen.switch && seen.chase && seen.obstacle, '後半はおまわりさんが来て、じゃま物が出る');
  const st = await page.evaluate(() => ({ dodged: OTK.debug.game.dodged, t: OTK.debug.run.t }));
  check(st.dodged >= 12, 'ボールを ' + st.dodged + ' 個よけた');
  check(st.t < 34, '時間内（' + st.t.toFixed(1) + ' 秒）に着く');
  await page.waitForTimeout(1200);
  await shot(page, 'conveni-safe');
  await waitScene(page, 'result', 8000);
  r = await result(page);
  check(/寮の門/.test(r.msg), 'クリアのひとこと：' + r.msg.replace(/\n/g, ''));
  await page.waitForTimeout(500);
  await shot(page, 'conveni-result-win');

  // しっぱい 1：何もしないと、カラーボールが当たる
  await restart(page, 'conveni', 21);
  await waitFor(page, () => OTK.debug.run.result, null, 8000);
  r = await result(page);
  check(r.result === 'lose' && /命中/.test(r.msg), 'よけないとカラーボールが当たる');
  check(await page.evaluate(() => OTK.debug.game.me.splat), 'ペンキまみれになる');
  await page.waitForTimeout(500);
  await shot(page, 'conveni-splat');

  // しっぱい 2：ボールはよけても、連打しないとおまわりさんにつかまる
  await restart(page, 'conveni', 22);
  await conveniBot(page, ctl, { mash: 0, label: 'conveni-nomash' });
  r = await result(page);
  check(r.result === 'lose' && /おまわりさん/.test(r.msg), '連打しないと、おまわりさんにつかまる');
  await page.waitForTimeout(600);
  await shot(page, 'conveni-caught');

  // じゃま物にぶつかると転ぶ（よけずに連打だけ。前半は早送りしてボールの所だけよける）
  await restart(page, 'conveni', 23);
  await page.evaluate(() => { OTK.debug.speed = 2; });
  await waitFor(page, () => OTK.debug.game.phase !== 'balls' || OTK.debug.run.result, null, 20000);
  await page.evaluate(() => { OTK.debug.speed = 1; });
  // 前半は当たってしまうかもしれないので、種を選んで後半だけ見る
  let bumped = false;
  if (!(await page.evaluate(() => OTK.debug.run.result))) {
    for (let i = 0; i < 600; i++) {
      const s = await page.evaluate(() => ({ res: OTK.debug.run.result, bumps: OTK.debug.game.bumps, stumble: OTK.debug.game.me.stumbleT }));
      if (s.bumps > 0) { bumped = true; if (s.stumble > 0.3) await shot(page, 'conveni-bump'); break; }
      if (s.res) break;
      await ctl.tap('a');
      await page.waitForTimeout(100);
    }
  } else {
    // 早送りで前半に当たったときは、直接後半を見る
    bumped = null;
  }
  if (bumped !== null) check(bumped, 'じゃま物にぶつかると転ぶ');

  // 時間切れはしっぱい（自分でとめておく）
  await restart(page, 'conveni', 24);
  await page.evaluate(() => { const r = OTK.debug.run; r.t = r.def.time - 0.05; OTK.debug.game.timeup(); });
  await waitFor(page, () => OTK.debug.run.result, null, 3000);
  r = await result(page);
  check(r.result === 'lose', '時間切れはしっぱい');

  const errs = realErrors(errors);
  check(errs.length === 0, 'コンソールにエラーがない' + (errs.length ? '\n' + errs.join('\n') : ''));
}

async function conveniPhone(open) {
  console.log('全裸コンビニ（スマホ・画面のボタン）');
  const { page, errors } = await open('game/?play=conveni&seed=31', { phone: true, wait: 300 });
  await waitScene(page, 'intro');
  // A ボタンで始める（タッチ）
  const a = center(await page.locator('[data-otk-key="a"]').boundingBox());
  await page.touchscreen.tap(a.x, a.y);
  await waitScene(page, 'countdown');
  await waitScene(page, 'play');
  await page.waitForTimeout(200);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'conveni-phone-page.png') });
  const ctl = await padCtl(page);
  await conveniBot(page, ctl, { mash: 6, label: 'conveni-phone' });
  let r = await result(page);
  check(r && r.result === 'win', '十字キーと A ボタン（タッチ）で、寮に逃げこめる（' + (r && r.result) + '）');

  // 画面をおした所の列へ動く
  await restart(page, 'conveni', 32);
  const cv = await page.locator('#otk-canvas').boundingBox();
  await page.mouse.move(cv.x + cv.width * (64 / 256), cv.y + cv.height * 0.6);
  await page.mouse.down();
  await page.waitForTimeout(250);
  const lane = await page.evaluate(() => OTK.debug.game.me.lane);
  await page.mouse.up();
  check(lane === 0, '画面の左はしをおすと、左はしの列へ動く');
  await waitFor(page, () => OTK.debug.run.result, null, 8000);
  r = await result(page);
  check(r.result === 'lose', 'そのまま止まっていると、しっぱいになる');

  const errs = realErrors(errors);
  check(errs.length === 0, 'コンソールにエラーがない（スマホ）' + (errs.length ? '\n' + errs.join('\n') : ''));
}

// ── 寮ゾンビ（zombie） ────────────────────────────────
// いちばん近いゾンビの横へ行って、なぐる
async function zombieBot(page, ctl, o) {
  o = o || {};
  const seen = { stun: false, cured: false, spawn: false, hurt: false, offscreen: false, punchShot: false };
  let lastPunch = 0;
  for (let i = 0; i < 9000; i++) {
    const s = await page.evaluate(() => {
      const g = OTK.debug.game, r = OTK.debug.run;
      return {
        res: r.result, t: r.t, me: { x: g.me.x, y: g.me.y, hearts: g.me.hearts }, cured: g.cured, camX: g.camX, pending: g.pending, hurt: g.hurt,
        zs: g.zs.filter((z) => z.state !== 'cured').map((z) => ({ x: z.x, y: z.y, state: z.state, hp: z.hp })),
      };
    });
    if (s.res) break;
    const label = o.label || 'zombie';
    if (s.pending && !seen.spawn) { seen.spawn = true; await page.waitForTimeout(250); await shot(page, label + '-door'); }
    if (s.zs.some((z) => z.state === 'stun') && !seen.stun) { seen.stun = true; await shot(page, label + '-stun'); }
    if (s.cured > 0 && !seen.cured) { seen.cured = true; await page.waitForTimeout(200); await shot(page, label + '-cured'); }
    if (s.hurt > 0) seen.hurt = true;
    if (s.zs.some((z) => z.x - s.camX < -4 || z.x - s.camX > 260)) seen.offscreen = true;
    // ねらうゾンビ（部屋から出てくる途中のは後まわし）
    const cand = s.zs.filter((z) => z.state !== 'emerge');
    const list = cand.length ? cand : s.zs;
    let t = null, td = 1e9;
    list.forEach((z) => { const d = Math.hypot(z.x - s.me.x, (z.y - s.me.y) * 1.5); if (d < td) { td = d; t = z; } });
    if (!t) { await ctl.setDir([]); await page.waitForTimeout(16); continue; }
    const side = s.me.x <= t.x ? -1 : 1;
    const gx = t.x + side * 17, gy = t.y;
    const dx = gx - s.me.x, dy = gy - s.me.y;
    const want = [];
    if (dx < -3) want.push('left');
    if (dx > 3) want.push('right');
    if (dy < -3) want.push('up');
    if (dy > 3) want.push('down');
    const reach = Math.abs(t.y - s.me.y) <= 8 && Math.abs(t.x - s.me.x) <= 24 && t.state !== 'emerge';
    await ctl.setDir(reach ? [] : want);
    if (reach && Date.now() - lastPunch > (o.punchGap || 150)) {
      lastPunch = Date.now();
      await ctl.tap('a');
      if (!seen.punchShot) { seen.punchShot = true; await page.waitForTimeout(40); await shot(page, label + '-punch'); }
    }
    await page.waitForTimeout(10);
  }
  await ctl.release();
  return seen;
}

async function zombieDesktop(open) {
  console.log('寮ゾンビ（パソコン・キーボード）');
  const { page, errors } = await open('game/?play=zombie&seed=41', { wait: 300 });
  await waitScene(page, 'intro');
  await page.waitForTimeout(500);
  await shot(page, 'zombie-intro');
  await page.keyboard.press('KeyZ');
  await waitScene(page, 'countdown');
  await page.waitForTimeout(300);
  await shot(page, 'zombie-countdown');
  await waitScene(page, 'play');
  await page.waitForTimeout(700);
  await shot(page, 'zombie-start');
  check((await canvasColors(page)) > 12, '廊下とドアが描けている');
  const ctl = keyboardCtl(page);

  // 歩くと画面が動く（長い廊下）
  const cam0 = await page.evaluate(() => OTK.debug.game.camX);
  await ctl.setDir(['right']);
  await page.waitForTimeout(500);
  await ctl.release();
  const cam1 = await page.evaluate(() => OTK.debug.game.camX);
  check(cam1 > cam0, '右へ歩くと、廊下が流れる');

  const seen = await zombieBot(page, ctl, {});
  let r = await result(page);
  check(r && r.result === 'win', 'ゾンビを全員なぐると、クリア（' + (r && r.result) + '）');
  const st = await page.evaluate(() => ({ cured: OTK.debug.game.cured, total: OTK.debug.game.total, hits: OTK.debug.game.hits, t: OTK.debug.run.t, hearts: OTK.debug.game.me.hearts }));
  check(st.cured === st.total && st.total >= 8 && st.total <= 10, st.total + ' 人とも正気に戻った');
  check(st.hits >= st.total * 2, '1 人に 2 発ずつ当たった（' + st.hits + ' 発）');
  check(seen.stun && seen.cured && seen.spawn, '1 発目で目が回り、2 発目で正気に戻る。部屋から出てくる');
  console.log('      （' + st.t.toFixed(1) + ' 秒、のこりハート ' + st.hearts + '）');
  await page.waitForTimeout(1000);
  await shot(page, 'zombie-win');
  await waitScene(page, 'result', 8000);
  r = await result(page);
  check(/正気/.test(r.msg), 'クリアのひとこと：' + r.msg.replace(/\n/g, ''));
  await page.waitForTimeout(500);
  await shot(page, 'zombie-result-win');

  // しっぱい：じっとしていると、かまれてハートがなくなる（早送り）
  await restart(page, 'zombie', 41);
  await page.evaluate(() => { OTK.debug.speed = 4; });
  await waitFor(page, () => OTK.debug.game.hurt >= 1, null, 20000);
  await page.evaluate(() => { OTK.debug.speed = 1; });
  await page.waitForTimeout(120);
  await shot(page, 'zombie-bite');
  check(await page.evaluate(() => OTK.debug.game.me.hearts === 2), 'さわられると、ハートが 1 つ減る');
  await page.evaluate(() => { OTK.debug.speed = 4; });
  await waitFor(page, () => OTK.debug.run.result, null, 30000);
  await page.evaluate(() => { OTK.debug.speed = 1; });
  r = await result(page);
  check(r.result === 'lose' && /ゾンビ/.test(r.msg), 'ハートが 3 つなくなると、しっぱい');
  await page.waitForTimeout(500);
  await shot(page, 'zombie-lose');

  // 空ぶりもできる（だれもいない方へ A）
  await restart(page, 'zombie', 42);
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(100);
  const p = await page.evaluate(() => ({ punches: OTK.debug.game.punches, hits: OTK.debug.game.hits }));
  check(p.punches === 1 && p.hits === 0, 'A で空ぶりのパンチ');

  // 時間切れはしっぱい
  await page.evaluate(() => { const r = OTK.debug.run; r.t = r.def.time - 0.05; });
  await waitFor(page, () => OTK.debug.run.result, null, 3000);
  r = await result(page);
  check(r.result === 'lose' && /時間切れ/.test(r.msg), '時間切れはしっぱい');

  const errs = realErrors(errors);
  check(errs.length === 0, 'コンソールにエラーがない' + (errs.length ? '\n' + errs.join('\n') : ''));
}

async function zombiePhone(open) {
  console.log('寮ゾンビ（スマホ・画面のボタン）');
  const { page, errors } = await open('game/?play=zombie&seed=51', { phone: true, wait: 300 });
  await waitScene(page, 'intro');
  const a = center(await page.locator('[data-otk-key="a"]').boundingBox());
  await page.touchscreen.tap(a.x, a.y);
  await waitScene(page, 'play');
  await page.waitForTimeout(200);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'zombie-phone-page.png') });
  const ctl = await padCtl(page);
  await zombieBot(page, ctl, { label: 'zombie-phone', punchGap: 180 });
  let r = await result(page);
  check(r && r.result === 'win', '十字キーと A ボタン（タッチ）で、全員を正気に戻せる（' + (r && r.result) + '）');

  // 画面をおした方へ歩き、男魂くんの近くをタップするとパンチ
  await restart(page, 'zombie', 52);
  const cv = await page.locator('#otk-canvas').boundingBox();
  const x0 = await page.evaluate(() => OTK.debug.game.me.x);
  await page.mouse.move(cv.x + cv.width * 0.95, cv.y + cv.height * 0.5);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  const x1 = await page.evaluate(() => OTK.debug.game.me.x);
  check(x1 > x0 + 10, '画面の右をおすと、右へ歩く');
  const me = await page.evaluate(() => { const g = OTK.debug.game; return { x: g.me.x - g.camX, y: g.me.y }; });
  await page.touchscreen.tap(cv.x + ((me.x + 14) / 256) * cv.width, cv.y + ((me.y - 12) / 224) * cv.height);
  await page.waitForTimeout(100);
  const pr = await page.evaluate(() => ({ punches: OTK.debug.game.punches, dir: OTK.debug.game.me.dir }));
  check(pr.punches === 1 && pr.dir === 'right', '男魂くんのすぐ右をタップすると、右へパンチ');
  // しっぱい（早送りでじっとする）
  await page.evaluate(() => { OTK.debug.speed = 4; });
  await waitFor(page, () => OTK.debug.run.result, null, 40000);
  await page.evaluate(() => { OTK.debug.speed = 1; });
  r = await result(page);
  check(r.result === 'lose', 'じっとしていると、しっぱい（スマホ）');

  const errs = realErrors(errors);
  check(errs.length === 0, 'コンソールにエラーがない（スマホ）' + (errs.length ? '\n' + errs.join('\n') : ''));
}

withSite(PORT, async ({ open }) => {
  if (!ONLY || ONLY === 'conveni') {
    await conveniDesktop(open);
    if (!NO_PHONE) await conveniPhone(open);
  }
  if (!ONLY || ONLY === 'zombie') {
    await zombieDesktop(open);
    if (!NO_PHONE) await zombiePhone(open);
  }
  console.log('すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
