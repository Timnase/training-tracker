import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../public/icons');
mkdirSync(OUT, { recursive: true });

// ─── SVG design ──────────────────────────────────────────────────────────────
// Standard version (rounded corners) — used for icon-192 and apple-touch-icon
function makeSvg({ size, rounded }) {
  const r = rounded ? Math.round(size * 0.156) : 0; // ~80px at 512
  const s = size;

  // All dumbbell pieces share the same vertical center: cy = 40% from top
  const cy = s * 0.40;

  // Outer plate: height 26%, so top = cy - 13%
  const plateH  = s * 0.26,  plateY  = cy - plateH  / 2;
  // Inner collar: height 19%
  const collarH = s * 0.19,  collarY = cy - collarH / 2;
  // Bar: height 7%
  const barH    = s * 0.07,  barY    = cy - barH    / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
  <defs>
    <!-- Pastel gradient: soft sky-blue → gentle lavender -->
    <linearGradient id="bg" x1="0" y1="0" x2="${s}" y2="${s}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#bfdbfe"/>
      <stop offset="100%" stop-color="#ddd6fe"/>
    </linearGradient>
    <!-- Plate gradient: indigo → violet -->
    <linearGradient id="pl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${s}" height="${s}" rx="${r}" fill="url(#bg)"/>

  <!-- Soft white glow top-centre -->
  <ellipse cx="${s*0.5}" cy="${s*0.08}" rx="${s*0.4}" ry="${s*0.15}"
    fill="white" opacity="0.45"/>

  <!-- ── Dumbbell — all pieces centred on cy ── -->
  <!-- Left outer plate -->
  <rect x="${s*0.09}"  y="${plateY}"  width="${s*0.09}" height="${plateH}"
    rx="${s*0.022}" fill="url(#pl)"/>
  <!-- Left inner collar -->
  <rect x="${s*0.18}"  y="${collarY}" width="${s*0.06}" height="${collarH}"
    rx="${s*0.014}" fill="#818cf8"/>

  <!-- Bar -->
  <rect x="${s*0.24}"  y="${barY}"    width="${s*0.52}" height="${barH}"
    rx="${s*0.035}" fill="#4f46e5"/>

  <!-- Right inner collar -->
  <rect x="${s*0.76}"  y="${collarY}" width="${s*0.06}" height="${collarH}"
    rx="${s*0.014}" fill="#818cf8"/>
  <!-- Right outer plate -->
  <rect x="${s*0.82}"  y="${plateY}"  width="${s*0.09}" height="${plateH}"
    rx="${s*0.022}" fill="url(#pl)"/>

  <!-- ── Text ── -->
  <text x="${s*0.5}" y="${s*0.79}"
    font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-size="${s*0.092}" font-weight="900"
    fill="#312e81" text-anchor="middle">GymWithTim</text>

  <!-- Accent line under text -->
  <rect x="${s*0.26}" y="${s*0.825}" width="${s*0.48}" height="${s*0.006}"
    rx="${s*0.003}" fill="#6366f1" opacity="0.5"/>
</svg>`;
}

// ─── Generate sizes ───────────────────────────────────────────────────────────
const variants = [
  { file: 'icon-512.png',          size: 512, rounded: false }, // maskable (full bleed)
  { file: 'icon-192.png',          size: 192, rounded: true  },
  { file: 'apple-touch-icon.png',  size: 180, rounded: true  },
  { file: 'preview-512.png',       size: 512, rounded: true  }, // preview only
];

for (const { file, size, rounded } of variants) {
  const svg = makeSvg({ size, rounded });
  const resvg = new Resvg(svg, { font: { loadSystemFonts: true } });
  const png = resvg.render().asPng();
  writeFileSync(join(OUT, file), png);
  console.log(`✓ ${file}  (${size}×${size})`);
}
