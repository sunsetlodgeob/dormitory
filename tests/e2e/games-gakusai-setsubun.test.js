/*
 * ミニゲーム「女子100人勧誘」（gakusai）と「節分ピラミッド」（setsubun）の確認
 *   node tests/e2e/games-gakusai-setsubun.test.js
 *   SHOTS_DIR=/tmp/shots node tests/e2e/games-gakusai-setsubun.test.js   … スクリーンショットも撮る（リポジトリの外に）
 *   ONLY=gakusai node tests/e2e/games-gakusai-setsubun.test.js           … 片方だけ
 *   NO_PHONE=1 … スマホの確認をとばす
 * ふつうの操作（キーボード・画面のボタン・タップ）で、クリアとしっぱいの両方にたどり着けること、
 * パソコンとスマホ（幅 360px も）でエラーが出ないことを確かめる。
 * ボットは画面に見えているもの（黄色いかっこの相手、ゲージのマーカー、飛んでくる物、警察の「！」）を見て動く。
 */
const fs = require('fs');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8834;
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
async function restart(page, id, seed, speed) {
  await page.evaluate(([i, s, sp]) => { OTK.debug.speed = sp; OTK.debug.seed(s); OTK.debug.start(i, { quick: true }); }, [id, seed, speed || 1]);
  await waitScene(page, 'play');
  await waitFor(page, () => OTK.debug.run && OTK.debug.run.phase === 'play' && OTK.debug.run.t > 0.05);
}
const result = (page) => page.evaluate(() => (OTK.debug.run ? { result: OTK.debug.run.result, msg: OTK.debug.run.msg } : null));
const setSpeed = (page, v) => page.evaluate((s) => { OTK.debug.speed = s; }, v);
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
// ゲームの座標（256×224）→ ページの座標
async function gamePoint(page) {
  const b = await page.locator('#otk-canvas').boundingBox();
  return (x, y) => ({ x: b.x + (x / 256) * b.width, y: b.y + (y / 224) * b.height });
}
function noErrors(errors, label) {
  const errs = realErrors(errors);
  check(errs.length === 0, 'コンソールにエラーがない' + (label || '') + (errs.length ? '\n' + errs.join('\n') : ''));
}

// ── 操作のしかた（キーボード／画面のボタン） ─────────────────────
function keyboardCtl(page) {
  const KEY = { a: 'KeyZ', b: 'KeyX', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  return {
    name: 'キーボード',
    tap: (k) => page.keyboard.press(KEY[k]),
    hold: (k, on) => (on ? page.keyboard.down(KEY[k]) : page.keyboard.up(KEY[k])),
  };
}
// スマホ：A・十字キーはタッチでたたく。B のおしっぱなしは指（マウス）でおさえる
async function padCtl(page) {
  const box = async (sel) => center(await page.locator(sel).boundingBox());
  const btn = { a: await box('[data-otk-key="a"]'), b: await box('[data-otk-key="b"]') };
  const padBox = await page.locator('#otk-dpad').boundingBox();
  const pad = center(padBox), r = padBox.width / 2;
  const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  return {
    name: '画面のボタン',
    tap(k) {
      if (btn[k]) return page.touchscreen.tap(btn[k].x, btn[k].y);
      return page.touchscreen.tap(pad.x + DIR[k][0] * r * 0.6, pad.y + DIR[k][1] * r * 0.6);
    },
    async hold(k, on) {
      if (on) {
        await page.mouse.move(btn[k].x, btn[k].y);
        await page.mouse.down();
      } else await page.mouse.up();
    },
  };
}

// スマホの大きさ（幅 360px）でも、横にはみ出さず、画面と A・B ボタンが見えている
async function phoneLayout(page, label) {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(300);
  const lay = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    const cv = r('#otk-canvas'), a = r('[data-otk-key="a"]'), b = r('[data-otk-key="b"]'), pad = r('#otk-dpad');
    return { sw: document.documentElement.scrollWidth, cv: [cv.left, cv.right, cv.width], a: [a.left, a.right, a.bottom], b: [b.left, b.right], pad: [pad.left, pad.right], vh: innerHeight };
  });
  check(lay.sw <= 360, label + '：幅 360px で横にはみ出さない（' + lay.sw + 'px）');
  check(lay.cv[0] >= 0 && lay.cv[1] <= 360 && lay.cv[2] >= 256, label + '：ゲーム画面が幅に入る（' + Math.round(lay.cv[2]) + 'px）');
  check(lay.a[0] >= 0 && lay.a[1] <= 360 && lay.b[0] >= 0 && lay.pad[0] >= 0 && lay.a[2] <= lay.vh, label + '：十字キーと A・B ボタンが見えている');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, label + '-360.png') });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(200);
}

