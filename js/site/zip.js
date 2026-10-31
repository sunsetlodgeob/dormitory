/*
 * 夕照寮OB会サイト ― ZIP を開く小さな道具（写真館の「写真を送る」で使う。外のライブラリは使わない）
 *
 *   const list = await OB.zip.entries(file);   // file は <input type="file"> などの File（Blob）
 *   for (const en of list) {
 *     en.name;            // ZIP の中の名前（フォルダも付く。例：'2005/新歓/IMG_0001.JPG'）
 *     en.size;            // ほどいたあとの大きさ（バイト）
 *     const bytes = await en.read();   // Uint8Array（そのとき、その 1 個の分だけ読む）
 *   }
 *
 *  - ZIP 全体を一度に読みこまない。おわりの目次（End Of Central Directory）と中央の目次だけ先に読み、
 *    中身は read() のときに File.slice で 1 個ずつ読む。
 *  - 入れ方は「そのまま（0）」と「deflate（8）」だけ。deflate は DecompressionStream('deflate-raw') でほどく。
 *  - 名前は、フラグの 11 番目が立っていれば UTF-8。立っていなければ、UTF-8 として正しく読めて日本語などを含むなら UTF-8
 *    （Mac で作った ZIP）、そうでなければ Shift_JIS（Windows で作った ZIP）、だめなら UTF-8 で読む。
 *  - フォルダ、__MACOSX/、「.」で始まるファイル（.DS_Store など）は、一覧に入れない。
 *  - 失敗したときは Error に code を付ける：
 *      'zip_not'（ZIP ではない・こわれている）・'zip64'（4GB をこえるような大きい ZIP。開けない）・
 *      'zip_encrypted'（パスワード付き）・'zip_broken'（中身がこわれている）・
 *      'zip_method'（そのまま・deflate 以外の入れ方）・'zip_browser'（このブラウザではほどけない）
 */
