// Test helper: builds small zip files at runtime, with no tools and no downloads.
// Synthetic data only. Because we write the bytes ourselves we can also build the
// awkward zips a real tool refuses to make: a name with "../", a link entry, a
// password flag, or a size that lies.
import { deflateRawSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Build a zip (as a Buffer).
 * entries: [{ name, data?, deflate?, encrypted?, symlink?, declaredSize? }]
 *   - a name ending in "/" is a folder entry
 *   - deflate: compress the data (default: stored as it is)
 *   - encrypted: sets the "password protected" flag (the data is not really encrypted)
 *   - symlink: marks the entry as a link (its data is the link target)
 *   - declaredSize: the size written in the headers, when it should differ from the real one
 *   - zip64Size: write this (possibly huge) size as a "zip64" size in the entry list, for size checks only
 *     (the zip cannot be unpacked afterwards, which is fine for a test that expects it to be refused)
 * options: { comment, zip64 }
 *   - comment: text stored after the end record (the reader has to look backwards for the end record)
 *   - zip64: write the "zip64" end records (used by zips with very many or very large files)
 */
export function buildZip(entries, { comment = '', zip64 = false } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const raw = Buffer.from(e.data ?? '');
    const isDir = e.name.endsWith('/');
    const body = e.deflate && !isDir ? deflateRawSync(raw) : raw;
    const method = e.deflate && !isDir ? 8 : 0;
    const flags = 0x0800 | (e.encrypted ? 1 : 0);
    const usize = e.declaredSize ?? raw.length;
    const crc = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10); // time
    lh.writeUInt16LE(0x5a21, 12); // date (2025-01-01)
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(usize, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, body);

    const extra = e.zip64Size === undefined ? Buffer.alloc(0) : Buffer.alloc(12);
    if (e.zip64Size !== undefined) {
      extra.writeUInt16LE(1, 0);
      extra.writeUInt16LE(8, 2);
      extra.writeBigUInt64LE(BigInt(e.zip64Size), 4);
    }
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(e.symlink ? (3 << 8) | 20 : 20, 4); // made by: Unix (3) when a mode is stored
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x5a21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(e.zip64Size === undefined ? usize : 0xffffffff, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(extra.length, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    const mode = e.symlink ? 0o120777 : isDir ? 0o040755 : 0o100644;
    ch.writeUInt32LE(((mode << 16) >>> 0), 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name, extra);

    offset += lh.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const note = Buffer.from(comment, 'utf8');
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(zip64 ? 0xffff : entries.length, 8);
  eocd.writeUInt16LE(zip64 ? 0xffff : entries.length, 10);
  eocd.writeUInt32LE(zip64 ? 0xffffffff : cd.length, 12);
  eocd.writeUInt32LE(zip64 ? 0xffffffff : offset, 16);
  eocd.writeUInt16LE(note.length, 20);
  const parts = [...locals, cd];
  if (zip64) {
    const end64 = Buffer.alloc(56);
    end64.writeUInt32LE(0x06064b50, 0);
    end64.writeBigUInt64LE(44n, 4);
    end64.writeUInt16LE(45, 12);
    end64.writeUInt16LE(45, 14);
    end64.writeBigUInt64LE(BigInt(entries.length), 24);
    end64.writeBigUInt64LE(BigInt(entries.length), 32);
    end64.writeBigUInt64LE(BigInt(cd.length), 40);
    end64.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(offset + cd.length), 8);
    locator.writeUInt32LE(1, 16);
    parts.push(end64, locator);
  }
  parts.push(eocd, note);
  return Buffer.concat(parts);
}