// ── 女子100人勧誘（gakusai） ────────────────────────────────
const gakusaiState = (page) => page.evaluate(() => {
  const g = OTK.debug.game, r = OTK.debug.run;
  return {
    res: r.result, t: r.t, count: g.count, lane: g.lane, cool: g.cool, target: g.target(), zone: g.zone(), stats: g.stats,
    thinking: g.groups.some((x) => x.state === 'think'),
    danshiIn: g.groups.filter((x) => x.kind === 'danshi' && x.state === 'join').length,
  };
});
// 黄色いかっこの相手が女子なら声をかける。おばちゃん・男子なら、女子のいる列に切りかえる。
// o.tapGroup：スマホのとき、相手を画面でタップしてさそう（A ボタンとかわりばんこ）
// o.probe：おばちゃん（−10 人）と男子（数えない）にも 1 回ずつ声をかけて、数の変わり方を見る
async function gakusaiBot(page, ctl, o) {
  o = o || {};
  const label = o.label || 'gakusai';
  const seen = { half: false, obaDrop: null, danshiSame: null, asks: 0 };
  const pt = o.tapGroup ? await gamePoint(page) : null;
  let probe = null; // 確かめている最中 { kind, before, tried, oba, danshiIn, at }
  let last = 0;
  for (let i = 0; i < 30000; i++) {
    const s = await gakusaiState(page);
    if (s.res) break;
    if (s.count >= 50 && !seen.half) { seen.half = true; await shot(page, label + '-half'); }
    // 確かめ中：声をかけて、返事が来るまで待つ（ねらった相手でなかったら、やりなおし）
    if (probe) {
      if (s.stats.tried > probe.tried && !s.thinking) {
        if (probe.kind === 'oba' && s.stats.oba > probe.oba) {
          seen.obaDrop = probe.before - s.count;
          await shot(page, label + '-oba');
        }
        if (probe.kind === 'danshi' && s.danshiIn > probe.danshiIn) seen.danshiSame = s.count === probe.before;
        probe = null;
      } else if (Date.now() - probe.at > 1500) probe = null;
      await page.waitForTimeout(10);
      continue;
    }
    if (Date.now() - last < (o.gap || 60) || s.cool > 0 || !s.target) { await page.waitForTimeout(10); continue; }
    const t = s.target;
    let ask = t.kind === 'joshi';
    if (o.probe && !s.thinking && s.count >= 15 && ((t.kind === 'oba' && seen.obaDrop == null) || (t.kind === 'danshi' && seen.danshiSame == null))) {
      ask = true;
      probe = { kind: t.kind, before: s.count, tried: s.stats.tried, oba: s.stats.oba, danshiIn: s.danshiIn, at: Date.now() };
    }
    last = Date.now();
    if (ask) {
      seen.asks++;
      if (pt && seen.asks % 2 === 0) {
        const z = s.zone.find((g) => g.lane === t.lane && Math.abs(g.x - t.x) < 0.5);
        const p = pt(z ? z.x : t.x, z ? z.y : 150);
        await page.touchscreen.tap(p.x, p.y);
      } else await ctl.tap('a');
      continue;
    }
    // 女子がもう一方の列にいれば、そちらへ
    const other = s.zone.find((g) => g.lane !== s.lane && g.kind === 'joshi');
    if (other) {
      if (pt) {
        const p = pt(other.x, other.y);
        await page.touchscreen.tap(p.x, p.y);
      } else await ctl.tap(other.lane === 0 ? 'up' : 'down');
    }
  }
  return seen;
}

