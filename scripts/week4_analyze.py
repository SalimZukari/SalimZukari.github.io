"""
Philosophers Wikipedia network — Week 4 analysis pipeline
("Where are the borders of philosophy?").

Reads the official Week 4 course files, committed to data/raw/:

  week4_philosophers_nodes.tsv   1,444 philosophers (frozen snapshot 2026-09-15)
  week4_philosophers_edges.tsv   11,135 directed, weighted edges
  week1_nodes.tsv + week4_edges_weighted.tsv   Marvel, for the contrast
  week4_wikidata_movement_cache.json           Wikidata P135 "movement" labels
                                               (fetched once, then offline)

and computes every number used by weeks/week4.html and weeks/week4/week4_gonuts.md:

  1. sanity checks against every number stated on the course's Week 4 page
  2. Louvain on the undirected, unweighted giant component: ten seeds, the
     10 x 10 NMI matrix, a consensus partition (co-assignment across runs)
     and a per-philosopher stability score
  3. modularity against its nulls: 20 configuration-model shuffles, 20
     strict double-edge swaps and 20 G(n, m) graphs, Louvain on each —
     for the philosophers and, with the same code, for Marvel
  4. Louvain vs Infomap (undirected and directed), NMI, the contingency
     table, the philosophers the two methods dispute, Infomap's own null
  5. k-clique communities (k = 3..6) and link communities (Ahn, Bagrow &
     Lehmann 2010, implemented here, cut at maximum partition density),
     communities per link, Aristotle's links by link community
  6. weights: strength vs degree, strongest ties, weighted paths, weighted
     Louvain against a weight-permutation null
  7. the disparity filter (implemented from the formula), the course's
     alpha table and thresholds, a fine alpha sweep, the alpha at which the
     giant component breaks and the philosopher whose links break it
  8. a precomputed layout of the backbone, static figures, and the LLM box

Nothing here hard-codes a result. The heavy steps are cached under
data/processed/.week4_cache/ keyed by a hash of the inputs; pass --no-cache
to recompute everything from scratch.

Usage:
    python scripts/week4_analyze.py [--no-cache]
    (or: npm run analyze:week4)
"""

import hashlib
import itertools
import json
import math
import pickle
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx
import numpy as np
from scipy.stats import spearmanr
from sklearn.metrics import adjusted_mutual_info_score, normalized_mutual_info_score

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
import netlib  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
CACHE_DIR = PROCESSED_DIR / ".week4_cache"
OUTPUT_PATH = PROCESSED_DIR / "week4.json"
FIG_DIR = ROOT / "weeks" / "week4" / "figures"

PHIL_NODES = RAW_DIR / "week4_philosophers_nodes.tsv"
PHIL_EDGES = RAW_DIR / "week4_philosophers_edges.tsv"
MARVEL_NODES = RAW_DIR / "week1_nodes.tsv"
MARVEL_EDGES = RAW_DIR / "week4_edges_weighted.tsv"
MOVEMENT_CACHE = RAW_DIR / "week4_wikidata_movement_cache.json"

COURSE_WEEK_URL = "https://sunelehmann.com/socialgraphs2026-web/weeks/week4.html"
DATA_PAGE_URL = "https://sunelehmann.com/socialgraphs2026-web/data/"

RNG_SEED = 42
SEEDS = list(range(10))          # Louvain seeds (the course's "ten runs")
N_NULL = 20                      # shuffles per null model (course: 20)
CONSENSUS_TAU = 0.5              # co-assignment threshold for the consensus graph
INFOMAP_SEEDS = list(range(1, 11))
COURSE_ALPHAS = [0.05, 0.1, 0.2, 0.3, 0.5]
FIGURE_ALPHAS = [0.2, 0.1, 0.05]  # the three backbones drawn side by side
MAIN_ALPHA = 0.2                  # the full-quality figure and the layout
THRESHOLDS = [2, 3, 4]
SWEEP_STEP = 0.001
SWEEP_MAX = 0.6
MIN_COLORED = 20                  # communities smaller than this are drawn grey
CACHE_VERSION = "w4-v1"

# Okabe–Ito plus two, colour-blind safe; shared with the page through the JSON.
PALETTE = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00",
           "#CC79A7", "#9AD0A5", "#B39DDB", "#FF9E80"]
GREY = "#8a8f98"

USE_CACHE = "--no-cache" not in sys.argv
TIMINGS = {}


def log(msg=""):
    print(msg, flush=True)


def r3(x):
    return None if x is None else round(float(x), 3)


def r4(x):
    # 6 decimals, not 4: the page rounds for display, and rounding twice
    # (0.50754 -> 0.5075 -> "0.507") would disagree with the sanity table
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


def input_hash():
    h = hashlib.sha1(CACHE_VERSION.encode())
    for p in (PHIL_NODES, PHIL_EDGES, MARVEL_NODES, MARVEL_EDGES):
        h.update(p.read_bytes())
    return h.hexdigest()[:12]


INPUT_HASH = None


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


def snapshot_line(path):
    """The '(frozen snapshot, YYYY-MM-DD ...)' note from a course file's header."""
    with open(path, encoding="utf-8") as f:
        first = f.readline()
    i = first.find("frozen snapshot")
    return first[i:].strip().rstrip(")") if i >= 0 else first.strip("# \n")


# ----------------------------------------------------------------------
# 1. Load — node roster first
# ----------------------------------------------------------------------
def load():
    for p in (PHIL_NODES, PHIL_EDGES, MARVEL_NODES, MARVEL_EDGES):
        if not p.exists():
            log(f"Missing {p.relative_to(ROOT)} — download it from {DATA_PAGE_URL}")
            sys.exit(1)
    nodes_df = netlib.read_nodes(PHIL_NODES)
    edges_df = netlib.read_weighted_edges(PHIL_EDGES)
    D, G = netlib.build_graphs(nodes_df, edges_df)
    GC = netlib.giant_component(G)

    m_nodes = netlib.read_nodes(MARVEL_NODES)
    m_edges = netlib.read_weighted_edges(MARVEL_EDGES)
    MD, MG = netlib.build_graphs(m_nodes, m_edges)
    MGC = netlib.giant_component(MG)
    return nodes_df, edges_df, D, G, GC, m_nodes, MD, MG, MGC


def load_movements(nodes_df):
    """Wikidata P135 ('movement'), cached; fetched once if the cache is missing."""
    if MOVEMENT_CACHE.exists():
        with open(MOVEMENT_CACHE, encoding="utf-8") as f:
            return json.load(f)
    log("    fetching Wikidata P135 (movement) — first run only")
    qids = [q for q in nodes_df["wikidata_id"] if isinstance(q, str) and q.startswith("Q")]
    out = {}
    for i in range(0, len(qids), 200):
        vals = " ".join("wd:" + q for q in qids[i:i + 200])
        sparql = (f"SELECT ?item ?movLabel WHERE {{ VALUES ?item {{ {vals} }} ?item wdt:P135 ?mov . "
                  f"SERVICE wikibase:label {{ bd:serviceParam wikibase:language \"en\". }} }}")
        url = "https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(sparql)
        req = urllib.request.Request(url, headers={"User-Agent": "DTU-02805-student-group/1.0 (course exercise)"})
        data = json.load(urllib.request.urlopen(req, timeout=60))
        for b in data["results"]["bindings"]:
            out.setdefault(b["item"]["value"].rsplit("/", 1)[1], []).append(b["movLabel"]["value"])
        time.sleep(1)
    cache = {"property": "P135", "fetchedAt": datetime.now(timezone.utc).date().isoformat(), "movements": out}
    with open(MOVEMENT_CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)
    return cache


# ----------------------------------------------------------------------
# 2. Louvain: ten seeds, NMI matrix, consensus, stability
# ----------------------------------------------------------------------
def louvain_runs(G, ids, weight=None, resolution=1.0, seeds=SEEDS):
    runs, qs = [], []
    for s in seeds:
        P = nx.community.louvain_communities(G, weight=weight, resolution=resolution, seed=s)
        lab = netlib.partition_to_labels(P, ids)
        runs.append(lab)
        qs.append(nx.community.modularity(G, P, weight=weight))
    return runs, qs


def consensus_partition(label_runs, tau=CONSENSUS_TAU, max_iter=10):
    """Lancichinetti & Fortunato (2012) consensus clustering: build a graph
    whose link weights are co-assignment frequencies (kept where >= tau),
    run Louvain on it with every seed, and repeat until all runs agree."""
    n = len(label_runs[0])
    cur = label_runs
    iu = np.triu_indices(n, 1)
    for it in range(1, max_iter + 1):
        F = netlib.coassignment(cur)
        vals = F[iu]
        keep = vals >= tau
        H = nx.Graph()
        H.add_nodes_from(range(n))
        H.add_weighted_edges_from(zip(iu[0][keep].tolist(), iu[1][keep].tolist(), vals[keep].tolist()))
        new = [netlib.partition_to_labels(nx.community.louvain_communities(H, weight="weight", seed=s), list(range(n)))
               for s in SEEDS]
        if all(netlib.nmi(new[0], x) == 1.0 for x in new[1:]):
            return new[0], it, True
        cur = new
    return new[0], max_iter, False


def analyze_louvain(GC, ids, name, deg):
    runs, qs = louvain_runs(GC, ids)
    k = len(runs)
    M = [[1.0 if i == j else netlib.nmi(runs[i], runs[j]) for j in range(k)] for i in range(k)]
    off = [M[i][j] for i, j in itertools.combinations(range(k), 2)]
    cons, iters, converged = consensus_partition(runs)
    idx = {v: i for i, v in enumerate(ids)}
    cons_q = netlib.modularity(GC, dict(zip(ids, cons)))

    F0 = netlib.coassignment(runs)
    stability = []
    for i in range(len(ids)):
        members = [j for j in range(len(ids)) if cons[j] == cons[i] and j != i]
        stability.append(float(F0[i, members].mean()) if members else None)
    aligned = [netlib.align_labels(r, cons) for r in runs]
    distinct = [len(set(a[i] for a in aligned)) for i in range(len(ids))]

    def together(a, b):
        return int(round(F0[idx[a], idx[b]] * k))

    pairs = [("René_Descartes", "John_Locke"), ("Avicenna", "Galileo_Galilei"),
             ("Aristotle", "Plato"), ("Aristotle", "Thomas_Aquinas"), ("Plato", "Socrates")]
    return {
        "runs": runs, "aligned": aligned, "qs": qs, "nmi": M, "nmiOff": off,
        "consensus": cons, "consensusIters": iters, "consensusConverged": converged,
        "consensusQ": cons_q, "consensusNmiToRuns": [netlib.nmi(cons, r) for r in runs],
        "stability": stability, "distinct": distinct, "F0": F0,
        "pairs": [{"a": a, "b": b, "together": together(a, b), "of": k} for a, b in pairs if a in idx and b in idx],
    }


