/*
 * ミニゲーム「うんこをよけろ」（unko）と「全裸で切符」（kippu）の確認
 *   node tests/e2e/games-unko-kippu.test.js
 *   SHOTS_DIR=/tmp/shots node tests/e2e/games-unko-kippu.test.js   … スクリーンショットも撮る（リポジトリの外に）
 *   ONLY=unko node tests/e2e/games-unko-kippu.test.js              … 片方だけ
 *   NO_PHONE=1 …スマホの確認をとばす
 * ふつうの操作（キーボード・画面のボタン・画面のタッチ）で、クリアとしっぱいの両方にたどり着けること、
 * パソコンとスマホの大きさでエラーが出ないことを確かめる。
 * ボットは画面に見えているもの（地面の影・人の向き）だけを見て動く。
 */
const fs = require('fs');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8815; // ARCH.md の割り当て（ミニゲームは 8811〜8815）
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
  const KEY = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', a: 'KeyZ' };
  return {
    name: 'キーボード',
    async setDir(want) {
      for (const k of ['left', 'right', 'up', 'down']) {
        const on = want.includes(k);
        if (on && !held.has(k)) { held.add(k); await page.keyboard.down(KEY[k]); }
        if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(KEY[k]); }
      }
    },
    async holdA(on) {
      if (on && !held.has('a')) { held.add('a'); await page.keyboard.down(KEY.a); }
      if (!on && held.has('a')) { held.delete('a'); await page.keyboard.up(KEY.a); }
    },
    async release() { await this.setDir([]); await this.holdA(false); },
  };
}
// スマホ：十字キーは指（マウス）でおさえたまま動かし、A ボタンも指でおさえる
async function padCtl(page) {
  const box = await page.locator('#otk-dpad').boundingBox();
  const pad = center(box);
  const padR = box.width / 2;
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
    async holdA(on) {
      // 十字キーをはなしてから、A を指でおさえる
      if (on) {
        if (cur === 'A') return;
        if (down) await page.mouse.up();
        await page.mouse.move(btnA.x, btnA.y);
        await page.mouse.down();
        down = true;
        cur = 'A';
      } else if (cur === 'A') {
        await page.mouse.up();
        down = false;
        cur = '';
      }
    },
    async release() { await this.setDir([]); await this.holdA(false); },
  };
}
// 向きから、おすキー
function dirsToward(dx, dy, dead) {
  const d = [];
  if (dx < -dead) d.push('left');
  if (dx > dead) d.push('right');
  if (dy < -dead) d.push('up');
  if (dy > dead) d.push('down');
  return d;
}

// ── うんこをよけろ（unko） ─────────────────────────────────
// 地面の影（落ちる所と、落ちるまでの時間）を見て、どの影からもはなれた所へ動く
async function unkoBot(page, ctl, o) {
  o = o || {};
  const seen = { volleyMax: 0, gold: false, pile: false, shotWind: false, shotFly: false, late: false };
  let goal = null;
  for (let i = 0; i < 8000; i++) {
    const s = await page.evaluate(() => {
      const g = OTK.debug.game, r = OTK.debug.run;
      return {
        res: r.result, t: r.t, me: { x: g.me.x, y: g.me.y, hit: g.me.hit },
        fly: g.poops.filter((p) => !p.landed).map((p) => ({ tx: p.tx, ty: p.ty, left: p.dur - p.t, gold: p.gold })),
        piles: g.poops.filter((p) => p.landed).length,
        wind: g.senpais.filter((sp) => sp.wind > 0).length,
        A: g.AREA, hx: g.HIT_X, hy: g.HIT_Y, sp: g.SPEED,
      };
    });
    if (s.res) break;
    if (o.until && s.t >= o.until) break;
    seen.volleyMax = Math.max(seen.volleyMax, s.fly.length);
    if (s.fly.some((p) => p.gold)) seen.gold = true;
    if (s.piles) seen.pile = true;
    const label = o.label || 'unko';
    if (s.wind && !seen.shotWind && s.t > 3) { seen.shotWind = true; await shot(page, label + '-wind'); }
    if (s.fly.length >= 3 && !seen.shotFly) { seen.shotFly = true; await shot(page, label + '-many'); }
    if (s.t > 25 && !seen.late) { seen.late = true; await shot(page, label + '-late'); }
    if (o.still) { await page.waitForTimeout(15); continue; }
    // 行き先を決める：どの影のだ円にも入らない所で、近い所
    const RX = s.hx + 9, RY = s.hy + 6;
    const inDanger = (x, y, p) => ((x - p.tx) / RX) ** 2 + ((y - p.ty) / RY) ** 2 < 1;
    const bad = (cx, cy) => {
      const travel = Math.hypot(cx - s.me.x, cy - s.me.y) / s.sp;
      for (const p of s.fly) {
        if (inDanger(cx, cy, p)) return true;
        // とちゅうで影の上を通るとき、落ちる時刻にそこにいないか
        const k = travel > 0 ? Math.min(1, (p.left + 0.05) / travel) : 1;
        const x = s.me.x + (cx - s.me.x) * k, y = s.me.y + (cy - s.me.y) * k;
        if (p.left < travel + 0.1 && inDanger(x, y, p)) return true;
      }
      return false;
    };
    if (!goal || bad(goal.x, goal.y)) {
      let best = null, bs = Infinity;
      for (let x = s.A.x0; x <= s.A.x1; x += 6) {
        for (let y = s.A.y0; y <= s.A.y1; y += 6) {
          if (bad(x, y)) continue;
          const sc = Math.hypot(x - s.me.x, y - s.me.y) + Math.hypot(x - 128, y - 134) * 0.25;
          if (sc < bs) { bs = sc; best = { x, y }; }
        }
      }
      goal = best || { x: 128, y: 134 };
    }
    await ctl.setDir(dirsToward(goal.x - s.me.x, goal.y - s.me.y, 2.5));
    await page.waitForTimeout(6);
  }
  await ctl.release();
  return seen;
}

