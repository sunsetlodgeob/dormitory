/*
 * 夕照寮OB会サイト ― データの読み込み
 * 中身の形は docs/site/ARCH.md の「データの形」を参照。
 * 先に js/site/config.js と js/site/sample.js を読み込んでおくこと。
 */
(function () {
  'use strict';
  const OB = (window.OB = window.OB || {});
  const cfg = () => window.OB_CONFIG || {};

  function isLive() {
    return !!cfg().GAS_URL;
  }

  // 名簿・部屋割り（誰でも見られる）
  async function loadPublic() {
    if (!isLive()) {
      const s = OB.SAMPLE;
      return { members: s.members.slice(), rooms: s.rooms.slice(), updated: s.updated, sample: true };
    }
    const res = await fetch(cfg().GAS_URL + '?type=public', { redirect: 'follow' });
    if (!res.ok) throw new Error('通信に失敗しました（' + res.status + '）');
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || 'データを読み込めませんでした');
    return { members: d.members || [], rooms: d.rooms || [], updated: d.updated || '', sample: false };
  }

  // 年表（Google でログインした、見る権限のある人だけ）
  // idToken は Google Identity Services のログインで受け取った credential。
  // 失敗したときは Error に code（'not_member' | 'invalid_token' | 'not_configured' | 'network'）を付ける
  async function loadTimeline(idToken) {
    if (!isLive()) return { events: OB.SAMPLE.events.slice(), sample: true };
    let res;
    try {
      res = await fetch(cfg().GAS_URL, {
        method: 'POST',
        redirect: 'follow',
        // text/plain にすると、事前の CORS 確認（preflight）なしで Apps Script に送れる
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'timeline', idToken }),
      });
    } catch (e) {
      throw Object.assign(new Error('通信に失敗しました'), { code: 'network' });
    }
    if (!res.ok) throw Object.assign(new Error('通信に失敗しました（' + res.status + '）'), { code: 'network' });
    const d = await res.json();
    if (!d.ok) throw Object.assign(new Error(d.error || '読み込めませんでした'), { code: d.error || 'unknown' });
    return { events: d.events || [], sample: false };
  }

  // 部屋番号の一覧（1階の 101、2・3階の 01〜17）
  const ROOM_NUMBERS = ['101'];
  for (const f of [2, 3]) for (let n = 1; n <= 17; n++) ROOM_NUMBERS.push(String(f * 100 + n));

  // rooms: [{ year, room, name }] を 年度 → 部屋 → 名前の一覧 の Map にまとめる（部屋割り・寮さんぽで使う）
  // 全角の数字や「305号室」もそろえ、寮にない部屋番号は捨てる（名前の字は変えない）
  function roomsByYear(rooms) {
    const by = new Map();
    const str = (v) => String(v == null ? '' : v).trim();
    for (const r of rooms || []) {
      const year = Number(str(r && r.year).normalize('NFKC'));
      const room = str(r && r.room).normalize('NFKC').replace(/[^0-9]/g, '');
      const name = str(r && r.name);
      if (!Number.isInteger(year) || ROOM_NUMBERS.indexOf(room) < 0 || !name) continue;
      if (!by.has(year)) by.set(year, new Map());
      const m = by.get(year);
      if (!m.has(room)) m.set(room, []);
      if (m.get(room).indexOf(name) < 0) m.get(room).push(name);
    }
    return by;
  }

  OB.data = { isLive, loadPublic, loadTimeline, roomsByYear, ROOM_NUMBERS };
})();
