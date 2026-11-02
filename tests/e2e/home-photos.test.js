/*
 * トップページ（index.html #post）の投稿フォームの「写真」の確認
 *   node tests/e2e/home-photos.test.js   … ポートは ARCH.md の割り当て（8810）。PORT=8821 などで変えられる
 *  1. デモ（GAS_URL が空）：準備中。送るボタンも、ファイルをえらぶ所も使えない。何も送らない
 *  2. パソコン：写真だけで送れる（写真 2 枚と ZIP。idToken なしで quiz・by・hp を付ける・base64・同時に 2 枚まで・順番）、
 *     文字の投稿と写真をいっしょに送ると文字が先、確認の答えがちがう（写真だけ・文字といっしょ）、too_many で止まり、押しなおすと残りだけ、
 *     ドラッグで入れる
 *  3. スマホ（幅 390）：横にはみ出さない
 * ZIP はこの中で Node の zlib を使って作る。Apps Script の返事は、にせものに差しかえる。
 * 環境変数 HOME_SHOTS にフォルダを指定すると、途中の画面を保存する。
 */
const assert = require('assert');
const path = require('path');
const zlib = require('zlib');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8810; // ARCH.md の割り当て
const SHOTS = process.env.HOME_SHOTS || '';
const GAS = 'https://script.google.com/macros/s/TEST/exec';
const QUIZ_MSG = '確認の答えがちがいます。「確認」の問いの答えを、もう一度入れてください。';
const TOO_MANY = 'たくさん送られたので、少し休んでいます。1 時間ほどしてから、残りを送ってください。';

// ── 小さな ZIP 作り ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip(entries) {
  const locals = [];
  const cens = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const comp = e.method === 8 ? zlib.deflateRawSync(e.data) : e.data;
    const crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(e.method || 0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x5b21, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(e.method || 0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x5b21, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(0, 30); ch.writeUInt32LE(0, 34); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, comp);
    cens.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(cens);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
let seed = 7;
function fakeJpeg(n) {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; b[i] = (seed >> 16) & 0xff; }
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
  return b;
}
const A_JPG = fakeJpeg(4000);
const B_PNG = fakeJpeg(120 * 1024); // 100KB をこえても base64 が正しいか
const Z1 = fakeJpeg(2500);
const Z2 = Buffer.concat([fakeJpeg(300), Buffer.alloc(5000, 9)]);
const PHOTO_ZIP = makeZip([
  { name: '2005/IMG_1.jpg', data: Z1, method: 0 },
  { name: '2005/IMG_2.jpg', data: Z2, method: 8 },
  { name: 'memo.txt', data: Buffer.from('メモ'), method: 0 },
]);
const file = (name, buffer, mimeType) => ({ name, mimeType: mimeType || 'application/octet-stream', buffer });

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const photoStatus = (page) => page.textContent('#post-photo-status');
const progText = (page) => page.textContent('#post-prog-text');
const idle = (page, ms = 15000) => page.waitForFunction(() => !document.getElementById('post-send').disabled && !document.getElementById('post-files').disabled, null, { timeout: ms });

