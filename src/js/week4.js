// Week 4 page: "Where are the borders of philosophy?"
// Loads data/processed/week4.json (scripts/week4_analyze.py) and renders every
// section from it — no number on the page is typed into the HTML. The backbone
// filter, component counts, stability scores and NMI are recomputed in the
// browser by week4_core.js, which scripts/week4_validate_browser.mjs checks
// against the Python output.
import {
  disparityPValues, keepByAlpha, keepByWeight, backboneStats, stabilityOf, fold,
} from "./week4_core.js";

const WEEK4_URL = new URL("../../data/processed/week4.json", import.meta.url);
const d3 = window.d3;

const statusEl = document.getElementById("load-status");
const appEl = document.getElementById("app");
const $ = (id) => document.getElementById(id);

let D; // the JSON
let N; // number of giant-component philosophers
let ADJ; // adjacency: ADJ[i] = [{ j, w, e }]
let BBP; // browser-side disparity p-values
const WHITE = "#f1f3f7"; // runs' communities with no consensus match

init().catch((err) => {
  console.error(err);
  statusEl.innerHTML = `
    <div class="error-banner">
      <h2 style="margin-top:0">Could not load the Week 4 dataset</h2>
      <p>${esc(err.message)}</p>
      <p>From the project root, run:</p>
      <code>npm run analyze:week4</code>
    </div>`;
});

async function init() {
  statusEl.innerHTML = `<div class="loading-banner">Loading Week 4 data…</div>`;
  const res = await fetch(WEEK4_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load ${WEEK4_URL} (HTTP ${res.status}). Run "npm run analyze:week4" to generate it.`);
  D = await res.json();
  N = D.nodes.id.length;
  ADJ = Array.from({ length: N }, () => []);
  D.backbone.edges.forEach(([i, j, w], e) => {
    ADJ[i].push({ j, w, e });
    ADJ[j].push({ j: i, w, e });
  });
  BBP = disparityPValues(N, D.backbone.edges);
  statusEl.innerHTML = "";
  appEl.hidden = false;

  const steps = [renderSummary, renderHook, renderNulls, renderStability, renderInfomap, renderAristotle,
    renderBackbone, renderWeights, renderFinder, renderLlm, renderConclusions];
  for (const step of steps) {
    try {
      step();
    } catch (e) {
      console.error(`Week 4: ${step.name} failed`, e);
    }
  }
}

/* ---------------- helpers ---------------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const f2 = (x) => (x == null ? "–" : (+x).toFixed(2));
const f3 = (x) => (x == null ? "–" : (+x).toFixed(3));
const int = (x) => d3.format(",")(x);
const pct = (x, d = 0) => `${(100 * x).toFixed(d)}%`;
const idx = {};
function index(id) {
  if (!Object.keys(idx).length) D.nodes.id.forEach((v, i) => (idx[v] = i));
  return idx[id];
}
const nm = (i) => D.nodes.name[i];
const nmId = (id) => (index(id) !== undefined ? nm(index(id)) : id.replace(/_/g, " "));
const commRow = (c) => D.communities.rows.find((r) => r.id === c);
const commLabel = (c) => (commRow(c) ? commRow(c).label : "a community outside the consensus");
const commColor = (c) => D.communities.colorOf[c] ?? WHITE;
const swatch = (color) => `<span class="legend-swatch" style="background:${color}"></span>`;
const chip = (c, text) => `<span class="w4-chip">${swatch(commColor(c))}${esc(text ?? commLabel(c) + "'s")}</span>`;
function minmax(a) {
  return [Math.min(...a), Math.max(...a)];
}
function argmin2d(M) {
  let best = [0, 1, Infinity];
  for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) if (M[i][j] < best[2]) best = [i, j, M[i][j]];
  return best;
}
function legendHtml(items) {
  return items.map((it) => `<span class="legend-chip">${swatch(it.color)}${esc(it.label)}</span>`).join("");
}
function consensusLegend(extra = []) {
  return legendHtml([
    ...D.communities.legend.map((l) => ({ color: l.color, label: `${l.label}'s community (${l.size})` })),
    { color: D.communities.grey, label: "smaller communities" },
    ...extra,
  ]);
}
const cons = () => D.louvain.consensus;
// Redraw on width changes only: redrawing changes the element's height, and a
// plain ResizeObserver would call us again for that, forever.
function onWidthChange(el, fn) {
  let last = el.clientWidth, t;
  new ResizeObserver(() => {
    const w = el.clientWidth;
    if (w === last) return;
    last = w;
    clearTimeout(t);
    t = setTimeout(fn, 80);
  }).observe(el);
}
// the Louvain community Infomap cuts into the most modules
const biggestSplit = () => D.infomap.splits.reduce((a, b) => (b.parts.length > a.parts.length ? b : a));

/* ---------------- canvas network ---------------- */
class NetCanvas {
  constructor(wrap, { onHover, onClick } = {}) {
    this.wrap = wrap;
    this.canvas = document.createElement("canvas");
    wrap.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.onHover = onHover;
    this.onClick = onClick;
    this.pickable = () => true;
    const xs = D.nodes.x, ys = D.nodes.y;
    this.b = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    const pick = (ev) => {
      const r = this.canvas.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      let best = -1, bd = 14 * 14;
      for (let i = 0; i < N; i++) {
        if (!this.pickable(i)) continue;
        const dx = this.sx(i) - mx, dy = this.sy(i) - my, dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = i; }
      }
      return best;
    };
    this.canvas.addEventListener("pointermove", (ev) => this.onHover && this.onHover(pick(ev)));
    this.canvas.addEventListener("pointerleave", () => this.onHover && this.onHover(-1));
    this.canvas.addEventListener("click", (ev) => {
      const i = pick(ev);
      if (this.onClick) this.onClick(i);
      else if (this.onHover) this.onHover(i);
    });
    onWidthChange(wrap, () => { this.resize(); this.render(); });
    this.resize();
  }
  resize() {
    const W = Math.max(280, this.wrap.clientWidth);
    const maxH = W < 640 ? W * 1.35 : 660;
    const pad = 14;
    const dx = this.b.x1 - this.b.x0, dy = this.b.y1 - this.b.y0;
    this.k = Math.min((W - 2 * pad) / dx, (maxH - 2 * pad) / dy);
    this.H = dy * this.k + 2 * pad;
    this.ox = (W - dx * this.k) / 2;
    this.oy = pad;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = W * dpr;
    this.canvas.height = this.H * dpr;
    this.canvas.style.height = `${this.H}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = W;
  }
  sx(i) { return this.ox + (D.nodes.x[i] - this.b.x0) * this.k; }
  sy(i) { return this.oy + (D.nodes.y[i] - this.b.y0) * this.k; }
  nodeR(i, scale = 1) { return scale * Math.max(1.3, Math.sqrt(D.nodes.strength[i]) * 0.42) * Math.min(1, this.W / 900 + 0.35); }
  setDraw(fn) { this.drawFn = fn; this.render(); }
  render() {
    if (!this.drawFn) return;
    const c = this.ctx;
    c.clearRect(0, 0, this.W, this.H);
    this.labelBoxes = [];
    this.drawFn(c, this);
  }
  edges(list, style) {
    const c = this.ctx;
    c.lineWidth = style.width || 0.5;
    c.strokeStyle = style.color;
    c.globalAlpha = style.alpha ?? 0.25;
    c.beginPath();
    for (const e of list) {
      const [i, j] = D.backbone.edges[e];
      c.moveTo(this.sx(i), this.sy(i));
      c.lineTo(this.sx(j), this.sy(j));
    }
    c.stroke();
    c.globalAlpha = 1;
  }
  nodes(style) {
    const c = this.ctx;
    for (let i = 0; i < N; i++) {
      const s = style(i);
      if (!s) continue;
      c.globalAlpha = s.alpha ?? 1;
      c.fillStyle = s.color;
      c.beginPath();
      c.arc(this.sx(i), this.sy(i), s.r ?? this.nodeR(i), 0, 2 * Math.PI);
      c.fill();
      if (s.ring) {
        c.lineWidth = 2;
        c.strokeStyle = s.ring;
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }
  // Draws a boxed label above node i, unless it would overlap one already drawn
  // this frame (force = draw anyway, for the selected philosopher).
  label(i, text, force = false) {
    const c = this.ctx;
    c.font = "12px system-ui, sans-serif";
    const y = this.sy(i) - this.nodeR(i) - 6;
    const w = c.measureText(text).width;
    const bx = Math.min(Math.max(2, this.sx(i) - w / 2 - 4), this.W - w - 10);
    const box = [bx, y - 13, w + 8, 17];
    const hit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
    if (!force && this.labelBoxes.some((b) => hit(box, b))) return;
    this.labelBoxes.push(box);
    c.fillStyle = "rgba(5,7,12,0.85)";
    c.fillRect(...box);
    c.fillStyle = "#fff";
    c.fillText(text, bx + 4, y);
  }
}

const BACKBONE_02 = () => D.backbone.three["0.2"];

/* ---------------- search box (shared by explorer + finder) ---------------- */
function searchIndex() {
  const items = D.nodes.id.map((id, i) => ({ id, i, name: nm(i), f: fold(nm(i)), deg: D.nodes.degree[i] }));
  for (const id of D.roster.notInGiant) {
    const name = id.replace(/_/g, " ");
    items.push({ id, i: -1, name, f: fold(name), deg: 0 });
  }
  return items;
}
let SEARCH;
function setupSearch(input, box, onPick, { includeOutside = true } = {}) {
  SEARCH = SEARCH || searchIndex();
  let active = -1, matches = [];
  const close = () => {
    box.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };
  const pick = (m) => {
    input.value = m.name;
    close();
    onPick(m);
  };
  const draw = () => {
    box.innerHTML = matches
      .map((m, k) => `<button type="button" role="option" id="${input.id}-opt-${k}" aria-selected="${k === active}" data-k="${k}">${esc(m.name)}${m.i < 0 ? " <small>(not in giant component)</small>" : ""}</button>`)
      .join("");
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => pick(matches[+b.dataset.k])));
    if (active >= 0) input.setAttribute("aria-activedescendant", `${input.id}-opt-${active}`);
  };
  input.addEventListener("input", () => {
    const q = fold(input.value.trim());
    if (!q) return close();
    matches = SEARCH.filter((m) => (includeOutside || m.i >= 0) && m.f.includes(q))
      .sort((a, b) => (b.f.startsWith(q) - a.f.startsWith(q)) || b.deg - a.deg)
      .slice(0, 8);
    if (!matches.length) return close();
    active = -1;
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
    draw();
  });
  input.addEventListener("keydown", (ev) => {
    if (box.hidden) return;
    if (ev.key === "ArrowDown") { active = Math.min(matches.length - 1, active + 1); draw(); ev.preventDefault(); }
    else if (ev.key === "ArrowUp") { active = Math.max(0, active - 1); draw(); ev.preventDefault(); }
    else if (ev.key === "Enter") { pick(matches[Math.max(0, active)]); ev.preventDefault(); }
    else if (ev.key === "Escape") close();
  });
  document.addEventListener("click", (e) => {
    if (!input.parentElement.contains(e.target)) close();
  });
}

/* ---------------- summary ---------------- */
function renderSummary() {
  const L = D.louvain, NP = D.nulls.philosophers, NM = D.nulls.marvel, I = D.infomap, B = D.backbone, G = D.graph;
  const border = L.borderDwellers.slice(0, 4).map(nmId).join(", ");
  const split = biggestSplit();
  $("wk4-asked").textContent =
    "Are the communities of philosophy a finding, or an artefact of the decisions that drew them? How far do the " +
    "borders move when we change the seed, the algorithm, the overlap method, the weights or the backbone's α, and " +
    "which philosophers live on those borders?";
  $("wk4-did").textContent =
    `Ran Louvain with ${L.seeds.length} seeds on the undirected, unweighted giant component (${int(G.nGiant)} philosophers, ` +
    `${int(G.mGiant)} links) and against ${NP.config.values.length} configuration-model shuffles, ${NP.swap.values.length} double-edge swaps ` +
    `and ${NP.gnm.values.length} G(n, m) graphs, with the identical pipeline on Marvel; built a consensus partition; ran Infomap; ` +
    `k-clique communities for k = 3–6 and our own implementation of link clustering; weighted Louvain; and our own disparity filter ` +
    `over ${B.sweep.filter((r) => r[0] <= 0.5).length} values of α.`;
  $("wk4-found").textContent =
    `The communities are real: Q = ${f3(NP.realMean)} against ${f3(NP.config.mean)} for shuffles (z ≈ ${Math.round(NP.config.z)}), where Marvel ` +
    `clears its null by only ${f2(NM.config.diff)}. The borders are not: ten runs agree at NMI ${f2(L.nmiMin)}–${f2(L.nmiMax)}, and the least ` +
    `stable philosophers (${border}) sit where antiquity, scholasticism and early science meet. Infomap splits ${commLabel(split.louvain)}'s ` +
    `community into ${split.parts.length} modules too small for modularity to see, and the backbone's giant component breaks at ` +
    `α ≈ ${B.break.alpha}, held together by ${nmId(B.break.breaker.node)}.`;
  const A = aristotleNumbers();
  $("wk4-surprised").textContent =
    `Aristotle's largest link community (${A.c0Links} of his ${A.deg} links) runs from Greek commentators through the Islamic and ` +
    `scholastic Aristotelians: one context that Louvain has to cut into ${A.c0Trads} pieces. And Infomap still finds ` +
    `${I.null.nModulesMin}–${I.null.nModulesMax} modules on shuffled networks; the tell is that they compress the walk by ` +
    `${pct(I.null.savingsMean, 2)}, against ${pct(I.savings, 1)} on the real one.`;
  $("wk4-graphnote").textContent =
    `Unless a result says otherwise, it's on the undirected, unweighted giant component: ${int(G.nGiant)} of the ${int(G.n)} ` +
    `philosophers and ${int(G.mGiant)} of the ${int(G.mUndirected)} links (directed edges summed over both directions). The node roster is ` +
    `loaded first, so the ${G.notInGiant} philosophers outside the giant component (isolates and small pieces) are never silently dropped; ` +
    `they're searchable below but belong to no community here.`;
}

