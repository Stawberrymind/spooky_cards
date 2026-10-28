// Draws assets/social.png, the 1200x630 picture shown when the game's link is
// shared (Discord, WhatsApp, X...). Pixel art only: the pumpkin sprite, the
// card backs, and a tiny 5x7 font. Run: node scripts/social-image.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { BACKS } from '../src/ui/art.js';

const W = 1200;
const H = 630;
const img = Buffer.alloc(W * H * 3);

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function rect(x, y, w, h, rgb) {
  for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) img.set(rgb, (yy * W + xx) * 3);
  }
}

// Background: banded radial glow, like the in-game swirl at rest.
const BANDS = ['#050005', '#0b0310', '#120518', '#1a0a22', '#22102b'].map(hex);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - W / 2) / W, (y - H * 0.45) / H);
    img.set(BANDS[Math.max(0, Math.min(4, 4 - Math.floor(d * 7)))], (y * W + x) * 3);
  }
}

// ---- the pumpkin, decoded straight from the game's PNG -------------------------
function decodePNG(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const name = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') [width, height, type] = [data.readUInt32BE(0), data.readUInt32BE(4), data[9]];
    if (name === 'PLTE') palette = data;
    if (name === 'tRNS') trns = data;
    if (name === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = { 6: 4, 2: 3, 3: 1 }[type];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, pr][filter]) & 255;
    }
    line.copy(prev);
    for (let x = 0; x < width; x++) {
      let rgba;
      if (type === 6) rgba = line.subarray(x * 4, x * 4 + 4);
      else if (type === 2) rgba = [...line.subarray(x * 3, x * 3 + 3), 255];
      else {
        const k = line[x];
        rgba = [palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], trns && k < trns.length ? trns[k] : 255];
      }
      out.set(rgba, (y * width + x) * 4);
    }
  }
  return { width, height, data: out };
}

function sprite({ width, height, data }, x0, y0, scale) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 127) rect(x0 + x * scale, y0 + y * scale, scale, scale, [data[i], data[i + 1], data[i + 2]]);
    }
  }
}

function back(id, x0, y0, scale) {
  const { rows, colors } = BACKS[id];
  rect(x0 + scale, y0 + scale * 13, scale * 9, scale, [0, 0, 0]); // drop shadow
  rows.forEach((row, y) => [...row].forEach((ch, x) => rect(x0 + x * scale, y0 + y * scale, scale, scale, hex(colors[ch]))));
}

// ---- 5x7 pixel font ------------------------------------------------------------
const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

function text(str, cy, scale, rgb, shadow) {
  const width = str.length * 6 * scale - scale;
  let x = Math.round((W - width) / 2);
  const y = Math.round(cy - 3.5 * scale);
  for (const ch of str) {
    FONT[ch].forEach((row, ry) => [...row].forEach((bit, rx) => {
      if (bit !== '#') return;
      if (shadow) rect(x + rx * scale, y + ry * scale + Math.ceil(scale / 2), scale, scale, shadow);
      rect(x + rx * scale, y + ry * scale, scale, scale, rgb);
    }));
    x += 6 * scale;
  }
}

// ---- compose ---------------------------------------------------------------------
text('SPOOOOKY', 115, 16, hex('#fff7f7'), hex('#a80000'));
const pumpkin = decodePNG(readFileSync(new URL('../assets/pumpkin/sprite_0.png', import.meta.url)));
const cardScale = 11;
const cardW = 9 * cardScale;
// Two card backs either side of the pumpkin, dipping away from the middle.
const ids = ['skull', 'web', 'eye', 'moth'];
const gap = 26;
const pumpkinW = 16 * 14;
const rowW = ids.length * cardW + ids.length * gap + pumpkinW;
let cx = Math.round((W - rowW) / 2);
ids.forEach((id, i) => {
  if (i === 2) {
    sprite(pumpkin, cx, 262, 14);
    cx += pumpkinW + gap;
  }
  back(id, cx, 260 + (i === 0 || i === 3 ? 18 : 0), cardScale);
  cx += cardW + gap;
});
text('SOLITAIRE · POKER · BLACKJACK', 545, 6, hex('#f15900'), hex('#3e0000'));

// ---- encode ----------------------------------------------------------------------
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const rows = Buffer.alloc(H * (W * 3 + 1));
for (let y = 0; y < H; y++) img.copy(rows, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(rows, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('../assets/social.png', import.meta.url), png);
console.log(`assets/social.png written (${Math.round(png.length / 1024)} KB)`);
