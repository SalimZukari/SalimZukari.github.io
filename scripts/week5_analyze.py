"""
Marvel Wikipedia pages — Week 5 analysis pipeline ("Does fame buy you words?").

Reads the frozen course files, committed to data/raw/:

  marvel_pages.zip                 303 plain-text Wikipedia articles (week 5 release)
  week1_nodes.tsv, week1_edges.tsv the same 303 characters as a directed link network

and computes every number used by weeks/week5.html and weeks/week5/week5_gonuts.md:

  1. corpus counts under two stated tokenizers (spaCy; CountVectorizer), checked
     against the numbers worked out in week5/exercise_5_3.ipynb
  2. the hook: page length against in-/out-/total degree (Spearman), and the
     pages furthest from that relationship in both directions
  3. the reframe: does the fame-vocabulary correlation survive an equal token
     budget (exact rarefaction, and contiguous windows)?
  4. the hero figure: Heaps curves V(n) with pages added most-linked first,
     against a band of uniformly shuffled page orders, with K and beta fitted
     for every curve and an empirical p-value for each against the shuffles
  5. robustness: out-degree, total degree and page-length orderings, both
     directions, with stopwords kept and removed
  6. the honesty check: tokenizer counts against raw-text regex counts
  7. a Bag-of-Words inverted index for the page's toy search box
     (-> data/processed/week5_search.json), static figures, and the LLM box

The loader, the spaCy tokenization loop, the CountVectorizer setup and the
raw-text checks are lifted from week5/exercise_5_3.ipynb (cells 6, 56, 97,
116-125, 131-135). Nothing here hard-codes a result. The slow steps
(tokenizing, the shuffles) are cached under data/processed/.week5_cache/,
keyed by a hash of the inputs; pass --no-cache to recompute from scratch.

Usage:
    python scripts/week5_analyze.py [--no-cache]
    (or: npm run analyze:week5)
"""

import hashlib
import json
import pickle
import re
import sys
import time
import urllib.parse
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from scipy.special import gammaln
from scipy.stats import rankdata, spearmanr
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analyze as week1  # noqa: E402  (reuses its week1_*.tsv parsing)

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
CACHE_DIR = PROCESSED_DIR / ".week5_cache"
OUTPUT_PATH = PROCESSED_DIR / "week5.json"
SEARCH_PATH = PROCESSED_DIR / "week5_search.json"
FIG_DIR = ROOT / "weeks" / "week5" / "figures"
PAGES_ZIP = RAW_DIR / "marvel_pages.zip"

COURSE_WEEK_URL = "https://sunelehmann.com/socialgraphs2026-web/weeks/week5.html"
DATA_PAGE_URL = "https://sunelehmann.com/socialgraphs2026-web/data/"

RNG_SEED = 42
N_SHUFFLES = 500          # random page orders in the null band (the brief asks for 20+)
GRID_POINTS = 120         # log-spaced values of n at which every curve is read
GRID_MIN = 1000           # first grid point = start of the fit range
BUDGETS = [500, 1000]     # equal token budgets for the vocabulary comparison
N_WINDOWS = 20            # contiguous windows averaged per page
N_TIEBREAKS = 50          # random tie-breaks of the in-degree order
N_OUTLIERS = 5
FAMOUS_PERCENTILE = 75    # "famous" for the outlier list = top quarter by in-degree
HONESTY_UNIGRAM = "power"
HONESTY_COLUMN = ("symbiote", "Eddie_Brock")
SEARCH_EXAMPLES = ["Norse god of thunder", "king of Wakanda", "alien symbiote costume", "blind lawyer"]
CACHE_VERSION = "w5-v1"

# exercise_5_3.ipynb, cell 116: lowercase words, hyphens kept inside a word
TOKEN_PATTERN = r"(?u)\b[a-z]+(?:-[a-z]+)*\b"

SPACY_LABEL = "spaCy en_core_web_sm tokenizer, lowercased, punctuation and whitespace tokens dropped"
CV_LABEL = "scikit-learn CountVectorizer, lowercased, pattern [a-z]+(-[a-z]+)* (hyphens kept, digits and non-ASCII letters dropped)"

# Numbers worked out cell by cell in week5/exercise_5_3.ipynb. They are only
# ever compared with what this script computes (the sanity table); nothing on
# the page reads them as results.
NOTEBOOK = {
    "tokens": 744495, "types": 26987, "hapax": 9723,
    "descTokens": 5379, "descTypes": 921, "descHapax": 696,
    "cvShape": [303, 27583], "cvNonzero": 230310,
    "cvLongest": [["Scarlet_Witch", 14203], ["Betsy_Braddock", 12993], ["She-Hulk", 12178],
                  ["Jean_Grey", 11478], ["Venom_(character)", 10424]],
    "cvShortest": ["Helix_(Marvel_Comics)", 193],
    "cvStopTerms": 27284,
    "powerTokens": 820, "powerRegex": 821,
    "ofTheTokens": 5932, "ofTheRegex": 5910,
    "symbioteTotal": 472, "symbiotePages": 31, "symbioteMatrix": 152, "symbioteRegex": 155,
    "topBigram": ["of the", 5932], "topTrigram": ["the x men", 611],
}

USE_CACHE = "--no-cache" not in sys.argv
TIMINGS = {}
INPUT_HASH = None


def log(msg=""):
    print(msg, flush=True)


def r4(x):
    return None if x is None else round(float(x), 4)


def r6(x):
    return None if x is None else round(float(x), 6)


class timed:
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        self.t = time.time()
        log(f"[{self.name}] ...")

    def __exit__(self, *a):
        TIMINGS[self.name] = round(time.time() - self.t, 1)
        log(f"[{self.name}] done in {TIMINGS[self.name]}s")


def input_hash(spacy_version):
    h = hashlib.sha1(f"{CACHE_VERSION}|{spacy_version}|{N_SHUFFLES}|{RNG_SEED}|{GRID_POINTS}|{GRID_MIN}".encode())
    for p in (PAGES_ZIP, week1.NODES_PATH, week1.EDGES_PATH):
        h.update(p.read_bytes().replace(b"\r\n", b"\n"))
    return h.hexdigest()[:12]


def cached(name, fn):
    """Load a pickled intermediate result if the inputs haven't changed."""
    path = CACHE_DIR / f"{name}-{INPUT_HASH}.pkl"
    if USE_CACHE and path.exists():
        log(f"    (cache hit: {name})")
        with open(path, "rb") as f:
            return pickle.load(f)
    result = fn()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        pickle.dump(result, f)
    return result


# ----------------------------------------------------------------------
# 1. Load and tokenize (exercise_5_3.ipynb, cells 6 and 56)
# ----------------------------------------------------------------------
def load_pages(path=PAGES_ZIP):
    """node_id -> article text. File names are URL-encoded node ids."""
    if not path.exists():
        week1.fail([f"Missing {path}.", "Download marvel_pages.zip from the course data page",
                    f"({DATA_PAGE_URL}) into data/raw/ and re-run."])
    pages, readme = {}, ""
    with zipfile.ZipFile(path) as z:
        for file_name in z.namelist():
            if "README" in file_name:
                readme = z.read(file_name).decode("utf-8")
                continue
            if not file_name.endswith(".txt"):
                continue
            node_id = urllib.parse.unquote(file_name.split("/")[-1][:-4])
            pages[node_id] = z.read(file_name).decode("utf-8")
    return pages, readme