/* ---------------- 1. hook ---------------- */
function renderHook() {
  const L = D.louvain;
  const [cmin, cmax] = minmax(L.nComm), [qmin, qmax] = minmax(L.q);
  $("hook-lede").innerHTML =
    `Louvain (networkx, resolution 1) on the undirected, unweighted giant component with seed 0 gives ` +
    `<strong>${L.nComm[0]} communities at Q = ${f3(L.q[0])}</strong>, with names straight out of a philosophy syllabus: ` +
    D.louvain.seed0.slice(0, 8).map((r) => esc(r.label)).join(", ") + `. It looks like a finding. Now press through the other seeds.`;
  const wrap = $("hook-buttons");
  const opts = [...L.seeds.map((s) => ({ key: s, label: `Seed ${s}` })), { key: "consensus", label: "Consensus" }];
  wrap.innerHTML = opts.map((o) => `<button class="btn" data-k="${o.key}" aria-pressed="false">${o.label}</button>`).join("");
  let current = 0;
  const net = new NetCanvas($("hook-canvas"));
  const edges02 = BACKBONE_02();
  const labelsFor = () => (current === "consensus" ? cons() : L.aligned[current]);
  net.setDraw((c, n) => {
    const lab = labelsFor();
    n.edges(edges02, { color: "#8a93a8", alpha: 0.18 });
    n.nodes((i) => ({ color: commColor(lab[i]), r: n.nodeR(i, 0.85) }));
  });
  const show = (key) => {
    current = key === "consensus" ? "consensus" : +key;
    wrap.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === String(key))));
    net.render();
    const ar = index("Aristotle");
    if (current === "consensus") {
      const [a, b] = minmax(L.consensusNmiToRuns);
      $("hook-readout").innerHTML = `<strong>Consensus of the ten runs:</strong> ${L.consensusN} communities, Q = ${f3(L.consensusQ)} on the original graph; NMI with the individual runs ${f2(a)}–${f2(b)}. Aristotle is in ${esc(commLabel(cons()[ar]))}'s community.`;
    } else {
      const lab = L.aligned[current];
      let moved = 0;
      for (let i = 0; i < N; i++) if (lab[i] !== cons()[i]) moved++;
      $("hook-readout").innerHTML =
        `<strong>Seed ${current}:</strong> ${L.nComm[current]} communities, Q = ${f3(L.q[current])}; NMI with seed 0 = ${f2(L.nmi[0][current])}. ` +
        `${int(moved)} philosophers (${pct(moved / N)}) are in a different community than in the consensus. Aristotle: ${esc(L.aristotleByRun[current])}'s community.`;
    }
  };
  wrap.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => show(b.dataset.k)));
  show(0);
  $("hook-legend").innerHTML = consensusLegend([{ color: WHITE, label: "a run's community with no consensus match" }]);
  $("hook-caption").textContent =
    `Graph: undirected, unweighted giant component (${int(D.graph.nGiant)} philosophers). Colours: the chosen run's communities, each matched to the ` +
    `consensus community it overlaps most (Hungarian matching), so a colour change means a philosopher really moved. Positions and the faint links: ` +
    `the α = 0.2 disparity backbone (section 6); the communities themselves are always detected on the full network. Null for this Q: section 2.`;
  $("hook-honest").innerHTML =
    `So here's the honest version of the claim. In every run, Louvain finds between ${cmin} and ${cmax} communities with Q between ` +
    `${f3(qmin)} and ${f3(qmax)}, and any two runs agree at an NMI between ${f2(L.nmiMin)} and ${f2(L.nmiMax)}. The big blocks survive every ` +
    `seed. The borders between them, and the number of small groups, are properties of the run.`;
}

/* ---------------- 2. nulls ---------------- */
function renderNulls() {
  const NP = D.nulls.philosophers, NM = D.nulls.marvel, G = D.graph;
  $("nulls-lede").textContent =
    `Every Q here is Louvain's, on the unweighted giant component, compared with Louvain run on ${NP.config.values.length} randomised copies ` +
    `of the same network, three ways: configuration-model shuffles (each philosopher keeps their degree; stubs rewired, then multi-links and ` +
    `self-loops dropped, which leaves ${int(NP.config.meanEdges)} of ${int(NP.m)} links on average), strict double-edge swaps (exact degrees, no ` +
    `link lost) and G(n, m) graphs (same number of nodes and links, degrees scrambled). Marvel goes through the identical code.`;

  const series = [
    { key: "config", label: "configuration model", color: "#56B4E9" },
    { key: "swap", label: "double-edge swap", color: "#009E73" },
    { key: "gnm", label: "G(n, m)", color: "#CC79A7" },
  ];
  const visible = new Set(series.map((s) => s.key));
  $("nulls-toggles").innerHTML =
    series.map((s) => `<button class="legend-chip" data-k="${s.key}" aria-pressed="true">${swatch(s.color)}${s.label}</button>`).join("") +
    `<span class="legend-chip">${swatch("#ff3d68")}real network (10 seeds: band = range, line = mean)</span>`;
  const panels = [
    { title: `Philosophers (${int(G.nGiant)} nodes)`, d: NP },
    { title: `Marvel (${NM.n} nodes)`, d: NM },
  ];
  const draw = () => {
    const el = $("nulls-chart");
    el.innerHTML = "";
    const W = Math.max(300, el.clientWidth), rowH = 26, panelH = rowH * 3 + 46, M = { l: 90, r: 16, t: 8, b: 34 };
    const H = panels.length * panelH + M.b;
    const all = panels.flatMap((p) => [...series.flatMap((s) => p.d[s.key].values), p.d.realMin, p.d.realMax]);
    const x = d3.scaleLinear().domain([d3.min(all) - 0.01, d3.max(all) + 0.01]).range([M.l, W - M.r]);
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
    panels.forEach((p, pi) => {
      const y0 = M.t + pi * panelH;
      svg.append("text").attr("x", M.l).attr("y", y0 + 12).attr("font-weight", 700).text(`${p.title}: real Q ${f3(p.d.realMean)}`);
      svg.append("rect").attr("x", x(p.d.realMin)).attr("width", Math.max(2, x(p.d.realMax) - x(p.d.realMin)))
        .attr("y", y0 + 20).attr("height", rowH * 3).attr("fill", "#ff3d68").attr("opacity", 0.25);
      svg.append("line").attr("x1", x(p.d.realMean)).attr("x2", x(p.d.realMean)).attr("y1", y0 + 20).attr("y2", y0 + 20 + rowH * 3)
        .attr("stroke", "#ff3d68").attr("stroke-width", 2);
      series.forEach((s, si) => {
        const yc = y0 + 20 + rowH * si + rowH / 2;
        svg.append("text").attr("x", M.l - 8).attr("y", yc + 4).attr("text-anchor", "end").text(s.label.replace("configuration model", "config.").replace("double-edge swap", "swap"));
        if (!visible.has(s.key)) return;
        const st = p.d[s.key];
        svg.append("g").selectAll("circle").data(st.values).join("circle")
          .attr("cx", (v) => x(v)).attr("cy", (_, k) => yc + ((k * 7) % 11) - 5).attr("r", 4)
          .attr("fill", s.color).attr("fill-opacity", 0.85)
          .on("mouseenter click", (_, v) => {
            $("nulls-readout").innerHTML = `<strong>${esc(p.title)}</strong>, ${s.label}: Q = ${f3(v)} (all ${st.values.length}: ${f3(st.mean)} ± ${f3(st.sd)}). Real: ${f3(p.d.realMean)} (${f3(p.d.realMin)}–${f3(p.d.realMax)}), z = ${Math.round(st.z)}.`;
          });
      });
    });
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b + 6})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(W / 90))));
    svg.append("text").attr("x", (M.l + W - M.r) / 2).attr("y", H - 2).attr("text-anchor", "middle").text("Louvain modularity Q (unweighted)");
  };
  $("nulls-toggles").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.k;
      visible.has(k) ? visible.delete(k) : visible.add(k);
      b.setAttribute("aria-pressed", String(visible.has(k)));
      draw();
    })
  );
  draw();
  onWidthChange($("nulls-chart"), draw);

  const stat = (v, l) => `<div class="w4-stat"><span class="v">${v}</span><span class="l">${l}</span></div>`;
  $("nulls-stats").innerHTML = [
    stat(f3(NP.realMean), "philosophers: real Q (mean of 10 seeds)"),
    stat(`${f3(NP.config.mean)} ± ${f3(NP.config.sd)}`, "philosophers: configuration-model null"),
    stat(`+${f3(NP.config.diff)}`, `philosophers: real − null (z ≈ ${Math.round(NP.config.z)})`),
    stat(f3(NM.realMean), "Marvel: real Q (mean of 10 seeds)"),
    stat(`${f3(NM.config.mean)} ± ${f3(NM.config.sd)}`, "Marvel: configuration-model null"),
    stat(`+${f3(NM.config.diff)}`, `Marvel: real − null (z ≈ ${Math.round(NM.config.z)})`),
  ].join("");
  $("nulls-caption").textContent =
    `Graphs: undirected, unweighted giant components (philosophers ${int(G.nGiant)} / ${int(G.mGiant)}; Marvel ${NM.n} / ${int(NM.m)}). ` +
    `Method: networkx Louvain, seeds 0–9 on the real network, one seed per null graph; ${NP.config.values.length} null graphs of each kind. ` +
    `z = (mean real Q − null mean) / null sd, against the configuration model. The course's philosopher null (0.228 ± 0.002) matches our ` +
    `configuration model (${f3(NP.config.mean)} ± ${f3(NP.config.sd)}); a strict swap gives ${f3(NP.swap.mean)}. For Marvel the course's 0.25 ` +
    `matches the swap (${f3(NM.swap.mean)}); the configuration model gives ${f3(NM.config.mean)}. Which null you pick moves the second decimal, not the conclusion.`;
  const cn = NP.configNmiBetweenSeeds, gn = NP.gnmNmiBetweenSeeds;
  $("nulls-why-nonzero").innerHTML =
    `Because the optimiser searches. With thousands of links there's always some way to draw borders that fewer links cross than the degrees ` +
    `predict, and Louvain is built to find it: on the shuffled philosophers it reaches Q = ${f3(NP.config.mean)}. The stability check sees what ` +
    `the score can't. Two Louvain seeds on the <em>same</em> shuffled graph agree at an NMI of only ${f2(Math.min(...cn))}–${f2(Math.max(...cn))} ` +
    `(G(n, m): ${f2(Math.min(...gn))}–${f2(Math.max(...gn))}), against ${f2(D.louvain.nmiMin)}–${f2(D.louvain.nmiMax)} on the real network. ` +
    `A score with no structure behind it doesn't reproduce.`;
}

