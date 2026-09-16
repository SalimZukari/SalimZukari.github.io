// Week 3 page: "Who holds the Marvel universe together?"
// Loads data/processed/week3.json (this week's own pipeline output) plus
// the Week 1 analysis.json via data.js (for node names/URLs/undirected
// neighbors, already generated once and reused rather than duplicated).
import { loadData, getNode, allNodes, searchNodes, fmt } from "./data.js";
import { renderZScoreScatter, renderRemovalChart } from "./charts.js";

const WEEK3_URL = new URL("../../data/processed/week3.json", import.meta.url);

async function loadWeek3() {
  const res = await fetch(WEEK3_URL, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(
      `Could not load ${WEEK3_URL} (HTTP ${res.status}). Run "npm run analyze:week3" to generate it.`
    );
  }
  return res.json();
}

const statusEl = document.getElementById("load-status");
const appEl = document.getElementById("app");

init().catch((err) => {
  console.error(err);
  statusEl.innerHTML = `
    <div class="error-banner">
      <h2 style="margin-top:0">Could not load the Week 3 dataset</h2>
      <p>${err.message}</p>
      <p>From the project root, run:</p>
      <code>npm run analyze &amp;&amp; npm run analyze:week3</code>
    </div>`;
});

async function init() {
  statusEl.innerHTML = `<div class="loading-banner">Loading Week 3 data…</div>`;
  await loadData(); // Week 1 analysis.json — names, URLs, undirected adjacency
  const w3 = await loadWeek3();
  statusEl.innerHTML = "";
  appEl.hidden = false;

  renderSummary(w3);
  renderHook(w3);
  renderBrokers(w3);
  renderRemoval(w3);
  setupSixDegrees(w3);
  renderCliquesHomophily(w3);
  renderLlmGrading(w3);
  renderMeta(w3);
}

function nodeName(id) {
  const n = getNode(id);
  return n ? n.name : id;
}
function nodeUrl(id) {
  const n = getNode(id);
  return n ? n.url : "";
}

/* ---------------- Summary box ---------------- */
function renderSummary(w3) {
  const gc = w3.paths.giantComponent;
  const removal = w3.removal.singleNodeFragmentation;
  document.getElementById("wk3-asked").textContent =
    "Is Spider-Man's centrality actually special, or exactly what his degree predicts? " +
    "Which character's removal breaks the network the most, and is it the highest-betweenness one? " +
    "How far is everyone really from Spider-Man?";
  document.getElementById("wk3-did").textContent =
    `Ran 200 degree-preserving shuffles of the ${gc.n}-node undirected giant component for z-scores ` +
    `on betweenness, closeness, and assortativity; removed characters five different ways (degree, ` +
    `static/dynamic betweenness, PageRank, random) and tracked the giant component's size; and built ` +
    `an in-browser BFS widget over the same validated adjacency data.`;
  document.getElementById("wk3-found").textContent =
    `Spider-Man's betweenness is unremarkable (z ≈ ${fmt(w3.brokers.perNode ? w3.brokers.perNode["Spider-Man"]?.zBetweenness ?? 0 : 0, 2)}); ` +
    `Hercules and Black Widow are real brokers (z > 4); the most fragmenting single removal ` +
    `(${nodeName(removal.mostFragmentingNode)}) is also the highest-betweenness character; and nobody ` +
    `in the giant component is more than ${w3.sixDegrees.eccentricitySpiderMan} hops from Spider-Man.`;
  document.getElementById("wk3-surprised").textContent =
    `Recomputing betweenness after every removal beats every fixed-order attack strategy, including ` +
    `PageRank; and team homophily (z ≈ ${fmt(w3.homophily ? w3.homophily.z : 0, 1)}) dwarfs degree ` +
    `assortativity's null-consistent z ≈ ${fmt(w3.mixing.zR, 1)} — very different kinds of "surprising."`;
}

/* ---------------- Hook ---------------- */
function renderHook(w3) {
  const sm = w3.brokers.perNode["Spider-Man"];
  const cards = [
    { label: "Degree", value: fmt(sm.degree) },
    { label: "Betweenness", value: `${(sm.betweenness * 100).toFixed(1)}%` },
    { label: "Betweenness z-score", value: (sm.zBetweenness >= 0 ? "+" : "") + sm.zBetweenness.toFixed(2) },
    { label: "Closeness z-score", value: (sm.zCloseness >= 0 ? "+" : "") + sm.zCloseness.toFixed(2) },
  ];
  document.getElementById("hook-cards").innerHTML = cards
    .map((c) => `<div class="stat-card in-view"><span class="value">${c.value}</span><span class="label">${c.label}</span></div>`)
    .join("");
}

