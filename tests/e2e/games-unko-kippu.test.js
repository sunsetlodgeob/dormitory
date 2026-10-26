/*
 * ミニゲーム「全裸で切符」（kippu）と「うんこをよけろ」（unko）の確認
 *   node tests/e2e/games-unko-kippu.test.js
 *   SHOTS_DIR=/tmp/shots node tests/e2e/games-unko-kippu.test.js   … スクリーンショットも撮る（リポジトリの外に）
 *   ONLY=unko node tests/e2e/games-unko-kippu.test.js              … 片方だけ（kippu／unko）
 *   NO_PHONE=1 …スマホの確認をとばす　DEBUG=1 …ボットの動きを表示　PORT=8835 …ポートを変える
 * ふつうの操作（キーボード・画面のボタン・画面のタッチ）で、クリアとしっぱいの両方にたどり着けること、
 * パソコンとスマホの大きさでエラーが出ないこと、2 回しっぱいしたあとは少し易しくなることを確かめる。
 *
 * kippu（長いかくれんぼ）：
 *   ボットは、人の動きの予定（ゲームの visibleAt：その時刻にその場所が光の中か）から、見られない道すじを
 *   「場所 × 時刻」のマス目で探して（幅優先）、そのとおりに歩く（人はいつも同じ道を歩くので、遊ぶ人が見て覚えれば分かることと同じ）。
 *   - 通しで遊ぶ（キーボードのイベントを 1 コマごとに送り、早送りで）：行き → 券売機 → 帰り → 寮の手前でクリア。チェックポイントを順に通る
 *   - 一部は本物のキーボード・画面のボタン・タッチで（Node から押す）
 *   - 見つかると ♥ がへってチェックポイントへもどる。♥ がなくなるとしっぱい。もう一度遊ぶと、前回のチェックポイントから
 *   - 段ボール箱・犬（ほえると家の人が窓から見る）・電車の客・かくれ場所
 * unko（寮までの最後のひと走り）：地面の影（落ちる所と残り時間）だけを見てよけるボット。30 秒で寮の門が見えて、玄関に入る。
 */
