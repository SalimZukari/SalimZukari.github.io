import { loadData, allNodes, getNode, searchNodes, fmt, interpretCharacter } from "./data.js";
import { renderDegreeDistribution, renderScatter, renderComponentBars, renderDensityGrid } from "./charts.js";
import { createNetworkGraph } from "./network.js";
import { initHeroNetwork } from "./hero.js";
import { setupWhoRules, setupDeleteHero, setupPathFinder, setupGuessDegree } from "./experiments.js";

const statusEl = document.getElementById("load-status");
const appEl = document.getElementById("app");

init().catch((err) => {
  console.error(err);
  statusEl.innerHTML = `
    <div class="error-banner">
      <h2 style="margin-top:0">Could not load the Marvel network dataset</h2>
      <p>${err.message}</p>
      <p>Make sure <code>data/processed/analysis.json</code> exists. From the project root, run:</p>
      <code>npm run analyze</code>
    </div>`;
});

async function init() {
  statusEl.innerHTML = `<div class="loading-banner">Loading the Marvel network…</div>`;
  const data = await loadData();
  statusEl.innerHTML = "";
  appEl.hidden = false;

  setupNav();
  setupReducedMotionClass();
  setupHero(data);
  setupDashboard(data);
  const profile = setupProfilePanel();
  setupRankings(data, profile);
  setupDistribution(data);
  setupScatter(data, profile);
  const graph = setupNetworkGraph(data, profile);
  setupGraphControls(data, graph);
  setupIslands(data);
  setupExperimentsSection(data, graph);
  setupDensity(data);
  setupAha(data);
  setupStory(data);
  setupMethodology(data);
  setupDatasetInfo(data);
  setupScrollReveal();

  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    if (target) target.scrollIntoView({ behavior: "auto", block: "start" });
  }
}

function setupReducedMotionClass() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.classList.add("reduced-motion");
  }
}

function setupNav() {
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      links.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );
}

