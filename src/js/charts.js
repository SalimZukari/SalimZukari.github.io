// D3-based charts: degree distribution (linear + log-log), in/out-degree
// scatter, component-size bars, and the density grid metaphor.
/* global d3 */
import { bindTip } from "./tooltip.js";

// Visible dots are r=4-4.5, too small to hit reliably with a finger or a
// trackpad, so each one gets a transparent r=11 hit circle in a layer *under*
// the visible dots: pointing straight at a dot still picks that dot, pointing
// near it picks it too.
const HIT_R = 11;
function addHitDots(parent, data, cx, cy) {
  return parent
    .append("g")
    .attr("class", "hit-layer")
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("class", "hit-dot")
    .attr("r", HIT_R)
    .attr("cx", cx)
    .attr("cy", cy)
    .attr("aria-hidden", "true");
}

let clipSeq = 0;

function clear(container) {
  d3.select(container).selectAll("*").remove();
}

function responsiveSvg(container, heightPx) {
  const width = container.clientWidth || 600;
  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${heightPx}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img");
  return { svg, width, height: heightPx };
}

/**
 * Render the degree distribution as a bar chart.
 * @param {HTMLElement} container
 * @param {Array<{k:number,count:number}>} dist
 * @param {{ log: boolean, onHover?: Function, label?: string }} opts
 */
export function renderDegreeDistribution(container, dist, opts = {}) {
  clear(container);
  if (!dist.length) return;
  const margin = { top: 20, right: 20, bottom: 46, left: 54 };
  const { svg, width, height } = responsiveSvg(container, 340);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const maxK = d3.max(dist, (d) => d.k);
  const maxCount = d3.max(dist, (d) => d.count);

  const x = opts.log
    ? d3.scaleLog().domain([1, Math.max(maxK || 1, 2)]).range([0, innerW])
    : d3.scaleLinear().domain([0, maxK || 1]).range([0, innerW]);

  const y = opts.log
    ? d3.scaleLog().domain([1, maxCount || 1]).range([innerH, 0]).nice()
    : d3.scaleLinear().domain([0, maxCount || 1]).range([innerH, 0]).nice();

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(8, opts.log ? "~s" : undefined));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6, opts.log ? "~s" : undefined));

  g.append("text")
    .attr("x", innerW / 2)
    .attr("y", innerH + 38)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)")
    .style("font-size", "0.8rem")
    .text(opts.log ? "Degree k (log scale)" : "Degree k");

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerH / 2)
    .attr("y", -40)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)")
    .style("font-size", "0.8rem")
    .text(opts.log ? "# nodes (log scale)" : "# nodes with degree k");

  const barWidth = opts.log ? null : Math.max(2, innerW / dist.length - 2);

  g.selectAll("rect.bar")
    .data(dist)
    .join("rect")
    .attr("class", "bar")
    .attr("x", (d) => (opts.log ? x(Math.max(d.k, 1)) - 2 : x(d.k)))
    .attr("width", (d) => (opts.log ? 4 : barWidth))
    .attr("y", (d) => y(opts.log ? Math.max(d.count, 1) : d.count))
    .attr("height", (d) => innerH - y(opts.log ? Math.max(d.count, 1) : d.count))
    .attr("tabindex", "0")
    .attr("role", "img")
    .attr("aria-label", (d) => `Degree ${d.k}: ${d.count} characters`)
    .call(bindTip, (d) => `<strong>Degree ${d.k}</strong><br>${d.count} character${d.count === 1 ? "" : "s"}`, {
      onShow: (event, d) => opts.onHover && opts.onHover(d),
    });
}