(function () {
  'use strict';
  const OB = (window.OB = window.OB || {});

  const SIG_EOCD = 0x06054b50;
  const SIG_EOCD64_LOC = 0x07064b50;
  const SIG_CEN = 0x02014b50;
  const SIG_LOC = 0x04034b50;
  const MAX_COMMENT = 0xffff;

  const fail = (code, text) => Object.assign(new Error(text || 'ZIP を開けませんでした'), { code });
  async function bytesAt(file, start, end) {
    return new Uint8Array(await file.slice(start, end).arrayBuffer());
  }

  // ── 名前の文字 ──
  function decoder(label, fatal) {
    try { return new TextDecoder(label, { fatal: !!fatal }); } catch (e) { return null; }
  }
  const utf8Fatal = decoder('utf-8', true);
  const utf8 = decoder('utf-8', false);
  const sjisFatal = decoder('shift_jis', true);
  function decodeName(b, isUtf8) {
    if (isUtf8) return utf8.decode(b);
    let ascii = true;
    for (let i = 0; i < b.length; i++) if (b[i] > 0x7f) { ascii = false; break; }
    if (ascii) return utf8.decode(b);
    try { return utf8Fatal.decode(b); } catch (e) { /* UTF-8 ではない */ }
    if (sjisFatal) {
      try { return sjisFatal.decode(b); } catch (e) { /* Shift_JIS でもない */ }
    }
    return utf8.decode(b);
  }

  // 一覧に入れないもの：フォルダ・__MACOSX/・「.」で始まるもの（どの階層でも）
  function skipName(name) {
    if (!name || /\/$/.test(name)) return true;
    const parts = name.split('/');
    if (parts.some((p) => p === '__MACOSX' || p.charAt(0) === '.')) return true;
    return false;
  }

  // ── おわりの目次をさがす（うしろの 64KB + 22 バイトだけ読む） ──
  async function findEnd(file) {
    const size = file.size;
    if (size < 22) throw fail('zip_not');
    const from = Math.max(0, size - (MAX_COMMENT + 22));
    const tail = await bytesAt(file, from, size);
    const v = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    for (let i = tail.length - 22; i >= 0; i--) {
      if (v.getUint32(i, true) !== SIG_EOCD) continue;
      const commentLen = v.getUint16(i + 20, true);
      if (i + 22 + commentLen > tail.length) continue; // コメントの長さが合わない（たまたま同じ並びだった）
      const end = {
        pos: from + i,
        disk: v.getUint16(i + 4, true),
        cdDisk: v.getUint16(i + 6, true),
        count: v.getUint16(i + 10, true),
        cdSize: v.getUint32(i + 12, true),
        cdOffset: v.getUint32(i + 16, true),
        zip64: i >= 20 && v.getUint32(i - 20, true) === SIG_EOCD64_LOC,
      };
      if (end.zip64 || end.count === 0xffff || end.cdSize === 0xffffffff || end.cdOffset === 0xffffffff) throw fail('zip64');
      if (end.disk !== 0 || end.cdDisk !== 0) throw fail('zip_not'); // いくつにも分けた ZIP
      return end;
    }
    throw fail('zip_not');
  }

  // ── 中身を 1 個読む ──
  async function readEntry(file, en) {
    const head = await bytesAt(file, en.offset, en.offset + 30);
    const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
    if (head.length < 30 || hv.getUint32(0, true) !== SIG_LOC) throw fail('zip_broken');
    const start = en.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
    const end = start + en.csize;
    if (end > file.size) throw fail('zip_broken');
    if (en.method === 0) {
      if (en.csize !== en.size) throw fail('zip_broken');
      return bytesAt(file, start, end);
    }
    if (en.method !== 8) throw fail('zip_method');
    if (typeof DecompressionStream !== 'function') throw fail('zip_browser');
    let ds;
    try { ds = new DecompressionStream('deflate-raw'); } catch (e) { throw fail('zip_browser'); }
    let out;
    try {
      out = new Uint8Array(await new Response(file.slice(start, end).stream().pipeThrough(ds)).arrayBuffer());
    } catch (e) {
      throw fail('zip_broken');
    }
    if (out.length !== en.size) throw fail('zip_broken');
    return out;
  }

  // ── 一覧 ──
  async function entries(file) {
    if (!file || typeof file.slice !== 'function') throw fail('zip_not');
    const end = await findEnd(file);
    // ZIP の前に何か付いている（自己解凍など）ときは、目次の位置がずれる。そのずれを足す
    const shift = end.pos - end.cdSize - end.cdOffset;
    if (shift < 0) throw fail('zip_not');
    const cd = await bytesAt(file, end.cdOffset + shift, end.cdOffset + shift + end.cdSize);
    const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
    const out = [];
    let p = 0;
    for (let n = 0; n < end.count; n++) {
      if (p + 46 > cd.length || v.getUint32(p, true) !== SIG_CEN) throw fail('zip_not');
      const flags = v.getUint16(p + 8, true);
      const method = v.getUint16(p + 10, true);
      const csize = v.getUint32(p + 20, true);
      const size = v.getUint32(p + 24, true);
      const nameLen = v.getUint16(p + 28, true);
      const extraLen = v.getUint16(p + 30, true);
      const commentLen = v.getUint16(p + 32, true);
      const offset = v.getUint32(p + 42, true);
      if (p + 46 + nameLen > cd.length) throw fail('zip_not');
      const name = decodeName(cd.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0).replace(/\\/g, '/');
      p += 46 + nameLen + extraLen + commentLen;
      if (skipName(name)) continue;
      if (csize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) throw fail('zip64');
      if (flags & 0x1) throw fail('zip_encrypted');
      const en = { name, size, csize, method, offset: offset + shift };
      out.push({ name, size, read: () => readEntry(file, en) });
    }
    return out;
  }

  OB.zip = { entries };
})();
