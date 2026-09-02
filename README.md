# 🕸️ Marvel Network: Behind the Connections

An interactive data-story website that turns Wikipedia's Marvel character pages into a
social network, and lets you explore it: degree distributions, in-degree vs. out-degree,
connected components ("islands"), articulation points, shortest paths, and more.

Built as a group exercise for a **Social Graphs / Network Science** course.

## Course

**Social Graphs and Interactions** — Week 1 group exercise.

Exercise page: https://sunelehmann.com/socialgraphs2026-web/weeks/week1.html

The site includes a dedicated **🧠 Course Exercise** section mapping the Week 1 questions
(degree, degree sums, average degree, density, degree distribution, in/out-degree,
most-connected characters, structural importance) onto the relevant parts of the page.

## Dataset

This project uses the **frozen Week 1 Marvel Wikipedia network dataset**:

- 303 Marvel character pages from Wikipedia's
  [Category:Marvel Comics superheroes](https://en.wikipedia.org/wiki/Category:Marvel_Comics_superheroes)
  (`data/raw/week1_nodes.tsv`)
- 1,784 directed edges, `A → B` meaning A's Wikipedia article links to B's
  (`data/raw/week1_edges.tsv`)

17 characters in the roster have no edges at all — the analysis script loads the **node
roster first** so these isolated characters are never accidentally dropped, only inferred
edge-derived nodes would be missing otherwise.

Nothing on the site is hard-coded: every statistic, ranking, chart, and generated
"finding" is computed from these two raw files by `scripts/analyze.py`.

## Analysis

`scripts/analyze.py` builds a directed graph (for in-/out-degree) and its undirected
counterpart (for degree, density, components, articulation points, shortest paths) with
NetworkX, and computes:

- Node/edge counts, average in-/out-/total degree, density
- Per-character in-degree, out-degree, total degree, undirected degree, component
  membership, isolate/largest-component flags, articulation-point flag, neighbor list
- Rankings by in-degree, out-degree, and undirected degree (top 10 each)
- Full degree distributions (linear + log-log ready)
- Connected components and their sizes
- Articulation points (undirected graph)
- Mathematical sanity checks: `Σin-degree = m`, `Σout-degree = m`, `Σdegree = 2m`,
  `avg degree = 2m/n`, `max edges = n(n−1)/2`, `density = m / max edges`
- Automatically generated "Aha!" findings and a first-person data story, built from the
  actual computed numbers (not pre-written)

The result is written to `data/processed/analysis.json`, which is the **only** data
source the frontend reads at runtime.

## Running locally

Requirements: Python 3 with `pandas` and `networkx`, and any static file server.

```bash
# 1. Regenerate the analysis from the raw dataset
npm run analyze
# equivalent to: python scripts/analyze.py

# 2. Serve the site locally (any static server works)
npm start
# then open http://localhost:8080
```

If you don't have Node/npm, any static server works, e.g. `python -m http.server 8080`.
Opening `index.html` directly via `file://` will **not** work — the browser blocks the
`fetch()` of `data/processed/analysis.json` under the `file://` protocol.

## Project structure

```
index.html                   # single-page data story
src/css/styles.css           # original dark/comic visual design
src/js/                      # data loading, charts (D3), force graph, experiments
data/raw/                    # frozen Week 1 node roster + edge list (input)
data/processed/analysis.json # generated analysis output (frontend's single data source)
scripts/analyze.py           # the analysis pipeline (Section 24: "npm run analyze")
```

## GitHub Pages

This is a plain static site (HTML/CSS/JS + D3 via CDN) with no build step and only
relative paths, so it deploys as-is:

1. Push this repository to GitHub.
2. In **Settings → Pages**, set the source to the `main` branch, root folder (`/`).
3. Share the published `https://<user>.github.io/<repo>/` URL.

## Reproducibility

If the dataset changes, drop the new `week1_nodes.tsv` / `week1_edges.tsv` into
`data/raw/`, re-run `npm run analyze`, and commit the regenerated
`data/processed/analysis.json` — the site picks up the new numbers automatically since
nothing is hard-coded into the HTML/JS.

## Attribution

No official Marvel artwork, logos, or trademarks are used. All visual design (colors,
type, layout, iconography) is original, only inspired by comic-book and network-diagram
aesthetics. Character data and descriptions come from Wikipedia via the course dataset.
