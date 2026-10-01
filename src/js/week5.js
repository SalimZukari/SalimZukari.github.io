// Week 5 page: "Does fame buy you words?"
// Loads data/processed/week5.json (scripts/week5_analyze.py) and renders every
// section from it — no number on the page is typed into the HTML. The power-law
// fits and the toy search ranking are recomputed in the browser by
// week5_core.js, which scripts/week5_validate_browser.mjs checks against the
// Python output. The search index (week5_search.json) loads on first use.
import { fitPowerLaw, prepareIndex, rankPages } from "./week5_core.js";

const WEEK5_URL = new URL("../../data/processed/week5.json", import.meta.url);
const d3 = window.d3;

const statusEl = document.getElementById("load-status");
const appEl = document.getElementById("app");
const $ = (id) => document.getElementById(id);

let D; // the JSON
let P; // D.pages

const C_FAME = "#ffd23f", C_NULL = "#37e6ff", C_REV = "#ff3d68", C_DOT = "#8c6bff";

init().catch((err) => {
  console.error(err);
  statusEl.innerHTML = `
    <div class="error-banner">
      <h2 style="margin-top:0">Could not load the Week 5 dataset</h2>
      <p>${esc(err.message)}</p>
      <p>From the project root, run:</p>
      <code>npm run analyze:week5</code>
    </div>`;
});

async function init() {
  statusEl.innerHTML = `<div class="loading-banner">Loading Week 5 data…</div>`;
  const res = await fetch(WEEK5_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load ${WEEK5_URL} (HTTP ${res.status}). Run "npm run analyze:week5" to generate it.`);
  D = await res.json();
  P = D.pages;
  statusEl.innerHTML = "";
  appEl.hidden = false;

  const steps = [renderSummary, renderHook, renderReframe, renderHeaps, renderVerdict, renderRobust, renderHonesty,
    renderConclusions, renderLlm, renderToy];
  for (const step of steps) {
    try {
      step();
    } catch (e) {
      console.error(`Week 5: ${step.name} failed`, e);
    }
  }
}

/* ---------------- helpers ---------------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const int = (x) => d3.format(",")(Math.round(x));
const f2 = (x) => (+x).toFixed(2);
const f3 = (x) => (+x).toFixed(3);
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const signed = (x, d = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(100 * x).toFixed(d)}%`;
const rho = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;
// Empirical p-values can't go below 1 / (shuffles + 1).
const pFloor = () => 1 / (D.meta.params.nShuffles + 1);
const pv = (p) => (p <= pFloor() + 1e-9 ? `p ≈ ${p.toFixed(3)}` : `p = ${p < 0.1 ? p.toFixed(3) : p.toFixed(2)}`);
const pSmall = (p) => (p < 1e-4 ? `p < 0.0001` : `p = ${p < 0.1 ? p.toFixed(3) : p.toFixed(2)}`);
const idx = {};
function index(id) {
  if (!Object.keys(idx).length) P.id.forEach((v, i) => (idx[v] = i));
  return idx[id];
}
const nm = (i) => P.name[i];
const shortName = (i) => nm(i).replace(/ \(.*\)$/, "");
const nmId = (id) => shortName(index(id));
const wiki = (i, text) => `<a href="${esc(P.url[i])}" target="_blank" rel="noopener">${esc(text ?? shortName(i))}</a>`;
const swatch = (color, style = "") => `<span class="legend-swatch" style="background:${color};${style}"></span>`;
const stat = (v, l) => `<div class="w4-stat"><span class="v">${v}</span><span class="l">${l}</span></div>`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
// Redraw on width changes only (a redraw changes the height, which would
// otherwise re-trigger the observer).
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
function buttons(wrap, options, current, onPick) {
  wrap.insertAdjacentHTML("beforeend", options.map((o) =>
    `<button class="btn" type="button" data-k="${o.key}" aria-pressed="${o.key === current}">${esc(o.label)}</button>`).join(""));
  wrap.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      wrap.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onPick(b.dataset.k);
    })
  );
}
const KEPT = () => D.heaps.kept;
const FAME = () => D.heaps.kept.curves.in_desc;
const budget0 = () => D.budget.budgets[0];
const rankOf = (arr) => {
  // competition rank, 1 = largest
  const sorted = [...arr].sort((a, b) => b - a);
  return arr.map((v) => sorted.indexOf(v) + 1);
};

/* ---------------- summary ---------------- */
function renderSummary() {
  const C = D.corpus.spacy, H = D.hook, S = KEPT(), f = FAME(), T = S.tail, len = S.curves.len_desc;
  const [, rare, win] = budget0().rows;
  $("wk5-asked").textContent =
    "The best-linked Marvel characters have the longest Wikipedia pages. Do those pages also bring new words faster, or " +
    "only more of the same ones? In Heaps' terms: if you read the 303 pages most-linked first, does the vocabulary grow " +
    "any differently than it would in a random order?";
  $("wk5-did").textContent =
    `Tokenized all ${D.corpus.nPages} pages (${int(C.tokens)} tokens), took in-degree from the Week 1 network, and traced the ` +
    `number of distinct types V(n) as pages are added most-linked first, against a band of ${S.null.n} random page orders. ` +
    `Fitted V = K·n^β to every curve, repeated it for out-degree, total degree and page length, with and without stopwords, ` +
    `and checked a handful of counts against the raw text.`;
  $("wk5-found").textContent =
    `Fame buys length: Spearman ρ = ${f2(H.spearman.in.rho)} between in-degree and page length. It doesn't buy a different curve. ` +
    `β = ${f3(f.beta)} most-linked first against ${f3(S.null.beta.mean)} ± ${f3(S.null.beta.sd)} for random orders (${pv(f.pBeta)}), and ` +
    `the curve runs ${pct(Math.abs(f.area))} below the random mean, which the shuffles can't tell from chance (${pv(f.pArea)}). ` +
    `The order that does bend it is page length (${signed(len.area)}, ${pv(len.pArea)}).`;
  $("wk5-surprised").textContent =
    `The ${T.pages} pages nobody links to. Read last, they hold ${pct(T.tokenShare)} of the tokens and still add ${int(T.newTypes)} new types, ` +
    `where ${T.lengthMatched.n} sets of equally short pages add ${int(T.lengthMatched.mean)} ± ${int(T.lengthMatched.sd)}. And whether a famous ` +
    `page looks "richer" at equal length depends on how you cut the sample: ρ = ${rho(rare.rho)} for ${budget0().budget} tokens drawn at random, ` +
    `${rho(win.rho)} for ${budget0().budget} in a row.`;
  $("wk5-corpusnote").textContent =
    `Unless a result says otherwise: the full corpus, ${D.corpus.nPages} pages and ${int(C.tokens)} tokens (${C.label}, stopwords kept), ` +
    `${int(C.types)} types, ${int(C.hapax)} of them used once. Degrees come from the directed Week 1 network ` +
    `(${int(D.meta.network.directedEdges)} links between the same ${D.meta.network.nodes} pages). ${D.corpus.snapshot.replace(/^.*\(/, "Data: ").replace(/\)$/, "")}.`;
}

