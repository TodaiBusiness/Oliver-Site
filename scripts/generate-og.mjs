/* =========================================================================
   Gera public/og-image.png (1200x630) — imagem de compartilhamento (Open Graph).
   Escrito com Node puro (zlib), sem dependências extras.

   Rodar apenas quando quiser regerar a imagem:
     node scripts/generate-og.mjs
   ========================================================================= */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1200;
const H = 630;
const CH = 3; // RGB

const px = Buffer.alloc(W * H * CH);

/* ---------------------------------------------------------------- pintura */

const setPixel = (x, y, [r, g, b], alpha = 1) => {
  if (x < 0 || y < 0 || x >= W || y >= H || alpha <= 0) return;
  const i = (y * W + x) * CH;
  const a = Math.min(1, alpha);
  px[i] = Math.round(px[i] * (1 - a) + r * a);
  px[i + 1] = Math.round(px[i + 1] * (1 - a) + g * a);
  px[i + 2] = Math.round(px[i + 2] * (1 - a) + b * a);
};

const fill = (color) => {
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) setPixel(x, y, color);
  }
};

/** Distância de um ponto ao segmento (x0,y0)-(x1,y1). */
const distToSegment = (px_, py, x0, y0, x1, y1) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px_ - x0) * dx + (py - y0) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x0 + t * dx;
  const cy = y0 + t * dy;
  return Math.hypot(px_ - cx, py - cy);
};

/** Traço com antialiasing. */
const stroke = (x0, y0, x1, y1, thickness, color, alpha = 1) => {
  const half = thickness / 2;
  const pad = Math.ceil(half + 2);
  const minX = Math.floor(Math.min(x0, x1)) - pad;
  const maxX = Math.ceil(Math.max(x0, x1)) + pad;
  const minY = Math.floor(Math.min(y0, y1)) - pad;
  const maxY = Math.ceil(Math.max(y0, y1)) + pad;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const d = distToSegment(x + 0.5, y + 0.5, x0, y0, x1, y1);
      const edge = half - d;
      if (edge >= 0.5) setPixel(x, y, color, alpha);
      else if (edge > -0.5) setPixel(x, y, color, alpha * (edge + 0.5));
    }
  }
};

/** Brilho radial suave (o "glow" azul da marca). */
const glow = (cx, cy, radius, color, intensity) => {
  const r2 = radius * radius;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(W - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(H - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > r2) continue;
      const t = 1 - d2 / r2;
      setPixel(x, y, color, intensity * t * t);
    }
  }
};

/* ------------------------------------------------------- letras geométricas
   Cada glifo é uma lista de segmentos numa caixa unitária (0..0.62 x 0..1).
   Estilo chanfrado, coerente com a identidade tecnológica da marca.        */

const GLYPHS = {
  O: [
    [0.14, 0, 0.48, 0],
    [0.48, 0, 0.62, 0.22],
    [0.62, 0.22, 0.62, 0.78],
    [0.62, 0.78, 0.48, 1],
    [0.48, 1, 0.14, 1],
    [0.14, 1, 0, 0.78],
    [0, 0.78, 0, 0.22],
    [0, 0.22, 0.14, 0],
  ],
  D: [
    [0, 0, 0.44, 0],
    [0.44, 0, 0.6, 0.22],
    [0.6, 0.22, 0.6, 0.78],
    [0.6, 0.78, 0.44, 1],
    [0.44, 1, 0, 1],
    [0, 1, 0, 0],
  ],
  A: [
    [0, 1, 0, 0.3],
    [0, 0.3, 0.2, 0],
    [0.2, 0, 0.42, 0],
    [0.42, 0, 0.62, 0.3],
    [0.62, 0.3, 0.62, 1],
    [0, 0.58, 0.62, 0.58],
  ],
  L: [
    [0, 0, 0, 1],
    [0, 1, 0.56, 1],
  ],
  I: [[0.06, 0, 0.06, 1]],
  V: [
    [0, 0, 0.31, 1],
    [0.31, 1, 0.62, 0],
  ],
  E: [
    [0, 0, 0.56, 0],
    [0, 0, 0, 1],
    [0, 1, 0.56, 1],
    [0, 0.5, 0.46, 0.5],
  ],
  R: [
    [0, 0, 0, 1],
    [0, 0, 0.46, 0],
    [0.46, 0, 0.58, 0.14],
    [0.58, 0.14, 0.58, 0.36],
    [0.58, 0.36, 0.46, 0.5],
    [0.46, 0.5, 0, 0.5],
    [0.3, 0.5, 0.62, 1],
  ],
  T: [
    [0, 0, 0.62, 0],
    [0.31, 0, 0.31, 1],
  ],
  M: [
    [0, 1, 0, 0],
    [0, 0, 0.31, 0.52],
    [0.31, 0.52, 0.62, 0],
    [0.62, 0, 0.62, 1],
  ],
  P: [
    [0, 0, 0, 1],
    [0, 0, 0.46, 0],
    [0.46, 0, 0.58, 0.14],
    [0.58, 0.14, 0.58, 0.36],
    [0.58, 0.36, 0.46, 0.5],
    [0.46, 0.5, 0, 0.5],
  ],
  S: [
    [0.58, 0.14, 0.46, 0],
    [0.46, 0, 0.14, 0],
    [0.14, 0, 0, 0.14],
    [0, 0.14, 0, 0.36],
    [0, 0.36, 0.14, 0.5],
    [0.14, 0.5, 0.46, 0.5],
    [0.46, 0.5, 0.58, 0.64],
    [0.58, 0.64, 0.58, 0.86],
    [0.58, 0.86, 0.46, 1],
    [0.46, 1, 0.14, 1],
    [0.14, 1, 0, 0.86],
  ],
};

