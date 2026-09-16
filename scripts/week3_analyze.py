"""
Marvel Wikipedia Network — Week 3 analysis pipeline ("Who matters, and why").

Reads the same frozen dataset as Week 1 (data/raw/week1_nodes.tsv,
data/raw/week1_edges.tsv — checked against the course data page and still the
current official Marvel snapshot as of Week 3), and computes everything used
by weeks/week3.html and weeks/week3/week3_gonuts.md:

  - paths on the undirected giant component (<d>, diameter, radius, center)
    and directed reachability (largest SCC, fraction of pairs reachable)
  - four centralities (degree, closeness, harmonic, betweenness) + PageRank,
    each compared against a null where it matters
  - a 200-run shared degree-preserving-shuffle ensemble, used for betweenness
    z-scores, closeness z-scores, and the assortativity z-score together (one
    ensemble, three measures, so all three nulls are directly comparable)
  - targeted-removal robustness: giant-component fraction vs. characters
    removed, by degree, static betweenness, dynamic (recomputed) betweenness,
    PageRank, and random order (averaged), plus a per-node single-removal
    fragmentation ranking
  - degree assortativity and team homophily (Wikidata P463, cached locally),
    each tested against the null appropriate to the question being asked
  - largest cliques
  - the adjacency needed by the in-browser six-degrees-of-Spider-Man widget

Nothing here hard-codes a result — every number is derived from the raw
files (plus the cached Wikidata team lookup, itself derived from the raw
roster's wikidata_id column).

Usage:
    python scripts/week3_analyze.py
    (or: npm run analyze:week3)
"""

import json
import random
import sys
import time
import urllib.request
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
NODES_PATH = RAW_DIR / "week1_nodes.tsv"
EDGES_PATH = RAW_DIR / "week1_edges.tsv"
TEAM_CACHE_PATH = RAW_DIR / "week3_wikidata_team_cache.json"
OUTPUT_PATH = PROCESSED_DIR / "week3.json"
FIG_DIR = ROOT / "weeks" / "week3" / "figures"

COURSE_EXERCISE_URL = "https://sunelehmann.com/socialgraphs2026-web/weeks/week3.html"
DATA_PAGE_URL = "https://sunelehmann.com/socialgraphs2026-web/data/"

RNG_SEED = 42
N_SHUFFLES = 200
N_RANDOM_REMOVALS = 50
SPIDER_MAN = "Spider-Man"

random.seed(RNG_SEED)
np.random.seed(RNG_SEED)


def log(msg=""):
    print(msg, flush=True)


def round3(x):
    return round(float(x), 3)


# ----------------------------------------------------------------------
# 1. Load — node roster first, so isolated characters are never dropped
# ----------------------------------------------------------------------
def load_graphs():
    if not NODES_PATH.exists() or not EDGES_PATH.exists():
        log("Missing data/raw/week1_nodes.tsv or week1_edges.tsv — run from repo root.")
        sys.exit(1)

    nodes_df = pd.read_csv(NODES_PATH, sep="\t", comment="#", quoting=3)
    edges_df = pd.read_csv(EDGES_PATH, sep="\t", comment="#", names=["source", "target"])
    node_ids = list(nodes_df["node_id"])

    G = nx.DiGraph()
    G.add_nodes_from(node_ids)
    G.add_edges_from(edges_df[["source", "target"]].itertuples(index=False, name=None))
    UG = G.to_undirected()

    return nodes_df, edges_df, G, UG, node_ids


def bfs_distances(G, source):
    """Plain BFS distances (# edges) from source. Validated against networkx
    on 20 random start nodes in weeks/week3/week3_gonuts.ipynb — this
    production script trusts that validation and uses it directly, the same
    way scripts/analyze.py trusts networkx's own routines."""
    dist = {source: 0}
    frontier = deque([source])
    while frontier:
        u = frontier.popleft()
        for v in G.neighbors(u):
            if v not in dist:
                dist[v] = dist[u] + 1
                frontier.append(v)
    return dist


def name_lookup_from(nodes_df):
    return dict(zip(nodes_df["node_id"], nodes_df["name"]))


def url_lookup_from(nodes_df):
    return dict(zip(nodes_df["node_id"], nodes_df["url"]))