/* ---------------- 1. hook ---------------- */
const NOTES = {
  "Miracleman_(character)": "A British character first published in 1954 and revived in the 1980s, only later at Marvel. Most of the page is publication history, era by era. It links to no other page in the set and none links to it.",
  "Brian_Braddock": "Captain Britain. A long publication history across British and American comics, then a biography told run by run. Only his sister Betsy Braddock's page links here.",
  "Isaiah_Bradley": "One of several holders of the Captain America title. The page covers the comics, a family of successors and his screen appearances; no character page links to it.",
  "Zombie_(comics)": "A 1953 horror-comics character revived for a 1970s magazine series. The page is about those publications more than about other Marvel characters.",
  "Baymax": "The robot from Big Hero 6. Linked from nowhere in the set, and linking nowhere in it.",
  "Quasar_(character)": "\"The name of several superheroes\": a shared-name page. Two dozen cosmic characters link to it, and it gives each bearer of the name a short biography and stops.",
  "Scarlet_Spider": "\"An alias used by several fictional characters\", mainly two Spider-Man clones. Another name page: many pages point at it, and it says little itself.",
  "Jeffrey_Mace": "The Golden Age Patriot, later written in as the third Captain America. Mentioned from several Captain America pages, short in its own right.",
};

function renderHook() {
  const H = D.hook, C = D.corpus.spacy;
  const maxTok = Math.max(...P.tokens), iMax = P.tokens.indexOf(maxTok), iMin = P.tokens.indexOf(Math.min(...P.tokens));
  $("hook-lede").innerHTML =
    `Page length here is a token count under one stated choice: ${esc(C.label)}, stopwords kept. In-degree is the number of other ` +
    `character pages that link to a page, on the directed Week 1 network. Both are badly skewed. The median page is ` +
    `${int(H.medianTokens)} tokens and the longest, ${esc(shortName(iMax))}'s, is ${int(maxTok)}; ${H.zeroInDegree} pages have no incoming link ` +
    `and ${esc(nmId(H.maxIn[0]))} has ${H.maxIn[1]}. So the correlation is Spearman's, on ranks: ` +
    `<strong>ρ = ${f2(H.spearman.in.rho)}</strong>. Out-degree gives ${f2(H.spearman.out.rho)} and total degree ${f2(H.spearman.tot.rho)}. ` +
    `(Pearson's r on the raw counts would be ${f2(H.pearsonRaw)}; it fits a straight line through two heavy-tailed variables, so we don't use it.)`;

  const rkLen = rankOf(P.tokens), rkIn = rankOf(P.inDeg);
  const long = H.outliers.longForFame.map((r) => index(r.id)), short = H.outliers.shortForFame.map((r) => index(r.id));
  const group = new Map([...long.map((i) => [i, "long"]), ...short.map((i) => [i, "short"])]);
  const color = (i) => (group.get(i) === "long" ? C_FAME : group.get(i) === "short" ? C_NULL : C_DOT);
  let pinned = -1;
  const pin = (i) => {
    pinned = i;
    $("hook-readout").innerHTML =
      `<strong>${esc(nm(i))}</strong>: in-degree ${P.inDeg[i]} (rank ${rkIn[i]} of ${P.id.length}), ${int(P.tokens[i])} tokens (rank ${rkLen[i]}), ` +
      `${int(P.types[i])} types, out-degree ${P.outDeg[i]}. ${wiki(i, "Wikipedia ↗")}`;
    d3.select("#hook-chart").selectAll("circle.pt").attr("stroke", (d) => (d === i ? "#fff" : "none")).attr("stroke-width", 2);
    if ($("hook-select").value !== String(i)) $("hook-select").value = String(i);
  };
  const order = P.id.map((_, i) => i).sort((a, b) => nm(a).localeCompare(nm(b)));
  $("hook-select").innerHTML = `<option value="">Choose…</option>` + order.map((i) => `<option value="${i}">${esc(nm(i))}</option>`).join("");
  $("hook-select").addEventListener("change", (e) => e.target.value !== "" && pin(+e.target.value));

  const draw = () => {
    const el = $("hook-chart");
    el.innerHTML = "";
    const W = Math.max(300, el.clientWidth), H0 = W < 600 ? 340 : 440, M = { l: 62, r: 16, t: 14, b: 42 };
    const x = d3.scaleSymlog().constant(1).domain([-0.3, Math.max(...P.inDeg) * 1.15]).range([M.l, W - M.r]);
    const y = d3.scaleLog().domain([Math.min(...P.tokens) * 0.8, maxTok * 1.25]).range([H0 - M.b, M.t]);
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H0).attr("viewBox", `0 0 ${W} ${H0}`);
    const xt = [0, 1, 2, 5, 10, 20, 50, 100].filter((v) => v <= Math.max(...P.inDeg));
    svg.append("g").attr("class", "grid").attr("transform", `translate(${M.l},0)`)
      .call(d3.axisLeft(y).tickValues([200, 500, 1000, 2000, 5000, 10000]).tickSize(-(W - M.l - M.r)).tickFormat(""))
      .call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H0 - M.b})`).call(d3.axisBottom(x).tickValues(xt).tickFormat(d3.format("d")));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`)
      .call(d3.axisLeft(y).tickValues([200, 500, 1000, 2000, 5000, 10000]).tickFormat(d3.format(",")));
    svg.append("text").attr("x", (M.l + W - M.r) / 2).attr("y", H0 - 6).attr("text-anchor", "middle").text("in-degree: other character pages linking here");
    svg.append("text").attr("transform", `translate(12,${(M.t + H0 - M.b) / 2}) rotate(-90)`).attr("text-anchor", "middle").text("page length (tokens)");
    // dots: a little horizontal jitter, fixed per page, so equal in-degrees don't stack
    const jit = (i) => (P.inDeg[i] < 3 ? (((i * 37) % 17) / 17 - 0.5) * 0.22 : 0);
    const pts = P.id.map((_, i) => i).sort((a, b) => (group.has(a) ? 1 : 0) - (group.has(b) ? 1 : 0));
    // r=3.2 dots are too small for a finger: transparent r=11 hit circles underneath
    svg.append("g").selectAll("circle").data(pts).join("circle").attr("class", "hit-dot")
      .attr("cx", (i) => x(P.inDeg[i] + jit(i))).attr("cy", (i) => y(P.tokens[i])).attr("r", 11)
      .on("pointerenter click", (_, i) => pin(i));
    svg.append("g").selectAll("circle").data(pts).join("circle").attr("class", "pt")
      .attr("cx", (i) => x(P.inDeg[i] + jit(i))).attr("cy", (i) => y(P.tokens[i]))
      .attr("r", (i) => (group.has(i) ? 5 : 3.2)).attr("fill", color).attr("fill-opacity", (i) => (group.has(i) ? 1 : 0.6))
      .style("cursor", "pointer")
      .on("pointerenter click", (_, i) => pin(i))
      .append("title").text((i) => nm(i));
    const nLab = W < 520 ? 2 : 5;
    const labelled = [...long.slice(0, nLab), ...short.slice(0, nLab)];
    // keep labels that share a column from sitting on top of each other
    const ly = new Map();
    let prev = null;
    for (const i of [...labelled].sort((a, b) => y(P.tokens[a]) - y(P.tokens[b]))) {
      let yy = y(P.tokens[i]) + 4;
      if (prev !== null && Math.abs(x(P.inDeg[i]) - x(P.inDeg[prev])) < 90 && yy - ly.get(prev) < 13) yy = ly.get(prev) + 13;
      ly.set(i, yy);
      prev = i;
    }
    svg.append("g").selectAll("text").data(labelled).join("text")
      .attr("x", (i) => x(P.inDeg[i] + jit(i)) + (group.get(i) === "short" && x(P.inDeg[i]) > W * 0.7 ? -8 : 8))
      .attr("text-anchor", (i) => (group.get(i) === "short" && x(P.inDeg[i]) > W * 0.7 ? "end" : "start"))
      .attr("y", (i) => ly.get(i)).style("fill", color).style("font-size", "11px").style("pointer-events", "none")
      .text((i) => shortName(i));
    if (pinned >= 0) pin(pinned);
  };
  draw();
  onWidthChange($("hook-chart"), draw);
  $("hook-legend").innerHTML =
    `<span class="legend-chip">${swatch(C_FAME)}long for its in-degree</span>` +
    `<span class="legend-chip">${swatch(C_NULL)}well linked but short</span>` +
    `<span class="legend-chip">${swatch(C_DOT)}the other ${P.id.length - group.size} pages</span>`;
  $("hook-caption").textContent =
    `Corpus: all ${P.id.length} pages. Length: ${C.label}, stopwords kept. In-degree: directed Week 1 network, links between these ` +
    `${P.id.length} pages only. Horizontal axis linear up to 1, logarithmic beyond (so in-degree 0 has a place); vertical axis logarithmic. ` +
    `Pages with in-degree 0–2 are nudged sideways so they don't hide each other. Spearman ρ = ${f2(H.spearman.in.rho)} (${pSmall(H.spearman.in.p)}). ` +
    `No line is fitted.`;

  $("hook-outlier-lede").textContent =
    `"Far from the relationship" is measured in ranks, to match the statistic: a page's rank by length minus its rank by in-degree. ` +
    `For the well-linked side we only look at the top quarter by in-degree (${H.famousCut} links or more), otherwise the list is all stubs.`;
  const rows = (arr) => arr.map((r) => {
    const i = index(r.id);
    return `<tr><td>${wiki(i, nm(i))}</td><td class="num">${r.inDeg} <small>(rank ${Math.round(r.rankIn)})</small></td>` +
      `<td class="num">${int(r.tokens)} <small>(rank ${Math.round(r.rankLength)})</small></td><td>${esc(NOTES[r.id] || "")}</td></tr>`;
  }).join("");
  $("hook-table").innerHTML =
    `<table class="data-table w5-notes"><thead><tr><th>Character</th><th class="num">In-degree</th><th class="num">Tokens</th><th>What the page is (we read it)</th></tr></thead><tbody>` +
    `<tr class="w5-group"><td colspan="4">${swatch(C_FAME)} Long for their in-degree</td></tr>${rows(H.outliers.longForFame)}` +
    `<tr class="w5-group"><td colspan="4">${swatch(C_NULL)} Well linked but short</td></tr>${rows(H.outliers.shortForFame)}</tbody></table>`;
  const has = (id) => group.has(index(id));
  $("hook-why").textContent = has("Miracleman_(character)") && has("Quasar_(character)")
    ? "Reading them, both lists are about how Wikipedia is written. The long, unlinked pages belong to characters with a long " +
      "real-world history that mostly happened outside the shared universe, so the text is publication history and the links go " +
      "elsewhere. The short, well-linked ones are name pages: a title several characters have held, which many pages point at and " +
      "which hands the story on to other articles. In-degree counts mentions by the other 302 pages. Length counts how much editors " +
      "found to say. They usually agree, and these are the places where they don't."
    : "In-degree counts mentions by the other pages in the set; length counts how much editors found to say. The pages above are where the two part ways.";
}