def load_nlp():
    import spacy

    try:
        return spacy.load("en_core_web_sm"), spacy.__version__
    except OSError:
        week1.fail(["spaCy's small English model is missing. Install it with:",
                    "    python -m spacy download en_core_web_sm"])


def tokenize_pages(nlp, pages, ids):
    """The preprocessing choice of exercise 5.4: spaCy tokenizer, lowercase,
    drop whitespace and punctuation tokens, keep stopwords (flagged, so the
    stopwords-removed variant is a filter on the same stream)."""
    out = {}
    for node_id in ids:
        words, stop = [], []
        for token in nlp.tokenizer(pages[node_id]):
            if token.is_space or token.is_punct:
                continue
            words.append(token.lower_)
            stop.append(token.is_stop)
        out[node_id] = (words, stop)
    return out


def degrees(nodes, edges):
    """In-, out- and total degree on the directed Week 1 network. Total =
    in + out, so a reciprocated pair counts twice (it is two links)."""
    ids = sorted(nodes["node_id"])
    indeg = edges["target"].value_counts().reindex(ids, fill_value=0)
    outdeg = edges["source"].value_counts().reindex(ids, fill_value=0)
    return ids, indeg.to_numpy(), outdeg.to_numpy()


# ----------------------------------------------------------------------
# 2. Heaps machinery
# ----------------------------------------------------------------------
class Stream:
    """One preprocessing choice of the corpus, stored so that the Heaps curve
    of ANY page order costs one pass over ~230,000 (page, type) pairs instead
    of one over every token: a type's first position in an order is the
    start of the earliest page that contains it plus its first index there."""

    def __init__(self, page_tokens):
        counts = Counter()
        for words in page_tokens:
            counts.update(words)
        self.vocab = list(counts)
        self.counts = counts
        index = {w: k for k, w in enumerate(self.vocab)}
        self.lengths = np.array([len(w) for w in page_tokens], dtype=np.int64)
        self.N = int(self.lengths.sum())
        self.V = len(self.vocab)
        ptype, pfirst, ppage, pcount = [], [], [], []
        for p, words in enumerate(page_tokens):
            first, c = {}, Counter(words)
            for i, w in enumerate(words):
                if w not in first:
                    first[w] = i
            for w, i in first.items():
                ptype.append(index[w])
                pfirst.append(i)
                ppage.append(p)
                pcount.append(c[w])
        self.ptype = np.array(ptype, dtype=np.int64)
        self.pfirst = np.array(pfirst, dtype=np.int64)
        self.ppage = np.array(ppage, dtype=np.int64)
        self.pcount = np.array(pcount, dtype=np.int64)
        self.grid = np.unique(np.round(np.geomspace(GRID_MIN, self.N, GRID_POINTS)).astype(np.int64))

    def first_positions(self, order):
        """Position (0-based) of the first occurrence of every type when the
        pages are concatenated in `order`; also which pair supplied it."""
        order = np.asarray(order)
        start = np.zeros(len(order), dtype=np.int64)
        start[order] = np.concatenate([[0], np.cumsum(self.lengths[order])[:-1]])
        pos = start[self.ppage] + self.pfirst
        by_pos = np.argsort(pos, kind="stable")
        _, first_entry = np.unique(self.ptype[by_pos], return_index=True)
        entry = by_pos[first_entry]          # one (page, type) pair per type
        return pos[entry], entry

    def curve(self, order, at=None):
        """V(n): distinct types among the first n tokens, at every n in `at`."""
        first, _ = self.first_positions(order)
        first.sort()
        return np.searchsorted(first, (self.grid if at is None else np.asarray(at)) - 1, side="right")

    def new_types(self, order):
        """How many types each page is the first to use, in `order`."""
        _, entry = self.first_positions(order)
        return np.bincount(self.ppage[entry], minlength=len(self.lengths)), entry


def fit_power_law(n, V):
    """Heaps' law V = K * n^beta as a straight line in log-log space (least
    squares on the log-spaced grid, so every decade of n weighs the same)."""
    x, y = np.log(n), np.log(V)
    beta, a = np.polyfit(x, y, 1)
    resid = y - (a + beta * x)
    r2 = 1 - resid.var() / y.var()
    return float(np.exp(a)), float(beta), float(r2)


def area_stat(V, mean):
    """Average log-ratio to the shuffle mean over the grid (the last point
    is left out: every order ends on the same V(N)). -0.03 reads as 'about
    3% fewer types than a random order, averaged over the curve'."""
    return float(np.mean(np.log(V[:-1] / mean[:-1])))


def two_sided_p(value, null_values, centre=None):
    null_values = np.asarray(null_values)
    centre = null_values.mean() if centre is None else centre
    extreme = np.sum(np.abs(null_values - centre) >= abs(value - centre))
    return float((extreme + 1) / (len(null_values) + 1))


def run_shuffles(stream, extra_at):
    rng = np.random.default_rng(RNG_SEED)
    n_pages = len(stream.lengths)
    at = np.concatenate([stream.grid, np.asarray(extra_at, dtype=np.int64)])
    curves = np.empty((N_SHUFFLES, len(at)), dtype=np.int64)
    for k in range(N_SHUFFLES):
        curves[k] = stream.curve(rng.permutation(n_pages), at)
    return curves


def runs_of(mask, grid):
    """Contiguous runs of True in `mask`, as [first n, last n] pairs."""
    out, start = [], None
    for k, m in enumerate(mask):
        if m and start is None:
            start = k
        if start is not None and (not m or k == len(mask) - 1):
            end = k if m else k - 1
            out.append([int(grid[start]), int(grid[end])])
            start = None
    return out


def length_matched_tail(stream, indeg, n_perm, n_strata=10):
    """A second, stricter null for the tail of the fame-first curve. Shuffle
    the in-degrees among pages of similar length (length deciles), so the
    pages read last are as many and as short as the real zero-in-degree
    pages, but are otherwise arbitrary. Returns the new types those last
    pages add, and how many tokens they hold."""
    rng = np.random.default_rng(RNG_SEED + 2)
    n = len(indeg)
    strata = np.argsort(np.argsort(stream.lengths, kind="stable"), kind="stable") * n_strata // n
    new, tokens = [], []
    for _ in range(n_perm):
        perm = indeg.copy()
        for s in range(n_strata):
            idx = np.where(strata == s)[0]
            perm[idx] = indeg[rng.permutation(idx)]
        jitter = rng.random(n)
        order = np.array(sorted(range(n), key=lambda i: (-perm[i], jitter[i])))
        t = int(stream.lengths[order[-int((perm == 0).sum()):]].sum())
        new.append(int(stream.V - stream.curve(order, [stream.N - t])[0]))
        tokens.append(t)
    return np.array(new), np.array(tokens)


def order_by(values, ids, descending=True):
    """Page indices sorted by `values` (ties broken alphabetically by node id,
    so the order is reproducible)."""
    sign = -1 if descending else 1
    return np.array(sorted(range(len(ids)), key=lambda i: (sign * values[i], ids[i])), dtype=np.int64)