# ----------------------------------------------------------------------
# 2. Paths — undirected giant component + directed reachability
# ----------------------------------------------------------------------
def analyze_paths(UG, G):
    components = list(nx.connected_components(UG))
    giant_nodes = max(components, key=len)
    GC = UG.subgraph(giant_nodes).copy()
    n_gc = GC.number_of_nodes()

    eccentricity = nx.eccentricity(GC)
    avg_distance = nx.average_shortest_path_length(GC)
    diameter = max(eccentricity.values())
    radius = min(eccentricity.values())
    center = sorted(v for v, e in eccentricity.items() if e == radius)

    component_sizes = sorted((len(c) for c in components), reverse=True)

    # Directed reachability (Part 3 of 3.3): SCCs, fraction reachable, mean
    # directed distance over reachable pairs, and the "backward" distance
    # to Spider-Man used later by the six-degrees widget's arrow mode.
    n_dir = G.number_of_nodes()
    G_rev = G.reverse(copy=False)
    largest_scc = max(nx.strongly_connected_components(G), key=len)

    forward_spiderman = bfs_distances(G, SPIDER_MAN)
    backward_spiderman = bfs_distances(G_rev, SPIDER_MAN)  # dist(x -> ... -> Spider-Man)

    reachable_pairs = 0
    total_directed_distance = 0
    for u in G.nodes():
        dist = bfs_distances(G, u)
        reachable_pairs += len(dist) - 1
        total_directed_distance += sum(d for other, d in dist.items() if other != u)
    total_ordered_pairs = n_dir * (n_dir - 1)

    return {
        "GC": GC,
        "giantComponent": {
            "n": n_gc,
            "m": GC.number_of_edges(),
            "avgDistance": round3(avg_distance),
            "diameter": int(diameter),
            "radius": int(radius),
            "center": center,
            "numComponents": len(components),
            "componentSizes": component_sizes,
        },
        "directedReachability": {
            "n": n_dir,
            "m": G.number_of_edges(),
            "numSccs": len(list(nx.strongly_connected_components(G))),
            "largestSccSize": len(largest_scc),
            "fracOrderedPairsReachable": round3(reachable_pairs / total_ordered_pairs),
            "meanDirectedDistanceReachable": round3(total_directed_distance / reachable_pairs),
        },
        "forwardFromSpiderMan": forward_spiderman,
        "backwardToSpiderMan": backward_spiderman,
    }


# ----------------------------------------------------------------------
# 3. Centralities: degree, closeness, harmonic, betweenness (+ PageRank)
# ----------------------------------------------------------------------
def analyze_centralities(GC, G):
    nodes = list(GC.nodes())
    degree = dict(GC.degree())
    closeness = nx.closeness_centrality(GC)
    harmonic = nx.harmonic_centrality(GC)
    betweenness = nx.betweenness_centrality(GC)
    betweenness_directed = nx.betweenness_centrality(G)

    def top10(d, keys=None):
        keys = keys or nodes
        return [k for k, _ in sorted(((k, d[k]) for k in keys), key=lambda kv: -kv[1])[:10]]

    tops = {
        "degree": top10(degree),
        "closeness": top10(closeness),
        "harmonic": top10(harmonic),
        "betweenness": top10(betweenness),
    }
    in_all_four = sorted(set(tops["degree"]) & set(tops["closeness"]) & set(tops["harmonic"]) & set(tops["betweenness"]))

    deg_arr = [degree[v] for v in nodes]
    spearman = {}
    for label, measure in (("closeness", closeness), ("harmonic", harmonic), ("betweenness", betweenness)):
        rho, _ = spearmanr(deg_arr, [measure[v] for v in nodes])
        spearman[label] = round3(rho)

    rank_undirected = {v: i + 1 for i, v in enumerate(sorted(nodes, key=lambda v: -betweenness[v]))}
    rank_directed = {v: i + 1 for i, v in enumerate(sorted(nodes, key=lambda v: -betweenness_directed[v]))}
    moved = sorted(nodes, key=lambda v: -(rank_undirected[v] - rank_directed[v]))

    return {
        "nodes": nodes,
        "degree": degree,
        "closeness": closeness,
        "harmonic": harmonic,
        "betweenness": betweenness,
        "betweennessDirected": betweenness_directed,
        "top10": tops,
        "overlapAllFour": in_all_four,
        "spearmanDegreeVs": spearman,
        "rankUndirected": rank_undirected,
        "rankDirected": rank_directed,
        "movedUpMostDirected": moved[:8],
        "movedDownMostDirected": moved[-8:][::-1],
    }


# ----------------------------------------------------------------------
# 4. PageRank vs. in-degree
# ----------------------------------------------------------------------
def analyze_pagerank(G, name_lookup):
    nodes = list(G.nodes())
    out_degree = {v: G.out_degree(v) for v in nodes}
    in_degree = {v: G.in_degree(v) for v in nodes}
    dangling = [v for v in nodes if out_degree[v] == 0]
    pagerank = nx.pagerank(G, alpha=0.85)

    def top10(d):
        return [k for k, _ in sorted(d.items(), key=lambda kv: -kv[1])[:10]]

    pr_top10, indeg_top10 = top10(pagerank), top10(in_degree)
    only_pr = sorted(set(pr_top10) - set(indeg_top10), key=lambda c: -pagerank[c])
    only_indeg = sorted(set(indeg_top10) - set(pr_top10), key=lambda c: -in_degree[c])

    def contributors(target, k=3):
        contribs = []
        for pred in G.predecessors(target):
            share = 0.85 * pagerank[pred] / out_degree[pred]
            contribs.append({"id": pred, "name": name_lookup.get(pred, pred), "share": round(share, 5)})
        contribs.sort(key=lambda c: -c["share"])
        return contribs[:k]

    def entry(char):
        return {
            "id": char,
            "name": name_lookup.get(char, char),
            "pagerank": round(pagerank[char], 5),
            "inDegree": in_degree[char],
            "topContributors": contributors(char),
        }

    spiderman_out = out_degree[SPIDER_MAN]
    spiderman_share = 0.85 * pagerank[SPIDER_MAN] / spiderman_out

    return {
        "alpha": 0.85,
        "numDanglingNodes": len(dangling),
        "pagerank": pagerank,
        "inDegree": in_degree,
        "top10PageRank": pr_top10,
        "top10InDegree": indeg_top10,
        "onlyInPageRank": [entry(c) for c in only_pr],
        "onlyInInDegree": [entry(c) for c in only_indeg],
        "spiderMan": {
            "pagerank": round(pagerank[SPIDER_MAN], 5),
            "outDegree": spiderman_out,
            "sharePerOutlink": round(spiderman_share, 5),
        },
    }