/* ---------------- 2. reframe ---------------- */
function renderReframe() {
  const H = D.hook, b = budget0(), b1 = D.budget.budgets[1];
  const [raw, rare, win] = b.rows, [raw1, rare1, win1] = b1.rows;
  $("reframe-lede").innerHTML =
    `A page can be twice as long because it says twice as much, or because it says the same things twice: a plot retold per ` +
    `storyline, an "In other media" list of near-identical sentences. Counting the distinct words on each page doesn't separate the ` +
    `two, because types grow with tokens on any text. The correlation between in-degree and a page's type count is ` +
    `ρ = ${f2(H.typesVsIn.rho)}, and that's the length correlation (${f2(H.spearman.in.rho)}) over again. To compare vocabularies, every ` +
    `page needs the same token budget. There are two fair ways to hand one out, and they disagree.`;
  $("reframe-stats").innerHTML =
    stat(`ρ = ${rho(raw.rho)}`, "in-degree vs all types on the page. No control for length.") +
    stat(`ρ = ${rho(rare.rho)}`, `in-degree vs types in ${b.budget} tokens drawn at random from the whole page`) +
    stat(`ρ = ${rho(win.rho)}`, `in-degree vs types in ${b.budget} tokens in a row`);
  $("reframe-caption").textContent =
    `Spearman ρ over the ${b.nPages} pages with at least ${b.budget} tokens (${D.corpus.spacy.label}, stopwords kept). Random draw: the exact ` +
    `expected number of types, without replacement (${f2(rare.min)}–${f2(rare.max)} across pages). In a row: mean of ${D.budget.nWindows} windows at ` +
    `random positions, seed ${D.meta.params.seed}; ${pSmall(win.p)}. With a budget of ${int(b1.budget)} tokens (${b1.nPages} pages): ` +
    `${rho(raw1.rho)}, ${rho(rare1.rho)} and ${rho(win1.rho)} (${pSmall(win1.p)}).`;
  $("reframe-text").textContent =
    `Draw the ${b.budget} tokens from all over the page and the well-linked pages still look richer. A long page covers more ground ` +
    `(publication history, biography, powers, adaptations), so a scattered sample touches more subjects. Take ${b.budget} tokens in a ` +
    `row and the advantage is gone: passage for passage, a famous character's page is written in the same prose as anyone else's. ` +
    `So "richer vocabulary" has no single answer even after controlling for length; it depends on what you hold equal. The question ` +
    `that does have one answer is about the corpus as a whole. As pages are added, how fast does the vocabulary grow, and does it ` +
    `matter who goes first? That is Heaps' law, and the fair way to ask it is the ordering trick in the exercise's fifth opener.`;
}

/* ---------------- 3. hero: Heaps curves ---------------- */
const ORDERS = [
  { key: "in", label: "In-degree", noun: "in-degree", most: "most-linked first", least: "least-linked first", val: (i) => `in-degree ${P.inDeg[i]}` },
  { key: "out", label: "Out-degree", noun: "out-degree", most: "most outgoing links first", least: "fewest outgoing links first", val: (i) => `out-degree ${P.outDeg[i]}` },
  { key: "tot", label: "Total degree", noun: "total degree", most: "highest total degree first", least: "lowest total degree first", val: (i) => `total degree ${P.totDeg[i]}` },
  { key: "len", label: "Page length (control)", noun: "page length", most: "longest page first", least: "shortest page first", val: (i, stop) => `${int(D.heaps[stop].pageTokens[i])} tokens` },
];
const orderInfo = (k) => ORDERS.find((o) => o.key === k);
const orderName = (k, dir) => (dir === "desc" ? orderInfo(k).most : orderInfo(k).least);

