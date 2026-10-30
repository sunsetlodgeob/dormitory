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

  // 名簿・部屋割り・D-1選手権の記録（誰でも見られる）
  async function loadPublic() {
    if (!isLive()) {
      const s = OB.SAMPLE;
      return { members: s.members.slice(), rooms: s.rooms.slice(), d1: (s.d1 || []).slice(), updated: s.updated, sample: true };
    }
    const res = await fetch(cfg().GAS_URL + '?type=public', { redirect: 'follow' });
    if (!res.ok) throw new Error('通信に失敗しました（' + res.status + '）');
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || 'データを読み込めませんでした');
    return { members: d.members || [], rooms: d.rooms || [], d1: d.d1 || [], updated: d.updated || '', sample: false };
  }

  // ログインが要るもの（年表・申請・写真館）は、どれも Apps Script に POST する。
  // text/plain にすると、事前の CORS 確認（preflight）なしで Apps Script に送れる。
  // 失敗したときは Error に code（Apps Script の error の文字。通信できなかったときは 'network'）を付ける
  async function post(body, failText) {
    let res;
    try {
      res = await fetch(cfg().GAS_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw Object.assign(new Error('通信に失敗しました'), { code: 'network' });
    }
    if (!res.ok) throw Object.assign(new Error('通信に失敗しました（' + res.status + '）'), { code: 'network' });
    let d;
    try {
      d = await res.json();
    } catch (e) {
      throw Object.assign(new Error('返事を読めませんでした'), { code: 'network' });
    }
    if (!d || !d.ok) throw Object.assign(new Error((d && d.error) || failText), { code: (d && d.error) || 'unknown' });
    return d;
  }

  // 年表（Google でログインした、見る権限のある人だけ）
  // idToken は Google Identity Services のログインで受け取った credential。
  // 失敗したときは Error に code（'not_member' | 'invalid_token' | 'not_configured' | 'network'）を付ける
  async function loadTimeline(idToken) {
    if (!isLive()) return { events: OB.SAMPLE.events.slice(), sample: true };
    const d = await post({ type: 'timeline', idToken }, '読み込めませんでした');
    return { events: d.events || [], sample: false };
  }

  // 年表を見る権限の申請（ログインして not_member だった人）。info：{ name, entry, note }
  // 返事：{ ok: true }（受けつけた）・{ ok: true, again: true }（前にも申請した）・{ ok: true, already: true }（もう見られる）
  // 失敗したときは Error に code（'invalid_token' | 'bad_request' | 'too_many' | 'not_configured' | 'network'）
  async function requestAccess(idToken, info) {
    return post(Object.assign({ type: 'request', idToken }, info || {}), '送れませんでした');
  }

  // ── 写真館（年表と同じく、見る権限のある人だけ） ──
  // デモ（GAS_URL が空）では、少し待ってからサンプルを返す（読み込み中の見た目も確かめられるように）
  const demoWait = () => new Promise((r) => setTimeout(r, 120));

  // 写真の一覧：{ photos: [{ id, year, date, w, h }], download, sample }
  // 失敗したときの code は年表と同じ（'not_member' | 'invalid_token' | 'not_configured' | 'bad_request' | 'server_error' | 'network'）
  async function loadPhotos(idToken) {
    if (!isLive()) return { photos: OB.SAMPLE.photos.map((p) => Object.assign({}, p)), download: true, sample: true };
    const d = await post({ type: 'photos', idToken }, '読み込めませんでした');
    return { photos: Array.isArray(d.photos) ? d.photos : [], download: d.download === true, sample: false };
  }

  // 小さくした写真：{ images: { id: 'data:image/jpeg;base64,…' } }。読めなかった id は入っていない。
  // ids は 1 回に 24 まで。size は 400（一覧）か 1600（大きく見る）
  async function loadThumbs(idToken, ids, size) {
    ids = (ids || []).slice(0, 24);
    if (!isLive()) {
      await demoWait();
      const images = {};
      for (const id of ids) {
        const u = OB.SAMPLE.photoImage(id, size);
        if (u) images[id] = u;
      }
      return { images, sample: true };
    }
    const d = await post({ type: 'thumbs', idToken, ids, size }, '読み込めませんでした');
    return { images: d.images && typeof d.images === 'object' ? d.images : {}, sample: false };
  }

  // 写真のもとのファイル（ダウンロード用）：{ name, mime, data（base64） }。
  // ダウンロードが止めてあるときは code 'not_allowed'
  async function loadPhotoFile(idToken, id) {
    if (!isLive()) {
      await demoWait();
      const u = OB.SAMPLE.photoImage(id, 1600);
      if (!u) throw Object.assign(new Error('ありません'), { code: 'bad_request' });
      const bytes = new TextEncoder().encode(decodeURIComponent(u.slice(u.indexOf(',') + 1)));
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return { name: id + '.svg', mime: 'image/svg+xml', data: btoa(bin), sample: true };
    }
    const d = await post({ type: 'photo', idToken, id }, '読み込めませんでした');
    return { name: String(d.name || ''), mime: String(d.mime || ''), data: String(d.data || ''), sample: false };
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

  OB.data = { isLive, loadPublic, loadTimeline, requestAccess, loadPhotos, loadThumbs, loadPhotoFile, roomsByYear, ROOM_NUMBERS };
})();
