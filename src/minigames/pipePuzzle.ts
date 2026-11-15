/**
 * Lógica pura del rompecabezas de tuberías (sin Phaser, para poder probarla).
 * Cada pieza es una máscara de 4 bits: N=1, E=2, S=4, W=8.
 */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

const DIRS = [
  { bit: N, dr: -1, dc: 0, opp: S },
  { bit: E, dr: 0, dc: 1, opp: W },
  { bit: S, dr: 1, dc: 0, opp: N },
  { bit: W, dr: 0, dc: -1, opp: E },
];

export interface PipePuzzle {
  rows: number;
  cols: number;
  entryRow: number;
  exitRow: number;
  masks: number[];
  solution: number[];
  path: number[];
  clogged: Set<number>;
}

/** Gira una pieza 90° en sentido horario. */
export function rotateMask(m: number): number {
  return ((m << 1) | (m >> 3)) & 15;
}

function randomPath(rows: number, cols: number, entry: number, exit: number, rand: () => number): number[] | null {
  const start = entry * cols;
  const goal = exit * cols + cols - 1;
  const seen = new Set<number>([start]);
  const path = [start];
  let guard = 0;
  const step = (): boolean => {
    if (++guard > 20000) return false;
    const cur = path[path.length - 1];
    if (cur === goal) return true;
    const r = Math.floor(cur / cols);
    const c = cur % cols;
    const order = DIRS.slice().sort(() => rand() - 0.5);
    for (const d of order) {
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const n = nr * cols + nc;
      if (seen.has(n)) continue;
      seen.add(n);
      path.push(n);
      if (step()) return true;
      path.pop();
      seen.delete(n);
    }
    return false;
  };
  return step() ? path : null;
}

export function generatePipePuzzle(rows: number, cols: number, clogCount: number, rand: () => number): PipePuzzle {
  let entryRow = 0;
  let exitRow = 0;
  let path: number[] | null = null;
  for (let attempt = 0; attempt < 20 && !path; attempt++) {
    entryRow = Math.floor(rand() * rows);
    exitRow = Math.floor(rand() * rows);
    path = randomPath(rows, cols, entryRow, exitRow, rand);
  }
  if (!path) {
    // Respaldo: línea recta
    entryRow = exitRow = 0;
    path = Array.from({ length: cols }, (_, c) => c);
  }

  const solution = new Array<number>(rows * cols).fill(0);
  path.forEach((cell, i) => {
    let m = 0;
    const link = (other: number): void => {
      const dr = Math.floor(other / cols) - Math.floor(cell / cols);
      const dc = (other % cols) - (cell % cols);
      const d = DIRS.find((x) => x.dr === dr && x.dc === dc);
      if (d) m |= d.bit;
    };
    if (i === 0) m |= W;
    else link(path![i - 1]);
    if (i === path!.length - 1) m |= E;
    else link(path![i + 1]);
    solution[cell] = m;
  });
  // Piezas de relleno al azar (rectas, codos y T)
  const fillers = [N | S, N | E, N | E | S];
  for (let i = 0; i < solution.length; i++) {
    if (solution[i] === 0) solution[i] = fillers[Math.floor(rand() * fillers.length)];
  }
  // Todas empiezan giradas al azar (al menos una pieza del camino mal girada)
  const masks = solution.map((m) => {
    let x = m;
    const turns = Math.floor(rand() * 4);
    for (let t = 0; t < turns; t++) x = rotateMask(x);
    return x;
  });
  if (traceFlow({ rows, cols, entryRow, exitRow, masks, solution, path, clogged: new Set() }).ok) {
    masks[path[0]] = rotateMask(masks[path[0]]);
    if (masks[path[0]] === solution[path[0]]) masks[path[0]] = rotateMask(masks[path[0]]);
  }

  const clogged = new Set<number>();
  const candidates = path.slice(1, -1);
  while (clogged.size < Math.min(clogCount, candidates.length)) {
    clogged.add(candidates[Math.floor(rand() * candidates.length)]);
  }
  return { rows, cols, entryRow, exitRow, masks, solution, path, clogged };
}

/** Sigue el flujo desde la entrada. Devuelve las celdas alcanzadas y si llegó a la salida. */
export function traceFlow(p: PipePuzzle): { ok: boolean; reached: Set<number> } {
  const start = p.entryRow * p.cols;
  const goal = p.exitRow * p.cols + p.cols - 1;
  const reached = new Set<number>();
  if (!(p.masks[start] & W) || p.clogged.has(start)) return { ok: false, reached };
  const queue = [start];
  reached.add(start);
  while (queue.length) {
    const cur = queue.shift()!;
    const r = Math.floor(cur / p.cols);
    const c = cur % p.cols;
    for (const d of DIRS) {
      if (!(p.masks[cur] & d.bit)) continue;
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (nr < 0 || nc < 0 || nr >= p.rows || nc >= p.cols) continue;
      const n = nr * p.cols + nc;
      if (reached.has(n) || p.clogged.has(n)) continue;
      if (!(p.masks[n] & d.opp)) continue;
      reached.add(n);
      queue.push(n);
    }
  }
  return { ok: reached.has(goal) && (p.masks[goal] & E) !== 0, reached };
}