function renderHeaps() {
  const S0 = KEPT(), first = S0.orders.in_desc[0];
  $("heaps-lede").innerHTML =
    `Heaps' law says the number of distinct types grows like a power of the number of tokens read, V(n) ≈ K·n<sup>β</sup> with β below 1. ` +
    `We lay the ${P.id.length} pages end to end, most-linked character first (${esc(shortName(first))}, ${P.inDeg[first]} links in; ties in ` +
    `alphabetical order), and count types as we read. One curve means nothing by itself, so the band behind it is ` +
    `${S0.null.n} uniformly random page orders (seed ${D.meta.params.seed}). It's the same move as the degree-preserving shuffles of Weeks 3 ` +
    `and 4: keep everything except the thing being tested. Every order ends at the same point, all ${int(S0.types)} types after ` +
    `${int(S0.tokens)} tokens, so only the path can differ. In the upper panel everything lies on one diagonal and the differences are a line's width. The lower panel ` +
    `redraws every curve as a percentage of the random orders' mean, and that's the one to read.`;

  const state = { order: "in", dir: "desc", stop: "kept", axes: "log", cursor: 0 };
  buttons($("heaps-order"), ORDERS.map((o) => ({ key: o.key, label: o.label })), state.order, (k) => { state.order = k; update(); });
  buttons($("heaps-dir"), [{ key: "desc", label: "Most first" }, { key: "asc", label: "Least first" }], state.dir, (k) => { state.dir = k; update(); });
  buttons($("heaps-stop"), [{ key: "kept", label: "Kept" }, { key: "removed", label: "Removed" }], state.stop, (k) => { state.stop = k; update(); });
  buttons($("heaps-axes"), [{ key: "log", label: "Log–log" }, { key: "linear", label: "Linear" }], state.axes, (k) => { state.axes = k; draw(); });
  $("heaps-legend").innerHTML =
    `<span class="legend-chip">${swatch(C_FAME, "border-radius:2px;height:4px;width:18px")}the chosen order</span>` +
    `<span class="legend-chip">${swatch(C_FAME, "border-radius:2px;height:2px;width:18px;opacity:.6")}its power-law fit (dotted)</span>` +
    `<span class="legend-chip">${swatch(C_REV, "border-radius:2px;height:3px;width:18px")}the opposite direction (lower panel)</span>` +
    `<span class="legend-chip">${swatch(C_NULL, "border-radius:2px;opacity:.75")}${S0.null.n} random orders: middle 95%</span>` +
    `<span class="legend-chip">${swatch(C_NULL, "border-radius:2px;opacity:.3")}their full range</span>`;

  const cur = () => {
    const S = D.heaps[state.stop], key = `${state.order}_${state.dir}`;
    const revKey = `${state.order}_${state.dir === "desc" ? "asc" : "desc"}`;
    return { S, key, c: S.curves[key], rev: S.curves[revKey] };
  };
  const slider = $("heaps-cursor");
  let moveCursor = () => {};

  const fitReadout = () => {
    const { S, c } = cur();
    const fit = fitPowerLaw(S.grid, c.V); // recomputed here; validated against the pipeline's K and beta
    const out = c.below95 + c.above95;
    const side = out === 0 ? "never outside" : c.above95 === 0 ? `below it at ${c.below95}` : c.below95 === 0 ? `above it at ${c.above95}` : `below it at ${c.below95} and above it at ${c.above95}`;
    $("heaps-fit-readout").innerHTML =
      `<strong>${esc(cap(orderName(state.order, state.dir)))}, stopwords ${state.stop}:</strong> K = ${f2(fit.K)}, β = ${f3(fit.beta)} ` +
      `(R² = ${f3(fit.r2)} in log–log). <strong>${S.null.n} random orders:</strong> K = ${f2(S.null.K.mean)} ± ${f2(S.null.K.sd)}, ` +
      `β = ${f3(S.null.beta.mean)} ± ${f3(S.null.beta.sd)}. β against the shuffles: ${pv(c.pBeta)}. Average gap to the random mean: ` +
      `${signed(c.area)} (shuffles vary by ±${pct(S.null.areaSd)}; ${pv(c.pArea)}). Against the middle 95% of shuffles the curve is ` +
      `${side}${out ? ` of ${S.grid.length} values of n` : ""}.`;
  };
  const cursorReadout = () => {
    const { S, key, c } = cur();
    const g = state.cursor, n = S.grid[g], mean = S.null.mean[g];
    const order = S.orders[key];
    let acc = 0, j = 0;
    for (; j < order.length; j++) {
      acc += S.pageTokens[order[j]];
      if (acc >= n) break;
    }
    j = Math.min(j, order.length - 1);
    const page = order[j], ex = S.examples[key][j], added = S.newTypes[key][j];
    $("heaps-cursor-readout").innerHTML =
      `<strong>After ${int(n)} tokens:</strong> ${int(c.V[g])} types. Random orders: ${int(mean)} on average ` +
      `(${int(S.null.min[g])}–${int(S.null.max[g])}), so this order is ${signed(c.V[g] / mean - 1)}. ` +
      `Being read: page ${j + 1} of ${order.length}, ${wiki(page, nm(page))} (${orderInfo(state.order).val(page, state.stop)}), which is the first to use ` +
      `${int(added)} type${added === 1 ? "" : "s"}${ex.length ? `, such as <em>${ex.map(esc).join(", ")}</em>` : ""}.`;
  };

  function draw() {
    const { S, c, rev } = cur();
    const el = $("heaps-chart");
    el.innerHTML = "";
    const W = Math.max(300, el.clientWidth), small = W < 600;
    const H1 = small ? 230 : 310, H2 = small ? 180 : 210, gap = 30, M = { l: small ? 46 : 56, r: 14, t: 12, b: 40 };
    const H = M.t + H1 + gap + H2 + M.b;
    const grid = S.grid, N = S.tokens, isLog = state.axes === "log";
    const x = (isLog ? d3.scaleLog().domain([grid[0], N]) : d3.scaleLinear().domain([0, N])).range([M.l, W - M.r]);
    const y1 = (isLog ? d3.scaleLog().domain([Math.min(S.null.min[0], c.V[0]) * 0.85, S.types * 1.15]) : d3.scaleLinear().domain([0, S.types * 1.05]))
      .range([M.t + H1, M.t]);
    const dev = (v, i) => 100 * (v / S.null.mean[i] - 1);
    const all = [];
    grid.forEach((_, i) => all.push(dev(S.null.min[i], i), dev(S.null.max[i], i), dev(c.V[i], i), dev(rev.V[i], i)));
    const ext = Math.max(Math.abs(d3.min(all)), Math.abs(d3.max(all))) * 1.08;
    const y2 = d3.scaleLinear().domain([-ext, ext]).range([M.t + H1 + gap + H2, M.t + H1 + gap]);
    // the lower panel always uses a log axis for n, so the early part of the curve is visible
    const x2 = d3.scaleLog().domain([grid[0], N]).range([M.l, W - M.r]);

    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
    const fmtN = (v) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : v);
    const xAxis = (sc, log) => (log ? d3.axisBottom(sc).tickValues([1e3, 1e4, 1e5, 5e5].filter((v) => v <= N)).tickFormat(fmtN) : d3.axisBottom(sc).ticks(small ? 4 : 8).tickFormat(fmtN));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${M.t + H1})`).call(xAxis(x, isLog));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`)
      .call(isLog ? d3.axisLeft(y1).tickValues([500, 1000, 2000, 5000, 10000, 20000].filter((v) => v >= y1.domain()[0] && v <= y1.domain()[1])).tickFormat(fmtN) : d3.axisLeft(y1).ticks(5).tickFormat(fmtN));
    svg.append("text").attr("x", M.l + 6).attr("y", M.t + 12).text("types seen so far, V(n)");

    const line = (arr, sx, sy) => d3.line().x((_, i) => sx(grid[i])).y((v, i) => sy(v, i))(arr);
    svg.append("path").attr("fill", C_NULL).attr("fill-opacity", 0.35)
      .attr("d", d3.area().x((_, i) => x(grid[i])).y0((_, i) => y1(S.null.min[i])).y1((_, i) => y1(S.null.max[i]))(grid));
    svg.append("path").attr("fill", "none").attr("stroke", C_NULL).attr("stroke-width", 1).attr("d", line(S.null.mean, x, (v) => y1(v)));
    svg.append("path").attr("fill", "none").attr("stroke", C_FAME).attr("stroke-width", 2.4).attr("d", line(c.V, x, (v) => y1(v)));
    const fit = fitPowerLaw(grid, c.V);
    svg.append("path").attr("fill", "none").attr("stroke", C_FAME).attr("stroke-opacity", 0.7).attr("stroke-dasharray", "2 4")
      .attr("d", line(grid.map((n) => fit.K * n ** fit.beta), x, (v) => y1(v)));

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${M.t + H1 + gap + H2})`).call(xAxis(x2, true));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(y2).ticks(5).tickFormat((v) => `${v > 0 ? "+" : ""}${v}%`));
    svg.append("text").attr("x", M.l + 6).attr("y", M.t + H1 + gap + 12).text("types, relative to the random orders' mean");
    svg.append("text").attr("x", (M.l + W - M.r) / 2).attr("y", H - 6).attr("text-anchor", "middle").text("tokens read so far, n");
    const band = (loArr, hiArr, op) => svg.append("path").attr("fill", C_NULL).attr("fill-opacity", op)
      .attr("d", d3.area().x((_, i) => x2(grid[i])).y0((_, i) => y2(dev(loArr[i], i))).y1((_, i) => y2(dev(hiArr[i], i)))(grid));
    band(S.null.min, S.null.max, 0.16);
    band(S.null.lo, S.null.hi, 0.3);
    svg.append("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", y2(0)).attr("y2", y2(0)).attr("stroke", C_NULL);
    svg.append("path").attr("fill", "none").attr("stroke", C_REV).attr("stroke-width", 1.5).attr("stroke-dasharray", "5 3")
      .attr("d", line(rev.V, x2, (v, i) => y2(dev(v, i))));
    svg.append("path").attr("fill", "none").attr("stroke", C_FAME).attr("stroke-width", 2.4).attr("d", line(c.V, x2, (v, i) => y2(dev(v, i))));

    const m1 = svg.append("line").attr("y1", M.t).attr("y2", M.t + H1).attr("stroke", "#eef1fb").attr("stroke-opacity", 0.7);
    const m2 = svg.append("line").attr("y1", M.t + H1 + gap).attr("y2", M.t + H1 + gap + H2).attr("stroke", "#eef1fb").attr("stroke-opacity", 0.7);
    const dot1 = svg.append("circle").attr("r", 4).attr("fill", C_FAME).attr("stroke", "#0a0d16");
    const dot2 = svg.append("circle").attr("r", 4).attr("fill", C_FAME).attr("stroke", "#0a0d16");
    moveCursor = () => {
      const g = state.cursor, n = grid[g];
      m1.attr("x1", x(n)).attr("x2", x(n));
      m2.attr("x1", x2(n)).attr("x2", x2(n));
      dot1.attr("cx", x(n)).attr("cy", y1(c.V[g]));
      dot2.attr("cx", x2(n)).attr("cy", y2(dev(c.V[g], g)));
    };
    moveCursor();
    const nearest = (n) => d3.leastIndex(grid, (v) => Math.abs(Math.log(v) - Math.log(Math.max(n, 1))));
    const hit = (sc, y0, h) => svg.append("rect").attr("x", M.l).attr("y", y0).attr("width", W - M.l - M.r).attr("height", h)
      .attr("fill", "transparent").style("touch-action", "pan-y")
      .on("pointermove click", (ev) => {
        const [mx] = d3.pointer(ev);
        state.cursor = nearest(sc.invert(mx));
        slider.value = state.cursor;
        moveCursor();
        cursorReadout();
      });
    hit(x, M.t, H1);
    hit(x2, M.t + H1 + gap, H2);
  }

  function update() {
    const { S } = cur();
    slider.max = S.grid.length - 1;
    state.cursor = Math.min(state.cursor, S.grid.length - 1);
    slider.value = state.cursor;
    draw();
    fitReadout();
    cursorReadout();
    const { c } = cur();
    $("heaps-caption").textContent =
      `Corpus: all ${P.id.length} pages. Preprocessing: ${S.label}; ${int(S.tokens)} tokens, ${int(S.types)} types. Order: ` +
      `${orderName(state.order, state.dir)} (ties alphabetical), on the directed Week 1 network. Null: ${S.null.n} uniformly random page orders, ` +
      `seed ${D.meta.params.seed}, drawn as their full range and their middle 95%. Fit: V = K·n^β by least squares on log V against log n at ` +
      `${S.fit.points} log-spaced values of n from ${int(S.fit.from)} to ${int(S.fit.to)} (R² = ${f3(c.r2)}). Lower panel: horizontal axis always logarithmic.`;
  }
  slider.addEventListener("input", () => {
    state.cursor = +slider.value;
    moveCursor();
    cursorReadout();
  });
  state.cursor = Math.round(S0.grid.length * 0.72);
  update();
  onWidthChange($("heaps-chart"), draw);
}

const fmtRuns = (runs) => list(runs.map(([a, b]) => (a === b ? `n ≈ ${int(a)}` : `n ≈ ${int(a)} to ${int(b)}`)));
const longestRun = (runs) => runs.reduce((best, r) => (Math.log(r[1] / r[0]) > Math.log(best[1] / best[0]) ? r : best), runs[0]);

function renderVerdict() {
  const S = KEPT(), f = FAME(), r = S.curves.in_asc, len = S.curves.len_desc, nb = S.null.beta, T = S.tail, LM = T.lengthMatched;
  const lr = f.below95Runs.length ? longestRun(f.below95Runs) : null, rr = r.above95Runs.length ? longestRun(r.above95Runs) : null;
  $("heaps-verdict").innerHTML =
    `<p><strong>The exponent doesn't care who goes first.</strong> Most-linked first gives β = ${f3(f.beta)} (K = ${f2(f.K)}). The ${S.null.n} random ` +
    `orders give β = ${f3(nb.mean)} ± ${f3(nb.sd)}, anywhere from ${f3(nb.min)} to ${f3(nb.max)}, so ${f3(f.beta)} is an ordinary draw (${pv(f.pBeta)}). ` +
    `Least-linked first gives ${f3(r.beta)}. How fast new words keep arriving is a property of the text and of the tokenizer. Sorting ` +
    `the pages by fame doesn't move it.</p>` +
    `<p><strong>The level: inside the band, along its lower edge.</strong> The fame-first curve runs below the random mean for most of its length, ` +
    `by ${pct(Math.abs(f.area))} on average. A random order typically sits ±${pct(S.null.areaSd)} from that mean, so over the whole curve this isn't ` +
    `distinguishable from chance (${pv(f.pArea)}). Point by point, it drops below the middle 95% of shuffles at ${f.below95} of ${S.grid.length} ` +
    `values of n${lr ? `, mostly late (${fmtRuns([lr])})` : ""}, and never rises above it. Read the pile backwards and the picture mirrors: ` +
    `${signed(r.area)} on average (${pv(r.pArea)})${rr ? `, above the middle 95% around ${fmtRuns([rr])}` : ""}.</p>` +
    `<p><strong>What does bend the curve is length.</strong> Put the longest page first and the curve sits ${pct(Math.abs(len.area))} under the random ` +
    `mean (${pv(len.pArea)}), below the middle 95% at ${len.below95} of ${S.grid.length} points. A long page reuses its own words, so a few ` +
    `long pages cover less vocabulary than many short ones with the same number of tokens. In-degree order is partly a length order ` +
    `(ρ = ${f2(D.hook.spearman.in.rho)}), and that is the likeliest reason for its small deficit.</p>`;

  $("tail-lede").textContent =
    `One stretch of the fame-first curve does leave the band: the end. The last ${T.pages} pages in that order have in-degree 0. ` +
    `No other page in the set links to them. Together they hold ${int(T.tokens)} tokens, ${pct(T.tokenShare)} of the corpus. The exercise asks ` +
    `whether minor characters "bring new words, or mostly repeat the famous ones".`;
  $("tail-stats").innerHTML =
    stat(int(T.newTypes), `new types from the ${T.pages} unlinked pages, read last (${pct(T.typeShare)} of all types)`) +
    stat(`${int(T.nullMean)} ± ${int(T.nullSd)}`, `a random final stretch of the same ${int(T.tokens)} tokens (${S.null.n} shuffles, at most ${int(T.nullMax)})`) +
    stat(`${int(LM.mean)} ± ${int(LM.sd)}`, `${T.pages} pages of matching length, read last (${LM.n} shuffles, at most ${int(LM.max)})`) +
    stat(int(T.shortestLast), `the shortest pages, read last (same number of tokens)`);
  const top = T.topPages.slice(0, 3).map(([id, n]) => {
    const j = S.orders.in_desc.indexOf(index(id));
    return `${esc(nmId(id))} (${n}: <em>${S.examples.in_desc[j].slice(0, 3).map(esc).join(", ")}</em>)`;
  });
  $("tail-text").innerHTML =
    `They bring new words. The unlinked pages add ${pct(T.newTypes / LM.mean - 1, 0)} more new types than equally short pages do in the same ` +
    `position (${pv(LM.p)}, the smallest value ${LM.n} shuffles can give). That second null shuffles in-degree only among pages of similar ` +
    `length (length deciles), so it isn't just that short pages are many. We read what they add. The largest contributions come from ` +
    `${list(top)}. They are names and places from outside the shared universe, which is also why nobody links there. The famous pages ` +
    `overlap with each other; the pages at the edge are about something else.`;
}

