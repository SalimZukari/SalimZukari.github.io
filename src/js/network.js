// Interactive force-directed network graph (D3 force simulation).
/* global d3 */

const COMPONENT_PALETTE = [
  "#37e6ff", "#ff3d68", "#ffd23f", "#8c6bff", "#4ade80",
  "#ff9f5a", "#5ad1ff", "#f472b6", "#a3e635", "#fb7185",
];

function componentColor(componentId, isLargest) {
  if (isLargest) return "#37e6ff";
  return COMPONENT_PALETTE[(componentId + 1) % COMPONENT_PALETTE.length];
}

export function createNetworkGraph(svgEl, { nodes, edges }, callbacks = {}) {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  const width = svgEl.clientWidth || 900;
  const height = svgEl.clientHeight || 600;
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  const root = svg.append("g").attr("class", "zoom-root");
  const linkLayer = root.append("g").attr("class", "links").attr("stroke", "#3a4568").attr("stroke-opacity", 0.5);
  const nodeLayer = root.append("g").attr("class", "nodes");
  const labelLayer = root.append("g").attr("class", "labels");

  const zoomBehavior = d3.zoom()
    .scaleExtent([0.15, 6])
    .on("zoom", (event) => root.attr("transform", event.transform));
  svg.call(zoomBehavior);

  let simNodes = [];
  let simLinks = [];
  let showLabels = false;
  let sizeMetric = "undirectedDegree";
  let selectedId = null;
  let neighborSet = new Set();

  const simulation = d3
    .forceSimulation()
    .force("link", d3.forceLink().id((d) => d.id).distance(38).strength(0.35))
    .force("charge", d3.forceManyBody().strength(-70))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius((d) => radiusFor(d) + 3));

  function radiusFor(d) {
    const v = d[sizeMetric] || 0;
    return 4 + Math.sqrt(v) * 2.1;
  }

  let linkSel, nodeSel, labelSel;

  function idFrom(x) {
    return typeof x === "object" ? x.id : x;
  }

  function render() {
    linkSel = linkLayer
      .selectAll("line")
      .data(simLinks, (d) => `${idFrom(d.source)}->${idFrom(d.target)}`)
      .join("line")
      .attr("stroke-width", 1);

    nodeSel = nodeLayer
      .selectAll("circle")
      .data(simNodes, (d) => d.id)
      .join((enter) => {
        const c = enter
          .append("circle")
          .attr("tabindex", "0")
          .attr("role", "button")
          .call(drag(simulation));
        c.append("title");
        return c;
      });

    nodeSel
      .attr("r", radiusFor)
      .attr("fill", (d) => componentColor(d.componentId, d.isInLargestComponent))
      .attr("stroke", (d) => (d.isArticulationPoint ? "#ffd23f" : "#0a0d16"))
      .attr("stroke-width", (d) => (d.isArticulationPoint ? 2 : 1))
      .select("title")
      .text((d) => `${d.name} — degree ${d.undirectedDegree} (in ${d.inDegree} / out ${d.outDegree})`);

    nodeSel
      .on("mouseenter focus", (event, d) => {
        callbacks.onHover && callbacks.onHover(d);
        applyHighlight(d.id);
      })
      .on("mouseleave", () => {
        if (!selectedId) applyHighlight(null);
      })
      .on("click", (event, d) => {
        selectedId = d.id;
        applyHighlight(d.id);
        callbacks.onSelect && callbacks.onSelect(d);
      });

    labelSel = labelLayer
      .selectAll("text")
      .data(showLabels ? simNodes : [], (d) => d.id)
      .join("text")
      .attr("class", "node-label")
      .attr("dy", (d) => -(radiusFor(d) + 4))
      .attr("text-anchor", "middle")
      .text((d) => d.name);

    simulation.nodes(simNodes).on("tick", ticked);
    simulation.force("link").links(simLinks);
    simulation.alpha(0.9).restart();
  }

  function ticked() {
    linkSel
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    nodeSel.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
    labelSel.attr("x", (d) => d.x).attr("y", (d) => d.y);
  }

  function drag(sim) {
    function dragstarted(event, d) {
      if (!event.active) sim.alphaTarget(0.25).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
  }

  function applyHighlight(id) {
    if (!id) {
      neighborSet = new Set();
      nodeSel && nodeSel.attr("opacity", 1);
      linkSel && linkSel.attr("opacity", 0.5).attr("stroke", "#3a4568");
      labelSel && labelSel.attr("opacity", 1);
      return;
    }
    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
    const neighbors = new Set(nodeMap.get(id) ? nodeMap.get(id).neighbors.filter((n) => nodeMap.has(n)) : []);
    neighbors.add(id);
    neighborSet = neighbors;
    nodeSel.attr("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.12));
    linkSel
      .attr("opacity", (d) => (neighbors.has(idFrom(d.source)) && neighbors.has(idFrom(d.target)) ? 0.9 : 0.05))
      .attr("stroke", (d) => (idFrom(d.source) === id || idFrom(d.target) === id ? "#ff3d68" : "#3a4568"));
    labelSel && labelSel.attr("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.1));
  }

  function applyFilter({ minDegree = 0, onlyLargest = false, showIsolates = true } = {}) {
    const allowed = new Set(
      nodes
        .filter((n) => {
          if (!showIsolates && n.isIsolated) return false;
          if (onlyLargest && !n.isInLargestComponent) return false;
          if (n.undirectedDegree < minDegree) return false;
          return true;
        })
        .map((n) => n.id)
    );

    const prevPositions = new Map(simNodes.map((n) => [n.id, n]));
    simNodes = nodes
      .filter((n) => allowed.has(n.id))
      .map((n) => Object.assign({}, prevPositions.get(n.id) || {}, n));
    simLinks = edges
      .filter((e) => allowed.has(e.source) && allowed.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    render();
    if (selectedId && allowed.has(selectedId)) {
      applyHighlight(selectedId);
    } else {
      selectedId = null;
      applyHighlight(null);
    }
  }

  function setSizeMetric(metric) {
    sizeMetric = metric;
    simulation.force("collide", d3.forceCollide().radius((d) => radiusFor(d) + 3));
    if (nodeSel) nodeSel.attr("r", radiusFor);
    if (labelSel) labelSel.attr("dy", (d) => -(radiusFor(d) + 4));
    simulation.alpha(0.4).restart();
  }

  function setLabels(on) {
    showLabels = on;
    render();
  }

  function focusOn(id) {
    selectedId = id;
    applyHighlight(id);
    const node = simNodes.find((n) => n.id === id);
    if (node && node.x != null) {
      const transform = d3.zoomIdentity.translate(width / 2, height / 2).scale(1.6).translate(-node.x, -node.y);
      svg.transition().duration(500).call(zoomBehavior.transform, transform);
    }
  }

  function clearSelection() {
    selectedId = null;
    applyHighlight(null);
  }

  function resetView() {
    svg.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity);
  }

  applyFilter({});

  return {
    applyFilter,
    setSizeMetric,
    setLabels,
    focusOn,
    clearSelection,
    resetView,
    componentColor,
  };
}