function setupHero(data) {
  const canvas = document.querySelector(".hero-network-bg");
  if (canvas) initHeroNetwork(canvas);
  const { stats } = data;
  setText('[data-hero="nodes"]', fmt(stats.numNodes));
  setText('[data-hero="edges"]', fmt(stats.numDirectedEdges));
  setText('[data-hero="avgDegree"]', stats.avgDegree.toFixed(2));
  setText('[data-hero="density"]', `${(stats.density * 100).toFixed(2)}%`);
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function setupDashboard(data) {
  const { stats } = data;
  const cards = [
    { icon: "👥", label: "Characters", value: fmt(stats.numNodes) },
    { icon: "🔗", label: "Directed links", value: fmt(stats.numDirectedEdges) },
    { icon: "🔗", label: "Unique undirected links", value: fmt(stats.numUndirectedEdges) },
    { icon: "📊", label: "Average degree", value: stats.avgDegree.toFixed(2) },
    { icon: "🕸️", label: "Density", value: `${(stats.density * 100).toFixed(2)}%` },
    { icon: "🏝️", label: "Components", value: fmt(stats.numComponents) },
    { icon: "👻", label: "Isolates", value: fmt(stats.numIsolatedNodes) },
    { icon: "🌉", label: "Articulation points", value: fmt(stats.numArticulationPoints) },
  ];
  const container = document.getElementById("dashboard-cards");
  container.innerHTML = cards
    .map(
      (c) => `
      <div class="stat-card">
        <span class="icon">${c.icon}</span>
        <span class="value">${c.value}</span>
        <span class="label">${c.label}</span>
      </div>`
    )
    .join("");
}

function setupScrollReveal() {
  const cards = document.querySelectorAll(".stat-card");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  cards.forEach((c) => observer.observe(c));
}

/* ---------------- Profile panel (shared by rankings, scatter, graph, search) ---------------- */

function setupProfilePanel() {
  const panel = document.getElementById("profile-panel");
  const nameEl = document.getElementById("profile-name");
  const statsEl = document.getElementById("profile-stats");
  const interpEl = document.getElementById("profile-interpretation");
  const badgesEl = document.getElementById("profile-badges");
  document.getElementById("profile-close").addEventListener("click", () => panel.classList.remove("visible"));

  function show(node) {
    panel.classList.add("visible");
    nameEl.textContent = node.name;
    statsEl.innerHTML = `
      <div class="profile-stat"><span class="n">${node.undirectedDegree}</span><span class="l">Degree</span></div>
      <div class="profile-stat"><span class="n">${node.inDegree}</span><span class="l">In-degree</span></div>
      <div class="profile-stat"><span class="n">${node.outDegree}</span><span class="l">Out-degree</span></div>
      <div class="profile-stat"><span class="n">#${node.rankDegree}</span><span class="l">Degree rank</span></div>
      <div class="profile-stat"><span class="n">${node.neighbors.length}</span><span class="l">Neighbors</span></div>
      <div class="profile-stat"><span class="n">${node.componentSize}</span><span class="l">Component size</span></div>
    `;
    interpEl.textContent = interpretCharacter(node);
    const badges = [];
    if (node.isInLargestComponent) badges.push('<span class="badge badge-largest">Largest component</span>');
    if (node.isArticulationPoint) badges.push('<span class="badge badge-ap">Articulation point</span>');
    if (node.isIsolated) badges.push('<span class="badge badge-isolated">Isolated</span>');
    if (node.url) badges.push(`<a class="badge" href="${node.url}" target="_blank" rel="noopener">Wikipedia ↗</a>`);
    badgesEl.innerHTML = badges.join("");
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return { show, panel };
}

/* ---------------- Rankings / MVP cards ---------------- */

function setupRankings(data, profile) {
  const grid = document.getElementById("mvp-grid");
  const tabs = document.querySelectorAll("[data-rank-tab]");
  const metricKey = { topDegree: "undirectedDegree", topInDegree: "inDegree", topOutDegree: "outDegree" };

  function render(rankKey) {
    const list = data.rankings[rankKey];
    const maxVal = list[0].value;
    grid.innerHTML = list
      .map(
        (item) => `
      <button class="mvp-card" data-mvp-id="${item.id}">
        <span class="mvp-rank">#${item.rank}</span>
        <span class="mvp-info">
          <span class="mvp-name">${item.name}</span>
          <span class="mvp-value">${metricKey[rankKey] === "inDegree" ? "In-degree" : metricKey[rankKey] === "outDegree" ? "Out-degree" : "Degree"}: ${item.value}</span>
          <span class="mvp-bar-track"><span class="mvp-bar-fill" style="width:${(item.value / maxVal) * 100}%"></span></span>
        </span>
      </button>`
      )
      .join("");
    grid.querySelectorAll("[data-mvp-id]").forEach((btn) =>
      btn.addEventListener("click", () => profile.show(getNode(btn.dataset.mvpId)))
    );
  }

  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      render(tab.dataset.rankTab);
    })
  );

  render("topDegree");
}

/* ---------------- Degree distribution ---------------- */

function setupDistribution(data) {
  const chartEl = document.getElementById("dist-chart");
  const summaryEl = document.getElementById("dist-hover-summary");
  const textSummaryEl = document.getElementById("dist-text-summary");
  const buttons = document.querySelectorAll("[data-dist-scale]");
  const dist = data.degreeDistribution.degree;

  const totalNodes = data.stats.numNodes;
  const maxEntry = dist.reduce((a, b) => (b.count > a.count ? b : a), dist[0]);
  textSummaryEl.textContent = `Across ${totalNodes} characters, degree ${maxEntry.k} is the most common, shared by ${maxEntry.count} characters. Degrees range from ${dist[0].k} to ${dist[dist.length - 1].k}.`;

  let scale = "linear";
  function render() {
    renderDegreeDistribution(chartEl, dist, {
      log: scale === "log",
      onHover: (d) => {
        summaryEl.textContent = `There are ${d.count} character${d.count === 1 ? "" : "s"} with degree ${d.k}.`;
      },
    });
  }
  buttons.forEach((btn) =>
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      scale = btn.dataset.distScale;
      render();
    })
  );
  render();
  window.addEventListener("resize", debounce(render, 200));
}