/* ---------------- 4. robustness ---------------- */
function renderRobust() {
  const K = D.heaps.kept, R = D.heaps.removed, C = D.corpus.spacy;
  $("robust-lede").textContent =
    `The same figure for out-degree, total degree (in + out) and page length, in both directions, and again with function words ` +
    `removed (${C.stopLabel}). Each row is one curve against its own band of ${K.null.n} shuffles. Curves with different stopword settings ` +
    `are never laid over each other: removing stopwords deletes ${pct(C.stopShare, 0)} of the tokens, so n no longer means the same thing.`;
  const cell = (c) => {
    const sig = c.pArea < 0.05;
    return `<td class="num">${f3(c.beta)} <small>(${pv(c.pBeta)})</small></td>` +
      `<td class="num">${sig ? "<strong>" : ""}${signed(c.area)}${sig ? "</strong>" : ""} <small>(${pv(c.pArea)})</small></td>` +
      `<td class="num">${c.below95} / ${c.above95}</td>`;
  };
  const body = ORDERS.flatMap((o) => ["desc", "asc"].map((dir) =>
    `<tr><td>${esc(orderName(o.key, dir))}</td>${cell(K.curves[`${o.key}_${dir}`])}${cell(R.curves[`${o.key}_${dir}`])}</tr>`)).join("");
  $("robust-table").innerHTML =
    `<table class="data-table w5-robust"><thead>` +
    `<tr><th rowspan="2">Page order</th><th colspan="3" class="num">Stopwords kept (${int(K.tokens)} tokens)</th><th colspan="3" class="num">Stopwords removed (${int(R.tokens)} tokens)</th></tr>` +
    `<tr><th class="num w5-sym">β</th><th class="num">avg gap</th><th class="num">below / above</th><th class="num w5-sym">β</th><th class="num">avg gap</th><th class="num">below / above</th></tr></thead><tbody>` +
    `<tr class="w5-group"><td>${K.null.n} random orders</td><td class="num">${f3(K.null.beta.mean)} ± ${f3(K.null.beta.sd)}</td><td class="num">±${pct(K.null.areaSd)}</td><td></td>` +
    `<td class="num">${f3(R.null.beta.mean)} ± ${f3(R.null.beta.sd)}</td><td class="num">±${pct(R.null.areaSd)}</td><td></td></tr>${body}</tbody></table>`;
  $("robust-caption").textContent =
    `Corpus: all ${P.id.length} pages; tokenizer: ${C.label}. β: Heaps exponent fitted as in the figure, with its two-sided empirical p against the ` +
    `shuffles' β. Avg gap: mean log-ratio to the shuffle mean over the grid, roughly the average percentage above or below; p two-sided against ` +
    `the same statistic for each shuffle. Below / above: number of the ${K.grid.length} values of n at which the curve is outside the middle 95% of ` +
    `shuffles. Bold: p < 0.05. ${D.meta.params.nCurvesTested} curves are tested, so about one would pass that bar by chance.`;
  const all = [];
  for (const [stop, S] of Object.entries(D.heaps)) for (const [key, c] of Object.entries(S.curves)) all.push({ stop, key, c });
  const minPB = all.reduce((a, b) => (b.c.pBeta < a.c.pBeta ? b : a));
  const sig = all.filter((r) => r.c.pArea < 0.05);
  const fameSig = sig.filter((r) => !r.key.startsWith("len"));
  const name = (r) => `${orderName(r.key.split("_")[0], r.key.split("_")[1])}, stopwords ${r.stop} (${signed(r.c.area)}, ${pv(r.c.pArea)})`;
  const fi = K.curves.in_desc, fr = R.curves.in_desc, fo = R.curves.out_desc;
  $("robust-text").textContent =
    `The exponent is the stable part. None of the ${all.length} curves has a β the shuffles would find unusual (the smallest p is ` +
    `${minPB.c.pBeta.toFixed(2)}). For the level, the only ordering that clears the band in both settings is page length, longest first ` +
    `(${signed(K.curves.len_desc.area)} and ${signed(R.curves.len_desc.area)}). Removing stopwords widens the in-degree gap from ${signed(fi.area)} to ` +
    `${signed(fr.area)} (${pv(fr.pArea)}): function words arrive in the first few hundred tokens of any order, so stripping them plausibly leaves more of ` +
    `the vocabulary that depends on the order. ` +
    (fameSig.length
      ? `That puts ${fameSig.length} fame ordering${fameSig.length === 1 ? "" : "s"} under 0.05: ${fameSig.map(name).join("; ")}. Out-degree, the third way of ` +
        `measuring the same idea, stays well inside (${signed(fo.area)}, ${pv(fo.pArea)}), and with ${all.length} curves tested one or two borderline p-values are ` +
        `what chance alone would give. We read it as a lean in one direction, not as a result.`
      : `No fame ordering comes out under 0.05 in either setting.`);
}

