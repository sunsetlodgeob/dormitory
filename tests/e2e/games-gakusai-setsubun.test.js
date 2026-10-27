/*
 * ミニゲーム「女子100人勧誘」（gakusai）と「節分ピラミッド」（setsubun）の確認
 *   node tests/e2e/games-gakusai-setsubun.test.js
 *   SHOTS_DIR=/tmp/shots node tests/e2e/games-gakusai-setsubun.test.js   … スクリーンショットも撮る（リポジトリの外に）
 *   ONLY=gakusai node tests/e2e/games-gakusai-setsubun.test.js           … 片方だけ
 *   NO_PHONE=1 … スマホの確認をとばす
 * ふつうの操作（キーボード・画面のボタン・タップ）で、クリアとしっぱいの両方にたどり着けること、
 * パソコンとスマホ（幅 360px も）でエラーが出ないことを確かめる。
 * ボットは画面に見えているもの（えらべる相手と頭の上の気分、ゲージのマーカー、飛んでくる物、警察の「！」）を見て動く。
 * 学祭は、ねらってさそう（ハートの女子をえらんで A）のと、相手を見ずに連打するのをくらべる。
 */
const fs = require('fs');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8814; // ARCH.md の割り当て（ミニゲームは 8811〜8815）
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
// 画面に見えているもの（えらべる相手・頭の上の気分・えらんでいる相手）を読む
const gakusaiState = (page) => page.evaluate(() => {
  const g = OTK.debug.game, r = OTK.debug.run;
  return {
    res: r.result, t: r.t, count: g.count, cool: g.cool, sulk: g.sulk, sel: g.sel, cands: g.cands(), stats: g.stats,
    note: g.note, last: g.last, bar: g.bar, zone: g.zone,
    thinking: g.groups.some((x) => x.state === 'think'),
  };
});
// えらんでいる相手を want に近づけるキー（列がちがえば ↑↓、同じ列なら見たとおりの向きの ←→）
function gakusaiNavKey(s, want) {
  if (!s.sel || s.sel.lane !== want.lane) return want.lane ? 'down' : 'up';
  return want.x > s.sel.x ? 'right' : 'left';
}
// ねらう相手：ハートの出た女子（大きいグループから）。まだなら、大きめの「♪」「…」を先にえらんで待つ。
// のぼりから出ていきそうな「♪」は、そのままさそう。おばちゃん・男子・スマホ・いそぎは、えらばない。
function gakusaiAim(s) {
  const girls = s.cands.filter((o) => o.kind === 'joshi');
  const love = girls.filter((o) => o.mood === 'love').sort((a, b) => b.n - a.n);
  if (love.length) return { want: love[0], go: true };
  const [L, R] = s.zone;
  const leaving = girls.find((o) => o.mood === 'fun' && (o.lane === 0 ? o.x > R - 8 : o.x < L + 8));
  if (leaving) return { want: leaving, go: true };
  const pre = girls.filter((o) => o.mood === 'fun' || o.mood === 'none').sort((a, b) => b.n - a.n)[0];
  return pre ? { want: pre, go: false } : null;
}
// o.mash：相手を見ずに「→ と A」をかわりばんこに連打する
// o.tapGroup：スマホ。相手は画面のタップでえらび、さそうのは A ボタンと、えらんだ人のもう一度のタップをかわりばんこに
// o.probe：とちゅうで、おばちゃん（−10 人）と男子（数えない）にも 1 回ずつ声をかけて、数の変わり方を見る
async function gakusaiBot(page, ctl, o) {
  o = o || {};
  const label = o.label || 'gakusai';
  const seen = { half: false, obaDrop: null, danshiSame: null, sulkCool: null, presses: 0, love: 0 };
  const pt = o.tapGroup ? await gamePoint(page) : null;
  const tapGroup = (g) => { const p = pt(g.x, g.y); return page.touchscreen.tap(p.x, p.y); };
  let probe = null; // 確かめている最中 { kind, before, tried, oba, danshi, at }
  for (let i = 0; i < 30000; i++) {
    const s = await gakusaiState(page);
    if (s.res) break;
    if (s.count >= 50 && !seen.half) { seen.half = true; await shot(page, label + '-half'); }
    if (/人組に ことわられた/.test(s.last) && s.sulk > 0 && seen.sulkCool == null) seen.sulkCool = s.cool;
    if (o.mash) {
      await ctl.tap(seen.presses++ % 2 ? 'a' : 'right');
      await page.waitForTimeout(o.gap || 40);
      continue;
    }
    // 確かめ中：返事が来るまで待つ（ことわられたら、また今度）
    if (probe) {
      if (s.stats.tried > probe.tried && !s.thinking) {
        if (probe.kind === 'oba' && s.stats.oba > probe.oba) { seen.obaDrop = probe.before - s.count; await shot(page, label + '-oba'); }
        if (probe.kind === 'danshi' && s.stats.danshi > probe.danshi) seen.danshiSame = s.count === probe.before;
        probe = null;
      } else if (Date.now() - probe.at > 2000) probe = null;
      await page.waitForTimeout(10);
      continue;
    }
    let pick = null;
    if (o.probe && s.count >= 15) {
      const t = s.cands.find((c) => (c.kind === 'oba' && seen.obaDrop == null) || (c.kind === 'danshi' && seen.danshiSame == null));
      if (t) pick = { want: t, go: true, probe: true };
    }
    pick = pick || gakusaiAim(s);
    if (!pick || (s.cool > 0.05 && s.sel && s.sel.id === pick.want.id)) { await page.waitForTimeout(10); continue; }
    const w = pick.want;
    if (s.sel && s.sel.id === w.id) {
      if (!pick.go) { await page.waitForTimeout(10); continue; }
      if (pick.probe) probe = { kind: w.kind, before: s.count, tried: s.stats.tried, oba: s.stats.oba, danshi: s.stats.danshi, at: Date.now() };
      if (w.mood === 'love') seen.love++;
      if (pt && seen.presses++ % 2) await tapGroup(w);
      else await ctl.tap('a');
    } else if (pt) await tapGroup(w);
    else await ctl.tap(gakusaiNavKey(s, w));
    await page.waitForTimeout(25);
  }
  return seen;
}
const gakusaiSel = (page) => page.evaluate(() => OTK.debug.game.sel);
// えらべる相手が n 組以上になるまで待つ（cond でしぼれる）
const waitCands = (page, n, cond) => waitFor(page, ([k, c]) => OTK.debug.game.cands().filter(new Function('g', 'return ' + (c || 'true'))).length >= k, [n, cond || ''], 20000);