/* ---------------- Scatter: in vs out degree ---------------- */

function setupScatter(data, profile) {
  const chartEl = document.getElementById("scatter-chart");
  const nodes = allNodes();
  const mismatch = nodes.reduce((a, b) => (Math.abs(b.inDegree - b.outDegree) > Math.abs(a.inDegree - a.outDegree) ? b : a));
  document.getElementById("scatter-text-summary").textContent =
    `${nodes.length} characters plotted by in-degree vs out-degree. The most extreme mismatch belongs to ${mismatch.name}, ` +
    `with in-degree ${mismatch.inDegree} and out-degree ${mismatch.outDegree}.`;

  function render() {
    renderScatter(chartEl, nodes, { onClick: (d) => profile.show(d) });
  }
  render();
  window.addEventListener("resize", debounce(render, 200));
}

/* ---------------- Network graph ---------------- */

function setupNetworkGraph(data, profile) {
  const svg = document.getElementById("network-svg");
  const graph = createNetworkGraph(svg, { nodes: allNodes(), edges: data.edges }, {
    onSelect: (node) => profile.show(node),
  });
  return graph;
}

function setupGraphControls(data, graph) {
  const minDegree = document.getElementById("min-degree");
  const minDegreeValue = document.getElementById("min-degree-value");
  const sizeMetric = document.getElementById("size-metric");
  const toggleLargest = document.getElementById("toggle-largest");
  const toggleIsolates = document.getElementById("toggle-isolates");
  const toggleLabels = document.getElementById("toggle-labels");
  const resetBtn = document.getElementById("graph-reset");
  const searchInput = document.getElementById("graph-search");
  const suggestionsBox = document.getElementById("graph-suggestions");

  function applyFilters() {
    graph.applyFilter({
      minDegree: Number(minDegree.value),
      onlyLargest: toggleLargest.checked,
      showIsolates: toggleIsolates.checked,
    });
  }

  minDegree.addEventListener("input", () => {
    minDegreeValue.textContent = minDegree.value;
    applyFilters();
  });
  sizeMetric.addEventListener("change", () => graph.setSizeMetric(sizeMetric.value));
  toggleLargest.addEventListener("change", applyFilters);
  toggleIsolates.addEventListener("change", applyFilters);
  toggleLabels.addEventListener("change", () => graph.setLabels(toggleLabels.checked));
  resetBtn.addEventListener("click", () => {
    minDegree.value = 0;
    minDegreeValue.textContent = "0";
    toggleLargest.checked = false;
    toggleIsolates.checked = true;
    toggleLabels.checked = false;
    sizeMetric.value = "undirectedDegree";
    graph.setSizeMetric("undirectedDegree");
    graph.setLabels(false);
    applyFilters();
    graph.resetView();
    graph.clearSelection();
    searchInput.value = "";
    suggestionsBox.hidden = true;
  });

  searchInput.addEventListener("input", () => {
    const matches = searchNodes(searchInput.value, 8);
    if (!matches.length) {
      suggestionsBox.hidden = true;
      return;
    }
    suggestionsBox.hidden = false;
    suggestionsBox.innerHTML = matches
      .map((n) => `<button data-suggest-id="${n.id}">${n.name} <span style="color:var(--text-faint)">· degree ${n.undirectedDegree}</span></button>`)
      .join("");
    suggestionsBox.querySelectorAll("[data-suggest-id]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const node = getNode(btn.dataset.suggestId);
        searchInput.value = node.name;
        suggestionsBox.hidden = true;
        graph.focusOn(node.id);
        document.getElementById("network").scrollIntoView({ behavior: "smooth", block: "start" });
      })
    );
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".network-search")) suggestionsBox.hidden = true;
  });
}

/* ---------------- Islands ---------------- */