/* ---------------- 5. honesty ---------------- */
function markUp(sentence, culprit) {
  const at = sentence.toLowerCase().indexOf(culprit.toLowerCase());
  if (at < 0) return esc(sentence);
  return `${esc(sentence.slice(0, at))}<mark>${esc(sentence.slice(at, at + culprit.length))}</mark>${esc(sentence.slice(at + culprit.length))}`;
}

function renderHonesty() {
  const U = D.honesty.unigram, Cc = D.honesty.column, Hx = D.honesty.hapax, S = KEPT();
  $("honesty-lede").textContent =
    `The exercise ends on an instruction: whatever you claim, inspect the text underneath it before you believe it. The Heaps curve ` +
    `counts types, and a type is whatever the tokenizer says it is. So we counted a few things twice, once from the tokens and once ` +
    `with a regular expression on the raw text, and looked at every place the two numbers differ.`;
  const um = U.mismatches[0];
  const colPage = index(Cc.page), ex = Hx.examples[0];
  const culprits = Object.keys(Cc.culprits);
  const glued = Hx.gluedExamples.slice(0, 4);
  const row = (what, tok, raw, where) => `<tr><td>${what}</td><td class="num">${tok}</td><td class="num">${raw}</td><td>${where}</td></tr>`;
  $("honesty-table").innerHTML =
    `<table class="data-table w5-honesty"><thead><tr><th>What we counted</th><th class="num">The tokens say</th><th class="num">The raw text says</th><th>Where they part</th></tr></thead><tbody>` +
    row(`The word <code>${esc(U.term)}</code> in all ${P.id.length} pages <small>(spaCy tokens)</small>`, int(U.tokenCount), int(U.regexCount),
      um ? `On ${wiki(index(um.page))}'s page (${um.tokenCount} vs ${um.regexCount}): ${markUp(um.sentences[0], um.culprits[0])}<br><small>A closing quote and an em dash with no space. spaCy kept <code>${esc(um.culprits[0])}</code> as one token.</small>` : "They agree.") +
    row(`The word <code>${esc(Cc.term)}</code> on ${wiki(colPage)}'s page <small>(CountVectorizer column)</small>`, int(Cc.matrixCount), int(Cc.regexCount),
      `${markUp(Cc.sentences[0], culprits[0])}<br><small>Our pattern keeps hyphenated words whole, so ${list(culprits.map((c) => `<code>${esc(c)}</code>`))} each get a column of their own.</small>`) +
    row(`The ${int(Hx.nHapax)} types the Heaps curve counts as used once <small>(spaCy)</small>`, `${int(Hx.nHapax)} used once`, `${int(Hx.regexFindsMore)} of them are there more than once`,
      ex ? `<code>${esc(ex.type)}</code> is one token on ${wiki(index(ex.firstPage))}'s page, and the text has it ${ex.regexCount} times. The others are inside <code>${esc(ex.hiddenIn[0])}</code>, which spaCy keeps whole.` : "") +
    row(`Types that are a word glued to punctuation <small>(spaCy)</small>`, `${int(Hx.gluedTypes)} types, ${int(Hx.gluedHapax)} used once`, `0 words`,
      `${glued.map((g) => `<code>${esc(g.type)}</code>`).join(", ")}, … Each one is a step up on the curve, for the page that happened to contain it.`) +
    `</tbody></table>`;
  $("honesty-caption").textContent =
    `Tokens: ${U.tokenizer} (rows 1, 3, 4); ${Cc.tokenizer} (row 2). Raw text: the word between word boundaries, case-insensitive (rows 1 and 2); for row 3, ${Hx.regex}. ` +
    `Row 4 counts ${Hx.gluedRule}. Row 1 covers the whole corpus and the two counts differ on one page only.`;
  $("honesty-rule").innerHTML =
    `<strong>The rule this leaves us with.</strong> When a raw-text regex and a tokenizer disagree, the text wins, and a number derived ` +
    `from tokens is only as good as the tokenizer's rules for the case at hand. For the figure, this changes little: ${int(Hx.gluedTypes)} glued ` +
    `types are ${pct(Hx.gluedTypes / S.types, 2)} of the vocabulary and turn up under any page order, so the verdict stands. The height of the ` +
    `curve is another matter. The same ${P.id.length} pages hold ${int(D.corpus.spacy.types)} types under spaCy's tokenizer and ` +
    `${int(D.corpus.countVectorizer.terms)} under our CountVectorizer pattern (hyphenated words kept whole, digits dropped). There is no ` +
    `true vocabulary size to fit a K to, only one per tokenizer.`;
}