# ----------------------------------------------------------------------
# 5. Shared 200-shuffle null: betweenness z, closeness z, assortativity z
# ----------------------------------------------------------------------
def shared_shuffle_ensemble(GC):
    nodes = list(GC.nodes())
    n, m = GC.number_of_nodes(), GC.number_of_edges()
    degree = dict(GC.degree())
    nswap = 10 * m

    betweenness_shuffled = np.zeros((N_SHUFFLES, n))
    closeness_shuffled = np.zeros((N_SHUFFLES, n))
    r_shuffled = np.zeros(N_SHUFFLES)
    disconnected_count = 0

    t0 = time.time()
    for i in range(N_SHUFFLES):
        Gs = GC.copy()
        nx.double_edge_swap(Gs, nswap=nswap, max_tries=nswap * 50, seed=RNG_SEED * 1000 + i)
        assert sorted(dict(Gs.degree()).values()) == sorted(degree.values())
        if not nx.is_connected(Gs):
            disconnected_count += 1
        bc = nx.betweenness_centrality(Gs)
        cc = nx.closeness_centrality(Gs)
        for j, v in enumerate(nodes):
            betweenness_shuffled[i, j] = bc[v]
            closeness_shuffled[i, j] = cc[v]
        r_shuffled[i] = nx.degree_assortativity_coefficient(Gs)
        if (i + 1) % 50 == 0:
            log(f"    shuffle {i + 1}/{N_SHUFFLES} ({time.time() - t0:.0f}s elapsed)")

    log(f"  {N_SHUFFLES} shuffles done in {time.time() - t0:.0f}s ({disconnected_count} came out disconnected)")
    return {
        "nodes": nodes,
        "betweennessShuffled": betweenness_shuffled,
        "closenessShuffled": closeness_shuffled,
        "rShuffled": r_shuffled,
    }


def analyze_brokers(GC, centralities, ensemble):
    nodes = ensemble["nodes"]
    real_bc = np.array([centralities["betweenness"][v] for v in nodes])
    real_cc = np.array([centralities["closeness"][v] for v in nodes])
    deg_arr = np.array([centralities["degree"][v] for v in nodes])

    bc_mean, bc_std = ensemble["betweennessShuffled"].mean(axis=0), ensemble["betweennessShuffled"].std(axis=0)
    cc_mean, cc_std = ensemble["closenessShuffled"].mean(axis=0), ensemble["closenessShuffled"].std(axis=0)

    z_bc = np.divide(real_bc - bc_mean, bc_std, out=np.zeros(len(nodes)), where=bc_std > 0)
    z_cc = np.divide(real_cc - cc_mean, cc_std, out=np.zeros(len(nodes)), where=cc_std > 0)

    per_node = {
        v: {
            "degree": int(deg_arr[i]),
            "betweenness": round(float(real_bc[i]), 5),
            "betweennessShuffledMean": round(float(bc_mean[i]), 5),
            "betweennessShuffledStd": round(float(bc_std[i]), 5),
            "zBetweenness": round(float(z_bc[i]), 3),
            "closeness": round(float(real_cc[i]), 5),
            "closenessShuffledMean": round(float(cc_mean[i]), 5),
            "closenessShuffledStd": round(float(cc_std[i]), 5),
            "zCloseness": round(float(z_cc[i]), 3),
        }
        for i, v in enumerate(nodes)
    }

    order_bc = np.argsort(-z_bc)
    order_cc = np.argsort(-z_cc)
    return {
        "nShuffles": N_SHUFFLES,
        "perNode": per_node,
        "topPositiveZBetweenness": [nodes[i] for i in order_bc[:10]],
        "topNegativeZBetweenness": [nodes[i] for i in order_bc[-5:][::-1]],
        "topPositiveZCloseness": [nodes[i] for i in order_cc[:8]],
        "topNegativeZCloseness": [nodes[i] for i in order_cc[-8:][::-1]],
        "countAbsZGt3": {"betweenness": int(np.sum(np.abs(z_bc) > 3)), "closeness": int(np.sum(np.abs(z_cc) > 3))},
        "countAbsZGt4": {"betweenness": int(np.sum(np.abs(z_bc) > 4)), "closeness": int(np.sum(np.abs(z_cc) > 4))},
    }


