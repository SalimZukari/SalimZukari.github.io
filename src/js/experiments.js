// Small interactive experiments: who rules the network, delete a hero,
// find a path, guess the degree. All computed live from the loaded dataset.

import { allNodes, getNode, shortestPath, connectedComponentsExcluding, fmt } from "./data.js";

export function setupWhoRules(root) {
  const buttons = root.querySelectorAll("[data-rule-metric]");
  const resultBox = root.querySelector(".result-box");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const metric = btn.dataset.ruleMetric; // undirectedDegree | inDegree | outDegree
      const winner = allNodes().reduce((best, n) => (n[metric] > (best ? best[metric] : -1) ? n : best), null);
      resultBox.classList.add("visible");
      resultBox.innerHTML = `
        <p style="margin:0 0 6px;color:var(--text-dim)">👑 The winner is...</p>
        <p style="font-family:var(--font-display);font-size:1.8rem;color:var(--accent-3);margin:0 0 8px">${winner.name}</p>
        <p style="margin:0;color:var(--text-dim)">${metricLabel(metric)}: <strong style="color:var(--text)">${winner[metric]}</strong></p>
      `;
    });
  });
}

function metricLabel(metric) {
  return { undirectedDegree: "Degree", inDegree: "In-degree", outDegree: "Out-degree" }[metric] || metric;
}

export function setupDeleteHero(root, { onPreview, onClear } = {}) {
  const select = root.querySelector("select[data-delete-select]");
  const resultBox = root.querySelector(".result-box");
  const btn = root.querySelector("[data-delete-run]");
  const resetBtn = root.querySelector("[data-delete-reset]");
  const stats = allNodes();

  const nonIsolated = stats.filter((n) => !n.isIsolated).sort((a, b) => b.undirectedDegree - a.undirectedDegree);
  select.innerHTML = nonIsolated.map((n) => `<option value="${n.id}">${n.name} (degree ${n.undirectedDegree})</option>`).join("");

  const totalNodes = stats.length;
  const totalComponentsBefore = new Set(stats.map((n) => n.componentId)).size;
  const largestBefore = Math.max(...stats.map((n) => n.componentSize));

  function run() {
    const id = select.value;
    const node = getNode(id);
    const after = connectedComponentsExcluding(id);
    const largestAfter = after.length ? after[0].length : 0;

    resultBox.classList.add("visible");
    resultBox.innerHTML = `
      <p style="margin-top:0">Removing <strong>${node.name}</strong> ${node.isArticulationPoint ? '<span class="badge badge-ap">Articulation point</span>' : ""}</p>
      <div class="before-after">
        <div>
          <span class="ba-metric">${totalNodes}</span>
          <span class="ba-label">Nodes before</span>
        </div>
        <div class="arrow">→</div>
        <div>
          <span class="ba-metric after-change">${totalNodes - 1}</span>
          <span class="ba-label">Nodes after</span>
        </div>
      </div>
      <div class="before-after" style="margin-top:14px">
        <div>
          <span class="ba-metric">${totalComponentsBefore}</span>
          <span class="ba-label">Components before</span>
        </div>
        <div class="arrow">→</div>
        <div>
          <span class="ba-metric after-change">${after.length}</span>
          <span class="ba-label">Components after</span>
        </div>
      </div>
      <div class="before-after" style="margin-top:14px">
        <div>
          <span class="ba-metric">${largestBefore}</span>
          <span class="ba-label">Largest component before</span>
        </div>
        <div class="arrow">→</div>
        <div>
          <span class="ba-metric after-change">${largestAfter}</span>
          <span class="ba-label">Largest component after</span>
        </div>
      </div>
      <p class="chart-caption" style="margin-top:14px">
        ${
          after.length > totalComponentsBefore
            ? `Removing ${node.name} splits the network into more pieces — a sign of real structural importance, not just popularity.`
            : `Removing ${node.name} does not change the number of components — the network stays just as connected without them.`
        }
      </p>
    `;
    onPreview && onPreview(id);
  }

  btn.addEventListener("click", run);
  resetBtn.addEventListener("click", () => {
    resultBox.classList.remove("visible");
    onClear && onClear();
  });
}

export function setupPathFinder(root, { onPath, onClear } = {}) {
  const selectA = root.querySelector("[data-path-a]");
  const selectB = root.querySelector("[data-path-b]");
  const btn = root.querySelector("[data-path-run]");
  const resultBox = root.querySelector(".result-box");
  const nodes = allNodes().slice().sort((a, b) => a.name.localeCompare(b.name));
  const options = nodes.map((n) => `<option value="${n.id}">${n.name}</option>`).join("");
  selectA.innerHTML = options;
  selectB.innerHTML = options;
  if (nodes.length > 1) selectB.value = nodes[1].id;

  btn.addEventListener("click", () => {
    const a = selectA.value;
    const b = selectB.value;
    if (a === b) {
      resultBox.classList.add("visible");
      resultBox.innerHTML = `<p style="margin:0">Pick two different characters to find a path between them.</p>`;
      return;
    }
    const path = shortestPath(a, b);
    resultBox.classList.add("visible");
    if (!path) {
      resultBox.innerHTML = `<p style="margin:0">${getNode(a).name} and ${getNode(b).name} are not connected — no path exists between their components.</p>`;
      onClear && onClear();
      return;
    }
    const steps = path.length - 1;
    resultBox.innerHTML = `
      <p style="margin:0 0 10px">These characters are <strong style="color:var(--accent-3)">${steps} step${steps === 1 ? "" : "s"}</strong> apart.</p>
      <p style="margin:0;color:var(--text-dim);font-size:0.9rem">${path.map((id) => getNode(id).name).join(" → ")}</p>
    `;
    onPath && onPath(path);
  });
}

export function setupGuessDegree(root) {
  const nameEl = root.querySelector("[data-guess-name]");
  const descEl = root.querySelector("[data-guess-desc]");
  const slider = root.querySelector("[data-guess-slider]");
  const valueEl = root.querySelector("[data-guess-value]");
  const revealBtn = root.querySelector("[data-guess-reveal]");
  const nextBtn = root.querySelector("[data-guess-next]");
  const resultBox = root.querySelector(".result-box");

  const pool = allNodes().filter((n) => !n.isIsolated);
  let current = null;

  function pick() {
    current = pool[Math.floor(Math.random() * pool.length)];
    nameEl.textContent = current.name;
    descEl.textContent = current.description || "";
    slider.max = 50;
    slider.value = 10;
    valueEl.textContent = slider.value;
    resultBox.classList.remove("visible");
  }

  slider.addEventListener("input", () => {
    valueEl.textContent = slider.value;
  });

  revealBtn.addEventListener("click", () => {
    const guess = Number(slider.value);
    const actual = current.undirectedDegree;
    const diff = Math.abs(guess - actual);
    resultBox.classList.add("visible");
    resultBox.innerHTML = `
      <p style="margin:0 0 6px">Your guess: <strong>${guess}</strong> &nbsp;·&nbsp; Actual degree: <strong style="color:var(--accent-3)">${actual}</strong></p>
      <p style="margin:0;color:var(--text-dim)">${
        diff === 0
          ? "Exact match! Great intuition for network structure."
          : diff <= 3
          ? "Close! You have a good feel for this network."
          : "Off by quite a bit — this network's degree distribution is more uneven than intuition suggests."
      }</p>
    `;
  });

  nextBtn.addEventListener("click", pick);
  pick();
}
