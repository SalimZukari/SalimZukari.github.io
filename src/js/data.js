// Data loading + shared lookups for the Marvel Network Explorer.
// Everything downstream reads from the single analysis.json produced by
// scripts/analyze.py — nothing here invents numbers.

const DATA_URL = "data/processed/analysis.json";

export const store = {
  raw: null,
  nodesById: new Map(),
  adjacency: new Map(), // undirected neighbor id list, from precomputed data
};

export async function loadData() {
  const res = await fetch(DATA_URL, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(
      `Could not load ${DATA_URL} (HTTP ${res.status}). Run "npm run analyze" to generate it from the raw dataset.`
    );
  }
  const json = await res.json();
  store.raw = json;
  store.nodesById.clear();
  store.adjacency.clear();
  for (const node of json.nodes) {
    store.nodesById.set(node.id, node);
    store.adjacency.set(node.id, node.neighbors);
  }
  return json;
}

export function getNode(id) {
  return store.nodesById.get(id) || null;
}

export function allNodes() {
  return store.raw ? store.raw.nodes : [];
}

export function searchNodes(query, limit = 8) {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const matches = allNodes().filter((n) => n.name.toLowerCase().includes(q));
  matches.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return b.undirectedDegree - a.undirectedDegree;
  });
  return matches.slice(0, limit);
}

export function fmt(n, digits = 0) {
  if (typeof n !== "number") return n;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

// Breadth-first shortest path over the (optionally node-excluded) undirected
// adjacency, computed live in the browser — the dataset is small (303 nodes)
// so this is instantaneous.
export function shortestPath(sourceId, targetId, excludeIds = new Set()) {
  if (sourceId === targetId) return [sourceId];
  if (excludeIds.has(sourceId) || excludeIds.has(targetId)) return null;
  const visited = new Set([sourceId]);
  const prev = new Map();
  const queue = [sourceId];
  let qi = 0;
  while (qi < queue.length) {
    const current = queue[qi++];
    const neighbors = store.adjacency.get(current) || [];
    for (const next of neighbors) {
      if (excludeIds.has(next) || visited.has(next)) continue;
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

// Recompute connected components live, optionally excluding one node id.
// Used by the "Delete a Character" / articulation-point experiment.
export function connectedComponentsExcluding(excludeId) {
  const ids = allNodes()
    .map((n) => n.id)
    .filter((id) => id !== excludeId);
  const idSet = new Set(ids);
  const visited = new Set();
  const components = [];
  for (const start of ids) {
    if (visited.has(start)) continue;
    const comp = [];
    const queue = [start];
    visited.add(start);
    let qi = 0;
    while (qi < queue.length) {
      const current = queue[qi++];
      comp.push(current);
      const neighbors = store.adjacency.get(current) || [];
      for (const next of neighbors) {
        if (next === excludeId || !idSet.has(next) || visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    components.push(comp);
  }
  components.sort((a, b) => b.length - a.length);
  return components;
}

// Short, data-driven interpretation text for a character — never generic.
export function interpretCharacter(node) {
  const stats = store.raw.stats;
  const sentences = [];

  if (node.isIsolated) {
    sentences.push(
      `${node.name} is an isolated character in this dataset: no other Marvel page links to or from it, giving a degree of 0.`
    );
    return sentences.join(" ");
  }

  const degreeRatio = node.undirectedDegree / stats.avgDegree;
  if (degreeRatio >= 3) {
    sentences.push(
      `${node.name} is dramatically more connected than a typical character — its degree of ${node.undirectedDegree} is about ${degreeRatio.toFixed(1)}× the network average of ${stats.avgDegree.toFixed(1)}.`
    );
  } else if (degreeRatio >= 1.3) {
    sentences.push(
      `${node.name} is more connected than average, with a degree of ${node.undirectedDegree} versus a network-wide average of ${stats.avgDegree.toFixed(1)}.`
    );
  } else if (degreeRatio <= 0.5) {
    sentences.push(
      `${node.name} sits below the network average in connectivity, with a degree of ${node.undirectedDegree} against an average of ${stats.avgDegree.toFixed(1)}.`
    );
  } else {
    sentences.push(
      `${node.name} has a fairly typical degree of ${node.undirectedDegree}, close to the network average of ${stats.avgDegree.toFixed(1)}.`
    );
  }

  const diff = node.inDegree - node.outDegree;
  if (Math.abs(diff) >= 3) {
    if (diff > 0) {
      sentences.push(
        `Many more pages link to ${node.name} (in-degree ${node.inDegree}) than ${node.name}'s own page links out (out-degree ${node.outDegree}), suggesting a prominent, frequently-referenced position.`
      );
    } else {
      sentences.push(
        `${node.name}'s page links out to far more characters (out-degree ${node.outDegree}) than link back to it (in-degree ${node.inDegree}), suggesting a more connective, outward-looking role.`
      );
    }
  }

  if (node.isArticulationPoint) {
    sentences.push(
      `${node.name} is also a structural bridge (an articulation point): removing this character from the network would split part of it into separate components — a form of importance that raw degree doesn't capture.`
    );
  }

  if (node.isInLargestComponent) {
    sentences.push(`${node.name} belongs to the largest connected component, alongside ${stats.largestComponentSize - 1} other characters.`);
  } else {
    sentences.push(
      `${node.name} belongs to a smaller component of ${node.componentSize} character${node.componentSize === 1 ? "" : "s"}, separate from the main network.`
    );
  }

  return sentences.join(" ");
}