/* ---------------- 3. stability ---------------- */
function renderStability() {
  const L = D.louvain, NM = D.nulls.marvel;
  const [cmin, cmax] = minmax(L.nComm), [qmin, qmax] = minmax(L.q);
  const lo = argmin2d(L.nmi), hi = (() => {
    let b = [0, 1, -1];
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) if (L.nmi[i][j] > b[2]) b = [i, j, L.nmi[i][j]];
    return b;
  })();
  $("stab-lede").innerHTML =
    `Ten runs (seeds 0–9) of the same algorithm on the same graph give ${cmin}–${cmax} communities with Q from ${f3(qmin)} to ${f3(qmax)}: ` +
    `almost the same score for quite different partitions. The heatmap shows how much each pair agrees. <strong>The lowest pairwise ` +
    `agreement is NMI ${f2(lo[2])}</strong> (seeds ${lo[0]} and ${lo[1]}), the highest ${f2(hi[2])} (seeds ${hi[0]} and ${hi[1]}). On Marvel the same ten seeds ` +
    `agree at ${f2(NM.nmiMin)}–${f2(NM.nmiMax)} (seeds 0 and 1: ${f2(NM.nmi01)}).`;
  const nets = {
    phil: { label: "Philosophers", M: L.nmi, nC: L.nComm, q: L.q },
    marvel: { label: "Marvel", M: NM.nmiMatrix, nC: NM.nComm, q: NM.q },
  };
  $("nmi-toggle").innerHTML = Object.entries(nets).map(([k, v]) => `<button class="btn" data-k="${k}" aria-pressed="${k === "phil"}">${v.label}</button>`).join("");
  let cur = "phil";
  const color = d3.scaleSequential(d3.interpolateViridis).domain([0.5, 1]);
  const draw = () => {
    const net = nets[cur];
    const el = $("nmi-chart");
    el.innerHTML = "";
    const W = Math.min(520, Math.max(300, el.clientWidth)), M = { l: 34, t: 10, r: 60, b: 34 }, cell = (W - M.l - M.r) / 10;
    const H = M.t + 10 * cell + M.b;
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
    const lowP = argmin2d(net.M);
    const readout = (i, j) => {
      $("nmi-readout").innerHTML = i === j
        ? `<strong>${net.label}, seed ${i}</strong>: ${net.nC[i]} communities, Q = ${f3(net.q[i])}.`
        : `<strong>${net.label}, seeds ${i} and ${j}</strong>: NMI ${f3(net.M[i][j])}. Seed ${i}: ${net.nC[i]} communities (Q ${f3(net.q[i])}); seed ${j}: ${net.nC[j]} (Q ${f3(net.q[j])}).`;
    };
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        svg.append("rect").attr("class", "cell").attr("x", M.l + j * cell).attr("y", M.t + i * cell).attr("width", cell - 1).attr("height", cell - 1)
          .attr("fill", i === j ? "#26304a" : color(net.M[i][j])).attr("tabindex", i < j ? 0 : null)
          .attr("stroke", (i === lowP[0] && j === lowP[1]) || (i === lowP[1] && j === lowP[0]) ? "#ff3d68" : null).attr("stroke-width", 2)
          .attr("aria-label", i === j ? null : `Seeds ${i} and ${j}: NMI ${f3(net.M[i][j])}`)
          .on("mouseenter click focus", () => readout(i, j));
      }
      svg.append("text").attr("x", M.l - 6).attr("y", M.t + i * cell + cell / 2 + 4).attr("text-anchor", "end").text(i);
      svg.append("text").attr("x", M.l + i * cell + cell / 2).attr("y", M.t + 10 * cell + 14).attr("text-anchor", "middle").text(i);
    }
    svg.append("text").attr("x", M.l + 5 * cell).attr("y", H - 4).attr("text-anchor", "middle").text("Louvain seed (red outline = lowest agreement)");
    const gx = W - M.r + 18, gh = 10 * cell;
    const defs = svg.append("defs").append("linearGradient").attr("id", "nmigrad").attr("x1", 0).attr("x2", 0).attr("y1", 1).attr("y2", 0);
    d3.range(0, 1.01, 0.1).forEach((t) => defs.append("stop").attr("offset", t).attr("stop-color", color(0.5 + 0.5 * t)));
    svg.append("rect").attr("x", gx).attr("y", M.t).attr("width", 10).attr("height", gh).attr("fill", "url(#nmigrad)");
    [0.5, 0.75, 1].forEach((v) => svg.append("text").attr("x", gx + 14).attr("y", M.t + gh * (1 - (v - 0.5) / 0.5) + 4).text(v.toFixed(2)));
    readout(lowP[0], lowP[1]);
  };
  $("nmi-toggle").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      cur = b.dataset.k;
      $("nmi-toggle").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      draw();
    })
  );
  draw();
  const cn = D.nulls.philosophers.configNmiBetweenSeeds;
  $("nmi-caption").textContent =
    `Graphs: undirected, unweighted giant components. Method: networkx louvain_communities (resolution γ = 1), seeds 0–9. NMI = 2I / (H₁ + H₂), ` +
    `our implementation, checked against sklearn's normalized_mutual_info_score. Null: two seeds on a configuration-model shuffle of the philosophers ` +
    `agree at NMI ${f2(Math.min(...cn))}–${f2(Math.max(...cn))}. Colour scale fixed at 0.5–1 for both networks.`;

  const [a, b] = minmax(L.consensusNmiToRuns);
  $("stab-consensus").innerHTML =
    `To get one partition out of ten, we count how often each pair of philosophers shares a community (the co-assignment matrix), keep the pairs ` +
    `that are together in at least half the runs (threshold τ = ${D.meta.params.consensusTau}, our choice), and run Louvain on that weighted graph ` +
    `with all ten seeds, repeating until every seed returns the same partition (Lancichinetti &amp; Fortunato 2012). Here that took ` +
    `${L.consensusIters} round${L.consensusIters > 1 ? "s" : ""}. The consensus has <strong>${L.consensusN} communities</strong>, Q = ${f3(L.consensusQ)} on the original ` +
    `graph, and agrees with the individual runs at NMI ${f2(a)}–${f2(b)}. Each philosopher then gets a <strong>stability score</strong>: the average ` +
    `share of runs in which they share a community with each other member of their consensus community (1 = never separated from it). ` +
    `${L.neverMove ? `${L.neverMove} philosophers score a perfect 1.` : "Nobody scores a perfect 1: every consensus community loses someone in some run."} Some pairs:`;
  $("stab-pairs").innerHTML = L.pairs
    .map((p) => `<span class="w4-chip">${esc(nmId(p.a))} &amp; ${esc(nmId(p.b))}: together in ${p.together} of ${p.of} runs</span>`)
    .join("");
  const rows = L.borderDwellers.map((id) => {
    const i = index(id);
    return `<tr><td>${esc(nm(i))}</td><td class="num">${D.nodes.degree[i]}</td><td class="num">${f2(L.stability[i])}</td><td class="num">${L.distinct[i]}</td><td>${chip(cons()[i])}</td></tr>`;
  });
  $("stab-table").innerHTML =
    `<table class="data-table"><caption class="chart-caption" style="caption-side:bottom;text-align:left">The least stable philosophers with degree ≥ 15. ` +
    `"Communities" counts how many different (consensus-matched) communities the ten runs put them in.</caption>` +
    `<thead><tr><th>Philosopher</th><th class="num">Degree</th><th class="num">Stability</th><th class="num">Communities</th><th>Consensus</th></tr></thead>` +
    `<tbody>${rows.join("")}</tbody></table>`;
  const st = L.stability.filter((x) => x != null);
  const med = d3.median(st);
  $("stab-border-text").innerHTML =
    `The median philosopher scores ${f2(med)}. The border-dwellers aren't random, though: ${L.borderDwellers.slice(0, 8).map((id) => esc(nmId(id))).join(", ")}. ` +
    `Reading their articles, these are mostly Renaissance natural philosophers and early scientists whose pages link into the ancient, scholastic, ` +
    `Islamic and early-modern traditions at once. That reading is ours; the network only says the partition is least sure about them. It's also where ` +
    `the history itself is most tangled.`;
}

