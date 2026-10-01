// Week 2 page: "The friendship paradox".
// Loads data/processed/week2.json (scripts/week2_analyze.py) and renders the
// four figures that used to be static matplotlib PNGs. Every number shown in
// a chart, readout or figure caption comes from that file.
/* global d3 */
import { renderCcdf, renderGroupedBars, renderHistogram } from "./charts.js";
import { setReadout } from "./tooltip.js";

const WEEK2_URL = new URL("../../data/processed/week2.json", import.meta.url);

const NETWORK_COLORS = {
  "BA(5000)": "var(--accent-2)",
  "Random (matched to BA)": "var(--accent-4)",
  Marvel: "var(--accent)",
  "Random (matched to Marvel)": "var(--accent-3)",
};

const $ = (id) => document.getElementById(id);
const f2 = d3.format(".2f");
const f3 = d3.format(".3f");
const signed = (v) => `${v >= 0 ? "+" : "−"}${f2(Math.abs(v))}`;

async function loadWeek2() {
  const res = await fetch(WEEK2_URL, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Could not load ${WEEK2_URL} (HTTP ${res.status}). Run "npm run analyze:week2" to generate it.`);
  }
  return res.json();
}

init().catch((err) => {
  console.error(err);
  document.querySelectorAll("[data-w2-chart]").forEach((el) => {
    el.innerHTML = `<div class="error-banner"><p>${err.message}</p><code>npm run analyze:week2</code></div>`;
  });
});

function debounce(fn, ms) {
  let t;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

// fill <span data-w2="path.to.value" data-fmt="f2"> placeholders in captions
function fillNumbers(w2) {
  const fmts = { f2, f3, f1: d3.format(".1f"), pct: d3.format(".0%"), int: d3.format(","), signed };
  document.querySelectorAll("[data-w2]").forEach((el) => {
    const v = el.dataset.w2.split(".").reduce((o, k) => (o == null ? o : o[k]), w2);
    if (v == null) return;
    el.textContent = fmts[el.dataset.fmt] ? fmts[el.dataset.fmt](v) : v;
  });
}

async function init() {
  const w2 = await loadWeek2();
  const byNet = Object.fromEntries(w2.paradox.map((r) => [r.network, r]));
  // derived caption values: friend/person ratios
  w2.ratio = Object.fromEntries(w2.paradox.map((r) => [r.network, r.meanFriend / r.meanPerson]));
  w2.ratioBA = w2.ratio["BA(5000)"];
  w2.ratioMarvel = w2.ratio.Marvel;
  w2.fracBA = byNet["BA(5000)"].fracFriendGE;
  w2.fracMarvel = byNet.Marvel.fracFriendGE;
  w2.fracRandMarvel = byNet["Random (matched to Marvel)"].fracFriendGE;
  fillNumbers(w2);

  const draw = () => {
    drawCcdf(w2, byNet);
    drawParadox(w2);
    drawOutPopularity(w2);
    drawNull(w2);
  };
  draw();
  window.addEventListener("resize", debounce(draw, 200));
}

/* ---------------- Figure 1: degree CCDF ---------------- */
let ccdfSeries = null; // kept across redraws so legend toggles survive a resize
function drawCcdf(w2, byNet) {
  ccdfSeries =
    ccdfSeries ||
    w2.ccdf.map((c) => ({
      key: c.network,
      label: c.network,
      color: NETWORK_COLORS[c.network],
      n: byNet[c.network].n,
      points: c.points,
    }));
  renderCcdf($("w2-ccdf"), ccdfSeries, {
    onHover: (s, p) => {
      const r = byNet[s.label];
      setReadout(
        $("w2-ccdf-readout"),
        `<strong>${s.label}</strong>: ${d3.format(".1%")(p.p)} of its ${d3.format(",")(r.n)} nodes have degree ≥ ${p.k}. ` +
          `Mean degree ${f2(r.kMean)}, variance σ² = ${f2(r.kVar)}.`
      );
    },
  });
}

/* ---------------- Figure 2: person vs. friend ---------------- */
function drawParadox(w2) {
  const groups = w2.paradox.map((r) => ({
    label: r.network,
    note: f2(r.fracFriendGE),
    values: [
      { key: "person", label: "mean(person)", value: r.meanPerson, color: "var(--accent-4)" },
      { key: "friend", label: "mean(friend)", value: r.meanFriend, color: "var(--accent-2)" },
    ],
    row: r,
  }));
  renderGroupedBars($("w2-paradox"), groups, {
    yLabel: "mean degree",
    noteLabel: "fraction friend ≥ person:",
    onHover: (gr) => {
      const r = gr.row;
      setReadout(
        $("w2-paradox-readout"),
        `<strong>${r.network}</strong> (n = ${d3.format(",")(r.n)}, m = ${d3.format(",")(r.m)}): sampled person ${f2(r.meanPerson)}, ` +
          `friend ${f2(r.meanFriend)} (×${f2(r.meanFriend / r.meanPerson)}); the friend is at least as connected in ` +
          `${d3.format(".0%")(r.fracFriendGE)} of ${d3.format(",")(w2.nullModel.nPairs)} draws. Exact ⟨k_nn⟩ = ⟨k⟩ + σ²/⟨k⟩ = ${f2(r.knnFormula)}.`
      );
    },
  });
}

/* ---------------- Figure 3: out-popularity'd rate ---------------- */
function drawOutPopularity(w2) {
  const op = w2.outPopularity;
  const last = op.histogram.length - 1;
  // np.histogram bins are half-open except the last, which includes its right edge
  const members = (b, i) => op.perNode.filter((c) => c.rate >= b.x0 && (i === last ? c.rate <= b.x1 : c.rate < b.x1));
  op.histogram.forEach((b, i) => (b.members = members(b, i)));
  const range = (b) => `${f2(b.x0)}–${f2(b.x1)}`;
  renderHistogram($("w2-outpop"), op.histogram, {
    xLabel: "fraction of a character's friends who are ≥ as connected",
    yLabel: "number of characters",
    marker: { value: op.spiderMan.rate, label: `Spider-Man (degree ${op.spiderMan.degree}, rate ${op.spiderMan.rate})` },
    binLabel: (b) => `${b.count} character${b.count === 1 ? "" : "s"} with rate ${range(b)}`,
    onHover: (b) => {
      const names = [...b.members].sort((a, c) => c.degree - a.degree);
      const shown = names.slice(0, 12).map((c) => `${c.name} (${c.degree})`).join(", ");
      setReadout(
        $("w2-outpop-readout"),
        `<strong>${b.count} character${b.count === 1 ? "" : "s"}</strong> with rate ${range(b)}` +
          (names.length ? `, most connected first (degree): ${shown}${names.length > 12 ? `, and ${names.length - 12} more` : ""}.` : ".")
      );
    },
  });
}

/* ---------------- Figure 4: null model ---------------- */
function drawNull(w2) {
  const nm = w2.nullModel;
  const panels = [
    { el: "w2-null-frac", s: nm.fracFriendGE, fmt: f2, xLabel: `fraction(friend ≥ person), ${d3.format(",")(nm.nPairs)} samples` },
    { el: "w2-null-friend", s: nm.meanFriend, fmt: d3.format(".1f"), xLabel: `mean(friend degree), ${d3.format(",")(nm.nPairs)} samples` },
  ];
  for (const p of panels) {
    renderHistogram($(p.el), p.s.histogram, {
      xLabel: p.xLabel,
      yLabel: `realizations (of ${nm.nRealizations})`,
      marker: { value: p.s.real, label: `real Marvel (${p.fmt(p.s.real)})` },
      binLabel: (b) => `${b.count} of ${nm.nRealizations} shuffles in [${f3(b.x0)}, ${f3(b.x1)})`,
      onHover: (b) =>
        setReadout(
          $("w2-null-readout"),
          `<strong>${b.count} of ${nm.nRealizations} shuffles</strong> gave ${p.xLabel.split(",")[0]} between ${f3(b.x0)} and ${f3(b.x1)}. ` +
            `Real Marvel: ${f3(p.s.real)}; null ${f3(p.s.nullMean)} ± ${f3(p.s.nullSd)}, z = ${signed(p.s.z)}, empirical p = ${f2(p.s.p)}.`
        ),
    });
  }
}