// 本番の形で開く。srv.answer(body, n) で upload の返事を決める（n は何枚目か。1 から）
async function openLive(browser, base, o = {}) {
  const ctx = await browser.newContext(o.phone
    ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1280, height: 800 } });
  await ctx.route('**/js/site/config.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: 'window.OB_CONFIG = { GAS_URL: ' + JSON.stringify(GAS) + ' };',
  }));
  const srv = {
    log: [], posts: [], uploads: [], started: [], inflight: 0, maxInflight: 0, postDone: 0,
    answer: () => ({ ok: true, id: 'x', year: null }),
  };
  await ctx.route(GAS + '*', async (r) => {
    const req = r.request();
    const body = JSON.parse(req.postData() || '{}');
    const json = (obj) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(obj) });
    if (req.method() === 'GET' && /[?&]type=quiz/.test(req.url())) return json({ ok: true, question: 'テスト用の問い？' });
    srv.log.push({ type: body.type, ct: req.headers()['content-type'] || '', at: Date.now() });
    if (body.type === 'post') {
      srv.posts.push(body);
      await new Promise((ok) => setTimeout(ok, 300)); // AI が整えるあいだ
      srv.postDone = Date.now();
      return json(body.quiz !== '山田' ? { ok: false, error: 'quiz' }
        : { ok: true, saved: { member: 'added' }, results: ['名簿：夕照 一郎 を載せました（2003年度入学）'] });
    }
    if (body.type === 'upload') {
      const n = srv.started.length + 1;
      srv.started.push({ name: body.name, at: Date.now() });
      srv.inflight++;
      srv.maxInflight = Math.max(srv.maxInflight, srv.inflight);
      await new Promise((ok) => setTimeout(ok, 150));
      srv.inflight--;
      srv.uploads.push(body);
      if (body.quiz !== '山田') return json({ ok: false, error: 'quiz' });
      return json(srv.answer(body, n));
    }
    return json({ ok: false, error: 'bad_request' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  await page.goto(base + '#post');
  await page.waitForTimeout(400);
  const reset = () => { srv.log.length = 0; srv.posts.length = 0; srv.uploads.length = 0; srv.started.length = 0; srv.maxInflight = 0; };
  return { page, ctx, errors, srv, reset };
}

withSite(PORT, async ({ browser, base, open }) => {
  // ── 1. デモ（GAS_URL が空） ──
  {
    const { page, errors, ctx } = await open('', { wait: 300 });
    const sent = [];
    await ctx.route('https://script.google.com/**', (r) => { sent.push(r.request().url()); r.abort(); });
    assert.ok(await page.locator('#post-off').isVisible(), '準備中の注意');
    assert.ok(await page.isDisabled('#post-send'), '送るボタンは押せない');
    assert.ok(await page.isDisabled('#post-files'), 'ファイルはえらべない');
    assert.ok(await page.locator('#post-photo').isVisible(), '写真の欄は見える');
    // ドラッグで入れても、えらばれない
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([0xff, 0xd8, 0xff, 1])], 'D.jpg', { type: 'image/jpeg' }));
      document.getElementById('post-photo').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    assert.ok((await page.textContent('#post-picked')).includes('まだ何もえらんでいません'));
    await page.evaluate(() => document.getElementById('post-form').requestSubmit());
    await page.waitForTimeout(300);
    assert.strictEqual(sent.length, 0, 'デモなのに送った');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: デモ（準備中・送らない）');
  }

  // ── 2. パソコン ──
  {
    const { page, ctx, errors, srv, reset } = await openLive(browser, base);
    // 欄と説明
    assert.ok(!(await page.locator('#post-off').isVisible()));
    const intro = await page.textContent('#post');
    assert.ok(intro.includes('寮の事件・出来事、名簿の追加や訂正、部屋割り、写真を送ってください。'), '説明に写真');
    assert.ok(!intro.includes('写真はここでは受けつけていません'));
    const legends = await page.$$eval('#post-form .home-post-legend', (ls) => ls.map((l) => l.firstChild.textContent.trim()));
    assert.deepStrictEqual(legends, ['事件・出来事', '名簿の追加・訂正', '部屋割り', '写真']);
    assert.ok((await page.textContent('#post-photo .home-post-legend small')).includes('写真館に並びます（見られるのは、承認された寮生だけ）。ZIP でまとめて送れます。1 枚 20MB まで'));
    assert.strictEqual(await page.getAttribute('#post-files', 'accept'), 'image/*,.zip,application/zip');
    assert.strictEqual(await page.getAttribute('#post-files', 'multiple'), '');
    assert.ok((await page.textContent('#post-photo')).includes('写真の年度') && (await page.textContent('#post-photo')).includes('わかれば。例：2005、平成17年度。書いておくと、撮影日よりこちらを使います'));
    assert.ok(!(await page.isVisible('#post-stop')));
    assert.ok(!(await page.isVisible('#post-album')));

    // 何もない → 書くか写真を
    await page.click('#post-send');
    assert.ok((await page.textContent('#post-status')).includes('どこか 1 つは'));
    // 写真だけ：確認の欄が空
    await page.setInputFiles('#post-files', [
      file('a.jpg', A_JPG, 'image/jpeg'),
      file('b.png', B_PNG, 'image/png'),
      file('photos.zip', PHOTO_ZIP, 'application/zip'),
    ]);
    assert.ok((await page.textContent('#post-picked')).includes('a.jpg ほか 2 個（ZIP 1 個）'), await page.textContent('#post-picked'));
    await page.click('#post-send');
    assert.ok((await page.textContent('#post-status')).includes('問いの答えを入れてください'), '確認の欄が空');
    assert.strictEqual(srv.log.length, 0);

    // 写真だけで送る
    await page.fill('[name=quiz]', '山田');
    await page.fill('[name=by]', '一年C');
    await page.fill('[name=ph_year]', '平成17年度');
    await page.click('#post-send');
    await page.waitForFunction(() => document.getElementById('post-send').disabled, null, { timeout: 3000 });
    assert.ok(await page.isVisible('#post-stop'), '送っている間に「やめる」がない');
    await idle(page);
    assert.ok(!(await page.isVisible('#post-stop')));
    assert.strictEqual(srv.posts.length, 0, '文字が空なのに、文字の投稿を送った');
    assert.deepStrictEqual(srv.started.map((s) => s.name), ['a.jpg', 'b.png', 'IMG_1.jpg', 'IMG_2.jpg'], '送った順番');
    assert.strictEqual(srv.maxInflight, 2, '同時に送る数: ' + srv.maxInflight);
    const want = { 'a.jpg': [A_JPG, 'image/jpeg'], 'b.png': [B_PNG, 'image/png'], 'IMG_1.jpg': [Z1, 'image/jpeg'], 'IMG_2.jpg': [Z2, 'image/jpeg'] };
    for (const u of srv.uploads) {
      assert.deepStrictEqual(Object.keys(u).sort(), ['by', 'data', 'hp', 'mime', 'name', 'note', 'quiz', 'type', 'year'], 'idToken なしで quiz・by・hp');
      assert.strictEqual(u.type, 'upload');
      assert.ok(Buffer.from(u.data, 'base64').equals(want[u.name][0]), u.name + ' の中身（base64）がちがう');
      assert.strictEqual(u.mime, want[u.name][1]);
      assert.strictEqual(u.quiz, '山田');
      assert.strictEqual(u.by, '一年C');
      assert.strictEqual(u.hp, '');
      assert.strictEqual(u.year, '平成17年度');
      assert.strictEqual(u.note, '');
    }
    assert.ok(srv.log.every((l) => /^text\/plain/.test(l.ct)), 'text/plain で送る');
    assert.strictEqual(await progText(page), '4 / 4 枚 送りました');
    assert.ok((await photoStatus(page)).includes('送り終わりました'));
    assert.strictEqual(await page.textContent('#post-status'), '', '文字の投稿の欄に、前の文が残っている');
    const ps = await page.$$eval('#post-problem-list li', (els) => els.map((e) => e.textContent));
    assert.deepStrictEqual(ps, ['photos.zip の中の memo.txt：写真ではないので、送りませんでした']);
    assert.ok(await page.isVisible('#post-album'), '「写真館で見る」がない');
    assert.strictEqual(await page.getAttribute('#post-album a', 'href'), 'shashin/');
    assert.strictEqual((await page.textContent('#post-album')).trim(), '写真館で見る ▶');
    assert.strictEqual(await page.inputValue('#post-files'), '');
    assert.ok((await page.textContent('#post-picked')).includes('まだ何もえらんでいません'));
    assert.strictEqual(await page.inputValue('[name=ph_year]'), '', '全部送れたら年度は消す');
    assert.strictEqual(await page.inputValue('[name=quiz]'), '山田', '確認の答えは残す');
    assert.strictEqual(await page.inputValue('[name=by]'), '一年C', '投稿者は残す');
    if (SHOTS) await page.locator('#post').screenshot({ path: path.join(SHOTS, 'post-photos-pc.png') });
    console.log('ok: 写真だけで送る（写真 2 枚と ZIP・idToken なし・base64・同時に 2 枚まで）');

    // 文字と写真をいっしょに：文字が先
    reset();
    await page.fill('[name=mb_name]', '夕照 一郎');
    await page.fill('[name=mb_entry]', '2003');
    await page.setInputFiles('#post-files', [file('c.jpg', fakeJpeg(900), 'image/jpeg'), file('d.jpg', fakeJpeg(901), 'image/jpeg')]);
    await page.click('#post-send');
    await page.waitForSelector('#post-status.is-done', { timeout: 5000 });
    await idle(page);
    assert.deepStrictEqual(srv.log.map((l) => l.type), ['post', 'upload', 'upload'], '送った順: ' + srv.log.map((l) => l.type));
    assert.ok(srv.started[0].at >= srv.postDone, '文字の投稿の返事の前に、写真を送りはじめた');
    assert.strictEqual(srv.posts[0].member.name, '夕照 一郎');
    assert.ok((await page.textContent('#post-status')).includes('送りました'), await page.textContent('#post-status'));
    assert.ok((await page.textContent('#post-status')).includes('名簿：夕照 一郎 を載せました'));
    assert.strictEqual(await progText(page), '2 / 2 枚 送りました');
    assert.ok((await photoStatus(page)).includes('送り終わりました'));
    assert.ok(await page.isVisible('#post-album'));
    assert.strictEqual(await page.inputValue('[name=mb_name]'), '', '送ったら文字の中身は消す');
    console.log('ok: 文字と写真（文字が先）');

    // 確認の答えがちがう：写真だけ → 1 枚目で止まる
    reset();
    await page.fill('[name=quiz]', 'ちがう寮');
    const four = [1, 2, 3, 4].map((i) => file('q' + i + '.jpg', fakeJpeg(700 + i), 'image/jpeg'));
    await page.setInputFiles('#post-files', four);
    await page.click('#post-send');
    await idle(page);
    assert.strictEqual(await photoStatus(page), QUIZ_MSG);
    assert.ok(srv.started.length <= 2, '確認の答えがちがうのに送りつづけた: ' + srv.started.length);
    assert.strictEqual(srv.posts.length, 0);
    assert.ok(!(await page.isVisible('#post-album')));
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.name), 'quiz', '確認の欄にもどる');
    assert.ok((await page.textContent('#post-picked')).includes('q1.jpg ほか 3 個'), 'えらんだものは残る');
    // 文字といっしょ → 文字の投稿で断られ、写真は送らない
    reset();
    await page.fill('[name=rm_text]', '2005年度 305号室 自分');
    await page.click('#post-send');
    await page.waitForSelector('#post-status.is-error', { timeout: 5000 });
    await idle(page);
    assert.ok((await page.textContent('#post-status')).includes('確認の答えがちがいます'));
    assert.deepStrictEqual(srv.log.map((l) => l.type), ['post'], '確認の答えがちがうのに写真を送った');
    assert.strictEqual(await page.inputValue('[name=rm_text]'), '2005年度 305号室 自分', '書いた内容は残る');
    console.log('ok: 確認の答えがちがう（写真だけ・文字といっしょ）');

    // too_many：止まる → 押しなおすと残りだけ
    reset();
    await page.fill('[name=rm_text]', '');
    await page.fill('[name=quiz]', '山田');
    let busy = true;
    srv.answer = (d, n) => (busy && n >= 3 ? { ok: false, error: 'too_many' } : { ok: true, id: 'n' + n, year: null });
    await page.setInputFiles('#post-files', [1, 2, 3, 4, 5, 6].map((i) => file('m' + i + '.jpg', fakeJpeg(800 + i), 'image/jpeg')));
    await page.click('#post-send');
    await idle(page);
    assert.strictEqual(await photoStatus(page), TOO_MANY);
    assert.ok(srv.started.length <= 4, '休みのあとも送りつづけた: ' + srv.started.length);
    assert.ok((await progText(page)).startsWith('2 / 6 枚 送りました'), await progText(page));
    assert.ok(await page.isVisible('#post-album'), '2 枚は入ったので、写真館へのリンク');
    busy = false;
    reset();
    await page.click('#post-send');
    await idle(page);
    assert.deepStrictEqual(srv.started.map((s) => s.name), ['m3.jpg', 'm4.jpg', 'm5.jpg', 'm6.jpg'], '残りだけを送っていない');
    assert.strictEqual(await progText(page), '4 / 4 枚 送りました');
    console.log('ok: too_many（止まる → 残りだけ）');

    // ドラッグで入れる
    await page.evaluate(() => {
      const dt = new DataTransfer();
      for (let i = 1; i <= 3; i++) dt.items.add(new File([new Uint8Array([0xff, 0xd8, 0xff, i])], 'D_' + i + '.jpg', { type: 'image/jpeg' }));
      const box = document.getElementById('post-photo');
      box.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
      window.__drag = box.classList.contains('is-drag');
      box.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    assert.ok(await page.evaluate(() => window.__drag), 'ドラッグ中の見た目にならない');
    assert.ok((await page.textContent('#post-picked')).includes('D_1.jpg ほか 2 個'));
    assert.strictEqual(await page.evaluate(() => JSON.stringify([Object.keys(localStorage).filter((k) => k !== 'ob-home-sound'), Object.keys(sessionStorage)])), '[[],[]]', 'ブラウザに何か保存している');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: ドラッグで入れる');
  }

  // ── 3. スマホ（幅 390） ──
  {
    const { page, ctx, errors, srv } = await openLive(browser, base, { phone: true });
    assert.ok(await noOverflow(page), '幅 390 で横にはみ出す');
    await page.setInputFiles('#post-files', [file('long-long-long-long-long-long-name-IMG_20050401_123456.jpg', fakeJpeg(600), 'image/jpeg'), file('bad.pdf', Buffer.from('%PDF'), 'application/pdf')]);
    await page.fill('[name=quiz]', '山田');
    await page.locator('#post-send').scrollIntoViewIfNeeded();
    await page.tap('#post-send');
    await idle(page);
    assert.strictEqual(srv.uploads.length, 1);
    assert.ok((await progText(page)).startsWith('1 / 1 枚'));
    assert.ok(await page.isVisible('#post-problems'));
    assert.ok(await noOverflow(page), '幅 390 で横にはみ出す（送ったあと）');
    if (SHOTS) await page.locator('#post').screenshot({ path: path.join(SHOTS, 'post-photos-phone.png') });
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: スマホ（幅 390）');
  }
}).then(() => {
  console.log('home-photos: すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