/* ---------------- 6. conclusions + LLM ---------------- */
function renderConclusions() {
  const S = KEPT(), f = FAME(), H = D.hook, T = S.tail, LM = T.lengthMatched, b = budget0();
  const [, rare, win] = b.rows;
  // how much the "law" bends: refit on the early and the late half of the grid
  const half = Math.floor(S.grid.length / 2);
  const early = fitPowerLaw(S.grid.slice(0, half), f.V.slice(0, half)), late = fitPowerLaw(S.grid.slice(half), f.V.slice(half));
  $("concl-body").innerHTML =
    `<p><strong>What we can conclude.</strong> On these ${P.id.length} pages, in-degree and page length rise together (Spearman ρ = ${f2(H.spearman.in.rho)}). ` +
    `Reading the pages most-linked first gives the same Heaps exponent as a random order (β = ${f3(f.beta)} against ${f3(S.null.beta.mean)} ± ${f3(S.null.beta.sd)}) ` +
    `and a curve that ${S.null.n} shuffles can't separate from chance overall (${signed(f.area)}, ${pv(f.pArea)}). The ${T.pages} pages with no incoming ` +
    `link add ${int(T.newTypes)} new types at the very end, more than any of ${LM.n} length-matched alternatives (at most ${int(LM.max)}).</p>` +
    `<p><strong>What we can't.</strong> That famous characters "have a richer vocabulary": at an equal budget of ${b.budget} tokens the correlation is ` +
    `${rho(rare.rho)} or ${rho(win.rho)} depending on how the tokens are picked. That fame causes length, or the reverse; both are choices made by ` +
    `Wikipedia's editors, and in-degree only counts links from the other ${P.id.length - 1} pages in one category. That any of this is about the comics. ` +
    `And that Heaps' law "holds": a straight line fits well in log–log (R² = ${f3(f.r2)}), but the curve bends. Fitted to the first half of the grid ` +
    `(n up to ${int(S.grid[half - 1])}) β is ${f3(early.beta)}; fitted to the second half it is ${f3(late.beta)}. The exponent we report is an average over a ` +
    `stated range, and it would differ over another.</p>` +
    `<p><strong>Bottom line.</strong> More links, more words, same curve. Fame buys a character a longer page. The new words come from the edge of the network.</p>`;

  $("next-week").innerHTML =
    `<strong>With another week.</strong> The random-order band asks whether the order matters at all. It can't say whether fame matters once ` +
    `length is accounted for, and reading a band by eye isn't a test. We'd rerun the whole curve under the length-matched shuffle we ` +
    `used for the tail (in-degrees permuted within length deciles) and compare β and the average gap with that distribution, pairing each ` +
    `permutation with the real order on the same grid of n.`;

  const show = (v) => (Array.isArray(v) ? v.map((x) => (Array.isArray(x) ? x.join(" ") : typeof x === "number" ? int(x) : x)).join(" / ") : typeof v === "number" ? int(v) : v);
  $("sanity-table").innerHTML =
    `<table class="data-table"><thead><tr><th>Quantity</th><th>This pipeline (week5.json)</th><th>exercise_5_3.ipynb</th><th>Match</th></tr></thead><tbody>` +
    D.sanity.map((s) => `<tr><td>${esc(s.what)}</td><td>${esc(show(s.ours))}</td><td>${esc(show(s.notebook))}</td><td>${s.ok ? "yes" : "<strong>no</strong>"}</td></tr>`).join("") +
    `</tbody></table><p class="chart-caption">The course page quotes about 727,000 tokens and 27,000 types for the same pages under its own, unstated ` +
    `preprocessing. Ours are ${int(D.corpus.spacy.tokens)} and ${int(D.corpus.spacy.types)} under the choice stated above; the hapax share (${pct(D.corpus.spacy.hapaxShare, 0)}) matches the page's 36%.</p>`;
  const jsFit = fitPowerLaw(S.grid, f.V);
  $("validation-text").innerHTML =
    `<p>Every check lives in <a href="week5/week5_gonuts.ipynb">week5_gonuts.ipynb</a>, and the first is also asserted on every pipeline run:</p><ul>` +
    `<li>The fast Heaps curve (first occurrence of each type from per-page tables) equals a direct count over the concatenated tokens at all ${S.grid.length} grid points, for both stopword settings.</li>` +
    `<li>The fit: log–log least squares gives K = ${f2(f.K)}, β = ${f3(f.beta)}; this page recomputes K = ${f2(jsFit.K)}, β = ${f3(jsFit.beta)} in the browser ` +
    `(npm run validate:week5 checks all ${D.meta.params.nCurvesTested} curves). The notebook compares it with scipy's curve_fit and plots both over the curve.</li>` +
    `<li>In- and out-degrees are recounted by hand from week1_edges.tsv for ${D.hook.degreeCheck.length} characters, and against networkx.</li>` +
    `<li>The toy search ranking matches scikit-learn's cosine similarity for ${D.search.examples.length} queries, with and without stopwords.</li>` +
    `<li>Labels: ${P.nameMismatch.length} of the names in week1_nodes.tsv belong to a different article than their node ` +
    `(${esc(P.nameMismatch[0][0])} is listed as "${esc(P.nameMismatch[0][1])}"), so every page here is labelled by its node id.</li>` +
    `<li>Ties in the in-degree order: ${S.tieBreaks.n} random tie-breaks move the average gap only between ${signed(S.tieBreaks.areaMin, 2)} and ${signed(S.tieBreaks.areaMax, 2)}.</li></ul>`;
  const t = D.meta.timings;
  $("wk5-meta").textContent =
    `Week 5 analysis last generated: ${new Date(D.meta.generatedAt).toLocaleString()} (pipeline ${t.total}s; spaCy ${D.meta.versions.spacy}, ` +
    `scikit-learn ${D.meta.versions.sklearn}). ${D.meta.datasetNote}`;
}

