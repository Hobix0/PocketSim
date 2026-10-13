// Wegfindung auf dem Etagenraster: A* mit 8 Richtungen, ohne Ecken zu schneiden.
// blocked(x, z) entscheidet, ob ein Feld begehbar ist. Das Startfeld gilt immer als frei,
// das Zielfeld nur dann als blockiert, wenn allowGoalBlocked nicht gesetzt ist
// (so kann ein Gast auf „seinen“ Stuhl gehen).

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export function findPath(W, D, blocked, sx, sz, gx, gz, allowGoalBlocked = false) {
  if (gx < 0 || gz < 0 || gx >= W || gz >= D) return null;
  if (sx === gx && sz === gz) return [];
  const free = (x, z) => {
    if (x < 0 || z < 0 || x >= W || z >= D) return false;
    if (x === gx && z === gz && allowGoalBlocked) return true;
    if (x === sx && z === sz) return true;
    return !blocked(x, z);
  };
  if (!free(gx, gz)) return null;

  const N = W * D;
  const g = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = []; // einfacher Binärheap aus [f, idx]
  const push = (f, i) => {
    open.push([f, i]);
    let k = open.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (open[p][0] <= open[k][0]) break;
      [open[p], open[k]] = [open[k], open[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = open[0];
    const last = open.pop();
    if (open.length) {
      open[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < open.length && open[l][0] < open[m][0]) m = l;
        if (r < open.length && open[r][0] < open[m][0]) m = r;
        if (m === k) break;
        [open[m], open[k]] = [open[k], open[m]];
        k = m;
      }
    }
    return top;
  };
  const h = (x, z) => {
    const dx = Math.abs(x - gx), dz = Math.abs(z - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };

  const s = sz * W + sx, goal = gz * W + gx;
  g[s] = 0;
  push(h(sx, sz), s);
  while (open.length) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = cur % W, cz = (cur / W) | 0;
    for (const [dx, dz, cost] of DIRS) {
      const nx = cx + dx, nz = cz + dz;
      if (!free(nx, nz)) continue;
      // Diagonal nur, wenn beide Nachbarn frei sind (keine Ecken schneiden)
      if (dx && dz && (!free(cx + dx, cz) || !free(cx, cz + dz))) continue;
      const ni = nz * W + nx;
      if (closed[ni]) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        from[ni] = cur;
        push(ng + h(nx, nz), ni);
      }
    }
  }
  if (from[goal] === -1) return null;
  const cells = [];
  for (let c = goal; c !== s; c = from[c]) cells.push([c % W, (c / W) | 0]);
  return cells.reverse();
}

// Alle von (sx, sz) aus erreichbaren Felder (4er-Nachbarschaft), als Set von Indizes.
export function reachable(W, D, blocked, sx, sz) {
  const seen = new Set([sz * W + sx]);
  const q = [[sx, sz]];
  while (q.length) {
    const [x, z] = q.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D || blocked(nx, nz)) continue;
      const i = nz * W + nx;
      if (seen.has(i)) continue;
      seen.add(i);
      q.push([nx, nz]);
    }
  }
  return seen;
}
