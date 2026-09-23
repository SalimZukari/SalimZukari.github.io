// Week 4 core computations — pure functions, no DOM, no D3.
// Used by src/js/week4.js in the browser AND by scripts/week4_validate_browser.mjs
// under Node, which checks every function here against the Python pipeline's
// output (data/processed/week4.json). Keep it that way: if you change a formula
// here, re-run `npm run validate:week4`.

// edges: array of [i, j, w] over node indices 0..n-1 (undirected, weights summed)

export function degreesAndStrengths(n, edges) {
  const k = new Int32Array(n);
  const s = new Float64Array(n);
  for (const [i, j, w] of edges) {
    k[i]++; k[j]++;
    s[i] += w; s[j] += w;
  }
  return { k, s };
}

// Disparity filter (Serrano, Boguñá & Vespignani 2009): for each end,
// alpha_ij = (1 - w/s_i)^(k_i - 1); a link is kept at level alpha if it is
// significant at either end, so we store the smaller of the two values.
export function disparityPValues(n, edges) {
  const { k, s } = degreesAndStrengths(n, edges);
  const p = new Float64Array(edges.length);
  const pEnds = new Array(edges.length);
  edges.forEach(([i, j, w], e) => {
    const pi = Math.pow(1 - w / s[i], k[i] - 1);
    const pj = Math.pow(1 - w / s[j], k[j] - 1);
    p[e] = Math.min(pi, pj);
    pEnds[e] = [pi, pj];
  });
  return { p, pEnds, k, s };
}

export function keepByAlpha(p, alpha) {
  const keep = new Uint8Array(p.length);
  for (let e = 0; e < p.length; e++) keep[e] = p[e] < alpha ? 1 : 0;
  return keep;
}

export function keepByWeight(edges, theta) {
  return Uint8Array.from(edges, ([, , w]) => (w >= theta ? 1 : 0));
}

// Connected components of the kept links by union–find.
export function backboneStats(n, edges, keep) {
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const size = new Int32Array(n).fill(1);
  const attached = new Uint8Array(n);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  let links = 0;
  edges.forEach(([i, j], e) => {
    if (!keep[e]) return;
    links++;
    attached[i] = 1;
    attached[j] = 1;
    let a = find(i), b = find(j);
    if (a === b) return;
    if (size[a] < size[b]) [a, b] = [b, a];
    parent[b] = a;
    size[a] += size[b];
  });
  const compSize = new Map();
  let nAttached = 0;
  for (let v = 0; v < n; v++) {
    if (!attached[v]) continue;
    nAttached++;
    const r = find(v);
    compSize.set(r, (compSize.get(r) || 0) + 1);
  }
  const sizes = [...compSize.entries()].sort((x, y) => y[1] - x[1]);
  const giantRoot = sizes.length ? sizes[0][0] : -1;
  const inGiant = new Uint8Array(n);
  if (giantRoot >= 0) for (let v = 0; v < n; v++) if (attached[v] && find(v) === giantRoot) inGiant[v] = 1;
  return {
    links,
    attached: nAttached,
    giant: sizes.length ? sizes[0][1] : 0,
    second: sizes.length > 1 ? sizes[1][1] : 0,
    attachedMask: attached,
    inGiant,
  };
}

// Per-philosopher stability: across the Louvain runs, the average share of
// runs in which this philosopher shares a community with each other member
// of its consensus community. 1 = never separated from its consensus group.
export function stabilityOf(i, labelRuns, consensus) {
  let total = 0, count = 0;
  const R = labelRuns.length;
  for (let j = 0; j < consensus.length; j++) {
    if (j === i || consensus[j] !== consensus[i]) continue;
    let together = 0;
    for (let r = 0; r < R; r++) if (labelRuns[r][i] === labelRuns[r][j]) together++;
    total += together / R;
    count++;
  }
  return count ? total / count : null;
}

// Normalized mutual information, NMI = 2I / (H1 + H2) (course §4, sklearn default).
export function nmi(a, b) {
  const n = a.length;
  const ca = new Map(), cb = new Map(), cab = new Map();
  for (let i = 0; i < n; i++) {
    ca.set(a[i], (ca.get(a[i]) || 0) + 1);
    cb.set(b[i], (cb.get(b[i]) || 0) + 1);
    const key = a[i] + "|" + b[i];
    cab.set(key, (cab.get(key) || 0) + 1);
  }
  let I = 0;
  for (const [key, nxy] of cab) {
    const [x, y] = key.split("|");
    I += (nxy / n) * Math.log((n * nxy) / (ca.get(+x) * cb.get(+y)));
  }
  const H = (c) => -[...c.values()].reduce((acc, v) => acc + (v / n) * Math.log(v / n), 0);
  const Ha = H(ca), Hb = H(cb);
  return Ha + Hb === 0 ? 1 : (2 * I) / (Ha + Hb);
}

// Accent- and case-insensitive text for the philosopher search.
export function fold(str) {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