export function renderScatter(container, nodes, opts = {}) {
  clear(container);
  const margin = { top: 20, right: 30, bottom: 50, left: 54 };
  const { svg, width, height } = responsiveSvg(container, 460);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // unique per call: two scatters on one page must not share a clipPath id
  const clipId = `scatter-clip-${++clipSeq}`;
  svg.append("defs").append("clipPath").attr("id", clipId).append("rect").attr("width", innerW).attr("height", innerH);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  // transparent surface so wheel/drag on empty plot area reaches the zoom
  // behaviour, which is bound to g so its pointer coordinates match the scales
  g.append("rect").attr("class", "zoom-surface").attr("width", innerW).attr("height", innerH).attr("fill", "transparent");

  const maxVal = Math.max(d3.max(nodes, (d) => d.inDegree), d3.max(nodes, (d) => d.outDegree)) || 1;

  const x = d3.scaleLinear().domain([0, maxVal * 1.05]).range([0, innerW]);
  const y = d3.scaleLinear().domain([0, maxVal * 1.05]).range([innerH, 0]);

  const xAxisG = g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x));
  const yAxisG = g.append("g").attr("class", "axis").call(d3.axisLeft(y));

  g.append("text")
    .attr("x", innerW / 2)
    .attr("y", innerH + 40)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)")
    .style("font-size", "0.8rem")
    .text("Out-degree (links this page makes)");
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerH / 2)
    .attr("y", -40)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)")
    .style("font-size", "0.8rem")
    .text("In-degree (links pointing here)");

  const plotArea = g.append("g").attr("clip-path", `url(#${clipId})`);

  plotArea
    .append("line")
    .attr("class", "ref-line")
    .attr("x1", x(0))
    .attr("y1", y(0))
    .attr("x2", x(maxVal * 1.05))
    .attr("y2", y(maxVal * 1.05));

  const hits = addHitDots(plotArea, nodes, (d) => x(d.outDegree), (d) => y(d.inDegree));
  const dots = plotArea
    .append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("class", "scatter-dot")
    .attr("cx", (d) => x(d.outDegree))
    .attr("cy", (d) => y(d.inDegree))
    .attr("r", 4.5)
    .attr("tabindex", "0")
    .attr("aria-label", (d) => `${d.name}: in-degree ${d.inDegree}, out-degree ${d.outDegree}`);

  const dotOf = (d) => dots.filter((n) => n === d);
  d3.selectAll([...hits.nodes(), ...dots.nodes()])
    .call(bindTip, (d) => `<strong>${d.name}</strong><br>In-degree: ${d.inDegree}<br>Out-degree: ${d.outDegree}`, {
      onShow: (event, d) => {
        dotOf(d).attr("r", 7);
        if (opts.onHover) opts.onHover(d);
      },
      onHide: (event, d) => dotOf(d).attr("r", 4.5),
    })
    .on("click", (event, d) => {
      if (opts.onClick) opts.onClick(d);
    });

  const zoomed = (event) => {
    const zx = event.transform.rescaleX(x);
    const zy = event.transform.rescaleY(y);
    xAxisG.call(d3.axisBottom(zx));
    yAxisG.call(d3.axisLeft(zy));
    dots.attr("cx", (d) => zx(d.outDegree)).attr("cy", (d) => zy(d.inDegree));
    hits.attr("cx", (d) => zx(d.outDegree)).attr("cy", (d) => zy(d.inDegree));
    plotArea
      .select(".ref-line")
      .attr("x1", zx(0))
      .attr("y1", zy(0))
      .attr("x2", zx(maxVal * 1.05))
      .attr("y2", zy(maxVal * 1.05));
  };

  g.call(
    d3.zoom()
      .scaleExtent([1, 12])
      .translateExtent([[0, 0], [innerW, innerH]])
      .extent([[0, 0], [innerW, innerH]])
      .on("zoom", zoomed)
  );
}

export function renderComponentBars(container, components) {
  clear(container);
  const wrap = d3.select(container);
  const maxSize = d3.max(components, (c) => c.size) || 1;
  const rows = wrap
    .selectAll("div.island-bar-row")
    .data(components)
    .join("div")
    .attr("class", "island-bar-row");

  rows.append("div").style("width", "150px").style("flex", "0 0 150px").style("color", "var(--text-dim)").text((d, i) => `Component ${i + 1} (${d.size})`);
  const track = rows.append("div").attr("class", "island-bar-track");
  track
    .append("div")
    .attr("class", (d) => `island-bar-fill${d.isLargest ? " largest" : ""}`)
    .style("width", (d) => `${Math.max(2, (d.size / maxSize) * 100)}%`);
}