function setupIslands(data) {
  renderComponentBars(document.getElementById("component-bars"), data.components.slice(0, 12));
  const isolates = allNodes().filter((n) => n.isIsolated);
  document.getElementById("isolate-summary").textContent = `${isolates.length} character${isolates.length === 1 ? "" : "s"} have no connections in either direction.`;
  document.getElementById("isolate-chips").innerHTML = isolates.map((n) => `<span class="isolate-chip">${n.name}</span>`).join("");
}

/* ---------------- Experiments ---------------- */

function setupExperimentsSection(data, graph) {
  setupWhoRules(document.getElementById("experiments"));
  setupDeleteHero(document.getElementById("delete-hero-card"), {
    onPreview: (id) => graph.focusOn(id),
    onClear: () => graph.clearSelection(),
  });
  setupPathFinder(document.getElementById("path-finder-card"));
  setupGuessDegree(document.getElementById("guess-card"));
}

/* ---------------- Density ---------------- */

function setupDensity(data) {
  const { stats } = data;
  renderDensityGrid(document.getElementById("density-grid"), stats.density);
  document.getElementById("density-caption").textContent = `${stats.numUndirectedEdges} of ${stats.maxPossibleEdges} possible undirected connections exist — a density of ${(stats.density * 100).toFixed(2)}%.`;
  document.getElementById("density-stats").innerHTML = `
    <div class="stat-card in-view"><span class="value">${fmt(stats.numUndirectedEdges)}</span><span class="label">Actual edges</span></div>
    <div class="stat-card in-view"><span class="value">${fmt(stats.maxPossibleEdges)}</span><span class="label">Max possible edges</span></div>
    <div class="stat-card in-view"><span class="value">${(stats.density * 100).toFixed(2)}%</span><span class="label">Density</span></div>
    <div class="stat-card in-view"><span class="value">${(100 - stats.density * 100).toFixed(2)}%</span><span class="label">Possible links absent</span></div>
  `;
}

/* ---------------- Aha! ---------------- */

function setupAha(data) {
  document.getElementById("aha-grid").innerHTML = data.ahaFindings
    .map(
      (f) => `
    <div class="aha-card">
      <div class="aha-icon">${f.icon}</div>
      <div class="aha-title">${f.title}</div>
      <div class="aha-text">${f.text}</div>
    </div>`
    )
    .join("");
}

/* ---------------- Story ---------------- */

function setupStory(data) {
  document.getElementById("story-question").textContent = data.story.question;
  document.getElementById("story-did").textContent = data.story.whatWeDid;
  document.getElementById("story-found").textContent = data.story.whatWeFound;
  document.getElementById("story-surprised").textContent = data.story.whatSurprisedUs;
  document.getElementById("findings-list").innerHTML = data.findings.map((f) => `<li>${f}</li>`).join("");
}

/* ---------------- Methodology / validation ---------------- */

function setupMethodology(data) {
  const checks = data.validation.sanityChecks;
  const labels = {
    sumInDegreeEqualsDirectedEdges: "Σ in-degree = directed edges",
    sumOutDegreeEqualsDirectedEdges: "Σ out-degree = directed edges",
    sumUndirectedDegreeEqualsTwiceEdges: "Σ degree = 2 × undirected edges",
    avgDegreeEquals2mOverN: "avg degree = 2m / n",
    maxPossibleEdgesFormula: "max edges = n(n−1)/2",
    densityEqualsMOverMax: "density = m / max edges",
  };
  document.getElementById("validation-checks").innerHTML = Object.entries(checks)
    .map(
      ([key, ok]) => `
    <div class="stat-card in-view">
      <span class="icon">${ok ? "✅" : "❌"}</span>
      <span class="label">${labels[key] || key}</span>
    </div>`
    )
    .join("");
}

function setupDatasetInfo(data) {
  const el = document.getElementById("dataset-generated-at");
  const date = new Date(data.meta.generatedAt);
  el.textContent = `Analysis last generated: ${date.toLocaleString()} · ${data.validation.numNodesRoster} nodes, ${data.validation.numDirectedEdgeRows} directed edge rows read from the raw files.`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
