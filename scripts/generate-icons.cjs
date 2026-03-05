const { writeFileSync, mkdirSync } = require('fs');
const { deflateSync } = require('zlib');

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function createPNG(size, maskable) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const pad = maskable ? Math.floor(size * 0.1) : 0;
  const raw = [];
  const cx = size / 2, cy = size / 2, radius = (size / 2) - pad;
  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (r < radius * 0.85) raw.push(0, 188, 212);
      else raw.push(18, 18, 18);
    }
  }
  const compressed = deflateSync(Buffer.from(raw));
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
[192, 512].forEach((s) => {
  writeFileSync(`public/icons/icon-${s}.png`, createPNG(s, false));
  writeFileSync(`public/icons/icon-maskable-${s}.png`, createPNG(s, true));
  console.log(`Generated ${s}x${s} icons`);
});
console.log('Done!');