/**
 * Week 3: z-score (betweenness or closeness) vs. degree, log-x scatter.
 * Nothing is permanently labeled with text (with ~280 points that's
 * unreadable no matter how few labels you pick) — a handful of notable
 * outliers just get a bigger, ringed dot, and every dot reveals its name
 * and exact (degree, z) position on hover, focus, or click/tap, via both
 * a floating tooltip and a persistent on-chart readout so the ID is still
 * visible after the pointer moves away (and works on touch/keyboard).
 * @param {HTMLElement} container
 * @param {Array<{id:string,name:string,degree:number,z:number}>} points
 * @param {{ label: string, labelIds?: string[], onHover?: Function, onSelect?: Function }} opts
 */
export function renderZScoreScatter(container, points, opts = {}) {
  clear(container);
  if (!points.length) return;
  const margin = { top: 20, right: 24, bottom: 46, left: 54 };
  const { svg, width, height } = responsiveSvg(container, 380);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const maxDeg = d3.max(points, (d) => d.degree) || 1;
  const zExtent = d3.extent(points, (d) => d.z);
  const zPad = Math.max(0.5, (zExtent[1] - zExtent[0]) * 0.08);

  const x = d3.scaleLog().domain([1, maxDeg]).range([0, innerW]);
  const y = d3.scaleLinear().domain([zExtent[0] - zPad, zExtent[1] + zPad]).range([innerH, 0]);

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6, "~s"));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6));

  g.append("text")
    .attr("x", innerW / 2).attr("y", innerH + 38).attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)").style("font-size", "0.8rem")
    .text("degree (log scale)");
  g.append("text")
    .attr("transform", "rotate(-90)").attr("x", -innerH / 2).attr("y", -40).attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)").style("font-size", "0.8rem")
    .text(`${opts.label || "z"}-score`);

  g.append("line")
    .attr("x1", 0).attr("x2", innerW).attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", "var(--text-faint)").attr("stroke-dasharray", "4 4");

  const labelSet = new Set(opts.labelIds || []);

  const hits = addHitDots(g, points, (d) => x(Math.max(d.degree, 1)), (d) => y(d.z));
  const dots = g
    .append("g")
    .selectAll("circle.zdot")
    .data(points)
    .join("circle")
    .attr("class", "zdot")
    .attr("cx", (d) => x(Math.max(d.degree, 1)))
    .attr("cy", (d) => y(d.z))
    .attr("r", (d) => (labelSet.has(d.id) ? 6 : 4))
    .attr("fill", (d) => (d.z >= 0 ? "var(--accent-2)" : "var(--accent)"))
    .attr("fill-opacity", (d) => (labelSet.has(d.id) ? 1 : 0.55))
    .attr("tabindex", "0")
    .attr("role", "button")
    .attr("aria-label", (d) => `${d.name}: degree ${d.degree}, z-score ${d.z.toFixed(2)}`);

  const dotOf = (d) => dots.filter((p) => p === d);
  function selectPoint(d) {
    dots.attr("stroke", null).attr("stroke-width", null);
    dotOf(d).attr("stroke", "var(--accent-3)").attr("stroke-width", 2.5);
    if (opts.onSelect) opts.onSelect(d);
  }

  d3.selectAll([...hits.nodes(), ...dots.nodes()])
    .call(bindTip, (d) => `<strong>${d.name}</strong><br>degree ${d.degree}<br>z = ${d.z.toFixed(2)}`, {
      onShow: (event, d) => {
        dotOf(d).raise();
        if (opts.onHover) opts.onHover(d);
      },
    })
    .on("click", (event, d) => selectPoint(d));
  dots.on("keydown", (event, d) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPoint(d);
    }
  });
}

/**
 * Week 3: giant-component-fraction-vs-removed line chart with a toggleable
 * legend (click a series name to show/hide it).
 * @param {HTMLElement} container
 * @param {Array<{key:string,label:string,color:string,points:Array<{removed:number,giantFraction:number}>}>} series
 */
