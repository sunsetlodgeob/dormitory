/*
 * 寸劇（ミニゲームの間の短いお話）の確認
 *   node tests/e2e/story.test.js
 *   SHOTS_DIR=/tmp/shots node tests/e2e/story.test.js   … 寸劇ごとのスクリーンショットも撮る（リポジトリの外に）
 *  - 台本（js/otoko/scenes.js）：知らない命令・知らない人・知らない音がない。セリフはウインドウに入る
 *    （3 行まで。\n で区切った 1 行が、勝手に折り返されない）
 *  - どの寸劇も、A を押しっぱなし（早送り）で最後まで流れ、1年の流れのとおりの次の場面になる。エラーなし。
 *    流している間、人が壁や机・ベッドの上に立たない。セリフのウインドウの線が欠けない
 *  - 台本を 1 コマ（1/60 秒）ずつ進めて、人どうしが重ならない（すれちがい・同じ所に止まる）、足もとが床
 *  - START でとばせる。A（スマホは画面のタップ）で今のセリフが早く進む
 *  - 1年の流れ：はじまり → カレンダー → 前ふり → 説明。勝ったあとの寸劇。やりなおしでは前ふりをとばす。
 *    つづきから。練習モードでは出ない。?noskit=1 で寸劇なし。動きを減らす設定でも動く
 */
const fs = require('fs');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8806; // ARCH.md の割り当て（寸劇）
const SHOTS = process.env.SHOTS_DIR || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

