// "A year of commits, painted."
//
// Reads art/contributions.json (GitHub GraphQL contributionCalendar) and paints every day of the
// last year as one brushstroke flowing through a noise field seeded by the username. Busier days
// travel further and glow brighter; empty days become faint grain. The stroke order is
// chronological, and the SVG animates itself into existence when opened.
//
// Usage: node art/paint.mjs   (env SEED overrides the seed, default: repo owner login)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = join(ROOT, "art", "contributions.json");
const OUTPUT = join(ROOT, "assets", "year.svg");
const README = join(ROOT, "README.md");
const ANIM = process.env.ANIM !== "0"; // ANIM=0 → static final frame (for previews)
const OUT_OVERRIDE = process.env.OUT;

// ---------- palette (Tokyo Night) ----------
const BG = "#0D1117";
const GRAIN = "#2A2E45";
const RAMP = ["#3D59A1", "#7AA2F7", "#7DCFFF", "#BB9AF7", "#FF9EDB", "#E0AF68"]; // low → high
const TEXT = "#565F89";
const TEXT_HI = "#C0CAF5";

// ---------- canvas ----------
const W = 880;
const H = 420;
const PAD_X = 60;
const PAD_Y = 70;

// ---------- deterministic randomness ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Smooth 2D value noise in [0,1]. */
function makeNoise(rng) {
  const N = 64;
  const grid = Array.from({ length: N * N }, () => rng());
  const at = (x, y) => grid[((y % N) + N) % N * N + (((x % N) + N) % N)];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = fade(x - x0);
    const fy = fade(y - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
}

// ---------- data ----------
function loadDays() {
  const json = JSON.parse(readFileSync(INPUT, "utf8"));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w, wi) => w.contributionDays.map((d) => ({ ...d, week: wi })));
  return { days, total: cal.totalContributions, weeks: cal.weeks.length };
}

function colorFor(count, max) {
  if (count === 0) return GRAIN;
  const t = Math.log1p(count) / Math.log1p(max); // 0..1, log-scaled
  const i = Math.min(RAMP.length - 1, Math.floor(t * RAMP.length));
  return RAMP[i];
}

