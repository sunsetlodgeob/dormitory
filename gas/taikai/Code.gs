/*
 * 夕照寮OB会 ― 寮生大会の出欠フォーム（Google フォームに付けて使う Apps Script）
 *
 *   参加者 ─ Google フォーム（出欠回答）─ onFormSubmit ─┬─ 確認のメール（OB会の Gmail から）
 *                                                      ├─ Google カレンダーの招待（事前準備・1次会・2次会の予定に、ゲストとして足す）
 *                                                      ├─ 幹事への知らせ
 *                                                      └─ 管理用のスプレッドシート「寮生大会 参加管理」に 1 人 1 行
 *   1 時間ごと（tick）：前日のお知らせ（設定の日時になったら 1 回だけ）・送れなかったメールの送りなおし
 *
 *  - フォームの回答のスプレッドシート（別の人の持ち物）には、さわらない。回答はフォームから直接受けとる
 *  - 同じメールアドレスの 2 回目からは、新しい回答を正とする（招待を足す・消す、「変更しました」のメール）
 *  - 日時・会費・案内の文・メールの文面は、管理用のスプレッドシートの「設定」「文面」で直せる。
 *    支払い先・担当者の名前などは、ここ（公開しているコード）には書かない。「設定」の「会費の払い方」に書く
 *  - setup()：最初に 1 回。管理用のスプレッドシートとトリガーを作り、カレンダーの予定を確かめる
 * 手順は docs/site/SETUP.md の「寮生大会の出欠フォーム」。
 */

// ---- 決まりごと --------------------------------------------------------------

// 会（フォームの「出欠回答」の表の行）。名前・会費・案内のふだんの値。「設定」のシートで直せる
const PARTS = [
  {
    key: 'prep', label: '事前準備', event: '寮生大会（事前準備）', fee: 0,
    guide: '時間：10:00〜12:30\n場所：横浜市立大学 本校舎306教室\n内容：会場の準備（お手伝いありがとうございます）',
  },
  {
    key: 'first', label: '1次会', event: '寮生大会（1次会）', fee: 3000,
    guide: '時間：受付 12:30〜 / 開始 13:00〜\n場所：横浜市立大学 本校舎306教室\n会費：3,000円\n内容：軽食と飲み物をご用意します',
  },
  {
    key: 'second', label: '2次会', event: '寮生大会（2次会）', fee: 7000,
    guide: '時間：16:30〜18:30\n場所：金沢八景駅付近の飲食店（調整中。決まったらカレンダーの予定でお知らせします）\n会費：7,000円',
  },
];

const SS_NAME = '寮生大会 参加管理';
const SHEETS = {
  people: {
    name: '参加者',
    headers: ['メールアドレス', 'お名前', '電話番号', '入学年次'].concat(PARTS.map(function (p) { return p.label; }))
      .concat(['会費合計', 'コメント', '最初の回答', '最後の回答', '回答の回数', '締め切り後'])
      .concat(PARTS.map(function (p) { return '招待（' + p.label + '）'; }))
      .concat(['メール', 'メモ']),
  },
  settings: { name: '設定', headers: ['項目', '値', '説明'] },
  texts: { name: '文面', headers: ['種類', '件名', '本文'] },
  log: { name: '記録', headers: ['日時', 'できごと'] },
};

// 「設定」のふだんの値（日時は文字で入れる。シートで日付に化けても読める）
const SETTINGS = [
  ['大会の日', '2026/11/28', 'カレンダーの予定を探す日'],
  ['回答の締め切り', '2026/11/14 23:59', 'これより後の回答も受けるが、幹事への知らせに「締め切り後」と付ける'],
  ['前日のお知らせ', '2026/11/27 12:00', 'この日時をすぎたら（1 時間ごとに見ている）、参加する人に 1 回だけ送る'],
  ['前日のお知らせを送った日時', '', '送ると入る。消すと、もう一度送る'],
  ['幹事への知らせ先', '', '空なら、このしくみを作った OB会のアカウント'],
  ['差出人の名前', '夕照寮OB会', 'メールの差出人に出る名前'],
  ['会費の払い方', '', 'メールの {会費の払い方} に入る文（PayPay の ID、会計担当、送金のときのお願いなど）'],
].concat(PARTS.map(function (p) { return ['予定の名前：' + p.label, p.event, 'カレンダーの予定の名前（大会の日に、この名前の予定に招待する）']; }))
  .concat(PARTS.map(function (p) { return ['会費：' + p.label, p.fee, '円'];  }))
  .concat(PARTS.map(function (p) { return ['案内：' + p.label, p.guide, 'メールの {会の案内} に入る文']; }));