function renderLlm() {
  const box = D.llmGrading;
  $("llm-intro").innerHTML =
    `We gave an LLM (Claude) this prompt and three numbers from the pipeline, and nothing else: <em>“${esc(box.prompt)}”</em> Then we graded the ` +
    `result against everything above, in the spirit of the course page's "From an AI-drafted report".`;
  $("llm-paragraph").textContent = box.paragraph;
  $("llm-claims").innerHTML = box.annotations
    .map((a) => `<div class="llm-claim"><p><strong>Claim:</strong> ${esc(a.claim)}</p><p class="verdict">${esc(a.verdict)}</p><p>${esc(a.why)}</p></div>`)
    .join("");
}

/* ---------------- 7. toy search ---------------- */
function renderToy() {
  const M = D.search;
  const SEARCH_URL = new URL(`../../data/processed/${M.file}`, import.meta.url);
  $("toy-lede").textContent =
    `The exercise's third opener, built because the Bag-of-Words matrix already existed. Your query becomes a tiny document, gets the ` +
    `same word counts as every page, and the ${P.id.length} pages are ranked by cosine similarity to it. It shows what the representation ` +
    `can and can't do. It isn't evidence for anything above.`;
  const thor = P.id.filter((id) => /^Thor/.test(id)).map((id) => nmId(id));
  $("toy-caption").textContent =
    `Bag of Words: ${M.label}; ${int(M.terms)} terms, raw counts, no weighting. "Drop stopwords" removes ${M.stopLabel} from the query and the ` +
    `pages. With raw counts a word like "of" decides the ranking, which is the failure the course's lookalikes explorable shows. ` +
    (thor.length && !P.id.includes("Thor_(Marvel_Comics)")
      ? `And the obvious answer to the first example can't come up at all: the only page in the set whose title starts with Thor is ${thor.join(", ")}.`
      : "");
  let idxPromise = null;
  const loadIndex = () => {
    if (!idxPromise) {
      $("toy-status").textContent = "Loading the index (about 1.6 MB, once)…";
      idxPromise = fetch(SEARCH_URL).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }).then(prepareIndex);
    }
    return idxPromise;
  };
  const run = async () => {
    const q = $("toy-input").value.trim() || $("toy-input").placeholder;
    let index;
    try {
      index = await loadIndex();
    } catch (e) {
      idxPromise = null;
      $("toy-status").textContent = `Could not load the search index (${e.message}). Run "npm run analyze:week5" to generate it.`;
      return;
    }
    const dropStop = $("toy-stop").checked;
    const r = rankPages(index, q, { dropStop, top: 8 });
    const parts = [`<strong>“${esc(q)}”</strong> → ${r.used.length ? r.used.map((t) => `<code>${esc(t)}</code>`).join(" ") : "no usable words"}`];
    if (r.dropped.length) parts.push(`dropped as stopwords: ${r.dropped.map(esc).join(", ")}`);
    if (r.ignored.length) parts.push(`not in any page: ${r.ignored.map(esc).join(", ")}`);
    $("toy-status").innerHTML = parts.join(" · ");
    $("toy-results").innerHTML = r.results.length
      ? r.results.map((row) =>
        `<li>${wiki(row.doc, nm(row.doc))} <span class="w5-score">cosine ${row.score.toFixed(3)}</span>` +
        `<small>${row.terms.map(([t, c]) => `${esc(t)} × ${c}`).join(", ")}</small></li>`).join("")
      : `<li>No page shares a word with that query.</li>`;
  };
  $("toy-form").addEventListener("submit", (e) => {
    e.preventDefault();
    run();
  });
  $("toy-stop").addEventListener("change", () => idxPromise && run());
  $("toy-examples").innerHTML = `<span class="w5-ctl">Try</span>` + M.examples.map((ex, k) => `<button class="btn" type="button" data-k="${k}">${esc(ex.query)}</button>`).join("");
  $("toy-examples").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      $("toy-input").value = M.examples[+b.dataset.k].query;
      run();
    })
  );
}
