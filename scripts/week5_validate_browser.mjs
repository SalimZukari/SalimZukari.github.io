// Validates the in-browser Week 5 computations (src/js/week5_core.js) against
// the Python pipeline's output (data/processed/week5.json, week5_search.json):
//   - the Heaps fit (K, beta, R^2) and the area statistic of every curve
//   - the toy search box: the top five pages and their cosine scores for the
//     pipeline's example queries, with raw counts and with stopwords dropped,
//     against scikit-learn's cosine_similarity
// Usage: node scripts/week5_validate_browser.mjs   (or: npm run validate:week5)
// Prints a JSON report and exits non-zero on any mismatch.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fitPowerLaw, areaStat, prepareIndex, rankPages } from "../src/js/week5_core.js";

const load = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../data/processed/${name}`, import.meta.url)), "utf8"));
const d = load("week5.json");
const index = prepareIndex(load(d.search.file));

const failures = [];
const report = { fits: [], search: [] };

for (const [stop, S] of Object.entries(d.heaps)) {
  for (const [key, c] of Object.entries(S.curves)) {
    const f = fitPowerLaw(S.grid, c.V);
    const a = areaStat(c.V, S.null.mean);
    const ok = Math.abs(f.beta - c.beta) < 1e-5 && Math.abs(f.K - c.K) / c.K < 1e-3 &&
      Math.abs(f.r2 - c.r2) < 1e-5 && Math.abs(a - c.area) < 1e-5;
    report.fits.push({ curve: `${stop}/${key}`, python: [c.K, c.beta, c.area], browser: [+f.K.toFixed(4), +f.beta.toFixed(6), +a.toFixed(6)], ok });
    if (!ok) failures.push(`fit ${stop}/${key}`);
  }
}

for (const ex of d.search.examples) {
  for (const [mode, dropStop] of [["raw", false], ["noStop", true]]) {
    const got = rankPages(index, ex.query, { dropStop, top: 5 }).results.map((r) => [d.pages.id[r.doc], r.score]);
    const ok = got.length === ex[mode].length &&
      got.every(([id, score], i) => id === ex[mode][i][0] && Math.abs(score - ex[mode][i][1]) < 1e-5);
    report.search.push({ query: ex.query, mode, python: ex[mode].map((r) => r[0]), browser: got.map((r) => r[0]), ok });
    if (!ok) failures.push(`search "${ex.query}" (${mode})`);
  }
}

console.log(JSON.stringify({ checked: { fits: report.fits.length, searches: report.search.length }, failures, report }, null, 1));
if (failures.length) process.exit(1);
