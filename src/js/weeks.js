// Single manifest of weeks — the only place a week is registered.
// Adding a new week later means adding one entry here and one HTML file
// in weeks/; the hub grid and the shared week-page chrome both render from
// this list, nothing else needs to change.
//
// href/course are root-relative (as used by index.html); weeknav.js
// converts href to a same-directory link when rendering chrome inside
// weeks/*.html.

export const WEEKS = [
  {
    n: 1,
    courseTitle: "Networks",
    title: "Marvel Network Explorer",
    teaser: "303 characters, one force-directed graph — degree, density, islands, and articulation points, all computed live from the raw dataset.",
    status: "live",
    href: "weeks/week1.html",
    course: "https://sunelehmann.com/socialgraphs2026-web/weeks/week1.html",
  },
  {
    n: 2,
    courseTitle: "Models & null models",
    title: "The Friendship Paradox",
    teaser: "Your Marvel friends really are more popular than you — and a 500-shuffle null model shows it's basically all Spider-Man's fault.",
    status: "live",
    href: "weeks/week2.html",
    course: "https://sunelehmann.com/socialgraphs2026-web/weeks/week2.html",
  },
  {
    n: 3,
    courseTitle: "Who matters, and why",
    title: "Who Holds the Marvel Universe Together?",
    teaser: "Real brokers vs. raw popularity against a degree-preserving null, a network-breaking experiment, and six degrees to Spider-Man.",
    status: "live",
    href: "weeks/week3.html",
    course: "https://sunelehmann.com/socialgraphs2026-web/weeks/week3.html",
  },
  {
    n: 4,
    courseTitle: "Communities & backbones",
    status: "coming",
  },
  {
    n: 5,
    courseTitle: "The language half · NLP I",
    status: "coming",
  },
  {
    n: 6,
    courseTitle: "NLP II",
    status: "coming",
  },
  {
    n: 7,
    courseTitle: "NLP III",
    status: "coming",
  },
  {
    n: 8,
    courseTitle: "Networks × language",
    status: "coming",
  },
];

export function liveWeeks() {
  return WEEKS.filter((w) => w.status === "live").sort((a, b) => a.n - b.n);
}

export function weekByN(n) {
  return WEEKS.find((w) => w.n === n) || null;
}