async function unkoDesktop(open) {
  console.log('うんこをよけろ（パソコン・キーボード）');
  const { page, errors } = await open('game/?play=unko&seed=7', { wait: 300 });
  await waitScene(page, 'intro');
  await page.waitForTimeout(500);
  await shot(page, 'unko-intro');
  await page.keyboard.press('KeyZ');
  await waitScene(page, 'countdown');
  await page.waitForTimeout(300);
  await shot(page, 'unko-countdown');
  await waitScene(page, 'play');
  await page.waitForTimeout(500);
  await shot(page, 'unko-start');
  check((await canvasColors(page)) > 12, '川ぞいの道と先輩たちが描けている');
  const ctl = keyboardCtl(page);

  // 十字キーで動ける
  const x0 = await page.evaluate(() => OTK.debug.game.me.x);
  await ctl.setDir(['left']);
  await page.waitForTimeout(250);
  await ctl.release();
  const x1 = await page.evaluate(() => OTK.debug.game.me.x);
  check(x1 < x0 - 10, '←で左へ動く（' + x0.toFixed(0) + ' → ' + x1.toFixed(0) + '）');

  // クリア：影からはなれ続けて 30 秒
  const seen = await unkoBot(page, ctl);
  await waitFor(page, () => OTK.debug.run.result, null, 5000);
  let r = await result(page);
  check(r && r.result === 'win', '影をよけ続けると、30秒にげきれる（' + (r && r.result) + '）');
  const st = await page.evaluate(() => ({ thrown: OTK.debug.game.thrown, dodged: OTK.debug.game.dodged, gold: OTK.debug.game.goldN }));
  check(st.thrown >= 30, 'うんこを ' + st.thrown + ' 個投げてきて、' + st.dodged + ' 個よけた');
  check(seen.volleyMax >= 3, '後半は 3 つ以上いっしょに飛んでくる（' + seen.volleyMax + '）');
  check(seen.gold && st.gold >= 2, '金のうんこが ' + st.gold + ' 回来る');
  await page.waitForTimeout(700);
  await shot(page, 'unko-safe');
  await waitScene(page, 'result', 8000);
  r = await result(page);
  check(/にげきった/.test(r.msg), 'クリアのひとこと：' + r.msg.replace(/\n/g, ''));
  await page.waitForTimeout(400);
  await shot(page, 'unko-result-win');

  // しっぱい：何もしないと当たる
  await restart(page, 'unko', 7);
  await unkoBot(page, ctl, { still: true, label: 'unko-still' });
  r = await result(page);
  check(r.result === 'lose' && /命中/.test(r.msg), '動かないと、うんこが当たる');
  const hit = await page.evaluate(() => ({ hit: OTK.debug.game.me.hit, t: OTK.debug.run.t }));
  check(hit.hit && hit.t < 6, hit.t.toFixed(1) + ' 秒で頭にうんこ');
  await page.waitForTimeout(500);
  await shot(page, 'unko-hit');
  await waitScene(page, 'result', 8000);
  await page.waitForTimeout(400);
  await shot(page, 'unko-result-lose');

  const errs = realErrors(errors);
  check(!errs.length, 'エラーなし' + (errs.length ? '：' + errs.join('\n') : ''));
  await page.context().close();
}

