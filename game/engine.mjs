// Minimal, dependency-free 2048 engine. Board is a flat 16-length array (row-major), 0 = empty.

export const SIZE = 4;
export const DIRECTIONS = ["up", "down", "left", "right"];

export function emptyBoard() {
  return new Array(SIZE * SIZE).fill(0);
}

function rows(board) {
  const out = [];
  for (let r = 0; r < SIZE; r++) out.push(board.slice(r * SIZE, r * SIZE + SIZE));
  return out;
}

function fromRows(matrix) {
  return matrix.flat();
}

function rotateCW(matrix) {
  return matrix[0].map((_, c) => matrix.map((row) => row[c]).reverse());
}

function rotateCCW(matrix) {
  return matrix[0].map((_, c) => matrix.map((row) => row[SIZE - 1 - c]));
}

/** Slide one row to the left, merging equal neighbours once. Returns {row, gained}. */
function slideRowLeft(row) {
  const tiles = row.filter((v) => v !== 0);
  const out = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else {
      out.push(tiles[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  return { row: out, gained };
}

/**
 * Apply a move. Returns { board, gained, moved }.
 * Implementation rotates the board so every move becomes "left".
 */
export function move(board, direction) {
  let m = rows(board);
  // Rotate so that the requested direction becomes "left".
  if (direction === "up") m = rotateCCW(m);
  else if (direction === "down") m = rotateCW(m);
  else if (direction === "right") m = m.map((r) => [...r].reverse());
  else if (direction !== "left") throw new Error(`Unknown direction: ${direction}`);

  let gained = 0;
  m = m.map((r) => {
    const res = slideRowLeft(r);
    gained += res.gained;
    return res.row;
  });

  // Rotate back.
  if (direction === "up") m = rotateCW(m);
  else if (direction === "down") m = rotateCCW(m);
  else if (direction === "right") m = m.map((r) => [...r].reverse());

  const next = fromRows(m);
  const moved = next.some((v, i) => v !== board[i]);
  return { board: next, gained, moved };
}

export function spawn(board, rng = Math.random) {
  const empties = board.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  if (empties.length === 0) return board;
  const idx = empties[Math.floor(rng() * empties.length)];
  const next = [...board];
  next[idx] = rng() < 0.9 ? 2 : 4;
  return next;
}

export function hasMoves(board) {
  if (board.includes(0)) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = board[r * SIZE + c];
      if (c + 1 < SIZE && board[r * SIZE + c + 1] === v) return true;
      if (r + 1 < SIZE && board[(r + 1) * SIZE + c] === v) return true;
    }
  }
  return false;
}

export function newGame(rng = Math.random) {
  return spawn(spawn(emptyBoard(), rng), rng);
}

export function maxTile(board) {
  return Math.max(...board);
}