async function gakusaiDesktop(open) {
  console.log('女子100人勧誘（パソコン・キーボード）');
  const { page, errors } = await open('game/?play=gakusai&seed=7', { wait: 300 });
  await waitScene(page, 'intro');
  await page.waitForTimeout(600);
  await shot(page, 'gakusai-intro');
  check(await page.evaluate(() => /フィクション/.test(document.querySelector('footer[data-ob-footer]').textContent)), 'ページの下に「フィクション」の注記がある');
  await page.keyboard.press('KeyZ');
  await waitScene(page, 'countdown');
  await page.waitForTimeout(300);
  await shot(page, 'gakusai-countdown');
  await waitScene(page, 'play');
  await page.waitForTimeout(500);
  await shot(page, 'gakusai-start');
  check((await canvasColors(page)) > 16, '模擬店と通りが描けている');
  const ctl = keyboardCtl(page);

  // ↑↓ で列をえらぶ
  await ctl.tap('up');
  await page.waitForTimeout(60);
  const l0 = await page.evaluate(() => OTK.debug.game.lane);
  await ctl.tap('down');
  await page.waitForTimeout(60);
  const l1 = await page.evaluate(() => OTK.debug.game.lane);
  check(l0 === 0 && l1 === 1, '↑ で奥の列、↓ で手前の列をえらぶ');

  // A で声をかけると、返事が来る（来てくれたら、グループの人数だけ増える）
  await waitFor(page, () => { const t = OTK.debug.game.target(); return t && t.kind === 'joshi' && OTK.debug.game.cool <= 0; });
  const before = await page.evaluate(() => ({ count: OTK.debug.game.count, tried: OTK.debug.game.stats.tried }));
  await ctl.tap('a');
  await waitFor(page, (n) => OTK.debug.game.stats.tried > n, before.tried, 3000);
  const asked = await page.evaluate(() => { const g = OTK.debug.game.groups.find((x) => x.state === 'think'); return { kind: g.kind, n: g.n }; });
  await waitFor(page, () => !OTK.debug.game.groups.some((g) => g.state === 'think'), null, 3000);
  const after = await page.evaluate(() => ({ count: OTK.debug.game.count, tried: OTK.debug.game.stats.tried }));
  check(after.tried === before.tried + 1 && asked.kind === 'joshi', 'A で、のぼりの間の女子のグループ（' + asked.n + ' 人）に声をかける');
  check(after.count === before.count || after.count === before.count + asked.n, '返事は「来る（＋' + asked.n + '人）」か「ことわる」（' + before.count + '→' + after.count + '）');
  // 声をかけたすぐあとは、少し待たないと次に声をかけられない
  await ctl.tap('a');
  await page.waitForTimeout(40);
  const cool = await page.evaluate(() => OTK.debug.game.cool);
  check(cool > 0 && cool <= 0.3, '声をかけたあとは、少し間があく（' + cool.toFixed(2) + ' 秒）');

  // クリア：女子だけに声をかける（2 倍速。3 回まで）
  let r = null, seen = null;
  for (const seed of [7, 8, 9]) {
    await restart(page, 'gakusai', seed, 2);
    seen = await gakusaiBot(page, ctl, {});
    r = await result(page);
    if (r.result === 'win') break;
    console.log('      （種 ' + seed + ' はとどかず：' + r.msg.replace(/\n/g, '') + '）');
  }
  check(r && r.result === 'win', '女子に声をかけ続けると、100 人に届いてクリア');
  const st = await page.evaluate(() => ({ count: OTK.debug.game.count, stats: OTK.debug.game.stats, t: OTK.debug.run.t }));
  check(st.count >= 100 && /100人達成/.test(r.msg), st.count + ' 人（' + st.t.toFixed(1) + ' 秒、声かけ ' + st.stats.tried + ' 回、来てくれた ' + st.stats.joined + ' 組）');
  check(seen.half, '50 人をこえたところも通った');
  await setSpeed(page, 1);
  await page.waitForTimeout(700);
  await shot(page, 'gakusai-win');
  await waitScene(page, 'result', 8000);
  await page.waitForTimeout(500);
  await shot(page, 'gakusai-result-win');

  // とりのおばちゃんは −10 人、男子は数えない（2 倍速。見られたら、そこでおしまい）
  let probe = null;
  for (const seed of [11, 12, 13]) {
    await restart(page, 'gakusai', seed, 2);
    probe = await gakusaiBot(page, ctl, { probe: true, label: 'gakusai-probe' });
    if (probe.obaDrop != null && probe.danshiSame != null) break;
  }
  check(probe.obaDrop === 10, 'とりのおばちゃんが来ると、10 人へる');
  check(probe.danshiSame === true, '男子が来ても、数は変わらない');

  // しっぱい：だれにも声をかけないと、時間切れ（4 倍速）
  await restart(page, 'gakusai', 21, 4);
  await waitFor(page, () => OTK.debug.run.result, null, 30000);
  await setSpeed(page, 1);
  r = await result(page);
  check(r.result === 'lose' && /0人どまり/.test(r.msg), '声をかけないと時間切れでしっぱい：' + r.msg.replace(/\n/g, ''));
  await waitScene(page, 'result', 8000);
  await page.waitForTimeout(500);
  await shot(page, 'gakusai-result-lose');
  // 結果のあと A でもう一度（しっぱいの回数が 1 増える）
  await page.keyboard.press('KeyZ');
  await waitScene(page, 'play', 8000);
  check(await page.evaluate(() => OTK.debug.api.tries === 1), '結果のあと A で、もう一度遊べる');

  // 音のオン・オフ
  const snd0 = await page.getAttribute('#otk-sound', 'aria-pressed');
  await page.click('#otk-sound');
  const snd1 = await page.getAttribute('#otk-sound', 'aria-pressed');
  await page.click('#otk-sound');
  const snd2 = await page.getAttribute('#otk-sound', 'aria-pressed');
  check(snd0 !== snd1 && snd2 === snd0, '「音」のボタンでオン・オフできる');

  noErrors(errors);
}