async function unkoPhone(open) {
  console.log('うんこをよけろ（スマホ・画面のボタン）');
  const { page, errors } = await open('game/?play=unko&seed=11', { phone: true, wait: 300 });
  await waitScene(page, 'intro');
  const cv = await page.locator('#otk-canvas').boundingBox();
  check(cv.width >= 300 && cv.x >= 0 && cv.x + cv.width <= 390, 'ゲーム画面がスマホの幅に入る（幅 ' + Math.round(cv.width) + '）');
  await page.touchscreen.tap(cv.x + cv.width / 2, cv.y + cv.height / 2);
  await waitScene(page, 'play', 8000);
  await waitFor(page, () => OTK.debug.run.t > 0.2);
  // 画面をおさえた所へ走る
  const before = await page.evaluate(() => OTK.debug.game.me.x);
  await page.mouse.move(cv.x + cv.width * 0.3, cv.y + cv.height * 0.6);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  const after = await page.evaluate(() => OTK.debug.game.me.x);
  check(after < before - 12, '画面をおさえた所へ走る（' + before.toFixed(0) + ' → ' + after.toFixed(0) + '）');
  const ctl = await padCtl(page);
  await unkoBot(page, ctl, { label: 'unko-phone' });
  await waitFor(page, () => OTK.debug.run.result, null, 5000);
  let r = await result(page);
  check(r.result === 'win', '画面の十字キーでよけて、にげきれる（' + r.result + '）');
  await shot(page, 'unko-phone-win');
  await restart(page, 'unko', 11);
  await unkoBot(page, ctl, { still: true, label: 'unko-phone-still' });
  r = await result(page);
  check(r.result === 'lose', '何もしないと当たる');
  const errs = realErrors(errors);
  check(!errs.length, 'エラーなし' + (errs.length ? '：' + errs.join('\n') : ''));
  await page.context().close();
}

