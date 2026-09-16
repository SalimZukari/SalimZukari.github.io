# 🕸️ Social Graphs & Interactions — Group Site

Our group's weekly posts for the **Social Graphs and Interactions** course (DTU 02805),
built as a week hub: `index.html` is a landing page with a card for each week, and each
week's post lives at `weeks/weekN.html`. Most weeks work the shared Marvel Wikipedia
character network with that week's toolkit.

Course home: https://sunelehmann.com/socialgraphs2026-web/index.html

## Weeks

| Week | Course topic | Our post | Status |
|------|---------------|----------|--------|
| 1 | Networks | [Marvel Network Explorer](weeks/week1.html) — degree, density, components, articulation points | Live |
| 2 | Models & null models | [The Friendship Paradox](weeks/week2.html) — degree-preserving null model on Marvel | Live |
| 3 | Who matters, and why | [Who Holds the Marvel Universe Together?](weeks/week3.html) — brokers, robustness, six degrees of Spider-Man | Live |
| 4–8 | Communities & backbones, NLP I–III, Networks × language | — | Coming |

The Week 1 page includes a dedicated **🧠 Course Exercise** section mapping the Week 1
questions (degree, degree sums, average degree, density, degree distribution, in/out-degree,
most-connected characters, structural importance) onto the relevant parts of the page.

## Dataset

Weeks 1–3 use the **frozen Week 1 Marvel Wikipedia network dataset** (checked against the
course data page each week — no newer Marvel snapshot has been published as of Week 3):

- 303 Marvel character pages from Wikipedia's
  [Category:Marvel Comics superheroes](https://en.wikipedia.org/wiki/Category:Marvel_Comics_superheroes)
  (`data/raw/week1_nodes.tsv`)
- 1,784 directed edges, `A → B` meaning A's Wikipedia article links to B's
  (`data/raw/week1_edges.tsv`)

17 characters in the roster have no edges at all — every analysis script loads the **node
roster first** so these isolated characters are never accidentally dropped.

## Analysis pipelines

Each live week with a computed dashboard has its own analysis script, writing a single
JSON file that its page reads at runtime — nothing on those pages is hard-coded.

**Week 1 — `scripts/analyze.py` → `data/processed/analysis.json`.** Builds a directed
graph (in-/out-degree) and its undirected counterpart (degree, density, components,
articulation points) with NetworkX: node/edge counts, degree rankings and distributions,
connected components, articulation points, sanity checks (`Σin-degree = m`,
`Σdegree = 2m`, `density = m / max edges`, etc.), and auto-generated "Aha!" findings.

**Week 2** is a static write-up (`weeks/week2/week2_gonuts.md` + `week2_gonuts.ipynb`):
the friendship paradox on the Marvel giant component, checked against a 500-run
degree-preserving null model. Its figures and numbers are baked into `weeks/week2.html`
from that notebook's output, in the same style as a blog post.

**Week 3 — `scripts/week3_analyze.py` → `data/processed/week3.json`.** Centralities
(degree, closeness, harmonic, betweenness, PageRank) against a 200-run degree-preserving
shuffle null, targeted-removal robustness curves, degree assortativity, team homophily,
and the adjacency used by the in-browser six-degrees-of-Spider-Man widget. See
`weeks/week3/week3_gonuts.ipynb` for the exploration and validation cells.

## Running locally

Requirements: Python 3 with `pandas`, `networkx`, `numpy`, `scipy`, and `matplotlib`, and
any static file server.

```bash
# 1. Regenerate the analyses from the raw dataset
npm run analyze          # Week 1 -> data/processed/analysis.json
npm run analyze:week3    # Week 3 -> data/processed/week3.json + weeks/week3/figures/

# 2. Serve the site locally (any static server works)
npm start
# then open http://localhost:8080 (the hub) — or any other free port, e.g.
# npx http-server . -p 8099 -c-1 if 8080 is taken on your machine
```

If you don't have Node/npm, any static server works, e.g. `python -m http.server 8080`.
Opening `index.html` directly via `file://` will **not** work — the browser blocks the
`fetch()` of the analysis JSON files under the `file://` protocol.

## Project structure

```
index.html                    # hub page: week-card grid (src/js/hub.js + weeks.js)
weeks/
  week1.html                  # Week 1 — Marvel Network Explorer
  week2.html                  # Week 2 — The Friendship Paradox
  week3.html                  # Week 3 — Who Holds the Marvel Universe Together?
  week2/                      # week2_gonuts.ipynb, week2_gonuts.md, figures/*.png
  week3/                      # week3_gonuts.ipynb, week3_gonuts.md, figures/*.png
week2.html                    # redirect stub -> weeks/week2.html (old links)
src/css/styles.css            # shared dark/comic visual design system
src/js/
  weeks.js                    # the week manifest — the only place a week is registered
  hub.js                      # renders the hub's card grid from weeks.js
  weeknav.js                  # shared chrome on every week page (hub link, switcher, prev/next)
  data.js, main.js, charts.js, network.js, hero.js, experiments.js   # Week 1 dashboard
data/raw/                     # frozen Week 1 node roster + edge list (input to every pipeline)
data/processed/               # analysis.json (Week 1), week3.json (Week 3)
scripts/analyze.py            # Week 1 pipeline ("npm run analyze")
scripts/week3_analyze.py      # Week 3 pipeline ("npm run analyze:week3")
```

### Adding a new week

1. Add one entry to the `WEEKS` array in `src/js/weeks.js` (`status: "live"`, `title`,
   `teaser`, `href: "weeks/weekN.html"`). The hub grid and every week page's switcher
   re-render from this manifest automatically — nothing else references the week list.
2. Add `weeks/weekN.html`, following an existing week page: link `../src/css/styles.css`
   and any scripts with `../src/js/...`, and call `initWeekNav(N)` from
   `../src/js/weeknav.js` at the bottom of the page for the shared chrome.
3. If the week needs its own computed data, add `scripts/weekN_analyze.py` writing
   `data/processed/weekN.json`, and an `analyze:weekN` script in `package.json`.

## GitHub Pages

This is a plain static site (HTML/CSS/JS + D3 via CDN) with no build step and only
relative paths, so it deploys as-is:

1. Push this repository to GitHub.
2. In **Settings → Pages**, set the source to the `main` branch, root folder (`/`).
3. Share the published `https://<user>.github.io/<repo>/` URL.

## Reproducibility

If a dataset changes, drop the new raw file(s) into `data/raw/`, re-run the matching
`npm run analyze...` script, and commit the regenerated JSON — each week's page picks up
the new numbers automatically since nothing is hard-coded into its HTML/JS.

## Attribution

No official Marvel artwork, logos, or trademarks are used. All visual design (colors,
type, layout, iconography) is original, only inspired by comic-book and network-diagram
aesthetics. Character data and descriptions come from Wikipedia via the course dataset.