async function gakusaiPhone(open) {
  console.log('女子100人勧誘（スマホ・タッチ）');
  const { page, errors } = await open('game/?play=gakusai&seed=31', { phone: true, wait: 300 });
  await waitScene(page, 'intro');
  const a = center(await page.locator('[data-otk-key="a"]').boundingBox());
  await page.touchscreen.tap(a.x, a.y);
  await waitScene(page, 'countdown');
  await waitScene(page, 'play');
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'gakusai-phone-page.png') });
  const ctl = await padCtl(page);

  // 人をタップすると、その人たちをさそう
  await waitFor(page, () => OTK.debug.game.zone().some((g) => g.lane === 0) && OTK.debug.game.cool <= 0 && OTK.debug.game.lane === 1);
  const z = await page.evaluate(() => OTK.debug.game.zone().find((g) => g.lane === 0));
  const pt = await gamePoint(page);
  const p = pt(z.x, z.y);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(80);
  const tapped = await page.evaluate(() => ({ lane: OTK.debug.game.lane, tried: OTK.debug.game.stats.tried }));
  check(tapped.lane === 0 && tapped.tried === 1, '奥の列の人をタップすると、その人たちに声をかける');

  // クリア：A ボタンと、人のタップで（2 倍速。3 回まで）
  let r = null;
  for (const seed of [31, 32, 33]) {
    await restart(page, 'gakusai', seed, 2);
    await gakusaiBot(page, ctl, { tapGroup: true, label: 'gakusai-phone' });
    r = await result(page);
    if (r.result === 'win') break;
    console.log('      （種 ' + seed + ' はとどかず：' + r.msg.replace(/\n/g, '') + '）');
  }
  check(r && r.result === 'win', 'A ボタンと人のタップ（タッチ）で、100 人に届いてクリア');
  await setSpeed(page, 1);

  // しっぱい：何もしないと時間切れ（4 倍速）
  await restart(page, 'gakusai', 34, 4);
  await waitFor(page, () => OTK.debug.run.result, null, 30000);
  await setSpeed(page, 1);
  r = await result(page);
  check(r.result === 'lose', '何もしないと、時間切れでしっぱい（スマホ）');

  await phoneLayout(page, 'gakusai-phone');
  noErrors(errors, '（スマホ）');
}