function check(cond, msg) {
  if (!cond) throw new Error('NG: ' + msg);
  console.log('  ok  ' + msg);
}
const scene = (page) => page.evaluate(() => (window.OTK && OTK.debug ? OTK.debug.scene : null));
const skit = (page) => page.evaluate(() => (window.OTK && OTK.debug ? OTK.debug.skit : null));
async function waitScene(page, name, timeout = 15000) {
  await page.waitForFunction((n) => window.OTK && OTK.debug && OTK.debug.scene === n, name, { timeout, polling: 50 });
}
async function waitSkit(page, id, timeout = 15000) {
  await page.waitForFunction((i) => window.OTK && OTK.debug && OTK.debug.skit && OTK.debug.skit.id === i, id, { timeout, polling: 50 });
}
async function pressUntil(page, key, target, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if ((await scene(page)) === target) return;
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
  }
  throw new Error('場面「' + target + '」になりませんでした（いま：' + (await scene(page)) + '）');
}
// 場面がうつりかわるのを記録しながら、target（'intro' や、寸劇なら 'skit:nomu'）になるまで待つ。
// いまの場面（とばしたばかりの寸劇など）は、いったん離れてから数える
async function trail(page, target, timeout = 15000) {
  const label = () => page.evaluate(() => (OTK.debug.scene === 'skit' && OTK.debug.skit ? 'skit:' + OTK.debug.skit.id : OTK.debug.scene));
  const first = await label();
  const seen = [];
  let left = false;
  const t0 = Date.now();
  for (;;) {
    const s = await label();
    if (s !== first) left = true;
    if (left && seen[seen.length - 1] !== s) seen.push(s);
    if (left && s === target) return seen;
    if (Date.now() - t0 > timeout) throw new Error('場面「' + target + '」になりませんでした：' + first + ' → ' + seen.join(' → '));
    await page.waitForTimeout(30);
  }
}
async function shot(page, name) {
  if (SHOTS) await page.locator('#otk-canvas').screenshot({ path: path.join(SHOTS, name + '.png') });
}
// ウインドウの左・右・下の白い二重線が欠けていないか（上の線は名札が重なるので見ない）。
// いまのセリフ・ウインドウの位置・画面を 1 度に読む（別々に読むと、その間に次のセリフに変わることがある）。
// そのセリフでなくなっていたら null
async function brokenBorder(page, line) {
  return page.evaluate((line) => {
    const k = OTK.debug.skit;
    if (!k || k.line !== line || !k.full || !k.box) return null;
    const b = k.box;
    const c = document.getElementById('otk-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const white = (x, y) => { const i = (y * c.width + x) * 4; return d[i] === 0xfc && d[i + 1] === 0xfc && d[i + 2] === 0xfc; };
    const bad = [];
    for (let y = b.y + 4; y < b.y + b.h - 4; y++) for (const x of [b.x + 1, b.x + 3, b.x + b.w - 2, b.x + b.w - 4]) if (!white(x, y)) bad.push(x + ',' + y);
    for (let x = b.x + 4; x < b.x + b.w - 4; x++) for (const y of [b.y + b.h - 2, b.y + b.h - 4]) if (!white(x, y)) bad.push(x + ',' + y);
    return bad.slice(0, 3);
  }, line);
}
// 人の足もとのマスが、立ってよい所か（床・ドア・階段・イス・外の道）
async function badFooting(page) {
  return page.evaluate(() => {
    const k = OTK.debug.skit;
    if (!k || !k.map) return [];
    const m = OTK.skit.map(k.map);
    const OK = '.,_<-~;%*`&:+/E{UV"^Zc';
    const out = [];
    for (const a of k.actors) {
      if (a.hidden) continue;
      for (const x of [Math.floor(a.x + 0.001), Math.ceil(a.x - 0.001)]) for (const y of [Math.floor(a.y + 0.001), Math.ceil(a.y - 0.001)]) {
        const ch = y >= 0 && y < m.rows.length && x >= 0 && x < m.rows[0].length ? m.rows[y][x] : ' ';
        if (!OK.includes(ch)) out.push(k.id + ': ' + a.id + ' が (' + a.x.toFixed(1) + ', ' + a.y.toFixed(1) + ') の「' + ch + '」の上');
      }
    }
    return out;
  });
}

// ── 1. 台本だけの確認 ─────────────────────────────────
async function scripts(open) {
  console.log('台本（js/otoko/scenes.js）');
  const { page, errors } = await open('game/?noskit=1', { wait: 300 });
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
  await page.waitForTimeout(200);
  const res = await page.evaluate(() => {
    const KNOWN = ['map', 'cam', 'put', 'hide', 'walk', 'face', 'hop', 'bow', 'shake', 'emote', 'say', 'wait', 'sfx', 'bgm', 'fade', 'quake', 'light', 'weather', 'win', 'set', 'prop', 'card'];
    const MAPS = OTK.skit.maps(); // 寮さんぽの地図と、寸劇だけの地図（OTK.SKIT_MAPS）
    const bad = [];
    let lines = 0;
    const fits = (s) => OTK.g.wrap(s, OTK.W - 28, 16).length === 1;
    for (const [id, def] of Object.entries(OTK.SKITS)) {
      const cast = Object.assign({}, OTK.SKIT_CAST, def.cast || {});
      if (!MAPS.includes(def.map)) bad.push(id + ': 地図がない ' + def.map);
      if (def.bgm && !OTK.audio.BGM_NAMES.includes(def.bgm)) bad.push(id + ': 曲がない ' + def.bgm);
      def.steps.forEach((st, i) => {
        const name = String(st[0]).replace(/^\+/, '');
        const at = id + ' の ' + (i + 1) + ' 番目（' + name + '）';
        if (!KNOWN.includes(name)) bad.push(at + ': 知らない命令');
        if (name === 'put' && !cast[st[1]]) bad.push(at + ': 登場人物にいない ' + st[1]);
        if (name === 'map' && !MAPS.includes(st[1])) bad.push(at + ': 地図がない ' + st[1]);
        if (name === 'sfx' && !OTK.audio.SFX_NAMES.includes(st[1])) bad.push(at + ': 効果音がない ' + st[1]);
        if (name === 'bgm' && st[1] && !OTK.audio.BGM_NAMES.includes(st[1])) bad.push(at + ': 曲がない ' + st[1]);
        if (name === 'say') {
          lines++;
          const text = String(st[2]);
          const ls = text.split('\n');
          if (ls.length > 3) bad.push(at + ': 4 行以上 ' + text);
          ls.forEach((l) => { if (!fits(l)) bad.push(at + ': 1 行に入らない「' + l + '」'); });
        }
        if (name === 'card') String(st[1]).split('\n').forEach((l) => { if (OTK.g.measure(l, 32) > OTK.W - 44) bad.push(at + ': 紙に入らない「' + l + '」'); });
      });
    }
    // セリフ（[話す人, 文]）と、地図の移りかわり
    const said = {}, maps = {};
    for (const [id, def] of Object.entries(OTK.SKITS)) {
      said[id] = def.steps.filter((st) => String(st[0]).replace(/^\+/, '') === 'say').map((st) => [st[1], String(st[2])]);
      maps[id] = [def.map].concat(def.steps.filter((st) => st[0] === 'map').map((st) => st[1]));
    }
    // 寸劇だけの地図も、寮さんぽと同じ形（どの行も同じ長さ、外の地図の記号）
    for (const [mid, m] of Object.entries(OTK.SKIT_MAPS || {})) {
      if (!m.rows.every((r) => r.length === m.rows[0].length)) bad.push('地図 ' + mid + ': 行の長さがそろっていない');
      if (m.rows.length < 14 || m.rows[0].length < 16) bad.push('地図 ' + mid + ': 画面（16×14 マス）より小さい');
    }
    return { bad, lines, ids: Object.keys(OTK.SKITS), said, maps };
  });
  check(res.bad.length === 0, '台本に、知らない命令・人・音や、入りきらないセリフがない（セリフ ' + res.lines + ' 個）' + (res.bad.length ? '：\n' + res.bad.join('\n') : ''));
  // 持ち主の話にあわせたところ
  const texts = (id) => (res.said[id] || []).map((x) => x[1].replace(/\n/g, '')).join('／');
  const kanri = Object.entries(res.said).filter(([, l]) => l.some((x) => x[0] === '管理人さん')).map(([id]) => id);
  check(kanri.length === 0, '管理人さんは、どの寸劇でも話さない（うしろでそうじをしているだけ）' + (kanri.length ? '：' + kanri.join('・') : ''));
  check(!/今夜/.test(texts('opening')) && /4日目の夜/.test(texts('opening')) && /4日目の夜/.test(texts('nomu')), '入寮の日は、まだ新歓ではない（新歓コンパは 4 日目の夜。入寮でも、飲むか吐くかでも同じ）');
  check(/1日目/.test(texts('nomu')) && /2日目/.test(texts('nise')), '新歓コンパは 2 日つづく（飲むか吐くか＝1日目、ニセ一年＝2日目）');
  const early = ['opening', 'nomu', 'nise'].filter((id) => /ニセ|3年|ドッキリ|まぎれ/.test(texts(id)));
  check(early.length === 0, 'ネタばらしより前は、だれもニセ一年のことを一年に言わない（ドッキリ）' + (early.length ? '：' + early.join('・') : ''));
  check(/ニセ一年/.test(texts('nise_win')) && /入学式/.test(texts('nise_win')), '勝ったあと、ネタばらし → 次の日の入学式（nise_win）');
  check(/ホストクラブ/.test(texts('gakusai')) && /お酒はなし/.test(texts('gakusai')) && !/やきそば|焼きそば/.test(texts('gakusai')), '学祭は、寮のホストクラブ（お酒はなし）');
  check(/全裸/.test(texts('kippu')) && /切符/.test(texts('kippu')) && !/うんこ/.test(texts('kippu')) && res.maps.kippu.slice(-1)[0] === 'EXT', '追いコンは切符が先。前ふりは、全裸で寮の玄関の前まで');
  check(res.maps.unko[0] === 'KAWA' && /プレゼント/.test(texts('unko')), 'うんこは、切符の帰り道（川ぞいの道）で、先輩が待ちぶせ');
  // 川ぞいの道は、ミニゲームと同じ向き（上が植え込み、下が川）
  const kawa = await page.evaluate(() => OTK.skit.map('KAWA').rows);
  const rowOf = (ch) => kawa.findIndex((r) => r.includes(ch));
  check(rowOf('h') < rowOf('-') && rowOf('-') < rowOf('f') && rowOf('f') < rowOf('~'), '川ぞいの道の寸劇は、ミニゲームと同じ向き（上から植え込み・道・手すり・川）');
  const roof = await page.evaluate(() => OTK.SKITS.ending.steps.some((s) => [].concat(s[1]).includes('管理人さん')));
  check(!roof, '屋上の「みんな」の中に、管理人さんはいない');
  const games = await page.evaluate(() => OTK.list().map((d) => d.id));
  check(games.indexOf('kippu') + 1 === games.indexOf('unko') && games.indexOf('unko') === games.length - 1, '追いコンは「全裸で切符」→「うんこをよけろ」の順（最後がうんこ）');
  const want = ['opening', 'ending'].concat(games);
  check(want.every((id) => res.ids.includes(id)), 'はじまり・ミニゲーム 10 本の前ふり・エンディングの寸劇がそろう');
  const wins = res.ids.filter((id) => /_win$/.test(id));
  check(wins.every((id) => games.includes(id.replace(/_win$/, ''))), '勝ったあとの寸劇の名前が、ミニゲームの id と合う（' + wins.join('・') + '）');
  check(realErrors(errors).length === 0, 'エラーなし');
  await page.close();
  return { ids: res.ids, games };
}

// ── 2. どの寸劇も最後まで流れる ─────────────────────────────
async function playAll(open, ids, games) {
  console.log('どの寸劇も最後まで');
  const { page, errors } = await open('game/?noskit=1', { wait: 300 });
  const nextOf = (id) => {
    if (id === 'opening') return 'calendar';
    if (id === 'ending') return 'ending_good';
    // 最後の 1 本に勝ったあとは、屋上の寸劇（ここは ?noskit=1 なので、とばして、よいエンディング）
    if (/_win$/.test(id)) return id === games[games.length - 1] + '_win' ? 'ending_good' : 'calendar';
    return 'intro';
  };
  // 寸劇が終わったときの様子を記録する（早送りだと最後の命令が一瞬で終わり、外から見はっていると見のがすことがある）
  await page.evaluate(() => {
    window.__skitEnd = {};
    const create = OTK.skit.create;
    OTK.skit.create = (id, o) => {
      const s = create(id, Object.assign({}, o, {
        onEnd() {
          window.__skitEnd[id] = { step: s.st.i, steps: OTK.SKITS[id].steps.length, done: s.st.done };
          if (o && o.onEnd) o.onEnd();
        },
      }));
      return s;
    };
  });
  for (const id of ids) {
    await page.evaluate((i) => { OTK.debug.speed = 4; OTK.debug.playSkit(i); }, id);
    await waitSkit(page, id);
    await page.keyboard.down('z'); // A おしっぱなしで早送り
    const feet = new Set();
    const borders = [];
    let shotDone = false, lastLine = null, maxStep = 0, steps = 0;
    const t0 = Date.now();
    let s = null;
    for (;;) {
      const r = await page.evaluate(() => ({ k: OTK.debug.skit, s: OTK.debug.scene }));
      const k = r.k;
      if (!k || k.id !== id) { s = r.s; break; }
      maxStep = Math.max(maxStep, k.step);
      steps = k.steps;
      (await badFooting(page)).forEach((b) => feet.add(b));
      if (k.full && k.box && k.line && k.line !== lastLine) {
        const bb = await brokenBorder(page, k.line);
        if (bb) {
          lastLine = k.line;
          if (bb.length) borders.push(id + '「' + k.line + '」' + bb.join(' '));
          if (!shotDone) { await shot(page, 'skit-' + id); shotDone = true; }
        }
      }
      if (Date.now() - t0 > 60000) throw new Error(id + ' が終わらない：' + JSON.stringify(k));
      await page.waitForTimeout(30);
    }
    await page.keyboard.up('z');
    const end = await page.evaluate((i) => window.__skitEnd[i] || null, id);
    const all = !!end && end.done && end.step >= end.steps && Math.max(maxStep, end.step) >= steps - 1;
    check(s === nextOf(id) && all, id + '：最後まで流れて「' + s + '」へ（' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒）' + (all ? '' : '：' + JSON.stringify(end)));
    check(feet.size === 0, id + '：人が壁や家具の上に立たない' + (feet.size ? '：\n' + [...feet].slice(0, 5).join('\n') : ''));
    check(borders.length === 0, id + '：セリフのウインドウの線が欠けない' + (borders.length ? '：' + borders.join(' ／ ') : ''));
  }
  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：\n' + errs.join('\n') : ''));
  await page.close();
}

// ── 2b. 1/60 秒ずつ動かして調べる ─────────────────────────────
// 早送りの間に何度か見るだけでは、すれちがいや重なりを見のがすので、台本を 1 コマずつ進めて調べる。
//  - 歩いている人が、画面に見えているほかの人と重ならない（0.75 マスより近づかない）
//  - 止まっている人どうしが、同じ所に重ならない（画面の外は見ない）
//  - だれも壁や机・ベッドの上に立たない（画面の外もふくめて）
async function stepAll(open) {
  console.log('1 コマずつ：人どうしが重ならない・壁や家具の上に立たない');
  const { page, errors } = await open('game/?noskit=1', { wait: 300 });
  const res = await page.evaluate(() => {
    const OK = '.,_<-~;%*`&:+/E{UV"^Zc';
    const out = [];
    for (const id of OTK.skit.ids()) {
      const s = OTK.skit.create(id, { onEnd() {} });
      const st = s.st;
      const seen = new Set();
      const add = (k) => { if (!seen.has(k)) { seen.add(k); out.push(id + '：' + k + '（' + st.t.toFixed(1) + ' 秒）'); } };
      const onScreen = (a) => {
        const px = (a.x - st.cam.x) * 16, py = (a.y - st.cam.y) * 16;
        return px > -16 && px < OTK.W && py > -8 && py < OTK.H + 8;
      };
      let i = 0;
      for (; i < 60 * 120 && !st.ended; i++) {
        s.update(1 / 60);
        const m = st.map;
        if (!m) continue;
        const acts = Object.values(st.actors).filter((a) => !a.hidden);
        for (const a of acts) {
          for (const x of [Math.floor(a.x + 0.001), Math.ceil(a.x - 0.001)]) for (const y of [Math.floor(a.y + 0.001), Math.ceil(a.y - 0.001)]) {
            const ch = y >= 0 && y < m.rows.length && x >= 0 && x < m.rows[0].length ? m.rows[y][x] : ' ';
            if (!OK.includes(ch)) add(a.id + ' が (' + x + ', ' + y + ') の「' + ch + '」の上');
          }
        }
        const vis = acts.filter(onScreen);
        for (const a of vis) for (const b of vis) {
          if (a.id >= b.id) continue;
          const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
          if ((a.path || b.path) && dx < 0.75 && dy < 0.75) add(a.id + ' と ' + b.id + ' が重なる (' + a.x.toFixed(1) + ', ' + a.y.toFixed(1) + ')');
          else if (!a.path && !b.path && dx < 0.3 && dy < 0.3) add(a.id + ' と ' + b.id + ' が同じ所にいる (' + a.x.toFixed(1) + ', ' + a.y.toFixed(1) + ')');
        }
      }
      if (!st.ended) add('2 分たっても終わらない');
    }
    return out;
  });
  check(res.length === 0, 'どの寸劇も、人どうしが重ならず、壁や家具の上に立たない' + (res.length ? '：\n' + res.slice(0, 8).join('\n') : ''));
  // セリフや紙をすぐにとばしても（スマホでタップを連打）、ゆっくり歩く人などを待ちつづけずに、最後まで行く
  const stuck = await page.evaluate(() => {
    const out = [];
    for (const id of OTK.skit.ids()) {
      const s = OTK.skit.create(id, { onEnd() {} });
      const st = s.st;
      let i = 0;
      for (; i < 60 * 120 && !st.ended; i++) {
        s.update(1 / 60);
        if (st.say && !st.say.next) { st.say.n = st.say.len; st.say.full = true; st.say.next = true; }
        if (st.card && !st.card.next) st.card.next = true;
      }
      if (!st.ended) out.push(id + '（' + st.i + ' 番目の命令で止まる）');
    }
    return out;
  });
  check(stuck.length === 0, 'セリフをすぐとばしても、どの寸劇も最後まで行く' + (stuck.length ? '：' + stuck.join('・') : ''));
  check(realErrors(errors).length === 0, 'エラーなし');
  await page.close();
}

// ── 3. 操作：START でとばす、A で早く進む ────────────────────
async function controls(open) {
  console.log('START でとばす・A で進む');
  const { page, errors } = await open('game/?skit=opening', { wait: 300 });
  await waitSkit(page, 'opening');
  check((await skit(page)).map === 'EXT', '?skit=opening で、寮の前から始まる');
  await page.waitForTimeout(1500);
  await shot(page, 'skit-opening-start');
  const t0 = Date.now();
  await page.keyboard.press('Escape');
  await waitScene(page, 'calendar', 3000);
  check(Date.now() - t0 < 2000, 'START で、まるごととばしてカレンダーへ');

  // A：表示しきったセリフは、すぐ次へ
  await page.evaluate(() => OTK.debug.playSkit('gakusai'));
  await page.waitForFunction(() => OTK.debug.skit && OTK.debug.skit.full && OTK.debug.skit.line, null, { timeout: 8000, polling: 30 });
  const before = await skit(page);
  await page.waitForTimeout(400);
  check((await skit(page)).line === before.line, '何もしなければ、しばらくは同じセリフ');
  await page.keyboard.press('z');
  await page.waitForTimeout(150);
  const after = await skit(page);
  check(after.line !== before.line || after.step > before.step, 'A で、次へ進む');
  // A：文字を出している途中なら、全部出す
  await page.waitForFunction((l) => OTK.debug.skit && OTK.debug.skit.line && OTK.debug.skit.line !== l && !OTK.debug.skit.full, before.line, { timeout: 8000, polling: 10 });
  await page.keyboard.press('z');
  await page.waitForTimeout(80);
  check((await skit(page)).full, 'A で、出している途中のセリフを全部出す');
  // 自動で進む（何もしなくても終わる）
  await page.evaluate(() => { OTK.debug.speed = 6; });
  await waitScene(page, 'intro', 40000);
  check(true, '何もしなくても、セリフは自動で進んで最後まで行く');
  check(realErrors(errors).length === 0, 'エラーなし');
  await page.close();

  // スマホ：画面のタップで進み、START ボタンでとばす
  const p = await open('game/?skit=nise', { phone: true, wait: 300 });
  await p.page.waitForFunction(() => OTK.debug.skit && OTK.debug.skit.full && OTK.debug.skit.line, null, { timeout: 8000, polling: 30 });
  const l0 = (await skit(p.page)).line;
  await p.page.locator('#otk-canvas').tap({ position: { x: 150, y: 150 } });
  await p.page.waitForTimeout(150);
  check((await skit(p.page)).line !== l0, 'スマホ：画面のタップで次のセリフへ');
  if (SHOTS) await p.page.screenshot({ path: path.join(SHOTS, 'p-skit-nise.png') });
  await p.page.locator('[data-otk-key="pause"]').tap();
  await waitScene(p.page, 'intro', 3000);
  check(true, 'スマホ：START ボタンでとばす');
  check(realErrors(p.errors).length === 0, 'エラーなし');
  await p.page.close();
}

// ── 4. 1年の流れの中で ─────────────────────────────────
async function flow(open, games) {
  console.log('1年の流れ');
  const { page, errors } = await open('game/', { wait: 300 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitScene(page, 'title');
  await page.evaluate(() => { OTK.debug.speed = 3; });
  await pressUntil(page, 'Enter', 'menu');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter'); // 1年をはじめる
  await waitSkit(page, 'opening');
  check(true, '「1年をはじめる」で、はじまりの寸劇');
  await page.keyboard.press('Escape');
  let seen = await trail(page, 'skit:' + games[0]);
  check(seen[0] === 'calendar', 'はじまり → カレンダー → ' + games[0] + ' の前ふり（' + seen.join(' → ') + '）');
  await page.keyboard.press('Escape');
  await waitScene(page, 'intro');
  await pressUntil(page, 'Enter', 'countdown');
  await waitScene(page, 'play');
  check((await page.evaluate(() => OTK.debug.current)) === games[0], '前ふりのあと、説明 → ' + games[0]);
  await page.evaluate(() => OTK.debug.forceResult('win'));
  await waitScene(page, 'result');
  await page.waitForTimeout(450);
  await page.keyboard.press('Enter');
  seen = await trail(page, 'skit:' + games[1]);
  check(seen.join() === 'calendar,skit:' + games[1], '勝ったあとの寸劇がないときは、カレンダー → 次の前ふり（' + seen.join(' → ') + '）');

  // しっぱい → この月からやりなおす：前ふりはとばす
  await page.keyboard.press('Escape');
  await waitScene(page, 'intro');
  await pressUntil(page, 'Enter', 'countdown');
  await waitScene(page, 'play');
  await page.evaluate(() => OTK.debug.forceResult('lose'));
  await waitScene(page, 'result');
  await page.waitForTimeout(450);
  await pressUntil(page, 'Enter', 'ending_bad');
  await page.waitForTimeout(2600);
  await page.keyboard.press('Enter');
  seen = await trail(page, 'intro');
  check(seen.join() === 'calendar,intro', '「この月からやりなおす」では、前ふりをとばして説明へ（' + seen.join(' → ') + '）');

  // 勝ったあとの寸劇（deisui_win）
  const di = games.indexOf('deisui');
  await page.evaluate((n) => OTK.debug.story(n), di);
  await waitSkit(page, 'deisui');
  await page.keyboard.press('Escape');
  await waitScene(page, 'intro');
  await pressUntil(page, 'Enter', 'countdown');
  await waitScene(page, 'play');
  await page.evaluate(() => OTK.debug.forceResult('win'));
  await waitScene(page, 'result');
  await page.waitForTimeout(450);
  await page.keyboard.press('Enter');
  await waitSkit(page, 'deisui_win');
  check((await page.evaluate(() => OTK.debug.save.step)) === di + 1, '勝ったあとの寸劇（deisui_win）。進み具合は先に保存ずみ');
  await page.keyboard.down('z');
  await waitScene(page, 'calendar', 20000);
  await page.keyboard.up('z');
  check(true, '勝ったあとの寸劇のあと、次の月のカレンダー');

  // 全裸で切符に勝つと、カレンダーをはさまずに「うんこをよけろ」の前ふりへ（同じ夜、同じ道のつづき）
  const ki = games.indexOf('kippu');
  await page.evaluate((n) => OTK.debug.story(n), ki);
  await waitSkit(page, 'kippu');
  await page.keyboard.press('Escape');
  await waitScene(page, 'intro');
  await pressUntil(page, 'Enter', 'countdown');
  await waitScene(page, 'play');
  await page.evaluate(() => OTK.debug.forceResult('win'));
  await waitScene(page, 'result');
  await page.waitForTimeout(450);
  await page.keyboard.press('Enter');
  seen = await trail(page, 'skit:unko');
  check(seen.join() === 'skit:unko' && (await page.evaluate(() => OTK.debug.save.step)) === ki + 1, '全裸で切符のあとは、カレンダーなしで、すぐ「うんこ」の前ふり（' + seen.join(' → ') + '）');

  // 最後の 1 本に勝つ → エンディングの寸劇 → よいエンディング
  await page.evaluate((n) => OTK.debug.story(n), games.length - 1);
  await waitSkit(page, games[games.length - 1]);
  await page.keyboard.press('Escape');
  await waitScene(page, 'intro');
  await pressUntil(page, 'Enter', 'countdown');
  await waitScene(page, 'play');
  await page.evaluate(() => OTK.debug.forceResult('win'));
  await waitScene(page, 'result');
  await page.waitForTimeout(450);
  await page.keyboard.press('Enter');
  const lastWin = games[games.length - 1] + '_win';
  if (await page.evaluate((i) => OTK.skit.has(i), lastWin)) {
    await waitSkit(page, lastWin);
    check(true, '10 本目に勝ったあと、勝ったあとの寸劇（' + lastWin + '）');
    await page.keyboard.press('Escape');
  }
  await waitSkit(page, 'ending');
  check((await skit(page)).map === 'RF', '10 本目のあと、屋上の寸劇');
  await page.waitForTimeout(1200);
  await shot(page, 'skit-ending-roof');
  await page.keyboard.press('Escape');
  await waitScene(page, 'ending_good');
  check(true, '屋上の寸劇 → よいエンディング');

  // つづきから
  await page.evaluate(() => localStorage.setItem('otk-save', JSON.stringify({ step: 3, clear: {}, good: 0, bad: 0 })));
  await page.reload();
  await waitScene(page, 'title');
  await pressUntil(page, 'Enter', 'menu');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter'); // カーソルは「つづきから」
  seen = await trail(page, 'skit:' + games[3]);
  check(seen.join() === 'calendar,skit:' + games[3], 'つづきから：カレンダー → その月の前ふり（' + seen.join(' → ') + '）');
  await page.evaluate(() => localStorage.setItem('otk-save', JSON.stringify({ step: 10, clear: {}, good: 0, bad: 0 })));
  await page.reload();
  await waitScene(page, 'title');
  await pressUntil(page, 'Enter', 'menu');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await waitSkit(page, 'ending');
  await page.keyboard.press('Escape');
  await waitScene(page, 'ending_good');
  check(true, '10 本目のあとに閉じても、つづきから屋上の寸劇 → よいエンディング');

  // 練習モードでは出ない
  await page.evaluate(() => OTK.debug.goto('practice'));
  await waitScene(page, 'practice');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  seen = await trail(page, 'intro');
  check(seen.join() === 'intro', '練習モードでは寸劇は出ない');
  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：\n' + errs.join('\n') : ''));
  await page.close();

  // ?noskit=1：寸劇なしで、これまでどおり
  const n = await open('game/?noskit=1', { wait: 300 });
  await n.page.evaluate(() => localStorage.clear());
  await waitScene(n.page, 'title');
  await pressUntil(n.page, 'Enter', 'menu');
  await n.page.waitForTimeout(200);
  await n.page.keyboard.press('Enter');
  seen = await trail(n.page, 'intro');
  check(seen.join() === 'calendar,intro', '?noskit=1 では、寸劇なしでカレンダー → 説明（' + seen.join(' → ') + '）');
  check((await n.page.evaluate(() => OTK.debug.noSkits)) === true, 'OTK.debug.noSkits が true');
  check(realErrors(n.errors).length === 0, 'エラーなし');
  await n.page.close();
}

// ── 5. 動きを減らす設定 ─────────────────────────────────
async function reduced(browser, base) {
  console.log('動きを減らす設定（prefers-reduced-motion）');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  await page.goto(base + 'game/?skit=zombie');
  await waitSkit(page, 'zombie');
  await page.evaluate(() => { OTK.debug.speed = 4; });
  await page.keyboard.down('z');
  await waitScene(page, 'intro', 30000);
  await page.keyboard.up('z');
  check(realErrors(errors).length === 0, '動きを減らす設定でも、最後まで流れてエラーなし');
  await ctx.close();
}

withSite(PORT, async ({ open, browser, base }) => {
  const { ids, games } = await scripts(open);
  await playAll(open, ids, games);
  await stepAll(open);
  await controls(open);
  await flow(open, games);
  await reduced(browser, base);
  console.log('ぜんぶ ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
