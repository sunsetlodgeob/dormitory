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
// 決まり：同期Bは、八景から side（上り -1・下り +1）へ dist 駅目（2〜5）。
// 間の駅には、そこから同期Bまでの駅の数で決まる落とし物（あと 4 駅＝くつ、3 駅＝くつした、2 駅＝シャツ、1 駅＝ズボン）。
// 反対側の駅と、同期Bより先の駅には何もない。ゲームの答えあわせのため、ここでは決まりをゲームとは別に書く。
// 時間：乗るのは 1 駅 5 分、さがすのは 10 分。23:30 から 0:40（終電）まで。
const HOME = 5; // 金沢八景
const NST = 11; // 駅の数
function expectAt(i, side, dist) {
  if (i === HOME) return 'home';
  const k = (i - HOME) * side;
  if (k < 1 || k > dist) return 'none';
  const r = dist - k;
  return r === 0 ? 'b' : r === 4 ? 'shoes' : r === 3 ? 'socks' : r === 2 ? 'shirt' : r === 1 ? 'pants' : '?';
}
const ITEM = { shoes: ['くつ', /くつだ.*4駅/], socks: ['くつした', /くつした.*あと3駅/], shirt: ['シャツ', /シャツ.*あと2駅/], pants: ['ズボン', /ズボン.*つぎの駅/] };
const JUMP = { shoes: 4, socks: 3, shirt: 2, pants: 1 }; // 落とし物から、あと何駅か
const hm = (m) => (Math.floor(m / 60) % 24) + ':' + String(m % 60).padStart(2, '0');
const dstate = (page) => page.evaluate(() => {
  const g = OTK.debug.game;
  return {
    cur: g.st.cur, mode: g.st.mode, clock: g.st.clock, left: g.left, actions: g.st.actions,
    searched: Object.assign({}, g.st.searched), cand: g.st.cand, msg: g.st.msgT > 0 ? g.st.msg : '', name: g.st.msgT > 0 ? g.st.msgName : '',
    bAt: g.bAt, side: g.side, dist: g.dist, rule: g.rule, res: OTK.debug.run.result, rmsg: OTK.debug.run.msg, remaining: OTK.debug.api.remaining,
  };
});
const waitIdle = (page) => waitFor(page, () => OTK.debug.run.result || OTK.debug.game.st.mode === 'idle', null, 8000);
// 1 回うごいて（'left' 'right' 'a'）、終わるまで待つ。act は操作のしかた（キー・タップ・ボタン）
async function dstep(page, act, what) {
  await waitIdle(page);
  const before = await page.evaluate(() => OTK.debug.game.st.actions);
  await act(what);
  await waitFor(page, (b) => OTK.debug.run.result || OTK.debug.game.st.actions > b, before, 4000);
  await waitIdle(page);
  return dstate(page);
}
// 時間がかからない操作（八景でさがす・さがした駅をもう一度など）
async function dfree(page, act, what) {
  await waitIdle(page);
  await act(what);
  await page.waitForTimeout(150);
  return dstate(page);
}
// 種ごとに、同期Bの向きと駅の数を調べる（遊ばずに、ゲームを作るだけ）
async function deisuiSeeds(page, n) {
  return page.evaluate((n) => {
    const keep = OTK.seed, out = [];
    for (let s = 1; s <= n; s++) {
      OTK.seed = s;
      const g = OTK.makeRun('deisui', { practice: true }).game;
      out.push({ seed: s, side: g.side, dist: g.dist, bAt: g.bAt, at: g.rule.STATIONS.map((_, i) => g.what(i)) });
    }
    OTK.seed = keep;
    return out;
  }, n);
}
// 頭の中で遊んでみて、何分かかるか（ゲームの決まり expectAt と、乗る 1 駅 rideMin 分・さがす lookMin 分で数える）
function simulate(side, dist, first, policy, rideMin, lookMin) {
  let cur = HOME, min = 0;
  const seen = {};
  const ride = (to) => { min += Math.abs(to - cur) * rideMin; cur = to; };
  const look = () => { min += lookMin; return (seen[cur] = expectAt(cur, side, dist)); };
  const end = first > 0 ? NST - 1 : 0, other = first > 0 ? 0 : NST - 1;
  if (policy === 'smart' || policy === 'medium') {
    // となりの駅をさがす。何もなければ反対側のとなりへ。あとは、smart は落とし物の駅の数だけまっすぐ、medium は 1 駅ずつ
    let dir = first;
    ride(HOME + dir);
    let r = look();
    if (r === 'none') { dir = -dir; ride(HOME + dir); r = look(); }
    while (r !== 'b') {
      const jump = policy === 'medium' ? 1 : JUMP[r];
      ride(cur + dir * jump);
      r = look();
    }
    return min;
  }
  if (policy === 'every') {
    // 落とし物を見ずに、はしまで全部の駅をさがして、それから反対へ
    let dir = first;
    for (let n = 0; n < 100; n++) {
      if (cur + dir < 0 || cur + dir >= NST) dir = -dir;
      ride(cur + dir);
      if (cur !== HOME && seen[cur] == null && look() === 'b') return min;
    }
    return Infinity;
  }
  if (policy === 'toEnd') {
    // はしまで乗ってさがし、いなければ反対のはしまで乗ってさがす
    ride(end);
    if (look() === 'b') return min;
    ride(other);
    if (look() === 'b') return min;
    return Infinity;
  }
  throw new Error(policy);
}
// 落とし物を見て、まっすぐ同期Bのところへ。わざと反対側のとなりから見る（いちばん運が悪いとき）。
// jumpOf(item) で、落とし物を見てから何駅乗るかを決める（ふつうは、落とし物の示す駅の数）
async function deisuiPlay(page, act, label, jumpOf) {
  jumpOf = jumpOf || ((it) => JUMP[it]);
  const s0 = await dstate(page);
  const toward = s0.side > 0 ? 'right' : 'left', away = s0.side > 0 ? 'left' : 'right';
  const exp = (i) => expectAt(i, s0.side, s0.dist);
  let s = await dstep(page, act, away);
  check(s.clock === s0.clock + s0.rule.RIDE_MIN, '電車で 1 駅：' + hm(s0.clock) + ' → ' + hm(s.clock) + '（5 分）');
  if (label) await shot(page, label + '-arrive');
  const c1 = s.clock;
  s = await dstep(page, act, 'a');
  check(s.searched[s.cur] === 'none' && /反対側/.test(s.msg), '反対側のとなりの駅には何もない（' + s.msg + '）');
  check(s.clock === c1 + s0.rule.LOOK_MIN, '駅をさがす：' + hm(c1) + ' → ' + hm(s.clock) + '（10 分）');
  if (label) await shot(page, label + '-nothing');
  s = await dstep(page, act, toward);
  s = await dstep(page, act, toward);
  s = await dstep(page, act, 'a');
  for (let n = 0; n < 12 && !s.res; n++) {
    const got = s.searched[s.cur], k = (s.cur - HOME) * s0.side, r = s0.dist - k;
    check(got === exp(s.cur) && ITEM[got] && ITEM[got][1].test(s.msg), k + ' 駅目：' + (ITEM[got] ? ITEM[got][0] : got) + '（同期Bまで、あと ' + r + ' 駅）「' + s.msg + '」');
    check(s.cand && s.cand.includes(s0.bAt), '　路線図の「？」に、同期Bの駅が入っている（' + s.cand.map((i) => i - HOME).join(',') + '）');
    if (label && n === 0) await shot(page, label + '-clue');
    for (let j = 0; j < jumpOf(got); j++) s = await dstep(page, act, toward);
    s = await dstep(page, act, 'a');
  }
  if (label) {
    await waitFor(page, () => OTK.debug.run.result, null, 5000);
    await page.waitForTimeout(600);
    await shot(page, label + '-found');
  }
  return s;
}
// 落とし物を見ずに、はしまで全部の駅をさがしていく。その間、時計と終電がくいちがわないことを毎回たしかめる
async function deisuiEvery(page, act, first) {
  let s = await dstate(page);
  let dir = first, bad = '';
  for (let n = 0; n < 60 && !s.res; n++) {
    if ((dir === 'left' && s.cur === 0) || (dir === 'right' && s.cur === NST - 1)) dir = dir === 'left' ? 'right' : 'left';
    s = await dstep(page, act, dir);
    if (!s.res && s.cur !== HOME && !s.searched[s.cur]) s = await dstep(page, act, 'a');
    if (s.remaining !== null) bad += ' 本物の秒数の制限がある(' + s.remaining + ')';
    if (!s.res && !(s.left > 0)) bad += ' ' + hm(s.clock) + 'なのに続いている';
    if (!s.res && /終電/.test(s.msg)) bad += ' 時間があるのに「' + s.msg + '」';
    if (s.res && s.res === 'lose' && s.left !== 0) bad += ' ' + hm(s.clock) + 'なのに終わった';
  }
  return { s, bad };
}