// ── 節分ピラミッド（setsubun） ────────────────────────────────
const setsubunState = (page) => page.evaluate(() => {
  const g = OTK.debug.game, r = OTK.debug.run;
  return { res: r.result, t: r.t, p: g.peek(), m: g.marker, state: g.state, stats: g.stats };
});
// マーカーがゾーンのまん中に来たら A。物が飛んできたら B でふんばる。警察の「！」が出たら ↓。
// o.brace：false でふんばらない／o.police：false で逃げない／o.stopAt：その人数で、のせるのをやめる
async function setsubunBot(page, ctl, o) {
  o = o || {};
  const label = o.label || 'setsubun';
  const seen = { alarm: false, hide: false, patrol: false, back: false, before: null, after: null, brace: false, collapse: false };
  let bracing = false, alarmAt = 0, lastA = 0;
  for (let i = 0; i < 30000; i++) {
    const s = await setsubunState(page);
    if (s.res) {
      if (s.state === 'collapse') seen.collapse = true;
      break;
    }
    const pc = s.p.police;
    if (pc) {
      if (bracing) { bracing = false; await ctl.hold('b', false); }
      if (pc === 'alarm') {
        if (!seen.alarm) { seen.alarm = true; seen.before = s.p.built; alarmAt = Date.now(); await page.waitForTimeout(o.alarmDelay != null ? 0 : 150); await shot(page, label + '-alarm'); }
        if (o.police !== false && Date.now() - alarmAt >= (o.alarmDelay != null ? o.alarmDelay : 250)) await ctl.tap('down');
      }
      if (pc === 'hide' && !seen.hide) { seen.hide = true; await page.waitForTimeout(300); await shot(page, label + '-hide'); }
      if (pc === 'patrol' && !seen.patrol) { seen.patrol = true; await page.waitForTimeout(1500); await shot(page, label + '-patrol'); }
      if (pc === 'back') seen.back = true;
      await page.waitForTimeout(10);
      continue;
    }
    if (seen.back && seen.after == null) seen.after = s.p.built;
    // ふんばる
    const danger = s.p.incoming.some((f) => f.eta < 0.4 && f.eta > -0.1);
    const want = o.brace !== false && s.p.built > 0 && (danger || s.p.wob > 60 || (bracing && s.p.wob > 35));
    if (want !== bracing) {
      bracing = want;
      await ctl.hold('b', want);
      if (want && !seen.brace && s.p.built >= 3) { seen.brace = true; await page.waitForTimeout(120); await shot(page, label + '-brace'); }
    }
    // のせる
    const build = o.stopAt == null || s.p.built < o.stopAt;
    if (!want && build && !s.p.busy && Date.now() - lastA > 200) {
      const m = s.m;
      const near = (s.p.markerEta != null && s.p.markerEta < 0.03) || (m.inZone && Math.abs(m.pos - m.zone) < m.w * 0.25);
      if (near) { lastA = Date.now(); await ctl.tap('a'); }
    }
    await page.waitForTimeout(4);
  }
  if (bracing) await ctl.hold('b', false);
  return seen;
}