// 「文面」のふだんの値。{…} は、送るときに入れかわる
const TEXTS = [
  ['参加の確認', '【夕照寮OB会】寮生大会の出欠を受けつけました',
    '{名前} 様\n\n寮生大会（11月28日）の出欠のご回答、ありがとうございます。\n次のとおり受けつけました。\n\n■ ご参加いただく会\n{参加する会}\n\n{会の案内}\n\n■ 会費\n合計：{会費合計}\n{会費の払い方}\n\n■ カレンダーの招待\nご参加の会ごとに、Google カレンダーの招待をお送りしています。「はい」を押すと、ご自分のカレンダーに入ります。時間や場所が変わったときは、招待の予定でお知らせします。\n\n■ 出欠を変えるとき\n同じメールアドレスで、もう一度フォームにご回答ください。新しいご回答のほうで受けつけます。\n回答期限：{締め切り}（期限後のキャンセルはお控えください）\n\n当日お会いできるのを楽しみにしています。\n\n夕照寮OB会'],
  ['出欠の変更', '【夕照寮OB会】寮生大会の出欠を変更しました',
    '{名前} 様\n\n寮生大会（11月28日）の出欠の変更を受けつけました。\n\n変更前：{変更前}\n変更後：{変更後}\n\n{会の案内}\n\n■ 会費\n合計：{会費合計}\n{会費の払い方}\n\nカレンダーの招待も、変更後の会に合わせて送りなおしました（参加しなくなった会の招待は取り消しました）。\n\n夕照寮OB会'],
  ['不参加のお礼', '【夕照寮OB会】寮生大会の出欠のご回答ありがとうございます',
    '{名前} 様\n\n寮生大会（11月28日）の出欠のご回答、ありがとうございます。\n今回はすべて不参加で受けつけました。\n\n予定が変わったら、回答期限（{締め切り}）までに、同じメールアドレスでもう一度フォームにご回答ください。\nまたの機会にお会いできるのを楽しみにしています。\n\n夕照寮OB会'],
  ['前日のお知らせ', '【夕照寮OB会】明日は寮生大会です',
    '{名前} 様\n\nいよいよ明日、11月28日（土）は寮生大会です。\n\n■ ご参加いただく会\n{参加する会}\n\n{会の案内}\n\n■ 会費\n合計：{会費合計}\n{会費の払い方}\n\nお気をつけてお越しください。\n\n夕照寮OB会'],
  ['幹事への知らせ', '{締め切り後}【寮生大会】{名前}さん（{入学年次}）が回答：{参加する会}',
    '{名前}さん（{入学年次}）から出欠の回答がありました。{締め切り後}\n\n{変更前}→ {変更後}\nメールアドレス：{メールアドレス}\nコメント：{コメント}\n\n一覧：{一覧}'],
];

const YES = '参加';

// ---- setup：最初の準備 -------------------------------------------------------

function setup() {
  const form = FormApp.getActiveForm();
  if (!form) throw new Error('フォームの「︙ → スクリプト エディタ」から開いたスクリプトで実行してください');
  const ss = book(true);
  ensureSheets(ss);
  // トリガー：フォームの送信と、1 時間ごと
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmit' || t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('tick').timeBased().everyHours(1).create();
  // カレンダーの予定が見つかるか
  const found = PARTS.map(function (p) { return p.label + '：' + (findEvent(ss, p) ? '見つかった' : '見つからない（「設定」の予定の名前と、大会の日を確かめてください）'); });
  const text = '準備ができました。\n管理用のスプレッドシート：' + ss.getUrl() + '\nカレンダーの予定：\n' + found.join('\n');
  log(ss, 'setup：' + found.join('、'));
  Logger.log(text);
  return text;
}

