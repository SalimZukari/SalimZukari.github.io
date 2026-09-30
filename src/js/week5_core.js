// Pure computations for the Week 5 page, shared with the Node validator
// (scripts/week5_validate_browser.mjs), which checks each of them against the
// Python pipeline's output. No DOM, no d3.

// Heaps' law V = K * n^beta as a straight line in log-log space: ordinary
// least squares on (log n, log V). Same recipe as fit_power_law() in
// scripts/week5_analyze.py.
export function fitPowerLaw(n, V) {
  const m = n.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < m; i++) {
    const x = Math.log(n[i]), y = Math.log(V[i]);
    sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
  }
  const beta = (m * sxy - sx * sy) / (m * sxx - sx * sx);
  const a = (sy - beta * sx) / m;
  let ssRes = 0;
  for (let i = 0; i < m; i++) {
    const r = Math.log(V[i]) - (a + beta * Math.log(n[i]));
    ssRes += r * r;
  }
  const ssTot = syy - (sy * sy) / m;
  return { K: Math.exp(a), beta, r2: 1 - ssRes / ssTot };
}

// Average log-ratio of a curve to the shuffle mean, last grid point left out
// (every page order ends on the same V(N)). area_stat() in the pipeline.
export function areaStat(V, mean) {
  let s = 0;
  for (let i = 0; i < V.length - 1; i++) s += Math.log(V[i] / mean[i]);
  return s / (V.length - 1);
}

// The CountVectorizer token pattern from the pipeline, (?u)\b[a-z]+(?:-[a-z]+)*\b
// on lowercased text. JavaScript's \b only knows ASCII, so the word
// boundaries are spelled out as Unicode-aware lookarounds.
const TOKEN = /(?<![\p{L}\p{N}_])[a-z]+(?:-[a-z]+)*(?![\p{L}\p{N}_])/gu;
export function tokenizeQuery(text) {
  return String(text).toLowerCase().match(TOKEN) || [];
}

// index = { terms, postings, stopwords, normRaw, normNoStop } from
// data/processed/week5_search.json; postings[t] = [doc, count, doc, count, ...]
export function prepareIndex(index) {
  const termId = new Map();
  index.terms.forEach((t, i) => termId.set(t, i));
  return { ...index, termId, stop: new Set(index.stopwords) };
}

// Bag-of-Words cosine between the query (as a tiny document) and every page.
// Words the corpus has never seen are ignored, as CountVectorizer.transform does.
export function rankPages(index, query, { dropStop = false, top = 8 } = {}) {
  const tokens = tokenizeQuery(query);
  const used = [], ignored = [], dropped = [];
  const q = new Map();
  for (const t of tokens) {
    if (dropStop && index.stop.has(t)) { dropped.push(t); continue; }
    if (!index.termId.has(t)) { ignored.push(t); continue; }
    q.set(t, (q.get(t) || 0) + 1);
    used.push(t);
  }
  const norms = dropStop ? index.normNoStop : index.normRaw;
  const dot = new Float64Array(norms.length);
  const why = new Map(); // doc -> [[term, count in doc]]
  let qn = 0;
  for (const [t, c] of q) {
    qn += c * c;
    const post = index.postings[index.termId.get(t)];
    for (let k = 0; k < post.length; k += 2) {
      dot[post[k]] += c * post[k + 1];
      if (!why.has(post[k])) why.set(post[k], []);
      why.get(post[k]).push([t, post[k + 1]]);
    }
  }
  qn = Math.sqrt(qn);
  const rows = [];
  for (const d of why.keys()) rows.push({ doc: d, score: dot[d] / (qn * norms[d]), terms: why.get(d) });
  rows.sort((a, b) => b.score - a.score || a.doc - b.doc);
  return { tokens, used: [...new Set(used)], ignored: [...new Set(ignored)], dropped: [...new Set(dropped)], results: rows.slice(0, top) };
}
