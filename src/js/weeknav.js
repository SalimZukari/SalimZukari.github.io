// Shared chrome for week pages: brand link back to the hub, an "All weeks"
// link, a compact week switcher, and previous/next links. This is the only
// place that renders that chrome — every week page just calls
// initWeekNav(n) and gets it for free.
import { liveWeeks } from "./weeks.js";

// Manifest hrefs are root-relative ("weeks/week2.html"); every week page
// lives flat inside weeks/, so a same-directory link just drops the prefix.
function hrefFromRoot(href) {
  return href.startsWith("weeks/") ? href.slice("weeks/".length) : href;
}

export function initWeekNav(currentN) {
  renderTopBar(currentN);
  renderPrevNext(currentN);
}

function renderTopBar(currentN) {
  const nav = document.querySelector(".site-nav .container");
  if (!nav) return;

  const bar = document.createElement("div");
  bar.className = "weeknav-bar";

  const weeks = liveWeeks();
  const options = weeks
    .map(
      (w) =>
        `<option value="${hrefFromRoot(w.href)}" ${w.n === currentN ? "selected" : ""}>Week ${w.n}: ${w.title}</option>`
    )
    .join("");

  bar.innerHTML = `
    <a class="weeknav-link" href="../index.html">🏠 Hub</a>
    <a class="weeknav-link" href="../index.html#weeks">All weeks</a>
    <label class="weeknav-switch">
      <span class="visually-hidden">Jump to another week</span>
      <select id="weeknav-select" aria-label="Jump to another week">${options}</select>
    </label>
  `;

  // Insert right after the brand link, before the section nav-links.
  const brand = nav.querySelector(".brand");
  if (brand && brand.nextSibling) {
    nav.insertBefore(bar, brand.nextSibling);
  } else {
    nav.appendChild(bar);
  }

  bar.querySelector("#weeknav-select").addEventListener("change", (e) => {
    if (e.target.value) window.location.href = e.target.value;
  });
}

function renderPrevNext(currentN) {
  const weeks = liveWeeks();
  const idx = weeks.findIndex((w) => w.n === currentN);
  if (idx === -1) return;
  const prev = idx > 0 ? weeks[idx - 1] : null;
  const next = idx < weeks.length - 1 ? weeks[idx + 1] : null;
  if (!prev && !next) return;

  const wrap = document.createElement("nav");
  wrap.className = "weeknav-prevnext container";
  wrap.setAttribute("aria-label", "Week navigation");
  wrap.innerHTML = `
    ${prev ? `<a class="weeknav-prev" href="${hrefFromRoot(prev.href)}">← Week ${prev.n}: ${prev.title}</a>` : "<span></span>"}
    ${next ? `<a class="weeknav-next" href="${hrefFromRoot(next.href)}">Week ${next.n}: ${next.title} →</a>` : "<span></span>"}
  `;

  const main = document.getElementById("main");
  const footer = document.querySelector("footer");
  if (footer) {
    footer.parentNode.insertBefore(wrap, footer);
  } else if (main) {
    main.appendChild(wrap);
  }
}