async function deisuiDesktop(open) {
  console.log('同期Bをさがせ（パソコン・キーボード）');
  const { page, errors } = await open('game/?play=deisui&seed=5', { wait: 300 });
  const warns = [];
  page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
  await waitScene(page, 'intro');
  await page.waitForTimeout(800);
  await shot(page, 'deisui-intro');
  check(!warns.some((w) => /入りきりません/.test(w)), '説明画面に、説明と注記が入りきる');
  const def = await page.evaluate(() => { const d = OTK.get('deisui'); return { time: d.time, howto: d.howto, note: d.note, goal: d.goal }; });
  check(def.time === null, '本物の秒数の制限はない（time: null）。制限は、ゲームの中の時計（終電）だけ');
  check(def.howto.length <= 3 && /駅へ（5分）/.test(def.howto.join()) && /さがす（10分）/.test(def.howto.join()) && /何駅/.test(def.howto.join()), '説明に、乗るのは 5 分・さがすのは 10 分・服で何駅かわかる');
  check(/くつ＝あと4駅/.test(def.note) && /くつした＝3駅/.test(def.note) && /シャツ＝2駅/.test(def.note) && /ズボン＝つぎ/.test(def.note), '注記に、落とし物ごとの駅の数（' + def.note.replace(/\n/g, '') + '）');
  await page.keyboard.press('Enter');
  await waitScene(page, 'play', 8000);
  await page.waitForTimeout(300);
  await shot(page, 'deisui-start');
  check((await canvasColors(page)) > 12, '路線図と駅の絵が描けている');
  const keys = { left: 'ArrowLeft', right: 'ArrowRight', a: 'KeyZ' };
  const act = (w) => page.keyboard.press(keys[w]);
  let s = await dstate(page);
  const R = s.rule;
  check(s.clock === 23 * 60 + 30 && s.left === 70 && R.LAST === 24 * 60 + 40 && R.RIDE_MIN === 5 && R.LOOK_MIN === 10 && s.remaining === null, 'はじめは 23:30、終電は 0:40（あと 70 分）。乗るのは 5 分、さがすのは 10 分');
  await waitFor(page, () => OTK.debug.game.st.msgName === '駅員' && /上りか下りか/.test(OTK.debug.game.st.msg), null, 8000);
  await page.waitForTimeout(400);
  await shot(page, 'deisui-ekiin');
  check(true, '八景の駅員さんが「上りか下りかは、わからないねえ」');
  s = await dfree(page, act, 'a');
  check(s.clock === R.START && /八景には/.test(s.msg), '八景でさがしても、時間はかからない（' + s.msg + '）');
  await page.waitForTimeout(2500);
  s = await dstate(page);
  check(s.clock === R.START && !s.res, 'じっとしていても、時計はすすまない（時間の制限は時計だけ）');

  // 決まり：どの駅に何があるか（150 とおりの種で、全部の駅）
  const rows = await deisuiSeeds(page, 150);
  const wrong = [];
  const combos = {};
  rows.forEach((r) => {
    combos[r.side + ':' + r.dist] = combos[r.side + ':' + r.dist] || r.seed;
    r.at.forEach((w, i) => { if (w !== expectAt(i, r.side, r.dist)) wrong.push('種' + r.seed + ' 駅' + i + ':' + w); });
    if (!(r.dist >= 2 && r.dist <= 5) || Math.abs(r.side) !== 1 || r.bAt !== HOME + r.side * r.dist) wrong.push('種' + r.seed + ' side/dist');
  });
  check(wrong.length === 0, '落とし物は、同期Bまでの駅の数のとおり（くつ＝4駅・くつした＝3駅・シャツ＝2駅・ズボン＝1駅）、反対側と先の駅は何もない' + (wrong.length ? '：' + wrong.slice(0, 5).join(' ') : ''));
  check(Object.keys(combos).length === 8, '上り・下り × 2〜5 駅の 8 とおりが、どれも出る（' + Object.keys(combos).sort().join(' ') + '）');

  // 時間のつりあい（頭の中で 8 とおり × 先に見る向き 2 とおり）
  const budget = R.LAST - R.START, step = R.STEP_MIN;
  const sim = (side, dist, f, policy) => simulate(side, dist, f, policy, R.RIDE_MIN, R.LOOK_MIN);
  const worst = (policy, firstWrong) => Math.max(...Object.keys(combos).map((c) => {
    const [side, dist] = c.split(':').map(Number);
    return Math.max(...(firstWrong ? [-side] : [-1, 1]).map((f) => sim(side, dist, f, policy)));
  }));
  const wSmart = worst('smart', false), wMedium = worst('medium', true), wEvery = worst('every', true), wEnd = worst('toEnd', true);
  check(wSmart <= budget - step, '落とし物を見てまっすぐ乗れば、いちばん運が悪くても ' + wSmart + ' 分（' + (budget - wSmart) + ' 分あまる）');
  check(wEvery > budget, '全部の駅をさがすと、反対側からだと間に合わない（' + wEvery + ' 分 > ' + budget + ' 分）');
  check(wEnd > budget, 'はしまで乗ってさがすと、反対側だと間に合わない（' + (wEnd === Infinity ? '見つからない' : wEnd + ' 分') + '）');
  check(wMedium > budget, '向きがわかっても 1 駅ずつさがすと、いちばん遠いときは間に合わない（' + wMedium + ' 分）');
  // 手がかりを見ないで 1 駅ずつさがす人は、実際の種の出かたで、半分くらいしっぱいする（手がかりが効いている）
  let lostMedium = 0, lostSmart = 0;
  rows.forEach((r) => [-1, 1].forEach((f) => {
    if (sim(r.side, r.dist, f, 'medium') > budget) lostMedium++;
    if (sim(r.side, r.dist, f, 'smart') > budget) lostSmart++;
  }));
  const rate = lostMedium / (rows.length * 2);
  check(rate >= 0.4 && lostSmart === 0, '手がかりを見ないで 1 駅ずつさがすと ' + Math.round(rate * 100) + '% しっぱい（手がかりを見れば 0%）');

  // 電車に乗っているところ
  await restart(page, 'deisui', 5);
  await act('right');
  await page.waitForTimeout(500);
  await shot(page, 'deisui-ride');
  await waitIdle(page);

  // クリア：8 とおり全部、反対側から見て（いちばん運が悪いとき）
  let first = true;
  for (const c of Object.keys(combos).sort()) {
    await restart(page, 'deisui', combos[c]);
    if (!first) await page.evaluate(() => { OTK.debug.speed = 3; });
    const b = await dstate(page);
    s = await deisuiPlay(page, act, first ? 'deisui' : '');
    check(s.res === 'win' && s.left >= 5, (b.side > 0 ? '下り' : '上り') + b.dist + '駅目：見つけてクリア（' + hm(s.clock) + '、終電まで ' + s.left + ' 分あまり）');
    first = false;
  }
  await page.evaluate(() => { OTK.debug.speed = 1; });
  await waitScene(page, 'result', 8000);
  let r = await result(page);
  check(/パンツ一丁/.test(r.msg) && /終電で/.test(r.msg), 'クリアのひとこと（' + r.msg.replace(/\n/g, ' ') + '）');
  await page.waitForTimeout(400);
  await shot(page, 'deisui-result-win');

  // ぎりぎり：くつしたのあと 1 駅だけよけいにさがしても、0:40 ちょうどに見つければクリア
  const far = combos['1:5'], mid = combos['1:4'];
  await restart(page, 'deisui', mid);
  await page.evaluate(() => { OTK.debug.speed = 3; });
  s = await deisuiPlay(page, act, '', (it) => (it === 'socks' ? 1 : JUMP[it]));
  check(s.res === 'win' && s.clock === R.LAST && /ぎりぎり/.test(s.rmsg), '0:40 ちょうどに見つけたら、ぎりぎりクリア（' + s.rmsg.replace(/\n/g, ' ') + '）');

  // しっぱい：向きがわかっても 1 駅ずつさがすと、同期Bの駅に着いたところで 0:40（終電）
  await restart(page, 'deisui', mid);
  await page.evaluate(() => { OTK.debug.speed = 3; });
  s = await deisuiPlay(page, act, '', () => 1);
  check(s.res === 'lose' && s.clock === R.LAST && s.left === 0 && s.cur === s.bAt && !s.searched[s.cur] && /終電/.test(s.rmsg), '1 駅ずつさがすと、同期Bの駅に着いたところで 0:40。終電がなくなって、しっぱい');

  // しっぱい：のこり 5 分でさがしはじめると、さがしている途中で 0:40。同期Bがいても、時計は 0:40 より先へ行かない
  await restart(page, 'deisui', far);
  await page.evaluate(() => { OTK.debug.speed = 3; });
  for (let k = 1; k < 5; k++) { s = await dstep(page, act, 'right'); s = await dstep(page, act, 'a'); }
  s = await dstep(page, act, 'right');
  check(!s.res && s.cur === s.bAt && s.clock === R.LAST - 5 && !s.searched[s.cur], '1 駅ずつ 4 駅さがして、同期Bの駅に 0:35 に着く');
  s = await dstep(page, act, 'a');
  check(s.res === 'lose' && s.clock === R.LAST && s.left === 0 && !s.searched[s.cur] && /終電/.test(s.rmsg), 'さがしている途中で 0:40。終電がなくなって、しっぱい（時計は ' + hm(s.clock) + ' で止まる）');

  // しっぱい：全部の駅をさがす（反対側から）。時計と終電がくいちがわない
  await restart(page, 'deisui', 5);
  await page.evaluate(() => { OTK.debug.speed = 3; });
  s = await dstate(page);
  const ev = await deisuiEvery(page, act, s.side > 0 ? 'left' : 'right');
  await page.evaluate(() => { OTK.debug.speed = 1; });
  s = ev.s;
  check(s.res === 'lose' && /終電/.test(s.rmsg), '全部の駅をさがすと、終電がなくなって、しっぱい（' + s.actions + ' 回うごいた）');
  check(!ev.bad, '時計が 0:40 になる前に終わらない・0:40 になったら必ず終わる・本物の秒数の制限はない' + (ev.bad ? '：' + ev.bad : ''));
  check(s.clock === R.LAST && s.left === 0, '終わったときの時計は 0:40（' + hm(s.clock) + '）');
  await page.waitForTimeout(700);
  await shot(page, 'deisui-lose');
  await waitScene(page, 'result', 8000);
  await page.waitForTimeout(400);
  await shot(page, 'deisui-result-lose');

  // しっぱい：反対側のはしまで乗る
  await restart(page, 'deisui', 5);
  await page.evaluate(() => { OTK.debug.speed = 3; });
  s = await dstate(page);
  const away = s.side > 0 ? 'left' : 'right', toward = s.side > 0 ? 'right' : 'left';
  while (!s.res && s.cur !== (away === 'left' ? 0 : NST - 1)) s = await dstep(page, act, away);
  s = await dstep(page, act, 'a');
  while (!s.res) s = await dstep(page, act, toward);
  await page.evaluate(() => { OTK.debug.speed = 1; });
  check(s.res === 'lose' && s.clock === R.LAST && /終電/.test(s.rmsg), 'はしまで乗ってもどってくると、とちゅうで終電がなくなる（' + STATION(s.cur) + '）');

  // しっぱいしたら、5 分おまけ
  await page.evaluate(() => { OTK.debug.seed(5); OTK.debug.start('deisui', { quick: true, tries: 1 }); });
  await waitScene(page, 'play');
  await waitFor(page, () => OTK.debug.run && OTK.debug.run.phase === 'play' && OTK.debug.run.t > 0.05);
  s = await dstate(page);
  check(s.clock === 23 * 60 + 25 && s.left === 75, 'やりなおしでは 23:25 から（5 分おまけ）');

  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：' + errs.join(' / ') : ''));
  await page.context().close();
}
const STATION = (i) => ['横浜', '上大岡', '杉田', '能見台', '金沢文庫', '金沢八景', '追浜', '汐入', '横須賀中央', '堀ノ内', '浦賀'][i];

