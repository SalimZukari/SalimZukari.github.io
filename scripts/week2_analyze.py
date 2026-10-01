"""
Marvel Wikipedia Network — Week 2 analysis pipeline ("The friendship paradox").

Reads the same frozen dataset as Weeks 1 and 3 (data/raw/week1_nodes.tsv,
data/raw/week1_edges.tsv) and computes the data behind the four figures on
weeks/week2.html:

  1. degree CCDF for BA(5000), a G(n,m) control matched to it, Marvel's
     largest component, and a G(n,m) control matched to Marvel
  2. person vs. random-friend degree, 1,000 sampled pairs per network
  3. each Marvel character's "out-popularity'd rate" (fraction of their
     friends at least as connected as they are)
  4. the null model: 500 degree-preserving double-edge-swap shuffles of
     Marvel, rerunning the same 1,000-pair sampling on each

This is a straight port of weeks/week2/week2_gonuts.ipynb (cells 1, 3, 5, 7,
8, 13, 16), which produced the original PNG figures. The notebook draws
every sample from one shared generator, np.random.default_rng(2026), so the
calls below run in exactly the notebook's order — reordering them changes
every sampled number. Histogram bins are computed here with np.histogram,
the same binning matplotlib's hist() used for the figures.

Nothing here hard-codes a result.

Usage:
    python scripts/week2_analyze.py
    (or: npm run analyze:week2)
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
NODES_PATH = RAW_DIR / "week1_nodes.tsv"
EDGES_PATH = RAW_DIR / "week1_edges.tsv"
OUTPUT_PATH = PROCESSED_DIR / "week2.json"

COURSE_EXERCISE_URL = "https://sunelehmann.com/socialgraphs2026-web/weeks/week2.html"

SEED = 2026  # the notebook's seed; the published figures depend on it
N_PAIRS = 1000
N_REALIZATIONS = 500
BA_N = 5000
RATE_BINS = 20
NULL_BINS = 30
SPIDER_MAN = "Spider-Man"


def log(msg=""):
    print(msg, flush=True)


def round4(x):
    return round(float(x), 4)


# ----------------------------------------------------------------------
# 1. Load — node roster first, so isolated characters are never dropped
# ----------------------------------------------------------------------
def load_marvel():
    if not NODES_PATH.exists() or not EDGES_PATH.exists():
        log("Missing data/raw/week1_nodes.tsv or week1_edges.tsv — run from repo root.")
        sys.exit(1)

    nodes = pd.read_csv(NODES_PATH, sep="\t", comment="#", quoting=3)
    edges = pd.read_csv(EDGES_PATH, sep="\t", comment="#", names=["source", "target"])

    G_directed = nx.DiGraph()
    G_directed.add_nodes_from(nodes.node_id)
    G_directed.add_edges_from(edges.itertuples(index=False))
    name_of = dict(zip(nodes.node_id, nodes.name))

    G_full = nx.Graph(G_directed.to_undirected())
    G_full.remove_edges_from(nx.selfloop_edges(G_full))
    components = list(nx.connected_components(G_full))
    G = G_full.subgraph(max(components, key=len)).copy()
    return G_directed, G_full, components, G, name_of


# ----------------------------------------------------------------------
# 2. The notebook's sampler, unchanged
# ----------------------------------------------------------------------
def sample_friend_pairs(net, n_pairs, rng):
    # person ~ Uniform(nodes with degree>=1); friend ~ Uniform(neighbors(person))
    deg = dict(net.degree())
    nodelist = [n for n, d in deg.items() if d > 0]
    adj = {n: list(net.neighbors(n)) for n in nodelist}
    idx_p = rng.integers(0, len(nodelist), size=n_pairs)
    persons = np.empty(n_pairs, dtype=float)
    friends = np.empty(n_pairs, dtype=float)
    for i, pi in enumerate(idx_p):
        p = nodelist[pi]
        nbrs = adj[p]
        f = nbrs[rng.integers(0, len(nbrs))]
        persons[i] = deg[p]
        friends[i] = deg[f]
    return persons, friends


def histogram(values, bins):
    counts, edges = np.histogram(values, bins=bins)
    return [{"x0": round4(edges[i]), "x1": round4(edges[i + 1]), "count": int(c)} for i, c in enumerate(counts)]


# ----------------------------------------------------------------------
# 3. Figure 1 — degree CCDF, as P(K >= k) for each distinct degree
# ----------------------------------------------------------------------
def degree_ccdf(net):
    deg = np.array([d for _, d in net.degree()])
    ks, counts = np.unique(deg, return_counts=True)
    at_least = np.cumsum(counts[::-1])[::-1]  # number of nodes with degree >= k
    return [{"k": int(k), "p": float(c / len(deg))} for k, c in zip(ks, at_least) if k > 0]


# ----------------------------------------------------------------------
# 4. Figure 3 — out-popularity'd rate per character
# ----------------------------------------------------------------------
def out_popularity(G, name_of):
    deg = dict(G.degree())
    rate = {n: float(np.mean([deg[j] >= deg[n] for j in G.neighbors(n)])) for n in G.nodes()}
    rates = np.array(list(rate.values()))
    spider = next(n for n in G.nodes() if name_of[n] == SPIDER_MAN)
    hubs = sorted(deg.items(), key=lambda kv: -kv[1])[:10]
    return {
        "perNode": [
            {"id": n, "name": name_of[n], "degree": int(deg[n]), "rate": round4(r)}
            for n, r in sorted(rate.items(), key=lambda kv: (kv[1], -deg[kv[0]]))
        ],
        "histogram": histogram(rates, RATE_BINS),
        "n": int(G.number_of_nodes()),
        "median": round4(np.median(rates)),
        "never": [name_of[n] for n, r in rate.items() if r == 0.0],
        "alwaysCount": int(sum(1 for r in rate.values() if r == 1.0)),
        "spiderMan": {"id": spider, "degree": int(deg[spider]), "rate": round4(rate[spider])},
        "topHubs": [{"name": name_of[n], "degree": int(d)} for n, d in hubs],
    }


def main():
    log("Marvel Wikipedia Network — Week 2 analysis pipeline")
    log("-" * 70)
    rng = np.random.default_rng(SEED)

    G_directed, G_full, components, G, name_of = load_marvel()
    log(f"Directed graph:    {G_directed.number_of_nodes()} nodes, {G_directed.number_of_edges()} edges")
    log(f"Largest component: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges  <- 'Marvel'")

    deg = np.array([d for _, d in G.degree()])
    k_mean, k_var = deg.mean(), deg.var()
    annd = np.array(list(nx.average_neighbor_degree(G).values()))

    log("Four networks (BA + matched G(n,m) controls)...")
    G_ba = nx.barabasi_albert_graph(BA_N, 1, seed=SEED)
    networks = {
        "BA(5000)": G_ba,
        "Random (matched to BA)": nx.gnm_random_graph(G_ba.number_of_nodes(), G_ba.number_of_edges(), seed=SEED),
        "Marvel": G,
        "Random (matched to Marvel)": nx.gnm_random_graph(G.number_of_nodes(), G.number_of_edges(), seed=SEED),
    }

    log(f"Sampling {N_PAIRS} (person, friend) pairs per network...")
    paradox = []
    for name, net in networks.items():
        d = np.array([x for _, x in net.degree()])
        persons, friends = sample_friend_pairs(net, N_PAIRS, rng)
        paradox.append({
            "network": name,
            "n": int(net.number_of_nodes()),
            "m": int(net.number_of_edges()),
            "kMean": round4(d.mean()),
            "kVar": round4(d.var()),
            "knnFormula": round4(d.mean() + d.var() / d.mean()),
            "meanPerson": round4(persons.mean()),
            "meanFriend": round4(friends.mean()),
            "fracFriendGE": round4((friends >= persons).mean()),
        })
        log(f"  {name:28s} person={persons.mean():6.2f} friend={friends.mean():6.2f} "
            f"frac={(friends >= persons).mean():.2f}")

    log("Out-popularity'd rate per character...")
    outpop = out_popularity(G, name_of)
    log(f"  median={outpop['median']:.2f} never={outpop['never']} always={outpop['alwaysCount']}")

    log(f"Null model: {N_REALIZATIONS} degree-preserving shuffles (slow)...")
    m = G.number_of_edges()
    null_frac = np.empty(N_REALIZATIONS)
    null_friend_mean = np.empty(N_REALIZATIONS)
    for i in range(N_REALIZATIONS):
        G_shuffled = G.copy()
        nx.double_edge_swap(G_shuffled, nswap=10 * m, max_tries=100 * m, seed=int(rng.integers(0, 1_000_000)))
        persons_s, friends_s = sample_friend_pairs(G_shuffled, N_PAIRS, rng)
        null_frac[i] = (friends_s >= persons_s).mean()
        null_friend_mean[i] = friends_s.mean()
        if (i + 1) % 100 == 0:
            log(f"  {i + 1}/{N_REALIZATIONS}")

    persons_real, friends_real = sample_friend_pairs(G, N_PAIRS, rng)
    real_frac = (friends_real >= persons_real).mean()
    real_friend_mean = friends_real.mean()

    def null_stats(null, real):
        z = (real - null.mean()) / null.std()
        p = np.mean(np.abs(null - null.mean()) >= np.abs(real - null.mean()))
        return {
            "real": round4(real),
            "nullMean": round4(null.mean()),
            "nullSd": round4(null.std()),
            "z": round4(z),
            "p": round4(p),
            "histogram": histogram(null, NULL_BINS),
        }

    null_model = {
        "nRealizations": N_REALIZATIONS,
        "nPairs": N_PAIRS,
        "fracFriendGE": null_stats(null_frac, real_frac),
        "meanFriend": null_stats(null_friend_mean, real_friend_mean),
    }
    for key in ("fracFriendGE", "meanFriend"):
        s = null_model[key]
        log(f"  {key:13s} real={s['real']:.3f} null={s['nullMean']:.3f}±{s['nullSd']:.3f} "
            f"z={s['z']:+.2f} p={s['p']:.2f}")

    output = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sourceNodesFile": "data/raw/week1_nodes.tsv",
            "sourceEdgesFile": "data/raw/week1_edges.tsv",
            "sourceNotebook": "weeks/week2/week2_gonuts.ipynb",
            "courseExerciseUrl": COURSE_EXERCISE_URL,
            "seed": SEED,
            "networkxVersion": nx.__version__,
        },
        "marvel": {
            "n": int(G.number_of_nodes()),
            "m": int(G.number_of_edges()),
            "nComponents": len(components),
            "nIsolates": sum(1 for c in components if len(c) == 1),
            "kMean": round4(k_mean),
            "kVar": round4(k_var),
            "knnFormula": round4(k_mean + k_var / k_mean),
            "anndUnweighted": round4(annd.mean()),
        },
        "ccdf": [{"network": name, "points": degree_ccdf(net)} for name, net in networks.items()],
        "paradox": paradox,
        "outPopularity": outpop,
        "nullModel": null_model,
    }

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    log("-" * 70)
    log(f"Wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024:.1f} KB)")
    log("Week 2 analysis complete.")


if __name__ == "__main__":
    main()