export function renderRemovalChart(container, series) {
  clear(container);
  const margin = { top: 20, right: 20, bottom: 46, left: 54 };
  const { svg, width, height } = responsiveSvg(container, 420);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const maxRemoved = d3.max(series, (s) => d3.max(s.points, (p) => p.removed));
  const x = d3.scaleLinear().domain([0, maxRemoved]).range([0, innerW]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(8));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6, "%"));

  g.append("text")
    .attr("x", innerW / 2).attr("y", innerH + 38).attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)").style("font-size", "0.8rem")
    .text("characters removed");
  g.append("text")
    .attr("transform", "rotate(-90)").attr("x", -innerH / 2).attr("y", -40).attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)").style("font-size", "0.8rem")
    .text("giant component fraction");

  const line = d3.line().x((p) => x(p.removed)).y((p) => y(p.giantFraction));

  const paths = g
    .selectAll("path.removal-line")
    .data(series, (s) => s.key)
    .join("path")
    .attr("class", "removal-line")
    .attr("fill", "none")
    .attr("stroke", (s) => s.color)
    .attr("stroke-width", 2.2)
    .attr("d", (s) => line(s.points))
    .call(bindTip, (s) => `<strong>${s.label}</strong>`);

  const legend = d3.select(container.parentElement).select(".removal-legend").empty()
    ? d3.select(container.parentElement).append("div").attr("class", "removal-legend")
    : d3.select(container.parentElement).select(".removal-legend");
  legend.selectAll("*").remove();
  legend
    .selectAll("button.removal-legend-item")
    .data(series, (s) => s.key)
    .join("button")
    .attr("class", "removal-legend-item")
    .attr("type", "button")
    .style("--legend-color", (s) => s.color)
    .html((s) => `<span class="removal-legend-swatch"></span>${s.label}`)
    .on("click", function (event, s) {
      s.hidden = !s.hidden;
      d3.select(this).classed("is-hidden", s.hidden);
      paths.filter((d) => d.key === s.key).attr("display", s.hidden ? "none" : null);
    });
}

// A row of toggle buttons under a chart (same markup as the removal chart's
// legend); clicking one shows/hides that series.
function toggleLegend(container, series, onToggle) {
  const parent = d3.select(container.parentElement);
  const legend = parent.select(".removal-legend").empty() ? parent.append("div").attr("class", "removal-legend") : parent.select(".removal-legend");
  legend.selectAll("*").remove();
  legend
    .selectAll("button.removal-legend-item")
    .data(series, (s) => s.key)
    .join("button")
    .attr("class", "removal-legend-item")
    .attr("type", "button")
    .classed("is-hidden", (s) => !!s.hidden)
    .attr("aria-pressed", (s) => String(!s.hidden))
    .style("--legend-color", (s) => s.color)
    .html((s) => `<span class="removal-legend-swatch"></span>${s.label}`)
    .on("click", function (event, s) {
      s.hidden = !s.hidden;
      d3.select(this).classed("is-hidden", s.hidden).attr("aria-pressed", String(!s.hidden));
      onToggle(s);
    });
}

/**
 * Week 2: degree CCDF on log-log axes, one line per network. Drawn exactly
 * like matplotlib's loglog of the sorted degree sequence: a vertical run at
 * each degree k from P(K > k) + 1/n up to P(K >= k), then on to the next k.
 * Every distinct degree is a hoverable / focusable / tappable point.
 * @param {HTMLElement} container
 * @param {Array<{key:string,label:string,color:string,n:number,points:Array<{k:number,p:number}>}>} series
 * @param {{ onHover?: Function }} opts  onHover(series, point)
 */