# ----------------------------------------------------------------------
# 3. Equal token budgets
# ----------------------------------------------------------------------
def rarefied_types(words, budget):
    """Expected number of types in `budget` tokens drawn at random without
    replacement from a page (exact, hypergeometric): sum over types of
    1 - C(n - f, B) / C(n, B)."""
    n = len(words)
    if n < budget:
        return None
    f = np.array(list(Counter(words).values()), dtype=float)
    with np.errstate(invalid="ignore"):
        log_absent = (gammaln(n - f + 1) - gammaln(n - f - budget + 1)
                      - gammaln(n + 1) + gammaln(n - budget + 1))
    absent = np.where(n - f - budget < 0, 0.0, np.exp(log_absent))
    return float((1 - absent).sum())


def window_types(words, budget, rng):
    """Mean number of types in a contiguous run of `budget` tokens."""
    n = len(words)
    if n < budget:
        return None
    starts = rng.integers(0, n - budget + 1, N_WINDOWS)
    return float(np.mean([len(set(words[s:s + budget])) for s in starts]))


# ----------------------------------------------------------------------
# 4. Raw text against tokens (exercise_5_3.ipynb, cells 95-98 and 131-135)
# ----------------------------------------------------------------------
def snippet(text, start, end, width=70):
    left, right = max(0, start - width), min(len(text), end + width)
    return ("…" if left else "") + text[left:right].replace("\n", " ") + ("…" if right < len(text) else "")


def unigram_check(nlp, pages, ids, term):
    """Count `term` as a lowercased spaCy token and as a whole word in the
    raw text, page by page; explain every page where the two disagree."""
    pattern = re.compile(r"\b" + re.escape(term) + r"\b", flags=re.IGNORECASE)
    token_total = regex_total = 0
    mismatches = []
    for node_id in ids:
        text = pages[node_id]
        tokens = list(nlp.tokenizer(text))
        token_count = sum(1 for t in tokens if t.lower_ == term)
        regex_count = len(pattern.findall(text))
        token_total += token_count
        regex_total += regex_count
        if token_count != regex_count:
            culprits = [t for t in tokens if t.lower_ != term and pattern.search(t.text)]
            mismatches.append({
                "page": node_id, "tokenCount": token_count, "regexCount": regex_count,
                "culprits": [t.text for t in culprits],
                "sentences": [snippet(text, t.idx, t.idx + len(t.text)) for t in culprits],
            })
    return {"term": term, "tokenizer": SPACY_LABEL, "scope": f"all {len(ids)} pages",
            "tokenCount": token_total, "regexCount": regex_total,
            "regex": rf"\b{term}\b, case-insensitive", "mismatches": mismatches}


def column_check(pages, vectorizer, X, page_names, term, page):
    """One Bag-of-Words cell against the raw page."""
    text = pages[page]
    col = vectorizer.vocabulary_[term]
    column = np.asarray(X[:, col].todense()).ravel()
    matrix_count = int(column[page_names.index(page)])
    matches = list(re.finditer(r"\b" + re.escape(term) + r"\b", text, flags=re.IGNORECASE))
    words = re.findall(TOKEN_PATTERN, text.lower())
    forms = Counter(w for w in words if term in w)
    extra = {w: c for w, c in forms.items() if w != term and re.search(r"\b" + re.escape(term) + r"\b", w)}
    sentences = []
    for w in extra:
        m = re.search(re.escape(w), text, flags=re.IGNORECASE)
        sentences.append(snippet(text, m.start(), m.end()))
    top = sorted(zip(page_names, column.tolist()), key=lambda kv: -kv[1])[:3]
    return {"term": term, "page": page, "tokenizer": CV_LABEL,
            "matrixCount": matrix_count, "regexCount": len(matches),
            "corpusTotal": int(column.sum()), "pagesWithTerm": int((column > 0).sum()),
            "topPages": [[p, int(c)] for p, c in top],
            "otherForms": dict(forms), "culprits": extra, "sentences": sentences}


def hapax_check(stream, pages, ids, page_tokens):
    """Every type that occurs once on the Heaps curve, looked up as a whole
    'word' in the raw text of the whole corpus (not preceded or followed by
    a letter or digit). One match = the tokenizer and the text agree. More
    than one = the tokenizer kept other occurrences inside longer tokens.
    Also counts the types that are tokenizer glue: a quote, bracket or em
    dash stuck to a word."""
    hapax = [w for w in stream.vocab if stream.counts[w] == 1]
    where = {}
    for node_id, (words, _) in zip(ids, page_tokens):
        for w in words:
            if stream.counts[w] == 1:
                where[w] = node_id
    lowered = {i: pages[i].lower() for i in ids}
    corpus = "\n".join(lowered[i] for i in ids)
    runs = Counter(re.findall(r"[a-z0-9]+", corpus))   # exact for types made of a-z and 0-9 only
    plain = re.compile(r"[a-z0-9]+")
    agree, more, found = 0, 0, []
    for w in hapax:
        if plain.fullmatch(w):
            n = runs[w]
        elif corpus.count(w) == 1:
            n = 1
        else:
            n = len(re.findall(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])", corpus))
        if n == 1:
            agree += 1
        elif n > 1:
            more += 1
            found.append((w, n, where[w]))
    found.sort(key=lambda e: (-e[1], e[0]))
    trim = ".,;:!?\"'()[]“”"
    shown = []
    for w, n, page in found:
        if not (w.isalpha() and w.isascii() and len(w) >= 5):
            continue
        hidden = Counter()
        for m in re.finditer(r"[^\s]*(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])[^\s]*", corpus):
            if m.group(0).strip(trim) != w:
                hidden[m.group(0).strip(trim)] += 1
        if hidden:
            shown.append({"type": w, "regexCount": n, "firstPage": page,
                          "hiddenIn": [h for h, _ in hidden.most_common(3)]})
        if len(shown) == 6:
            break

    glue = re.compile(r"[\"“”—\[\]()]")
    glued = [w for w in stream.vocab if glue.search(w) and re.search(r"[a-z0-9]", w)]
    # the honesty term first, then word—word joins, then the rest
    glued.sort(key=lambda w: (HONESTY_UNIGRAM not in w, not re.search(r"[a-z]{3,}[\"”]?—[\"“]?[a-z]", w), w))
    glued_rows = []
    for w in glued[:8]:
        page = next(i for i in ids if w in lowered[i])
        at = lowered[page].find(w)
        glued_rows.append({"type": w, "page": page, "count": stream.counts[w],
                           "sentence": snippet(pages[page], at, at + len(w), 45)})
    return {
        "nHapax": len(hapax), "agree": agree, "regexFindsMore": more,
        "regexFindsNone": len(hapax) - agree - more,
        "examples": shown,
        "gluedTypes": len(glued),
        "gluedHapax": sum(1 for w in glued if stream.counts[w] == 1),
        "gluedExamples": glued_rows,
        "gluedRule": "a type containing a quote mark, a bracket or an em dash next to letters or digits",
        "regex": "the type, not preceded or followed by a letter or digit, case-insensitive, over all 303 pages",
    }