/* ---------------- Brokers ---------------- */
function renderBrokers(w3) {
  const perNode = w3.brokers.perNode;
  const points = Object.entries(perNode).map(([id, v]) => ({
    id,
    name: nodeName(id),
    degree: v.degree,
    z: v.zBetweenness,
  }));
  const labelIds = [...w3.brokers.topPositiveZBetweenness.slice(0, 6), ...w3.brokers.topNegativeZBetweenness.slice(0, 3)];
  const pinned = document.getElementById("brokers-pinned");
  renderZScoreScatter(document.getElementById("brokers-chart"), points, {
    label: "betweenness",
    labelIds,
    onSelect: (d) => {
      const zClass = d.z >= 0 ? "z-pos" : "z-neg";
      pinned.innerHTML = `<strong>${d.name}</strong> — degree ${d.degree}, betweenness z-score <span class="${zClass}">${d.z >= 0 ? "+" : ""}${d.z.toFixed(2)}</span>`;
    },
  });

  const rows = w3.brokers.topPositiveZBetweenness
    .slice(0, 6)
    .concat(w3.brokers.topNegativeZBetweenness.slice(0, 3))
    .map((id) => perNode[id] && { id, ...perNode[id] })
    .filter(Boolean);
  document.getElementById("brokers-table").innerHTML = `
    <table class="data-table">
      <thead><tr><th>Character</th><th class="num">Degree</th><th class="num">Betweenness</th><th class="num">Shuffled mean</th><th class="num">z</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
              <td>${nodeName(r.id)}</td>
              <td class="num">${r.degree}</td>
              <td class="num">${r.betweenness.toFixed(4)}</td>
              <td class="num">${r.betweennessShuffledMean.toFixed(4)}</td>
              <td class="num">${r.zBetweenness >= 0 ? "+" : ""}${r.zBetweenness.toFixed(2)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

/* ---------------- Removal ---------------- */
function renderRemoval(w3) {
  const orders = w3.removal.orders;
  const series = [
    { key: "degree", label: "Degree", color: "#37e6ff", points: orders.degree },
    { key: "betweennessStatic", label: "Betweenness (static)", color: "#ffd23f", points: orders.betweennessStatic },
    { key: "betweennessDynamic", label: "Betweenness (dynamic)", color: "#ff3d68", points: orders.betweennessDynamic },
    { key: "pagerank", label: "PageRank", color: "#4ade80", points: orders.pagerank },
    { key: "random", label: "Random (avg)", color: "#8c6bff", points: orders.random },
  ];
  renderRemovalChart(document.getElementById("removal-chart"), series);

  const snf = w3.removal.singleNodeFragmentation;
  document.getElementById("removal-summary").textContent =
    `Most fragmenting single removal: ${nodeName(snf.mostFragmentingNode)}. Highest-betweenness character: ` +
    `${nodeName(snf.highestBetweennessNode)}. Same character: ${snf.sameNode ? "yes" : "no"}. ` +
    `Area under curve (lower = fragments faster) — degree ${w3.removal.auc.degree}, static betweenness ` +
    `${w3.removal.auc.betweennessStatic}, dynamic betweenness ${w3.removal.auc.betweennessDynamic}, PageRank ` +
    `${w3.removal.auc.pagerank}, random ${w3.removal.auc.random}.`;
}

/* ---------------- Six degrees widget ---------------- */
function directedBfsToTarget(outAdjacency, sourceId, targetId) {
  if (sourceId === targetId) return [sourceId];
  const visited = new Set([sourceId]);
  const prev = new Map();
  const queue = [sourceId];
  let qi = 0;
  while (qi < queue.length) {
    const current = queue[qi++];
    const neighbors = outAdjacency[current] || [];
    for (const next of neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      prev.set(next, current);
      if (next === targetId) {
        const path = [targetId];
        let cur = targetId;
        while (prev.has(cur)) {
          cur = prev.get(cur);
          path.push(cur);
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function undirectedBfsToTarget(sourceId, targetId) {
  // Mirrors data.js's shortestPath exactly (same validated BFS), kept local
  // so this widget's logic is self-contained and easy to read top to bottom.
  if (sourceId === targetId) return [sourceId];
  const visited = new Set([sourceId]);
  const prev = new Map();
  const queue = [sourceId];
  let qi = 0;
  while (qi < queue.length) {
    const current = queue[qi++];
    const node = getNode(current);
    const neighbors = node ? node.neighbors : [];
    for (const next of neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      prev.set(next, current);
      if (next === targetId) {
        const path = [targetId];
        let cur = targetId;
        while (prev.has(cur)) {
          cur = prev.get(cur);
          path.push(cur);
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function setupSixDegrees(w3) {
  const SPIDER_MAN = w3.sixDegrees.spiderManId;
  const input = document.getElementById("sixdeg-input");
  const suggestions = document.getElementById("sixdeg-suggestions");
  const arrowsToggle = document.getElementById("sixdeg-arrows");
  const chainEl = document.getElementById("sixdeg-chain");
  const metaEl = document.getElementById("sixdeg-meta");
  const outAdjacency = w3.sixDegrees.outAdjacency;

  function runSearch(id) {
    const arrows = arrowsToggle.checked;
    const path = arrows ? directedBfsToTarget(outAdjacency, id, SPIDER_MAN) : undirectedBfsToTarget(id, SPIDER_MAN);
    if (!path) {
      chainEl.innerHTML = `<span class="sixdeg-unreachable">Unreachable${arrows ? " by following arrows forward" : ""} from ${nodeName(id)} to Spider-Man.</span>`;
      metaEl.textContent = "";
      return;
    }
    chainEl.innerHTML = path
      .map(
        (nid, i) =>
          `${i > 0 ? '<span class="sixdeg-arrow">→</span>' : ""}<a class="sixdeg-step" href="${nodeUrl(nid)}" target="_blank" rel="noopener">${nodeName(nid)}</a>`
      )
      .join("");
    metaEl.textContent = `${path.length - 1} hop${path.length - 1 === 1 ? "" : "s"} to Spider-Man${arrows ? " (following arrows outward)" : " (undirected)"}.`;
  }

  input.addEventListener("input", () => {
    const matches = searchNodes(input.value, 8);
    if (!matches.length) {
      suggestions.hidden = true;
      return;
    }
    suggestions.hidden = false;
    suggestions.innerHTML = matches.map((n) => `<button data-id="${n.id}">${n.name}</button>`).join("");
    suggestions.querySelectorAll("[data-id]").forEach((btn) =>
      btn.addEventListener("click", () => {
        input.value = nodeName(btn.dataset.id);
        suggestions.hidden = true;
        runSearch(btn.dataset.id);
      })
    );
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".sixdeg-search")) suggestions.hidden = true;
  });
  arrowsToggle.addEventListener("change", () => {
    const current = allNodes().find((n) => n.name === input.value);
    if (current) runSearch(current.id);
  });

  // Seed with the example longest-chain character from the pipeline.
  const example = w3.sixDegrees.exampleChain;
  input.value = example.targetName;
  runSearch(example.targetId);
}

/* ---------------- Cliques + homophily ---------------- */
function renderCliquesHomophily(w3) {
  const c = w3.cliques;
  document.getElementById("cliques-summary").textContent =
    `Clique number ${c.cliqueNumber}. ${c.numMaximalCliques} maximal cliques total, including ` +
    `${c.largestCliques.length} maximal ${c.cliqueNumber}-cliques. Counting every complete subgraph ` +
    `(not just maximal ones): ${c.numTriangles} triangles, ${c.num5Cliques} five-cliques.`;
  document.getElementById("cliques-list").innerHTML = c.largestCliques
    .map(
      (clique) =>
        `<div class="clique-chip-row">${clique.members.map((id) => `<span class="clique-chip">${nodeName(id)}</span>`).join("")}</div>`
    )
    .join("");

  const h = w3.homophily;
  if (!h) {
    document.getElementById("homophily-summary").textContent = "Team homophily data unavailable (Wikidata fetch failed at build time).";
    return;
  }
  document.getElementById("homophily-summary").textContent =
    `${h.nLabeled} of ${h.nGiantComponent} giant-component characters have a Wikidata team label, across ` +
    `${h.nDistinctTeams} distinct teams. Real team assortativity r = ${h.rReal}, vs. a label-shuffle null of ` +
    `${h.rShuffledMean} ± ${h.rShuffledStd} (z ≈ ${h.z}) — far stronger than degree assortativity's null-consistent ` +
    `z ≈ ${w3.mixing.zR}.`;
  document.getElementById("homophily-teams").innerHTML = h.mostCommon
    .map(([team, count]) => `<span class="clique-chip">${team} (${count})</span>`)
    .join("");
}

/* ---------------- LLM grading ---------------- */
function renderLlmGrading(w3) {
  const box = w3.llmGrading;
  document.getElementById("llm-paragraph").textContent = box.paragraph;
  document.getElementById("llm-claims").innerHTML = box.annotations
    .map(
      (a) => `
      <div class="llm-claim">
        <p><strong>Claim:</strong> ${a.claim}</p>
        <p class="verdict">${a.verdict}</p>
        <p>${a.why}</p>
      </div>`
    )
    .join("");
}

/* ---------------- Meta / dataset note ---------------- */
function renderMeta(w3) {
  const el = document.getElementById("wk3-meta");
  if (!el) return;
  const date = new Date(w3.meta.generatedAt);
  el.textContent = `Week 3 analysis last generated: ${date.toLocaleString()}. ${w3.meta.datasetNote}`;
}
