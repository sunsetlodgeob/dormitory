/*
 * gas/Code.gs の確認（Google には出ない。Apps Script のまねは gasmock.js）
 *   node tests/gas/run.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadGas } = require('./gasmock');

const ROOT = path.resolve(__dirname, '..', '..');
const CID = '1234-test.apps.googleusercontent.com';
const NOW = () => Math.floor(Date.now() / 1000);

// ---- 小物 ----
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const out = (o) => {
  assert.strictEqual(o.getMimeType(), 'JSON', 'JSON で返す');
  return JSON.parse(o.getContent());
};
const plain = (x) => JSON.parse(JSON.stringify(x)); // vm の中で作られた値を、ふつうの値にする

function geminiOk(obj) {
  return { code: 200, body: { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] } };
}

function freshSetup(opts) {
  const env = loadGas(opts);
  env.ctx.setup();
  return env;
}

function col(sheet, name) {
  const i = sheet.header().indexOf(name);
  assert.ok(i >= 0, '列「' + name + '」がある');
  return i;
}
function rec(sheet, r) { // r 行目を { 見出し: 値 } に
  const o = {};
  sheet.header().forEach((h, i) => { o[h] = sheet.cell(r, i + 1); });
  return o;
}

// トップページの投稿を 1 件送る（doPost の type 'post'。いたずらよけの問いには正しく答える）
function send(env, body) {
  const o = env.ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ type: 'post', quiz: '夕照寮' }, body)), type: 'text/plain' } });
  return out(o);
}
const ev = (when, title, what, extra = {}) => ({ event: Object.assign({ when, title, what }, extra) });

// ---- ファイル ----
test('Code.gs は V8 で読める・appsscript.json の中身', () => {
  new vm.Script(fs.readFileSync(path.join(ROOT, 'gas/Code.gs'), 'utf8'), { filename: 'Code.gs' });
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'gas/appsscript.json'), 'utf8'));
  assert.strictEqual(m.timeZone, 'Asia/Tokyo');
  assert.strictEqual(m.runtimeVersion, 'V8');
  assert.deepStrictEqual(m.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  assert.ok(Array.isArray(m.oauthScopes) && m.oauthScopes.length >= 3);
  for (const s of ['spreadsheets', 'script.external_request', 'userinfo.email']) {
    assert.ok(m.oauthScopes.some((x) => x.includes('/auth/' + s)), 'スコープ ' + s);
  }
  assert.ok(!m.oauthScopes.some((x) => /\/auth\/(forms|script\.scriptapp)/.test(x)), 'フォームとトリガーはもう使わない');
  assert.ok(!m.oauthScopes.some((x) => /\/auth\/(drive|gmail|script\.send_mail|documents)/.test(x)), '要らない権限はない');
});

test('部屋番号の一覧が js/site/data.js と同じ', () => {
  const env = loadGas();
  const win = {};
  const ctx = vm.createContext({ window: win, fetch: () => {} });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/site/data.js'), 'utf8'), ctx);
  assert.deepStrictEqual(plain(env.get('ROOM_NUMBERS')), plain(win.OB.data.ROOM_NUMBERS));
});

// ---- setup ----
test('setup：シート・見出し・チェックボックスを作る（フォーム・トリガーは作らない）', () => {
  const env = freshSetup();
  const names = env.ss.getSheets().map((s) => s.getName());
  assert.ok(!names.includes('シート1'), '空のシート1は消す');
  const want = {
    '年表': ['ID', '年度', '月', '見出し', '本文', 'タグ', '掲載', '元の回答', 'メモ'],
    '名簿': ['名前', '入学年度', '卒業年度', '掲載', '元の回答', 'メモ'],
    '部屋割り': ['年度', '部屋', '名前', '掲載', '元の回答', 'メモ'],
    'メンバー': ['メールアドレス', 'メモ'],
    '投稿': ['日時', '内容', '結果'],
  };
  for (const [n, h] of Object.entries(want)) {
    const sh = env.ss.getSheetByName(n);
    assert.ok(sh, 'シート「' + n + '」');
    assert.deepStrictEqual(sh.header(), h);
    assert.strictEqual(sh.frozen, 1);
    const pub = h.indexOf('掲載');
    if (pub >= 0) {
      assert.deepStrictEqual(sh.validation.get('2,' + (pub + 1)), { kind: 'checkbox' }, n + '：掲載はチェックボックス');
      assert.deepStrictEqual(sh.validation.get('1000,' + (pub + 1)), { kind: 'checkbox' });
      assert.strictEqual(sh.getLastRow(), 1, 'チェックボックスを付けても行は増えない（値を入れない）');
    }
  }
  assert.strictEqual(env.ss.getSheetByName('部屋割り').formats.get('2,2'), '@', '部屋は文字のまま');

  // 投稿の原文を残すシート
  assert.deepStrictEqual(env.ss.getSheetByName('投稿').header(), ['日時', '内容', '結果']);
  // フォームもトリガーも作らない（投稿はトップページから）
  assert.strictEqual(env.forms.size, 0);
  assert.strictEqual(env.triggers.length, 0);
  assert.ok(env.logs.join('\n').includes('ウェブアプリ'), '次の手順をログに出す');
});

test('setup：2 回目も増えない・データは消えない', () => {
  const env = freshSetup();
  const meibo = env.ss.getSheetByName('名簿');
  meibo.appendRow(['夕照 一郎', 2003, 2007, true, '', '']);
  const before = env.ss.getSheets().map((s) => s.getName()).sort();
  env.ctx.setup();
  env.ctx.setup();
  assert.deepStrictEqual(env.ss.getSheets().map((s) => s.getName()).sort(), before);
  assert.deepStrictEqual(meibo.table(), [['夕照 一郎', 2003, 2007, true, '', '']]);
});

// ---- doGet ----
function seedPublic(env) {
  const meibo = env.ss.getSheetByName('名簿');
  meibo.appendRow(['夕照 一郎', 2003, 2007, true, '=HYPERLINK("#gid=1&range=A2","回答 2行目")', '本人に確認ずみ']);
  meibo.appendRow(['六浦 二郎', 2004, '', false, '', '']); // 掲載なし
  meibo.appendRow(['金沢 三郎', 2005, '', true, '', '名簿掲載NG（本人が「いいえ」。この言葉がある行は、掲載にチェックしてもサイトに出ません）']);
  meibo.appendRow(['', 2005, '', true, '', '']); // 名前なし
  meibo.appendRow(['八景 四郎', '平成14年度', 'H18', 'TRUE', '', '']); // 文字の年度
  meibo.appendRow(['平潟 五郎', '', '', true, '', '']); // 入学年度なし
  meibo.appendRow(['瀬戸 六郎', 2000, 2004, true, '', '']);
  const heya = env.ss.getSheetByName('部屋割り');
  heya.appendRow([2005, '305', '夕照 一郎', true, '', '']);
  heya.appendRow([2005, 212, '八景 四郎', true, '', '']); // 数字の部屋
  heya.appendRow([2006, '999', '夕照 一郎', true, '', '']); // ない部屋
  heya.appendRow([2006, '306', '六浦 二郎', false, '', '']);
  heya.appendRow([2006, '307', '金沢 三郎', true, '', '名簿掲載NG（本人が「いいえ」）']);
  heya.appendRow([1960, '101', '瀬戸 六郎', true, '', '']); // 範囲外の年度
  heya.appendRow([2001, '１０１', '瀬戸 六郎', true, '', '']); // 全角の数字
}

test('doGet public：掲載にチェックした行の、決まった項目だけ', () => {
  const env = freshSetup();
  seedPublic(env);
  const o = env.ctx.doGet({ parameter: { type: 'public' } });
  const text = o.getContent();
  const d = out(o);
  assert.deepStrictEqual(Object.keys(d).sort(), ['members', 'ok', 'rooms', 'updated']);
  assert.strictEqual(d.ok, true);
  assert.match(d.updated, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+09:00$/);
  assert.deepStrictEqual(d.members, [
    { name: '瀬戸 六郎', entryYear: 2000, gradYear: 2004 },
    { name: '八景 四郎', entryYear: 2002, gradYear: 2006 },
    { name: '夕照 一郎', entryYear: 2003, gradYear: 2007 },
  ]);
  assert.deepStrictEqual(d.rooms, [
    { year: 2001, room: '101', name: '瀬戸 六郎' },
    { year: 2005, room: '212', name: '八景 四郎' },
    { year: 2005, room: '305', name: '夕照 一郎' },
  ]);
  for (const ng of ['六浦', '金沢', '平潟', 'HYPERLINK', '確認ずみ', 'メモ', '元の回答', '掲載']) assert.ok(!text.includes(ng), '出さない：' + ng);
});

test('doGet public：5 分のキャッシュ。シートを手で直すと（onEdit）すぐ反映', () => {
  const env = freshSetup();
  seedPublic(env);
  const first = env.ctx.doGet({ parameter: { type: 'public' } }).getContent();
  const meibo = env.ss.getSheetByName('名簿');
  const reads = meibo.reads;
  meibo.write(3, col(meibo, '掲載') + 1, true); // 六浦 二郎 にチェック
  const second = env.ctx.doGet({ parameter: { type: 'public' } }).getContent();
  assert.strictEqual(second, first, 'キャッシュから返す');
  assert.strictEqual(meibo.reads, reads, 'シートを読まない');
  env.ctx.onEdit({});
  const third = out(env.ctx.doGet({ parameter: { type: 'public' } }));
  assert.ok(third.members.some((m) => m.name === '六浦 二郎'), '手で直した分が出る');
});

test('doGet public：人数が多くてもキャッシュに入る（100KB をこえる）', () => {
  const env = freshSetup();
  const heya = env.ss.getSheetByName('部屋割り');
  const rooms = plain(env.get('ROOM_NUMBERS'));
  for (let y = 1970; y <= 2010; y++) rooms.forEach((r) => heya.appendRow([y, r, '夕照寮生の名前です' + y + '年度' + r + '号室', true, '', '']));
  const a = env.ctx.doGet({ parameter: { type: 'public' } }).getContent();
  assert.ok(Buffer.byteLength(a, 'utf8') > 100 * 1024, '100KB より大きい');
  assert.strictEqual(JSON.parse(a).rooms.length, 41 * 35);
  heya.write(2, 3, 'かわった');
  const b = env.ctx.doGet({ parameter: { type: 'public' } }).getContent();
  assert.strictEqual(b, a, '分けて入れたキャッシュから読める');
});

test('doGet：知らない type は bad_request', () => {
  const env = freshSetup();
  for (const e of [{ parameter: { type: 'timeline' } }, { parameter: {} }, {}, undefined]) {
    assert.deepStrictEqual(out(env.ctx.doGet(e)), { ok: false, error: 'bad_request' });
  }
});

// ---- doPost（年表） ----
function seedTimeline(env) {
  const t = env.ss.getSheetByName('年表');
  t.appendRow(['e1', 2005, 4, '屋上でBBQ', '夕焼けが\nきれいだった。', '屋上、BBQ', true, '=HYPERLINK("#gid=1&range=A2","x")', '投稿者：先輩A']);
  t.appendRow(['e2', 2004, 2, '節分', '豆が残った。', '節分', false, '', '']); // 掲載なし
  t.appendRow(['', '', '', '年度不明の事件', '誰も覚えていない。', '', true, '', '']); // ID なし
  t.appendRow(['e4', '平成16年度', '11', '学祭', '焼きそば。', '学祭 模擬店', 'TRUE', '', '']);
  t.appendRow(['e5', 2004, 3, '追いコン', '泣いた。', '', true, '', '']);
}
function tokenEnv({ info, code = 200, throwFetch = false, viewers = [], editors = [], props = { CLIENT_ID: CID } } = {}) {
  const env = freshSetup({
    props, viewers, editors,
    fetch: (url) => {
      if (!url.startsWith('https://oauth2.googleapis.com/tokeninfo?id_token=')) throw new Error('想定外の URL ' + url);
      if (throwFetch) throw new Error('通信できません');
      return { code, body: code === 200 ? info : { error: 'invalid_token', error_description: 'Invalid Value' } };
    },
  });
  seedTimeline(env);
  return env;
}
const goodInfo = (email = 'viewer@example.com', extra = {}) => Object.assign({
  iss: 'https://accounts.google.com', azp: CID, aud: CID, sub: '1000', email, email_verified: 'true',
  iat: String(NOW() - 60), exp: String(NOW() + 3000), name: 'テスト', alg: 'RS256',
}, extra);
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMDAwIn0.c2lnbmF0dXJl';
const post = (env, body) => out(env.ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body), type: 'text/plain' } }));

test('doPost：閲覧者として共有された人には、掲載した事件だけ返す', () => {
  const env = tokenEnv({ info: goodInfo('Viewer@Example.com'), viewers: ['viewer@example.com'] });
  const o = env.ctx.doPost({ postData: { contents: JSON.stringify({ type: 'timeline', idToken: TOKEN }) } });
  const text = o.getContent();
  const d = out(o);
  assert.strictEqual(d.ok, true);
  assert.deepStrictEqual(Object.keys(d).sort(), ['events', 'ok']);
  assert.deepStrictEqual(d.events, [
    { id: 'e4', year: 2004, month: 11, title: '学祭', body: '焼きそば。', tags: ['学祭', '模擬店'] },
    { id: 'e5', year: 2004, month: 3, title: '追いコン', body: '泣いた。', tags: [] },
    { id: 'e1', year: 2005, month: 4, title: '屋上でBBQ', body: '夕焼けが\nきれいだった。', tags: ['屋上', 'BBQ'] },
    { id: 'r4', year: null, month: null, title: '年度不明の事件', body: '誰も覚えていない。', tags: [] },
  ]);
  for (const ng of ['節分', 'viewer', '@', '先輩A', 'HYPERLINK']) assert.ok(!text.includes(ng), '出さない：' + ng);
  // トークンは Google に確かめる
  assert.strictEqual(env.calls.fetch.length, 1);
  assert.strictEqual(env.calls.fetch[0].url, 'https://oauth2.googleapis.com/tokeninfo?id_token=' + TOKEN);
});

test('doPost：シート「メンバー」にある人（大文字小文字・Gmail の . や + は同じとみなす）', () => {
  const env = tokenEnv({ info: goodInfo('ob.test.0001@gmail.com') });
  assert.strictEqual(post(env, { type: 'timeline', idToken: TOKEN }).error, 'not_member');
  env.ss.getSheetByName('メンバー').appendRow(['ぜんぜん別の人 other@example.com, OBTest0001+ob@Gmail.com', '2005年入学']);
  env.ctx.onEdit({});
  const d = post(env, { type: 'timeline', idToken: TOKEN });
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.events.length, 4);
});

test('doPost：オーナー・編集者は見られる', () => {
  for (const [email, opt] of [['ob-kai@example.com', {}], ['editor@example.com', { editors: ['EDITOR@example.com'] }]]) {
    const env = tokenEnv(Object.assign({ info: goodInfo(email) }, opt));
    assert.strictEqual(post(env, { type: 'timeline', idToken: TOKEN }).ok, true, email);
  }
});

test('doPost：権限のない人は not_member。外したら（onEdit のあと）見られなくなる', () => {
  const env = tokenEnv({ info: goodInfo('stranger@example.com') });
  const d = post(env, { type: 'timeline', idToken: TOKEN });
  assert.deepStrictEqual(d, { ok: false, error: 'not_member' });
  const mem = env.ss.getSheetByName('メンバー');
  mem.appendRow(['stranger@example.com', '']);
  env.ctx.onEdit({});
  assert.strictEqual(post(env, { type: 'timeline', idToken: TOKEN }).ok, true);
  mem.write(2, 1, '');
  env.ctx.onEdit({});
  assert.strictEqual(post(env, { type: 'timeline', idToken: TOKEN }).error, 'not_member');
});

test('doPost：トークンがおかしいときは invalid_token', () => {
  const v = ['viewer@example.com'];
  const cases = [
    ['aud がちがう', { info: goodInfo(undefined, { aud: 'other.apps.googleusercontent.com' }) }],
    ['iss がちがう', { info: goodInfo(undefined, { iss: 'https://evil.example.com' }) }],
    ['期限切れ', { info: goodInfo(undefined, { exp: String(NOW() - 10) }) }],
    ['exp なし', { info: goodInfo(undefined, { exp: undefined }) }],
    ['メール未確認', { info: goodInfo(undefined, { email_verified: 'false' }) }],
    ['メールなし', { info: goodInfo(undefined, { email: '' }) }],
    ['tokeninfo が 400', { info: null, code: 400 }],
    ['tokeninfo が 500', { info: null, code: 500 }],
    ['通信できない', { info: goodInfo(), throwFetch: true }],
  ];
  for (const [label, c] of cases) {
    const env = tokenEnv(Object.assign({ viewers: v }, c));
    assert.deepStrictEqual(post(env, { type: 'timeline', idToken: TOKEN }), { ok: false, error: 'invalid_token' }, label);
  }
  // 'accounts.google.com'（https なし）は OK
  const env2 = tokenEnv({ viewers: v, info: goodInfo(undefined, { iss: 'accounts.google.com', email_verified: true }) });
  assert.strictEqual(post(env2, { type: 'timeline', idToken: TOKEN }).ok, true);
  // 形のおかしいトークンは Google に送らない
  const env3 = tokenEnv({ viewers: v, info: goodInfo() });
  for (const t of ['', 'abc', 'a.b', 'a.b.c&x=1', 'a.b.c/../d', 123, null, { x: 1 }, 'a.'.repeat(3000) + 'b']) {
    assert.deepStrictEqual(post(env3, { type: 'timeline', idToken: t }), { ok: false, error: 'invalid_token' }, String(t).slice(0, 20));
  }
  assert.strictEqual(env3.calls.fetch.length, 0);
});

test('doPost：CLIENT_ID がないと not_configured。本文がおかしいと bad_request', () => {
  const env = tokenEnv({ info: goodInfo(), viewers: ['viewer@example.com'], props: {} });
  assert.deepStrictEqual(post(env, { type: 'timeline', idToken: TOKEN }), { ok: false, error: 'not_configured' });
  assert.strictEqual(env.calls.fetch.length, 0);
  const env2 = tokenEnv({ info: goodInfo(), viewers: ['viewer@example.com'] });
  assert.deepStrictEqual(post(env2, 'これはJSONではない'), { ok: false, error: 'bad_request' });
  assert.deepStrictEqual(post(env2, { type: 'public', idToken: TOKEN }), { ok: false, error: 'bad_request' });
  assert.deepStrictEqual(post(env2, '[]'), { ok: false, error: 'bad_request' });
  assert.deepStrictEqual(out(env2.ctx.doPost({})), { ok: false, error: 'bad_request' });
});

test('doPost：Apps Script の中でエラーが起きても、中身は出さない', () => {
  const env = tokenEnv({ info: goodInfo(), viewers: ['viewer@example.com'] });
  env.ss.getSheetByName('年表').getDataRange = () => { throw new Error('秘密の内部エラー /path/to'); };
  const o = env.ctx.doPost({ postData: { contents: JSON.stringify({ type: 'timeline', idToken: TOKEN }) } });
  assert.deepStrictEqual(out(o), { ok: false, error: 'server_error' });
  assert.ok(!o.getContent().includes('秘密'));
});

// ---- onFormSubmit：年表 ----
function geminiEnv(handler, props = { GEMINI_API_KEY: 'test-key' }) {
  return freshSetup({ props, fetch: handler });
}

test('投稿 事件：Gemini で整理して、掲載ありで年表に 1 行。原文は「投稿」に残る', () => {
  const seen = [];
  const env = geminiEnv((url, p) => {
    seen.push({ url, p });
    return geminiOk({ year: 2005, month: 4, title: 'あ'.repeat(40), body: '  新入生が多くて\r\n机が足りなかった。  \n\n\n\n食堂の机も使った。 ', tags: ['#新歓', '新歓', '食堂', '机', 'おまけ'] });
  });
  // setup で付けたチェックボックスの範囲（はじめの 1000 行）をこえた行のつもりで、いったん消す
  env.ss.getSheetByName('年表').validation.clear();
  const res = send(env, Object.assign(ev('平成17年の4月ごろ', '新歓で机が足りない', '新入生が多くてつくえが足りなかった', { who: '先輩A、同期B' }), { by: '一年C' }));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.saved.event, 'e1');
  assert.ok(res.results[0].startsWith('年表：'));
  const t = env.ss.getSheetByName('年表');
  assert.strictEqual(t.getLastRow(), 2);
  const r = rec(t, 2);
  assert.strictEqual(r.ID, 'e1');
  assert.strictEqual(r['年度'], 2005);
  assert.strictEqual(r['月'], 4);
  assert.strictEqual(r['見出し'], 'あ'.repeat(30), '見出しは 30 字まで');
  assert.strictEqual(r['本文'], '新入生が多くて\n机が足りなかった。\n\n食堂の机も使った。');
  assert.strictEqual(r['タグ'], '新歓、食堂、机', 'タグは 3 つまで、# をとって重なりなし');
  assert.strictEqual(r['掲載'], true, '確認なしで、そのまま載せる');
  assert.deepStrictEqual(t.validation.get('2,' + (col(t, '掲載') + 1)), { kind: 'checkbox' });
  const posts = env.ss.getSheetByName('投稿');
  assert.strictEqual(r['元の回答'], '=HYPERLINK("#gid=' + posts.getSheetId() + '&range=A2","投稿 2行目")');
  assert.ok(t.isFormula(2, col(t, '元の回答') + 1), '元の回答はリンク');
  assert.ok(r['メモ'].includes('関わった人：先輩A、同期B') && r['メモ'].includes('投稿者：一年C') && r['メモ'].includes('いつごろ（原文）：平成17年の4月ごろ'));
  assert.ok(!r['メモ'].includes('Gemini失敗'));
  // 投稿シート：原文と結果
  const pr = rec(posts, 2);
  assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(pr['日時']), '日時 ' + pr['日時']);
  assert.ok(pr['内容'].includes('【事件・出来事】') && pr['内容'].includes('新入生が多くてつくえが足りなかった') && pr['内容'].includes('投稿者：一年C'));
  assert.ok(pr['結果'].startsWith('年表：'));

  // Gemini への頼み方
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
  assert.strictEqual(seen[0].p.method, 'post');
  assert.strictEqual(seen[0].p.headers['x-goog-api-key'], 'test-key');
  assert.ok(!seen[0].url.includes('test-key'), 'キーは URL に入れない');
  assert.strictEqual(seen[0].p.muteHttpExceptions, true);
  const body = JSON.parse(seen[0].p.payload);
  assert.strictEqual(body.generationConfig.responseMimeType, 'application/json');
  const sch = body.generationConfig.responseSchema;
  assert.deepStrictEqual(Object.keys(sch.properties).sort(), ['body', 'month', 'tags', 'title', 'year']);
  const sent = JSON.stringify(body);
  assert.ok(sent.includes('つくえが足りなかった') && sent.includes('平成17年の4月ごろ'));
  assert.ok(!sent.includes('先輩A') && !sent.includes('一年C'), '関わった人・投稿者は Gemini に送らない');

  // 2 件目は e2。年表はすぐ読める（掲載あり）
  send(env, ev('2006', 'x', 'y'));
  assert.strictEqual(rec(t, 3).ID, 'e2');
  assert.strictEqual(rec(t, 3)['メモ'], 'いつごろ（原文）：2006');
});

test('投稿 事件：範囲外の年度・おかしな月は空にしてメモ', () => {
  const env = geminiEnv(() => geminiOk({ year: 2025, month: 13, title: '', body: '', tags: 'タグじゃない' }));
  send(env, { event: { when: '去年', title: '見出しの原文', what: '本文の原文' } });
  const r = rec(env.ss.getSheetByName('年表'), 2);
  assert.strictEqual(r['年度'], '');
  assert.strictEqual(r['月'], '');
  assert.strictEqual(r['見出し'], '見出しの原文');
  assert.strictEqual(r['本文'], '本文の原文');
  assert.strictEqual(r['タグ'], '');
  assert.ok(r['メモ'].includes('年度を確認'));
});

test('投稿 事件：Gemini が失敗しても、原文を残す（メモ：Gemini失敗）', () => {
  let n = 0;
  const env = geminiEnv(() => { n++; return { code: 500, body: { error: { message: 'internal' } } }; });
  send(env, { event: { when: '平成17年の秋、10月ごろ', title: '=IMPORTXML("http://example.com","//a")', what: '何かがあった。\n2行目。' }, by: '一年C' });
  assert.strictEqual(n, 2, '1 回だけやりなおす');
  const t = env.ss.getSheetByName('年表');
  const r = rec(t, 2);
  assert.strictEqual(r.ID, 'e1');
  assert.strictEqual(r['年度'], 2005);
  assert.strictEqual(r['月'], 10);
  assert.strictEqual(r['見出し'], '=IMPORTXML("http://example.com","//a")');
  assert.ok(!t.isFormula(2, col(t, '見出し') + 1), '回答の文字は式にしない');
  assert.strictEqual(r['本文'], '何かがあった。\n2行目。');
  assert.strictEqual(r['掲載'], true, 'Gemini がだめでも原文のまま載せる（幹事があとで直す）');
  assert.ok(r['メモ'].startsWith('Gemini失敗：手で整理してください'));
  assert.ok(r['メモ'].includes('投稿者：一年C'));
});

test('投稿 事件：API キーがない・返事が JSON でない・混んでいたら 1 回やりなおす', () => {
  // キーなし：Gemini を呼ばない
  const env = geminiEnv(() => { throw new Error('呼ばないはず'); }, {});
  send(env, { event: { when: 'わからない', title: 'a', what: 'b' } });
  const r = rec(env.ss.getSheetByName('年表'), 2);
  assert.ok(r['メモ'].includes('Gemini失敗：手で整理してください') && r['メモ'].includes('APIキーが未設定'));
  assert.strictEqual(env.calls.fetch.length, 0);
  // JSON でない
  const env2 = geminiEnv(() => ({ code: 200, body: { candidates: [{ content: { parts: [{ text: 'すみません、わかりません' }] } }] } }));
  send(env2, { event: { when: '2003', title: 'a', what: 'b' } });
  assert.ok(rec(env2.ss.getSheetByName('年表'), 2)['メモ'].includes('Gemini失敗'));
  // 安全のため止められた（候補なし）
  const env3 = geminiEnv(() => ({ code: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } }));
  send(env3, { event: { when: '2003', title: 'a', what: 'b' } });
  assert.ok(rec(env3.ss.getSheetByName('年表'), 2)['メモ'].includes('Gemini失敗'));
  // 429 → 200
  let k = 0;
  const env4 = geminiEnv(() => (++k === 1 ? { code: 429, body: {} } : geminiOk({ year: 2003, month: null, title: 't', body: 'b', tags: [] })));
  send(env4, { event: { when: '2003', title: 'a', what: 'b' } });
  const r4 = rec(env4.ss.getSheetByName('年表'), 2);
  assert.strictEqual(r4['年度'], 2003);
  assert.ok(!r4['メモ'].includes('Gemini失敗'));
  assert.strictEqual(env4.calls.sleep, 1);
});

test('投稿：モデル名は GEMINI_MODEL で変えられる（おかしな名前は使わない）', () => {
  const urls = [];
  const h = (url) => { urls.push(url); return geminiOk({ year: null, month: null, title: 't', body: 'b', tags: [] }); };
  const env = geminiEnv(h, { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'models/gemini-3-flash' });
  send(env, { event: { when: '?', title: 'a', what: 'b' } });
  const env2 = geminiEnv(h, { GEMINI_API_KEY: 'k', GEMINI_MODEL: '../../evil?x=' });
  send(env2, { event: { when: '?', title: 'a', what: 'b' } });
  assert.deepStrictEqual(urls, [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
  ]);
});

// ---- 投稿：名簿の追加・訂正、部屋割り ----
const mbOk = (o) => geminiOk(Object.assign({ name: '', oldName: null, entryYear: null, gradYear: null, remove: false }, o));
const isMember = (p) => JSON.parse(p.payload).generationConfig.responseSchema.properties.oldName;

test('投稿 名簿：新しい人は掲載ありで 1 行足す。同じ名前があれば、その行を直す（メモに前の値）', () => {
  const seen = [];
  let reply = mbOk({ name: '夕照　一郎', entryYear: 2003 });
  const env = geminiEnv((url, p) => { seen.push(p.payload); return reply; });
  env.ss.getSheetByName('名簿').validation.clear();
  const r1 = send(env, { member: { name: '夕照　一郎', entry: '平成15年' } });
  assert.strictEqual(r1.saved.member, 'added');
  const meibo = env.ss.getSheetByName('名簿');
  let m = rec(meibo, 2);
  assert.strictEqual(m['名前'], '夕照 一郎', '全角の空白をそろえる');
  assert.strictEqual(m['入学年度'], 2003);
  assert.strictEqual(m['掲載'], true);
  assert.ok(m['元の回答'].includes('投稿 2行目'));
  const sch = JSON.parse(seen[0]).generationConfig.responseSchema;
  assert.deepStrictEqual(Object.keys(sch.properties).sort(), ['entryYear', 'gradYear', 'name', 'oldName', 'remove']);
  // すぐサイトに出る
  assert.deepStrictEqual(out(env.ctx.doGet({ parameter: { type: 'public' } })).members, [{ name: '夕照 一郎', entryYear: 2003, gradYear: null }]);

  // 訂正：空白のちがいは同じ人とみなして、入学年度と卒業年度を直す
  reply = mbOk({ name: '夕照一郎', entryYear: 2004, gradYear: 2007 });
  const r2 = send(env, { member: { name: '夕照一郎', fix: '入学は2004年度でした。2008年3月に卒業' } });
  assert.strictEqual(r2.saved.member, 'updated');
  assert.strictEqual(meibo.getLastRow(), 2, '行は増やさない');
  m = rec(meibo, 2);
  assert.strictEqual(m['名前'], '夕照 一郎', '名前の書き方はそのまま');
  assert.strictEqual(m['入学年度'], 2004);
  assert.strictEqual(m['卒業年度'], 2007);
  assert.ok(m['メモ'].includes('投稿で直した：入学年度 2003→2004、卒業年度 空→2007'));
  assert.ok(r2.results[0].includes('入学年度 2003→2004'));
  assert.deepStrictEqual(out(env.ctx.doGet({ parameter: { type: 'public' } })).members, [{ name: '夕照 一郎', entryYear: 2004, gradYear: 2007 }], 'キャッシュを消して、すぐ反映');
  // 変えるところがない
  reply = mbOk({ name: '夕照 一郎', entryYear: 2004 });
  assert.strictEqual(send(env, { member: { name: '夕照 一郎', entry: '2004' } }).saved.member, 'same');
});

test('投稿 名簿：名前の訂正は、名簿と部屋割りの両方を直す。「外して」は掲載を外す', () => {
  let reply;
  const env = geminiEnv(() => reply);
  const meibo = env.ss.getSheetByName('名簿');
  const heya = env.ss.getSheetByName('部屋割り');
  meibo.appendRow(['夕照 一朗', 2003, '', true, '', '']);
  heya.appendRow([2005, '305', '夕照 一朗', true, '', '']);
  heya.appendRow([2005, '305', '六浦 二郎', true, '', '']);
  reply = mbOk({ name: '夕照 一郎', oldName: '夕照 一朗' });
  const r = send(env, { member: { name: '夕照 一郎', fix: '名前の漢字は「一朗」ではなく「一郎」です' } });
  assert.strictEqual(r.saved.member, 'updated');
  assert.strictEqual(rec(meibo, 2)['名前'], '夕照 一郎');
  assert.strictEqual(rec(heya, 2)['名前'], '夕照 一郎');
  assert.strictEqual(rec(heya, 3)['名前'], '六浦 二郎', 'ほかの人は変えない');
  // 外してほしい
  reply = mbOk({ name: '夕照 一郎', remove: true });
  assert.strictEqual(send(env, { member: { name: '夕照 一郎', fix: '名簿から外してください' } }).saved.member, 'removed');
  assert.strictEqual(rec(meibo, 2)['掲載'], false);
  assert.strictEqual(rec(heya, 2)['掲載'], false);
  assert.strictEqual(rec(heya, 3)['掲載'], true);
  const d = out(env.ctx.doGet({ parameter: { type: 'public' } }));
  assert.deepStrictEqual(d.members, []);
  assert.deepStrictEqual(d.rooms, [{ year: 2005, room: '305', name: '六浦 二郎' }]);
  // 直す前の名前が見つからなければ、新しく足す（メモに書く）
  reply = mbOk({ name: '金沢 三郎', oldName: '金沢 三朗', entryYear: 2005 });
  assert.strictEqual(send(env, { member: { name: '金沢 三郎', fix: '三朗→三郎' } }).saved.member, 'added');
  assert.ok(rec(meibo, 3)['メモ'].includes('金沢 三朗'));
});

test('投稿 部屋割り：年度・部屋・名前の組で足す。同じ組は足さない。「自分」は名簿の欄の名前', () => {
  const seen = [];
  const env = geminiEnv((url, p) => {
    seen.push(JSON.parse(p.payload));
    if (isMember(p)) return mbOk({ name: '夕照 一郎', entryYear: 2003 });
    return geminiOk({ entries: [
      { year: 2005, room: '305号室', name: '夕照　一郎', remove: false },
      { year: 2005, room: '３０５', name: '六浦 二郎', remove: false },
      { year: 2005, room: '305', name: '六浦二郎', remove: false }, // 同じ人
      { year: 2007, room: '999', name: '金沢 三郎', remove: false }, // ない部屋
      { year: 1960, room: '301', name: '金沢 三郎', remove: false }, // 範囲外
    ] });
  });
  env.ss.getSheetByName('部屋割り').validation.clear();
  const r = send(env, { member: { name: '夕照 一郎', entry: '2003' }, rooms: { text: '2005年度 305号室：自分と六浦二郎\n2007 999 金沢三郎' } });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.saved.rooms, { added: 2, same: 1, removed: 0 });
  const heya = env.ss.getSheetByName('部屋割り');
  assert.deepStrictEqual(heya.table().map((x) => x.slice(0, 4)), [[2005, '305', '夕照 一郎', true], [2005, '305', '六浦 二郎', true]]);
  assert.ok(rec(heya, 2)['メモ'].includes('読み取れなかった組') && rec(heya, 2)['メモ'].includes('999'));
  const roomsReq = seen.find((b) => b.generationConfig.responseSchema.properties.entries);
  assert.ok(JSON.stringify(roomsReq).includes('夕照 一郎'), '「自分」のために、名簿の欄の名前を渡す');
  assert.strictEqual(r.results.length, 2);
  assert.ok(r.results[1].startsWith('部屋割り：2 件を載せました'));
  // サイトにすぐ出る
  assert.deepStrictEqual(out(env.ctx.doGet({ parameter: { type: 'public' } })).rooms.map((x) => x.name), ['夕照 一郎', '六浦 二郎']);
});

test('投稿 部屋割り：「まちがいなので消して」は掲載を外す。Gemini が失敗しても行を読む', () => {
  const env = geminiEnv(() => geminiOk({ entries: [{ year: 2005, room: '305', name: '六浦 二郎', remove: true }] }));
  const heya = env.ss.getSheetByName('部屋割り');
  heya.appendRow([2005, '305', '六浦 二郎', true, '', '']);
  assert.deepStrictEqual(send(env, { rooms: { text: '2005年度の305に六浦二郎とあるのはまちがい。消してください' } }).saved.rooms, { added: 0, same: 0, removed: 1 });
  assert.strictEqual(rec(heya, 2)['掲載'], false);
  // Gemini なし
  const env2 = geminiEnv(() => { throw new Error('通信できません'); });
  const r2 = send(env2, { rooms: { text: '2005年度 305号室 ﾉｼﾞﾏ ｸﾛｳ・湘南二郎さん\nH18 212号室：鎌倉三郎\nよく覚えていない' } });
  assert.deepStrictEqual(r2.saved.rooms, { added: 3, same: 0, removed: 0 });
  const h2 = env2.ss.getSheetByName('部屋割り');
  assert.deepStrictEqual(h2.table().map((x) => x.slice(0, 4)), [[2005, '305', 'ノジマ クロウ', true], [2005, '305', '湘南二郎', true], [2006, '212', '鎌倉三郎', true]], '「さん」をとる。H18 → 2006');
  assert.ok(rec(h2, 2)['メモ'].startsWith('Gemini失敗'));
});

test('投稿 名簿：Gemini が失敗したら、欄に書いてあるとおりに入れる（訂正の文はメモ）', () => {
  const env = geminiEnv(() => { throw new Error('通信できません'); });
  const r = send(env, { member: { name: 'ﾉｼﾞﾏ ｸﾛｳ', entry: '平成15年', grad: 'H19', fix: 'よろしく' } });
  assert.strictEqual(r.saved.member, 'added');
  const m = rec(env.ss.getSheetByName('名簿'), 2);
  assert.strictEqual(m['名前'], 'ノジマ クロウ', '半角カナをそろえる');
  assert.strictEqual(m['入学年度'], 2003);
  assert.strictEqual(m['卒業年度'], 2007);
  assert.strictEqual(m['掲載'], true);
  assert.ok(m['メモ'].startsWith('Gemini失敗：手で整理してください'));
  assert.ok(m['メモ'].includes('訂正したいこと（原文）：よろしく'));
});

test('投稿 名簿：名前が = で始まっても式にしない', () => {
  const env = geminiEnv((url, p) => (isMember(p) ? mbOk({ name: '=IMAGE("http://e.example/a.png")', entryYear: 2004 })
    : geminiOk({ entries: [{ year: 2004, room: '202', name: '=IMAGE("http://e.example/a.png")', remove: false }] })));
  send(env, { member: { name: '=IMAGE("http://e.example/a.png")', entry: '2004' }, rooms: { text: '2004 202 =IMAGE' } });
  const meibo = env.ss.getSheetByName('名簿');
  const heya = env.ss.getSheetByName('部屋割り');
  assert.ok(!meibo.isFormula(2, 1) && !heya.isFormula(2, 3));
  assert.strictEqual(meibo.cell(2, 1), '=IMAGE("http://e.example/a.png")');
  assert.strictEqual(heya.cell(2, 3), '=IMAGE("http://e.example/a.png")');
});

test('投稿：いたずらよけ（問い・わなの欄・空・同じ内容の 2 回目・1 時間の上限）', () => {
  let n = 0;
  const env = geminiEnv(() => { n++; return geminiOk({ year: 2005, month: null, title: 't', body: 'b', tags: [] }); });
  const raw = (b) => out(env.ctx.doPost({ postData: { contents: JSON.stringify(b) } }));
  assert.deepStrictEqual(raw({ type: 'post', quiz: 'わからない', event: { title: 'a' } }), { ok: false, error: 'quiz' });
  assert.deepStrictEqual(raw({ type: 'post', event: { title: 'a' } }), { ok: false, error: 'quiz' });
  for (const q of ['夕照寮', ' 夕照 ', 'せきしょうりょう', 'ｾｷｼｮｳ']) assert.notStrictEqual(raw({ type: 'post', quiz: q }).error, 'quiz', q);
  assert.deepStrictEqual(send(env, {}), { ok: false, error: 'empty' });
  assert.deepStrictEqual(send(env, { event: { when: '2005', who: 'x' }, member: { entry: '2003' }, rooms: { text: '   ' } }), { ok: false, error: 'empty' }, '見出しも本文も名前もない');
  // わな：入れずに ok だけ返す
  assert.strictEqual(send(env, Object.assign(ev('2005', 'わな', 'b'), { hp: 'http://spam.example' })).ok, true);
  assert.strictEqual(env.ss.getSheetByName('投稿').getLastRow(), 1);
  assert.strictEqual(n, 0, 'Gemini も呼ばない');
  // 同じ内容は 2 回入れない
  send(env, ev('2005', '一度だけ', 'b'));
  assert.strictEqual(send(env, ev('2005', '一度だけ', 'b')).duplicate, true);
  assert.strictEqual(env.ss.getSheetByName('年表').getLastRow(), 2);
  // 1 時間の上限
  for (let i = 0; i < 40; i++) send(env, ev('2005', '連投' + i, 'b'));
  assert.strictEqual(env.ss.getSheetByName('年表').getLastRow(), 1 + env.get('POST_PER_HOUR'));
  assert.deepStrictEqual(send(env, ev('2005', 'もう一件', 'b')), { ok: false, error: 'too_many' });
});

test('投稿：3 つ全部いっしょでも、それぞれのシートへ。1 つがエラーでも、ほかは入る', () => {
  const env = geminiEnv((url, p) => {
    const sch = JSON.parse(p.payload).generationConfig.responseSchema.properties;
    if (sch.oldName) return mbOk({ name: '夕照 一郎', entryYear: 2003 });
    if (sch.entries) return geminiOk({ entries: [{ year: 2005, room: '305', name: '夕照 一郎', remove: false }] });
    return geminiOk({ year: 2005, month: 4, title: '新歓', body: 'b', tags: [] });
  });
  // 名簿のシートを幹事が消してしまっていても作りなおす
  env.ss.deleteSheet(env.ss.getSheetByName('名簿'));
  const r = send(env, Object.assign(ev('2005', '新歓', 'b'), { member: { name: '夕照 一郎', entry: '2003' }, rooms: { text: '2005 305 自分' } }));
  assert.deepStrictEqual(plain(r.saved), { event: 'e1', member: 'added', rooms: { added: 1, same: 0, removed: 0 } });
  assert.strictEqual(r.results.length, 3);
  const pr = rec(env.ss.getSheetByName('投稿'), 2);
  assert.strictEqual(pr['結果'].split('\n').length, 3);
  assert.ok(pr['内容'].includes('【名簿の追加・訂正】') && pr['内容'].includes('【部屋割り】'));
  // 部屋割りだけ書けなかった：ほかは入り、結果にそう書く
  const env3 = geminiEnv((url, p) => (JSON.parse(p.payload).generationConfig.responseSchema.properties.entries
    ? geminiOk({ entries: [{ year: 2005, room: '305', name: 'a', remove: false }] }) : geminiOk({ year: 2005, month: 4, title: 't', body: 'b', tags: [] })));
  const sheetOf = env3.ctx.sheetOf;
  env3.ctx.sheetOf = (ss, def) => { if (def.name === '部屋割り') throw new Error('書けない'); return sheetOf(ss, def); };
  const r3 = send(env3, Object.assign(ev('2005', 't', 'b'), { rooms: { text: '2005 305 a' } }));
  assert.strictEqual(r3.ok, true);
  assert.strictEqual(r3.saved.event, 'e1');
  assert.ok(r3.results[1].startsWith('部屋割り：うまく入れられませんでした'));
  assert.ok(rec(env3.ss.getSheetByName('投稿'), 2)['結果'].includes('部屋割り：うまく入れられませんでした'));
});

// ---- サイトの読み込み（js/site/data.js）と形が合うか ----
test('js/site/data.js が doGet・doPost の返事をそのまま読める', async () => {
  const env = tokenEnv({ info: goodInfo(), viewers: ['viewer@example.com'] });
  seedPublic(env);
  const GAS_URL = 'https://script.google.com/macros/s/TEST/exec';
  const fakeFetch = async (url, init = {}) => {
    let o;
    if (init.method === 'POST') {
      assert.strictEqual(url, GAS_URL);
      assert.ok(/^text\/plain/.test(init.headers['Content-Type']));
      o = env.ctx.doPost({ postData: { contents: init.body, type: 'text/plain' } });
    } else {
      const u = new URL(url);
      o = env.ctx.doGet({ parameter: Object.fromEntries(u.searchParams) });
    }
    return new Response(o.getContent(), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const win = { OB_CONFIG: { GAS_URL } };
  const ctx = vm.createContext({ window: win, fetch: fakeFetch, URL, Response });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/site/data.js'), 'utf8'), ctx);
  const pub = plain(await win.OB.data.loadPublic());
  assert.strictEqual(pub.sample, false);
  assert.strictEqual(pub.members.length, 3);
  assert.strictEqual(pub.rooms.length, 3);
  const tl = plain(await win.OB.data.loadTimeline(TOKEN));
  assert.strictEqual(tl.events.length, 4);
  const env2 = tokenEnv({ info: goodInfo('stranger@example.com') });
  const fake2 = async (url, init) => new Response(env2.ctx.doPost({ postData: { contents: init.body } }).getContent(), { status: 200 });
  const win2 = { OB_CONFIG: { GAS_URL } };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/site/data.js'), 'utf8'), vm.createContext({ window: win2, fetch: fake2, Response }));
  await assert.rejects(win2.OB.data.loadTimeline(TOKEN), (e) => e.code === 'not_member');
});

// ---- 見直しで足した確認 ----
test('setup：オーナー以外のアカウントで実行したら止める', () => {
  const env = loadGas({ runAs: 'kanji.personal@example.com' });
  assert.throws(() => env.ctx.setup(), /オーナー/);
  assert.strictEqual(env.ss.getSheetByName('年表'), null);
  // オーナーで作ったあと、ほかの人がもう一度実行しても、何も変わらない
  const env2 = freshSetup();
  const before = Object.assign({}, env2.store);
  const env2b = env2; // 同じスプレッドシートのまま、実行する人だけ変える
  env2b.ctx.Session.getEffectiveUser = () => ({ getEmail: () => 'kanji.personal@example.com' });
  assert.throws(() => env2b.ctx.setup(), /オーナー/);
  assert.deepStrictEqual(env2.store, before);
});

test('appsscript.json：スプレッドシートの権限は spreadsheets（currentonly だけだと setup が止まるおそれ）', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'gas/appsscript.json'), 'utf8'));
  assert.ok(m.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
  assert.ok(m.oauthScopes.includes('https://www.googleapis.com/auth/userinfo.email'), 'オーナーかどうかを確かめるのに使う');
});

test('投稿：数・日付・TRUE に見える文字や、\' で始まる文字も、そのまま文字で入る', () => {
  const env = geminiEnv(() => geminiOk({ year: 2005, month: 4, title: '4/1', body: "'引用' から始まる本文", tags: ['2005', 'TRUE'] }));
  const t = env.ss.getSheetByName('年表');
  // チェックボックスや書式を付けた範囲（はじめの 1000 行）をこえた行のつもりで、書式を消す
  t.formats.clear();
  send(env, { event: { when: '2005年4月1日', title: '4/1', what: 'x' } });
  const r = rec(t, 2);
  assert.strictEqual(r['見出し'], '4/1', '日付に化けない');
  assert.strictEqual(r['本文'], "'引用' から始まる本文", '先頭の \' が消えない');
  assert.strictEqual(r['タグ'], '2005、TRUE');
  // 名簿・部屋割り：部屋番号は書式なしの行でも "305" のまま
  const env2 = geminiEnv((url, p) => (isMember(p) ? mbOk({ name: '1234', entryYear: 2004 }) : geminiOk({ entries: [{ year: 2005, room: '305', name: '1234', remove: false }] })));
  env2.ss.getSheetByName('部屋割り').formats.clear();
  send(env2, { member: { name: '1234', entry: '2004' }, rooms: { text: '2005年度 305号室 自分' } });
  assert.strictEqual(rec(env2.ss.getSheetByName('名簿'), 2)['名前'], '1234');
  // 部屋番号は、書式なしテキストの範囲をこえると数の 305 になる（本物と同じ）。サイトには "305" で出る
  assert.strictEqual(String(rec(env2.ss.getSheetByName('部屋割り'), 2)['部屋']), '305');
  const d2 = out(env2.ctx.doGet({ parameter: { type: 'public' } }));
  assert.deepStrictEqual(d2.rooms, [{ year: 2005, room: '305', name: '1234' }]);
  assert.deepStrictEqual(d2.members, [{ name: '1234', entryYear: 2004, gradYear: null }]);
});

test('サイトに返す文字は、シートで見えているとおり（幹事が手で「4/1」と打って日付になっても）', () => {
  const env = tokenEnv({ info: goodInfo(), viewers: ['viewer@example.com'] });
  const t = env.ss.getSheetByName('年表');
  t.appendRow(['e9', 2006, 4, '4/1', '3.11', '1/17', true, '', '']); // 本物のシートでは日付・数になる
  const ev = post(env, { type: 'timeline', idToken: TOKEN }).events.find((e) => e.id === 'e9');
  assert.deepStrictEqual(ev, { id: 'e9', year: 2006, month: 4, title: '4/1', body: '3.11', tags: ['1/17'] });
  const env2 = freshSetup();
  env2.ss.getSheetByName('名簿').appendRow(['TRUE', 2003, '', true, '', '']);
  assert.deepStrictEqual(out(env2.ctx.doGet({ parameter: { type: 'public' } })).members, [{ name: 'TRUE', entryYear: 2003, gradYear: null }]);
});

test('キャッシュ：分けるときに絵文字をまん中で切らない', () => {
  const env = loadGas();
  const chunk = env.get('CACHE_CHUNK');
  const text = JSON.stringify({ name: 'a'.repeat(chunk - 10) + '😀👍🏻夕照' + 'b'.repeat(chunk) });
  for (let shift = 0; shift < 4; shift++) {
    const s = 'x'.repeat(shift) + text;
    env.ctx.cachePut('t', s, 60);
    const got = env.ctx.cacheGet('t');
    assert.ok(got === s, 'ずらし ' + shift + '：読みもどした文字がちがう（' + (got || '').length + ' / ' + s.length + '）');
  }
});

test('Gemini：既定のモデルは gemini-flash-latest。古いモデル名で 404 なら既定に切りかえる。temperature は決めない', () => {
  const urls = [];
  const bodies = [];
  const h = (url, p) => {
    urls.push(url);
    bodies.push(JSON.parse(p.payload));
    if (url.includes('gemini-2.5-flash')) return { code: 404, body: { error: { code: 404, message: 'models/gemini-2.5-flash is no longer available' } } };
    return geminiOk({ year: 2005, month: 4, title: 't', body: 'b', tags: [] });
  };
  const env = geminiEnv(h);
  send(env, { event: { when: '2005', title: 'a', what: 'b' } });
  assert.deepStrictEqual(urls, ['https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent']);
  assert.ok(!('temperature' in bodies[0].generationConfig), 'Gemini 3 では温度を下げないほうがよい');
  urls.length = 0;
  const env2 = geminiEnv(h, { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-2.5-flash' });
  send(env2, { event: { when: '2005', title: 'a', what: 'b' } });
  assert.deepStrictEqual(urls, [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
  ]);
  const r = rec(env2.ss.getSheetByName('年表'), 2);
  assert.strictEqual(r['年度'], 2005);
  assert.ok(!r['メモ'].includes('Gemini失敗'));
  // 既定のモデルも 404 なら、原文のまま残してメモに HTTP 404
  const env3 = geminiEnv(() => ({ code: 404, body: {} }));
  send(env3, { event: { when: '2005', title: 'a', what: 'b' } });
  assert.ok(rec(env3.ss.getSheetByName('年表'), 2)['メモ'].includes('HTTP 404'));
  assert.strictEqual(env3.calls.fetch.length, 1);
});

test('Gemini の返事が式でも、シートでは式として動かない', () => {
  const env = geminiEnv(() => geminiOk({ year: 2005, month: 4, title: '=IMAGE("http://e.example/x")', body: '+cmd|calc', tags: ['=1+1', '@x'] }));
  send(env, { event: { when: '2005', title: 'a', what: 'b' } });
  const t = env.ss.getSheetByName('年表');
  for (const h of ['見出し', '本文', 'タグ']) assert.ok(!t.isFormula(2, col(t, h) + 1), h);
  assert.strictEqual(rec(t, 2)['見出し'], '=IMAGE("http://e.example/x")');
  assert.strictEqual(rec(t, 2)['タグ'], '=1+1、@x');
});

test('メンバー：「名前 <アドレス>」・mailto:・全角の＠・「」付きでも読む', () => {
  const env = tokenEnv({ info: goodInfo('senpai.a@example.com') });
  const mem = env.ss.getSheetByName('メンバー');
  mem.appendRow(['先輩A <Senpai.A@example.com>', '']);
  assert.strictEqual(post(env, { type: 'timeline', idToken: TOKEN }).ok, true);
  for (const cell of ['mailto:senpai.a@example.com', 'senpai.a＠example.com', '「senpai.a@example.com」', 'senpai.a@example.com.']) {
    const e2 = tokenEnv({ info: goodInfo('senpai.a@example.com') });
    e2.ss.getSheetByName('メンバー').appendRow([cell, '']);
    assert.strictEqual(post(e2, { type: 'timeline', idToken: TOKEN }).ok, true, cell);
  }
  // 似ているだけのアドレスは通さない
  const e3 = tokenEnv({ info: goodInfo('senpai.a@example.com.evil.test') });
  e3.ss.getSheetByName('メンバー').appendRow(['senpai.a@example.com', '']);
  assert.strictEqual(post(e3, { type: 'timeline', idToken: TOKEN }).error, 'not_member');
  const e4 = tokenEnv({ info: goodInfo('senpaia@example.com') }); // Gmail 以外は . を無視しない
  e4.ss.getSheetByName('メンバー').appendRow(['senpai.a@example.com', '']);
  assert.strictEqual(post(e4, { type: 'timeline', idToken: TOKEN }).error, 'not_member');
});

// ---- 実行 ----
(async () => {
  let fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('ok   ' + t.name);
    } catch (e) {
      fail++;
      console.log('NG   ' + t.name + '\n     ' + String((e && e.stack) || e).split('\n').slice(0, 6).join('\n     '));
    }
  }
  console.log('\n' + (tests.length - fail) + ' / ' + tests.length + ' 件 OK');
  process.exit(fail ? 1 : 0);
})();