# ----------------------------------------------------------------------
# 5. Figures (static versions of the page's charts, for the write-up)
# ----------------------------------------------------------------------
DARK = {"figure.facecolor": "#0f1422", "axes.facecolor": "#131a2b", "axes.edgecolor": "#26304a",
        "axes.labelcolor": "#eef1fb", "text.color": "#eef1fb", "xtick.color": "#a7b0c8",
        "ytick.color": "#a7b0c8", "grid.color": "#26304a", "font.size": 10, "legend.frameon": False}
C_FAME, C_NULL, C_REV, C_LEN = "#ffd23f", "#37e6ff", "#ff3d68", "#8c6bff"


def figures(out):
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    P, H, hook = out["pages"], out["heaps"], out["hook"]
    name = dict(zip(P["id"], P["name"]))
    with plt.rc_context(DARK):
        # fig 1: length against in-degree
        fig, ax = plt.subplots(figsize=(8.4, 5.6))
        x, y = np.array(P["inDeg"]), np.array(P["tokens"])
        ax.scatter(x, y, s=16, color=C_LEN, alpha=0.7, linewidths=0)
        for group, color in (("longForFame", C_FAME), ("shortForFame", C_NULL)):
            for rank, row in enumerate(hook["outliers"][group]):
                i = P["id"].index(row["id"])
                ax.scatter([x[i]], [y[i]], s=34, color=color, zorder=3)
                if rank >= 3:      # the page labels all of them; here the lower ones would collide
                    continue
                ax.annotate(name[row["id"]].split(" (")[0], (x[i], y[i]), xytext=(5, 4), textcoords="offset points",
                            fontsize=8, color=color)
        ax.set_xscale("symlog", linthresh=1)
        ax.set_yscale("log")
        ax.set_xlim(-0.3, 140)
        ax.set_xticks([0, 1, 2, 5, 10, 20, 50, 100])
        ax.set_xticklabels(["0", "1", "2", "5", "10", "20", "50", "100"])
        ax.set_xlabel("in-degree (other character pages linking here)")
        ax.set_ylabel("page length (tokens)")
        ax.set_title(f"Fame buys length: Spearman ρ = {hook['spearman']['in']['rho']:.2f} over 303 pages", loc="left")
        ax.grid(alpha=0.5)
        fig.tight_layout()
        fig.savefig(FIG_DIR / "fig1_length_vs_indegree.png", dpi=150)
        plt.close(fig)

        # fig 2: the hero figure, stopwords kept
        S = H["kept"]
        n = np.array(S["grid"])
        mean = np.array(S["null"]["mean"])
        fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.4, 7.6), sharex=True, gridspec_kw={"height_ratios": [3, 2]})
        a1.fill_between(n, S["null"]["min"], S["null"]["max"], color=C_NULL, alpha=0.3, label=f"{N_SHUFFLES} random page orders (range)")
        a1.plot(n, mean, color=C_NULL, lw=1, label="random orders (mean)")
        fame = S["curves"]["in_desc"]
        a1.plot(n, fame["V"], color=C_FAME, lw=2, label="most-linked first (in-degree)")
        a1.plot(n, fame["K"] * n ** fame["beta"], color=C_FAME, lw=1, ls=":", label=f"fit K·n^β, K = {fame['K']:.1f}, β = {fame['beta']:.3f}")
        a1.set_xscale("log")
        a1.set_yscale("log")
        a1.set_ylabel("types seen so far, V(n)")
        a1.legend(loc="upper left", fontsize=8)
        a1.grid(alpha=0.5)
        a1.set_title("Heaps' curves: most-linked characters first vs random page order", loc="left")
        dev = lambda v: 100 * (np.array(v) / mean - 1)
        a2.fill_between(n, dev(S["null"]["min"]), dev(S["null"]["max"]), color=C_NULL, alpha=0.18, label="range of shuffles")
        a2.fill_between(n, dev(S["null"]["lo"]), dev(S["null"]["hi"]), color=C_NULL, alpha=0.3, label="middle 95% of shuffles")
        a2.axhline(0, color=C_NULL, lw=1)
        a2.plot(n, dev(fame["V"]), color=C_FAME, lw=2, label="most-linked first")
        a2.plot(n, dev(S["curves"]["in_asc"]["V"]), color=C_REV, lw=1.4, label="least-linked first")
        a2.plot(n, dev(S["curves"]["len_desc"]["V"]), color=C_LEN, lw=1.4, ls="--", label="longest pages first (control)")
        a2.set_ylabel("types vs random mean (%)")
        a2.set_xlabel("tokens read so far, n")
        a2.legend(loc="lower right", fontsize=8, ncol=2)
        a2.grid(alpha=0.5)
        fig.tight_layout()
        fig.savefig(FIG_DIR / "fig2_heaps_fame_vs_random.png", dpi=150)
        plt.close(fig)

        # fig 3: robustness, deviation panels
        fig, axes = plt.subplots(2, 4, figsize=(13, 5.8), sharey=True)
        for r, stop in enumerate(("kept", "removed")):
            S = H[stop]
            n, mean = np.array(S["grid"]), np.array(S["null"]["mean"])
            dev = lambda v: 100 * (np.array(v) / mean - 1)
            for c, (key, label) in enumerate((("in", "in-degree"), ("out", "out-degree"), ("tot", "total degree"), ("len", "page length (control)"))):
                ax = axes[r, c]
                ax.fill_between(n, dev(S["null"]["min"]), dev(S["null"]["max"]), color=C_NULL, alpha=0.18)
                ax.fill_between(n, dev(S["null"]["lo"]), dev(S["null"]["hi"]), color=C_NULL, alpha=0.3)
                ax.axhline(0, color=C_NULL, lw=1)
                d, a = S["curves"][f"{key}_desc"], S["curves"][f"{key}_asc"]
                ax.plot(n, dev(d["V"]), color=C_FAME, lw=1.8, label=f"most first: A = {100 * d['area']:+.1f}%, p = {d['pArea']:.3f}")
                ax.plot(n, dev(a["V"]), color=C_REV, lw=1.2, label=f"least first: A = {100 * a['area']:+.1f}%, p = {a['pArea']:.3f}")
                ax.set_xscale("log")
                ax.set_title(f"{label} · stopwords {stop}", fontsize=9, loc="left")
                ax.legend(fontsize=7, loc="lower right")
                ax.grid(alpha=0.5)
                if r == 1:
                    ax.set_xlabel("tokens read so far, n")
                if c == 0:
                    ax.set_ylabel("types vs random mean (%)")
        fig.tight_layout()
        fig.savefig(FIG_DIR / "fig3_robustness.png", dpi=150)
        plt.close(fig)