// 管理用のスプレッドシート（なければ作る。作るのは OB会のアカウント）
function book(create) {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('MANAGE_SS_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (err) { if (!create) throw err; }
  }
  if (!create) throw new Error('setup を先に実行してください');
  const ss = SpreadsheetApp.create(SS_NAME);
  p.setProperty('MANAGE_SS_ID', ss.getId());
  return ss;
}

function ensureSheets(ss) {
  Object.keys(SHEETS).forEach(function (k) {
    const def = SHEETS[k];
    let sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      sh.setFrozenRows(1);
    }
  });
  const first = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  // 足りない項目だけ足す（幹事が直した値は、そのまま）
  const st = ss.getSheetByName(SHEETS.settings.name);
  const have = {};
  rows(st).forEach(function (r) { have[String(r['項目']).trim()] = true; });
  SETTINGS.forEach(function (s) { if (!have[s[0]]) st.appendRow([s[0], typeof s[1] === 'string' ? "'" + s[1] : s[1], s[2]]); });
  const tx = ss.getSheetByName(SHEETS.texts.name);
  const haveT = {};
  rows(tx).forEach(function (r) { haveT[String(r['種類']).trim()] = true; });
  TEXTS.forEach(function (t) { if (!haveT[t[0]]) tx.appendRow(t); });
}

// ---- フォームの回答 ------------------------------------------------------------

