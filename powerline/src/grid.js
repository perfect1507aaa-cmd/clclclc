// Uniform spatial hashes rebuilt every simulation step.

export class SegmentGrid {
  constructor(worldSize, cell) {
    this.cell = cell;
    this.n = Math.ceil(worldSize / cell) + 2;
    this.cells = Array.from({ length: this.n * this.n }, () => []);
    this.used = [];
    this.cap = 0;
    this.count = 0;
    this.qid = 1;
    this._grow(4096);
  }

  _grow(cap) {
    const copy = (Type, old) => {
      const a = new Type(cap);
      if (old) a.set(old.subarray(0, this.count));
      return a;
    };
    this.x1 = copy(Float32Array, this.x1);
    this.y1 = copy(Float32Array, this.y1);
    this.x2 = copy(Float32Array, this.x2);
    this.y2 = copy(Float32Array, this.y2);
    this.hw = copy(Float32Array, this.hw);
    this.idx = copy(Int32Array, this.idx);
    this.stamp = copy(Int32Array, this.stamp);
    this.owner = this.owner ? this.owner.concat(new Array(cap - this.cap)) : new Array(cap);
    this.cap = cap;
  }

  _cellIndex(x, y) {
    let cx = Math.floor(x / this.cell) + 1;
    let cy = Math.floor(y / this.cell) + 1;
    if (cx < 0) cx = 0;
    else if (cx >= this.n) cx = this.n - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.n) cy = this.n - 1;
    return [cx, cy];
  }

  clear() {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
    this.count = 0;
  }

  add(x1, y1, x2, y2, hw, owner, idx) {
    if (this.count >= this.cap) this._grow(this.cap * 2);
    const k = this.count++;
    this.x1[k] = x1;
    this.y1[k] = y1;
    this.x2[k] = x2;
    this.y2[k] = y2;
    this.hw[k] = hw;
    this.owner[k] = owner;
    this.idx[k] = idx;
    this.stamp[k] = 0;
    const [ax, ay] = this._cellIndex(Math.min(x1, x2) - hw, Math.min(y1, y2) - hw);
    const [bx, by] = this._cellIndex(Math.max(x1, x2) + hw, Math.max(y1, y2) + hw);
    for (let cy = ay; cy <= by; cy++) {
      for (let cx = ax; cx <= bx; cx++) {
        const ci = cy * this.n + cx;
        const cell = this.cells[ci];
        if (cell.length === 0) this.used.push(ci);
        cell.push(k);
      }
    }
  }

  // Fills `out` with unique segment ids whose (inflated) bbox may touch the query box.
  query(minx, miny, maxx, maxy, out) {
    out.length = 0;
    const q = ++this.qid;
    const [ax, ay] = this._cellIndex(minx, miny);
    const [bx, by] = this._cellIndex(maxx, maxy);
    for (let cy = ay; cy <= by; cy++) {
      for (let cx = ax; cx <= bx; cx++) {
        const cell = this.cells[cy * this.n + cx];
        for (let i = 0; i < cell.length; i++) {
          const k = cell[i];
          if (this.stamp[k] !== q) {
            this.stamp[k] = q;
            out.push(k);
          }
        }
      }
    }
    return out;
  }
}

export class PointGrid {
  constructor(worldSize, cell) {
    this.cell = cell;
    this.n = Math.ceil(worldSize / cell) + 2;
    this.cells = Array.from({ length: this.n * this.n }, () => []);
    this.used = [];
  }

  clear() {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
  }

  _c(v) {
    const c = Math.floor(v / this.cell) + 1;
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  add(x, y, item) {
    const ci = this._c(y) * this.n + this._c(x);
    const cell = this.cells[ci];
    if (cell.length === 0) this.used.push(ci);
    cell.push(item);
  }

  query(minx, miny, maxx, maxy, out) {
    out.length = 0;
    const ax = this._c(minx);
    const bx = this._c(maxx);
    const ay = this._c(miny);
    const by = this._c(maxy);
    for (let cy = ay; cy <= by; cy++) {
      for (let cx = ax; cx <= bx; cx++) {
        const cell = this.cells[cy * this.n + cx];
        for (let i = 0; i < cell.length; i++) out.push(cell[i]);
      }
    }
    return out;
  }
}
