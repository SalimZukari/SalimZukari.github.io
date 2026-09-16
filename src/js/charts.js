// D3-based charts: degree distribution (linear + log-log), in/out-degree
// scatter, component-size bars, and the density grid metaphor.
/* global d3 */

function tooltip() {
  let el = document.querySelector(".bar-hover-tip");
  if (!el) {
    el = document.createElement("div");
    el.className = "bar-hover-tip";
    el.style.display = "none";
    document.body.appendChild(el);
  }
  return el;
}

function showTip(html, event) {
  const tip = tooltip();
  tip.innerHTML = html;
  tip.style.display = "block";
  tip.style.left = `${event.clientX + 14}px`;
  tip.style.top = `${event.clientY + 14}px`;
}
function hideTip() {
  const tip = document.querySelector(".bar-hover-tip");
  if (tip) tip.style.display = "none";
}
document.addEventListener("mousemove", (e) => {
  const tip = document.querySelector(".bar-hover-tip");
  if (tip && tip.style.display === "block") {
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY + 14}px`;
  }
});

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
    .on("mouseenter focus", function (event, d) {
      showTip(`<strong>Degree ${d.k}</strong><br>${d.count} character${d.count === 1 ? "" : "s"}`, event);
      if (opts.onHover) opts.onHover(d);
    })
    .on("mousemove", (event) => showTip(tooltip().innerHTML, event))
    .on("mouseleave blur", () => hideTip());
}

export function renderScatter(container, nodes, opts = {}) {
  clear(container);
  const margin = { top: 20, right: 30, bottom: 50, left: 54 };
  const { svg, width, height } = responsiveSvg(container, 460);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const clip = svg.append("defs").append("clipPath").attr("id", "scatter-clip").append("rect").attr("width", innerW).attr("height", innerH);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

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

  const plotArea = g.append("g").attr("clip-path", "url(#scatter-clip)");

  plotArea
    .append("line")
    .attr("class", "ref-line")
    .attr("x1", x(0))
    .attr("y1", y(0))
    .attr("x2", x(maxVal * 1.05))
    .attr("y2", y(maxVal * 1.05));

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
    .attr("aria-label", (d) => `${d.name}: in-degree ${d.inDegree}, out-degree ${d.outDegree}`)
    .on("mouseenter focus", function (event, d) {
      d3.select(this).attr("r", 7);
      showTip(
        `<strong>${d.name}</strong><br>In-degree: ${d.inDegree}<br>Out-degree: ${d.outDegree}`,
        event
      );
      if (opts.onHover) opts.onHover(d);
    })
    .on("mousemove", (event) => showTip(tooltip().innerHTML, event))
    .on("mouseleave blur", function () {
      d3.select(this).attr("r", 4.5);
      hideTip();
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
    plotArea
      .select(".ref-line")
      .attr("x1", zx(0))
      .attr("y1", zy(0))
      .attr("x2", zx(maxVal * 1.05))
      .attr("y2", zy(maxVal * 1.05));
  };

  svg.call(
    d3.zoom()
      .scaleExtent([1, 12])
      .translateExtent([[0, 0], [innerW, innerH]])
      .extent([[0, 0], [innerW, innerH]])
      .on("zoom", (event) => {
        g.attr("transform", null);
        zoomed(event);
      })
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
 * @param {{ label: string, labelIds?: string[], onSelect?: Function }} opts
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

  function selectPoint(event, d, dotSelection) {
    dotSelection.attr("stroke", null).attr("stroke-width", null);
    d3.select(event.currentTarget).attr("stroke", "var(--accent-3)").attr("stroke-width", 2.5);
    if (opts.onSelect) opts.onSelect(d);
  }

  const dots = g
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

  dots
    .on("mouseenter focus", function (event, d) {
      d3.select(this).raise();
      showTip(`<strong>${d.name}</strong><br>degree ${d.degree}<br>z = ${d.z.toFixed(2)}`, event);
    })
    .on("mousemove", (event) => showTip(tooltip().innerHTML, event))
    .on("mouseleave blur", () => hideTip())
    .on("click", function (event, d) {
      selectPoint(event, d, dots);
    })
    .on("keydown", function (event, d) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectPoint(event, d, dots);
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
    .on("mouseenter focus", function (event, s) {
      showTip(`<strong>${s.label}</strong>`, event);
    })
    .on("mousemove", (event) => showTip(tooltip().innerHTML, event))
    .on("mouseleave blur", () => hideTip());

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

export function renderDensityGrid(container, density, totalCells = 100) {
  clear(container);
  const filled = Math.max(1, Math.round(density * totalCells));
  const wrap = d3.select(container).attr("role", "img").attr("aria-label", `Density grid: ${filled} of ${totalCells} cells filled, representing a density of ${(density * 100).toFixed(1)}%`);
  for (let i = 0; i < totalCells; i++) {
    wrap.append("div").attr("class", `density-cell${i < filled ? " filled" : ""}`);
  }
}
