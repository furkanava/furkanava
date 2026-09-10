// Renders the 2048 board + side panel as a self-contained animated SVG (Tokyo Night palette).

import { SIZE } from "./engine.mjs";

const BG = "#0D1117";
const PANEL = "#161B22";
const BORDER = "#30363D";
const TEXT = "#C0CAF5";
const MUTED = "#565F89";
const ACCENT = "#BB9AF7";
const ACCENT2 = "#7AA2F7";

const TILE = {
  0: ["#161B22", TEXT],
  2: ["#1F2335", TEXT],
  4: ["#292E42", TEXT],
  8: ["#3D3B6B", "#FFFFFF"],
  16: ["#4E4A8F", "#FFFFFF"],
  32: ["#6157B4", "#FFFFFF"],
  64: ["#7A6BD6", "#FFFFFF"],
  128: ["#9D7CFF", "#FFFFFF"],
  256: ["#BB9AF7", BG],
  512: ["#C9B2FF", BG],
  1024: ["#D8C6FF", BG],
  2048: ["#F0E6FF", BG],
};

function tileColors(v) {
  if (TILE[v]) return TILE[v];
  return ["#FFD86B", BG]; // beyond 2048
}

function fontSize(v) {
  if (v >= 1024) return 18;
  if (v >= 128) return 22;
  return 26;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CELL = 58;
const GAP = 10;
const BOARD = SIZE * CELL + (SIZE + 1) * GAP; // 282
const W = 560;
const H = BOARD + 40; // 322

/**
 * @param {object} s  game state
 * @param {number|undefined} spawned index of the tile that just appeared (for a pop animation)
 */
export function renderBoard(s, spawned) {
  const tiles = s.board
    .map((v, i) => {
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      const x = 20 + GAP + c * (CELL + GAP);
      const y = 20 + GAP + r * (CELL + GAP);
      const [bg, fg] = tileColors(v);
      const cx = x + CELL / 2;
      const cy = y + CELL / 2;
      const pop =
        i === spawned && v !== 0
          ? `<animateTransform attributeName="transform" type="scale" from="0.2" to="1" dur="0.35s" begin="0.15s" fill="freeze" additive="sum" calcMode="spline" keySplines="0.2 0.8 0.2 1.2"/>`
          : "";
      const glow = v >= 2048 ? ` filter="url(#glow)"` : "";
      const label = v === 0 ? "" : `<text x="0" y="1" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize(v)}" font-weight="700" fill="${fg}">${v}</text>`;
      return `<g transform="translate(${cx} ${cy})"${i === spawned && v !== 0 ? ' opacity="0"' : ""}>${
        i === spawned && v !== 0 ? `<animate attributeName="opacity" from="0" to="1" dur="0.2s" begin="0.15s" fill="freeze"/>` : ""
      }<g${glow}><rect x="${-CELL / 2}" y="${-CELL / 2}" width="${CELL}" height="${CELL}" rx="8" fill="${bg}"/>${label}${pop}</g></g>`;
    })
    .join("\n    ");

  const players = Object.keys(s.players || {}).length;
  const last = s.lastMove ? `@${esc(s.lastMove.player)} → ${s.lastMove.dir}` : "nobody yet";
  const status =
    s.gameMoves === 0 && s.lastGame
      ? `new game · last run ended at ${s.lastGame.score}`
      : s.board.some((v) => v >= 2048)
        ? "2048 reached · keep going"
        : "your move";

  const px = 20 + BOARD + 28; // panel x

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Shared 2048 board, score ${s.score}">
  <defs>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/><stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    .k { fill: ${MUTED}; font-size: 11px; letter-spacing: 1.2px; }
    .v { fill: ${TEXT}; font-size: 20px; font-weight: 700; }
    .s { fill: ${TEXT}; font-size: 12px; }
    .blink { animation: blink 1.1s steps(2, start) infinite; }
    @keyframes blink { to { visibility: hidden; } }
  </style>

  <rect width="${W}" height="${H}" rx="14" fill="${BG}" stroke="${BORDER}"/>
  <rect x="20" y="20" width="${BOARD}" height="${BOARD}" rx="12" fill="${PANEL}"/>
    ${tiles}

  <text x="${px}" y="46" fill="${ACCENT}" font-size="26" font-weight="800" letter-spacing="2">2048</text>
  <text x="${px}" y="66" class="k">ONE BOARD · EVERYONE PLAYS</text>

  <text x="${px}" y="106" class="k">SCORE</text>
  <text x="${px}" y="130" class="v">${s.score}</text>
  <text x="${px + 110}" y="106" class="k">BEST</text>
  <text x="${px + 110}" y="130" class="v">${s.best}</text>

  <text x="${px}" y="166" class="k">MOVES</text>
  <text x="${px}" y="190" class="v">${s.moves}</text>
  <text x="${px + 110}" y="166" class="k">PLAYERS</text>
  <text x="${px + 110}" y="190" class="v">${players}</text>

  <text x="${px}" y="226" class="k">LAST MOVE</text>
  <text x="${px}" y="246" class="s">${last}</text>

  <rect x="${px}" y="268" width="200" height="2" fill="url(#bar)" opacity="0.6"/>
  <text x="${px}" y="292" class="s" fill="${ACCENT}">${esc(status)}<tspan class="blink"> _</tspan></text>
</svg>
`;
}

const BTN_W = 72;
const BTN_H = 44;

/** Arrow button SVGs, one per direction. */
export function renderButton(dir) {
  const arrows = { up: "↑", down: "↓", left: "←", right: "→" };
  const labels = { up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT" };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BTN_W}" height="${BTN_H}" viewBox="0 0 ${BTN_W} ${BTN_H}" role="img" aria-label="Move ${dir}">
  <style>text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}</style>
  <rect x="0.5" y="0.5" width="${BTN_W - 1}" height="${BTN_H - 1}" rx="10" fill="${PANEL}" stroke="${BORDER}"/>
  <text x="18" y="27" font-size="20" fill="${ACCENT}" text-anchor="middle" font-weight="700">${arrows[dir]}</text>
  <text x="48" y="26" font-size="10" fill="${TEXT}" text-anchor="middle" letter-spacing="1.5" font-weight="700">${labels[dir]}</text>
</svg>
`;
}
