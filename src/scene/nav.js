// Tile grid with A* path finding. Tile (i, j) covers x in [i, i+1), z in [j, j+1).

export class NavGrid {
  constructor(w, d) {
    this.w = w;
    this.d = d;
    this.blocked = new Uint8Array(w * d);
  }

  inside(i, j) {
    return i >= 0 && j >= 0 && i < this.w && j < this.d;
  }

  block(i, j) {
    if (this.inside(i, j)) this.blocked[j * this.w + i] = 1;
  }

  free(i, j) {
    return this.inside(i, j) && !this.blocked[j * this.w + i];
  }

  tileOf(x, z) {
    return [Math.max(0, Math.min(this.w - 1, Math.floor(x))), Math.max(0, Math.min(this.d - 1, Math.floor(z)))];
  }

  nearestFree(i, j) {
    if (this.free(i, j)) return [i, j];
    for (let r = 1; r < Math.max(this.w, this.d); r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) === r && this.free(i + di, j + dj)) return [i + di, j + dj];
        }
      }
    }
    return [i, j];
  }

  randomFree(rand, area = null) {
    for (let k = 0; k < 200; k++) {
      const i = area ? area.i0 + Math.floor(rand() * (area.i1 - area.i0)) : Math.floor(rand() * this.w);
      const j = area ? area.j0 + Math.floor(rand() * (area.j1 - area.j0)) : Math.floor(rand() * this.d);
      if (this.free(i, j)) return [i, j];
    }
    return this.nearestFree(Math.floor(this.w / 2), Math.floor(this.d / 2));
  }

  // A* with 8-way moves; diagonals only when both side tiles are free.
  find(start, goal) {
    const [si, sj] = this.nearestFree(...start);
    const [gi, gj] = this.nearestFree(...goal);
    if (si === gi && sj === gj) return [[gi, gj]];
    const key = (i, j) => j * this.w + i;
    const g = new Map([[key(si, sj), 0]]);
    const came = new Map();
    const open = [[si, sj, 0]];
    const h = (i, j) => Math.hypot(i - gi, j - gj);
    const closed = new Set();
    while (open.length) {
      let best = 0;
      for (let k = 1; k < open.length; k++) if (open[k][2] < open[best][2]) best = k;
      const [ci, cj] = open.splice(best, 1)[0];
      const ck = key(ci, cj);
      if (closed.has(ck)) continue;
      closed.add(ck);
      if (ci === gi && cj === gj) {
        const path = [[gi, gj]];
        let k = ck;
        while (came.has(k)) {
          k = came.get(k);
          if (k === key(si, sj)) break;
          path.unshift([k % this.w, Math.floor(k / this.w)]);
        }
        return path;
      }
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (!this.free(ni, nj)) continue;
          if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue;
          const nk = key(ni, nj);
          const cost = g.get(ck) + (di && dj ? Math.SQRT2 : 1);
          if (cost < (g.get(nk) ?? Infinity)) {
            g.set(nk, cost);
            came.set(nk, ck);
            open.push([ni, nj, cost + h(ni, nj)]);
          }
        }
      }
    }
    return [[gi, gj]];
  }
}