// ── 全裸で切符（kippu） ─────────────────────────────────
// 道すじ。かくれ場所から次のかくれ場所までを 1 回で歩く（とちゅうの角では止まらない）
//  玄関 → ゴミ置き場のかげ（寮のわきの道） → （横断歩道）→ 植え込みのかげ → 自販機のかげ → 券売機で買う → もどる
const KIPPU_ROUTE = [
  [[80, 205], [90, 196], [90, 156], [78, 148]],
  [[90, 136], [90, 118], [86, 108], [86, 74], [104, 72], [104, 47], [84, 47]],
  [[119, 47]],
  [[119, 59], [160, 59, 'buy'], [119, 59], [119, 47]],
  [[84, 47]],
  [[104, 47], [104, 72], [86, 74], [86, 108], [90, 118], [90, 136], [78, 148]],
  [[90, 156], [90, 196], [80, 205], [34, 205]],
];
// 人の向きと視線を見て、次のかくれ場所まで見られずに行けるときだけ進む。
// ゲームの visibleAt（その時刻に、その場所が光の中か）で、歩いている間を先読みする。
// careless：待たずに歩く
async function kippuBot(page, ctl, o) {
  o = o || {};
  const route = o.route || KIPPU_ROUTE;
  const seen = { waited: 0, bought: false, hops: 0, shotCone: false, waits: [] };
  let hop = -1, pi = 0, waitStart = null;
  for (let n = 0; n < 20000; n++) {
    const s = await page.evaluate(() => {
      const g = OTK.debug.game, r = OTK.debug.run;
      return { res: r.result, t: r.t, x: g.me.x, y: g.me.y, ticket: g.me.ticket, seenT: g.seenT };
    });
    if (s.res) { if (process.env.DEBUG) console.log('    end', JSON.stringify(s)); break; }
    if (s.seenT > 0 && !seen.shotCone) { seen.shotCone = true; await shot(page, (o.label || 'kippu') + '-seen'); }
    if (process.env.TRACE) console.log('      ', s.t.toFixed(2), s.x.toFixed(1), s.y.toFixed(1), hop, pi, s.seenT.toFixed(2), await page.evaluate(() => JSON.stringify(OTK.debug.game.poses().map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.a * 57.3)]))));
    if (hop >= 0 && pi < route[hop].length) {
      // 歩いている
      const [tx, ty, what] = route[hop][pi];
      const ddx = tx - s.x, ddy = ty - s.y;
      const last = pi === route[hop].length - 1 || what === 'buy';
      // とちゅうの角は、止まらずに次へ
      if (!last && Math.abs(ddx) <= 2.5 && Math.abs(ddy) <= 2.5) { pi++; continue; }
      if (Math.abs(ddx) > 1.2 || Math.abs(ddy) > 1.2) {
        await ctl.setDir(dirsToward(ddx, ddy, 1.2));
        await page.waitForTimeout(4);
        continue;
      }
      await ctl.setDir([]);
      if (what === 'buy' && !s.ticket) {
        await ctl.holdA(true);
        await page.waitForTimeout(20);
        continue;
      }
      await ctl.holdA(false);
      pi++;
      continue;
    }
    // かくれ場所にいる。次へ行けるか
    if (hop + 1 >= route.length) { await page.waitForTimeout(30); continue; }
    // 次のかくれ場所まで見られずに行けて、着いたあと（少し待てば）その次へも行けるときだけ進む
    const ok = o.careless || (await page.evaluate(([from, next, after]) => {
      const g = OTK.debug.game;
      const dt = 1 / 60;
      const bad = (x, y, t) => [-0.15, 0, 0.15, 0.3, 0.45].some((m) => g.visibleAt(x, y, t + m) >= 0);
      // 歩いてみる（見られたら null）
      function walk(x, y, t, pts) {
        for (const [px, py, what] of pts) {
          for (let k = 0; k < 2000; k++) {
            const dx = Math.abs(px - x) > 1.2 ? Math.sign(px - x) : 0, dy = Math.abs(py - y) > 1.2 ? Math.sign(py - y) : 0;
            if (!dx && !dy) break;
            const nn = dx && dy ? Math.SQRT1_2 : 1;
            x += dx * g.SPEED * nn * dt;
            y += dy * g.SPEED * nn * dt;
            t += dt;
            if (bad(x, y, t)) return null;
          }
          if (what === 'buy') for (let k = 0; k < 1.65 / dt; k++) { t += dt; if (bad(x, y, t)) return null; }
        }
        return { x, y, t };
      }
      const a = walk(from.x, from.y, 0.06, next);
      if (!a) return false;
      if (!after) return true;
      // 着いた所で待ちながら、その次へ行ける時をさがす
      let t = a.t;
      for (let w = 0; w < 12; w += 0.1) {
        if (walk(a.x, a.y, t, after)) return true;
        for (let k = 0; k < 6; k++) { t += dt; if (bad(a.x, a.y, t)) return false; }
      }
      return false;
    }, [{ x: s.x, y: s.y }, route[hop + 1], route[hop + 2] || null]));
    if (ok) {
      if (waitStart != null) seen.waits.push(+(s.t - waitStart).toFixed(1));
      if (waitStart != null && process.env.DEBUG) console.log('    hop', hop + 1, 'waited', (s.t - waitStart).toFixed(1));
      waitStart = null;
      hop++;
      pi = 0;
      seen.hops++;
      if (process.env.DEBUG) console.log('    go', hop, 't=' + s.t.toFixed(1));
    } else {
      if (waitStart == null) waitStart = s.t;
      await page.waitForTimeout(25);
    }
  }
  await ctl.release();
  seen.waited = seen.waits.reduce((a, b) => a + b, 0);
  const st = await page.evaluate(() => ({ ticket: OTK.debug.game.me.ticket }));
  seen.bought = st.ticket;
  return seen;
}