async function deisuiPhone(open) {
  console.log('同期Bをさがせ（スマホ・タップと画面のボタン）');
  const { page, errors } = await open('game/?play=deisui&quick=1&seed=9', { phone: true, wait: 300 });
  await waitScene(page, 'play');
  await waitFor(page, () => OTK.debug.game.st.msgName === '駅員', null, 6000);
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
  const s = await deisuiPlay(page, act, 'deisui-phone');
  check(s.res === 'win', 'スマホ：タップと A ボタンで、同期Bを見つけてクリア（' + (s0.side > 0 ? '下り' : '上り') + s0.dist + '駅目、' + hm(s.clock) + '）');
  // 十字キー・路線図のタップ・待合室のタップでも動ける
  await waitScene(page, 'result', 8000);
  await restart(page, 'deisui', 9);
  const dp = page.locator('#otk-dpad');
  const db = await dp.boundingBox();
  const dpRight = () => dp.tap({ position: { x: db.width * 0.88, y: db.height / 2 } });
  let st = await dstep(page, dpRight, null);
  check(st.cur === HOME + 1 && st.clock === 23 * 60 + 35, 'スマホ：十字キーの右で、下りの駅へ（23:35）');
  st = await dstep(page, () => cv.tap({ position: { x: (18 + (HOME + 1) * 22) * k, y: 70 * k } }), null);
  check(st.cur === HOME + 1 && !!st.searched[HOME + 1], 'スマホ：路線図のいまの駅をタップすると、さがす');
  if (!st.res) {
    st = await dstep(page, dpRight, null);
    st = await dstep(page, () => cv.tap({ position: { x: 132 * k, y: 172 * k } }), null);
    check(st.cur === HOME + 2 && !!st.searched[HOME + 2], 'スマホ：待合室をタップすると、さがす（移動しない）');
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