async function setsubunDesktop(open) {
  console.log('節分ピラミッド（パソコン・キーボード）');
  const { page, errors } = await open('game/?play=setsubun&seed=5', { wait: 300 });
  await waitScene(page, 'intro');
  await page.waitForTimeout(600);
  await shot(page, 'setsubun-intro');
  await page.keyboard.press('KeyZ');
  await waitScene(page, 'countdown');
  await waitScene(page, 'play');
  await page.waitForTimeout(400);
  await shot(page, 'setsubun-start');
  check((await canvasColors(page)) > 12, '夜の寮の玄関が描けている');
  const ctl = keyboardCtl(page);

  // ゾーンの外で A をおすと、その人は転がり落ちる（ぐらぐらが少し増える）
  await waitFor(page, () => { const m = OTK.debug.game.marker; return Math.abs(m.pos - m.zone) > m.w * 1.2 && !OTK.debug.game.peek().busy; });
  await ctl.tap('a');
  await page.waitForTimeout(500);
  let st = await page.evaluate(() => ({ built: OTK.debug.game.built, miss: OTK.debug.game.stats.miss, wob: OTK.debug.game.wob }));
  check(st.built === 0 && st.miss === 1 && st.wob > 0, 'ゾーンをはずすと、転がり落ちて、ぐらぐらが増える');
  await shot(page, 'setsubun-tumble');
  // B をおしている間は、のせられない
  await waitFor(page, () => !OTK.debug.game.peek().busy, null, 3000);
  await ctl.hold('b', true);
  await waitFor(page, () => OTK.debug.game.marker.inZone, null, 3000);
  await ctl.tap('a');
  await page.waitForTimeout(100);
  st = await page.evaluate(() => ({ built: OTK.debug.game.built, bracing: OTK.debug.game.bracing, busy: OTK.debug.game.peek().busy }));
  await ctl.hold('b', false);
  check(st.bracing && st.built === 0 && !st.busy, 'B でふんばっている間は、A をおしても、のせられない');

  // クリア：タイミングよくのせ、物が来たらふんばり、警察から逃げる（3 回まで）
  let r = null, seen = null;
  for (const seed of [5, 6, 7]) {
    await restart(page, 'setsubun', seed);
    seen = await setsubunBot(page, ctl, {});
    r = await result(page);
    if (r.result === 'win') break;
    console.log('      （種 ' + seed + ' はしっぱい：' + r.msg.replace(/\n/g, '') + '）');
  }
  check(r && r.result === 'win' && /ピラミッド完成/.test(r.msg), '10 人のせて、ピラミッドが完成（' + (r && r.result) + '）');
  st = await page.evaluate(() => ({ built: OTK.debug.game.built, stats: OTK.debug.game.stats, t: OTK.debug.run.t }));
  check(st.built === 10, '4・3・2・1 の 10 人（' + st.t.toFixed(1) + ' 秒、当たった ' + st.stats.hits + '、ふんばった ' + st.stats.braced + '、はずした ' + st.stats.miss + '）');
  check(st.stats.braced > 0, '飛んでくる物を、B でふんばって受けた');
  check(seen.alarm && seen.hide && seen.patrol && seen.back, '警察が来て、↓ で中に逃げ、行ってしまうと出てくる');
  check(seen.after === seen.before, '警察が行ったあと、続き（' + seen.before + ' 人）から再開');
  await page.waitForTimeout(900);
  await shot(page, 'setsubun-win');
  await waitScene(page, 'result', 8000);
  await page.waitForTimeout(500);
  await shot(page, 'setsubun-result-win');

  // しっぱい 1：ふんばらないと、物が当たってくずれる（4 人のせて待つ）
  await restart(page, 'setsubun', 41);
  seen = await setsubunBot(page, ctl, { brace: false, stopAt: 4, label: 'setsubun-nobrace' });
  r = await result(page);
  check(r.result === 'lose' && seen.collapse && /くずれた/.test(r.msg), 'ふんばらないと、ぐらぐらが満タンになってくずれる');
  await page.waitForTimeout(900);
  await shot(page, 'setsubun-collapse');

  // しっぱい 2：警察が来ても逃げないと、つかまる
  await restart(page, 'setsubun', 42);
  seen = await setsubunBot(page, ctl, { police: false, label: 'setsubun-nopolice' });
  r = await result(page);
  check(r.result === 'lose' && seen.alarm && /警察/.test(r.msg), '警察の「！」で ↓ をおさないと、つかまる');
  await page.waitForTimeout(1500);
  await shot(page, 'setsubun-caught');

  // しっぱい 3：のせないでいると、時間切れ（警察からは逃げる。4 倍速）
  await restart(page, 'setsubun', 43, 4);
  seen = await setsubunBot(page, ctl, { stopAt: 0, alarmDelay: 0, label: 'setsubun-idle' });
  await setSpeed(page, 1);
  r = await result(page);
  check(r.result === 'lose' && seen.hide && /時間切れ/.test(r.msg), 'のせないでいると、時間切れでしっぱい');

  noErrors(errors);
}