def community_table(labels, ids, deg, name, top=6):
    """Communities named after their highest-degree member — a label for the
    partition, not a finding (the course's own convention, §4)."""
    groups = defaultdict(list)
    for v, c in zip(ids, labels):
        groups[c].append(v)
    rows = []
    for c, members in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        ms = sorted(members, key=lambda v: (-deg[v], v))
        rows.append({"id": int(c), "size": len(members), "label": name[ms[0]], "top": ms[:top]})
    return rows


# ----------------------------------------------------------------------
# 3. Nulls for modularity
# ----------------------------------------------------------------------
def louvain_q(H, seed):
    return nx.community.modularity(H, nx.community.louvain_communities(H, weight=None, seed=seed), weight=None)


def null_ensemble(GC, tag):
    degs = [d for _, d in GC.degree()]
    n, m = GC.number_of_nodes(), GC.number_of_edges()

    def run():
        out = {"config": [], "configEdges": [], "swap": [], "gnm": [], "configNmi": [], "gnmNmi": []}
        for i in range(N_NULL):
            seed = RNG_SEED * 1000 + i
            H = netlib.clean_configuration_model(degs, seed)
            P0 = nx.community.louvain_communities(H, weight=None, seed=i)
            out["config"].append(nx.community.modularity(H, P0, weight=None))
            out["configEdges"].append(H.number_of_edges())
            if i < 5:  # stability of noise: two seeds on the same shuffled graph
                hid = sorted(H)
                P1 = nx.community.louvain_communities(H, weight=None, seed=i + 100)
                out["configNmi"].append(netlib.nmi(netlib.partition_to_labels(P0, hid), netlib.partition_to_labels(P1, hid)))
            S = netlib.double_edge_swap_null(GC, seed)
            out["swap"].append(louvain_q(S, i))
            R = nx.gnm_random_graph(n, m, seed=seed)
            PR = nx.community.louvain_communities(R, weight=None, seed=i)
            out["gnm"].append(nx.community.modularity(R, PR, weight=None))
            if i < 5:
                P1 = nx.community.louvain_communities(R, weight=None, seed=i + 100)
                rid = sorted(R)
                out["gnmNmi"].append(netlib.nmi(netlib.partition_to_labels(PR, rid), netlib.partition_to_labels(P1, rid)))
        return out

    return cached(f"nulls-{tag}", run)


def summarize_nulls(real_qs, raw, m):
    real = float(np.mean(real_qs))
    res = {"realMean": r4(real), "realMin": r4(min(real_qs)), "realMax": r4(max(real_qs)), "m": m}
    for key in ("config", "swap", "gnm"):
        vals = raw[key]
        z, p = netlib.z_and_p(real, vals)
        res[key] = {"mean": r4(np.mean(vals)), "sd": r4(np.std(vals)), "values": [r4(v) for v in vals],
                    "z": round(z, 1), "diff": r4(real - np.mean(vals))}
    res["config"]["meanEdges"] = round(float(np.mean(raw["configEdges"])))
    res["configNmiBetweenSeeds"] = [r3(x) for x in raw["configNmi"]]
    res["gnmNmiBetweenSeeds"] = [r3(x) for x in raw["gnmNmi"]]
    return res


# ----------------------------------------------------------------------
# 4. Infomap
# ----------------------------------------------------------------------
def run_infomap(G, ids, seed, trials, directed=False):
    import infomap
    im = infomap.Infomap(two_level=True, silent=True, seed=seed, num_trials=trials, directed=directed)
    ix = {v: i for i, v in enumerate(ids)}
    for v in ids:
        im.add_node(ix[v])
    for u, v in G.edges():
        im.add_link(ix[u], ix[v])
    im.run()
    mods = im.get_modules()
    raw = [mods[ix[v]] for v in ids]
    # renumber largest-first so labels are comparable to our other partitions
    order = [c for c, _ in Counter(raw).most_common()]
    ren = {c: i for i, c in enumerate(order)}
    return [ren[c] for c in raw], im.codelength, im.one_level_codelength