export function renderCcdf(container, series, opts = {}) {
  clear(container);
  const margin = { top: 16, right: 20, bottom: 46, left: 62 };
  const { svg, width, height } = responsiveSvg(container, 380);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const all = series.flatMap((s) => s.points);
  const x = d3.scaleLog().domain([0.8, d3.max(all, (p) => p.k) * 1.3]).range([0, innerW]);
  const y = d3.scaleLog().domain([d3.min(all, (p) => p.p) * 0.6, 1.4]).range([innerH, 0]);

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6, "~s"));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5, "~g"));
  g.append("text")
    .attr("x", innerW / 2).attr("y", innerH + 38).attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)").style("font-size", "0.8rem")
    .text("degree k (log scale)");
  g.append("text")
    .attr("transform", "rotate(-90)").attr("x", -innerH / 2).attr("y", -48).attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)").style("font-size", "0.8rem")
    .text("P(K ≥ k) (log scale)");

  const stairs = (s) => {
    const desc = [...s.points].sort((a, b) => b.k - a.k);
    const out = [];
    desc.forEach((pt, i) => {
      const above = i === 0 ? 0 : desc[i - 1].p; // P(K > k)
      out.push([pt.k, above + 1 / s.n], [pt.k, pt.p]);
    });
    return out;
  };
  const line = d3.line().x((d) => x(d[0])).y((d) => y(d[1]));

  const groups = g.selectAll("g.ccdf-series").data(series, (s) => s.key).join("g").attr("class", "ccdf-series");
  groups.append("path").attr("fill", "none").attr("stroke", (s) => s.color).attr("stroke-width", 1.6).attr("d", (s) => line(stairs(s)));

  const pts = series.flatMap((s) => s.points.map((p) => ({ s, ...p })));
  const tip = (d) => `<strong>${d.s.label}</strong><br>P(K ≥ ${d.k}) = ${d3.format(".3~g")(d.p)}`;
  const hits = addHitDots(groups, (s) => pts.filter((d) => d.s === s), (d) => x(d.k), (d) => y(d.p)).attr("r", 7);
  const dots = groups
    .append("g")
    .selectAll("circle")
    .data((s) => pts.filter((d) => d.s === s))
    .join("circle")
    .attr("class", "ccdf-dot")
    .attr("cx", (d) => x(d.k))
    .attr("cy", (d) => y(d.p))
    .attr("r", 2.5)
    .attr("fill", (d) => d.s.color)
    .attr("tabindex", "0")
    .attr("aria-label", (d) => `${d.s.label}: P(K ≥ ${d.k}) = ${d.p.toFixed(4)}`);
  d3.selectAll([...hits.nodes(), ...dots.nodes()]).call(bindTip, tip, {
    onShow: (event, d) => opts.onHover && opts.onHover(d.s, d),
  });

  toggleLegend(container, series, (s) => groups.filter((d) => d.key === s.key).attr("display", s.hidden ? "none" : null));
}

/**
 * Week 2: grouped bars, one group per network, one bar per measure, with an
 * optional note printed above each group.
 * @param {HTMLElement} container
 * @param {Array<{label:string, note?:string, values:Array<{key:string,label:string,value:number,color:string}>}>} groups
 * @param {{ yLabel?: string, noteLabel?: string, onHover?: Function }} opts  onHover(group, bar)
 */
export function renderGroupedBars(container, groups, opts = {}) {
  clear(container);
  const narrow = (container.clientWidth || 600) < 560;
  const margin = { top: 26, right: 16, bottom: narrow ? 70 : 46, left: 54 };
  const { svg, width, height } = responsiveSvg(container, 360);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const keys = groups[0].values.map((v) => v.key);
  const x0 = d3.scaleBand().domain(groups.map((d) => d.label)).range([0, innerW]).paddingInner(0.22).paddingOuter(0.08);
  const x1 = d3.scaleBand().domain(keys).range([0, x0.bandwidth()]).padding(0.04);
  const y = d3.scaleLinear().domain([0, d3.max(groups, (d) => d3.max(d.values, (v) => v.value))]).nice().range([innerH, 0]);

  const xAxis = g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x0));
  if (narrow) xAxis.selectAll("text").attr("transform", "rotate(-24)").attr("text-anchor", "end").attr("dx", "-0.4em").attr("dy", "0.6em");
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6));
  g.append("text")
    .attr("transform", "rotate(-90)").attr("x", -innerH / 2).attr("y", -40).attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)").style("font-size", "0.8rem")
    .text(opts.yLabel || "");

  const gg = g.selectAll("g.bar-group").data(groups).join("g").attr("class", "bar-group").attr("transform", (d) => `translate(${x0(d.label)},0)`);
  gg.filter((d) => d.note)
    .append("text")
    .attr("x", x0.bandwidth() / 2).attr("y", -8).attr("text-anchor", "middle")
    .attr("fill", "var(--text)").style("font-size", "0.78rem")
    .text((d) => d.note);
  gg.selectAll("rect")
    .data((d) => d.values.map((v) => ({ group: d, ...v })))
    .join("rect")
    .attr("class", "grouped-bar")
    .attr("x", (d) => x1(d.key))
    .attr("width", x1.bandwidth())
    .attr("y", (d) => y(d.value))
    .attr("height", (d) => innerH - y(d.value))
    .attr("fill", (d) => d.color)
    .attr("tabindex", "0")
    .attr("aria-label", (d) => `${d.group.label}, ${d.label}: ${d.value.toFixed(2)}`)
    .call(bindTip, (d) => `<strong>${d.group.label}</strong><br>${d.label}: ${d.value.toFixed(2)}${d.group.note ? `<br>${opts.noteLabel ? `${opts.noteLabel} ` : ""}${d.group.note}` : ""}`, {
      onShow: (event, d) => opts.onHover && opts.onHover(d.group, d),
    });
}

