# 🕸️ Social Graphs & Interactions — Group Site

s264009, s263994, s264007

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
| 4 | Communities & backbones | [Solid Cores, Moving Borders](weeks/week4.html) — where are the borders of philosophy? Louvain stability, Infomap, overlap, disparity backbone on the philosophers network | Live |
| 5 | The language half · NLP I | [Fame Buys Length, Not New Words](weeks/week5.html) — does fame buy you words? Heaps' curves with the most-linked Marvel characters read first, against 500 random page orders | Live |
| 6–8 | NLP II–III, Networks × language | — | Coming |

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

Week 4 switches to the course's **philosophers network** (the course dataset's one exception), with Marvel as the contrast:

- `data/raw/week4_philosophers_nodes.tsv`: 1,444 philosophers born before 1900, from Wikipedia's seven
  "List of philosophers born in the …" lists (frozen snapshot 2026-09-15), with `era` and `subfields` columns
- `data/raw/week4_philosophers_edges.tsv`: 11,135 directed edges with a weight (how many times A's article links B's);
  summed over both directions: 9,140 undirected links, giant component 1,374 / 9,139
- `data/raw/week4_edges_weighted.tsv`: the 1,784 Marvel edges with the same kind of weight (snapshot 2026-09-06)
- `data/raw/week4_wikidata_movement_cache.json`: Wikidata P135 "movement" labels for the philosophers, fetched once
  (2026-09-23) and cached so the pipeline runs offline

All three TSVs were downloaded from the course data page on 2026-09-23 and are byte-identical to the class hand-outs.

Week 5 adds the text of the same 303 Marvel pages:

- `data/raw/marvel_pages.zip`: 303 plain-text Wikipedia articles, one per Week 1 node (the course's week 5 release, frozen
  snapshot 2026-08-26; 1.8 MB, 4.4 million characters). File names are URL-encoded node ids. Committed as downloaded, so the
  pipeline runs offline; it joins onto `week1_nodes.tsv` / `week1_edges.tsv` by node id.

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
and the adjacency used by the in-browser six-degrees-of-Spider-Man widget. Team labels come
from the Wikidata API (property P463, "member of"); the first run fetches and caches them to
`data/raw/week3_wikidata_team_cache.json`, so later runs are offline and reproducible. See
`weeks/week3/week3_gonuts.ipynb` for the exploration and validation cells.

**Week 4 — `scripts/week4_analyze.py` → `data/processed/week4.json` + `weeks/week4/figures/`.** Louvain with ten seeds
(NMI matrix, consensus partition, per-philosopher stability), modularity against configuration-model, double-edge-swap and
G(n, m) nulls for the philosophers and Marvel, Infomap (undirected and directed, with its own shuffle null), k-clique
communities (k = 3–6), our own link clustering (Ahn, Bagrow & Lehmann 2010), weighted Louvain against a
weight-permutation null, our own disparity filter (course table, thresholds, a 0.001-step α sweep, the break point and
its articulation point, the single-link "hinges"), a precomputed backbone layout, static figures and the LLM box. Shared
helpers live in `scripts/netlib.py` (generalised from `weeks/week3/network_utils.py`). Heavy steps are cached in
`data/processed/.week4_cache/` (git-ignored), keyed by a hash of the inputs; `python scripts/week4_analyze.py --no-cache`
recomputes everything (about 2–3 minutes) and prints a runtime summary and a sanity table against the course page.
`scripts/week4_validate_browser.mjs` (`npm run validate:week4`) checks the page's in-browser computations
(`src/js/week4_core.js`) against the JSON. `weeks/week4/week4_gonuts.ipynb` holds the exploration and validation cells.