/* ---------------- 4. infomap ---------------- */
function renderInfomap() {
  const I = D.infomap, L = D.louvain, META = D.metadata;
  const im = I.labels;
  const mod = (m) => I.modules.find((x) => x.id === m);
  $("im-lede").innerHTML =
    `Infomap (Rosvall &amp; Bergstrom's map equation) asks a different question: how compactly can you describe a random walk on the network? ` +
    `On the same undirected, unweighted giant component (two-level, seed 1, best of 10 trials) it finds <strong>${I.nModules} modules</strong> ` +
    `(${I.nModulesAtLeast10} with at least 10 philosophers), where the Louvain consensus has ${L.consensusN}. NMI between the two partitions: ` +
    `<strong>${f2(I.nmiVsConsensus)}</strong>, about as much as two Louvain seeds agree with each other (${f2(L.nmiMin)}–${f2(L.nmiMax)}).`;
  const stat = (v, l) => `<div class="w4-stat"><span class="v">${v}</span><span class="l">${l}</span></div>`;
  const [sm0, sm1] = minmax(I.seedModules);
  $("im-stats").innerHTML = [
    stat(I.nModules, "Infomap modules (undirected)"),
    stat(f2(I.nmiVsConsensus), "NMI, Infomap vs Louvain consensus"),
    stat(pct(I.savings, 1), "code length saved vs one module"),
    stat(pct(I.null.savingsMean, 2), `saved on shuffles (mean of ${I.null.n})`),
    stat(`${f2(I.seedNmiMin)}–${f2(I.seedNmiMax)}`, `NMI between 10 Infomap seeds (${sm0}–${sm1} modules)`),
    stat(I.directed.nModules, `directed Infomap modules (NMI ${f2(I.directed.nmiVsUndirected)} with undirected)`),
  ].join("");

  // contingency heatmap
  const lvRows = D.communities.rows.filter((r) => r.size >= D.meta.params.minColored).map((r) => r.id);
  const imCols = I.modules.filter((m) => m.size >= 10).map((m) => m.id);
  const cellMembers = (r, c) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const rr = lvRows.includes(cons()[i]) ? cons()[i] : "small";
      const cc = imCols.includes(im[i]) ? im[i] : "other";
      if (rr === r && cc === c) out.push(i);
    }
    return out.sort((a, b) => D.nodes.degree[b] - D.nodes.degree[a]);
  };
  const hasSmall = cons().some((c) => !lvRows.includes(c));
  const rowsK = hasSmall ? [...lvRows, "small"] : lvRows, colsK = [...imCols, "other"];
  const counts = rowsK.map((r) => colsK.map((c) => cellMembers(r, c)));
  const drawMatrix = () => {
    const el = $("im-matrix");
    el.innerHTML = "";
    const avail = el.clientWidth;
    const M = { l: 150, t: 8, r: 70, b: 130 };
    const cell = Math.max(18, Math.min(34, (Math.max(avail, 560) - M.l - M.r) / colsK.length));
    const W = M.l + M.r + cell * colsK.length, H = M.t + M.b + cell * rowsK.length;
    el.style.overflowX = "auto";
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
    const max = d3.max(counts.flat(), (x) => x.length);
    // start the ramp above magma's near-black end so a count of 1 still shows on the dark panel
    const color = d3.scaleSequentialLog((t) => d3.interpolateMagma(0.3 + 0.7 * t)).domain([1, max]);
    rowsK.forEach((r, ri) => {
      svg.append("circle").attr("cx", 10).attr("cy", M.t + ri * cell + cell / 2).attr("r", 5).attr("fill", r === "small" ? D.communities.grey : commColor(r));
      svg.append("text").attr("x", 20).attr("y", M.t + ri * cell + cell / 2 + 4).text(r === "small" ? "smaller groups" : `${commLabel(r)}'s`);
      colsK.forEach((c, ci) => {
        const mem = counts[ri][ci];
        const g = svg.append("rect").attr("class", "cell").attr("x", M.l + ci * cell).attr("y", M.t + ri * cell)
          .attr("width", cell - 1).attr("height", cell - 1).attr("fill", mem.length ? color(mem.length) : "#141a2a");
        if (!mem.length) return;
        g.attr("tabindex", 0).attr("aria-label", `${mem.length} philosophers`).on("mouseenter click focus", () => {
          const cl = c === "other" ? "the smaller Infomap modules" : `Infomap's module around ${mod(c).label}`;
          const rl = r === "small" ? "Louvain's smaller groups" : `Louvain's ${commLabel(r)} community`;
          $("im-matrix-readout").innerHTML = `<strong>${mem.length}</strong> philosophers in ${esc(rl)} and ${esc(cl)}: ${mem.slice(0, 8).map((i) => esc(nm(i))).join(", ")}${mem.length > 8 ? ", …" : ""}`;
        });
        if (cell >= 22) svg.append("text").attr("x", M.l + ci * cell + cell / 2).attr("y", M.t + ri * cell + cell / 2 + 4)
          .attr("text-anchor", "middle").attr("font-size", 9).attr("pointer-events", "none")
          .style("fill", mem.length > max / 10 ? "#0b1020" : "#eef1fb").text(mem.length);
      });
    });
    colsK.forEach((c, ci) => {
      svg.append("text").attr("transform", `translate(${M.l + ci * cell + cell / 2 + 4},${M.t + rowsK.length * cell + 6}) rotate(60)`)
        .attr("font-size", 10).text(c === "other" ? "other modules" : mod(c).label);
    });
  };
  drawMatrix();
  onWidthChange($("im-matrix"), drawMatrix);

  // network with the disagreement highlighted
  const disputed = new Set(I.disputed.map(index));
  const modeDefs = [{ key: "disputed", label: `All disputed philosophers (${disputed.size})` },
    ...I.splits.map((s) => ({ key: `split-${s.louvain}`, label: `${commLabel(s.louvain)}'s → ${s.parts.length} Infomap modules`, split: s }))];
  $("im-buttons").innerHTML = modeDefs.map((m, k) => `<button class="btn" data-k="${k}" aria-pressed="${k === 0}">${esc(m.label)}</button>`).join("");
  const tab = ["#e15759", "#4e79a7", "#f28e2b", "#76b7b2", "#59a14f", "#edc948", "#b07aa1"];
  let mode = modeDefs[0];
  const net = new NetCanvas($("im-canvas"), {
    onHover: (i) => {
      if (i < 0) return;
      const m = mod(im[i]);
      $("im-canvas-readout").innerHTML = `<strong>${esc(nm(i))}</strong>: Louvain ${esc(commLabel(cons()[i]))}'s community; Infomap module around ${esc(m ? m.label : "?")} (${m ? m.size : "?"} philosophers)${disputed.has(i) ? " — <strong>disputed</strong>" : ""}.`;
    },
  });
  net.setDraw((c, n) => {
    n.edges(BACKBONE_02(), { color: "#8a93a8", alpha: 0.12 });
    if (!mode.split) {
      n.nodes((i) => (disputed.has(i) ? null : { color: "#5a6275", alpha: 0.35, r: n.nodeR(i, 0.7) }));
      n.nodes((i) => (disputed.has(i) ? { color: commColor(cons()[i]), r: n.nodeR(i, 1.2) + 1.5, ring: "#ffffff" } : null));
    } else {
      const parts = mode.split.parts.map((p) => p.module);
      n.nodes((i) => (cons()[i] === mode.split.louvain ? null : { color: "#5a6275", alpha: 0.3, r: n.nodeR(i, 0.7) }));
      n.nodes((i) => {
        if (cons()[i] !== mode.split.louvain) return null;
        const k = parts.indexOf(im[i]);
        return { color: k >= 0 ? tab[k] : "#cccccc", r: n.nodeR(i, 1.15) + 1 };
      });
    }
  });
  const setMode = (k) => {
    mode = modeDefs[k];
    $("im-buttons").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.k === k)));
    net.render();
    if (!mode.split) {
      $("im-canvas-readout").innerHTML = `${disputed.size} philosophers sit in an Infomap module dominated by a <em>different</em> Louvain community than their own; they're drawn in their Louvain colour with a white ring. Hover or tap one.`;
    } else {
      const s = mode.split;
      $("im-canvas-readout").innerHTML = `Louvain's ${esc(commLabel(s.louvain))} community (${s.size} philosophers), coloured by Infomap module: ` +
        s.parts.map((p, k) => `<span class="w4-chip">${swatch(tab[k])}${esc(mod(p.module).label)} — ${p.n} (${mod(p.module).internalLinks} internal links)</span>`).join("") + " Grey: the rest.";
    }
  };
  $("im-buttons").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setMode(+b.dataset.k)));
  setMode(0);
  $("im-caption").textContent =
    `Graph: undirected, unweighted giant component. Louvain: consensus of seeds 0–9. Infomap: two-level, undirected, unweighted, seed 1, best of 10 ` +
    `trials; modules named after their highest-degree member. "Disputed" = philosophers whose Infomap module is dominated by a different Louvain ` +
    `community than their own. Infomap's null: its code length on ${I.null.n} configuration-model shuffles. Positions: the α = 0.2 backbone layout.`;

  const merged = I.modules.filter((m) => I.splits.some((s) => s.parts.some((p) => p.module === m.id)));
  const small = merged.filter((m) => m.belowResolution);
  const near = merged.filter((m) => !m.belowResolution && m.internalLinks < 1.25 * I.sqrt2m);
  const leg = D.resolution.legalists, legHome = D.resolution.legalistsHome;
  $("im-why").innerHTML =
    `<p><strong>The resolution limit.</strong> Modularity scores every pair of groups against the degree null, and the expected number of links ` +
    `between two small groups, d<sub>a</sub>d<sub>b</sub>/2m, shrinks as the network grows. Below roughly √(2m) ≈ ${Math.round(I.sqrt2m)} internal ` +
    `links, a single link between two groups already counts as "more than expected", so merging them raises Q. Louvain merges ${merged.length} of ` +
    `Infomap's modules into four bigger communities (the buttons above); ${small.length} of them have fewer internal links than that threshold: ` +
    `${small.map((m) => `${esc(m.label)} (${m.internalLinks})`).join(", ")}. ${near.length} more sit just above it ` +
    `(${near.map((m) => `${esc(m.label)} ${m.internalLinks}`).join(", ")}), where the limit is a rough guide rather than a hard line; the ` +
    `remaining ${merged.length - small.length - near.length} are the big cores the others are merged into. Infomap's random walker has no such threshold: if a walker stays inside a small, tight group for a while, a separate codebook for it pays off. ` +
    (leg ? `The course's own example checks out too: the Legalists, a k = 5 clique community of ${leg.size} philosophers with ${leg.internalLinks} links among ` +
      `them, all sit inside ${esc(legHome.label)}'s community in our consensus. With resolution γ = 2, Louvain finds ${minmax(D.resolution.gamma2Unweighted).join("–")} communities instead.` : "") + `</p>` +
    `<p><strong>Infomap's own null.</strong> Infomap isn't immune to noise either: on shuffled networks it still reports ${I.null.nModulesMin}–${I.null.nModulesMax} ` +
    `modules. But those compress the random walk by only ${pct(I.null.savingsMean, 2)} (at most ${pct(I.null.savingsMax, 2)}), against ${pct(I.savings, 1)} on the ` +
    `real network. That compression is the number to read, not the module count.</p>` +
    `<p><strong>Direction.</strong> Infomap can also follow the links' direction: the walker only goes where an article links out. Directed Infomap ` +
    `finds ${I.directed.nModules} modules (NMI ${f2(I.directed.nmiVsUndirected)} with the undirected run). Many articles cite Aristotle or Kant without being ` +
    `cited back, so a directed walker gets caught in smaller "who cites whom" basins. We compare the undirected runs, so both methods see the same graph.</p>`;

  const rows = [
    ["Communities / modules", L.consensusN, I.nModules],
    [`NMI with the era column (${int(META.era.n)} philosophers)`, f2(META.era.consensus), f2(I.nmiEra)],
    ["AMI with the era column (chance-corrected)", f2(META.era.amiConsensus), f2(I.amiEra)],
    [`NMI with Wikidata movement (${META.movement.n} labelled)`, f2(META.movement.consensus), f2(I.nmiMovement)],
    ["AMI with Wikidata movement (chance-corrected)", f2(META.movement.amiConsensus), f2(I.amiMovement)],
    ["Agreement between 10 seeds (NMI)", `${f2(L.nmiMin)}–${f2(L.nmiMax)}`, `${f2(I.seedNmiMin)}–${f2(I.seedNmiMax)}`],
  ];
  $("im-history").innerHTML = `<table class="data-table"><thead><tr><th>Undirected, unweighted giant component</th><th class="num">Louvain consensus</th><th class="num">Infomap</th></tr></thead>` +
    `<tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td></tr>`).join("")}</tbody></table>` +
    `<p class="chart-caption">Movement: Wikidata P135, fetched ${esc(META.movementFetchedAt)}; a philosopher with several movements gets the one most common in the network. ` +
    `NMI rises with the number of groups, which is why we also show AMI, which corrects for chance agreement.</p>`;
  const imMov = I.amiMovement > META.movement.amiConsensus, lvEra = META.era.amiConsensus > I.amiEra;
  $("im-verdict").innerHTML =
    `<strong>Which tells the better history?</strong> Against Wikidata's movement labels ${imMov ? "Infomap" : "Louvain"} does better even after the chance ` +
    `correction (AMI ${f2(I.amiMovement)} vs ${f2(META.movement.amiConsensus)}); against the century lists ${lvEra ? "Louvain" : "Infomap"} does ` +
    `(${f2(META.era.amiConsensus)} vs ${f2(I.amiEra)}). Our reading: Infomap tells the finer history of <em>schools</em>, splitting apart groups that ` +
    `modularity is structurally unable to separate. Louvain tells the coarser history of <em>civilisations and periods</em>. Neither is "the" history: ` +
    `both are partitions of who links to whom on Wikipedia, and the metadata they're scored against is someone else's reading of the same people.`;
}