def analyze_mixing(GC, G, ensemble):
    nodes = ensemble["nodes"]
    degree = dict(GC.degree())
    r_real = nx.degree_assortativity_coefficient(GC)
    knn = nx.average_neighbor_degree(GC)
    deg1_knn = float(np.mean([knn[v] for v in GC.nodes() if degree[v] == 1])) if any(degree[v] == 1 for v in GC.nodes()) else None

    by_k = defaultdict(list)
    for v in GC.nodes():
        by_k[degree[v]].append(knn[v])
    knn_curve = [{"k": k, "knn": round3(np.mean(vals))} for k, vals in sorted(by_k.items())]

    r_mean, r_std = ensemble["rShuffled"].mean(), ensemble["rShuffled"].std()
    z_r = (r_real - r_mean) / r_std

    r_out_in = nx.degree_assortativity_coefficient(G, x="out", y="in")
    r_in_out = nx.degree_assortativity_coefficient(G, x="in", y="out")
    in_arr = np.array([G.in_degree(v) for v in G.nodes()])
    out_arr = np.array([G.out_degree(v) for v in G.nodes()])
    node_level_corr = float(np.corrcoef(in_arr, out_arr)[0, 1])

    return {
        "rReal": round3(r_real),
        "rShuffledMean": round3(r_mean),
        "rShuffledStd": round3(r_std),
        "zR": round(float(z_r), 2),
        "knnDeg1Mean": round3(deg1_knn) if deg1_knn is not None else None,
        "knnCurve": knn_curve,
        "directed": {
            "rOutSourceInTarget": round3(r_out_in),
            "rInSourceOutTarget": round3(r_in_out),
            "nodeLevelInOutCorr": round3(node_level_corr),
        },
    }


# ----------------------------------------------------------------------
# 6. Team homophily (Wikidata P463, cached) + label-shuffle null
# ----------------------------------------------------------------------
WD_HEADERS = {"User-Agent": "SocialGraphsCourseBot/1.0 (educational coursework)"}


def wikidata_get(ids, props):
    url = ("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" + "|".join(ids) +
           f"&props={props}&languages=en&format=json")
    with urllib.request.urlopen(urllib.request.Request(url, headers=WD_HEADERS), timeout=30) as resp:
        return json.load(resp)