# ----------------------------------------------------------------------
# 6. The LLM box
# ----------------------------------------------------------------------
def llm_grading(out):
    P, H, B = out["pages"], out["heaps"]["kept"], out["budget"]
    name = dict(zip(P["id"], P["name"]))
    i_long, i_short = int(np.argmax(P["tokens"])), int(np.argmin(P["tokens"]))
    fame, null = H["curves"]["in_desc"], H["null"]
    b0 = B["budgets"][0]
    raw, rare, win = b0["rows"]
    paragraph = (
        f"Famous Marvel characters have markedly richer vocabularies than obscure ones. {name[P['id'][i_long]]}'s Wikipedia "
        f"page uses {P['types'][i_long]:,} distinct words while {name[P['id'][i_short]].split(' (')[0]}'s uses only "
        f"{P['types'][i_short]:,}, and across all 303 pages vocabulary size rises steadily with the number of incoming "
        f"links (ρ = {out['hook']['typesVsIn']['rho']:.2f}). Reading the pages from most to least linked, the vocabulary grows as "
        f"V = K·n^β with β = {fame['beta']:.2f}, which shows that the best-connected characters drive the growth of the Marvel "
        f"lexicon. Lexical richness is therefore a signature of a character's importance in the network."
    )
    ann = [
        {"claim": f"\"{name[P['id'][i_long]]}'s page uses {P['types'][i_long]:,} distinct words while "
                  f"{name[P['id'][i_short]].split(' (')[0]}'s uses only {P['types'][i_short]:,}\"",
         "verdict": "Raw type counts compared across pages of different lengths.",
         "why": f"The first page is {P['tokens'][i_long]:,} tokens long and the second {P['tokens'][i_short]:,}. Types grow with "
                f"tokens on any text, which is the whole content of Heaps' law, so the gap says the first page is longer. "
                f"It says nothing about how rich the writing is."},
        {"claim": f"\"vocabulary size rises steadily with the number of incoming links (ρ = {out['hook']['typesVsIn']['rho']:.2f})\"",
         "verdict": "True, and it's the length correlation again.",
         "why": f"Length against in-degree gives ρ = {out['hook']['spearman']['in']['rho']:.2f}, almost the same number. Give every "
                f"page the same budget of {b0['budget']} tokens and the correlation is {rare['rho']:.2f} if the tokens are drawn from "
                f"all over the page, and {win['rho']:.2f} (p = {win['p']:.2f}) for a continuous passage. How you control for length "
                f"decides the answer, and the paragraph didn't control at all."},
        {"claim": f"\"the vocabulary grows as V = K·n^β with β = {fame['beta']:.2f}, which shows that the best-connected characters drive the growth\"",
         "verdict": "One ordering presented as the answer, with no null.",
         "why": f"{N_SHUFFLES} random page orders give β = {null['beta']['mean']:.3f} ± {null['beta']['sd']:.3f}; most-linked-first gives "
                f"{fame['beta']:.3f} (p = {fame['pBeta']:.2f}). The exponent is a property of the corpus and the tokenizer. It "
                f"would come out the same if the pages were sorted by the third letter of their title."},
        {"claim": "\"Lexical richness is therefore a signature of a character's importance in the network.\"",
         "verdict": "\"Vocabulary\" used to mean length, and a Wikipedia fact read as a Marvel fact.",
         "why": "What the numbers support is that pages with more incoming links are longer. Both are decisions by Wikipedia "
                "editors: what to link and how much to write. Neither measures how a character speaks or matters in the comics."},
        {"claim": "(what the paragraph never says)",
         "verdict": "The preprocessing is missing.",
         "why": f"\"Distinct words\" here means {SPACY_LABEL}: {out['corpus']['spacy']['types']:,} types. The same pages give "
                f"{out['corpus']['countVectorizer']['terms']:,} under our CountVectorizer pattern. A count without its tokenizer can't be checked."},
    ]
    return {"prompt": "Write a short, confident paragraph for a blog post arguing that famous Marvel characters have richer "
                      "vocabularies on Wikipedia. Use these numbers: the type counts of the longest and shortest page, the Spearman "
                      "correlation between type count and in-degree, and the Heaps exponent with pages read most-linked first.",
            "paragraph": paragraph, "annotations": ann}