/**
 * Week 2: histogram of precomputed bins (the pipeline bins with np.histogram,
 * so these are exactly the bars matplotlib drew), with an optional marker
 * line, e.g. the real network's value against a null distribution.
 * @param {HTMLElement} container
 * @param {Array<{x0:number,x1:number,count:number}>} bins
 * @param {{ xLabel?: string, yLabel?: string, marker?: {value:number,label:string}, binLabel?: Function, onHover?: Function }} opts
 */
export function renderHistogram(container, bins, opts = {}) {
  clear(container);
  const margin = { top: 16, right: 18, bottom: 46, left: 54 };
  const { svg, width, height } = responsiveSvg(container, 320);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const lo = Math.min(bins[0].x0, opts.marker ? opts.marker.value : Infinity);
  const hi = Math.max(bins[bins.length - 1].x1, opts.marker ? opts.marker.value : -Infinity);
  const pad = (hi - lo) * 0.04;
  const x = d3.scaleLinear().domain([lo - pad, hi + pad]).range([0, innerW]);
  const y = d3.scaleLinear().domain([0, d3.max(bins, (b) => b.count)]).nice().range([innerH, 0]);

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(Math.max(4, Math.floor(innerW / 80))));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6));
  g.append("text")
    .attr("x", innerW / 2).attr("y", innerH + 38).attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)").style("font-size", "0.8rem")
    .text(opts.xLabel || "");
  g.append("text")
    .attr("transform", "rotate(-90)").attr("x", -innerH / 2).attr("y", -40).attr("text-anchor", "middle")
    .attr("fill", "var(--text-dim)").style("font-size", "0.8rem")
    .text(opts.yLabel || "");

  const label = opts.binLabel || ((b) => `${b.count} in [${d3.format(".3~f")(b.x0)}, ${d3.format(".3~f")(b.x1)})`);
  g.selectAll("rect.bar")
    .data(bins)
    .join("rect")
    .attr("class", "bar")
    .attr("x", (b) => x(b.x0) + 0.5)
    .attr("width", (b) => Math.max(1, x(b.x1) - x(b.x0) - 1))
    .attr("y", (b) => y(b.count))
    .attr("height", (b) => innerH - y(b.count))
    .attr("tabindex", "0")
    .attr("role", "img")
    .attr("aria-label", label)
    .call(bindTip, label, { onShow: (event, b) => opts.onHover && opts.onHover(b) });

  if (opts.marker) {
    const mx = x(opts.marker.value);
    g.append("line")
      .attr("x1", mx).attr("x2", mx).attr("y1", 0).attr("y2", innerH)
      .attr("stroke", "var(--accent)").attr("stroke-width", 2.5).attr("pointer-events", "none");
    const right = mx < innerW * 0.7;
    g.append("text")
      .attr("x", mx + (right ? 6 : -6)).attr("y", 12).attr("text-anchor", right ? "start" : "end")
      .attr("fill", "var(--accent)").style("font-size", "0.8rem").attr("pointer-events", "none")
      .attr("stroke", "var(--panel)").attr("stroke-width", 4).attr("paint-order", "stroke") // halo over bars
      .text(opts.marker.label);
  }
}

export function renderDensityGrid(container, density, totalCells = 100) {
  clear(container);
  const filled = Math.max(1, Math.round(density * totalCells));
  const wrap = d3.select(container).attr("role", "img").attr("aria-label", `Density grid: ${filled} of ${totalCells} cells filled, representing a density of ${(density * 100).toFixed(1)}%`);
  for (let i = 0; i < totalCells; i++) {
    wrap.append("div").attr("class", `density-cell${i < filled ? " filled" : ""}`);
  }
}