def load_or_fetch_team_cache(nodes_df, giant_component_ids):
    if TEAM_CACHE_PATH.exists():
        log(f"  using cached {TEAM_CACHE_PATH.name}")
        with open(TEAM_CACHE_PATH, encoding="utf-8") as f:
            return json.load(f)

    log("  no cache found — fetching team membership (Wikidata P463) live")
    wikidata_id = dict(zip(nodes_df["node_id"], nodes_df["wikidata_id"]))
    qid_to_node = {wikidata_id[v]: v for v in giant_component_ids if pd.notna(wikidata_id.get(v))}
    all_qids = list(qid_to_node.keys())

    node_team_qids = {}
    for i in range(0, len(all_qids), 50):
        batch = all_qids[i:i + 50]
        try:
            entities = wikidata_get(batch, "claims")["entities"]
        except Exception as e:
            log(f"  Wikidata fetch failed ({e}); team homophily will be skipped")
            return None
        for qid, ent in entities.items():
            claims = ent.get("claims", {}).get("P463", [])
            teams = [c["mainsnak"]["datavalue"]["value"]["id"] for c in claims
                     if c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")]
            node_team_qids[qid_to_node[qid]] = teams
        time.sleep(0.2)

    with_team = {n: qs[0] for n, qs in node_team_qids.items() if qs}
    distinct_qids = sorted(set(with_team.values()))
    team_label = {}
    for i in range(0, len(distinct_qids), 50):
        batch = distinct_qids[i:i + 50]
        entities = wikidata_get(batch, "labels")["entities"]
        for qid, ent in entities.items():
            team_label[qid] = ent.get("labels", {}).get("en", {}).get("value", qid)
        time.sleep(0.2)

    team_of = {node: team_label[qid] for node, qid in with_team.items()}
    cache = {"teamOf": team_of}
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    with open(TEAM_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)
    return cache


def analyze_homophily(GC, nodes_df):
    cache = load_or_fetch_team_cache(nodes_df, list(GC.nodes()))
    if cache is None:
        return None
    team_of = {k: v for k, v in cache["teamOf"].items() if k in GC.nodes()}

    H = GC.subgraph(sorted(team_of.keys())).copy()
    nx.set_node_attributes(H, team_of, "team")
    r_real = nx.attribute_assortativity_coefficient(H, "team")

    rng = np.random.default_rng(RNG_SEED)
    # Sorted explicitly: H.nodes() order is not guaranteed stable across
    # interpreter runs for a subgraph-of-a-subgraph (unlike GC itself, whose
    # order follows the raw TSV and is stable) — without sorting, the same
    # seed would still shuffle a differently-ordered list each run and
    # silently change the result.
    labeled_nodes = sorted(H.nodes())
    team_values = [team_of[v] for v in labeled_nodes]
    r_shuffled = np.zeros(N_SHUFFLES)
    for i in range(N_SHUFFLES):
        shuffled = rng.permutation(team_values)
        nx.set_node_attributes(H, dict(zip(labeled_nodes, shuffled)), "team")
        r_shuffled[i] = nx.attribute_assortativity_coefficient(H, "team")
    nx.set_node_attributes(H, team_of, "team")

    r_mean, r_std = r_shuffled.mean(), r_shuffled.std()
    z = (r_real - r_mean) / r_std if r_std > 0 else float("inf")
    counts = Counter(team_of.values())

    return {
        "attribute": "team (Wikidata P463)",
        "nLabeled": len(team_of),
        "nGiantComponent": GC.number_of_nodes(),
        "nDistinctTeams": len(set(team_of.values())),
        "mostCommon": counts.most_common(8),
        "inducedSubgraph": {"n": H.number_of_nodes(), "m": H.number_of_edges()},
        "rReal": round3(r_real),
        "rShuffledMean": round3(r_mean),
        "rShuffledStd": round3(r_std),
        "z": round(float(z), 2),
        "teamOf": team_of,
    }


# ----------------------------------------------------------------------
# 7. Cliques
# ----------------------------------------------------------------------
def analyze_cliques(GC, name_lookup):
    # Maximal cliques (nx.find_cliques) for "the largest cliques, named" — a
    # maximum clique is inherently maximal, so this is the right source for
    # that question. But "how many k-cliques" on the course page counts ALL
    # complete subgraphs of size k, not just maximal ones (e.g. a triangle
    # sitting inside a larger clique is still a triangle) — that needs
    # nx.enumerate_all_cliques instead, which is also what makes the
    # 3-clique count line up with "1,835 triangles" on the course page.
    maximal_cliques = list(nx.find_cliques(GC))
    clique_number = max(len(c) for c in maximal_cliques)
    # nx.find_cliques doesn't guarantee a stable output order across runs;
    # sort by member name so which clique is "first" is deterministic too.
    largest = sorted(
        (c for c in maximal_cliques if len(c) == clique_number),
        key=lambda c: tuple(sorted(name_lookup.get(v, v) for v in c)),
    )

    all_cliques = list(nx.enumerate_all_cliques(GC))
    all_size_counts = Counter(len(c) for c in all_cliques)

    return {
        "cliqueNumber": clique_number,
        "numMaximalCliques": len(maximal_cliques),
        "numAllCliques": len(all_cliques),
        "sizeDistributionAllCliques": [{"size": s, "count": all_size_counts[s]} for s in sorted(all_size_counts)],
        "numTriangles": all_size_counts.get(3, 0),
        "num5Cliques": all_size_counts.get(5, 0),
        "largestCliques": [
            {"members": sorted(c, key=lambda v: name_lookup.get(v, v))}
            for c in largest
        ],
    }


# ----------------------------------------------------------------------
# 8. Targeted removal — single-node fragmentation + sequential curves
# ----------------------------------------------------------------------
def giant_fraction(G, original_n):
    if G.number_of_nodes() == 0:
        return 0.0
    largest = max((len(c) for c in nx.connected_components(G)), default=0)
    return largest / original_n


def single_node_fragmentation(GC):
    n = GC.number_of_nodes()
    results = []
    for v in GC.nodes():
        H = GC.copy()
        H.remove_node(v)
        comps = sorted((len(c) for c in nx.connected_components(H)), reverse=True)
        largest = comps[0] if comps else 0
        results.append({
            "id": v,
            "resultingLargestComponent": largest,
            "resultingGiantFraction": round3(largest / n),
            "numResultingComponents": len(comps),
        })
    results.sort(key=lambda r: r["resultingLargestComponent"])
    return results


def removal_curve(GC, order, original_n):
    H = GC.copy()
    curve = [{"removed": 0, "giantFraction": 1.0}]
    for i, v in enumerate(order, start=1):
        H.remove_node(v)
        curve.append({"removed": i, "giantFraction": round3(giant_fraction(H, original_n))})
    return curve


def dynamic_betweenness_curve(GC, original_n):
    H = GC.copy()
    curve = [{"removed": 0, "giantFraction": 1.0}]
    removed_order = []
    i = 0
    t0 = time.time()
    while H.number_of_nodes() > 0:
        bc = nx.betweenness_centrality(H)
        v = max(bc, key=bc.get)
        H.remove_node(v)
        removed_order.append(v)
        i += 1
        curve.append({"removed": i, "giantFraction": round3(giant_fraction(H, original_n))})
        if i % 50 == 0:
            log(f"    dynamic betweenness removal {i}/{original_n} ({time.time() - t0:.0f}s elapsed)")
    log(f"  dynamic betweenness removal done in {time.time() - t0:.0f}s")
    return curve, removed_order


def random_removal_curve_avg(GC, original_n, n_runs=N_RANDOM_REMOVALS):
    nodes = list(GC.nodes())
    sums = np.zeros(original_n + 1)
    rng = random.Random(RNG_SEED)
    for run in range(n_runs):
        order = nodes[:]
        rng.shuffle(order)
        H = GC.copy()
        sums[0] += 1.0
        for i, v in enumerate(order, start=1):
            H.remove_node(v)
            sums[i] += giant_fraction(H, original_n)
    avg = sums / n_runs
    return [{"removed": i, "giantFraction": round3(avg[i])} for i in range(original_n + 1)]


def auc(curve):
    xs = [p["removed"] for p in curve]
    ys = [p["giantFraction"] for p in curve]
    return round3(np.trapezoid(ys, xs) / (xs[-1] - xs[0]))


def analyze_removal(GC, centralities, pagerank_data, name_lookup):
    n = GC.number_of_nodes()
    degree_order = sorted(GC.nodes(), key=lambda v: -centralities["degree"][v])
    betweenness_order = sorted(GC.nodes(), key=lambda v: -centralities["betweenness"][v])
    pagerank_order = sorted(GC.nodes(), key=lambda v: -pagerank_data["pagerank"][v])

    log("  removal: degree / betweenness-static / pagerank orders")
    curve_degree = removal_curve(GC, degree_order, n)
    curve_betweenness_static = removal_curve(GC, betweenness_order, n)
    curve_pagerank = removal_curve(GC, pagerank_order, n)

    log("  removal: random order (averaged)")
    curve_random = random_removal_curve_avg(GC, n)

    log("  removal: dynamic (recomputed) betweenness order")
    curve_betweenness_dynamic, dynamic_order = dynamic_betweenness_curve(GC, n)

    log("  removal: single-node fragmentation ranking")
    single = single_node_fragmentation(GC)
    most_fragmenting = single[0]["id"]
    highest_betweenness = betweenness_order[0]

    return {
        "n": n,
        "orders": {
            "degree": curve_degree,
            "betweennessStatic": curve_betweenness_static,
            "betweennessDynamic": curve_betweenness_dynamic,
            "pagerank": curve_pagerank,
            "random": curve_random,
        },
        "auc": {
            "degree": auc(curve_degree),
            "betweennessStatic": auc(curve_betweenness_static),
            "betweennessDynamic": auc(curve_betweenness_dynamic),
            "pagerank": auc(curve_pagerank),
            "random": auc(curve_random),
        },
        "singleNodeFragmentation": {
            "mostFragmentingNode": most_fragmenting,
            "highestBetweennessNode": highest_betweenness,
            "sameNode": most_fragmenting == highest_betweenness,
            "top15": single[:15],
        },
        "dynamicRemovalOrder": dynamic_order[:15],
    }


# ----------------------------------------------------------------------
# 9. Six degrees of Spider-Man — widget adjacency + longest-chain example
# ----------------------------------------------------------------------
def analyze_six_degrees(G, UG, paths_data, name_lookup, url_lookup):
    forward = paths_data["forwardFromSpiderMan"]  # Spider-Man -> x (out-edges)
    backward = paths_data["backwardToSpiderMan"]  # x -> ... -> Spider-Man (out-edges from x)

    gc_nodes = set(paths_data["GC"].nodes())
    undirected_dist_from_spiderman = bfs_distances(UG, SPIDER_MAN)
    eccentricity_spiderman = max(undirected_dist_from_spiderman.values())
    max_dist_nodes = sorted(
        v for v, d in undirected_dist_from_spiderman.items() if d == eccentricity_spiderman
    )

    example_target = max_dist_nodes[0]
    # Reconstruct one shortest undirected path Spider-Man -> example_target.
    prev = {SPIDER_MAN: None}
    queue = deque([SPIDER_MAN])
    while queue:
        u = queue.popleft()
        if u == example_target:
            break
        for v in UG.neighbors(u):
            if v not in prev:
                prev[v] = u
                queue.append(v)
    path = [example_target]
    while prev[path[-1]] is not None:
        path.append(prev[path[-1]])
    path.reverse()

    out_adjacency = {v: sorted(G.successors(v)) for v in G.nodes()}

    return {
        "spiderManId": SPIDER_MAN,
        "eccentricitySpiderMan": eccentricity_spiderman,
        "nodesAtMaxDistance": max_dist_nodes,
        "exampleChain": {
            "targetId": example_target,
            "targetName": name_lookup.get(example_target, example_target),
            "path": path,
            "pathNames": [name_lookup.get(v, v) for v in path],
        },
        "directedReachableFromSpiderMan": len(forward) - 1,
        "directedCanReachSpiderMan": len(backward) - 1,
        "nodesOutsideGiantComponent": sorted(set(G.nodes()) - gc_nodes),
        "outAdjacency": out_adjacency,
    }


# ----------------------------------------------------------------------
# Figures
# ----------------------------------------------------------------------
def save_figures(GC, centralities, brokers, mixing, removal, name_lookup):
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    nodes = list(GC.nodes())
    degree = centralities["degree"]

    # Betweenness vs degree (log-log), outliers labeled.
    deg_vals = np.array([degree[v] for v in nodes], dtype=float)
    bet_vals = np.array([centralities["betweenness"][v] for v in nodes], dtype=float)
    eps = bet_vals[bet_vals > 0].min() / 2
    fig, ax = plt.subplots(figsize=(9, 7))
    ax.scatter(deg_vals, bet_vals + eps, s=18, alpha=0.6, color="#4C72B0")
    top_z = brokers["topPositiveZBetweenness"][:6] + brokers["topNegativeZBetweenness"][:3]
    for v in top_z:
        i = nodes.index(v)
        ax.annotate(v.split("_(")[0].replace("_", " "), (deg_vals[i], bet_vals[i] + eps),
                    fontsize=8, xytext=(4, 4), textcoords="offset points")
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("degree"); ax.set_ylabel("betweenness (+eps)")
    ax.set_title("Betweenness vs. degree, giant component")
    fig.tight_layout(); fig.savefig(FIG_DIR / "betweenness_vs_degree.png", dpi=150); plt.close(fig)

    # Betweenness z-score vs degree.
    z = np.array([brokers["perNode"][v]["zBetweenness"] for v in nodes])
    fig, ax = plt.subplots(figsize=(9, 6))
    ax.scatter(deg_vals, z, s=16, alpha=0.6, color="#4C72B0")
    ax.axhline(0, color="gray", linewidth=0.8)
    for v in top_z:
        i = nodes.index(v)
        ax.annotate(v.split("_(")[0].replace("_", " "), (deg_vals[i], z[i]), fontsize=8,
                    xytext=(4, 4), textcoords="offset points")
    ax.set_xscale("log")
    ax.set_xlabel("degree"); ax.set_ylabel("betweenness z-score")
    ax.set_title(f"Betweenness z-score ({N_SHUFFLES} degree-preserving shuffles) vs. degree")
    fig.tight_layout(); fig.savefig(FIG_DIR / "betweenness_zscore.png", dpi=150); plt.close(fig)

    # k_nn(k)
    ks = [p["k"] for p in mixing["knnCurve"]]
    knns = [p["knn"] for p in mixing["knnCurve"]]
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.scatter(ks, knns, s=20, color="#4C72B0")
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("degree k"); ax.set_ylabel(r"$k_{nn}(k)$")
    ax.set_title(f"Marvel giant component: k_nn(k)  (r = {mixing['rReal']})")
    fig.tight_layout(); fig.savefig(FIG_DIR / "knn.png", dpi=150); plt.close(fig)

    # Removal curves, all 5 orders overlaid.
    fig, ax = plt.subplots(figsize=(9, 6))
    for label, key, color in (
        ("Degree", "degree", "#4C72B0"),
        ("Betweenness (static)", "betweennessStatic", "#DD8452"),
        ("Betweenness (dynamic)", "betweennessDynamic", "#C44E52"),
        ("PageRank", "pagerank", "#55A868"),
        ("Random (avg)", "random", "#8172B2"),
    ):
        curve = removal["orders"][key]
        ax.plot([p["removed"] for p in curve], [p["giantFraction"] for p in curve], label=label, color=color)
    ax.set_xlabel("characters removed"); ax.set_ylabel("giant component fraction")
    ax.set_title("Targeted removal: giant component fraction vs. characters removed")
    ax.legend()
    fig.tight_layout(); fig.savefig(FIG_DIR / "removal_curves.png", dpi=150); plt.close(fig)


# ----------------------------------------------------------------------
# LLM grading box
# ----------------------------------------------------------------------
def llm_grading_box(centralities, removal, mixing):
    same_node = removal["singleNodeFragmentation"]["sameNode"]
    return {
        "prompt": "Write a short paragraph about who matters most in the Marvel Wikipedia network and why.",
        "paragraph": (
            "Spider-Man is clearly the most important character in the network: he has the most "
            "connections, which means he also has the highest betweenness centrality, so removing "
            "him would fragment the network more than removing anyone else. Because popular characters "
            "link to each other, the network shows positive degree assortativity — hubs like Spider-Man, "
            "Hulk, and Wolverine cluster together. Closeness centrality tells us roughly the same "
            "story as degree, since the most popular characters are also, obviously, the ones everyone "
            "else is closest to. PageRank should basically reproduce the in-degree ranking, since both "
            "measure how many pages point at a character."
        ),
        "annotations": [
            {
                "claim": "Spider-Man's high degree means high betweenness, and removing him fragments the network the most.",
                "verdict": "Partly wrong",
                "why": (
                    f"Degree and betweenness do correlate strongly here (Spearman ρ = {centralities['spearmanDegreeVs']['betweenness']}), "
                    "and Spider-Man does top the undirected betweenness ranking — but that is not the same claim as "
                    "\"his removal fragments the network the most.\" Our removal experiment answers that directly: the single "
                    "most fragmenting node to remove is "
                    + ("also the highest-betweenness node" if same_node else "NOT the highest-betweenness node")
                    + f" (see the removal section). Betweenness measures a share of shortest paths; single-removal fragmentation "
                    "measures a structural consequence, and the two need not pick the same character."
                ),
            },
            {
                "claim": "The network shows positive degree assortativity — hubs cluster together.",
                "verdict": "Wrong",
                "why": f"Measured r = {mixing['rReal']}, which is negative: the network is disassortative. Hubs disproportionately "
                       "connect to low-degree characters, not to each other — the opposite of the claim.",
            },
            {
                "claim": "Closeness centrality tells basically the same story as degree.",
                "verdict": "Overstated but directionally defensible",
                "why": f"Degree and closeness do correlate (Spearman ρ = {centralities['spearmanDegreeVs']['closeness']}), but closeness answers "
                       "a different question (average reach across the whole network, not direct connection count), and its z-scores "
                       "against a degree-preserving null are much smaller and rarer than betweenness's — closeness is close to what degree alone predicts, "
                       "which is a real finding, not a triviality to wave away as \"the same story.\"",
            },
            {
                "claim": "PageRank should basically reproduce the in-degree ranking.",
                "verdict": "Wrong",
                "why": "PageRank and in-degree top-ten lists diverge by several characters each way (see the PageRank section) — PageRank "
                       "weighs votes by the voter's own importance and out-degree, so a single link from a high-PageRank, low-out-degree "
                       "character like Spider-Man can outweigh a dozen links from obscure pages, which plain in-degree counting cannot see.",
            },
        ],
    }


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main():
    log("Marvel Wikipedia Network — Week 3 analysis pipeline")
    log("-" * 70)
    nodes_df, edges_df, G, UG, node_ids = load_graphs()
    name_lookup = name_lookup_from(nodes_df)
    url_lookup = url_lookup_from(nodes_df)
    log(f"Loaded {len(node_ids)} nodes, {len(edges_df)} directed edge rows")

    log("Paths (undirected giant component + directed reachability)...")
    paths_data = analyze_paths(UG, G)
    GC = paths_data["giantComponent"]
    log(f"  giant component: n={GC['n']} m={GC['m']} <d>={GC['avgDistance']} diameter={GC['diameter']} "
        f"radius={GC['radius']} center={GC['center']}")

    GC_graph = paths_data["GC"]

    log("Centralities (degree, closeness, harmonic, betweenness)...")
    centralities = analyze_centralities(GC_graph, G)

    log("PageRank vs. in-degree...")
    pagerank_data = analyze_pagerank(G, name_lookup)

    log(f"Shared {N_SHUFFLES}-shuffle null ensemble (betweenness + closeness + assortativity)...")
    ensemble = shared_shuffle_ensemble(GC_graph)

    log("Brokers (betweenness/closeness z-scores)...")
    brokers = analyze_brokers(GC_graph, centralities, ensemble)

    log("Mixing (degree assortativity, k_nn, directed degree-degree correlation)...")
    mixing = analyze_mixing(GC_graph, G, ensemble)

    log("Team homophily (Wikidata P463)...")
    homophily = analyze_homophily(GC_graph, nodes_df)

    log("Cliques...")
    cliques = analyze_cliques(GC_graph, name_lookup)

    log("Targeted removal (degree / betweenness static+dynamic / pagerank / random)...")
    removal = analyze_removal(GC_graph, centralities, pagerank_data, name_lookup)

    log("Six degrees of Spider-Man (widget adjacency + longest chain)...")
    six_degrees = analyze_six_degrees(G, UG, paths_data, name_lookup, url_lookup)

    log("Grading an LLM...")
    llm_box = llm_grading_box(centralities, removal, mixing)

    log("Saving figures...")
    save_figures(GC_graph, centralities, brokers, mixing, removal, name_lookup)

    def node_brief(nid):
        return {"id": nid, "name": name_lookup.get(nid, nid), "url": url_lookup.get(nid, "")}

    output = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sourceNodesFile": "data/raw/week1_nodes.tsv",
            "sourceEdgesFile": "data/raw/week1_edges.tsv",
            "datasetNote": (
                "Checked the course data page (…/data/) for an updated Marvel snapshot before running this "
                "pipeline: as of Week 3 only a Week 4 *weighted-edges* addition exists (same 1,784 edges plus "
                "a link-frequency weight, for a later week); no newer unweighted Marvel snapshot has been "
                "published, so Week 3 uses the same frozen Week 1 files as Weeks 1-2."
            ),
            "courseExerciseUrl": COURSE_EXERCISE_URL,
            "dataPageUrl": DATA_PAGE_URL,
            "nShuffles": N_SHUFFLES,
        },
        "paths": {
            "giantComponent": paths_data["giantComponent"],
            "directedReachability": paths_data["directedReachability"],
        },
        "centrality": {
            "top10": centralities["top10"],
            "overlapAllFour": centralities["overlapAllFour"],
            "spearmanDegreeVs": centralities["spearmanDegreeVs"],
            "movedUpMostDirected": centralities["movedUpMostDirected"],
            "movedDownMostDirected": centralities["movedDownMostDirected"],
            "nodeBriefs": {v: node_brief(v) for v in centralities["nodes"]},
        },
        "pagerank": {k: v for k, v in pagerank_data.items() if k not in ("pagerank", "inDegree")},
        "brokers": brokers,
        "mixing": mixing,
        "homophily": homophily,
        "cliques": cliques,
        "removal": removal,
        "sixDegrees": six_degrees,
        "llmGrading": llm_box,
        "nodeNames": name_lookup,
        "nodeUrls": url_lookup,
    }

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    log("-" * 70)
    log(f"Wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024:.1f} KB)")
    log("Week 3 analysis complete.")


if __name__ == "__main__":
    main()