/* ---------------- 5. Aristotle ---------------- */
function aristotleNumbers() {
  const A = D.linkcomm.aristotle;
  const ai = index("Aristotle");
  const c0 = A.communities[0].id;
  const c0links = A.links.filter((l) => l[1] === c0);
  const byTrad = d3.rollups(c0links, (v) => v.length, (l) => cons()[l[0]]).sort((a, b) => b[1] - a[1]);
  const none = A.links.filter((l) => l[1] < 0);
  const noneByTrad = d3.rollups(none, (v) => v.length, (l) => cons()[l[0]]).sort((a, b) => b[1] - a[1]);
  const nbTrad = A.neighborsByTradition;
  return {
    ai, deg: D.nodes.degree[ai], c0, c0Links: c0links.length, c0Trads: byTrad.filter(([, n]) => n >= 10).length,
    byTrad, none: none.length, noneByTrad, nbTrad, ownShare: nbTrad.find(([t]) => t === cons()[ai])[1] / D.nodes.degree[ai],
  };
}
function renderAristotle() {
  const LC = D.linkcomm, A = LC.aristotle, KC = D.kclique, L = D.louvain;
  const X = aristotleNumbers();
  const own = cons()[X.ai];
  const runsOwn = L.aristotleByRun.filter((x) => x === commLabel(own)).length;
  const others = L.aristotleByRun.filter((x) => x !== commLabel(own));
  $("ar-lede").innerHTML =
    `Any partition has to put Aristotle in exactly one place, and gets the others wrong. Louvain puts him in ${esc(commLabel(own))}'s community ` +
    `in ${runsOwn} of 10 runs${others.length ? ` (the others: ${others.map(esc).join(", ")})` : ""}. His ${X.deg} neighbours tell a different story: ` +
    `only ${pct(X.ownShare)} of them are in that community.`;
  const lcById = (c) => LC.communities[c];
  const topC = A.communities.slice(0, 5).map((c) => c.id);
  const lcColors = ["#c77dff", "#48cae4", "#ff8fab", "#7ae582", "#ffd166"]; // bright: readable on the dark panel
  const lcCol = (c) => (c < 0 ? "#3a4154" : topC.includes(c) ? lcColors[topC.indexOf(c)] : "#8a93a8");
  const lcName = (c) => (c < 0 ? "no community of 3+ links" : lcById(c).top.filter((v) => v !== "Aristotle").slice(0, 3).map(nmId).join(" · "));
  const rank = (c) => D.communities.rows.findIndex((r) => r.id === c);
  const links = [...A.links].sort((a, b) => {
    const ka = topC.includes(a[1]) ? topC.indexOf(a[1]) : a[1] >= 0 ? 90 : 99, kb = topC.includes(b[1]) ? topC.indexOf(b[1]) : b[1] >= 0 ? 90 : 99;
    return ka - kb || rank(cons()[a[0]]) - rank(cons()[b[0]]) || b[2] - a[2];
  });
  const modes = [{ key: "link", label: "Link community" }, { key: "louvain", label: "Neighbour's Louvain community" }, { key: "weight", label: "Link weight" }];
  $("ar-buttons").innerHTML = modes.map((m) => `<button class="btn" data-k="${m.key}" aria-pressed="${m.key === "link"}">${m.label}</button>`).join("");
  let mode = "link";
  const wmax = d3.max(links, (l) => l[2]);
  const wColor = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, wmax]);
  const colorOf = (l) => (mode === "link" ? lcCol(l[1]) : mode === "louvain" ? commColor(cons()[l[0]]) : wColor(l[2]));
  const draw = () => {
    const el = $("ar-chart");
    el.innerHTML = "";
    const S = Math.min(560, Math.max(290, el.clientWidth)), R = S / 2 - 12;
    const svg = d3.select(el).append("svg").attr("width", S).attr("height", S).attr("viewBox", `0 0 ${S} ${S}`).style("display", "block").style("margin", "0 auto");
    const g = svg.append("g").attr("transform", `translate(${S / 2},${S / 2})`);
    const step = (2 * Math.PI) / links.length;
    g.selectAll("line").data(links).join("line")
      .attr("x1", 0).attr("y1", 0)
      .attr("x2", (_, k) => R * Math.cos(-Math.PI / 2 + k * step)).attr("y2", (_, k) => R * Math.sin(-Math.PI / 2 + k * step))
      .attr("stroke", colorOf).attr("stroke-width", (l) => 0.6 + 0.45 * l[2]).attr("stroke-opacity", 0.9)
      .on("mouseenter click", (_, l) => {
        $("ar-readout").innerHTML = `Aristotle — <strong>${esc(nm(l[0]))}</strong> (weight ${l[2]}): link community <em>${esc(lcName(l[1]))}</em>; ` +
          `${esc(nm(l[0]))} is in ${esc(commLabel(cons()[l[0]]))}'s Louvain community.`;
      });
    g.append("circle").attr("r", 9).attr("fill", "#eef1fb");
    g.append("text").attr("y", 26).attr("text-anchor", "middle").attr("font-weight", 700).style("fill", "#eef1fb").text("Aristotle");
    let items;
    if (mode === "link") {
      const other = A.communities.slice(5).reduce((s, c) => s + c.links, 0);
      items = [...A.communities.slice(0, 5).map((c) => ({ color: lcCol(c.id), label: `${lcName(c.id)}… (${c.links})` })),
        { color: "#8a93a8", label: `${A.communities.length - 5} smaller link communities (${other})` },
        { color: "#3a4154", label: `no community of 3+ links (${A.linksInSmallCommunities})` }];
    } else if (mode === "louvain") {
      items = A.neighborsByTradition.map(([t, n]) => ({ color: commColor(t), label: `${commLabel(t)}'s (${n})` }));
    } else {
      items = [1, 2, 4, 8, wmax].map((w) => ({ color: wColor(w), label: `weight ${w}` }));
    }
    $("ar-legend").innerHTML = legendHtml(items);
  };
  $("ar-buttons").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.k;
      $("ar-buttons").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      draw();
    })
  );
  draw();
  onWidthChange($("ar-chart"), draw);
  const S = LC.summary;
  $("ar-caption").textContent =
    `Graph: undirected giant component (spoke width = link weight, both directions summed). Link communities: our implementation of Ahn, Bagrow & ` +
    `Lehmann (2010): the similarity of two links sharing a node is the Jaccard index of the other two endpoints' inclusive neighbourhoods; single-linkage ` +
    `clustering of all ${int(S.links)} links; cut at maximum partition density D = ${f3(S.bestD)} (similarity ${f3(S.cutSimilarity)}), giving ` +
    `${S.nAtLeast3} link communities of 3+ links (the course's single cut: 0.054 and 444). Link communities of 1–2 links count as none. ` +
    `Louvain colours: consensus. Spokes are sorted by link community, then by the neighbour's Louvain community.`;

  const tradList = (arr) => arr.map(([t, n]) => `${n} in ${esc(commLabel(t))}'s`).join(", ");
  const k5 = KC.membership["5"][X.ai].map((c) => KC.communities["5"][c]);
  $("ar-argument").innerHTML =
    `<p><strong>Link communities.</strong> ${X.c0Links} of his ${X.deg} links fall into one link community (${lcById(X.c0).links} links in total). ` +
    `The philosophers at the other end of those links are ${tradList(X.byTrad)}. That single context runs from the Greek commentators through ` +
    `the Islamic and scholastic Aristotelians, a tradition modularity has to cut into ${X.c0Trads} pieces because each piece is denser on its own. ` +
    `Another ${A.communities.length - 1} small link communities hold ${A.communities.slice(1).reduce((s, c) => s + c.links, 0)} links, and ` +
    `<strong>${X.none} links (${pct(X.none / X.deg)}) belong to no community at all</strong>: ${tradList(X.noneByTrad.slice(0, 4))}. They're ` +
    `passing mentions, mostly from the modern traditions, and share no context with each other.</p>` +
    `<p><strong>k-cliques.</strong> At k = 5 he's in ${k5.length} clique communities: ${k5.map((c) => `${esc(c.label)} (${c.size})`).join("; ")}.</p>` +
    `<p><strong>Our answer.</strong> Aristotle is in the <em>Aristotelian</em> tradition, and that tradition isn't one of the Louvain communities: it's ` +
    `a thread through ${X.c0Trads} of them. The figure's two colourings are the argument. By neighbour he belongs everywhere; by context he belongs ` +
    `mostly to one long line of commentary, plus a halo of links that no method assigns.</p>`;

  const kt = KC.table;
  $("kc-table").innerHTML = `<table class="data-table"><thead><tr><th class="num">k</th><th class="num">Communities</th><th class="num">Largest</th>` +
    `<th class="num">Philosophers in any</th><th class="num">In 2+</th><th class="num">In none</th><th class="num">Aristotle in</th></tr></thead><tbody>` +
    kt.map((r) => `<tr><td class="num">${r.k}</td><td class="num">${r.communities}</td><td class="num">${int(r.largest)}</td><td class="num">${int(r.placed)} (${pct(r.placedShare)})</td>` +
      `<td class="num">${r.inTwoOrMore}</td><td class="num">${int(r.noCommunity)}</td><td class="num">${KC.membership[String(r.k)][X.ai].length}</td></tr>`).join("") +
    `</tbody></table><p class="chart-caption">Graph: undirected, unweighted giant component (${int(D.graph.nGiant)} philosophers). Method: networkx k_clique_communities (clique percolation). Reproduces the course's table exactly.</p>`;
  const k3 = kt.find((r) => r.k === 3), k6 = kt.find((r) => r.k === 6);
  const k5v = (id) => KC.membership["5"][index(id)].length;
  $("kc-text").innerHTML =
    `Small k percolates: at k = 3 one community holds ${int(k3.largest)} philosophers. Large k leaves most people out: at k = 6, ${int(k6.noCommunity)} of ` +
    `${int(D.graph.nGiant)} philosophers (${pct(k6.noCommunity / D.graph.nGiant)}) are in no community at all. There's no right k. We report k = 5 because it's where ` +
    `separate schools appear without losing most of the network; there Aristotle is in ${k5v("Aristotle")} communities and Augustine, Aquinas and ` +
    `Nietzsche in ${k5v("Augustine_of_Hippo")}, ${k5v("Thomas_Aquinas")} and ${k5v("Friedrich_Nietzsche")}.`;
  $("ar-handful").innerHTML = `<table class="data-table"><thead><tr><th>Philosopher</th><th class="num">Degree</th><th class="num">Louvain stability</th>` +
    `<th class="num">k = 5 communities</th><th class="num">Link communities (3+)</th><th class="num">Communities per link</th></tr></thead><tbody>` +
    LC.handful.map((h) => `<tr><td>${esc(nmId(h.id))}</td><td class="num">${h.degree}</td><td class="num">${f2(h.stability)}</td><td class="num">${h.k5}</td>` +
      `<td class="num">${h.linkComms}</td><td class="num">${f3(h.ratio)}</td></tr>`).join("") + `</tbody></table>`;
  const wc = D.nodes.id.filter((_, i) => LC.covered[i] >= 0.5 * D.nodes.degree[i]).length;
  $("lc-ratio-text").innerHTML =
    `How many communities a philosopher is in mostly tracks their degree: the Spearman correlation with degree is ${f2(S.spearmanCountDegreeAll)} counting ` +
    `every link community and ${f2(S.spearmanCountDegree3)} counting only those with 3+ links (the course's Goodies box reports 0.83 for the adaptive ` +
    `cut). So we divide by degree: <strong>communities per link</strong>. We only rank the ${int(wc)} philosophers with at least half their links in ` +
    `real (3+ link) communities. Otherwise a low ratio would just mean "the method left them out".`;
  const li = (id) => {
    const i = index(id);
    return `<li><strong>${esc(nm(i))}</strong>: ${LC.membership[i].length} communities from ${D.nodes.degree[i]} links (${f2(LC.ratio[i])})</li>`;
  };
  $("lc-lists").innerHTML =
    `<div><h3>Multi-context bridges <small>(degree ≥ 20, highest ratio)</small></h3><ul class="findings-list">${LC.bridges.slice(0, 8).map(li).join("")}</ul></div>` +
    `<div><h3>One-direction hubs <small>(degree ≥ 30, lowest ratio)</small></h3><ul class="findings-list">${LC.hubs.slice(0, 8).map(li).join("")}</ul></div>`;
  $("lc-limit").innerHTML =
    `<strong>The limitation.</strong> Overlap methods are bad at the sparse, non-overlapping parts of a network. ${int(S.unassigned)} of ` +
    `${int(D.graph.nGiant)} philosophers have no link in any link community of 3+ links, and the k-clique method leaves ` +
    kt.map((r) => `${int(r.noCommunity)} (k = ${r.k})`).join(", ") + ` philosophers in no community. They aren't unaffiliated; the method just ` +
    `can't see them. A partition at least puts everyone somewhere. It's wrong about the overlap nodes instead.`;
}