def analyze_infomap(GC, D, ids, cons, deg, name):
    def run():
        main, L, L1 = run_infomap(GC, ids, seed=1, trials=10)
        seeds = [run_infomap(GC, ids, seed=s, trials=1)[0] for s in INFOMAP_SEEDS]
        Dg = D.subgraph(ids).copy()
        dlab, dL, dL1 = run_infomap(Dg, ids, seed=1, trials=10, directed=True)
        nulls = []
        degs = [d for _, d in GC.degree()]
        for i in range(N_NULL):
            H = netlib.clean_configuration_model(degs, RNG_SEED * 1000 + i)
            hid = sorted(H)
            lab, l, l1 = run_infomap(H, hid, seed=1, trials=1)
            nulls.append((len(set(lab)), l, l1))
        return main, L, L1, seeds, dlab, dL, dL1, nulls

    main, L, L1, seeds, dlab, dL, dL1, nulls = cached("infomap", run)
    m = GC.number_of_edges()
    sqrt2m = math.sqrt(2 * m)

    # contingency: consensus Louvain community x Infomap module
    cont = Counter(zip(cons, main))
    mod_members = defaultdict(list)
    for v, c in zip(ids, main):
        mod_members[c].append(v)
    lv_of = dict(zip(ids, cons))
    dominant = {}
    for c, members in mod_members.items():
        dominant[c] = Counter(lv_of[v] for v in members).most_common(1)[0][0]
    disputed = [v for v, lc, mc in zip(ids, cons, main) if dominant[mc] != lc]

    # internal links per Infomap module, and whether Louvain keeps it with others
    im_of = dict(zip(ids, main))
    internal = Counter()
    for u, v in GC.edges():
        if im_of[u] == im_of[v]:
            internal[im_of[u]] += 1
    modules = []
    for c, members in sorted(mod_members.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        ms = sorted(members, key=lambda v: (-deg[v], v))
        lv_counts = Counter(lv_of[v] for v in members)
        modules.append({
            "id": int(c), "size": len(members), "label": name[ms[0]], "top": ms[:5],
            "internalLinks": internal[c], "belowResolution": internal[c] < sqrt2m,
            "dominantLouvain": int(dominant[c]), "dominantShare": r3(lv_counts[dominant[c]] / len(members)),
        })
    # Louvain communities that Infomap splits
    splits = []
    for lc in sorted(set(cons)):
        total = sum(n for (a, b), n in cont.items() if a == lc)
        parts = sorted([(b, n) for (a, b), n in cont.items() if a == lc], key=lambda x: -x[1])
        big = [(b, n) for b, n in parts if n >= max(5, 0.1 * total)]
        if total >= MIN_COLORED and len(big) >= 2:
            splits.append({"louvain": int(lc), "size": total, "parts": [{"module": int(b), "n": n} for b, n in big]})

    seed_nmi = [netlib.nmi(seeds[i], seeds[j]) for i, j in itertools.combinations(range(len(seeds)), 2)]
    null_mods = [x[0] for x in nulls]
    null_save = [(x[2] - x[1]) / x[2] for x in nulls]
    return {
        "labels": main,
        "nModules": len(set(main)),
        "nModulesAtLeast10": sum(1 for c in Counter(main).values() if c >= 10),
        "codelength": r4(L), "oneLevelCodelength": r4(L1), "savings": r4((L1 - L) / L1),
        "seedNmiMin": r3(min(seed_nmi)), "seedNmiMax": r3(max(seed_nmi)),
        "seedModules": [len(set(s)) for s in seeds],
        "nmiVsConsensus": r3(netlib.nmi(main, cons)),
        "directed": {"nModules": len(set(dlab)), "codelength": r4(dL), "savings": r4((dL1 - dL) / dL1),
                     "nmiVsUndirected": r3(netlib.nmi(dlab, main)), "nmiVsConsensus": r3(netlib.nmi(dlab, cons))},
        "null": {"nModulesMean": r3(np.mean(null_mods)), "nModulesMin": int(min(null_mods)), "nModulesMax": int(max(null_mods)),
                 "savingsMean": r4(np.mean(null_save)), "savingsMax": r4(max(null_save)), "n": N_NULL},
        "contingency": [[int(a), int(b), n] for (a, b), n in sorted(cont.items())],
        "modules": modules, "splits": splits, "disputed": disputed,
        "sqrt2m": r3(sqrt2m),
    }


# ----------------------------------------------------------------------
# 5a. k-clique communities
# ----------------------------------------------------------------------
def analyze_kcliques(GC, ids, deg, name):
    def run():
        return {k: [sorted(c) for c in nx.community.k_clique_communities(GC, k)] for k in (3, 4, 5, 6)}

    raw = cached("kcliques", run)
    n = GC.number_of_nodes()
    out = {"table": [], "communities": {}, "membership": {}}
    for k, comms in raw.items():
        comms = sorted(comms, key=lambda c: (-len(c), c[0]))
        cnt = Counter(v for c in comms for v in c)
        out["table"].append({"k": k, "communities": len(comms), "largest": max(map(len, comms)),
                             "placed": len(cnt), "placedShare": r3(len(cnt) / n),
                             "inTwoOrMore": sum(1 for x in cnt.values() if x >= 2), "noCommunity": n - len(cnt)})
        labels = []
        for c in comms:
            ms = sorted(c, key=lambda v: (-deg[v], v))
            labels.append({"size": len(c), "label": " · ".join(name[v] for v in ms[:3])})
        out["communities"][k] = labels
        mem = defaultdict(list)
        for ci, c in enumerate(comms):
            for v in c:
                mem[v].append(ci)
        out["membership"][k] = mem
    # the Legalists (the course's resolution-limit example): the k=5 community with Han Fei
    legal = None
    k5 = sorted(raw[5], key=lambda c: (-len(c), c[0]))
    for c in k5:
        if "Han_Fei" in c:
            sub = GC.subgraph(c)
            legal = {"members": c, "size": len(c), "internalLinks": sub.number_of_edges()}
    out["legalists"] = legal
    return out


# ----------------------------------------------------------------------
# 5b. Link communities (Ahn, Bagrow & Lehmann 2010), implemented here
# ----------------------------------------------------------------------
def link_clustering(G):
    """Similarity of two links sharing node k, (i,k) and (j,k): Jaccard of the
    inclusive neighbourhoods of i and j. Single-linkage clustering of the
    links (union–find over similarity levels, highest first), cut at the level
    with the highest partition density D."""
    E = list(G.edges())
    M = len(E)
    eid = {}
    for i, (u, v) in enumerate(E):
        eid[(u, v)] = i
        eid[(v, u)] = i
    inc = {v: set(G[v]) | {v} for v in G}
    pairs = []
    for k in G:
        nb = sorted(G[k])
        for a, b in itertools.combinations(nb, 2):
            s = len(inc[a] & inc[b]) / len(inc[a] | inc[b])
            pairs.append((s, eid[(k, a)], eid[(k, b)]))
    pairs.sort(key=lambda x: (-x[0], x[1], x[2]))

    def dterm(mc, nc):
        return 0.0 if nc <= 2 else mc * (mc - (nc - 1)) / ((nc - 2) * (nc - 1))

    parent = list(range(M))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    mc = [1] * M
    nodesets = [{u, v} for u, v in E]
    Dsum, best, i, P = 0.0, (-1.0, None, 0), 0, len(pairs)
    curve = []
    while i < P:
        s = pairs[i][0]
        while i < P and pairs[i][0] == s:
            _, a, b = pairs[i]
            ra, rb = find(a), find(b)
            if ra != rb:
                Dsum -= dterm(mc[ra], len(nodesets[ra])) + dterm(mc[rb], len(nodesets[rb]))
                if len(nodesets[ra]) < len(nodesets[rb]):
                    ra, rb = rb, ra
                parent[rb] = ra
                mc[ra] += mc[rb]
                nodesets[ra] |= nodesets[rb]
                nodesets[rb] = None
                Dsum += dterm(mc[ra], len(nodesets[ra]))
            i += 1
        D = 2 * Dsum / M
        curve.append((s, D))
        if D > best[0]:
            best = (D, s, i)
    parent = list(range(M))
    for _, a, b in pairs[:best[2]]:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra
    lab = [find(x) for x in range(M)]
    # brute-force D of the final partition (validation of the incremental sum)
    groups = defaultdict(list)
    for x, c in enumerate(lab):
        groups[c].append(x)
    Dcheck = 2 / M * sum(dterm(len(xs), len({w for x in xs for w in E[x]})) for xs in groups.values())
    return E, lab, best[0], best[1], Dcheck, len(pairs), curve


def analyze_link_communities(GC, ids, deg, name, cons):
    E, lab, Dbest, cut, Dcheck, npairs, curve = cached("linkcomm", lambda: link_clustering(GC))
    sizes = Counter(lab)
    big = [c for c, s in sizes.most_common() if s >= 3]
    ren = {c: i for i, c in enumerate(big)}  # communities of >= 3 links, largest first
    comm_nodes = defaultdict(set)
    for (u, v), c in zip(E, lab):
        if c in ren:
            comm_nodes[ren[c]].update((u, v))
    lv_of = dict(zip(ids, cons))
    comms = []
    for c in range(len(big)):
        ms = sorted(comm_nodes[c], key=lambda v: (-deg[v], v))
        dom = Counter(lv_of[v] for v in ms).most_common(1)[0]
        comms.append({"id": c, "links": sizes[big[c]], "nodes": len(ms), "label": " · ".join(name[v] for v in ms[:3]),
                      "top": ms[:6], "dominantLouvain": int(dom[0]), "dominantShare": r3(dom[1] / len(ms))})
    per_node_all = defaultdict(set)
    per_node = defaultdict(set)
    for (u, v), c in zip(E, lab):
        per_node_all[u].add(c)
        per_node_all[v].add(c)
        if c in ren:
            per_node[u].add(ren[c])
            per_node[v].add(ren[c])
    count_all = [len(per_node_all[v]) for v in ids]
    count3 = [len(per_node[v]) for v in ids]
    degs = [deg[v] for v in ids]
    ratio = {v: len(per_node[v]) / deg[v] for v in ids}
    # links of each node that sit in a real (>= 3-link) community
    covered = Counter()
    for (u, v), c in zip(E, lab):
        if c in ren:
            covered[u] += 1
            covered[v] += 1
    # Only rank nodes whose links mostly sit in real (>= 3-link) communities:
    # a node whose links are all in 1–2-link fragments has a low ratio because
    # the method left it out, not because everyone links to it from one side.
    wellcovered = [v for v in ids if covered[v] >= 0.5 * deg[v]]
    bridges = sorted([v for v in wellcovered if deg[v] >= 20], key=lambda v: (-ratio[v], -deg[v]))[:10]
    hubs = sorted([v for v in wellcovered if deg[v] >= 30], key=lambda v: (ratio[v], -deg[v]))[:10]
    unassigned = [v for v in ids if not per_node[v]]

    def ego(center):
        links = []
        for (u, v), c in zip(E, lab):
            if center in (u, v):
                other = v if u == center else u
                links.append({"n": other, "c": ren.get(c, -1), "w": GC[u][v]["weight"]})
        by = Counter(l["c"] for l in links if l["c"] >= 0)
        by_trad = Counter(comms[c]["dominantLouvain"] for c in by.elements())
        nb_trad = Counter(lv_of[l["n"]] for l in links)
        return {"links": links, "communities": [{"id": c, "links": n} for c, n in by.most_common()],
                "linksInSmallCommunities": sum(1 for l in links if l["c"] < 0),
                "linksByTraditionViaLinkComms": [[int(t), n] for t, n in by_trad.most_common()],
                "neighborsByTradition": [[int(t), n] for t, n in nb_trad.most_common()]}

    return {
        "E": E, "lab": lab, "ren": ren,
        "summary": {"links": len(E), "linkPairs": npairs, "bestD": r4(Dbest), "Dcheck": r4(Dcheck),
                    "cutSimilarity": r4(cut), "nCommunities": len(sizes), "nAtLeast3": len(big),
                    "spearmanCountDegreeAll": r3(spearmanr(count_all, degs)[0]),
                    "spearmanCountDegree3": r3(spearmanr(count3, degs)[0]),
                    "unassigned": len(unassigned),
                    "curve": [[r4(s), r4(d)] for s, d in curve[::max(1, len(curve) // 200)]]},
        "communities": comms, "perNode": per_node, "ratio": ratio, "covered": covered,
        "bridges": bridges, "hubs": hubs, "ego": {"Aristotle": ego("Aristotle")},
    }


# ----------------------------------------------------------------------
# 6. Weights
# ----------------------------------------------------------------------
def analyze_weights(GC, ids, deg, name, cons):
    s = dict(GC.degree(weight="weight"))
    rho = spearmanr([deg[v] for v in ids], [s[v] for v in ids])[0]
    by_deg = sorted(ids, key=lambda v: (-deg[v], v))
    by_str = sorted(ids, key=lambda v: (-s[v], v))
    lk = np.log([deg[v] for v in ids])
    ls = np.log([s[v] for v in ids])
    b, a = np.polyfit(lk, ls, 1)
    resid = {v: ls[i] - (a + b * lk[i]) for i, v in enumerate(ids)}
    outliers = sorted([v for v in ids if deg[v] >= 10], key=lambda v: -resid[v])[:4]
    strongest = sorted(GC.edges(data="weight"), key=lambda e: (-e[2], e[0]))[:6]
    wcount = Counter(w for *_, w in GC.edges(data="weight"))

    hm = None
    if "David_Hume" in GC and "Karl_Marx" in GC:
        middle = sorted(nx.common_neighbors(GC, "David_Hume", "Karl_Marx"))
        H = GC.copy()
        for u, v, d in H.edges(data=True):
            d["len"] = 1 / d["weight"]
        path = nx.dijkstra_path(H, "David_Hume", "Karl_Marx", weight="len")
        hm = {"hops": nx.shortest_path_length(GC, "David_Hume", "Karl_Marx"), "middlemen": len(middle),
              "exampleMiddle": [v for v in middle if v == "Adam_Smith"] or middle[:1],
              "weightedPath": path, "weightedPathWeights": [GC[a_][b_]["weight"] for a_, b_ in zip(path, path[1:])]}

    # weighted Louvain, ten seeds, and its consensus
    wruns, wqs = louvain_runs(GC, ids, weight="weight")
    wcons, _, _ = consensus_partition(wruns)
    woff = [netlib.nmi(wruns[i], wruns[j]) for i, j in itertools.combinations(range(len(wruns)), 2)]
    walign = netlib.align_labels(wcons, cons)
    movers = [v for v, a_, b_ in zip(ids, cons, walign) if a_ != b_]

    # weight-permutation null: same topology, weights shuffled over the links
    def run_null():
        rng = np.random.default_rng(RNG_SEED)
        edges = list(GC.edges())
        ws = np.array([GC[u][v]["weight"] for u, v in edges])
        out = []
        for i in range(N_NULL):
            H = nx.Graph()
            H.add_nodes_from(GC)
            H.add_weighted_edges_from((u, v, int(w)) for (u, v), w in zip(edges, rng.permutation(ws)))
            out.append(nx.community.modularity(H, nx.community.louvain_communities(H, weight="weight", seed=i), weight="weight"))
        return out

    wnull = cached("weighted-null", run_null)
    z, _ = netlib.z_and_p(float(np.mean(wqs)), wnull)
    return {
        "strength": s,
        "spearman": r3(rho),
        "fit": {"slope": r3(b), "intercept": r3(a)},
        "top": {v: {"degreeRank": by_deg.index(v) + 1, "strengthRank": by_str.index(v) + 1, "degree": deg[v], "strength": s[v]}
                for v in set(by_str[:10] + outliers + ["Aristotle", "Diogenes_Laertius"])},
        "topStrength": by_str[:10],
        "outliers": outliers,
        "weightRange": [int(min(wcount)), int(max(wcount))],
        "weightOne": wcount[1],
        "strongest": [{"a": u, "b": v, "w": w} for u, v, w in strongest],
        "humeMarx": hm,
        "louvain": {"nComm": [len(set(r)) for r in wruns], "qs": [r4(q) for q in wqs], "qMean": r4(np.mean(wqs)),
                    "nmiMin": r3(min(woff)), "nmiMax": r3(max(woff)),
                    "consensus": walign, "consensusN": len(set(wcons)),
                    "nmiVsUnweighted": r3(netlib.nmi(wcons, cons)),
                    "nmiRunsVsUnweightedConsensus": [r3(netlib.nmi(r, cons)) for r in wruns],
                    "movers": sorted(movers, key=lambda v: (-deg[v], v)), "nMovers": len(movers)},
        "weightNull": {"mean": r4(np.mean(wnull)), "sd": r4(np.std(wnull)), "z": round(z, 1), "n": N_NULL},
    }


# ----------------------------------------------------------------------
# 7. Disparity filter (Serrano, Boguñá & Vespignani 2009), from the formula
# ----------------------------------------------------------------------
def disparity_pvalues(G):
    """alpha_ij for each end: (1 - w/s_i)^(k_i - 1). A degree-1 end has
    exponent 0, i.e. p = 1: a single link can never be significant for it.
    A link is kept at level alpha if it is significant at either end."""
    s = dict(G.degree(weight="weight"))
    k = dict(G.degree())
    out = {}
    for u, v, w in G.edges(data="weight"):
        pu = (1 - w / s[u]) ** (k[u] - 1)
        pv = (1 - w / s[v]) ** (k[v] - 1)
        out[(u, v)] = (min(pu, pv), pu, pv)
    return out


def backbone_graph(pvals, alpha):
    return nx.Graph([e for e, (p, _, _) in pvals.items() if p < alpha])


def components_summary(H):
    cs = sorted(map(len, nx.connected_components(H)), reverse=True) if H.number_of_nodes() else [0]
    return cs


def analyze_backbone(GC, ids, deg, name, cons):
    pv = disparity_pvalues(GC)
    m = GC.number_of_edges()
    table = []
    for a in COURSE_ALPHAS:
        H = backbone_graph(pv, a)
        cs = components_summary(H)
        table.append({"alpha": a, "links": H.number_of_edges(), "share": r3(H.number_of_edges() / m),
                      "nodes": H.number_of_nodes(), "giant": cs[0]})
    thr = []
    for t in THRESHOLDS:
        H = nx.Graph([(u, v) for u, v, w in GC.edges(data="weight") if w >= t])
        thr.append({"w": t, "links": H.number_of_edges(), "nodes": H.number_of_nodes(), "giant": components_summary(H)[0]})
    B2 = backbone_graph(pv, 0.2)
    T3 = nx.Graph([(u, v) for u, v, w in GC.edges(data="weight") if w >= 3])
    only_filter = sorted(set(B2) - set(T3))
    strongest_tie = {v: max(GC[v][u]["weight"] for u in GC[v]) for v in only_filter}
    only_thresh = sorted(set(T3) - set(B2))
    # what each filter throws away: strongest dropped link
    dropped_filter = max(((u, v, w) for u, v, w in GC.edges(data="weight") if pv[(u, v)][0] >= 0.2), key=lambda e: e[2])
    moses = None
    if GC.has_edge("Aristotle", "Moses_of_Narbonne"):
        key = ("Aristotle", "Moses_of_Narbonne") if ("Aristotle", "Moses_of_Narbonne") in pv else ("Moses_of_Narbonne", "Aristotle")
        s = dict(GC.degree(weight="weight"))
        moses = {"w": GC["Aristotle"]["Moses_of_Narbonne"]["weight"], "sMoses": s["Moses_of_Narbonne"],
                 "kMoses": GC.degree("Moses_of_Narbonne"), "sAristotle": s["Aristotle"], "kAristotle": GC.degree("Aristotle"),
                 "pMoses": r4((1 - 2 / s["Moses_of_Narbonne"]) ** (GC.degree("Moses_of_Narbonne") - 1)),
                 "pAristotle": r4((1 - GC["Aristotle"]["Moses_of_Narbonne"]["weight"] / s["Aristotle"]) ** (GC.degree("Aristotle") - 1)),
                 "kept": pv[key][0] < 0.2}
        # the weight Aristotle's own side needs at alpha = 0.2
        kA, sA = GC.degree("Aristotle"), s["Aristotle"]
        need = 1 - 0.2 ** (1 / (kA - 1))
        moses["aristotleNeedsShare"] = r4(need)
        moses["aristotleNeedsWeight"] = math.floor(need * sA) + 1

    # fine sweep by union–find: add links in increasing p (= raising alpha)
    order = sorted(pv.items(), key=lambda kv: kv[1][0])
    parent, size = {}, {}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    comp_sizes = Counter()
    grid = np.round(np.arange(SWEEP_STEP, SWEEP_MAX + 1e-9, SWEEP_STEP), 3)
    sweep, gi, links, hinges = [], 0, 0, []
    for (u, v), (p, _, _) in order + [((None, None), (2.0, 0, 0))]:
        while gi < len(grid) and grid[gi] <= p:
            top2 = comp_sizes.most_common(2)  # (root, size) pairs
            sweep.append([float(grid[gi]), links, len(parent), top2[0][1] if top2 else 0,
                          top2[1][1] if len(top2) > 1 else 0])
            gi += 1
        if u is None:
            break
        for x in (u, v):
            if x not in parent:
                parent[x] = x
                size[x] = 1
                comp_sizes[x] = 1
        ru, rv = find(u), find(v)
        links += 1
        if ru != rv:
            if size[ru] < size[rv]:
                ru, rv = rv, ru
            cur_max = comp_sizes.most_common(1)[0][1]
            small, big_ = size[rv], size[ru]
            if big_ == cur_max and small >= 10 and p <= SWEEP_MAX:
                hinges.append({"alpha": r4(p), "pRaw": p, "a": u, "b": v, "joins": small, "giantBefore": big_, "giantAfter": big_ + small})
            parent[rv] = ru
            size[ru] += size[rv]
            comp_sizes[ru] = size[ru]
            del comp_sizes[rv]

    # Who each hinge detaches: just below the hinge link's own p it is gone,
    # and the smaller of its two endpoints' components is the detached group.
    cons_of = dict(zip(ids, cons))
    for h in hinges:
        # every link at or below the hinge's p (ties included) except the hinge itself
        Hh = nx.Graph([e for e, (p, _, _) in pv.items() if p <= h["pRaw"] and set(e) != {h["a"], h["b"]}])
        Hh.add_nodes_from((h["a"], h["b"]))
        ca = nx.node_connected_component(Hh, h["a"])
        cb = nx.node_connected_component(Hh, h["b"])
        h["soleBridge"] = h["b"] not in ca
        grp = ca if len(ca) <= len(cb) else cb
        ms = sorted(grp, key=lambda v: (-deg[v], v))
        h["group"] = {"size": len(grp), "top": ms[:4],
                      "louvain": int(Counter(cons_of[v] for v in grp).most_common(1)[0][0])}
        h["detachedSide"] = h["a"] if h["a"] in grp else h["b"]
        del h["pRaw"]

    # The break: the alpha where the second-largest component peaks (the
    # finite-size signature of a percolation transition), searched <= 0.5.
    rows = [r for r in sweep if r[0] <= 0.5]
    br = max(rows, key=lambda r: (r[4], -r[0]))
    alpha_break = br[0]
    # just above the break there is a giant again; find its articulation
    # points and the one whose removal leaves the smallest largest piece.
    above = next(r for r in rows if r[0] > alpha_break and r[3] >= 2 * r[4])
    alpha_above = above[0]
    Hb = backbone_graph(pv, alpha_above + 1e-12)
    gc_nodes = max(nx.connected_components(Hb), key=len)
    Hg = Hb.subgraph(gc_nodes).copy()
    arts = []
    for a in nx.articulation_points(Hg):
        Hx = Hg.copy()
        Hx.remove_node(a)
        pieces = sorted(map(len, nx.connected_components(Hx)), reverse=True)
        arts.append({"node": a, "largestAfter": pieces[0], "pieces": pieces[:4], "nPieces": len(pieces), "degreeInBackbone": Hg.degree(a)})
    arts.sort(key=lambda d: (d["largestAfter"], d["node"]))
    breaker = arts[0] if arts else None
    if breaker:
        bn = breaker["node"]
        # which of the breaker's backbone links carry the split: name the pieces
        Hx = Hg.copy()
        Hx.remove_node(bn)
        comps = sorted(nx.connected_components(Hx), key=len, reverse=True)
        piece_info = []
        for c in comps[:3]:
            ms = sorted(c, key=lambda v: (-deg[v], v))
            nbrs = sorted([u for u in Hg[bn] if u in c], key=lambda v: (-deg[v], v))
            piece_info.append({"size": len(c), "top": ms[:4], "viaNeighbors": nbrs[:4],
                               "louvain": int(Counter(dict(zip(ids, cons))[v] for v in c).most_common(1)[0][0])})
        breaker["piecesInfo"] = piece_info

    idx = {v: i for i, v in enumerate(ids)}
    edges = [[idx[u], idx[v], int(GC[u][v]["weight"])] for u, v in GC.edges()]
    eindex = {(u, v): i for i, (u, v) in enumerate(GC.edges())}
    three = {str(a): [eindex[e] for e, (p, _, _) in pv.items() if p < a] for a in FIGURE_ALPHAS}
    return {
        "pv": pv, "edges": edges, "three": three,
        "table": table, "thresholds": thr,
        "filterVsThreshold": {"onlyFilter": len(only_filter), "onlyThreshold": len(only_thresh),
                              "onlyFilterStrongestTie": dict(Counter(strongest_tie.values())),
                              "mosesAmongThem": "Moses_of_Narbonne" in only_filter,
                              "strongestDroppedByFilter": {"a": dropped_filter[0], "b": dropped_filter[1], "w": dropped_filter[2]},
                              "aristotleNewtonWeight": GC["Aristotle"]["Isaac_Newton"]["weight"] if GC.has_edge("Aristotle", "Isaac_Newton") else None},
        "moses": moses,
        "sweep": sweep,
        "hinges": sorted(hinges, key=lambda h: -h["alpha"]),
        "break": {"alpha": alpha_break, "secondLargest": br[4], "giantAtBreak": br[3],
                  "alphaAbove": alpha_above, "giantAbove": above[3], "secondAbove": above[4],
                  "breaker": breaker, "articulationTop": arts[:6]},
    }


# ----------------------------------------------------------------------
# 8. Layout of the backbone
# ----------------------------------------------------------------------
def compute_layout(GC, pv):
    """Drawing rule 2 — lay out the backbone, not the full network:
      1. ForceAtlas2 on the giant component of the alpha = 0.2 backbone,
         scaled to width 1000;
      2. the backbone's small components, each laid out on its own, packed on
         a shelf underneath (largest first);
      3. philosophers outside the alpha = 0.2 backbone (they only join at
         looser alpha, or never) are placed at the barycentre of their
         already-placed neighbours in the full network, plus a small jitter.
    Only step 1 and 2 use links, and only backbone links."""
    def run():
        rng = np.random.default_rng(RNG_SEED)
        B = backbone_graph(pv, MAIN_ALPHA)
        comps = sorted(nx.connected_components(B), key=lambda c: (-len(c), min(c)))
        giant = B.subgraph(comps[0]).copy()
        p = nx.forceatlas2_layout(giant, max_iter=500, seed=RNG_SEED)
        arr = np.array([p[v] for v in giant])
        lo, hi = arr.min(axis=0), arr.max(axis=0)
        scale = 1000 / float(hi[0] - lo[0])
        pos = {v: (np.array(p[v]) - lo) * scale for v in giant}
        height = float((hi[1] - lo[1]) * scale)

        # shelf of small components
        x, y, row_h = 0.0, height + 60, 0.0
        for c in comps[1:]:
            H = B.subgraph(c)
            r = 9 * math.sqrt(len(c))
            sp = nx.spring_layout(H, seed=RNG_SEED) if len(c) > 1 else {next(iter(c)): np.zeros(2)}
            w = 2 * r + 16
            if x + w > 1000:
                x, y, row_h = 0.0, y + row_h, 0.0
            for v in c:
                pos[v] = np.array([x + r + 8, y + r + 8]) + np.array(sp[v]) * r
            x += w
            row_h = max(row_h, w)

        # everyone else: barycentre of placed neighbours in the full network
        rest = [v for v in sorted(GC) if v not in pos]
        for _ in range(60):
            if not rest:
                break
            placed_now = []
            for v in rest:
                nb = [pos[u] for u in GC[v] if u in pos]
                if nb:
                    placed_now.append((v, np.mean(nb, axis=0) + rng.normal(0, 6, 2)))
            for v, q in placed_now:
                pos[v] = q
            rest = [v for v in rest if v not in pos]
        return {v: [round(float(q[0]), 1), round(float(q[1]), 1)] for v, q in pos.items()}

    return cached("layout-v2", run)


# ----------------------------------------------------------------------
# 9. Figures
# ----------------------------------------------------------------------
def community_colors(comm_rows):
    colors, legend = {}, []
    ci = 0
    for row in comm_rows:
        if row["size"] >= MIN_COLORED and ci < len(PALETTE):
            colors[row["id"]] = PALETTE[ci]
            legend.append({"id": row["id"], "color": PALETTE[ci], "label": row["label"], "size": row["size"]})
            ci += 1
        else:
            colors[row["id"]] = GREY
    return colors, legend


def save_figures(ctx):
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
    name, ids, pos, colors = ctx["name"], ctx["ids"], ctx["pos"], ctx["colors"]
    lv, nulls, mnulls = ctx["louvain"], ctx["nulls"], ctx["marvelNulls"]

    # fig1 — NMI matrix
    fig, ax = plt.subplots(figsize=(5.2, 4.4))
    im = ax.imshow(np.array(lv["nmi"]), cmap="viridis", vmin=0.6, vmax=1.0)
    ax.set_xticks(range(10)); ax.set_yticks(range(10))
    ax.set_xlabel("Louvain seed"); ax.set_ylabel("Louvain seed")
    for i in range(10):
        for j in range(10):
            if i != j:
                ax.text(j, i, f"{lv['nmi'][i][j]:.2f}", ha="center", va="center", fontsize=6.5,
                        color="white" if lv["nmi"][i][j] < 0.8 else "black")
    fig.colorbar(im, ax=ax, label="NMI")
    ax.set_title("Agreement between ten Louvain runs (philosophers)")
    fig.tight_layout(); fig.savefig(FIG_DIR / "fig1_nmi_matrix.png", dpi=150); plt.close(fig)

    # fig2 — Q against its nulls, both networks
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.4), sharex=True)
    for ax, (title, nl) in zip(axes, [("Philosophers", nulls), ("Marvel", mnulls)]):
        for yi, (key, lab_, col) in enumerate([("config", "configuration model", "#56B4E9"),
                                               ("swap", "double-edge swap", "#009E73"), ("gnm", "G(n, m)", "#CC79A7")]):
            vals = nl[key]["values"]
            ax.scatter(vals, np.full(len(vals), yi) + np.random.default_rng(yi).uniform(-0.15, 0.15, len(vals)),
                       s=12, color=col, alpha=0.8, label=lab_)
        ax.axvspan(nl["realMin"], nl["realMax"], color="#D55E00", alpha=0.25)
        ax.axvline(nl["realMean"], color="#D55E00", lw=2, label="real (10 seeds)")
        ax.set_yticks([0, 1, 2]); ax.set_yticklabels(["config.", "swap", "G(n,m)"])
        ax.set_title(f"{title}: real Q {nl['realMean']:.3f}, z = {nl['config']['z']:.0f}")
        ax.set_xlabel("Louvain modularity Q (unweighted)")
    axes[0].legend(fontsize=7, loc="upper center", frameon=False)
    fig.tight_layout(); fig.savefig(FIG_DIR / "fig2_modularity_vs_nulls.png", dpi=150); plt.close(fig)

    # fig3 — Louvain (consensus) vs Infomap contingency
    info = ctx["infomap"]
    lv_rows = [r["id"] for r in ctx["commRows"] if r["size"] >= MIN_COLORED]
    im_rows = [m_["id"] for m_ in info["modules"] if m_["size"] >= 15]
    Mx = np.zeros((len(lv_rows) + 1, len(im_rows) + 1))
    li = {c: i for i, c in enumerate(lv_rows)}
    mi = {c: i for i, c in enumerate(im_rows)}
    for a, b, n in info["contingency"]:
        Mx[li.get(a, len(lv_rows)), mi.get(b, len(im_rows))] += n
    fig, ax = plt.subplots(figsize=(10, 4.8))
    ax.imshow(np.log1p(Mx), cmap="magma_r", aspect="auto")
    for i in range(Mx.shape[0]):
        for j in range(Mx.shape[1]):
            if Mx[i, j]:
                ax.text(j, i, int(Mx[i, j]), ha="center", va="center", fontsize=6.5,
                        color="white" if Mx[i, j] > 60 else "black")
    ax.set_yticks(range(len(lv_rows) + 1))
    ax.set_yticklabels([f"{ctx['commLabel'][c]}'s" for c in lv_rows] + ["small groups"], fontsize=8)
    mods = {m_["id"]: m_ for m_ in info["modules"]}
    ax.set_xticks(range(len(im_rows) + 1))
    ax.set_xticklabels([mods[c]["label"] for c in im_rows] + ["other"], rotation=60, ha="right", fontsize=7)
    ax.set_ylabel("Louvain consensus community"); ax.set_xlabel("Infomap module (named after highest-degree member)")
    ax.set_title(f"Louvain vs Infomap on the philosophers' giant component (NMI {info['nmiVsConsensus']:.2f})")
    fig.tight_layout(); fig.savefig(FIG_DIR / "fig3_louvain_vs_infomap.png", dpi=150); plt.close(fig)

    # fig4 — Aristotle's links: by link community (left) and by the Louvain
    # community of the philosopher at the other end (right), same order.
    ego = ctx["linkcomm"]["ego"]["Aristotle"]
    lcs = ctx["linkcomm"]["communities"]
    top_c = [c["id"] for c in ego["communities"][:5]]
    # own hues (viridis), so they can't be confused with the Louvain colours on the right
    cmap = {c: matplotlib.colors.to_hex(plt.cm.viridis(x)) for c, x in zip(top_c, (0.05, 0.3, 0.55, 0.75, 0.95))}
    cons_of = ctx["consOf"]
    rank = {r["id"]: i for i, r in enumerate(ctx["commRows"])}
    links = sorted(ego["links"], key=lambda l: (top_c.index(l["c"]) if l["c"] in top_c else (98 if l["c"] >= 0 else 99),
                                                rank[cons_of[l["n"]]], -l["w"]))
    ang = np.linspace(np.pi / 2, np.pi / 2 - 2 * np.pi, len(links), endpoint=False)
    fig, axes = plt.subplots(1, 2, figsize=(11, 6.6))
    for ax, mode in zip(axes, ("link", "louvain")):
        for a_, l in zip(ang, links):
            if mode == "link":
                col = cmap.get(l["c"], "#b9bec6" if l["c"] >= 0 else "#e3e6ea")
            else:
                col = colors[cons_of[l["n"]]]
            ax.plot([0, np.cos(a_)], [0, np.sin(a_)], color=col, lw=0.5 + 0.45 * l["w"], solid_capstyle="butt")
        ax.scatter([0], [0], s=150, color="black", zorder=3)
        ax.set_aspect("equal"); ax.axis("off")
    axes[0].set_title("coloured by link community", fontsize=10)
    axes[1].set_title("coloured by the neighbour's Louvain community", fontsize=10)

    def short(c):
        return " · ".join(name[v] for v in lcs[c]["top"] if v != "Aristotle")[:60]

    h0 = [plt.Line2D([0], [0], color=cmap[c], lw=4) for c in top_c] + \
         [plt.Line2D([0], [0], color="#b9bec6", lw=4), plt.Line2D([0], [0], color="#e3e6ea", lw=4)]
    other = sum(c["links"] for c in ego["communities"][5:])
    l0 = [f"{short(c['id'])}… ({c['links']})" for c in ego["communities"][:5]] + \
         [f"{len(ego['communities']) - 5} smaller link communities ({other})", f"no community ≥ 3 links ({ego['linksInSmallCommunities']})"]
    axes[0].legend(h0, l0, fontsize=6.5, loc="upper center", bbox_to_anchor=(0.5, 0.0), frameon=False)
    nb = Counter(cons_of[l["n"]] for l in links)
    h1 = [plt.Line2D([0], [0], color=colors[c], lw=4) for c, _ in nb.most_common()]
    l1 = [f"{ctx['commLabel'][c]}'s community ({n})" for c, n in nb.most_common()]
    axes[1].legend(h1, l1, fontsize=6.5, loc="upper center", bbox_to_anchor=(0.5, 0.0), frameon=False, ncol=2)
    fig.suptitle(f"Aristotle's {len(links)} links (line width = weight)", fontsize=12)
    fig.tight_layout(); fig.savefig(FIG_DIR / "fig4_aristotle_link_communities.png", dpi=150, bbox_inches="tight"); plt.close(fig)

    # fig5 — alpha sweep
    bb = ctx["backbone"]
    sw = np.array(bb["sweep"])
    n = len(ids)
    fig, ax = plt.subplots(figsize=(7.5, 3.8))
    ax.plot(sw[:, 0], sw[:, 2] / n, color="#56B4E9", label="philosophers attached")
    ax.plot(sw[:, 0], sw[:, 3] / n, color="#D55E00", lw=2, label="giant component")
    ax.plot(sw[:, 0], sw[:, 4] / n, color="#009E73", label="second-largest component")
    ax.plot(sw[:, 0], sw[:, 1] / ctx["m"], color="#999999", ls="--", label="links kept (share)")
    ax.axvline(bb["break"]["alpha"], color="black", ls=":", lw=1)
    ax.text(bb["break"]["alpha"] + 0.005, 0.9, f"break α ≈ {bb['break']['alpha']}", fontsize=8)
    ax.set_xlabel("disparity-filter significance level α"); ax.set_ylabel("share of giant component (1,374)")
    ax.set_xlim(0, 0.5); ax.legend(fontsize=8, frameon=False)
    ax.set_title("The backbone coming apart as α tightens")
    fig.tight_layout(); fig.savefig(FIG_DIR / "fig5_alpha_sweep.png", dpi=150); plt.close(fig)

    # fig6/fig7 — backbones following the five drawing rules
    strength = ctx["weights"]["strength"]
    top10 = ctx["weights"]["topStrength"]
    pv = bb["pv"]

    def draw(ax, alpha, labels=True):
        H = backbone_graph(pv, alpha)
        for u, v in H.edges():
            ax.plot([pos[u][0], pos[v][0]], [pos[u][1], pos[v][1]], color="#9aa0a6", lw=0.3, alpha=0.6, zorder=1)
        vs = list(H)
        ax.scatter([pos[v][0] for v in vs], [pos[v][1] for v in vs], s=[2 + 0.25 * strength[v] for v in vs],
                   c=[colors[ctx["consOf"][v]] for v in vs], edgecolors="white", linewidths=0.2, zorder=2)
        if labels:
            # greedy de-overlap: push a label down until it clears the ones placed before it
            placed = []
            for v in sorted([v for v in top10 if v in H], key=lambda v: pos[v][1]):
                lx, ly = pos[v][0], pos[v][1] - 22
                while any(abs(lx - px) < 150 and abs(ly - py) < 24 for px, py in placed):
                    ly += 24
                placed.append((lx, ly))
                ax.annotate(name[v], (pos[v][0], pos[v][1]), xytext=(lx, ly), fontsize=7, ha="center", zorder=3,
                            arrowprops=dict(arrowstyle="-", color="#555", lw=0.5),
                            bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="none", alpha=0.8))
        cs = components_summary(H)
        ax.set_title(f"α = {alpha}: {H.number_of_edges():,} links, {H.number_of_nodes():,} philosophers, giant {cs[0]:,}", fontsize=9)
        ax.set_aspect("equal"); ax.axis("off")
        ax.set_xlim(-20, 1020); ax.set_ylim(max(q[1] for q in pos.values()) + 20, -40)  # y down, like the page

    aspect = (max(q[1] for q in pos.values()) + 60) / 1040
    fig, axes = plt.subplots(1, 3, figsize=(15, 5 * aspect + 0.9))
    for ax, a in zip(axes, FIGURE_ALPHAS):
        draw(ax, a, labels=(a == MAIN_ALPHA))
    handles = [plt.Line2D([0], [0], marker="o", ls="", color=l["color"], markersize=7) for l in ctx["legend"]]
    fig.legend(handles, [f"{l['label']}'s community" for l in ctx["legend"]], loc="lower center", ncol=5, fontsize=8, frameon=False)
    fig.tight_layout(rect=(0, 0.07, 1, 1)); fig.savefig(FIG_DIR / "fig6_backbone_three_alphas.png", dpi=150); plt.close(fig)

    fig, ax = plt.subplots(figsize=(9, 9 * aspect + 0.6))
    draw(ax, MAIN_ALPHA)
    ax.legend(handles + [plt.Line2D([0], [0], marker="o", ls="", color=GREY, markersize=7)],
              [f"{l['label']}'s community" for l in ctx["legend"]] + ["smaller communities"],
              loc="upper right", fontsize=8, frameon=False)
    fig.tight_layout(); fig.savefig(FIG_DIR / "fig7_backbone_alpha_0.2.png", dpi=150); plt.close(fig)

    # fig8 — strength vs degree
    deg = ctx["deg"]
    fig, ax = plt.subplots(figsize=(5.8, 4.6))
    ax.scatter([deg[v] for v in ids], [strength[v] for v in ids], s=6, alpha=0.4, color="#0072B2")
    xs = np.array([1, max(deg.values())])
    f = ctx["weights"]["fit"]
    ax.plot(xs, np.exp(f["intercept"]) * xs ** f["slope"], color="#999999", ls="--", lw=1, label="log–log fit")
    for v in ctx["weights"]["outliers"] + ["Aristotle"]:
        ax.annotate(name[v], (deg[v], strength[v]), fontsize=7, xytext=(4, 4), textcoords="offset points")
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("degree k"); ax.set_ylabel("strength s (summed weights)")
    ax.set_title(f"Strength vs degree (Spearman {ctx['weights']['spearman']:.2f})")
    ax.legend(fontsize=8, frameon=False)
    fig.tight_layout(); fig.savefig(FIG_DIR / "fig8_strength_vs_degree.png", dpi=150); plt.close(fig)


# ----------------------------------------------------------------------
# 10. The LLM box
# ----------------------------------------------------------------------
def llm_grading(lv, nulls, mnulls, weights, meta_nmi, n_comm_seed0):
    paragraph = (
        f"Running the Louvain algorithm on the philosopher network reveals {n_comm_seed0} clear communities with a "
        f"modularity of {lv['q0']:.2f}, which indicates strong community structure since values above 0.3 are "
        f"considered significant. These communities correspond to the major schools of Western and Eastern thought: "
        f"Ancient Greek philosophy, Medieval Scholasticism, German Idealism, the Enlightenment, Islamic philosophy, "
        f"Indian philosophy and Chinese philosophy. Using edge weights sharpens the picture further, raising the "
        f"modularity to {weights['louvain']['qMean']:.2f}. This proves that the history of philosophy naturally "
        f"divides into {n_comm_seed0} distinct schools."
    )
    ann = [
        {"claim": f"\"a modularity of {lv['q0']:.2f}, which indicates strong community structure since values above 0.3 are considered significant\"",
         "verdict": "Wrong reasoning, right conclusion — no null.",
         "why": f"0.3 is a rule of thumb, not a test. Louvain finds Q = {nulls['config']['mean']:.2f} on a degree-preserving "
                f"shuffle of this very network, so the honest number is the gap ({nulls['config']['diff']:.2f}, z ≈ {nulls['config']['z']:.0f}). "
                f"Marvel's Q = {mnulls['realMean']:.2f} would also 'pass' the 0.3 bar, but sits only {mnulls['config']['diff']:.2f} above its own null."},
        {"claim": f"\"reveals {n_comm_seed0} clear communities\"",
         "verdict": "One seed presented as the answer.",
         "why": f"Ten seeds give between {min(lv['nComm'])} and {max(lv['nComm'])} communities, and two runs agree at an NMI "
                f"as low as {min(lv['nmiOff']):.2f}. The number of communities is a property of the run, not of philosophy."},
        {"claim": "\"These communities correspond to the major schools … Islamic philosophy …\"",
         "verdict": "Names presented as findings.",
         "why": "The names are labels we attach to a partition afterwards. One community reliably puts Avicenna and Averroes "
                "next to Galileo and Copernicus in some runs — no one's syllabus — and the partition agrees with the century "
                f"lists at an NMI of only {meta_nmi['era']['consensus']:.2f}."},
        {"claim": f"\"Using edge weights … raising the modularity to {weights['louvain']['qMean']:.2f}\"",
         "verdict": "Weighted Q compared to unweighted Q.",
         "why": "Different questions with different ceilings: strong ties concentrate inside groups almost by definition. The weighted "
                f"Q has to be compared with its own null (weights shuffled over the same links: {weights['weightNull']['mean']:.2f}), not with the unweighted one."},
        {"claim": f"\"This proves that the history of philosophy naturally divides into {n_comm_seed0} distinct schools.\"",
         "verdict": "Descriptive method, inferential claim.",
         "why": "Modularity maximisation describes one good-looking partition of a hyperlink graph; it does not test whether "
                "groups generated the links (Peixoto). And it's a Wikipedia link network — it measures how editors cross-reference "
                "articles, not how ideas actually flowed."},
    ]
    return {"paragraph": paragraph, "prompt": "Write a short paragraph for a blog post about what the Louvain communities of the "
            "Wikipedia philosophers network tell us about the history of philosophy.", "annotations": ann}


# ----------------------------------------------------------------------
# main
# ----------------------------------------------------------------------
def main():
    global INPUT_HASH
    t_start = time.time()
    log("Philosophers Wikipedia network — Week 4 analysis pipeline")
    log("-" * 70)
    INPUT_HASH = input_hash()
    log(f"input hash {INPUT_HASH}; cache {'on' if USE_CACHE else 'OFF (--no-cache)'}")

    with timed("load"):
        nodes_df, edges_df, D, G, GC, m_nodes, MD, MG, MGC = load()
        roster = list(nodes_df["node_id"])
        name = dict(zip(nodes_df["node_id"], nodes_df["name"]))
        url = dict(zip(nodes_df["node_id"], nodes_df["url"]))
        era = dict(zip(nodes_df["node_id"], nodes_df["era"]))
        subf = dict(zip(nodes_df["node_id"], nodes_df["subfields"].fillna("none")))
        ids = sorted(GC)  # giant-component order used by every partition
        deg = dict(GC.degree())
        m = GC.number_of_edges()
        log(f"  philosophers: {G.number_of_nodes()} nodes, {D.number_of_edges()} directed edges, "
            f"{G.number_of_edges()} undirected links; giant {GC.number_of_nodes()} / {m}")
        log(f"  marvel: {MG.number_of_nodes()} nodes, giant {MGC.number_of_nodes()} / {MGC.number_of_edges()}")

    with timed("validate own NMI + modularity"):
        test = [netlib.partition_to_labels(nx.community.louvain_communities(GC, weight=None, seed=s), ids) for s in (0, 1)]
        nmi_ours, nmi_sk = netlib.nmi(*test), normalized_mutual_info_score(*test)
        q_ours = netlib.modularity(GC, dict(zip(ids, test[0])))
        groups = defaultdict(set)
        for v, c in zip(ids, test[0]):
            groups[c].add(v)
        q_nx = nx.community.modularity(GC, list(groups.values()), weight=None)
        assert abs(nmi_ours - nmi_sk) < 1e-9 and abs(q_ours - q_nx) < 1e-9
        validation = {"nmiOurs": nmi_ours, "nmiSklearn": nmi_sk, "qOurs": q_ours, "qNetworkx": q_nx}

    with timed("louvain x10 + consensus"):
        lv = analyze_louvain(GC, ids, name, deg)
        cons = lv["consensus"]
        comm_rows = community_table(cons, ids, deg, name)
        colors, legend = community_colors(comm_rows)
        cons_of = dict(zip(ids, cons))
        seed0_rows = community_table(lv["runs"][0], ids, deg, name)

    with timed("modularity nulls (philosophers + Marvel)"):
        nulls = summarize_nulls(lv["qs"], null_ensemble(GC, "phil"), m)
        mids = sorted(MGC)
        mruns, mqs = louvain_runs(MGC, mids)
        mnulls = summarize_nulls(mqs, null_ensemble(MGC, "marvel"), MGC.number_of_edges())
        moff = [netlib.nmi(mruns[i], mruns[j]) for i, j in itertools.combinations(range(10), 2)]
        mnulls.update({"n": MGC.number_of_nodes(), "nComm": [len(set(r)) for r in mruns], "q": [r4(q) for q in mqs],
                       "nmiMatrix": [[1.0 if i == j else r3(netlib.nmi(mruns[i], mruns[j])) for j in range(10)] for i in range(10)],
                       "nmi01": r3(netlib.nmi(mruns[0], mruns[1])), "nmiMin": r3(min(moff)), "nmiMax": r3(max(moff))})

    with timed("metadata + greedy"):
        mv = load_movements(nodes_df)
        movs = mv["movements"] if "movements" in mv else mv
        qid = dict(zip(nodes_df["node_id"], nodes_df["wikidata_id"]))
        mov_freq = Counter(x for v in ids for x in movs.get(qid.get(v), []))
        mov_nodes = [v for v in ids if movs.get(qid.get(v))]
        mov_label = {v: max(movs[qid[v]], key=lambda x: (mov_freq[x], x)) for v in mov_nodes}
        mi = [ids.index(v) for v in mov_nodes]

        def meta_block(labels_fn, subset=None):
            sel = subset if subset is not None else list(range(len(ids)))
            truth = [labels_fn(ids[i]) for i in sel]
            per = [normalized_mutual_info_score([r[i] for i in sel], truth) for r in lv["runs"]]
            return {"consensus": r3(normalized_mutual_info_score([cons[i] for i in sel], truth)),
                    "seed0": r3(per[0]), "min": r3(min(per)), "max": r3(max(per)), "n": len(sel),
                    "amiConsensus": r3(adjusted_mutual_info_score([cons[i] for i in sel], truth))}

        meta_nmi = {"era": meta_block(lambda v: era[v]), "subfields": meta_block(lambda v: subf[v]),
                    "movement": meta_block(lambda v: mov_label[v], mi),
                    "movementFetchedAt": mv.get("fetchedAt"), "movementLabelled": len(mov_nodes),
                    "movementLabelledAll": sum(1 for v in roster if movs.get(qid.get(v)))}
        greedy = nx.community.greedy_modularity_communities(GC)
        glab = netlib.partition_to_labels(greedy, ids)
        greedy_rows = community_table(glab, ids, deg, name)
        greedy_out = {"nComm": len(greedy), "q": r3(nx.community.modularity(GC, greedy, weight=None)),
                      "sizes": [r["size"] for r in greedy_rows], "nmiVsConsensus": r3(netlib.nmi(glab, cons)),
                      "blobs": [{"size": r["size"], "top": [name[v] for v in r["top"]]} for r in greedy_rows[:3]]}

    with timed("infomap"):
        info = analyze_infomap(GC, D, ids, cons, deg, name)
        info["amiMovement"] = r3(adjusted_mutual_info_score([info["labels"][i] for i in mi], [mov_label[ids[i]] for i in mi]))
        info["amiEra"] = r3(adjusted_mutual_info_score(info["labels"], [era[v] for v in ids]))
        info["nmiMovement"] = r3(normalized_mutual_info_score([info["labels"][i] for i in mi], [mov_label[ids[i]] for i in mi]))
        info["nmiEra"] = r3(normalized_mutual_info_score(info["labels"], [era[v] for v in ids]))

    with timed("k-clique communities"):
        kc = analyze_kcliques(GC, ids, deg, name)

    with timed("link communities"):
        lc = analyze_link_communities(GC, ids, deg, name, cons)

    with timed("weights + weighted louvain"):
        weights = analyze_weights(GC, ids, deg, name, cons)

    with timed("resolution"):
        res_runs, res_qs = louvain_runs(GC, ids, resolution=2.0)
        wres_runs, _ = louvain_runs(GC, ids, weight="weight", resolution=2.0)
        legal = kc["legalists"]
        legal_home = None
        if legal:
            c = Counter(cons_of[v] for v in legal["members"]).most_common(1)[0][0]
            legal_home = {"community": int(c), "label": next(r["label"] for r in comm_rows if r["id"] == c),
                          "allInIt": all(cons_of[v] == c for v in legal["members"])}
        resolution = {"sqrt2m": r3(math.sqrt(2 * m)), "gamma2Unweighted": [len(set(r)) for r in res_runs],
                      "gamma2Weighted": [len(set(r)) for r in wres_runs], "legalists": legal, "legalistsHome": legal_home}

    with timed("disparity filter + alpha sweep"):
        bb = analyze_backbone(GC, ids, deg, name, cons)

    with timed("layout"):
        pos = compute_layout(GC, bb["pv"])

    with timed("figures"):
        lv_out_for_fig = {"nmi": lv["nmi"]}
        save_figures({"name": name, "ids": ids, "pos": pos, "colors": colors, "legend": legend, "louvain": lv_out_for_fig,
                      "nulls": nulls, "marvelNulls": mnulls, "infomap": info, "commRows": comm_rows,
                      "commLabel": {r["id"]: r["label"] for r in comm_rows}, "linkcomm": lc, "backbone": bb,
                      "weights": weights, "consOf": cons_of, "deg": deg, "m": m})

    # ------------------------------------------------------------ JSON
    gi = {v: i for i, v in enumerate(ids)}
    lv_summary = {"nComm": [len(set(r)) for r in lv["runs"]], "q0": lv["qs"][0], "nmiOff": lv["nmiOff"]}
    llm = llm_grading(lv_summary, nulls, mnulls, weights, meta_nmi, len(set(lv["runs"][0])))

    def lists_by_node(d):
        return [sorted(d.get(v, [])) for v in ids]

    # sanity table: ours vs the numbers on the course page
    t = {r["alpha"]: r for r in bb["table"]}
    th = {r["w"]: r for r in bb["thresholds"]}
    kt = {r["k"]: r for r in kc["table"]}
    s = weights["strength"]
    sanity = [
        ("nodes / directed edges", f"{G.number_of_nodes()} / {D.number_of_edges()}", "1444 / 11135"),
        ("undirected links; giant component", f"{G.number_of_edges()}; {GC.number_of_nodes()} nodes, {m} links", "9140; 1374 nodes, 9139 links"),
        ("weights (both directions summed); links with w = 1", f"{weights['weightRange'][0]}–{weights['weightRange'][1]}; {weights['weightOne']}", "1–24; 5899"),
        ("Louvain, ten seeds: communities; Q", f"{min(lv_summary['nComm'])}–{max(lv_summary['nComm'])}; {min(lv['qs']):.3f}–{max(lv['qs']):.3f}", "8–10; 0.500–0.508"),
        ("NMI seeds 0 vs 1; all 45 pairs", f"{lv['nmi'][0][1]:.2f}; {min(lv['nmiOff']):.2f}–{max(lv['nmiOff']):.2f}", "0.76; 0.65–0.83"),
        ("degree-preserving null Q (20)", f"{nulls['config']['mean']:.3f} ± {nulls['config']['sd']:.3f} (configuration model)", "0.228 ± 0.002"),
        ("G(n, m) null Q", f"{nulls['gnm']['mean']:.3f}", "0.233"),
        ("greedy modularity", f"{greedy_out['nComm']} communities, Q = {greedy_out['q']:.3f}, blobs {', '.join(map(str, greedy_out['sizes'][:3]))}", "15, 0.416, 550 / 481 / 262"),
        ("NMI vs era; vs Wikidata movement", f"{meta_nmi['era']['seed0']:.2f}; {meta_nmi['movement']['seed0']:.2f} ({meta_nmi['movement']['n']} labelled)", "0.40; 0.49 (315)"),
        ("Marvel: Q; shuffled; NMI two runs", f"{mnulls['realMean']:.2f}; {mnulls['config']['mean']:.2f} (swap {mnulls['swap']['mean']:.2f}); {mnulls['nmi01']:.2f}", "0.38; 0.25; 0.59"),
        ("k-clique k = 3 / 4 / 5 / 6 (communities, largest, placed, ≥2)",
         " · ".join(f"{kt[k]['communities']}/{kt[k]['largest']}/{kt[k]['placed']}/{kt[k]['inTwoOrMore']}" for k in (3, 4, 5, 6)),
         "19/1155/1189/29 · 36/817/909/86 · 40/467/555/112 · 39/171/304/86"),
        ("k = 5 memberships: Aristotle; Augustine, Aquinas, Nietzsche",
         f"{len(kc['membership'][5].get('Aristotle', []))}; " + ", ".join(str(len(kc['membership'][5].get(v, []))) for v in ("Augustine_of_Hippo", "Thomas_Aquinas", "Friedrich_Nietzsche")), "6; 5, 5, 5"),
        ("strength vs degree Spearman; Aristotle k, s", f"{weights['spearman']:.2f}; {deg['Aristotle']}, {s['Aristotle']}", "0.96; 300, 521"),
        ("Diogenes Laertius degree rank (k); strength rank (s)",
         f"{weights['top']['Diogenes_Laertius']['degreeRank']} ({deg['Diogenes_Laertius']}); {weights['top']['Diogenes_Laertius']['strengthRank']} ({s['Diogenes_Laertius']})", "15 (91); 5 (230)"),
        ("strongest ties", ", ".join(f"{name[e['a']]}–{name[e['b']]} {e['w']}" for e in weights["strongest"][:3]), "Erasmus–More 24, Adams–Jefferson 22, Whitehead–Russell 19"),
        ("Hume–Marx", f"{weights['humeMarx']['hops']} hops ({weights['humeMarx']['middlemen']} middlemen); weighted {' → '.join(name[v] for v in weights['humeMarx']['weightedPath'])} ({', '.join(map(str, weights['humeMarx']['weightedPathWeights']))})",
         "2 hops (22); Hume → Kant → Hegel → Marx (7, 7, 10)"),
        ("weighted Louvain", f"{min(weights['louvain']['nComm'])}–{max(weights['louvain']['nComm'])} communities, weighted Q {min(weights['louvain']['qs']):.2f}–{max(weights['louvain']['qs']):.2f}", "9, 0.55"),
        ("disparity α = 0.05 / 0.1 / 0.2 / 0.3 / 0.5 (links, nodes, giant)",
         " · ".join(f"{t[a]['links']}/{t[a]['nodes']}/{t[a]['giant']}" for a in COURSE_ALPHAS),
         "292/348/116 · 649/607/419 · 1540/950/816 · 2549/1111/1052 · 5641/1284/1270"),
        ("thresholds w ≥ 2 / 3 / 4 (links); w ≥ 3 nodes", f"{th[2]['links']} / {th[3]['links']} / {th[4]['links']}; {th[3]['nodes']}", "3240 / 1572 / 785; 863"),
        ("kept by α = 0.2, dropped by w ≥ 3", str(bb["filterVsThreshold"]["onlyFilter"]), "112"),
        ("Moses of Narbonne: (1 − 2/11)^9", f"{bb['moses']['pMoses']:.2f}, kept = {bb['moses']['kept']}", "0.16, kept"),
        ("resolution: √(2m); γ = 2", f"{math.sqrt(2 * m):.0f}; {min(resolution['gamma2Unweighted'])}–{max(resolution['gamma2Unweighted'])} communities (unweighted), "
                                      f"{min(resolution['gamma2Weighted'])}–{max(resolution['gamma2Weighted'])} (weighted)", "≈ 135; 16 instead of 9"),
        ("link communities, single cut: D; communities ≥ 3 links", f"{lc['summary']['bestD']:.3f}; {lc['summary']['nAtLeast3']}", "0.054; 444"),
    ]

    comm_label = {r["id"]: r["label"] for r in comm_rows}
    output = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "inputHash": INPUT_HASH,
            "files": {
                "philosophersNodes": "data/raw/week4_philosophers_nodes.tsv",
                "philosophersEdges": "data/raw/week4_philosophers_edges.tsv",
                "marvelNodes": "data/raw/week1_nodes.tsv",
                "marvelEdgesWeighted": "data/raw/week4_edges_weighted.tsv",
                "movementCache": "data/raw/week4_wikidata_movement_cache.json",
            },
            "snapshots": {"philosophers": snapshot_line(PHIL_NODES), "marvelWeighted": snapshot_line(MARVEL_EDGES)},
            "datasetNote": ("Downloaded from the course data page on 2026-09-23; the page still lists the 2026-09-15 "
                            "philosophers snapshot (1,444 nodes, 11,135 directed edges) and the 2026-09-06 weighted Marvel "
                            "edges, byte-identical to the copies handed out in class. No newer snapshot has been published."),
            "courseWeekUrl": COURSE_WEEK_URL, "dataPageUrl": DATA_PAGE_URL,
            "params": {"seeds": SEEDS, "nNull": N_NULL, "consensusTau": CONSENSUS_TAU, "infomapSeeds": INFOMAP_SEEDS,
                       "infomapTrialsMain": 10, "courseAlphas": COURSE_ALPHAS, "figureAlphas": FIGURE_ALPHAS,
                       "mainAlpha": MAIN_ALPHA, "sweepStep": SWEEP_STEP, "minColored": MIN_COLORED, "rngSeed": RNG_SEED},
            "timings": TIMINGS,
        },
        "graph": {"n": G.number_of_nodes(), "mDirected": D.number_of_edges(), "mUndirected": G.number_of_edges(),
                  "nGiant": GC.number_of_nodes(), "mGiant": m, "notInGiant": G.number_of_nodes() - GC.number_of_nodes()},
        "sanity": [{"what": a, "ours": b, "course": c} for a, b, c in sanity],
        "validation": validation,
        "nodes": {
            "id": ids, "name": [name[v] for v in ids], "url": [url[v] for v in ids], "era": [era[v] for v in ids],
            "degree": [deg[v] for v in ids], "strength": [s[v] for v in ids],
            "x": [pos[v][0] for v in ids], "y": [pos[v][1] for v in ids],
        },
        "roster": {"notInGiant": sorted(v for v in roster if v not in GC)},
        "communities": {"rows": comm_rows, "legend": legend, "grey": GREY, "palette": PALETTE,
                        "colorOf": {str(k): v for k, v in colors.items()}},
        "louvain": {
            "seeds": SEEDS, "nComm": lv_summary["nComm"], "q": [r4(q) for q in lv["qs"]],
            "nmi": [[r3(x) for x in row] for row in lv["nmi"]], "nmiMin": r3(min(lv["nmiOff"])), "nmiMax": r3(max(lv["nmiOff"])),
            "nmi01": r3(lv["nmi"][0][1]),
            "labels": lv["runs"], "aligned": lv["aligned"],
            "consensus": cons, "consensusN": len(set(cons)), "consensusQ": r4(lv["consensusQ"]),
            "consensusIters": lv["consensusIters"], "consensusConverged": lv["consensusConverged"],
            "consensusNmiToRuns": [r3(x) for x in lv["consensusNmiToRuns"]],
            "stability": [r3(x) for x in lv["stability"]], "distinct": lv["distinct"],
            "pairs": lv["pairs"],
            "seed0": [{"size": r["size"], "label": r["label"]} for r in seed0_rows],
            "borderDwellers": sorted([v for v in ids if deg[v] >= 15], key=lambda v: (lv["stability"][gi[v]], -deg[v]))[:12],
            "neverMove": sum(1 for x in lv["stability"] if x is not None and x >= 0.999),
            "aristotleByRun": [comm_label.get(a, "a new community") for a in (al[gi["Aristotle"]] for al in lv["aligned"])],
        },
        "nulls": {"philosophers": nulls, "marvel": mnulls},
        "metadata": meta_nmi,
        "greedy": greedy_out,
        "infomap": info,
        "kclique": {"table": kc["table"], "communities": {str(k): v for k, v in kc["communities"].items()},
                    "membership": {str(k): lists_by_node(v) for k, v in kc["membership"].items()}},
        "linkcomm": {
            "summary": lc["summary"], "communities": lc["communities"],
            "membership": lists_by_node({v: sorted(c) for v, c in lc["perNode"].items()}),
            "ratio": [r3(lc["ratio"][v]) for v in ids], "covered": [lc["covered"][v] for v in ids],
            "bridges": lc["bridges"], "hubs": lc["hubs"],
            "aristotle": {**{k: v for k, v in lc["ego"]["Aristotle"].items() if k != "links"},
                          "links": [[gi[l["n"]], l["c"], l["w"]] for l in lc["ego"]["Aristotle"]["links"]]},
            "handful": [{"id": v, "degree": deg[v], "linkComms": len(lc["perNode"].get(v, [])), "ratio": r3(lc["ratio"][v]),
                         "k5": len(kc["membership"][5].get(v, [])), "stability": r3(lv["stability"][gi[v]])}
                        for v in ["Aristotle", "Plato", "Augustine_of_Hippo", "Thomas_Aquinas", "Immanuel_Kant",
                                  "Friedrich_Nietzsche", "Avicenna", "Galileo_Galilei", "Johannes_Kepler", "Jesus", "Ptolemy"] if v in gi],
        },
        "weights": {k: v for k, v in weights.items() if k != "strength"},
        "resolution": resolution,
        "backbone": {
            "edges": bb["edges"], "three": bb["three"], "table": bb["table"], "thresholds": bb["thresholds"],
            "filterVsThreshold": bb["filterVsThreshold"], "moses": bb["moses"], "sweep": bb["sweep"],
            "hinges": bb["hinges"], "break": bb["break"],
        },
        "llmGrading": llm,
    }
    TIMINGS["total"] = round(time.time() - t_start, 1)
    output["meta"]["timings"] = TIMINGS

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    log("-" * 70)
    log("Sanity checks (ours | course page):")
    for a, b, c in sanity:
        log(f"  {a}: {b} | {c}")
    log("-" * 70)
    log("Runtime summary:")
    for k, v in TIMINGS.items():
        log(f"  {k:<42} {v:>7.1f}s")
    log(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} ({OUTPUT_PATH.stat().st_size / 1024:.0f} KB) and figures in {FIG_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