function onFormSubmit(e) {
  const ss = book(false);
  const a = answersOf(e && e.response);
  if (!validEmail(a.email)) {
    log(ss, 'メールアドレスがおかしい回答：' + a.name + '（' + a.email + '）');
    notifyKanji(ss, '【寮生大会】メールアドレスがおかしい回答', a.name + 'さん（' + a.entry + '）の回答のメールアドレス「' + a.email + '」が、メールアドレスの形ではありません。確認のメールと招待は送っていません。');
    return { ok: false, error: 'bad_email' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return handleAnswer(ss, a);
  } finally {
    lock.releaseLock();
  }
}

// フォームの回答 → { name, email, phone, entry, comment, parts: { prep: true/false, … } }
function answersOf(response) {
  const a = { name: '', email: '', phone: '', entry: '', comment: '', parts: {} };
  PARTS.forEach(function (p) { a.parts[p.key] = false; });
  if (!response) return a;
  response.getItemResponses().forEach(function (ir) {
    const item = ir.getItem();
    const title = String(item.getTitle() || '');
    const v = ir.getResponse();
    if (item.getType() === FormApp.ItemType.GRID && /出欠/.test(title)) {
      const labels = item.asGridItem().getRows();
      labels.forEach(function (label, i) {
        const part = partOf(label);
        if (part) a.parts[part.key] = String((v || [])[i] || '').trim() === YES;
      });
      return;
    }
    const text = Array.isArray(v) ? v.join('、') : String(v == null ? '' : v);
    if (/名前/.test(title)) a.name = clean(text, 60);
    else if (/メール/.test(title)) a.email = clean(text, 200).normalize('NFKC').replace(/\s/g, '');
    else if (/電話/.test(title)) a.phone = clean(text, 40);
    else if (/入学/.test(title)) a.entry = clean(text, 40);
    else if (/コメント/.test(title)) a.comment = clean(text, 2000);
  });
  if (!a.email) {
    try { a.email = String(response.getRespondentEmail() || '').trim(); } catch (err) { /* 集めていない */ }
  }
  return a;
}

function partOf(label) {
  const t = String(label || '').normalize('NFKC').replace(/\s/g, '').replace(/一次/, '1次').replace(/二次/, '2次');
  return PARTS.filter(function (p) { return t.indexOf(p.label) >= 0; })[0] || null;
}

function handleAnswer(ss, a) {
  const sheet = ss.getSheetByName(SHEETS.people.name);
  const key = a.email.toLowerCase();
  const now = new Date();
  const late = now.getTime() > dateOf(setting(ss, '回答の締め切り'), 23, 59).getTime();
  const all = rows(sheet);
  const old = all.filter(function (r) { return String(r['メールアドレス']).toLowerCase() === key; })[0] || null;
  const before = {};
  PARTS.forEach(function (p) { before[p.key] = old ? String(old[p.label]) === YES : false; });
  const going = PARTS.filter(function (p) { return a.parts[p.key]; });

  // カレンダーの招待：変わった会だけ、足す・消す
  const invite = {};
  const notes = [];
  PARTS.forEach(function (p) {
    const was = old ? String(old['招待（' + p.label + '）']) === '招待ずみ' : false;
    invite[p.key] = was;
    if (a.parts[p.key] === was) return;
    try {
      setGuest(ss, p, a.email, a.parts[p.key]);
      invite[p.key] = a.parts[p.key];
    } catch (err) {
      notes.push(p.label + 'の招待を' + (a.parts[p.key] ? '送れませんでした' : '取り消せませんでした') + '（' + errText(err) + '）');
    }
  });

  // メール
  const changed = !!old && PARTS.some(function (p) { return before[p.key] !== a.parts[p.key]; });
  const kind = old && changed ? '出欠の変更' : going.length ? '参加の確認' : '不参加のお礼';
  const vars = varsOf(ss, a, before, !!old);
  let mail = '送った：' + kind;
  if (!(old && !changed && String(old['メール']).indexOf('送った') === 0)) { // 同じ内容の送りなおしには、メールを送らない
    try {
      sendText(ss, kind, a.email, vars);
    } catch (err) {
      mail = '送れなかった：' + kind;
      notes.push('メールを送れませんでした（' + errText(err) + '）。1 時間ごとに送りなおします');
    }
  } else {
    mail = old['メール'];
  }

  const total = going.reduce(function (s, p) { return s + fee(ss, p); }, 0);
  const rec = {
    'メールアドレス': a.email, 'お名前': a.name, '電話番号': a.phone, '入学年次': a.entry,
    '会費合計': total, 'コメント': a.comment, '最後の回答': stamp(now),
    '最初の回答': old ? old['最初の回答'] : stamp(now), '回答の回数': old ? (Number(old['回答の回数']) || 1) + 1 : 1,
    '締め切り後': late ? '締め切り後' : '', 'メール': mail, 'メモ': notes.join('／'),
  };
  PARTS.forEach(function (p) {
    rec[p.label] = a.parts[p.key] ? YES : '不参加';
    rec['招待（' + p.label + '）'] = invite[p.key] ? '招待ずみ' : '';
  });
  writeRow(sheet, old ? old._row : 0, rec);

  // 幹事への知らせ
  vars['締め切り後'] = late ? '【締め切り後】' : '';
  vars['一覧'] = ss.getUrl();
  try { sendText(ss, '幹事への知らせ', kanjiTo(ss), vars); } catch (err) { log(ss, '幹事への知らせを送れませんでした：' + errText(err)); }
  log(ss, (old ? '変更' : '回答') + '：' + a.name + '（' + vars['変更後'] + '）' + (notes.length ? '／' + notes.join('／') : ''));
  return { ok: true, kind: kind, going: going.map(function (p) { return p.label; }), notes: notes };
}

// メールの文に入れる値
function varsOf(ss, a, before, hadOld) {
  const going = PARTS.filter(function (p) { return a.parts[p.key]; });
  const list = function (m) {
    const g = PARTS.filter(function (p) { return m[p.key]; }).map(function (p) { return p.label; });
    return g.length ? g.join('・') : 'すべて不参加';
  };
  const total = going.reduce(function (s, p) { return s + fee(ss, p); }, 0);
  return {
    '名前': a.name || '（お名前なし）', 'メールアドレス': a.email, '入学年次': a.entry || '入学年次なし', 'コメント': a.comment || '（なし）',
    '参加する会': going.length ? going.map(function (p) { return '・' + p.label; }).join('\n') : 'すべて不参加',
    '会の案内': going.map(function (p) { return '◆ ' + p.label + '\n' + String(setting(ss, '案内：' + p.label) || p.guide); }).join('\n\n'),
    '会費合計': total.toLocaleString('ja-JP') + '円',
    '会費の払い方': total > 0 ? String(setting(ss, '会費の払い方') || '') : '',
    '締め切り': jpDate(dateOf(setting(ss, '回答の締め切り'), 23, 59)),
    '変更前': hadOld ? list(before) + ' ' : '（はじめての回答）',
    '変更後': list(a.parts),
  };
}

// ---- カレンダー ----------------------------------------------------------------

// 大会の日の、その名前の予定
function findEvent(ss, p) {
  const day = dateOf(setting(ss, '大会の日'), 0, 0);
  const end = new Date(day.getTime() + 24 * 3600 * 1000);
  const name = String(setting(ss, '予定の名前：' + p.label) || p.event).trim();
  return CalendarApp.getDefaultCalendar().getEvents(day, end).filter(function (ev) { return ev.getTitle().trim() === name; })[0] || null;
}

// ゲストに足す・消す。招待のメール（と取り消しのメール）は Google カレンダーが送る。ほかのゲストは見えないようにする
function setGuest(ss, p, email, on) {
  const ev = findEvent(ss, p);
  if (!ev) throw new Error('カレンダーに「' + (setting(ss, '予定の名前：' + p.label) || p.event) + '」の予定がありません');
  const id = String(ev.getId()).replace(/@google\.com$/, '');
  const cur = Calendar.Events.get('primary', id);
  const key = email.toLowerCase();
  const attendees = (cur.attendees || []).filter(function (x) { return String(x.email || '').toLowerCase() !== key; });
  if (on) attendees.push({ email: email });
  Calendar.Events.patch({ attendees: attendees, guestsCanSeeOtherGuests: false, guestsCanInviteOthers: false }, 'primary', id, { sendUpdates: 'all' });
}

// ---- 1 時間ごと：前日のお知らせ・送れなかったメールの送りなおし --------------------

function tick() {
  const ss = book(false);
  const sheet = ss.getSheetByName(SHEETS.people.name);
  const now = new Date();
  // 送れなかったメール
  rows(sheet).forEach(function (r) {
    const m = String(r['メール'] || '').match(/^送れなかった：(.+)$/);
    if (!m || !validEmail(r['メールアドレス'])) return;
    const a = personOf(r);
    try {
      sendText(ss, m[1], a.email, varsOf(ss, a, a.parts, false));
      setCell(sheet, r._row, 'メール', '送った：' + m[1]);
    } catch (err) { /* 次の 1 時間に */ }
  });
  // 前日のお知らせ（1 回だけ）
  if (String(setting(ss, '前日のお知らせを送った日時') || '').trim()) return;
  if (now.getTime() < dateOf(setting(ss, '前日のお知らせ'), 12, 0).getTime()) return;
  let n = 0;
  const fails = [];
  rows(sheet).forEach(function (r) {
    const a = personOf(r);
    if (!PARTS.some(function (p) { return a.parts[p.key]; }) || !validEmail(a.email)) return;
    try { sendText(ss, '前日のお知らせ', a.email, varsOf(ss, a, a.parts, false)); n++; } catch (err) { fails.push(a.name); }
  });
  setSetting(ss, '前日のお知らせを送った日時', stamp(now) + '（' + n + ' 人' + (fails.length ? '。送れなかった：' + fails.join('、') : '') + '）');
  log(ss, '前日のお知らせ：' + n + ' 人に送った' + (fails.length ? '。送れなかった：' + fails.join('、') : ''));
}

function personOf(r) {
  const a = { name: r['お名前'], email: String(r['メールアドレス'] || ''), entry: r['入学年次'], comment: r['コメント'], parts: {} };
  PARTS.forEach(function (p) { a.parts[p.key] = String(r[p.label]) === YES; });
  return a;
}

// ---- メール --------------------------------------------------------------------

function sendText(ss, kind, to, vars) {
  const t = rows(ss.getSheetByName(SHEETS.texts.name)).filter(function (r) { return String(r['種類']).trim() === kind; })[0];
  const def = TEXTS.filter(function (x) { return x[0] === kind; })[0];
  const subject = fill(t ? t['件名'] : def[1], vars);
  const body = fill(t ? t['本文'] : def[2], vars).replace(/\n{3,}/g, '\n\n');
  MailApp.sendEmail({ to: to, subject: subject, body: body, name: String(setting(ss, '差出人の名前') || '夕照寮OB会') });
}

function fill(text, vars) {
  return String(text || '').replace(/\{([^{}]+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m; });
}

function notifyKanji(ss, subject, body) {
  try { MailApp.sendEmail({ to: kanjiTo(ss), subject: subject, body: body, name: String(setting(ss, '差出人の名前') || '夕照寮OB会') }); } catch (err) { log(ss, '幹事への知らせを送れませんでした：' + errText(err)); }
}

function kanjiTo(ss) {
  const to = String(setting(ss, '幹事への知らせ先') || '').trim();
  return to || Session.getEffectiveUser().getEmail();
}

// ---- 小物 ----------------------------------------------------------------------

function rows(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const v = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const head = v[0].map(function (h) { return String(h).trim(); });
  return v.slice(1).map(function (row, i) {
    const o = { _row: i + 2 };
    head.forEach(function (h, j) { if (h) o[h] = row[j]; });
    return o;
  });
}

function writeRow(sheet, at, rec) {
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  const prev = at ? sheet.getRange(at, 1, 1, head.length).getValues()[0] : [];
  const row = head.map(function (h, j) { return Object.prototype.hasOwnProperty.call(rec, h) ? cell(rec[h]) : (prev[j] == null ? '' : prev[j]); });
  if (at) sheet.getRange(at, 1, 1, head.length).setValues([row]);
  else sheet.appendRow(row);
}

function setCell(sheet, at, name, value) {
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  const c = head.indexOf(name);
  if (c >= 0) sheet.getRange(at, c + 1).setValue(cell(value));
}

// 式として動かないように（= + - @ で始まる文字は ' を付ける）
function cell(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function setting(ss, key) {
  const r = rows(ss.getSheetByName(SHEETS.settings.name)).filter(function (x) { return String(x['項目']).trim() === key; })[0];
  if (r) return r['値'];
  const d = SETTINGS.filter(function (s) { return s[0] === key; })[0];
  return d ? d[1] : '';
}

function setSetting(ss, key, value) {
  const sh = ss.getSheetByName(SHEETS.settings.name);
  const r = rows(sh).filter(function (x) { return String(x['項目']).trim() === key; })[0];
  if (r) sh.getRange(r._row, 2).setValue(value);
  else sh.appendRow([key, value, '']);
}

function fee(ss, p) {
  const n = Number(String(setting(ss, '会費：' + p.label)).normalize('NFKC').replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : p.fee;
}

// 「2026/11/14 23:59」「2026-11-14」や、シートで日付に化けた値 → Date（日本時間）。時刻がなければ h:m
function dateOf(v, h, m) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    const hasTime = v.getHours() || v.getMinutes();
    return hasTime ? v : new Date(v.getFullYear(), v.getMonth(), v.getDate(), h, m);
  }
  const t = String(v == null ? '' : v).normalize('NFKC');
  const x = t.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (!x) return new Date(8640000000000000);
  return new Date(Number(x[1]), Number(x[2]) - 1, Number(x[3]), x[4] != null ? Number(x[4]) : h, x[5] != null ? Number(x[5]) : m);
}

function jpDate(d) {
  const w = '日月火水木金土'.charAt(d.getDay());
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + w + '）' + (d.getHours() || d.getMinutes() ? ' ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) : '');
}

function stamp(d) {
  const z = function (n) { return ('0' + n).slice(-2); };
  return d.getFullYear() + '/' + z(d.getMonth() + 1) + '/' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
}

function validEmail(s) {
  return /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]+$/.test(String(s || ''));
}

function clean(v, n) {
  return Array.from(String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim()).slice(0, n).join('');
}

function errText(err) {
  return clean((err && err.message) || err || 'エラー', 120);
}

function log(ss, text) {
  try { ss.getSheetByName(SHEETS.log.name).appendRow([stamp(new Date()), clean(text, 1000)]); } catch (err) { Logger.log(text); }
}