/* ---------------- 6. backbone ---------------- */
function renderBackbone() {
  const W = D.weights, B = D.backbone, G = D.graph, mo = B.moses;
  const dl = W.top["Diogenes_Laertius"];
  $("bb-lede").innerHTML =
    `Weights first. Summing both directions, link weights run from ${W.weightRange[0]} to ${W.weightRange[1]}, and ${int(W.weightOne)} of ` +
    `${int(G.mGiant)} links (${pct(W.weightOne / G.mGiant)}) have weight 1. Strength (summed weight) and degree rank philosophers almost ` +
    `identically (Spearman ${f2(W.spearman)}), but not quite: Diogenes Laertius is ${dl.degreeRank}th by degree (${dl.degree}) and ` +
    `${dl.strengthRank}th by strength (${dl.strength}), and the philosophers furthest above the strength–degree fit are ` +
    `${W.outliers.map((v) => esc(nmId(v))).join(", ")}. The strongest ties: ` +
    `${W.strongest.slice(0, 3).map((e) => `${esc(nmId(e.a))}–${esc(nmId(e.b))} (${e.w})`).join(", ")}. A weight of ${W.strongest[0].w} between two pages ` +
    `says something a single link doesn't, and that's what a backbone should keep.`;
  $("fig8-caption").innerHTML =
    `<strong>Strength vs degree.</strong> Graph: undirected, weighted giant component (weight = how many times either article links the other, both ` +
    `directions summed). Log axes; dashed line: least-squares fit in log–log (slope ${f2(W.fit.slope)}). Labelled: Aristotle and the four philosophers ` +
    `with degree ≥ 10 furthest above the fit.`;
  $("bb-formula").innerHTML =
    `<p>For a link and one of its ends i, with degree k<sub>i</sub> and strength s<sub>i</sub>: p<sub>ij</sub> = w<sub>ij</sub>/s<sub>i</sub>. Under the ` +
    `null (i's strength spread uniformly at random over its k<sub>i</sub> links), the chance of a share at least that big is ` +
    `(1 − p<sub>ij</sub>)<sup>k<sub>i</sub>−1</sup>. We keep a link if that is below α at <em>either</em> end (so a degree-1 end can never make a link ` +
    `significant). No library: it's the formula, in Python and again in your browser.</p>` +
    `<p><strong>Worked example, reproduced exactly.</strong> Aristotle–Moses of Narbonne, weight ${mo.w}. For Moses (strength ${mo.sMoses} over ` +
    `${mo.kMoses} links): (1 − ${mo.w}/${mo.sMoses})<sup>${mo.kMoses - 1}</sup> = ${f2(mo.pMoses)} &lt; 0.2, so it's kept, for his sake. For Aristotle ` +
    `(strength ${mo.sAristotle}, ${mo.kAristotle} links) the same link scores ${f2(mo.pAristotle)}. At α = 0.2 his side needs more than ` +
    `${pct(mo.aristotleNeedsShare, 2)} of his strength, a weight of ${mo.aristotleNeedsWeight} or more.</p>`;
  $("bb-table").innerHTML = `<table class="data-table"><thead><tr><th>Filter</th><th class="num">Links kept</th><th class="num">Philosophers with a link</th><th class="num">Giant component</th></tr></thead><tbody>` +
    B.table.map((r) => `<tr><td>disparity α = ${r.alpha}</td><td class="num">${int(r.links)} (${pct(r.share)})</td><td class="num">${int(r.nodes)}</td><td class="num">${int(r.giant)}</td></tr>`).join("") +
    B.thresholds.map((r) => `<tr><td>threshold w ≥ ${r.w}</td><td class="num">${int(r.links)} (${pct(r.links / G.mGiant)})</td><td class="num">${int(r.nodes)}</td><td class="num">${int(r.giant)}</td></tr>`).join("") +
    `</tbody></table><p class="chart-caption">Graph: undirected, weighted giant component (${int(G.nGiant)} philosophers, ${int(G.mGiant)} links). The α rows and the three thresholds reproduce the course's table exactly.</p>`;
  const a02 = B.table.find((r) => r.alpha === 0.2), t3 = B.thresholds.find((r) => r.w === 3), fv = B.filterVsThreshold;
  const tieKeys = Object.keys(fv.onlyFilterStrongestTie);
  $("bb-vs").innerHTML =
    `At α = 0.2 the filter keeps ${int(a02.links)} links, close to the ${int(t3.links)} of the w ≥ 3 threshold, but attaches ${int(a02.nodes)} philosophers ` +
    `against ${int(t3.nodes)}. <strong>${fv.onlyFilter} philosophers are kept by the filter and dropped by the threshold</strong>, and for ` +
    `${tieKeys.length === 1 ? `every one of them the strongest tie has weight ${tieKeys[0]}` : "them the strongest ties are small"}: everything to ` +
    `them, nothing to the hub at the other end${fv.mosesAmongThem ? " (Moses of Narbonne is one)" : ""}. The threshold keeps ${fv.onlyThreshold} ` +
    `philosophers the filter drops. The strongest link the filter throws away at 0.2 has weight ${fv.strongestDroppedByFilter.w} ` +
    `(${esc(nmId(fv.strongestDroppedByFilter.a))}–${esc(nmId(fv.strongestDroppedByFilter.b))}); the threshold throws away, among others, ` +
    `Aristotle–Isaac Newton (weight ${fv.aristotleNewtonWeight}).`;

  renderSweep();
  renderBreak();
  renderExplorer();

  const three = D.meta.params.figureAlphas.map((a) => B.sweep.find((r) => Math.abs(r[0] - a) < 1e-9));
  $("fig6-caption").innerHTML =
    `<strong>The same backbone at three values of α.</strong> ` +
    three.map((r) => `α = ${r[0]}: ${int(r[1])} links (${int(G.mGiant - r[1])} removed), ${int(r[2])} philosophers attached, giant component ${int(r[3])}`).join("; ") +
    `. Filter: disparity filter, significant at either end. Positions fixed (the α = 0.2 layout) so links visibly drop out; colour: consensus Louvain ` +
    `communities of the full unweighted network; size: strength.`;
  const L = D.louvain;
  $("fig7-caption").innerHTML =
    `<strong>The α = 0.2 backbone, by the course's five drawing rules.</strong> (1) <em>Backbone first:</em> disparity filter at α = 0.2 keeps ` +
    `${int(a02.links)} of ${int(G.mGiant)} links (${pct(a02.share)}) and ${int(a02.nodes)} of ${int(G.nGiant)} philosophers. It removes ` +
    `${int(G.mGiant - a02.links)} links and leaves ${int(G.nGiant - a02.nodes)} philosophers with no significant tie, who aren't drawn. ` +
    `(2) <em>Layout of the backbone only:</em> ForceAtlas2 on the backbone's giant component (${int(a02.giant)}), its small components on a shelf below. ` +
    `(3) <em>Colour by community detected on the full data:</em> the ${L.consensusN}-community consensus of ten Louvain runs on the full unweighted ` +
    `giant component, never on the backbone; communities under ${D.meta.params.minColored} philosophers in grey. (4) <em>Size:</em> strength. ` +
    `(5) <em>Labels:</em> the ten philosophers with the highest strength.`;
}

