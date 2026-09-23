// Validates the in-browser Week 4 computations (src/js/week4_core.js) against
// the Python pipeline's output (data/processed/week4.json):
//   - backbone links / philosophers attached / giant component at the course's
//     alpha values plus 15 alphas sampled from the Python sweep
//   - the global-threshold backbones (w >= 2, 3, 4)
//   - per-philosopher stability for 25 sampled philosophers (+ Aristotle)
//   - NMI between Louvain seeds 0 and 1
// Usage: node scripts/week4_validate_browser.mjs   (or: npm run validate:week4)
// Prints a JSON report and exits non-zero on any mismatch.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  disparityPValues, keepByAlpha, keepByWeight, backboneStats, stabilityOf, nmi,
} from "../src/js/week4_core.js";

const path = fileURLToPath(new URL("../data/processed/week4.json", import.meta.url));
const d = JSON.parse(readFileSync(path, "utf8"));
const n = d.nodes.id.length;
const edges = d.backbone.edges;
const { p } = disparityPValues(n, edges);

const failures = [];
const report = { alphas: [], thresholds: [], stability: [], nmi: null };

// deterministic sample of sweep rows (every k-th row), plus the course table
const sweep = d.backbone.sweep.filter((r) => r[0] <= 0.5);
const step = Math.floor(sweep.length / 15);
const rows = sweep.filter((_, i) => i % step === 0).slice(0, 15);
for (const row of d.backbone.table) rows.push([row.alpha, row.links, row.nodes, row.giant, null]);
for (const [alpha, links, nodes, giant] of rows) {
  const st = backboneStats(n, edges, keepByAlpha(p, alpha));
  const ok = st.links === links && st.attached === nodes && st.giant === giant;
  report.alphas.push({ alpha, python: [links, nodes, giant], browser: [st.links, st.attached, st.giant], ok });
  if (!ok) failures.push(`alpha ${alpha}`);
}
for (const t of d.backbone.thresholds) {
  const st = backboneStats(n, edges, keepByWeight(edges, t.w));
  const ok = st.links === t.links && st.attached === t.nodes && st.giant === t.giant;
  report.thresholds.push({ w: t.w, python: [t.links, t.nodes, t.giant], browser: [st.links, st.attached, st.giant], ok });
  if (!ok) failures.push(`w >= ${t.w}`);
}

const sample = [d.nodes.id.indexOf("Aristotle")];
for (let i = 7; sample.length < 26; i += 53) sample.push(i % n);
for (const i of sample) {
  const js = stabilityOf(i, d.louvain.labels, d.louvain.consensus);
  const py = d.louvain.stability[i];
  const ok = (js === null && py === null) || Math.abs(js - py) < 0.0015; // python rounds to 3 dp
  report.stability.push({ id: d.nodes.id[i], python: py, browser: js === null ? null : +js.toFixed(4), ok });
  if (!ok) failures.push(`stability ${d.nodes.id[i]}`);
}

const nmiJs = nmi(d.louvain.labels[0], d.louvain.labels[1]);
report.nmi = { python: d.louvain.nmi01, browser: +nmiJs.toFixed(4), ok: Math.abs(nmiJs - d.louvain.nmi01) < 0.0015 };
if (!report.nmi.ok) failures.push("nmi");

report.summary = {
  checks: report.alphas.length + report.thresholds.length + report.stability.length + 1,
  failures,
};
console.log(JSON.stringify(report, null, 1));
process.exit(failures.length ? 1 : 0);