async function gakusaiDesktop(open) {
  console.log('女子100人勧誘（パソコン・キーボード）');
  const { page, errors } = await open('game/?play=gakusai&seed=7', { wait: 300 });
  const warns = [];
  page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
  await waitScene(page, 'intro');
  await page.waitForTimeout(600);
  await shot(page, 'gakusai-intro');
  check(await page.evaluate(() => /フィクション/.test(document.querySelector('footer[data-ob-footer]').textContent)), 'ページの下に「フィクション」の注記がある');
  // 寮の学祭は、ホストクラブ（お酒は出さない。ジュースとお菓子と出し物）。やきそばの屋台ではない
  const club = await page.evaluate(() => {
    const d = OTK.get('gakusai');
    return { note: d.note, howto: d.howto.join('\n'), kinds: OTK.person.KINDS, wrapped: d.howto.flatMap((h) => OTK.g.wrap(h, OTK.g.W - 40, 16)).length };
  });
  check(/お酒は出さない/.test(club.note) && /ジュース/.test(club.note) && /お菓子/.test(club.note), '説明に「お酒は出さない。ジュースとお菓子。」');
  check(/←→かタップ：えらぶ/.test(club.howto) && /ハートが出たら A：さそう/.test(club.howto) && /とりのおばちゃんは−10人/.test(club.howto),
    '説明は「←→かタップ：えらぶ」「ハートが出たら A：さそう」「とりのおばちゃんは−10人」');
  check(club.wrapped === 3, '説明の 3 行は、どれも 1 行に入る（' + club.wrapped + ' 行）');
  check(!/運しだい|ランダム/.test(club.note + club.howto), '説明に「運しだい」とは書かない');
  check(club.kinds.includes('host') && club.kinds.includes('otokoHost'), '人物の絵に、ホスト（host）と、スーツの男魂くん（otokoHost）がある');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'otoko', 'games', 'gakusai.js'), 'utf8');
  check(!/やきそば|焼きそば|ビール|鉄板/.test(src), 'やきそば・ビールケースなどは出てこない');
  await page.keyboard.press('KeyZ');
  await waitScene(page, 'countdown');
  await page.waitForTimeout(300);
  await shot(page, 'gakusai-countdown');
  await waitScene(page, 'play');
  check(!warns.some((w) => /入りきりません/.test(w)), '説明画面に、説明が入りきっている');
  await page.waitForTimeout(500);
  await shot(page, 'gakusai-start');
  check((await canvasColors(page)) > 16, 'ホストクラブの入り口と通りが描けている');
  const texts = await page.evaluate(() => OTK.debug.game.texts);
  check(texts.CLUB === 'ホストクラブ' && texts.CLUB_NAME === '夕照', '看板は「ホストクラブ 夕照」');
  check(texts.CALL.some((t) => /いらっしゃい/.test(t)) && texts.CALL.some((t) => /ジュース/.test(t)) && texts.CALL.some((t) => /お菓子/.test(t)) && texts.CALL.some((t) => /出し物/.test(t)),
    '呼びこみは「いらっしゃいませ〜」「ジュース」「お菓子」「出し物」');
  const ctl = keyboardCtl(page);

  // 勝手にはえらばない。何もえらばずに A をおしても、だれにも声はとどかない
  let s = await gakusaiState(page);
  check(s.sel === null && s.cands.length > 0, '始まったときは、だれもえらんでいない（えらべる相手は ' + s.cands.length + ' 組）');
  check(/←→で 相手をえらぶ/.test(s.bar), '下の帯に「←→で 相手をえらぶ」（' + s.bar + '）');
  await ctl.tap('a');
  await page.waitForTimeout(80);
  s = await gakusaiState(page);
  check(s.stats.tried === 0 && s.stats.empty === 1 && /だれも えらんでいない/.test(s.note), '何もえらばずに A：だれにも声をかけず「だれも えらんでいない！」');
  await shot(page, 'gakusai-empty-a');

  // ←→ で、えらべる相手（のぼりの間）を順に動く。↑↓ で奥・手前の列へ
  await waitFor(page, () => OTK.debug.game.cool <= 0);
  await waitCands(page, 2);
  await ctl.tap('right');
  await page.waitForTimeout(60);
  const s1 = await gakusaiState(page);
  check(s1.sel && s1.cands.some((c) => c.id === s1.sel.id), '→ で、のぼりの間のグループをえらぶ（' + (s1.sel && s1.bar) + '）');
  check(s1.bar.startsWith(s1.sel.kind === 'oba' ? 'とりのおばちゃん' : (s1.sel.kind === 'joshi' ? '女子' : '男子')), '下の帯に、えらんだ相手の名前と気分が出る（' + s1.bar + '）');
  await shot(page, 'gakusai-select');
  // ←→ は見たとおりの向きにだけ動き、はしまで行くと止まる（ぐるっと回って反対のはしへ飛ばない）
  async function walkTo(k) {
    const moves = [];
    let prev = await gakusaiState(page);
    for (let n = 0; n < 10 && prev.sel; n++) {
      await ctl.tap(k);
      await page.waitForTimeout(60);
      const now = await gakusaiState(page);
      if (!now.sel) break; // 相手がのぼりから出ていった
      if (now.sel.id === prev.sel.id) { moves.push('stop'); break; }
      const old = now.cands.find((c) => c.id === prev.sel.id);
      moves.push(!old || (k === 'right' ? now.sel.x > old.x : now.sel.x < old.x));
      prev = now;
    }
    return moves;
  }
  const mr = await walkTo('right');
  const ml = await walkTo('left');
  check(mr.every((m) => m === true || m === 'stop') && ml.every((m) => m === true || m === 'stop') && (mr.includes('stop') || ml.includes('stop')),
    '→ で右の相手へ、← で左の相手へ。はしまで行くと止まる（→ ' + mr.join(',') + '／← ' + ml.join(',') + '）');
  await waitFor(page, () => [0, 1].every((l) => OTK.debug.game.cands().some((c) => c.lane === l)), null, 20000);
  await ctl.tap('up');
  await page.waitForTimeout(60);
  const up = await gakusaiSel(page);
  await ctl.tap('down');
  await page.waitForTimeout(60);
  const down = await gakusaiSel(page);
  check(up && up.lane === 0 && down && down.lane === 1, '↑ で奥の列、↓ で手前の列の相手へ');

  // A で、えらんだ相手（だけ）に声をかける。返事は「来る（＋人数）」か「ことわる」。そのあとは、またえらびなおし
  await waitFor(page, () => OTK.debug.game.cool <= 0 && OTK.debug.game.cands().some((c) => c.kind === 'joshi'));
  for (let k = 0; k < 8; k++) {
    s = await gakusaiState(page);
    const w = s.cands.find((c) => c.kind === 'joshi');
    if (!w) { await page.waitForTimeout(50); continue; }
    if (s.sel && s.sel.id === w.id) break;
    await ctl.tap(gakusaiNavKey(s, w));
    await page.waitForTimeout(50);
  }
  const before = await gakusaiState(page);
  check(before.sel && before.sel.kind === 'joshi', '女子のグループをえらんだ（' + before.bar + '）');
  await ctl.tap('a');
  await waitFor(page, (n) => OTK.debug.game.stats.tried > n, before.stats.tried, 3000);
  const asked = await page.evaluate(() => { const g = OTK.debug.game; const t = g.groups.find((x) => x.state === 'think'); return { id: t && t.id, n: t && t.n, call: g.shout, sel: g.sel }; });
  check(asked.id === before.sel.id && asked.sel === null, 'A で、えらんだグループ（' + before.sel.n + ' 人）に声をかけ、わくは消える');
  check(texts.CALL.includes(asked.call), 'A で、男魂くんが呼びこむ（「' + String(asked.call).replace(/\n/g, '') + '」）');
  await waitFor(page, () => !OTK.debug.game.groups.some((g) => g.state === 'think'), null, 3000);
  const after = await gakusaiState(page);
  check(after.count === before.count + before.sel.n ? after.last === '+' + before.sel.n + ' 女子' + before.sel.n + '人組' : after.count === before.count && after.last === before.sel.n + '人組に ことわられた',
    '返事が数の板の下に出る（' + after.last + '、' + before.count + '→' + after.count + '）');
  await shot(page, 'gakusai-answer');

  // えらんだ相手がのぼりから出ていくと、わくは消える
  await waitFor(page, () => OTK.debug.game.cool <= 0);
  await waitCands(page, 1, 'g.kind === "joshi"');
  s = await gakusaiState(page);
  const out = s.cands.slice().sort((a, b) => (a.lane === 0 ? s.zone[1] - a.x : a.x - s.zone[0]) - (b.lane === 0 ? s.zone[1] - b.x : b.x - s.zone[0]))[0];
  for (let k = 0; k < 8; k++) {
    s = await gakusaiState(page);
    if ((s.sel && s.sel.id === out.id) || !s.cands.some((c) => c.id === out.id)) break;
    await ctl.tap(gakusaiNavKey(s, out));
    await page.waitForTimeout(50);
  }
  if ((await gakusaiSel(page) || {}).id === out.id) {
    await waitFor(page, () => OTK.debug.game.sel === null, null, 10000);
    s = await gakusaiState(page);
    check(s.sel === null && /行っちゃった/.test(s.note), 'えらんだ相手がのぼりから出ていくと、わくが消えて「行っちゃった…」');
  } else console.log('      （出ていく相手をえらべなかったので、「行っちゃった」はとばす）');

  // だれもとどく所にいないときは、そう出る
  await waitFor(page, () => OTK.debug.game.note === null, null, 3000);
  await page.evaluate(() => { OTK.debug.game.groups.length = 0; });
  await page.waitForTimeout(60);
  s = await gakusaiState(page);
  check(s.cands.length === 0 && s.bar === 'とどく所に、だれもいない', 'とどく所にだれもいないと、下の帯に「とどく所に、だれもいない」');
  await shot(page, 'gakusai-nobody');

  // クリア：ハートが出た女子をねらう（2 倍速。3 回まで）
  let r = null, seen = null;
  for (const seed of [7, 8, 9]) {
    await restart(page, 'gakusai', seed, 2);
    seen = await gakusaiBot(page, ctl, {});
    r = await result(page);
    if (r.result === 'win') break;
    console.log('      （種 ' + seed + ' はとどかず：' + r.msg.replace(/\n/g, '') + '）');
  }
  check(r && r.result === 'win', 'ハートの出た女子をねらってさそうと、100 人に届いてクリア');
  const aim = await page.evaluate(() => ({ count: OTK.debug.game.count, stats: OTK.debug.game.stats, t: OTK.debug.run.t }));
  check(aim.count >= 100 && /100人達成/.test(r.msg) && /指名/.test(r.msg),
    aim.count + ' 人（' + aim.t.toFixed(1) + ' 秒、声かけ ' + aim.stats.tried + ' 回、来てくれた ' + aim.stats.joined + ' 組、ことわられた ' + aim.stats.refused + '）');
  const lv = aim.stats.moods.love || { asked: 0, ok: 0 };
  check(lv.asked >= 10 && lv.ok / lv.asked >= 0.75, 'ハートのときにさそうと、だいたい来てくれる（' + lv.ok + '/' + lv.asked + '）');
  check(aim.stats.oba === 0 && aim.stats.danshi === 0, 'ねらってさそえば、おばちゃんも男子も来ない');
  check(seen.half, '50 人をこえたところも通った');
  await setSpeed(page, 1);
  await page.waitForTimeout(700);
  await shot(page, 'gakusai-win');
  await waitScene(page, 'result', 8000);
  await page.waitForTimeout(500);
  await shot(page, 'gakusai-result-win');

  // 相手を見ずに連打すると、ねらうより、ずっと少ない（2 倍速。同じ種で 2 回）
  const mash = [];
  for (const seed of [7, 8]) {
    await restart(page, 'gakusai', seed, 2);
    const ms = await gakusaiBot(page, ctl, { mash: true, label: 'gakusai-mash' });
    const rr = await result(page);
    const st = await page.evaluate(() => ({ count: OTK.debug.game.count, stats: OTK.debug.game.stats }));
    mash.push({ res: rr.result, count: st.count, stats: st.stats, sulkCool: ms.sulkCool });
    console.log('      （連打・種 ' + seed + '：' + st.count + ' 人、声かけ ' + st.stats.tried + ' 回、ことわられた ' + st.stats.refused + '、おばちゃん ' + st.stats.oba + '、男子 ' + st.stats.danshi + '）');
  }
  await setSpeed(page, 1);
  const mAvg = mash.reduce((a, m) => a + m.count, 0) / mash.length;
  // 連打でもまれに 100 人に届くことはある（試算で 1〜3%）。2 回とも届くことはない、を見る
  check(mash.filter((m) => m.res === 'win').length <= 1 && mAvg < 85 && mAvg < aim.count, '相手を見ずに「→・A」を連打すると、とどかない（平均 ' + mAvg.toFixed(0) + ' 人。ねらうと ' + aim.count + ' 人）');
  const rate = (st) => st.joined / Math.max(1, st.tried);
  check(mash.every((m) => rate(m.stats) < rate(aim.stats)), '連打は、声をかけても来てくれる割合が低い（連打 ' + mash.map((m) => Math.round(rate(m.stats) * 100) + '%').join('・') + '、ねらう ' + Math.round(rate(aim.stats) * 100) + '%）');
  const sulk = mash.map((m) => m.sulkCool).find((c) => c != null);
  check(sulk != null && sulk > 0.4, 'ことわられると、男魂くんがしゅんとして、少しの間さそえない（' + (sulk || 0).toFixed(2) + ' 秒）');
  check(mash.some((m) => m.stats.oba > 0 || m.stats.danshi > 0), '連打だと、おばちゃんや男子にも声をかけてしまう');

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
  const pt = await gamePoint(page);
  const tapAt = (g) => { const p = pt(g.x, g.y); return page.touchscreen.tap(p.x, p.y); };
  let s = await gakusaiState(page);
  check(/タップか←→/.test(s.bar), 'スマホでは、下の帯に「タップか←→で 相手をえらぶ」（' + s.bar + '）');

  // のぼりの外の人をタップしても、えらばない
  await waitFor(page, () => OTK.debug.game.walkers().some((g) => !g.reach && g.lane === 1 && g.x > OTK.debug.game.zone[1] + 12 && g.x < 240));
  const far = await page.evaluate(() => OTK.debug.game.walkers().find((g) => !g.reach && g.lane === 1 && g.x > OTK.debug.game.zone[1] + 12 && g.x < 240));
  await tapAt(far);
  await page.waitForTimeout(60);
  s = await gakusaiState(page);
  check(s.sel === null && /まだ とどかない/.test(s.note), 'のぼりの外の人をタップすると「まだ とどかない」（えらばない）');
  // のぼりの間を通りすぎた人は「もう とどかない」
  await waitFor(page, () => OTK.debug.game.note === null, null, 3000);
  await waitFor(page, () => OTK.debug.game.walkers().some((g) => !g.reach && g.lane === 1 && g.x < OTK.debug.game.zone[0] - 12 && g.x > 24), null, 20000);
  const past = await page.evaluate(() => OTK.debug.game.walkers().find((g) => !g.reach && g.lane === 1 && g.x < OTK.debug.game.zone[0] - 12 && g.x > 24));
  await tapAt(past);
  await page.waitForTimeout(60);
  s = await gakusaiState(page);
  check(s.sel === null && /もう とどかない/.test(s.note), 'のぼりを通りすぎた人をタップすると「もう とどかない」');

  // のぼりの間の人をタップすると、えらぶ（まだ声はかけない）。もう一度タップすると、さそう
  await waitFor(page, () => OTK.debug.game.cands().length > 0 && OTK.debug.game.cool <= 0);
  const z = await page.evaluate(() => OTK.debug.game.cands()[0]);
  await tapAt(z);
  await page.waitForTimeout(60);
  s = await gakusaiState(page);
  check(s.sel && s.sel.id === z.id && s.stats.tried === 0, '人をタップすると、そのグループをえらぶ（声はまだかけない）');
  await shot(page, 'gakusai-phone-select');
  const z2 = s.cands.find((c) => c.id === z.id);
  if (z2) {
    await tapAt(z2);
    await page.waitForTimeout(60);
    s = await gakusaiState(page);
    check(s.stats.tried === 1 && s.sel === null, 'えらんだグループをもう一度タップすると、声をかける');
  }

  // 手前の列の相手をえらんで、その名札（「5人」など）をタップしても、その相手に声をかける（うしろの奥の列の人に移らない）
  const overlapFront = () => {
    const c = OTK.debug.game.cands();
    return c.find((f) => f.lane === 1 && f.kind === 'joshi' && c.some((b) => b.lane === 0 && Math.abs(b.x - f.x) < 14));
  };
  let front = null;
  try {
    await waitFor(page, (fn) => OTK.debug.game.cool <= 0 && !!new Function('return (' + fn + ')()')(), overlapFront.toString(), 20000);
    front = await page.evaluate((fn) => new Function('return (' + fn + ')()')(), overlapFront.toString());
  } catch (e) { /* 重なる相手が来なかったら、手前の列のだれかで */ }
  if (!front) {
    await waitFor(page, () => OTK.debug.game.cool <= 0 && OTK.debug.game.cands().some((c) => c.lane === 1), null, 20000);
    front = await page.evaluate(() => OTK.debug.game.cands().find((c) => c.lane === 1));
  }
  await tapAt(front);
  await page.waitForTimeout(60);
  const tag = await page.evaluate(() => OTK.debug.game.selTag);
  const triedBefore = (await gakusaiState(page)).stats.tried;
  check(tag && (await gakusaiSel(page) || {}).id === front.id, '手前の列のグループをえらぶと、名札が出る');
  await shot(page, 'gakusai-phone-tag');
  const tp = pt((tag.x0 + tag.x1) / 2, tag.y0 + 6);
  await page.touchscreen.tap(tp.x, tp.y);
  await page.waitForTimeout(60);
  const askedTag = await page.evaluate(() => { const t = OTK.debug.game.groups.find((x) => x.state === 'think'); return t ? t.id : null; });
  s = await gakusaiState(page);
  check(s.stats.tried === triedBefore + 1 && askedTag === front.id, 'えらんだ相手の名札をタップすると、その相手に声をかける（' + (askedTag === front.id ? '同じ相手' : 'ちがう相手 ' + askedTag) + '）');

  // クリア：タップでえらんで、A ボタンかもう一度のタップでさそう（2 倍速。3 回まで）
  let r = null;
  for (const seed of [31, 32, 33]) {
    await restart(page, 'gakusai', seed, 2);
    await gakusaiBot(page, ctl, { tapGroup: true, label: 'gakusai-phone' });
    r = await result(page);
    if (r.result === 'win') break;
    console.log('      （種 ' + seed + ' はとどかず：' + r.msg.replace(/\n/g, '') + '）');
  }
  check(r && r.result === 'win', 'タップでえらび、A ボタンとタップでさそって、100 人に届いてクリア');
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
// ピラミッドは全員全裸。画面の四角 [x, y, w, h] の中の色を数える：
//   clothes … のる人のジャージ・パーカーの色（服を着ていたら出る）／ white・red … 首から下げた「男魂」の札の白と赤
const CLOTHES = ['#00804c', '#283890', '#b85c00', '#6c2c9c', '#d04848'];
const setsubunPixels = (page, rect) => page.evaluate(([r, clothes]) => {
  const d = document.getElementById('otk-canvas').getContext('2d').getImageData(r[0], r[1], r[2], r[3]).data;
  const out = { clothes: 0, white: 0, red: 0 };
  for (let i = 0; i < d.length; i += 4) {
    const h = '#' + ((1 << 24) | (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).slice(1);
    if (clothes.includes(h)) out.clothes++;
    else if (h === '#fcfcfc') out.white++;
    else if (h === '#f83800') out.red++;
  }
  return out;
}, [rect, CLOTHES]);
// マーカーがゾーンのまん中に来たら A。物が飛んできたら B でふんばる。警察の「！」が出たら ↓。
// o.brace：false でふんばらない／o.police：false で逃げない／o.stopAt：その人数で、のせるのをやめる
async function setsubunBot(page, ctl, o) {
  o = o || {};
  const label = o.label || 'setsubun';
  const seen = { alarm: false, hide: false, patrol: false, back: false, before: null, after: null, brace: false, collapse: false, hidePx: null };
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
      if (pc === 'hide' && !seen.hide) {
        seen.hide = true;
        await page.waitForTimeout(300);
        seen.hidePx = await setsubunPixels(page, [0, 100, 256, 98]); // 中へ走っていく人
        await shot(page, label + '-hide');
      }
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
  check(await page.evaluate(() => /全裸/.test(OTK.get('setsubun').goal)), '説明に「全裸で」と出る');
  await page.keyboard.press('KeyZ');
  await waitScene(page, 'countdown');
  await waitScene(page, 'play');
  await page.waitForTimeout(400);
  await shot(page, 'setsubun-start');
  check((await canvasColors(page)) > 12, '夜の寮の玄関が描けている');
  let px = await setsubunPixels(page, [196, 140, 44, 56]);
  check(px.clothes === 0 && px.white > 10 && px.red > 2, '玄関で待っている人は全裸で、「男魂」の札を下げている');
  const ctl = keyboardCtl(page);

  // ゾーンの外で A をおすと、その人は転がり落ちる（ぐらぐらが少し増える）
  await waitFor(page, () => { const m = OTK.debug.game.marker; return Math.abs(m.pos - m.zone) > m.w * 1.2 && !OTK.debug.game.peek().busy; });
  await ctl.tap('a');
  await page.waitForTimeout(500);
  let st = await page.evaluate(() => ({ built: OTK.debug.game.built, miss: OTK.debug.game.stats.miss, wob: OTK.debug.game.wob }));
  check(st.built === 0 && st.miss === 1 && st.wob > 0, 'ゾーンをはずすと、転がり落ちて、ぐらぐらが増える');
  px = await setsubunPixels(page, [0, 140, 172, 58]);
  check(px.clothes === 0 && px.white > 10, '転がり落ちた人も全裸');
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
  check(seen.hidePx && seen.hidePx.clothes === 0 && seen.hidePx.white > 10, '中へ逃げていく人も全裸');
  await page.waitForTimeout(900);
  px = await setsubunPixels(page, [0, 60, 170, 138]);
  check(px.clothes === 0 && px.white > 300 && px.red > 200, 'できたピラミッドは 10 人とも全裸で、札を下げている（白 ' + px.white + '・赤 ' + px.red + '）');
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
  px = await setsubunPixels(page, [0, 100, 172, 98]);
  check(px.clothes === 0 && px.white > 10, 'くずれて落ちた人も全裸');
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