function renderSweep() {
  const B = D.backbone, G = D.graph;
  const rows = B.sweep.filter((r) => r[0] <= 0.5);
  const series = [
    { key: 2, label: "philosophers attached", color: "#56B4E9", den: G.nGiant },
    { key: 3, label: "giant component", color: "#ff3d68", den: G.nGiant },
    { key: 4, label: "second-largest component", color: "#4ade80", den: G.nGiant },
    { key: 1, label: "links kept (share of links)", color: "#a7b0c8", den: G.mGiant, dash: "4 3" },
  ];
  const visible = new Set(series.map((s) => s.key));
  $("sweep-toggles").innerHTML = series.map((s) => `<button class="legend-chip" data-k="${s.key}" aria-pressed="true">${swatch(s.color)}${s.label}</button>`).join("");
  const hinges = B.hinges.filter((h) => h.soleBridge && h.alpha <= 0.5);
  let marker = null;
  const readAt = (a) => {
    const r = rows.reduce((best, x) => (Math.abs(x[0] - a) < Math.abs(best[0] - a) ? x : best), rows[0]);
    $("sweep-readout").innerHTML = `<strong>α = ${r[0].toFixed(3)}</strong>: ${int(r[1])} links kept (${pct(r[1] / G.mGiant)}), ${int(r[2])} philosophers attached, ` +
      `giant component ${int(r[3])} (${pct(r[3] / G.nGiant)}), second-largest ${int(r[4])}.`;
    return r;
  };
  const draw = () => {
    const el = $("sweep-chart");
    el.innerHTML = "";
    const W = Math.max(300, el.clientWidth), H = W < 600 ? 260 : 320, M = { l: 44, r: 12, t: 12, b: 38 };
    const x = d3.scaleLinear().domain([0, 0.5]).range([M.l, W - M.r]);
    const y = d3.scaleLinear().domain([0, 1]).range([H - M.b, M.t]);
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`).call(d3.axisBottom(x).ticks(W < 500 ? 5 : 10));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));
    svg.append("text").attr("x", (M.l + W - M.r) / 2).attr("y", H - 4).attr("text-anchor", "middle").text("disparity-filter level α");
    for (const s of series) {
      if (!visible.has(s.key)) continue;
      svg.append("path").datum(rows).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", s.key === 3 ? 2.5 : 1.6)
        .attr("stroke-dasharray", s.dash || null).attr("d", d3.line().x((r) => x(r[0])).y((r) => y(r[s.key] / s.den)));
    }
    const bx = x(B.break.alpha);
    svg.append("line").attr("x1", bx).attr("x2", bx).attr("y1", M.t).attr("y2", H - M.b).attr("stroke", "#ffd23f").attr("stroke-dasharray", "2 3");
    svg.append("text").attr("x", bx + 4).attr("y", M.t + 12).style("fill", "#ffd23f").text(`break α ≈ ${B.break.alpha}`);
    if (visible.has(3)) {
      svg.append("g").selectAll("path").data(hinges).join("path")
        .attr("d", d3.symbol(d3.symbolTriangle, 46)).attr("fill", "#ffd23f")
        .attr("transform", (h) => `translate(${x(h.alpha)},${y(h.giantAfter / G.nGiant) - 9}) rotate(180)`)
        .on("mouseenter click", (_, h) => {
          $("sweep-readout").innerHTML = `<strong>Hinge at α = ${f3(h.alpha)}</strong>: below it the link ${esc(nmId(h.a))}–${esc(nmId(h.b))} drops out and ` +
            `${h.group.size} philosophers (${h.group.top.slice(0, 3).map((v) => esc(nmId(v))).join(", ")}, …) detach from the giant component (${int(h.giantAfter)} → ${int(h.giantBefore)}).`;
        })
        .append("title").text((h) => `${nmId(h.a)}–${nmId(h.b)}`);
    }
    marker = svg.append("line").attr("y1", M.t).attr("y2", H - M.b).attr("stroke", "#eef1fb").attr("stroke-opacity", 0.6).attr("visibility", "hidden");
    svg.append("rect").attr("x", M.l).attr("y", M.t).attr("width", W - M.l - M.r).attr("height", H - M.t - M.b).attr("fill", "transparent")
      .lower()
      .on("mousemove click", (ev) => {
        const [mx] = d3.pointer(ev);
        const r = readAt(x.invert(mx));
        marker.attr("x1", x(r[0])).attr("x2", x(r[0])).attr("visibility", "visible");
      });
    SWEEP_MARK = (a) => marker && marker.attr("x1", x(a)).attr("x2", x(a)).attr("visibility", "visible");
  };
  $("sweep-toggles").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      const k = +b.dataset.k;
      visible.has(k) ? visible.delete(k) : visible.add(k);
      b.setAttribute("aria-pressed", String(visible.has(k)));
      draw();
    })
  );
  draw();
  onWidthChange($("sweep-chart"), draw);
  $("sweep-caption").textContent =
    `Graph: undirected, weighted giant component. Method: our disparity filter at ${rows.length} values of α from ${rows[0][0]} to 0.5 (step ` +
    `${D.meta.params.sweepStep}); a link is kept if significant at either end, and components are counted on kept links only. Shares are of the ` +
    `${int(G.nGiant)} philosophers (links: of ${int(G.mGiant)}). Dotted line: the break (where the second-largest component peaks). Triangles: single ` +
    `links whose loss detaches a group of 10 or more philosophers from the giant component.`;
}
let SWEEP_MARK = () => {};

function renderBreak() {
  const B = D.backbone, br = B.break, bk = br.breaker, G = D.graph;
  const at = (a) => B.sweep.find((r) => Math.abs(r[0] - a) < 1e-9);
  const p = bk.piecesInfo;
  const runner = br.articulationTop[1];
  $("bb-break").innerHTML =
    `<p><strong>Where it breaks.</strong> Tightening α, the giant component shrinks steadily (${[0.3, 0.2, 0.1].map((a) => `${int(at(a)[3])} at α = ${a}`).join(", ")}), ` +
    `but it doesn't break until <strong>α ≈ ${br.alpha}</strong>. That's where the second-largest component peaks (${br.secondLargest} philosophers, against a ` +
    `largest of ${br.giantAtBreak}). Below it there's no giant component, just pieces of comparable size: the finite-size signature of a percolation ` +
    `transition. That's our definition of "breaks". The sweep chart shows the whole curve, so you can pick another.</p>` +
    `<p><strong>Whose links break it.</strong> Just above the break (α = ${br.alphaAbove}) the giant component holds ${br.giantAbove} philosophers. Of its ` +
    `articulation points, the one whose removal leaves the smallest largest piece is <strong>${esc(nmId(bk.node))}</strong>. Remove him and it splits into ` +
    `${bk.pieces.filter((x) => x > 1).join(" + ")} (plus ${bk.nPieces - bk.pieces.filter((x) => x > 1).length} singletons): ` +
    `${p[0].top.map(nmId).map(esc).join(", ")} on one side, reached through ${p[0].viaNeighbors.map(nmId).map(esc).join(" and ")}, and ` +
    `${p[1].top.map(nmId).map(esc).join(", ")} on the other, through ${p[1].viaNeighbors.map(nmId).map(esc).join(" and ")}. At the break, ancient and scholastic ` +
    `philosophy hang onto early-modern philosophy through a single humanist (the historical reading is ours). The runner-up is ${esc(nmId(runner.node))} ` +
    `(largest piece ${runner.largestAfter}).</p>` +
    `<p><strong>It comes apart one tradition at a time.</strong> Well before the break, whole traditions detach through one link each. The table lists ` +
    `every single link whose loss, as α drops past its own significance, cuts 10 or more philosophers off the giant component.</p>`;
  const hs = B.hinges.filter((h) => h.soleBridge);
  const skipped = B.hinges.length - hs.length;
  $("bb-hinges").innerHTML = `<table class="data-table"><thead><tr><th class="num">Below α</th><th>Link that drops</th><th class="num">Detached</th><th>Who (highest degree)</th><th class="num">Giant</th></tr></thead><tbody>` +
    hs.map((h) => `<tr><td class="num">${f3(h.alpha)}</td><td>${esc(nmId(h.a))}–${esc(nmId(h.b))}</td><td class="num">${h.group.size}</td>` +
      `<td>${chip(h.group.louvain, h.group.top.slice(0, 3).map(nmId).join(", "))}</td><td class="num">${int(h.giantAfter)} → ${int(h.giantBefore)}</td></tr>`).join("") +
    `</tbody></table><p class="chart-caption">Graph: undirected, weighted giant component; disparity filter. Chip colour: the consensus Louvain community most of the detached group belongs to.` +
    `${skipped ? ` ${skipped} more candidate${skipped > 1 ? "s" : ""} left out because another link with exactly the same significance joins the same pieces, so no single link is responsible.` : ""}</p>`;
}

function renderExplorer() {
  const B = D.backbone, G = D.graph;
  const edges = B.edges;
  const st = { mode: "alpha", alpha: 0.2, theta: 3, sel: -1, hover: -1 };
  let keep, stats;
  const strongestTop = D.weights.topStrength.map(index);
  const alphaIn = $("ex-alpha"), thrIn = $("ex-thr");
  $("ex-alpha-marks").innerHTML = [B.break.alpha, ...D.meta.params.courseAlphas].map((a) => `<option value="${a}"></option>`).join("");
  const net = new NetCanvas($("ex-canvas"), {
    onHover: (i) => { st.hover = i; net.render(); describe(); },
    onClick: (i) => { st.sel = i; st.hover = -1; net.render(); describe(); },
  });
  net.pickable = (i) => true;
  const recompute = () => {
    keep = st.mode === "alpha" ? keepByAlpha(BBP.p, st.alpha) : keepByWeight(edges, st.theta);
    stats = backboneStats(N, edges, keep);
    const stat = (v, l) => `<div class="w4-stat"><span class="v">${v}</span><span class="l">${l}</span></div>`;
    $("ex-stats").innerHTML = [
      stat(int(stats.links), `links kept (${pct(stats.links / G.mGiant)})`),
      stat(int(stats.attached), `philosophers attached (${pct(stats.attached / G.nGiant)})`),
      stat(int(stats.giant), "giant component"),
      stat(int(stats.second), "second-largest component"),
    ].join("");
    if (st.mode === "alpha") SWEEP_MARK(st.alpha);
    net.render();
    describe();
  };
  net.setDraw((c, n) => {
    if (!keep) return;
    const kept = [];
    for (let e = 0; e < edges.length; e++) if (keep[e]) kept.push(e);
    n.edges(kept, { color: "#9aa3b8", alpha: 0.28, width: 0.6 });
    n.nodes((i) => stats.attachedMask[i] ? null : { color: "#4a5165", alpha: 0.45, r: 1.4 });
    n.nodes((i) => stats.attachedMask[i] ? { color: commColor(cons()[i]), alpha: stats.inGiant[i] ? 1 : 0.6, r: n.nodeR(i) } : null);
    const focus = st.hover >= 0 ? st.hover : st.sel;
    if (focus >= 0) {
      const kp = ADJ[focus].filter((a) => keep[a.e]).map((a) => a.e), dr = ADJ[focus].filter((a) => !keep[a.e]).map((a) => a.e);
      c.setLineDash([3, 3]);
      n.edges(dr, { color: "#ff3d68", alpha: 0.55, width: 0.8 });
      c.setLineDash([]);
      n.edges(kp, { color: "#ffffff", alpha: 0.95, width: 1.4 });
      n.nodes((i) => (i === focus ? { color: commColor(cons()[i]), r: n.nodeR(i) + 3, ring: "#ffffff" } : null));
      n.label(focus, nm(focus), true);
    } else {
      strongestTop.slice(0, n.W < 640 ? 4 : 8).forEach((i) => stats.attachedMask[i] && n.label(i, nm(i)));
    }
  });
  const describe = () => {
    const i = st.hover >= 0 ? st.hover : st.sel;
    if (i < 0) {
      $("ex-readout").innerHTML = `Hover or tap a philosopher, or type a name above, to list which of their ties survive this filter (green) and which are dropped (red).`;
      return;
    }
    const ties = ADJ[i].map((a) => ({ ...a, p: BBP.pEnds[a.e], kept: keep[a.e] })).sort((a, b) => b.w - a.w);
    const pOwn = (t) => (D.backbone.edges[t.e][0] === i ? t.p[0] : t.p[1]);
    const fmtTie = (t) => `${esc(nm(t.j))} (w ${t.w}${st.mode === "alpha" ? `, p ${f3(Math.min(t.p[0], t.p[1]))}` : ""})`;
    const kp = ties.filter((t) => t.kept), dr = ties.filter((t) => !t.kept);
    $("ex-readout").innerHTML =
      `<strong>${esc(nm(i))}</strong> — ${esc(commLabel(cons()[i]))}'s community, degree ${D.nodes.degree[i]}, strength ${D.nodes.strength[i]}` +
      `${stats.attachedMask[i] ? (stats.inGiant[i] ? ", in the giant component" : ", attached but outside the giant component") : ", <strong>no surviving tie</strong>"}.<br>` +
      `<span class="kept">Surviving (${kp.length}):</span> ${kp.slice(0, 8).map(fmtTie).join(", ") || "none"}${kp.length > 8 ? ", …" : ""}<br>` +
      `<span class="dropped">Dropped</span> (${dr.length}): ${dr.slice(0, 8).map(fmtTie).join(", ") || "none"}${dr.length > 8 ? ", …" : ""}` +
      (st.mode === "alpha" && ties.length ? `<br><small>p = the smaller of the two ends' significance; the link survives if p &lt; α. For ${esc(nm(i))}'s own side, the strongest tie scores ${f3(pOwn(ties[0]))}.</small>` : "");
  };
  const setMode = (m) => {
    st.mode = m;
    $("ex-mode-alpha").setAttribute("aria-checked", String(m === "alpha"));
    $("ex-mode-alpha").setAttribute("aria-pressed", String(m === "alpha"));
    $("ex-mode-thr").setAttribute("aria-checked", String(m === "thr"));
    $("ex-mode-thr").setAttribute("aria-pressed", String(m === "thr"));
    $("ex-alpha-wrap").hidden = m !== "alpha";
    $("ex-thr-wrap").hidden = m !== "thr";
    recompute();
  };
  $("ex-mode-alpha").addEventListener("click", () => setMode("alpha"));
  $("ex-mode-thr").addEventListener("click", () => setMode("thr"));
  $("ex-break").addEventListener("click", () => {
    setMode("alpha");
    alphaIn.value = B.break.alphaAbove;
    st.alpha = B.break.alphaAbove;
    $("ex-alpha-out").textContent = st.alpha.toFixed(3);
    st.sel = index(B.break.breaker.node);
    $("ex-search").value = nm(st.sel);
    recompute();
  });
  alphaIn.addEventListener("input", () => {
    st.alpha = +alphaIn.value;
    $("ex-alpha-out").textContent = st.alpha.toFixed(3);
    recompute();
  });
  thrIn.addEventListener("input", () => {
    st.theta = +thrIn.value;
    $("ex-thr-out").textContent = st.theta;
    recompute();
  });
  setupSearch($("ex-search"), $("ex-suggestions"), (m) => {
    if (m.i < 0) return;
    st.sel = m.i;
    st.hover = -1;
    net.render();
    describe();
  }, { includeOutside: false });
  $("ex-legend").innerHTML = consensusLegend([{ color: "#4a5165", label: "no surviving tie" }]);
  $("ex-caption").textContent =
    `Graph: undirected, weighted giant component. Positions: the α = 0.2 backbone layout, fixed so you can watch links drop out. Colour: consensus Louvain ` +
    `community, detected on the full unweighted network and never on the backbone; faded colour = attached but outside the giant component. Size: strength. ` +
    `The filter and the component counts are recomputed in your browser from the raw weights, and checked against the Python output at every α in the ` +
    `course's table plus ${15} sampled values (npm run validate:week4). "Jump to the break" sets α just above the break and selects ${nmId(B.break.breaker.node)}.`;
  setMode("alpha");
  st.sel = -1;
  describe();
}

/* ---------------- 7. weights ---------------- */
function renderWeights() {
  const W = D.weights.louvain, WN = D.weights.weightNull, L = D.louvain, NP = D.nulls.philosophers;
  const [c0, c1] = minmax(W.nComm), [q0, q1] = minmax(W.qs);
  $("w-lede").innerHTML =
    `Weighted Louvain (the same giant component, weights = summed link counts, strengths in place of degrees; seeds 0–9) finds ${c0}–${c1} ` +
    `communities. Its consensus has ${W.consensusN}, and agrees with the unweighted consensus at <strong>NMI ${f2(W.nmiVsUnweighted)}</strong>. That's ` +
    `lower than the best agreement between two unweighted seeds (${f2(L.nmiMax)}): adding weights moves more than reseeding does. ` +
    `${int(W.nMovers)} philosophers (${pct(W.nMovers / N)}) change community.`;
  const stat = (v, l) => `<div class="w4-stat"><span class="v">${v}</span><span class="l">${l}</span></div>`;
  $("w-stats").innerHTML = [
    stat(`${f3(q0)}–${f3(q1)}`, "weighted Q, ten seeds"),
    stat(`${f3(WN.mean)} ± ${f3(WN.sd)}`, `weighted Q with weights shuffled over the same links (${WN.n} shuffles)`),
    stat(`z ≈ ${WN.z}`, "weighted Q against its own null"),
    stat(f2(W.nmiVsUnweighted), "NMI, weighted vs unweighted consensus"),
  ].join("");
  $("w-warning").innerHTML =
    `<strong>Don't compare the weighted Q with the unweighted one</strong> (and don't compare their z-scores either). They answer different questions ` +
    `with different ceilings: strong ties concentrate inside groups almost by definition, so a weighted Q is higher before it means anything. Its own ` +
    `null keeps the topology and shuffles the weights between the links: ${f3(WN.mean)} ± ${f3(WN.sd)}. Measured against that, the strong ties do sit inside ` +
    `groups more than chance would put them (z ≈ ${WN.z}). That's a statement about where the weight sits, not a stronger community structure.`;
  const moverSet = new Set(W.movers.map(index));
  const unstable = [...moverSet].filter((i) => L.stability[i] != null && L.stability[i] < 0.7).length;
  const unstableAll = L.stability.filter((x) => x != null && x < 0.7).length;
  $("w-movers-text").innerHTML =
    `The movers, biggest first. ${unstable} of the ${W.nMovers} (${pct(unstable / W.nMovers)}) are philosophers the ten unweighted seeds couldn't settle ` +
    `either (stability below 0.7), against ${pct(unstableAll / N)} of all philosophers: weights mostly re-decide the same borders the seeds were already unsure about.`;
  $("w-movers").innerHTML = W.movers.slice(0, 24).map((id) => {
    const i = index(id);
    const to = W.consensus[i];
    const toLabel = commRow(to) ? `${commLabel(to)}'s` : "a weighted-only community";
    return `<span class="w4-chip">${swatch(commColor(cons()[i]))}${esc(nm(i))}: ${esc(commLabel(cons()[i]))}'s → ${swatch(commColor(to))}${esc(toLabel)}</span>`;
  }).join("");
}

/* ---------------- 8. finder ---------------- */
function renderFinder() {
  const card = $("finder-card");
  const L = D.louvain, I = D.infomap, KC = D.kclique, LC = D.linkcomm, W = D.weights.louvain;
  const show = (m) => {
    if (m.i < 0) {
      card.innerHTML = `<div class="finder-card"><h3>${esc(m.name)}</h3><p>Not in the giant component: an isolate or part of a small piece of the network, ` +
        `so none of the communities on this page include them. <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(m.id)}" target="_blank" rel="noopener">Wikipedia ↗</a></p></div>`;
      return;
    }
    const i = m.i;
    const runs = L.aligned.map((lab, s) => `<span class="w4-run" style="background:${commColor(lab[i])}" title="Seed ${s}: ${esc(commLabel(lab[i]))}">${s}</span>`).join("");
    const mod = I.modules.find((x) => x.id === I.labels[i]);
    const disputed = I.disputed.includes(D.nodes.id[i]);
    const kc = ["3", "4", "5", "6"].map((k) => {
      const mem = KC.membership[k][i];
      return `<li>k = ${k}: ${mem.length ? `${mem.length} — ${mem.slice(0, 2).map((c) => esc(KC.communities[k][c].label)).join("; ")}${mem.length > 2 ? "; …" : ""}` : "none"}</li>`;
    }).join("");
    const lcs = LC.membership[i];
    const lcNames = lcs.slice(0, 3).map((c) => LC.communities[c].top.filter((v) => v !== D.nodes.id[i]).slice(0, 3).map(nmId).join(" · "));
    const ties = ADJ[i].map((a) => ({ ...a, p: BBP.p[a.e] })).sort((a, b) => b.w - a.w).slice(0, 6);
    const firstAlpha = d3.min(ADJ[i], (a) => BBP.p[a.e]);
    const wto = W.consensus[i];
    card.innerHTML = `<div class="finder-card">
      <h3>${esc(nm(i))}</h3>
      <div class="post-meta" style="margin-bottom:6px">
        <span class="badge">${esc(D.nodes.era[i])}</span><span class="badge">degree ${D.nodes.degree[i]}</span><span class="badge">strength ${D.nodes.strength[i]}</span>
        <a class="badge" href="${esc(D.nodes.url[i])}" target="_blank" rel="noopener">Wikipedia ↗</a>
      </div>
      <div class="finder-grid">
        <div><h4>Louvain, ten seeds</h4><div class="w4-runs" aria-label="Community in each of the ten runs">${runs}</div>
          <p style="margin-top:6px">Consensus: ${chip(cons()[i])}</p>
          <p>Stability ${f2(L.stability[i])}: on average, in the same community as the rest of their consensus group in ${pct(L.stability[i] ?? 0)} of runs; ${L.distinct[i]} different communit${L.distinct[i] > 1 ? "ies" : "y"} across the ten runs.</p></div>
        <div><h4>Other methods</h4>
          <p>Infomap: module around ${esc(mod.label)} (${mod.size} philosophers)${disputed ? " — <strong>disputed</strong>: that module is mostly another Louvain community" : ""}.</p>
          <p>Weighted Louvain: ${commRow(wto) ? chip(wto) : "a community only the weighted run has"}.</p></div>
        <div><h4>k-clique communities</h4><ul>${kc}</ul></div>
        <div><h4>Link communities</h4>
          <p>${lcs.length} communit${lcs.length === 1 ? "y" : "ies"} of 3+ links, covering ${LC.covered[i]} of ${D.nodes.degree[i]} links. Communities per link: ${f3(LC.ratio[i])}.</p>
          ${lcNames.length ? `<ul>${lcNames.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>
        <div><h4>Strongest ties</h4><ul>${ties.map((t) => `<li>${esc(nm(t.j))} — weight ${t.w}, ${t.p < 0.2 ? "kept" : "dropped"} at α = 0.2 (p ${f3(t.p)})</li>`).join("")}</ul></div>
        <div><h4>Backbone</h4><p>First joins the disparity backbone at α &gt; ${f3(firstAlpha)}${firstAlpha < 0.2 ? " — so they're in the α = 0.2 figure" : " — so they're not in the α = 0.2 figure"}.</p></div>
      </div></div>`;
  };
  setupSearch($("finder-input"), $("finder-suggestions"), show);
  const ai = index("Aristotle");
  $("finder-input").value = nm(ai);
  show({ i: ai, id: "Aristotle", name: nm(ai) });
}

/* ---------------- 9. LLM ---------------- */
function renderLlm() {
  const box = D.llmGrading;
  $("llm-intro").innerHTML =
    `We gave an LLM (Claude) this prompt and nothing else: <em>“${esc(box.prompt)}”</em>. Then we checked every claim against the numbers above, in the ` +
    `spirit of the course page's "From an AI-drafted report".`;
  $("llm-paragraph").textContent = box.paragraph;
  $("llm-claims").innerHTML = box.annotations
    .map((a) => `<div class="llm-claim"><p><strong>Claim:</strong> ${esc(a.claim)}</p><p class="verdict">${esc(a.verdict)}</p><p>${esc(a.why)}</p></div>`)
    .join("");
}

/* ---------------- 10. conclusions ---------------- */
function renderConclusions() {
  const L = D.louvain, NP = D.nulls.philosophers, NM = D.nulls.marvel, I = D.infomap, W = D.weights.louvain, B = D.backbone;
  const [c0, c1] = minmax(L.nComm), [w0, w1] = minmax(W.nComm);
  $("concl-body").innerHTML =
    `<p><strong>What we can conclude.</strong> The philosophers network has community structure far beyond what its degree sequence explains (Q ` +
    `${f3(NP.realMean)} against ${f3(NP.config.mean)} ± ${f3(NP.config.sd)} for configuration-model shuffles, z ≈ ${Math.round(NP.config.z)}), and much more than ` +
    `Marvel's (${f3(NM.realMean)} against ${f3(NM.config.mean)}). The large blocks, named here after ` +
    `${D.communities.legend.map((l) => esc(l.label)).join(", ")}, survive every seed, both algorithms and the consensus.</p>` +
    `<p><strong>What we can't.</strong> That philosophy "divides into N schools": N is ${c0}–${c1} for unweighted Louvain, ${w0}–${w1} weighted, ` +
    `${I.nModules} for Infomap and ${minmax(D.resolution.gamma2Unweighted).join("–")} at resolution γ = 2. That a border is a fact: the least stable ` +
    `philosophers change community from seed to seed, and ${int(W.nMovers)} philosophers move when weights come in. That the names mean anything: they're ` +
    `labels. That this is about ideas: it's a Wikipedia hyperlink network, so it measures how editors cross-reference articles. And that the backbone is ` +
    `data: it's a picture, and every community on it was detected on the full network.</p>` +
    `<p><strong>Bottom line.</strong> Solid cores, moving borders. Change the seed and the Renaissance moves. Change the algorithm and ` +
    `${esc(commLabel(biggestSplit().louvain))}'s community splits into ${biggestSplit().parts.length}. ` +
    `Change the overlap method and Aristotle stops being in one place. Tighten α and ${esc(nmId(B.break.breaker.node))} is what holds antiquity to modernity.</p>`;
  $("sanity-table").innerHTML = `<table class="data-table"><thead><tr><th>Quantity</th><th>Ours (from week4.json)</th><th>Course page</th></tr></thead><tbody>` +
    D.sanity.map((s) => `<tr><td>${esc(s.what)}</td><td>${esc(s.ours)}</td><td>${esc(s.course)}</td></tr>`).join("") + `</tbody></table>` +
    `<p class="chart-caption">Two differences worth naming. The course's philosopher null (0.228) is a configuration model and its Marvel null (0.25) ` +
    `a strict swap; we report both nulls for both networks. The course reports γ = 2 as a single run ("16 instead of 9"); we report the range over ten seeds.</p>`;
  const v = D.validation, S = D.linkcomm.summary;
  $("validation-text").innerHTML =
    `<p>Every check lives in <a href="week4/week4_gonuts.ipynb">week4_gonuts.ipynb</a> and is re-run at the top of every pipeline run:</p><ul>` +
    `<li>Our NMI: ${v.nmiOurs.toFixed(6)}, sklearn: ${v.nmiSklearn.toFixed(6)} (seeds 0 vs 1).</li>` +
    `<li>Our modularity: ${v.qOurs.toFixed(6)}, networkx: ${v.qNetworkx.toFixed(6)} (seed 0's partition).</li>` +
    `<li>Our link clustering: incremental partition density ${f3(S.bestD)} equals a brute-force recomputation (${f3(S.Dcheck)}), and matches the course's single cut (0.054, 444 communities).</li>` +
    `<li>Our disparity filter reproduces the course's α table, its thresholds, its 112, and its worked example (Moses of Narbonne, 0.16) exactly.</li>` +
    `<li>The in-browser filter, components, stability and NMI (week4_core.js) match the Python output at every sampled α and philosopher (npm run validate:week4).</li></ul>`;
  const t = D.meta.timings;
  $("wk4-meta").textContent =
    `Week 4 analysis last generated: ${new Date(D.meta.generatedAt).toLocaleString()} (pipeline ${t.total}s). Data: ${D.meta.snapshots.philosophers}. ${D.meta.datasetNote}`;
}