// ---------- painting ----------
function paint(seedStr) {
  const { days, total, weeks } = loadDays();
  const rng = mulberry32(hashString(seedStr));
  const noise = makeNoise(rng);
  const max = Math.max(1, ...days.map((d) => d.contributionCount));
  const active = days.filter((d) => d.contributionCount > 0).length;

  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const scale = 0.011; // noise frequency
  const strokes = [];
  const grain = [];
  const defs = [];
  let totalDelay = 0;

  /** Trace one stroke through the field from (x, y). Returns { d, len } or null. */
  function trace(x, y, steps, stepLen) {
    const pts = [[x, y]];
    let len = 0;
    for (let s = 0; s < steps; s++) {
      const n = noise(x * scale, y * scale) * 0.7 + noise(x * scale * 3.1 + 17, y * scale * 3.1 + 5) * 0.3;
      const angle = (n - 0.5) * Math.PI * 1.7;
      const nx = x + Math.cos(angle) * stepLen;
      const ny = y + Math.sin(angle) * stepLen;
      if (nx < 10 || nx > W - 10 || ny < 52 || ny > H - 46) break;
      len += Math.hypot(nx - x, ny - y);
      x = nx;
      y = ny;
      pts.push([x, y]);
    }
    if (pts.length < 2) return null;
    return { d: pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${Math.round(px)} ${Math.round(py)}`).join(""), len };
  }

  days.forEach((d, idx) => {
    const c = d.contributionCount;
    const t = c === 0 ? 0 : Math.log1p(c) / Math.log1p(max); // 0..1 intensity
    const x0 = PAD_X + (d.week / Math.max(1, weeks - 1)) * innerW + (rng() - 0.5) * 10;
    const y0 = PAD_Y + (d.weekday / 6) * innerH + (rng() - 0.5) * 18;

    if (c === 0) {
      const g = trace(x0, y0, 4 + Math.floor(rng() * 5), 1.6);
      if (g) grain.push(`<path d="${g.d}" stroke="${GRAIN}" stroke-width="1.1" opacity="0.5"/>`);
      return;
    }

    // Busier days become bundles of near-parallel strokes.
    const bundle = 1 + Math.min(4, Math.floor(Math.log2(c + 1)));
    const steps = Math.round(24 + t * 110);
    const color = colorFor(c, max);
    const width = 1.4 + t * 2.6;
    const opacity = 0.6 + t * 0.4;
    const begin = (idx / days.length) * 5.5; // the year paints itself over ~5.5s
    const glow = t >= 0.75 ? ' filter="url(#glow)"' : "";

    for (let b = 0; b < bundle; b++) {
      const off = (b - (bundle - 1) / 2) * 5.5;
      const st = trace(x0 + (rng() - 0.5) * 3, y0 + off, steps - Math.abs(off) * 2, 2.4);
      if (!st) continue;
      const dur = 0.6 + (st.len / 300) * 0.8;
      const bgn = begin + b * 0.06;
      totalDelay = Math.max(totalDelay, bgn + dur);
      const L = st.len.toFixed(1);
      const anim = ANIM
        ? `<animate attributeName="stroke-dashoffset" from="${L}" to="0" begin="${bgn.toFixed(2)}s" dur="${dur.toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1"/>`
        : "";
      const dash = `stroke-dasharray="${L}" stroke-dashoffset="${ANIM ? L : 0}"`;
      const id = `s${idx}-${b}`;
      defs.push(`<path id="${id}" d="${st.d}"/>`);
      // Soft light trail underneath + bright core on top, both referencing the same geometry.
      strokes.push(`<use href="#${id}" stroke="${color}" stroke-width="${(width * 3.2).toFixed(1)}" opacity="${(opacity * 0.16).toFixed(2)}" ${dash}>${anim}</use>`);
      strokes.push(`<use href="#${id}" stroke="${color}" stroke-width="${width.toFixed(1)}" opacity="${opacity.toFixed(2)}"${glow} ${dash}>${anim}</use>`);
    }
  });

  // "Today" marker: last day's start point, breathing.
  const last = days[days.length - 1];
  const tx = PAD_X + (last.week / Math.max(1, weeks - 1)) * innerW;
  const ty = PAD_Y + (last.weekday / 6) * innerH;

  const first = days[0].date;
  const fmt = (iso) => {
    const [y, m, d] = iso.split("-");
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return `${months[+m - 1]} ${+d}, ${y}`;
  };

  // Month ticks along the bottom edge.
  const ticks = [];
  let seen = "";
  days.forEach((d) => {
    const ym = d.date.slice(0, 7);
    if (ym !== seen && d.date.endsWith("-01")) {
      seen = ym;
      const x = PAD_X + (d.week / Math.max(1, weeks - 1)) * innerW;
      const label = fmt(d.date).split(" ")[0];
      ticks.push(`<line x1="${x.toFixed(1)}" y1="${H - 30}" x2="${x.toFixed(1)}" y2="${H - 24}" stroke="${TEXT}" stroke-opacity="0.6"/><text x="${x.toFixed(1)}" y="${H - 12}" text-anchor="middle" class="t">${label}</text>`);
    }
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Generative painting of one year of GitHub contributions: ${total} contributions on ${active} days.">
  <defs>
    ${defs.join("\n    ")}
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="vignette" cx="50%" cy="45%" r="70%">
      <stop offset="0.55" stop-color="${BG}" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.45"/>
    </radialGradient>
  </defs>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    .t { fill: ${TEXT}; font-size: 10px; letter-spacing: 1px; }
    .h { fill: ${TEXT_HI}; font-size: 12px; letter-spacing: 1.5px; }
    .breathe { animation: breathe 2.4s ease-in-out infinite; transform-origin: ${tx.toFixed(1)}px ${ty.toFixed(1)}px; }
    @keyframes breathe { 0%,100% { opacity: .25; transform: scale(1); } 50% { opacity: .9; transform: scale(1.6); } }
  </style>
  <rect width="${W}" height="${H}" rx="14" fill="${BG}"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${ANIM ? 0 : 1}">
    ${ANIM ? '<animate attributeName="opacity" from="0" to="1" begin="0.2s" dur="1.6s" fill="freeze"/>' : ""}
    ${grain.join("\n    ")}
  </g>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${strokes.join("\n    ")}
  </g>
  <rect width="${W}" height="${H}" rx="14" fill="url(#vignette)"/>
  <circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="5" fill="#FFFFFF" class="breathe"/>
  <circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="2" fill="#FFFFFF"/>
  <text x="${PAD_X}" y="34" class="h">A YEAR OF COMMITS, PAINTED</text>
  <text x="${W - PAD_X}" y="34" text-anchor="end" class="t">${total} CONTRIBUTIONS · ${active} DAYS · ${fmt(first).toUpperCase()} → ${fmt(last.date).toUpperCase()}</text>
  ${ticks.join("\n  ")}
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="#30363D"/>
</svg>
`;
  writeFileSync(OUT_OVERRIDE || OUTPUT, svg);

  // Bust GitHub's image cache in the README.
  try {
    let md = readFileSync(README, "utf8");
    const next = md.replace(/assets\/year\.svg\?v=\d+/g, `assets/year.svg?v=${Date.now()}`);
    if (next !== md) writeFileSync(README, next);
  } catch {
    /* README optional */
  }

  console.log(`painted ${strokes.length + grain.length} strokes (${active} active days, ${total} contributions) → ${OUTPUT} (${(svg.length / 1024).toFixed(0)} KB)`);
}

paint(process.env.SEED || process.env.GITHUB_REPOSITORY_OWNER || "furkanava");
