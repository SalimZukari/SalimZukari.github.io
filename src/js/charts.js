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

export function renderDensityGrid(container, density, totalCells = 100) {
  clear(container);
  const filled = Math.max(1, Math.round(density * totalCells));
  const wrap = d3.select(container).attr("role", "img").attr("aria-label", `Density grid: ${filled} of ${totalCells} cells filled, representing a density of ${(density * 100).toFixed(1)}%`);
  for (let i = 0; i < totalCells; i++) {
    wrap.append("div").attr("class", `density-cell${i < filled ? " filled" : ""}`);
  }
}