**Week 5 — `scripts/week5_analyze.py` → `data/processed/week5.json`, `data/processed/week5_search.json` + `weeks/week5/figures/`.**
Page length against in-/out-/total degree (Spearman, outliers by rank gap), type counts at equal token budgets (exact rarefaction and
contiguous windows), and Heaps curves V(n) with the pages concatenated in eight orders (in-degree, out-degree, total degree, page
length; most or least first), with stopwords kept and removed, each against a band of 500 uniformly random page orders (seed 42) with
K and β fitted and empirical p-values for both. A second, length-matched shuffle tests what the zero-in-degree pages add at the end.
Every count states its tokenizer (spaCy's, or a `CountVectorizer` pattern), token counts are checked against raw-text regexes, and the
numbers worked out in the exercise notebook are recomputed and compared on every run. `week5_search.json` is the Bag-of-Words inverted
index behind the page's toy search box, loaded on first use. The loader, tokenization and raw-text checks are lifted from our exercise
notebook; degrees reuse `scripts/analyze.py`'s parsing. Tokenizing and the shuffles are cached in `data/processed/.week5_cache/`
(git-ignored); `python scripts/week5_analyze.py --no-cache` recomputes everything (about 2 minutes) and prints a runtime summary.
`scripts/week5_validate_browser.mjs` (`npm run validate:week5`) checks the page's in-browser fit and search ranking
(`src/js/week5_core.js`) against the JSON. `weeks/week5/week5_gonuts.ipynb` holds the exploration and validation cells.

## Running locally

Requirements: Python 3 with `pandas`, `networkx` (≥ 3.4, for `forceatlas2_layout`), `numpy`, `scipy`,
`matplotlib`, `scikit-learn` and `infomap` (Week 4), `spacy` with its `en_core_web_sm` model (Week 5:
`python -m spacy download en_core_web_sm`), Node (for `validate:week4` / `validate:week5`), and any static file server.

```bash
# 1. Regenerate the analyses from the raw dataset
npm run analyze          # Week 1 -> data/processed/analysis.json
npm run analyze:week3    # Week 3 -> data/processed/week3.json + weeks/week3/figures/
npm run analyze:week4    # Week 4 -> data/processed/week4.json + weeks/week4/figures/
npm run validate:week4   # Week 4 in-browser computations vs the Python output
npm run analyze:week5    # Week 5 -> data/processed/week5.json, week5_search.json + weeks/week5/figures/
npm run validate:week5   # Week 5 in-browser fit and search ranking vs the Python output

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
  week4.html                  # Week 4 — Solid Cores, Moving Borders (philosophers)
  week5.html                  # Week 5 — Fame Buys Length, Not New Words (Marvel pages as text)
  week2/                      # week2_gonuts.ipynb, week2_gonuts.md, figures/*.png
  week3/                      # week3_gonuts.ipynb, week3_gonuts.md, figures/*.png
  week4/                      # week4_gonuts.ipynb, week4_gonuts.md, figures/*.png
  week5/                      # week5_gonuts.ipynb, week5_gonuts.md, figures/*.png
week2.html                    # redirect stub -> weeks/week2.html (old links)
src/css/styles.css            # shared dark/comic visual design system
src/js/
  weeks.js                    # the week manifest — the only place a week is registered
  hub.js                      # renders the hub's card grid from weeks.js
  weeknav.js                  # shared chrome on every week page (hub link, switcher, prev/next)
  data.js, main.js, charts.js, network.js, hero.js, experiments.js   # Week 1 dashboard
  week3.js                    # Week 3 page
  week4.js, week4_core.js     # Week 4 page; week4_core.js = pure computations shared with the Node validator
  week5.js, week5_core.js     # Week 5 page; week5_core.js = power-law fit + Bag-of-Words ranking, shared with the Node validator
data/raw/                     # frozen course snapshots (Marvel weeks 1 + 4 + 5, philosophers week 4) + Wikidata caches
data/processed/               # analysis.json (Week 1), week3.json (Week 3), week4.json (Week 4), week5.json + week5_search.json (Week 5)
scripts/analyze.py            # Week 1 pipeline ("npm run analyze")
scripts/week3_analyze.py      # Week 3 pipeline ("npm run analyze:week3")
scripts/week4_analyze.py      # Week 4 pipeline ("npm run analyze:week4")
scripts/netlib.py             # shared loaders, nulls, NMI, modularity, partition helpers
scripts/week5_analyze.py      # Week 5 pipeline ("npm run analyze:week5")
scripts/week4_validate_browser.mjs   # "npm run validate:week4"
scripts/week5_validate_browser.mjs   # "npm run validate:week5"
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