/** Largura de avanço de cada glifo (evita espaço sobrando em letras finas). */
const WIDTHS = {
  O: 0.62,
  D: 0.6,
  A: 0.62,
  L: 0.56,
  I: 0.12,
  V: 0.62,
  E: 0.56,
  R: 0.62,
  T: 0.62,
  M: 0.62,
  P: 0.58,
  S: 0.58,
};

const drawText = (text, x, y, height, thickness, color, tracking = 0.22) => {
  let cursor = x;
  for (const char of text) {
    if (char === ' ') {
      cursor += height * 0.42;
      continue;
    }
    const glyph = GLYPHS[char];
    if (!glyph) continue;

    for (const [x0, y0, x1, y1] of glyph) {
      stroke(
        cursor + x0 * height,
        y + y0 * height,
        cursor + x1 * height,
        y + y1 * height,
        thickness,
        color
      );
    }
    cursor += (WIDTHS[char] ?? 0.62) * height + tracking * height;
  }
  return cursor;
};

/* ------------------------------------------------------------ composição */

const BLACK = [2, 5, 12];
const WHITE = [255, 255, 255];
const BLUE = [59, 130, 246];
const GRID = [255, 255, 255];

fill(BLACK);

// grade de fundo
for (let x = 0; x < W; x += 60) {
  for (let y = 0; y < H; y += 1) setPixel(x, y, GRID, 0.035);
}
for (let y = 0; y < H; y += 60) {
  for (let x = 0; x < W; x += 1) setPixel(x, y, GRID, 0.035);
}

// brilhos azuis (azul normal e azul escuro)
glow(1010, 96, 520, BLUE, 0.24);
glow(120, 600, 420, [29, 78, 216], 0.2);

// símbolo da marca: quadrado arredondado (chanfrado) + monograma "T" (o mesmo do Logo.jsx e do favicon)
const MX = 96;
const MY = 118;
const MS = 96;
const r = 26;
const box = [
  [MX + r, MY, MX + MS - r, MY],
  [MX + MS - r, MY, MX + MS, MY + r],
  [MX + MS, MY + r, MX + MS, MY + MS - r],
  [MX + MS, MY + MS - r, MX + MS - r, MY + MS],
  [MX + MS - r, MY + MS, MX + r, MY + MS],
  [MX + r, MY + MS, MX, MY + MS - r],
  [MX, MY + MS - r, MX, MY + r],
  [MX, MY + r, MX + r, MY],
];
box.forEach(([x0, y0, x1, y1]) => stroke(x0, y0, x1, y1, 3, BLUE, 0.45));

// Mesmas proporções do viewBox 40x40 do Logo.jsx (barra em y=9,5 de x=9 a 31; haste até y=31).
stroke(MX + 22, MY + 23, MX + 74, MY + 23, 8, BLUE);
stroke(MX + 48, MY + 23, MX + 48, MY + 74, 8, BLUE);

// wordmark
drawText('TODAI', 96, 306, 84, 10, WHITE);

// barra de destaque
stroke(96, 446, 236, 446, 6, BLUE);

// "reticências" de continuidade
[0, 1, 2].forEach((i) => {
  stroke(266 + i * 22, 446, 268 + i * 22, 446, 6, WHITE, 0.22);
});

/* ------------------------------------------------------------ encode PNG */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // truecolor RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// scanlines com byte de filtro 0
const raw = Buffer.alloc(H * (1 + W * CH));
for (let y = 0; y < H; y += 1) {
  const dest = y * (1 + W * CH);
  raw[dest] = 0;
  px.copy(raw, dest + 1, y * W * CH, (y + 1) * W * CH);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'og-image.png'
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);

console.log(`og-image.png gerado (${(png.length / 1024).toFixed(1)} KB)`);