# ----------------------------------------------------------------------
# main
# ----------------------------------------------------------------------
def main():
    global INPUT_HASH
    t_start = time.time()
    log("Week 5 pipeline — does fame buy you words?")

    with timed("load"):
        nodes, edges = week1.load_raw()
        ids, indeg, outdeg = degrees(nodes, edges)
        totdeg = indeg + outdeg
        pages, readme = load_pages()
        assert sorted(pages) == ids, "marvel_pages.zip and week1_nodes.tsv disagree on the node set"
        nlp, spacy_version = load_nlp()
        INPUT_HASH = input_hash(spacy_version)
        meta_nodes = nodes.set_index("node_id").loc[ids]
        snapshot = readme.splitlines()[0].strip() if readme else ""
        log(f"    {len(ids)} pages, {len(edges)} directed edges, {sum(len(t) for t in pages.values()):,} characters")
        assert int(indeg.sum()) == int(outdeg.sum()) == len(edges)

    with timed("tokenize"):
        tok = cached("tokens", lambda: tokenize_pages(nlp, pages, ids))
        page_tokens = [tok[i] for i in ids]
        kept = Stream([w for w, _ in page_tokens])
        removed = Stream([[x for x, s in zip(w, st) if not s] for w, st in page_tokens])
        streams = {"kept": kept, "removed": removed}
        hapax = sum(1 for c in kept.counts.values() if c == 1)
        top10 = [{"type": w, "count": c, "share": r6(c / kept.N)} for w, c in kept.counts.most_common(10)]
        stop_types = sorted({w for words, st in page_tokens for w, s in zip(words, st) if s})
        log(f"    spaCy: {kept.N:,} tokens, {kept.V:,} types, {hapax:,} hapax | stopwords removed: {removed.N:,} tokens, {removed.V:,} types")

    # ---- corpus counts and the checks against the exercise notebook ----
    with timed("counts"):
        desc_tokens = []
        for d in meta_nodes["description"]:
            desc_tokens += [t.lower_ for t in nlp.tokenizer(str(d)) if not (t.is_space or t.is_punct)]
        desc_counts = Counter(desc_tokens)
        stream_all = [w for words, _ in page_tokens for w in words]   # pages in sorted-id order, as in the notebook
        bigrams = Counter(zip(stream_all, stream_all[1:]))
        trigrams = Counter(zip(stream_all, stream_all[1:], stream_all[2:]))
        all_raw = "".join(pages[i] + "\n" for i in ids)
        of_the_regex = len(re.findall(r"\bof the\b", all_raw, flags=re.IGNORECASE))

        page_names = ids
        texts = [pages[i] for i in ids]
        cv = CountVectorizer(lowercase=True, token_pattern=TOKEN_PATTERN)
        X = cv.fit_transform(texts)
        cv_stop = CountVectorizer(lowercase=True, token_pattern=TOKEN_PATTERN, stop_words="english")
        X_stop = cv_stop.fit_transform(texts)
        cv_len = np.asarray(X.sum(axis=1)).ravel()
        cv_order = np.argsort(-cv_len, kind="stable")
        terms = cv.get_feature_names_out()
        term_totals = np.asarray(X.sum(axis=0)).ravel()
        cv_top = [terms[k] for k in np.argsort(-term_totals, kind="stable")[:10]]
        stop_totals = np.asarray(X_stop.sum(axis=0)).ravel()
        cv_stop_top = [cv_stop.get_feature_names_out()[k] for k in np.argsort(-stop_totals, kind="stable")[:10]]
        cells = X.shape[0] * X.shape[1]
        corpus = {
            "nPages": len(ids), "characters": sum(len(t) for t in texts), "snapshot": snapshot,
            "spacy": {"label": SPACY_LABEL, "tokens": kept.N, "types": kept.V, "hapax": hapax,
                      "hapaxShare": r6(hapax / kept.V), "top10": top10,
                      "tokensNoStop": removed.N, "typesNoStop": removed.V,
                      "stopShare": r6(1 - removed.N / kept.N), "nStopTypes": len(stop_types),
                      "stopLabel": "spaCy's English stopword list (token.is_stop)"},
            "countVectorizer": {"label": CV_LABEL, "shape": list(X.shape), "terms": int(X.shape[1]), "tokens": int(X.sum()),
                                "nonzero": int(X.nnz), "sparsity": r6(1 - X.nnz / cells),
                                "termsPerPage": r4(X.nnz / X.shape[0]),
                                "longest": [[page_names[k], int(cv_len[k])] for k in cv_order[:5]],
                                "shortest": [page_names[int(np.argmin(cv_len))], int(cv_len.min())],
                                "top10": cv_top, "termsNoStop": int(X_stop.shape[1]), "tokensNoStop": int(X_stop.sum()),
                                "sparsityNoStop": r6(1 - X_stop.nnz / (X_stop.shape[0] * X_stop.shape[1])),
                                "top10NoStop": cv_stop_top,
                                "hyphenated": int(sum("-" in t for t in terms))},
            "descriptions": {"tokens": len(desc_tokens), "types": len(desc_counts),
                             "hapax": sum(1 for c in desc_counts.values() if c == 1)},
            "spacyDigitTypes": sum(1 for w in kept.vocab if any(ch.isdigit() for ch in w)),
            "topBigram": [" ".join(bigrams.most_common(1)[0][0]), bigrams.most_common(1)[0][1]],
            "topTrigram": [" ".join(trigrams.most_common(1)[0][0]), trigrams.most_common(1)[0][1]],
            "ofTheTokens": bigrams[("of", "the")], "ofTheRegex": of_the_regex,
        }

    # ---- hook: length against fame ----
    with timed("hook"):
        L = kept.lengths
        types_pp = np.array([len(set(w)) for w, _ in page_tokens])
        sp = {}
        for key, deg in (("in", indeg), ("out", outdeg), ("tot", totdeg)):
            res = spearmanr(L, deg)
            sp[key] = {"rho": r4(res.statistic), "p": float(res.pvalue)}
        res_t = spearmanr(types_pp, indeg)
        # Outliers by rank gap: the statistic is Spearman's, so "far from the
        # relationship" is measured in ranks too (no straight line assumed).
        rank_len, rank_in = rankdata(L), rankdata(indeg)
        gap = rank_len - rank_in            # > 0: longer than its fame predicts
        famous_cut = float(np.percentile(indeg, FAMOUS_PERCENTILE))

        def row(i):
            return {"id": ids[i], "inDeg": int(indeg[i]), "outDeg": int(outdeg[i]), "tokens": int(L[i]),
                    "rankLength": r4(len(ids) + 1 - rank_len[i]), "rankIn": r4(len(ids) + 1 - rank_in[i]), "rankGap": r4(gap[i])}

        long_for_fame = [row(i) for i in np.argsort(-gap, kind="stable")[:N_OUTLIERS]]
        famous = [i for i in np.argsort(gap, kind="stable") if indeg[i] >= famous_cut]
        short_for_fame = [row(i) for i in famous[:N_OUTLIERS]]
        hook = {
            "spearman": sp, "pearsonRaw": r4(np.corrcoef(L, indeg)[0, 1]),
            "typesVsIn": {"rho": r4(res_t.statistic), "p": float(res_t.pvalue)},
            "zeroInDegree": int((indeg == 0).sum()), "isolates": int((totdeg == 0).sum()),
            "medianTokens": float(np.median(L)), "maxIn": [ids[int(np.argmax(indeg))], int(indeg.max())],
            "famousCut": famous_cut, "famousPercentile": FAMOUS_PERCENTILE,
            "outliers": {"longForFame": long_for_fame, "shortForFame": short_for_fame},
            "degreeCheck": [{"id": i, "in": int(indeg[ids.index(i)]), "out": int(outdeg[ids.index(i)])}
                            for i in ("Spider-Man", "Hulk", "Scarlet_Witch", "Quasar_(character)", "Miracleman_(character)")],
        }

    # ---- reframe: equal token budgets ----
    with timed("budgets"):
        budgets = []
        for B in BUDGETS:
            rng = np.random.default_rng(RNG_SEED)
            keep = [k for k in range(len(ids)) if L[k] >= B]
            rare = np.array([rarefied_types(page_tokens[k][0], B) for k in keep])
            win = np.array([window_types(page_tokens[k][0], B, rng) for k in keep])
            rows = []
            for label, method, vals in (
                ("all types on the page (no control)", "raw", types_pp[keep]),
                (f"{B} tokens drawn at random from the whole page", "rarefied", rare),
                (f"{B} tokens in a row (mean of {N_WINDOWS} windows)", "window", win),
            ):
                res = spearmanr(vals, indeg[keep])
                res_l = spearmanr(vals, L[keep])
                rows.append({"method": method, "label": label, "rho": r4(res.statistic), "p": float(res.pvalue),
                             "rhoLength": r4(res_l.statistic), "min": r4(vals.min()), "max": r4(vals.max())})
            budgets.append({"budget": B, "nPages": len(keep), "rows": rows})
        budget = {"budgets": budgets, "nWindows": N_WINDOWS,
                  "rarefied500": [rarefied_types(w, BUDGETS[0]) and r4(rarefied_types(w, BUDGETS[0])) for w, _ in page_tokens],
                  "window500": [None if L[k] < BUDGETS[0] else r4(window_types(page_tokens[k][0], BUDGETS[0], np.random.default_rng(RNG_SEED + k)))
                                for k in range(len(ids))]}

    # ---- hero + robustness: Heaps curves against shuffled page orders ----
    heaps = {}
    n_zero = int((indeg == 0).sum())
    with timed("heaps"):
        for stop, S in streams.items():
            degree_keys = {"in": indeg, "out": outdeg, "tot": totdeg, "len": S.lengths}
            orders = {f"{k}_{d}": order_by(v, ids, d == "desc") for k, v in degree_keys.items() for d in ("desc", "asc")}
            # the block of zero-in-degree pages comes last in the fame-first order
            tail_tokens = int(S.lengths[orders["in_desc"][-n_zero:]].sum())
            null_all = cached(f"null-{stop}", lambda: run_shuffles(S, [S.N - tail_tokens]))
            null, null_tail = null_all[:, :len(S.grid)], null_all[:, -1]
            mean = null.mean(axis=0)
            fits = np.array([fit_power_law(S.grid, v) for v in null])
            loo = [(mean * N_SHUFFLES - null[k]) / (N_SHUFFLES - 1) for k in range(N_SHUFFLES)]
            null_area = np.array([area_stat(null[k], loo[k]) for k in range(N_SHUFFLES)])
            lo, hi = np.percentile(null, 2.5, axis=0), np.percentile(null, 97.5, axis=0)
            sd = null.std(axis=0)
            mean_fit = fit_power_law(S.grid, mean)
            curves, new_by, examples = {}, {}, {}
            stop_set = set(stop_types)
            for key, order in orders.items():
                V = S.curve(order)
                K, beta, r2 = fit_power_law(S.grid, V)
                below, above = V < lo, V > hi
                z = (V[:-1] - mean[:-1]) / sd[:-1]
                a = area_stat(V, mean)
                curves[key] = {
                    "V": V.tolist(), "K": r4(K), "beta": r6(beta), "r2": r6(r2),
                    "area": r6(a), "pArea": r4(two_sided_p(a, null_area, 0.0)),
                    "pBeta": r4(two_sided_p(beta, fits[:, 1])),
                    "below95": int(below.sum()), "above95": int(above.sum()),
                    "belowAll": int((V < null.min(axis=0)).sum()), "aboveAll": int((V > null.max(axis=0)).sum()),
                    "below95Runs": runs_of(below, S.grid), "above95Runs": runs_of(above, S.grid),
                    "zMin": r4(z.min()), "zMinAt": int(S.grid[int(z.argmin())]),
                    "zMax": r4(z.max()), "zMaxAt": int(S.grid[int(z.argmax())]),
                }
                counts, entry = S.new_types(order)
                new_by[key] = counts[order].tolist()
                # each page's most-used new types (plain words only), for the readout
                ex = [[] for _ in ids]
                best = np.lexsort((np.arange(len(entry)), -S.pcount[entry]))
                for e in entry[best]:
                    p, w = int(S.ppage[e]), S.vocab[int(S.ptype[e])]
                    if len(ex[p]) < 4 and w.isalpha() and len(w) > 2 and w not in stop_set:
                        ex[p].append(w)
                examples[key] = [ex[p] for p in order]
            # direct check of the fast curve: concatenate the tokens and count
            words = [w for w, _ in page_tokens] if stop == "kept" else [[x for x, s in zip(w, st) if not s] for w, st in page_tokens]
            seen, n_seen, direct = set(), 0, []
            marks = iter(S.grid.tolist())
            mark = next(marks)
            for p in orders["in_desc"]:
                for w in words[p]:
                    seen.add(w)
                    n_seen += 1
                    if n_seen == mark:
                        direct.append(len(seen))
                        mark = next(marks, None)
            assert direct == curves["in_desc"]["V"], "fast Heaps curve disagrees with the direct token count"

            # ties in the in-degree order: random tie-breaks instead of alphabetical
            rng = np.random.default_rng(RNG_SEED + 1)
            tb_a, tb_b = [], []
            for _ in range(N_TIEBREAKS):
                jitter = rng.random(len(ids))
                o = np.array(sorted(range(len(ids)), key=lambda i: (-indeg[i], jitter[i])))
                v = S.curve(o)
                tb_a.append(area_stat(v, mean))
                tb_b.append(fit_power_law(S.grid, v)[1])

            # the tail: what the zero-in-degree pages add, against a random final stretch
            fame_tail = int(S.V - S.curve(orders["in_desc"], [S.N - tail_tokens])[0])
            null_tail_new = S.V - null_tail
            lm_new, lm_tokens = cached(f"tail-{stop}", lambda: length_matched_tail(S, indeg, N_SHUFFLES))
            shortest_last = int(S.V - S.curve(orders["len_desc"], [S.N - tail_tokens])[0])
            tail_order = orders["in_desc"][-n_zero:]
            tail_new = S.new_types(orders["in_desc"])[0][tail_order]
            tail_top = [[ids[int(tail_order[k])], int(tail_new[k])] for k in np.argsort(-tail_new, kind="stable")[:6]]
            half_page = int(np.searchsorted(np.cumsum(S.lengths[orders["in_desc"]]), S.N / 2)) + 1
            heaps[stop] = {
                "label": SPACY_LABEL + (", stopwords kept" if stop == "kept" else ", spaCy stopwords removed"),
                "tokens": S.N, "types": S.V, "grid": S.grid.tolist(),
                "null": {"n": N_SHUFFLES, "mean": [r4(v) for v in mean], "min": null.min(axis=0).tolist(), "max": null.max(axis=0).tolist(),
                         "lo": [r4(v) for v in lo], "hi": [r4(v) for v in hi],
                         "K": {"mean": r4(fits[:, 0].mean()), "sd": r4(fits[:, 0].std()), "ofMeanCurve": r4(mean_fit[0])},
                         "beta": {"mean": r6(fits[:, 1].mean()), "sd": r6(fits[:, 1].std()), "min": r6(fits[:, 1].min()),
                                  "max": r6(fits[:, 1].max()), "ofMeanCurve": r6(mean_fit[1])},
                         "r2Mean": r6(fits[:, 2].mean()), "areaSd": r6(null_area.std())},
                "curves": curves, "orders": {k: v.tolist() for k, v in orders.items()},
                "newTypes": new_by, "examples": examples, "pageTokens": S.lengths.tolist(),
                "tieBreaks": {"n": N_TIEBREAKS, "areaMin": r6(min(tb_a)), "areaMax": r6(max(tb_a)),
                              "betaMin": r6(min(tb_b)), "betaMax": r6(max(tb_b))},
                "tail": {"pages": n_zero, "tokens": tail_tokens, "tokenShare": r6(tail_tokens / S.N),
                         "newTypes": fame_tail, "typeShare": r6(fame_tail / S.V),
                         "nullMean": r4(null_tail_new.mean()), "nullSd": r4(null_tail_new.std()),
                         "nullMin": int(null_tail_new.min()), "nullMax": int(null_tail_new.max()),
                         "p": r4(two_sided_p(fame_tail, null_tail_new)),
                         "per1000": r4(1000 * fame_tail / tail_tokens), "nullPer1000": r4(1000 * null_tail_new.mean() / tail_tokens),
                         "lengthMatched": {"n": len(lm_new), "strata": 10, "mean": r4(lm_new.mean()), "sd": r4(lm_new.std()),
                                           "min": int(lm_new.min()), "max": int(lm_new.max()),
                                           "tokensMean": r4(lm_tokens.mean()), "p": r4(two_sided_p(fame_tail, lm_new)),
                                           "per1000": r4(1000 * float(np.mean(lm_new / lm_tokens)))},
                         "shortestLast": shortest_last, "topPages": tail_top},
                "half": {"pages": half_page, "inDegAt": int(indeg[orders["in_desc"][half_page - 1]]),
                         "typesAtHalf": int(S.curve(orders["in_desc"], [int(np.cumsum(S.lengths[orders["in_desc"]])[half_page - 1])])[0])},
                "fit": {"method": "least squares on log V against log n", "from": int(S.grid[0]), "to": int(S.grid[-1]), "points": len(S.grid)},
            }
            f = curves["in_desc"]
            log(f"    [{stop}] most-linked first: K = {f['K']}, beta = {f['beta']:.4f} | shuffles: beta = "
                f"{fits[:, 1].mean():.4f} ± {fits[:, 1].std():.4f} | area {100 * f['area']:+.2f}% (p = {f['pArea']})")

    # ---- honesty: raw text against tokens ----
    with timed("honesty"):
        honesty = {
            "unigram": unigram_check(nlp, pages, ids, HONESTY_UNIGRAM),
            "column": column_check(pages, cv, X, page_names, *HONESTY_COLUMN),
            "hapax": cached("hapax", lambda: hapax_check(kept, pages, ids, page_tokens)),
        }

    # ---- the toy search box ----
    with timed("search"):
        Xc = X.tocsc()
        postings = []
        for k in range(Xc.shape[1]):
            rows_k = Xc.indices[Xc.indptr[k]:Xc.indptr[k + 1]]
            vals_k = Xc.data[Xc.indptr[k]:Xc.indptr[k + 1]]
            flat = []
            for d, c in zip(rows_k.tolist(), vals_k.tolist()):
                flat += [d, c]
            postings.append(flat)
        sk_stop = sorted(cv_stop.get_stop_words())
        norm_raw = np.sqrt(np.asarray(X.multiply(X).sum(axis=1)).ravel())
        norm_stop = np.sqrt(np.asarray(X_stop.multiply(X_stop).sum(axis=1)).ravel())
        examples = []
        for q in SEARCH_EXAMPLES:
            ex = {"query": q}
            for mode, vec, mat in (("raw", cv, X), ("noStop", cv_stop, X_stop)):
                sims = cosine_similarity(vec.transform([q]), mat).ravel()
                top = np.lexsort((np.arange(len(sims)), -sims))[:5]
                ex[mode] = [[page_names[k], r6(sims[k])] for k in top]
            examples.append(ex)
        search = {"terms": terms.tolist(), "postings": postings, "stopwords": sk_stop,
                  "normRaw": [r6(v) for v in norm_raw], "normNoStop": [r6(v) for v in norm_stop]}
        search_meta = {"label": CV_LABEL, "stopLabel": f"scikit-learn's built-in English list ({len(sk_stop)} words)",
                       "examples": examples, "file": "week5_search.json", "terms": int(X.shape[1])}

    # ---- sanity table: this run against exercise_5_3.ipynb ----
    sp_c, cv_c, uni, col = corpus["spacy"], corpus["countVectorizer"], honesty["unigram"], honesty["column"]
    checks = [
        ("Tokens (spaCy)", sp_c["tokens"], NOTEBOOK["tokens"]),
        ("Types (spaCy)", sp_c["types"], NOTEBOOK["types"]),
        ("Hapax types (spaCy)", sp_c["hapax"], NOTEBOOK["hapax"]),
        ("Short descriptions: tokens / types / hapax", [corpus["descriptions"][k] for k in ("tokens", "types", "hapax")],
         [NOTEBOOK["descTokens"], NOTEBOOK["descTypes"], NOTEBOOK["descHapax"]]),
        ("Document-term matrix shape (CountVectorizer)", cv_c["shape"], NOTEBOOK["cvShape"]),
        ("Non-zero cells", cv_c["nonzero"], NOTEBOOK["cvNonzero"]),
        ("Five longest pages (CountVectorizer tokens)", cv_c["longest"], NOTEBOOK["cvLongest"]),
        ("Shortest page", cv_c["shortest"], NOTEBOOK["cvShortest"]),
        ("Terms after removing sklearn's stopwords", cv_c["termsNoStop"], NOTEBOOK["cvStopTerms"]),
        ("'power': spaCy tokens / raw regex", [uni["tokenCount"], uni["regexCount"]], [NOTEBOOK["powerTokens"], NOTEBOOK["powerRegex"]]),
        ("'of the': bigram count / raw regex", [corpus["ofTheTokens"], corpus["ofTheRegex"]], [NOTEBOOK["ofTheTokens"], NOTEBOOK["ofTheRegex"]]),
        ("'symbiote': corpus total / pages", [col["corpusTotal"], col["pagesWithTerm"]], [NOTEBOOK["symbioteTotal"], NOTEBOOK["symbiotePages"]]),
        ("'symbiote' on Eddie Brock: matrix / raw regex", [col["matrixCount"], col["regexCount"]], [NOTEBOOK["symbioteMatrix"], NOTEBOOK["symbioteRegex"]]),
        ("Most frequent bigram", corpus["topBigram"], NOTEBOOK["topBigram"]),
        ("Most frequent trigram", corpus["topTrigram"], NOTEBOOK["topTrigram"]),
    ]
    sanity = [{"what": what, "ours": ours, "notebook": ref, "ok": ours == ref} for what, ours, ref in checks]
    log("")
    log("Sanity: this run vs week5/exercise_5_3.ipynb")
    for s in sanity:
        log(f"  {'ok ' if s['ok'] else 'DIFF'}  {s['what']}: {s['ours']}  (notebook: {s['notebook']})")
    n_diff = sum(not s["ok"] for s in sanity)
    if n_diff:
        log(f"  {n_diff} number(s) differ from the notebook — a different preprocessing choice, or a bug. Check before publishing.")

    out = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "courseWeek": COURSE_WEEK_URL, "dataPage": DATA_PAGE_URL,
            "snapshot": snapshot,
            "datasetNote": "marvel_pages.zip, week1_nodes.tsv and week1_edges.tsv are the course's frozen 2026-08-26 snapshot, "
                           "committed to data/raw/ so the pipeline runs offline.",
            "versions": {"spacy": spacy_version, "spacyModel": nlp.meta.get("name", "") + " " + nlp.meta.get("version", ""),
                         "sklearn": sklearn.__version__, "numpy": np.__version__},
            "params": {"seed": RNG_SEED, "nShuffles": N_SHUFFLES, "gridPoints": GRID_POINTS, "gridMin": GRID_MIN,
                       "budgets": BUDGETS, "nWindows": N_WINDOWS, "nTieBreaks": N_TIEBREAKS,
                       "tokenPattern": TOKEN_PATTERN, "nCurvesTested": sum(len(h["curves"]) for h in heaps.values())},
            "network": {"nodes": len(ids), "directedEdges": int(len(edges)),
                        "note": "directed Week 1 network; in-degree = pages linking here, out-degree = pages linked from here, "
                                "total = in + out (a reciprocated pair counts twice)"},
        },
        "corpus": corpus,
        # Pages are labelled by node id: five `name` values in week1_nodes.tsv belong to a
        # different article than their node (listed in nameMismatch).
        "pages": {"id": ids, "name": [i.replace("_", " ") for i in ids],
                  "nameMismatch": [[i, n] for i, n in zip(ids, meta_nodes["name"]) if i.replace("_", " ") != n], "url": meta_nodes["url"].tolist(),
                  "tokens": kept.lengths.tolist(), "tokensNoStop": removed.lengths.tolist(), "types": types_pp.tolist(),
                  "inDeg": indeg.tolist(), "outDeg": outdeg.tolist(), "totDeg": totdeg.tolist()},
        "hook": hook, "budget": budget, "heaps": heaps, "honesty": honesty,
        "search": search_meta, "sanity": sanity,
    }
    out["llmGrading"] = llm_grading(out)

    with timed("figures"):
        figures(out)

    TIMINGS["total"] = round(time.time() - t_start, 1)
    out["meta"]["timings"] = TIMINGS
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    with open(SEARCH_PATH, "w", encoding="utf-8") as f:
        json.dump(search, f, ensure_ascii=False, separators=(",", ":"))
    log("")
    log("Runtime summary (seconds): " + ", ".join(f"{k} {v}" for k, v in TIMINGS.items()))
    log(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} ({OUTPUT_PATH.stat().st_size / 1024:.0f} kB) and "
        f"{SEARCH_PATH.relative_to(ROOT)} ({SEARCH_PATH.stat().st_size / 1024:.0f} kB)")
    return out


if __name__ == "__main__":
    main()
