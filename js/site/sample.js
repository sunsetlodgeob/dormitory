/*
 * 夕照寮OB会サイト ― サンプルデータ（すべて架空）
 * js/site/config.js の GAS_URL が空のときだけ使います。実在の人の名前は入れないこと。
 */
(function () {
  'use strict';
  const OB = (window.OB = window.OB || {});
  // 名字は寮のまわりの地名、名前は番号。実在の人と重ならないように、わざと作り物っぽくしている
  const FAMILY = ['夕照', '六浦', '金沢', '八景', '平潟', '瀬戸', '野島', '称名', '侍従', '釜利谷', '富岡', '能見'];
  const GIVEN = ['一郎', '二郎', '三郎', '四郎', '五郎', '六郎', '七郎', '八郎', '九郎', '十郎'];
  const members = [];
  let k = 0;
  for (let year = 2000; year <= 2009; year++) {
    const n = 4 + ((year * 7) % 4);
    for (let i = 0; i < n; i++) {
      members.push({
        name: FAMILY[k % FAMILY.length] + ' ' + GIVEN[Math.floor(k / FAMILY.length) % GIVEN.length],
        entryYear: year,
        gradYear: year + 3 + (i % 3 === 0 ? 1 : 0), // 卒業した年度（4年で卒業なら 入学年度 + 3。3人に1人は留年）
      });
      k++;
    }
  }
  // 部屋割り：入学した年から 2 年ずつ同じ部屋にいたことにする
  const ROOMS = ['301', '302', '303', '304', '305', '306', '307', '309', '310', '311', '312', '313',
    '201', '202', '203', '205', '206', '208', '210', '211', '212', '214', '216', '217', '101'];
  const rooms = [];
  members.forEach((m, i) => {
    const room = ROOMS[(i * 7) % ROOMS.length];
    for (let y = m.entryYear; y < m.entryYear + 2 && y <= 2009; y++) rooms.push({ year: y, room, name: m.name });
  });
  const events = [
    { id: 's1', year: 2000, month: 4, title: '新歓コンパ、食堂の机が足りなくなる', body: '新入生が例年の倍。勉強部屋の机まで総動員した。', tags: ['新歓'] },
    { id: 's2', year: 2001, month: 11, title: '学祭でホストクラブ', body: '寮生総出でホストになり、ジュースとお菓子でおもてなし。指名は先輩に集中した。', tags: ['学祭'] },
    { id: 's3', year: 2003, month: 2, title: '節分の豆まき', body: '豆の掃除に一週間かかった。', tags: ['節分'] },
    { id: 's4', year: 2004, month: null, title: '屋上でBBQ', body: '夕焼けがきれいだった。', tags: ['屋上'] },
    { id: 's5', year: 2006, month: 3, title: '追いコン', body: '卒業生を送り出す。毎年なぜか泣く人が出る。', tags: ['追いコン'] },
    { id: 's6', year: 2008, month: 7, title: '全日本コール選手権', body: '寮生チームが優勝。トロフィーは食堂へ。', tags: ['コール'] },
    { id: 's7', year: null, month: null, title: '年度不明の事件', body: '誰も年度を覚えていない。', tags: [] },
  ];
  // D-1選手権の歴代記録（名前は上の名簿のサンプルから）
  const d1 = [
    { year: 2003, winner: ['金沢 二郎'], second: ['六浦 五郎'], members: ['金沢 二郎', '六浦 五郎', '八景 一郎', '瀬戸 三郎'], host: '夕照 四郎', referee: '夕照 四郎', kuroko: '平潟 一郎', note: '第1回。ルールはその場で決めた。' },
    { year: 2004, winner: ['野島 一郎'], second: ['金沢 二郎'], members: ['野島 一郎', '金沢 二郎', '称名 一郎', '侍従 一郎', '釜利谷 一郎'], host: '六浦 五郎', referee: '富岡 一郎', kuroko: '能見 一郎', note: '' },
    { year: 2005, winner: ['称名 一郎', '侍従 一郎'], second: [], members: ['称名 一郎', '侍従 一郎', '夕照 二郎', '六浦 二郎'], host: '野島 一郎', referee: '野島 一郎', kuroko: '', note: '決勝が引き分けで、優勝が2人。' },
    { year: 2006, winner: ['夕照 二郎'], second: ['八景 二郎'], members: ['夕照 二郎', '八景 二郎', '平潟 二郎', '瀬戸 二郎', '野島 二郎', '称名 二郎'], host: '称名 一郎', referee: '金沢 二郎', kuroko: '侍従 二郎', note: '黒子が目立ちすぎて、来年から全身黒に。' },
    { year: 2007, winner: [], second: [], members: ['釜利谷 二郎', '富岡 二郎'], host: '夕照 二郎', referee: '', kuroko: '', note: '決着がつかず、優勝なし。' },
    { year: 2008, winner: ['能見 二郎'], second: ['釜利谷 二郎'], members: ['能見 二郎', '釜利谷 二郎', '夕照 三郎', '六浦 三郎', '金沢 三郎'], host: '八景 二郎', referee: '富岡 二郎', kuroko: '平潟 三郎', note: '' },
  ];
  OB.SAMPLE = { members, rooms, events, d1, updated: '2026-10-24T00:00:00+09:00' };
})();