async function setsubunPhone(open) {
  console.log('節分ピラミッド（スマホ・画面のボタン）');
  const { page, errors } = await open('game/?play=setsubun&seed=51', { phone: true, wait: 300 });
  await waitScene(page, 'intro');
  const a = center(await page.locator('[data-otk-key="a"]').boundingBox());
  await page.touchscreen.tap(a.x, a.y);
  await waitScene(page, 'play');
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'setsubun-phone-page.png') });
  const ctl = await padCtl(page);

  // クリア：A ボタン（タッチ）・B ボタン（おしっぱなし）・十字キーの ↓（3 回まで）
  let r = null, seen = null;
  for (const seed of [51, 52, 53]) {
    await restart(page, 'setsubun', seed);
    seen = await setsubunBot(page, ctl, { label: 'setsubun-phone' });
    r = await result(page);
    if (r.result === 'win') break;
    console.log('      （種 ' + seed + ' はしっぱい：' + r.msg.replace(/\n/g, '') + '）');
  }
  check(r && r.result === 'win', '画面のボタンで、ピラミッドが完成');
  check(seen.hide && seen.back, '十字キーの ↓（タッチ）で、警察から逃げられる');

  // 警察の「！」のときに玄関をタップしても、中に逃げられる（30 秒たつと来るので、早送りで待つ）
  await restart(page, 'setsubun', 54, 4);
  await waitFor(page, () => OTK.debug.game.police === 'alarm', null, 20000);
  await setSpeed(page, 1);
  const pt = await gamePoint(page);
  const door = pt(216, 160);
  await page.touchscreen.tap(door.x, door.y);
  await page.waitForTimeout(150);
  check(await page.evaluate(() => OTK.debug.game.police === 'hide'), '「！」のときに玄関をタップすると、中に逃げる');

  // しっぱい：警察から逃げないと、つかまる
  await restart(page, 'setsubun', 55);
  await setsubunBot(page, ctl, { police: false, label: 'setsubun-phone-nopolice' });
  r = await result(page);
  check(r.result === 'lose' && /警察/.test(r.msg), '逃げないと、つかまってしっぱい（スマホ）');

  await phoneLayout(page, 'setsubun-phone');
  noErrors(errors, '（スマホ）');
}

withSite(PORT, async ({ open }) => {
  const t0 = Date.now();
  if (!ONLY || ONLY === 'gakusai') {
    await gakusaiDesktop(open);
    if (!NO_PHONE) await gakusaiPhone(open);
  }
  if (!ONLY || ONLY === 'setsubun') {
    await setsubunDesktop(open);
    if (!NO_PHONE) await setsubunPhone(open);
  }
  console.log('すべて ok（' + ((Date.now() - t0) / 1000).toFixed(0) + ' 秒）');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