async function kippuDesktop(open) {
  console.log('全裸で切符（パソコン・キーボード）');
  const { page, errors } = await open('game/?play=kippu&seed=3', { wait: 300 });
  await waitScene(page, 'intro');
  await page.waitForTimeout(500);
  await shot(page, 'kippu-intro');
  await page.keyboard.press('KeyZ');
  await waitScene(page, 'countdown');
  await page.waitForTimeout(300);
  await shot(page, 'kippu-countdown');
  await waitScene(page, 'play');
  await page.waitForTimeout(500);
  await shot(page, 'kippu-start');
  check((await canvasColors(page)) > 16, '夜の町と駅が描けている');
  const ctl = keyboardCtl(page);

  // クリア：視線をよけて券売機へ行き、A を長おしして、玄関へもどる
  const seen = await kippuBot(page, ctl);
  await waitFor(page, () => OTK.debug.run.result, null, 5000);
  let r = await result(page);
  const t = await page.evaluate(() => OTK.debug.run.t);
  check(seen.bought, '券売機の前で A を長おしすると、切符が買える');
  check(r && r.result === 'win', '見られずに玄関へもどると、クリア（' + (r && r.result) + '、' + t.toFixed(1) + ' 秒）');
  check(seen.waited > 1, '人が通りすぎるのを待った（' + seen.waited.toFixed(1) + ' 秒くらい）');
  await page.waitForTimeout(600);
  await shot(page, 'kippu-home');
  await waitScene(page, 'result', 8000);
  r = await result(page);
  check(/切符/.test(r.msg), 'クリアのひとこと：' + r.msg.replace(/\n/g, ''));
  await page.waitForTimeout(400);
  await shot(page, 'kippu-result-win');

  // しっぱい 1：待たずにまっすぐ行くと、見られる
  await restart(page, 'kippu', 3);
  await kippuBot(page, ctl, { careless: true, label: 'kippu-careless' });
  await waitFor(page, () => OTK.debug.run.result, null, 8000);
  r = await result(page);
  check(r.result === 'lose' && /見/.test(r.msg), '待たずに歩くと、見られる：' + r.msg.replace(/\n/g, ''));
  await page.waitForTimeout(300);
  await shot(page, 'kippu-caught');

  // しっぱい 2：切符を買わずに玄関にいると、時間切れ（玄関の中は見られない）
  await restart(page, 'kippu', 3);
  await page.evaluate(() => { OTK.debug.speed = 8; });
  await waitFor(page, () => OTK.debug.run.result, null, 20000);
  await page.evaluate(() => { OTK.debug.speed = 1; });
  r = await result(page);
  check(r.result === 'lose' && /時間切れ/.test(r.msg), '玄関にいれば見られないが、60秒で時間切れ');

  // 買わずに玄関にもどってもクリアにならない
  await restart(page, 'kippu', 3);
  const back = await page.evaluate(() => { const g = OTK.debug.game; return g.me.ticket; });
  check(!back, 'はじめは切符を持っていない（玄関にいてもクリアにならない）');
  await page.waitForTimeout(400);
  check(!(await result(page)).result, '切符なしで玄関にいても、終わらない');

  const errs = realErrors(errors);
  check(!errs.length, 'エラーなし' + (errs.length ? '：' + errs.join('\n') : ''));
  await page.context().close();
}

async function kippuPhone(open) {
  console.log('全裸で切符（スマホ・画面のボタン）');
  const { page, errors } = await open('game/?play=kippu&seed=5', { phone: true, wait: 300 });
  await waitScene(page, 'intro');
  const cv = await page.locator('#otk-canvas').boundingBox();
  check(cv.width >= 300 && cv.x + cv.width <= 390, 'ゲーム画面がスマホの幅に入る（幅 ' + Math.round(cv.width) + '）');
  await page.touchscreen.tap(cv.x + cv.width / 2, cv.y + cv.height / 2);
  await waitScene(page, 'play', 8000);
  await waitFor(page, () => OTK.debug.run.t > 0.2);
  // 画面をおさえた所へ歩く（右の方をおさえる）
  const before = await page.evaluate(() => OTK.debug.game.me.x);
  await page.mouse.move(cv.x + cv.width * (60 / 256), cv.y + cv.height * (198 / 224));
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  const after = await page.evaluate(() => OTK.debug.game.me.x);
  check(after > before + 8, '画面をおさえた所へ歩く（' + before.toFixed(0) + ' → ' + after.toFixed(0) + '）');
  await shot(page, 'kippu-phone-start');
  const ctl = await padCtl(page);
  const seen = await kippuBot(page, ctl, { label: 'kippu-phone' });
  await waitFor(page, () => OTK.debug.run.result, null, 5000);
  let r = await result(page);
  check(seen.bought && r.result === 'win', '画面の十字キーと A ボタンで、切符を買ってもどれる（' + r.result + '）');
  await shot(page, 'kippu-phone-win');
  await restart(page, 'kippu', 5);
  await kippuBot(page, ctl, { careless: true, label: 'kippu-phone-careless' });
  await waitFor(page, () => OTK.debug.run.result, null, 8000);
  r = await result(page);
  check(r.result === 'lose', '待たずに歩くと見られる');
  const errs = realErrors(errors);
  check(!errs.length, 'エラーなし' + (errs.length ? '：' + errs.join('\n') : ''));
  await page.context().close();
}

withSite(PORT, async ({ open }) => {
  if (!ONLY || ONLY === 'unko') {
    await unkoDesktop(open);
    if (!NO_PHONE) await unkoPhone(open);
  }
  if (!ONLY || ONLY === 'kippu') {
    await kippuDesktop(open);
    if (!NO_PHONE) await kippuPhone(open);
  }
  console.log('ぜんぶ ok');
}).catch((e) => { console.error(e); process.exit(1); });
