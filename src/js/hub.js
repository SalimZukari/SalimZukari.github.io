// Renders the "The weeks" card grid on index.html from the weeks.js
// manifest. Adding a new week is a manifest edit only — nothing here
// changes.
import { WEEKS } from "./weeks.js";

export function renderWeekGrid(container) {
  const ordered = [...WEEKS].sort((a, b) => a.n - b.n);
  container.innerHTML = ordered.map(cardHtml).join("");
}

function cardHtml(w) {
  const isLive = w.status === "live";
  const tag = isLive ? "a" : "div";
  const attrs = isLive
    ? `href="${w.href}"`
    : `aria-disabled="true" tabindex="-1"`;
  const statusHtml = isLive
    ? `<span class="week-status"><span class="dot">●</span> live</span>`
    : `<span class="week-status">coming</span>`;

  return `
    <${tag} class="week-card ${isLive ? "is-live" : "is-coming"}" ${attrs}>
      <span class="week-eyebrow">WEEK ${w.n}</span>
      <p class="week-course-title">${w.courseTitle}</p>
      ${isLive ? `<h3 class="week-title">${w.title}</h3><p class="week-teaser">${w.teaser}</p>` : `<h3 class="week-title">${w.courseTitle}</h3>`}
      ${statusHtml}
    </${tag}>
  `;
}
