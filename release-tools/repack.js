// repack.js — 以「全部 stored（不壓縮）」重打包 APK，並替換指定 asset
//
// 為什麼需要自己寫：
//   Android 要求 targetSdk >= 30 的 APK 中，resources.arsc 必須以 stored 存放且 4-byte 對齊。
//   .NET 的 ZipArchive 即使指定 NoCompression 仍會寫成 deflate（實測），所以改用這個腳本。
//
// 用法：
//   node repack.js <來源.apk> <輸出.apk> <替換檔案資料夾>
//   資料夾內的檔案會以 "assets/<檔名>" 覆蓋對應項目（找不到就不動）。

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const [, , srcApk, outApk, patchDir] = process.argv;
if (!srcApk || !outApk) {
  console.error('用法：node repack.js <來源.apk> <輸出.apk> [替換資料夾]');
  process.exit(1);
}

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

const b = fs.readFileSync(srcApk);
let eocd = -1;
for (let i = b.length - 22; i >= 0; i--) {
  if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) throw new Error('找不到 EOCD，這不是有效的 ZIP/APK');

const count = b.readUInt16LE(eocd + 10);
const cdOff = b.readUInt32LE(eocd + 16);
let p = cdOff;
const entries = [];
for (let i = 0; i < count; i++) {
  if (b.readUInt32LE(p) !== 0x02014b50) break;
  entries.push({
    name: b.toString('utf8', p + 46, p + 46 + b.readUInt16LE(p + 28)),
    flags: b.readUInt16LE(p + 8),
    method: b.readUInt16LE(p + 10),
    time: b.readUInt16LE(p + 12),
    date: b.readUInt16LE(p + 14),
    csize: b.readUInt32LE(p + 20),
    usize: b.readUInt32LE(p + 24),
    extAttr: b.readUInt32LE(p + 38),
    lho: b.readUInt32LE(p + 42),
  });
  p += 46 + b.readUInt16LE(p + 28) + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
}

const patches = new Map();
if (patchDir && fs.existsSync(patchDir)) {
  for (const f of fs.readdirSync(patchDir)) {
    const full = path.join(patchDir, f);
    if (!fs.statSync(full).isFile()) continue;
    const target = 'assets/' + f;
    if (entries.some((e) => e.name === target)) patches.set(target, fs.readFileSync(full));
  }
}

function dataOf(e) {
  const lho = e.lho;
  const nlen = b.readUInt16LE(lho + 26);
  const elen = b.readUInt16LE(lho + 28);
  const start = lho + 30 + nlen + elen;
  const raw = b.subarray(start, start + e.csize);
  return e.method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
}

const chunks = [];
const central = [];
let offset = 0;

for (const e of entries) {
  // 簽章檔由 apksigner 重新產生
  if (/^META-INF\/(MANIFEST\.MF|[^/]+\.(SF|RSA|DSA|EC))$/.test(e.name)) continue;

  const data = patches.get(e.name) || dataOf(e);
  const crc = crc32(data);
  const nameBuf = Buffer.from(e.name, 'utf8');

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0, 6);
  lh.writeUInt16LE(0, 8);            // stored
  lh.writeUInt16LE(e.time, 10);
  lh.writeUInt16LE(e.date, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(data.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);
  chunks.push(lh, nameBuf, data);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(0, 10);           // stored
  cd.writeUInt16LE(e.time, 12);
  cd.writeUInt16LE(e.date, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(data.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE(e.extAttr, 38);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, nameBuf);

  offset += 30 + nameBuf.length + data.length;
}

const cdBuf = Buffer.concat(central);
const eocd2 = Buffer.alloc(22);
eocd2.writeUInt32LE(0x06054b50, 0);
eocd2.writeUInt16LE(central.length / 2, 8);
eocd2.writeUInt16LE(central.length / 2, 10);
eocd2.writeUInt32LE(cdBuf.length, 12);
eocd2.writeUInt32LE(offset, 16);

fs.writeFileSync(outApk, Buffer.concat([...chunks, cdBuf, eocd2]));
console.log(`已輸出：${outApk}（${fs.statSync(outApk).size} bytes，替換 ${patches.size} 個 asset）`);
