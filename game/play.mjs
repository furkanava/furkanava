// Entry point used by the GitHub Action (and locally with INIT=1 to bootstrap a fresh game).
//
// Inputs (env):
//   ISSUE_TITLE  e.g. "2048: up"   — parsed with a strict allowlist regex
//   PLAYER       GitHub login of the issue author
//   INIT=1       create a brand-new game (ignores the other inputs)
//
// Outputs:
//   game/state.json, assets/2048.svg, assets/btn-*.svg, README.md (image cache-buster + stats line)
//   game/comment.md — markdown reply the workflow posts on the issue
//   "changed=true|false" appended to $GITHUB_OUTPUT when available

import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DIRECTIONS, SIZE, hasMoves, maxTile, move, newGame, spawn } from "./engine.mjs";
import { renderBoard, renderButton } from "./render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, "game", "state.json");
const COMMENT = join(ROOT, "game", "comment.md");
const ASSETS = join(ROOT, "assets");
const README = join(ROOT, "README.md");

const TITLE_RE = /^\s*2048\s*:\s*(up|down|left|right)\s*$/i;

function freshState(prev = {}) {
  return {
    board: newGame(),
    score: 0,
    best: prev.best ?? 0,
    moves: prev.moves ?? 0,
    gameMoves: 0,
    games: (prev.games ?? 0) + 1,
    players: prev.players ?? {},
    lastMove: prev.lastMove ?? null,
    lastGame: prev.lastGame ?? null,
  };
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return null;
  }
}

function asciiBoard(board) {
  const w = Math.max(...board).toString().length;
  const lines = [];
  for (let r = 0; r < SIZE; r++) {
    lines.push(
      board
        .slice(r * SIZE, r * SIZE + SIZE)
        .map((v) => (v === 0 ? ".".padStart(w) : String(v).padStart(w)))
        .join("  "),
    );
  }
  return "```\n" + lines.join("\n") + "\n```";
}

function writeAssets(state, spawned) {
  mkdirSync(ASSETS, { recursive: true });
  writeFileSync(join(ASSETS, "2048.svg"), renderBoard(state, spawned));
  for (const d of DIRECTIONS) writeFileSync(join(ASSETS, `btn-${d}.svg`), renderButton(d));
}

function updateReadme(state) {
  let md = readFileSync(README, "utf8");
  md = md.replace(/assets\/2048\.svg\?v=\d+/g, `assets/2048.svg?v=${Date.now()}`);
  const players = Object.keys(state.players).length;
  const last = state.lastMove ? `last move by <a href="https://github.com/${state.lastMove.player}">@${state.lastMove.player}</a>` : "no moves yet";
  const line = `<b>${state.score}</b> pts · best <b>${state.best}</b> · ${state.moves} moves by ${players} ${players === 1 ? "person" : "people"} · ${last}`;
  md = md.replace(/(<!-- 2048:stats -->)[\s\S]*?(<!-- \/2048:stats -->)/, `$1${line}$2`);
  writeFileSync(README, md);
}

function setOutput(changed) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

function main() {
  if (process.env.INIT === "1") {
    const state = freshState(loadState() ?? {});
    writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
    writeAssets(state);
    updateReadme(state);
    console.log("Initialised a new game.");
    return;
  }

  const title = process.env.ISSUE_TITLE ?? "";
  const player = (process.env.PLAYER ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 39) || "anonymous";
  const m = TITLE_RE.exec(title);

  if (!m) {
    writeFileSync(COMMENT, `I only understand \`2048: up|down|left|right\` — use the arrow buttons on the profile README. 🙂`);
    setOutput(false);
    return;
  }
  const dir = m[1].toLowerCase();

  const state = loadState() ?? freshState();
  const res = move(state.board, dir);

  if (!res.moved) {
    writeFileSync(COMMENT, `Nothing moves **${dir}** on the current board. Try another direction!\n\n${asciiBoard(state.board)}`);
    setOutput(false);
    return;
  }

  // Apply the move and spawn a new tile.
  const before = res.board;
  const after = spawn(before);
  let spawned = after.findIndex((v, i) => v !== before[i]);

  state.board = after;
  state.score += res.gained;
  state.best = Math.max(state.best, state.score);
  state.moves += 1;
  state.gameMoves += 1;
  state.players[player] = (state.players[player] ?? 0) + 1;
  state.lastMove = { player, dir, at: new Date().toISOString() };

  let comment = `Moved **${dir}**${res.gained ? ` for **+${res.gained}**` : ""}. Score is now **${state.score}**.\n\n${asciiBoard(state.board)}`;

  if (!hasMoves(state.board)) {
    const finalScore = state.score;
    const top = maxTile(state.board);
    state.lastGame = { score: finalScore, maxTile: top, endedBy: player, at: state.lastMove.at };
    comment += `\n\n💀 **Game over** — final score **${finalScore}**, biggest tile **${top}**. A fresh board is already up; go again.`;
    Object.assign(state, freshState(state));
    spawned = undefined;
  } else {
    comment += `\n\nThe board on [the profile](https://github.com/${process.env.GITHUB_REPOSITORY_OWNER ?? "furkanava"}) updates in a few seconds.`;
  }

  writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
  writeAssets(state, spawned);
  updateReadme(state);
  writeFileSync(COMMENT, comment);
  setOutput(true);
}

main();