const fs = require('fs');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8815; // ARCH.md の割り当て（ミニゲームは 8811〜8815）
const SHOTS = process.env.SHOTS_DIR || '';
const ONLY = process.env.ONLY || '';
const NO_PHONE = !!process.env.NO_PHONE;
const DEBUG = !!process.env.DEBUG;
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
async function restart(page, id, seed, tries) {
  await page.evaluate(([i, s, t]) => { OTK.debug.speed = 1; OTK.debug.seed(s); OTK.debug.start(i, { quick: true, tries: t || 0 }); }, [id, seed, tries]);
  await waitScene(page, 'play');
  await waitFor(page, () => OTK.debug.run && OTK.debug.run.phase === 'play' && OTK.debug.run.t > 0.05);
}
const result = (page) => page.evaluate(() => (OTK.debug.run ? { result: OTK.debug.run.result, msg: OTK.debug.run.msg } : null));
const oneLine = (s) => String(s || '').replace(/\n/g, '');
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
  const seen = { volleyMax: 0, gold: false, pile: false, shotWind: false, shotFly: false, late: false, gate: false };
  let goal = null;
  for (let i = 0; i < 8000; i++) {
    const s = await page.evaluate(() => {
      const g = OTK.debug.game, r = OTK.debug.run;
      return {
        res: r.result, t: r.t, me: { x: g.me.x, y: g.me.y, hit: g.me.hit }, gateY: g.gateY,
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
    if (s.gateY != null) seen.gate = true;
    const label = o.label || 'unko';
    if (s.wind && !seen.shotWind && s.t > 3) { seen.shotWind = true; await shot(page, label + '-wind'); }
    if (s.fly.length >= 3 && !seen.shotFly) { seen.shotFly = true; await shot(page, label + '-many'); }
    if (s.t > 29.2 && !seen.late) { seen.late = true; await shot(page, label + '-gate'); }
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
  check((await canvasColors(page)) > 12, '夜の川ぞいの道と先輩たちが描けている');
  const def = await page.evaluate(() => ({ order: OTK.get('unko').order, title: OTK.get('unko').title }));
  check(def.order === 10, 'unko は 1 年の 10 番目（全裸で切符のあと）');
  const ctl = keyboardCtl(page);

  // 十字キーで動ける
  const x0 = await page.evaluate(() => OTK.debug.game.me.x);
  await ctl.setDir(['left']);
  await page.waitForTimeout(250);
  await ctl.release();
  const x1 = await page.evaluate(() => OTK.debug.game.me.x);
  check(x1 < x0 - 10, '←で左へ動く（' + x0.toFixed(0) + ' → ' + x1.toFixed(0) + '）');

  // クリア：影からはなれ続けて 30 秒（ボットの反応がおくれて当たることもあるので、3 回まで）
  let seen, r, tries = 0;
  for (const sd of [7, 8, 9]) {
    if (tries++) await restart(page, 'unko', sd);
    seen = await unkoBot(page, ctl);
    await waitFor(page, () => OTK.debug.run.result, null, 5000);
    r = await result(page);
    if (r && r.result === 'win') break;
  }
  check(r && r.result === 'win', '影をよけ続けると、30秒にげきれる（' + tries + ' 回目）');
  const st = await page.evaluate(() => ({ thrown: OTK.debug.game.thrown, dodged: OTK.debug.game.dodged, gold: OTK.debug.game.goldN }));
  check(st.thrown >= 30, 'うんこを ' + st.thrown + ' 個投げてきて、' + st.dodged + ' 個よけた');
  check(seen.volleyMax >= 3, '後半は 3 つ以上いっしょに飛んでくる（' + seen.volleyMax + '）');
  check(seen.gold && st.gold >= 2, '金のうんこが ' + st.gold + ' 回来る');
  check(seen.gate, '最後に寮の門が見えてくる');
  await page.waitForTimeout(700);
  await shot(page, 'unko-safe');
  await waitFor(page, () => OTK.debug.game.inT > 0, null, 5000);
  const home = await page.evaluate(() => ({ gateY: OTK.debug.game.gateY, x: OTK.debug.game.me.x, y: OTK.debug.game.me.y }));
  check(Math.abs(home.x - 128) < 2 && home.y < home.gateY, '寮の玄関に入っていく（' + home.x.toFixed(0) + ',' + home.y.toFixed(0) + '、門は y ' + home.gateY.toFixed(0) + '）');
  await shot(page, 'unko-home');
  await waitScene(page, 'result', 8000);
  r = await result(page);
  check(/寮/.test(r.msg) && /卒業/.test(r.msg), 'クリアのひとこと：' + oneLine(r.msg));
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
  let r, tries = 0;
  for (const sd of [11, 12, 13]) {
    if (tries++) await restart(page, 'unko', sd);
    await unkoBot(page, ctl, { label: 'unko-phone' });
    await waitFor(page, () => OTK.debug.run.result, null, 5000);
    r = await result(page);
    if (r.result === 'win') break;
  }
  check(r.result === 'win', '画面の十字キーでよけて、寮までにげきれる（' + tries + ' 回目）');
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
// ページの中に入れるボット。KB.plan(goal) で道すじを探し、KB.auto() で 1 コマごとにキーのイベントを送って歩く
function installKippuBot() {
  const KB = (window.KB = {});
  const KEY = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', a: 'KeyZ' };
  const C = 6; // マス目の大きさ（ドット）
  const DT = C / 52; // 1 マス進む時間（歩く速さ 58 より少しおそく見つもる）
  const HOR = 40; // 何秒先まで探すか
  const M = [-0.15, 0, 0.15]; // 時刻のよゆう
  const PAD = 3; // 場所のよゆう（ドット）
  const g = () => OTK.debug.game;
  // 順番に目ざす所：チェックポイント 1〜4 → 券売機（A 長おし）→ 5〜8 → ゴール
  KB.goals = function () {
    const G = g();
    const list = [];
    for (let i = 1; i <= 4; i++) list.push({ x: G.CPS[i].x, y: G.CPS[i].y, rank: i, name: 'cp' + i });
    list.push({ x: G.BUY.x + G.BUY.w / 2, y: G.BUY.y + 6, buy: true, rank: 4.5, name: 'buy', then: { x: G.CPS[5].x, y: G.CPS[5].y } });
    for (let i = 5; i <= 8; i++) list.push({ x: G.CPS[i].x, y: G.CPS[i].y, rank: i, name: 'cp' + i });
    list.push({ x: G.GOAL.x + 9, y: 120, r: 8, rank: 9, name: 'goal' });
    return list;
  };
  KB.rank = () => (g().me.ticket ? Math.max(5, g().cp) : g().cp);
  KB.plan = function (goal) {
    const G = g(), A = G.AREAS, me = G.me;
    const ca = G.areaAt(me.x), ga = G.areaAt(goal.x);
    const a0 = Math.min(ca, ga), a1 = Math.max(ca, ga);
    const X0 = A[a0].x, X1 = A[a1].x + A[a1].w, Y0 = 28;
    const cols = Math.floor((X1 - X0) / C), rows = Math.floor((222 - Y0) / C);
    const NC = cols * rows, N = Math.ceil(HOR / DT);
    const cx = (c) => X0 + C / 2 + (c % cols) * C, cy = (c) => Y0 + C / 2 + Math.floor(c / cols) * C;
    const okAt = (x, y) => !G.blocked(x, y) && !G.blocked(x - 2, y) && !G.blocked(x + 2, y) && !G.blocked(x, y - 2) && !G.blocked(x, y + 2);
    const free = new Uint8Array(NC);
    for (let c = 0; c < NC; c++) free[c] = okAt(cx(c), cy(c)) ? 1 : 0;
    let start = -1, bd = 1e9;
    for (let c = 0; c < NC; c++) if (free[c]) { const d = Math.hypot(cx(c) - me.x, cy(c) - me.y); if (d < bd) { bd = d; start = c; } }
    const isGoal = new Uint8Array(NC);
    for (let c = 0; c < NC; c++) if (free[c] && Math.hypot(cx(c) - goal.x, cy(c) - goal.y) <= (goal.r || 5)) isGoal[c] = 1;
    const memo = new Uint8Array(NC * N);
    const safe = (c, k) => {
      const i = k * NC + c;
      if (!memo[i]) {
        const x = cx(c), y = cy(c), t = k * DT;
        let ok = !G.wouldBark(x, y, t, PAD) && !G.wouldBark(x, y, t + 0.2, PAD);
        for (const m of M) if (ok && G.visibleAt(x, y, Math.max(0, t + m), PAD) >= 0) ok = false;
        memo[i] = ok ? 1 : 2;
      }
      return memo[i] === 1;
    };
    const buyK = Math.ceil(1.8 / DT); // 券売機の前で、買い終わるまで見られないこと
    const buyOk = (c, k) => { if (k + buyK >= N) return false; for (let q = 1; q <= buyK; q++) if (!safe(c, k + q)) return false; return true; };
    // (c0, k0) から、ゴールのマスまでの幅優先。accept(c, k) が true になった所で止まる
    function search(c0, k0, isG, accept, maxK) {
      const prev = new Int32Array(NC * N).fill(-1);
      prev[k0 * NC + c0] = c0;
      let layer = [c0];
      for (let k = k0; k < Math.min(N - 1, maxK); k++) {
        const next = [];
        for (const c of layer) {
          if (isG[c] && accept(c, k)) return { prev, c, k, k0 };
          const x = c % cols, y = (c / cols) | 0;
          const nb = [c];
          if (x > 0) nb.push(c - 1);
          if (x < cols - 1) nb.push(c + 1);
          if (y > 0) nb.push(c - cols);
          if (y < rows - 1) nb.push(c + cols);
          for (const d of nb) {
            if (!free[d] || (d !== c && !okAt((cx(c) + cx(d)) / 2, (cy(c) + cy(d)) / 2))) continue;
            const j = (k + 1) * NC + d;
            if (prev[j] !== -1 || !safe(d, k + 1)) continue;
            prev[j] = c;
            next.push(d);
          }
        }
        layer = next;
        if (!layer.length) break;
      }
      return null;
    }
    // 券売機では、買ったあとに、かくれ場所（次のゴール）まで見られずに行けること
    let thenG = null;
    if (goal.buy && goal.then) {
      thenG = new Uint8Array(NC);
      for (let c = 0; c < NC; c++) if (free[c] && Math.hypot(cx(c) - goal.then.x, cy(c) - goal.then.y) <= 5) thenG[c] = 1;
    }
    // 着けるかどうかだけを調べる（道すじは覚えない）
    const reach = (c0, k0, isG, maxK) => {
      let layer = [c0];
      for (let k = k0; k < Math.min(N - 1, maxK); k++) {
        const seen = new Uint8Array(NC), next = [];
        for (const c of layer) {
          if (isG[c]) return true;
          const x = c % cols, y = (c / cols) | 0;
          for (const d of [c, x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
            if (d < 0 || seen[d] || !free[d] || (d !== c && !okAt((cx(c) + cx(d)) / 2, (cy(c) + cy(d)) / 2)) || !safe(d, k + 1)) continue;
            seen[d] = 1;
            next.push(d);
          }
        }
        layer = next;
        if (!layer.length) return false;
      }
      return false;
    };
    const accept = (c, k) => {
      if (!goal.buy) return true;
      if (!buyOk(c, k)) return false;
      return !thenG || reach(c, k + buyK, thenG, k + buyK + Math.ceil(8 / DT));
    };
    const found = search(start, 0, isGoal, accept, N);
    if (!found) return null;
    const pts = [];
    let cc = found.c;
    for (let kk = found.k; kk >= 0; kk--) { pts.push([cx(cc), cy(cc)]); if (kk > 0) cc = found.prev[kk * NC + cc]; }
    pts.reverse();
    return { t0: G.npcT, DT, pts, k: found.k };
  };
  // いまの道すじで、押すキー（null：道すじから外れた）
  KB.steer = function (p) {
    const G = g(), me = G.me;
    const k = Math.floor((G.npcT - p.t0) / p.DT);
    const cur = p.pts[Math.min(p.pts.length - 1, Math.max(0, k))];
    const nxt = p.pts[Math.min(p.pts.length - 1, k + 1)];
    if (Math.hypot(me.x - cur[0], me.y - cur[1]) > C * 1.2 && Math.hypot(me.x - nxt[0], me.y - nxt[1]) > C * 1.2) return null;
    const dx = nxt[0] - me.x, dy = nxt[1] - me.y, want = [];
    if (dx < -0.8) want.push('left');
    if (dx > 0.8) want.push('right');
    if (dy < -0.8) want.push('up');
    if (dy > 0.8) want.push('down');
    return want;
  };
  KB.arrived = (goal, p) => Math.hypot(g().me.x - goal.x, g().me.y - goal.y) <= (goal.r || 5) + 1.5 && (!p || g().npcT - p.t0 >= p.k * p.DT - 0.02);
  // 通しで遊ぶ：1 コマごとに（ゲームの update の前に）キーボードのイベントを送る。opts.until：そのゴールで止まる
  KB.auto = function (opts) {
    opts = opts || {};
    const G = g();
    const S = (KB.state = { log: [], plans: 0, fails: 0, replans: 0, caught: 0, lives: G.lives, done: false, result: null, err: null, cps: [] });
    const goals = KB.goals();
    let gi = goals.findIndex((q) => q.rank > KB.rank());
    let p = null, waitUntil = -1;
    const held = new Set();
    const setKeys = (want) => {
      for (const k of Object.keys(KEY)) {
        const on = want.includes(k);
        if (on !== held.has(k)) {
          if (on) held.add(k);
          else held.delete(k);
          window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: KEY[k] }));
        }
      }
    };
    KB.release = () => setKeys([]);
    function step() {
      if (S.done) return;
      const run = OTK.debug.run;
      if (!run || run.result || G.won) { setKeys([]); S.done = true; S.result = run && run.result; return; }
      if (G.lives < S.lives) { S.caught++; S.lives = G.lives; p = null; S.log.push('caught ' + JSON.stringify(G.stats.last)); }
      if (G.busy) { setKeys([]); p = null; return; }
      const goal = goals[gi];
      if (!goal) { setKeys([]); return; }
      if (goal.buy && G.me.ticket) { gi++; p = null; S.log.push('bought t=' + G.npcT.toFixed(1)); return; }
      if (KB.arrived(goal, p)) {
        if (goal.buy) { setKeys(['a']); return; }
        S.log.push(goal.name + ' t=' + G.npcT.toFixed(1));
        S.cps.push(G.cp);
        if (opts.until === goal.name) { setKeys([]); S.done = true; S.result = 'until'; return; }
        gi++;
        p = null;
        setKeys([]);
        return;
      }
      if (!p) {
        if (G.npcT < waitUntil) { setKeys([]); return; }
        S.plans++;
        p = KB.plan(goal);
        if (!p) { S.fails++; waitUntil = G.npcT + 0.5; setKeys([]); return; }
      }
      const want = KB.steer(p);
      if (!want) { p = null; S.replans++; setKeys([]); return; }
      setKeys(want);
    }
    const orig = G.update;
    G.update = function (dt) {
      try { step(); } catch (e) { S.err = String((e && e.stack) || e); S.done = true; }
      return orig.call(this, dt);
    };
  };
}
async function addBot(page) {
  await page.evaluate(`(${installKippuBot.toString()})()`);
}
// 本物の操作（Playwright のキーボード・画面のボタン）で、次のゴールまで歩く。道すじはページの中で探す
async function walkTo(page, ctl, name, o) {
  o = o || {};
  const goal = await page.evaluate((n) => { window.__kbp = null; return KB.goals().find((q) => q.name === n); }, name);
  let planned = false;
  for (let i = 0; i < 6000; i++) {
    const s = await page.evaluate((gl) => {
      const G = OTK.debug.game;
      if (!window.__kbp && !G.busy && !OTK.debug.run.result) window.__kbp = KB.plan(gl);
      const p = window.__kbp;
      const r = { res: OTK.debug.run.result, busy: G.busy, ticket: G.me.ticket, lives: G.lives, x: G.me.x, y: G.me.y, has: !!p };
      if (G.busy) { window.__kbp = null; return r; }
      r.arrived = KB.arrived(gl, p);
      if (p && !r.arrived) {
        r.want = KB.steer(p);
        if (!r.want) window.__kbp = null;
      }
      return r;
    }, goal);
    if (s.res) { await ctl.release(); return { ok: s.res === 'win' && name === 'goal', res: s.res }; }
    if (s.busy) { await ctl.release(); await page.waitForTimeout(30); continue; }
    if (s.has) planned = true;
    if (goal.buy && s.ticket) { await ctl.release(); await page.evaluate(() => { window.__kbp = null; }); return { ok: true }; }
    if (s.arrived) {
      if (goal.buy) { await ctl.setDir([]); await ctl.holdA(true); await page.waitForTimeout(20); continue; }
      await ctl.release();
      await page.evaluate(() => { window.__kbp = null; });
      return { ok: true, planned };
    }
    await ctl.setDir(s.want || []);
    await page.waitForTimeout(s.has ? 4 : 120);
  }
  await ctl.release();
  return { ok: false };
}
// 通しで遊ぶ（早送り）
async function autoPlay(page, opts, timeout) {
  await page.evaluate((o) => KB.auto(o), opts || {});
  await page.evaluate(() => { OTK.debug.speed = 8; });
  const t0 = Date.now();
  let st;
  for (;;) {
    await page.waitForTimeout(300);
    st = await page.evaluate(() => Object.assign({}, KB.state, { npcT: OTK.debug.game.npcT, lives: OTK.debug.game.lives, cp: OTK.debug.game.cp }));
    if (st.done || Date.now() - t0 > (timeout || 150000)) break;
  }
  await page.evaluate(() => { OTK.debug.speed = 1; if (KB.release) KB.release(); });
  if (DEBUG) console.log('    ', JSON.stringify(st));
  return st;
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
  check((await canvasColors(page)) > 16, '夜の寮の前が描けている');
  const info = await page.evaluate(() => {
    const g = OTK.debug.game, d = OTK.get('kippu');
    return { order: d.order, time: d.time, lives: g.lives, cp: g.cp, area: g.area, areas: g.AREAS.map((a) => a.name), w: g.WORLD_W, cps: g.CPS.length };
  });
  check(info.order === 9 && info.time === null, 'kippu は 1 年の 9 番目（うんこの前）。時間制限なし');
  check(info.lives === 3 && info.cp === 0 && info.area === 0, 'はじめは ♥3、寮の玄関前から');
  check(info.areas.length === 5 && info.w >= 1280, '地図は横に長い（' + info.w + ' ドット）：' + info.areas.join(' → '));
  // かくれ場所（チェックポイント）は、行き・帰りとも、いつ見ても視線が届かない（人がぶつかってもこない）
  const spots = await page.evaluate(() => {
    const g = OTK.debug.game;
    const out = [];
    for (let i = 0; i < g.CPS.length; i++) {
      g.warp(i);
      const c = g.CPS[i];
      let n = 0;
      for (let t = 0; t < 90; t += 1 / 30) if (g.visibleAt(c.x, c.y, t, 2) >= 0) n++;
      out.push(n);
    }
    g.warp(0);
    return out;
  });
  check(spots.every((n) => n === 0), 'チェックポイントのかくれ場所 ' + spots.length + ' か所には、視線が届かない（' + spots.join(' ') + '）');
  await restart(page, 'kippu', 3);
  await addBot(page);

  // 本物のキーボードで：寮の玄関前 → 川ぞいの道のチェックポイント
  const ctl = keyboardCtl(page);
  const w1 = await walkTo(page, ctl, 'cp1');
  const s1 = await page.evaluate(() => ({ cp: OTK.debug.game.cp, area: OTK.debug.game.area, lives: OTK.debug.game.lives, cam: OTK.debug.game.camX }));
  check(w1.ok && s1.cp === 1 && s1.area === 1, 'キーボードで、見られずに川ぞいの道へ（チェックポイント ' + s1.cp + '、♥' + s1.lives + '）');
  check(s1.cam >= 230, '画面が横にスクロールした（' + s1.cam.toFixed(0) + '）');
  await page.waitForTimeout(400);
  await shot(page, 'kippu-kawa');

  // 本物のキーボードで：駅前から、券売機の前で Z を長おしして切符を買い、コインロッカーのかげへ
  await page.evaluate(() => OTK.debug.game.warp(4));
  await page.waitForTimeout(300);
  await shot(page, 'kippu-eki');
  const w2 = await walkTo(page, ctl, 'buy');
  const s2 = await page.evaluate(() => ({ ticket: OTK.debug.game.me.ticket, cp: OTK.debug.game.cp, train: OTK.debug.game.trainT }));
  check(w2.ok && s2.ticket && s2.cp === 5, '券売機の前で Z を長おしすると、切符が買える（帰りになる）');
  check(s2.train > 0, '切符を買うと、電車が着く');
  await shot(page, 'kippu-bought');
  const w3 = await walkTo(page, ctl, 'cp5');
  check(w3.ok, 'コインロッカーのかげにかくれる');
  await waitFor(page, () => OTK.debug.game.NPCS.some((n, i) => n.who === 'passenger' && OTK.debug.game.poseOf(i, OTK.debug.game.npcT)), null, 6000);
  await page.waitForTimeout(800);
  await shot(page, 'kippu-passengers');
  const pax = await page.evaluate(() => OTK.debug.game.NPCS.filter((n, i) => n.who === 'passenger' && OTK.debug.game.poseOf(i, OTK.debug.game.npcT)).length);
  const safe = await page.evaluate(() => ({ lives: OTK.debug.game.lives, seen: OTK.debug.game.seenT }));
  check(pax >= 2 && safe.lives === 3, '改札から電車の客が出てくる（' + pax + ' 人）。かげにいれば見つからない');

  // 本物のキーボードで：帰りの川ぞいの道 → 寮の手前でクリア
  await page.evaluate(() => OTK.debug.game.warp(8));
  await page.waitForTimeout(300);
  const w4 = await walkTo(page, ctl, 'goal');
  await waitFor(page, () => OTK.debug.run.result, null, 5000);
  let r = await result(page);
  check(w4.ok && r.result === 'win', '切符を持って、川ぞいの道の寮の手前まで来るとクリア');
  check(/切符/.test(r.msg) && /帰る/.test(r.msg), 'クリアのひとこと：' + oneLine(r.msg));
  await page.waitForTimeout(1300);
  await shot(page, 'kippu-goal');
  await waitScene(page, 'result', 8000);
  await page.waitForTimeout(400);
  await shot(page, 'kippu-result-win');

  // 通しで（早送り）：行き → 券売機 → 帰り。チェックポイントを順に通って、寮の手前でクリア
  for (const sd of [3, 21]) {
    await restart(page, 'kippu', sd);
    await addBot(page);
    const st = await autoPlay(page);
    if (st.err) throw new Error(st.err);
    r = await result(page);
    const order = st.cps.join(',');
    check(r.result === 'win' && order === '1,2,3,4,5,6,7,8' && st.caught === 0, '種 ' + sd + '：はじめから通しで、一度も見つからずにクリア（チェックポイント ' + order + '、ゲームの中で ' + st.npcT.toFixed(0) + ' 秒）');
    check(st.npcT > 55, '道のりが長い（先が分かっているボットでも ' + st.npcT.toFixed(0) + ' 秒かかる）');
  }

  // しっぱい：待たずに右へ歩き続けると見つかる → ♥ がへってチェックポイントへもどる → ♥ がなくなるとしっぱい
  await restart(page, 'kippu', 3);
  await page.evaluate(() => OTK.debug.game.warp(1));
  const cp1 = await page.evaluate(() => ({ x: OTK.debug.game.me.x, y: OTK.debug.game.me.y }));
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('ArrowRight');
  await waitFor(page, () => OTK.debug.game.caught, null, 20000);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(300);
  await shot(page, 'kippu-caught');
  const c1 = await page.evaluate(() => ({ lives: OTK.debug.game.lives, who: OTK.debug.game.stats.last.who, res: OTK.debug.run.result }));
  check(c1.lives === 2 && !c1.res, '見つかると ♥ が 1 つへる（' + c1.who + '）。まだ続く');
  await waitFor(page, () => !OTK.debug.game.busy, null, 5000);
  const back = await page.evaluate(() => ({ x: OTK.debug.game.me.x, y: OTK.debug.game.me.y, cp: OTK.debug.game.cp }));
  check(back.cp === 1 && Math.abs(back.x - cp1.x) < 0.5 && Math.abs(back.y - cp1.y) < 0.5, 'チェックポイント（川ぞいの道の入り口）からやりなおし');
  await shot(page, 'kippu-respawn');
  await page.evaluate(() => { OTK.debug.speed = 3; });
  for (let n = 0; n < 2; n++) {
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowDown');
    await page.keyboard.down('ArrowRight');
    await waitFor(page, () => OTK.debug.game.caught, null, 20000);
    await page.keyboard.up('ArrowRight');
    await waitFor(page, () => !OTK.debug.game.busy || OTK.debug.run.result, null, 8000);
  }
  await page.evaluate(() => { OTK.debug.speed = 1; });
  await waitFor(page, () => OTK.debug.run.result, null, 5000);
  r = await result(page);
  check(r.result === 'lose' && /見/.test(r.msg), '♥ がなくなると、しっぱい：' + oneLine(r.msg));
  await waitScene(page, 'result', 8000);
  await page.waitForTimeout(600);
  await shot(page, 'kippu-result-lose');
  // もう一度遊ぶ（しっぱいのあと）：前回のチェックポイントから
  await page.keyboard.press('KeyZ');
  await waitScene(page, 'play', 8000);
  await waitFor(page, () => OTK.debug.run && OTK.debug.run.t > 0.05);
  const re = await page.evaluate(() => ({ tries: OTK.debug.api.tries, resumed: OTK.debug.game.resumed, cp: OTK.debug.game.cp, lives: OTK.debug.game.lives, area: OTK.debug.game.area }));
  check(re.tries === 1 && re.resumed === 1 && re.cp === 1 && re.area === 1 && re.lives === 3, 'しっぱいのあとのもう一度は、前回のチェックポイント（川ぞいの道）から ♥3 で');
  await page.waitForTimeout(500);
  await shot(page, 'kippu-resume');
  await restart(page, 'kippu', 3);
  check((await page.evaluate(() => OTK.debug.game.cp)) === 0, 'はじめからのときは、寮の玄関前から');

  const errs = realErrors(errors);
  check(!errs.length, 'エラーなし' + (errs.length ? '：' + errs.join('\n') : ''));
  await page.context().close();
}

// 段ボール箱・犬・自転車のベル
async function kippuGimmicks(open) {
  console.log('全裸で切符（段ボール箱・犬）');
  const { page, errors } = await open('game/?play=kippu&quick=1&seed=4', { wait: 300 });
  await waitScene(page, 'play');
  await waitFor(page, () => OTK.debug.run.t > 0.05);
  // 角に少しかかっても、横に歩けば、すべって回りこむ（寮の前のゴミ置き場の下のはし。人はいったん消す）
  const sl = await page.evaluate(() => {
    const g = OTK.debug.game;
    g.warp(0);
    g.NPCS.forEach((n) => { n._leg = n.leg; n.leg = 'back'; }); // 行きなので、帰りの人は出てこない
    g.me.x = 125;
    g.me.y = 144;
    return { stuck: g.blocked(120, 144), free: !g.blocked(125, 144) };
  });
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowLeft');
  const sx = await page.evaluate(() => {
    const g = OTK.debug.game;
    g.NPCS.forEach((n) => { n.leg = n._leg; });
    return { x: g.me.x, y: g.me.y, caught: !!g.caught };
  });
  check(sl.stuck && sl.free && sx.x < 100 && !sx.caught, '角に 1 ドットかかっても、←で回りこんで進む（x 125 → ' + sx.x.toFixed(0) + '、y ' + sx.y.toFixed(1) + '）');
  // 段ボール箱：商店街。A でかぶる。かぶって止まっていれば、光の中でも見つからない。ぬぐと見つかる
  await page.evaluate(() => { const g = OTK.debug.game; g.warp(3); g.me.x = g.boxes[0].x + 4; g.me.y = g.boxes[0].y; });
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(100);
  const on = await page.evaluate(() => !!OTK.debug.game.me.box);
  check(on, 'A で段ボール箱をかぶる');
  // 箱ごと、しばらく光の中になる所へ移す
  const spot = await page.evaluate(() => {
    // 光のくさびの中で、人からはなれている（ぶつからない）所
    const g = OTK.debug.game, a = g.AREAS[3];
    const far = (x, y, t) => g.NPCS.every((n, i) => { const p = g.poseOf(i, g.npcT + t); return !p || p.hide || Math.hypot(p.x - x, p.y - y) > 20; });
    for (let y = 96; y < 180; y += 4) {
      for (let x = a.x + 30; x < a.x + a.w - 30; x += 4) {
        if (g.blocked(x, y)) continue;
        let all = true;
        for (let t = 0; t <= 1.6; t += 0.05) if (g.visibleAt(x, y, t) < 0 || !far(x, y, t)) { all = false; break; }
        if (all) return { x, y };
      }
    }
    return null;
  });
  check(!!spot, '商店街に、しばらく見られる所がある');
  await page.evaluate((p) => { const g = OTK.debug.game; g.me.x = p.x; g.me.y = p.y; }, spot);
  await page.waitForTimeout(1000);
  await shot(page, 'kippu-box');
  const b1 = await page.evaluate(() => ({ seen: OTK.debug.game.seenT, caught: !!OTK.debug.game.caught, lives: OTK.debug.game.lives }));
  check(b1.seen === 0 && !b1.caught, '箱をかぶって止まっていれば、光の中でも見つからない');
  await page.keyboard.press('KeyZ');
  await waitFor(page, () => OTK.debug.game.caught, null, 3000);
  check(true, '箱をぬぐと、見つかる');
  await waitFor(page, () => !OTK.debug.game.busy, null, 5000);

  // 犬：住宅街。起きている犬に近づくと、ほえて、家の人が窓から見る
  await page.evaluate(() => OTK.debug.game.warp(2));
  await waitFor(page, () => OTK.debug.game.dogAwake, null, 20000);
  await page.evaluate(() => { const g = OTK.debug.game; g.me.x = g.DOG.x - 60; g.me.y = 99; });
  await page.keyboard.down('ArrowRight');
  await waitFor(page, () => OTK.debug.game.stats.barks > 0, null, 5000);
  await page.keyboard.up('ArrowRight');
  const d = await page.evaluate(() => ({ res: OTK.debug.game.resident, t: OTK.debug.game.npcT }));
  check(d.res.a0 > d.t && d.res.a1 > d.res.a0 + 2, '犬がほえると、少しして家の人が窓から見る（' + (d.res.a1 - d.res.a0).toFixed(1) + ' 秒）');
  await waitFor(page, () => OTK.debug.game.npcT > OTK.debug.game.resident.a0 + 0.1 || OTK.debug.game.caught, null, 3000);
  const look = await page.evaluate(() => {
    const g = OTK.debug.game, i = g.NPCS.findIndex((n) => n.alert);
    const p = g.poseOf(i, g.npcT);
    return p ? { x: p.x - g.DOG.x, y: p.y, a: +p.a.toFixed(2) } : null;
  });
  check(look && Math.abs(look.x) < 1 && look.a > 1.5 && look.a < 1.65, '窓から、家の前の道が見られている（' + JSON.stringify(look) + '）');
  await page.waitForTimeout(300);
  await shot(page, 'kippu-dog');
  // 犬が寝ている間は、そっと通れる
  const quiet = await page.evaluate(() => {
    const g = OTK.debug.game;
    let ok = 0;
    for (let t = 0; t < 30; t += 0.1) if (!g.wouldBark(g.DOG.x, 100, t + 6)) ok++;
    return ok;
  });
  check(quiet > 20, '犬が寝ている間は、塀の前をそっと通れる');

  // 2 回しっぱいしたあと（tries 2）は少し易しい：♥ が 1 つ多い・見つかるまでが少し長い
  const easy = await page.evaluate(() => {
    const make = (tries) => {
      OTK.seed = 5;
      const run = OTK.makeRun('kippu', { practice: true, tries });
      OTK.seed = null;
      return { lives: run.game.lives, grace: run.game.grace };
    };
    return { e0: make(0), e2: make(2) };
  });
  check(easy.e2.lives === easy.e0.lives + 1 && easy.e2.grace > easy.e0.grace, '2 回しっぱいしたあとは ♥' + easy.e2.lives + '、見つかるまで ' + easy.e0.grace.toFixed(2) + ' → ' + easy.e2.grace.toFixed(2) + ' 秒');
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
  await shot(page, 'kippu-phone-start');
  // 画面をおさえた所へ歩く（下の方をおさえる）
  const before = await page.evaluate(() => OTK.debug.game.me.y);
  await page.mouse.move(cv.x + cv.width * (78 / 256), cv.y + cv.height * (150 / 224));
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  const after = await page.evaluate(() => OTK.debug.game.me.y);
  check(after > before + 8, '画面をおさえた所へ歩く（y ' + before.toFixed(0) + ' → ' + after.toFixed(0) + '）');
  // 男魂くんの上から指をずらしても歩く（箱のない所。人はいったん消す）
  const p0 = await page.evaluate(() => {
    const g = OTK.debug.game;
    g.NPCS.forEach((n) => { n.leg = 'back'; });
    return { x: g.me.x - g.camX, y: g.me.y };
  });
  await page.mouse.move(cv.x + cv.width * (p0.x / 256), cv.y + cv.height * ((p0.y - 10) / 224));
  await page.mouse.down();
  await page.mouse.move(cv.x + cv.width * (p0.x / 256), cv.y + cv.height * ((p0.y + 40) / 224), { steps: 4 });
  await page.waitForTimeout(700);
  await page.mouse.up();
  const drag = await page.evaluate(() => ({ y: OTK.debug.game.me.y, box: !!OTK.debug.game.me.box }));
  check(drag.y > p0.y + 10 && !drag.box, '男魂くんの上から指をずらしても、そちらへ歩く（y ' + p0.y.toFixed(0) + ' → ' + drag.y.toFixed(0) + '）');
  await restart(page, 'kippu', 5);
  await addBot(page);
  const ctl = await padCtl(page);
  // 画面の十字キーで：寮の玄関前 → 川ぞいの道
  const w1 = await walkTo(page, ctl, 'cp1');
  const s1 = await page.evaluate(() => ({ cp: OTK.debug.game.cp, lives: OTK.debug.game.lives }));
  check(w1.ok && s1.cp === 1, '画面の十字キーで、見られずに川ぞいの道へ（♥' + s1.lives + '）');
  // 画面の十字キーと A ボタンで、切符を買う
  await page.evaluate(() => OTK.debug.game.warp(4));
  const w2 = await walkTo(page, ctl, 'buy');
  const t2 = await page.evaluate(() => OTK.debug.game.me.ticket);
  check(w2.ok && t2, '画面の A ボタンを長おしして、切符が買える');
  await shot(page, 'kippu-phone-bought');
  // 帰りの最後（画面の十字キー）
  await page.evaluate(() => OTK.debug.game.warp(8));
  const w3 = await walkTo(page, ctl, 'goal');
  await waitFor(page, () => OTK.debug.run.result, null, 5000);
  let r = await result(page);
  check(w3.ok && r.result === 'win', '画面の十字キーで、寮の手前までもどってクリア');
  await shot(page, 'kippu-phone-win');

  // 券売機を指でおさえ続けても買える（駅員さんが見ていない時に、券売機の前へ移して試す）
  await restart(page, 'kippu', 5);
  await page.evaluate(() => OTK.debug.game.warp(4));
  await waitFor(page, () => {
    const g = OTK.debug.game;
    for (let t = 0; t < 2.5; t += 0.05) if (g.visibleAt(g.BUY.x + 20, g.BUY.y + 6, t) >= 0) return false;
    return true;
  }, null, 20000);
  const touch = await page.evaluate(() => { const g = OTK.debug.game; g.me.x = g.BUY.x + 20; g.me.y = g.BUY.y + 6; return { x: g.BUY.x + 20 - g.camX, y: 50 }; });
  await page.mouse.move(cv.x + cv.width * (touch.x / 256), cv.y + cv.height * (touch.y / 224));
  await page.mouse.down();
  await page.waitForTimeout(1900);
  await page.mouse.up();
  const tb = await page.evaluate(() => ({ ticket: OTK.debug.game.me.ticket, x: OTK.debug.game.me.x, y: OTK.debug.game.me.y, res: OTK.debug.run.result }));
  check(tb.ticket && !tb.res, '券売機を指でおさえ続けると、切符が買える（その間は動かない：' + tb.x.toFixed(0) + ',' + tb.y.toFixed(0) + '）');
  // 男魂くんをタップすると、段ボール箱をかぶる
  await restart(page, 'kippu', 5);
  await page.evaluate(() => { const g = OTK.debug.game; g.warp(3); g.NPCS.forEach((n) => { n.leg = 'back'; }); g.me.x = g.boxes[0].x + 3; g.me.y = g.boxes[0].y; });
  await page.waitForTimeout(400); // 画面（カメラ）が追いつくまで（人はいったん消しておく）
  const tap = await page.evaluate(() => { const g = OTK.debug.game; return { x: g.me.x - g.camX, y: g.me.y - 10 }; });
  await page.touchscreen.tap(cv.x + cv.width * (tap.x / 256), cv.y + cv.height * (tap.y / 224));
  await page.waitForTimeout(150);
  check(await page.evaluate(() => !!OTK.debug.game.me.box), '男魂くんをタップすると、段ボール箱をかぶる');
  await shot(page, 'kippu-phone-box');

  // しっぱい：待たずに歩き続けると見つかり、♥ がなくなる
  await restart(page, 'kippu', 5);
  await page.evaluate(() => { OTK.debug.game.warp(1); OTK.debug.speed = 3; });
  for (let n = 0; n < 3; n++) {
    await ctl.setDir(['down']);
    await page.waitForTimeout(250);
    await ctl.setDir(['right']);
    await waitFor(page, () => OTK.debug.game.caught, null, 20000);
    await ctl.release();
    await waitFor(page, () => !OTK.debug.game.busy || OTK.debug.run.result, null, 8000);
  }
  await page.evaluate(() => { OTK.debug.speed = 1; });
  await waitFor(page, () => OTK.debug.run.result, null, 5000);
  r = await result(page);
  check(r.result === 'lose', '見つかり続けると、しっぱい');
  const errs = realErrors(errors);
  check(!errs.length, 'エラーなし' + (errs.length ? '：' + errs.join('\n') : ''));
  await page.context().close();
}

// 2 回しっぱいしたあと（tries 2）は少し易しくなる（うんこ）
// 時間を止めて比べたいので、OTK.makeRun で 1 回ぶんを作って、手で進めて調べる。
async function easyMode(open) {
  console.log('2 回しっぱいしたあとの易しさ');
  const { page, errors } = await open('game/?play=unko&quick=1&seed=1', { wait: 300 });
  await waitScene(page, 'play');
  const r = await page.evaluate(() => {
    OTK.debug.speed = 0.1; // 画面で動いている方は、ほぼ止めておく
    const make = (id, tries) => {
      OTK.seed = 5;
      const run = OTK.makeRun(id, { practice: true, tries });
      OTK.seed = null;
      run.start();
      return run;
    };
    // うんこ：最初の 1 個が落ちるまでの時間
    const fly = (tries) => {
      const run = make('unko', tries);
      for (let i = 0; i < 600 && !run.game.poops.length; i++) run.update(1 / 60);
      return run.game.poops[0].dur;
    };
    return { fly0: fly(0), fly2: fly(2) };
  });
  check(r.fly2 > r.fly0 + 0.1, 'うんこ：影が長く出る（' + r.fly0.toFixed(2) + ' → ' + r.fly2.toFixed(2) + ' 秒）');
  await page.evaluate(() => { OTK.debug.speed = 1; OTK.debug.seed(5); OTK.debug.start('kippu', { quick: true, tries: 2 }); });
  await page.waitForFunction(() => OTK.debug.scene === 'play' && OTK.debug.current === 'kippu');
  const g2 = await page.evaluate(() => [OTK.debug.api.tries, OTK.debug.game.maxLives]);
  check(g2[0] === 2 && g2[1] === 4, 'OTK.debug.start(id, { tries: 2 }) でも同じ易しさ（tries ' + g2[0] + '・♥' + g2[1] + '）');
  const errs = realErrors(errors);
  check(!errs.length, 'エラーなし' + (errs.length ? '：' + errs.join('\n') : ''));
  await page.context().close();
}

withSite(PORT, async ({ open }) => {
  await easyMode(open);
  if (!ONLY || ONLY === 'kippu') {
    await kippuDesktop(open);
    await kippuGimmicks(open);
    if (!NO_PHONE) await kippuPhone(open);
  }
  if (!ONLY || ONLY === 'unko') {
    await unkoDesktop(open);
    if (!NO_PHONE) await unkoPhone(open);
  }
  console.log('ぜんぶ ok');
}).catch((e) => { console.error(e); process.exit(1); });
