/**
 * Pure Node.js PNG icon generator — no external deps
 * Draws the analyst icon (dark bg + person + chart bars + magnifier)
 */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

// ── PNG encoder ──────────────────────────────────────────────
function encodePNG(width, height, pixels) {
  // pixels: Uint8Array of RGBA values (width * height * 4)
  const crc32 = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return (buf) => {
      let c = -1;
      for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
      return (c ^ -1) >>> 0;
    };
  })();

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])), 0);
    return Buffer.concat([len, typeB, data, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB (we'll drop alpha for simplicity — use 6 for RGBA)
  // Use color type 6 (RGBA)
  ihdr[9] = 6;
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw image data with filter byte per row
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = y * (1 + width * 4) + 1 + x * 4;
      raw[di]   = pixels[si];
      raw[di+1] = pixels[si+1];
      raw[di+2] = pixels[si+2];
      raw[di+3] = pixels[si+3];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

// ── Drawing helpers ──────────────────────────────────────────
class Canvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.buf = new Uint8Array(w * h * 4); // RGBA, starts transparent
  }
  setPixel(x, y, r, g, b, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    // alpha blending over existing pixel
    const sa = a / 255, da = this.buf[i+3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    this.buf[i]   = Math.round((r * sa + this.buf[i]   * da * (1-sa)) / oa);
    this.buf[i+1] = Math.round((g * sa + this.buf[i+1] * da * (1-sa)) / oa);
    this.buf[i+2] = Math.round((b * sa + this.buf[i+2] * da * (1-sa)) / oa);
    this.buf[i+3] = Math.round(oa * 255);
  }
  fillRect(x1, y1, x2, y2, r, g, b, a = 255) {
    for (let y = Math.round(y1); y <= Math.round(y2); y++)
      for (let x = Math.round(x1); x <= Math.round(x2); x++)
        this.setPixel(x, y, r, g, b, a);
  }
  // Filled circle
  fillCircle(cx, cy, radius, r, g, b, a = 255) {
    const r2 = radius * radius;
    for (let y = Math.ceil(cy - radius); y <= Math.floor(cy + radius); y++)
      for (let x = Math.ceil(cx - radius); x <= Math.floor(cx + radius); x++) {
        const d2 = (x-cx)**2 + (y-cy)**2;
        if (d2 <= r2) this.setPixel(x, y, r, g, b, a);
        else if (d2 <= (radius+1)**2) {
          // anti-alias edge
          const aa = Math.round((radius + 1 - Math.sqrt(d2)) * a);
          this.setPixel(x, y, r, g, b, Math.min(a, aa));
        }
      }
  }
  // Rounded rect fill
  fillRoundRect(x, y, w, h, rx, r, g, b, a = 255) {
    // corners
    const corners = [[x+rx, y+rx], [x+w-rx, y+rx], [x+rx, y+h-rx], [x+w-rx, y+h-rx]];
    this.fillRect(x+rx, y, x+w-rx, y+h, r, g, b, a);
    this.fillRect(x, y+rx, x+rx-1, y+h-rx, r, g, b, a);
    this.fillRect(x+w-rx+1, y+rx, x+w, y+h-rx, r, g, b, a);
    for (const [cx, cy] of corners) this.fillCircle(cx, cy, rx, r, g, b, a);
  }
  // Line with width
  strokeLine(x1, y1, x2, y2, lw, r, g, b, a = 255) {
    const dx = x2-x1, dy = y2-y1, len = Math.hypot(dx, dy);
    if (len === 0) return;
    const steps = Math.ceil(len * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + dx*t, py = y1 + dy*t;
      this.fillCircle(px, py, lw/2, r, g, b, a);
    }
  }
  // Circle stroke
  strokeCircle(cx, cy, radius, lw, r, g, b, a = 255) {
    const steps = Math.ceil(2 * Math.PI * radius * 2);
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      this.fillCircle(cx + Math.cos(angle)*radius, cy + Math.sin(angle)*radius, lw/2, r, g, b, a);
    }
  }
  // Path fill (simple polygon)
  fillPoly(pts, r, g, b, a = 255) {
    // scanline fill
    const ys = pts.map(p=>p[1]);
    const ymin = Math.floor(Math.min(...ys)), ymax = Math.ceil(Math.max(...ys));
    for (let y = ymin; y <= ymax; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1,y1] = pts[i], [x2,y2] = pts[(i+1) % pts.length];
        if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
          xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
        }
      }
      xs.sort((a,b)=>a-b);
      for (let j = 0; j < xs.length-1; j+=2)
        for (let x = Math.round(xs[j]); x <= Math.round(xs[j+1]); x++)
          this.setPixel(x, y, r, g, b, a);
    }
  }
  toPNG() { return encodePNG(this.w, this.h, this.buf); }
}

// ── Icon drawing function (normalized 0-128) ─────────────────
function drawIcon(size) {
  const c = new Canvas(size, size);
  const s = size / 128; // scale factor

  // Colors
  const BG   = [31, 41, 55];       // #1F2937 dark navy
  const FG   = [249, 250, 251];     // #F9FAFB near-white
  const CYAN = [6, 182, 212];       // #06B6D4

  // Background rounded rect
  c.fillRoundRect(0, 0, size-1, size-1, Math.round(24*s), ...BG, 255);

  // ── Chart bars (bottom-left area) ──────────────────────────
  // Original positions (128px): x at 32,46,60 | bar widths 10 | heights 22,30,36
  // y baseline at ~114 (78+36)
  const bx = 32*s, bw = 10*s, gap = 14*s;
  // bar 1
  const b1h = 22*s, b1y = 78*s + (36-22)*s;
  c.fillRoundRect(bx, b1y, bx+bw, b1y+b1h, Math.max(1,Math.round(2*s)), ...CYAN);
  // bar 2
  const b2h = 30*s, b2y = 78*s + (36-30)*s;
  c.fillRoundRect(bx+gap, b2y, bx+gap+bw, b2y+b2h, Math.max(1,Math.round(2*s)), CYAN[0], CYAN[1], CYAN[2], 217);
  // bar 3
  const b3h = 36*s, b3y = 78*s;
  c.fillRoundRect(bx+gap*2, b3y, bx+gap*2+bw, b3y+b3h, Math.max(1,Math.round(2*s)), CYAN[0], CYAN[1], CYAN[2], 179);

  // ── Person head ────────────────────────────────────────────
  c.fillCircle(86*s, 46*s, 14*s, ...FG);

  // ── Person shoulders/torso ─────────────────────────────────
  // Q 64 70 → 86 70 → 108 90 arc approximated as trapezoid + round top
  const shoulderPts = [
    [64*s, 110*s], [108*s, 110*s],
    [108*s, 90*s], [86*s, 70*s], [64*s, 90*s]
  ];
  c.fillPoly(shoulderPts, ...FG);

  // ── Magnifier (top-left) ───────────────────────────────────
  // circle cx=30 cy=34 r=8, line 36,40→42,46
  const mx = 20*s, my = 24*s;
  c.strokeCircle(mx+10*s, my+10*s, 8*s, 3*s, ...CYAN);
  c.strokeLine(mx+16*s, my+16*s, mx+22*s, my+22*s, 3*s, ...CYAN);

  return c.toPNG();
}

// ── Generate & save ──────────────────────────────────────────
const outDir = path.join(__dirname, "extension", "icons");
for (const sz of [16, 48, 128]) {
  const png = drawIcon(sz);
  const outPath = path.join(outDir, `${sz}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✓ ${sz}.png  (${png.length} bytes)`);
}
console.log("Done!");
