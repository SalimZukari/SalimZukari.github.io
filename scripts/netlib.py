"""
Shared network helpers for the weekly analysis pipelines.

Generalised from weeks/week3/network_utils.py (clean_configuration_model,
z_and_p) and from the loaders in scripts/analyze.py / scripts/week3_analyze.py,
so later weeks import them instead of copy-pasting. Everything here is plain
networkx + numpy; nothing is specific to one dataset.

Each function that re-implements something a library already has (NMI,
modularity) is validated against that library in
weeks/week4/week4_gonuts.ipynb and again at the top of every run of
scripts/week4_analyze.py.
"""

import math
from collections import Counter

import networkx as nx
import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment


# ----------------------------------------------------------------------
# Loading — node roster first, so isolates are never silently dropped
# ----------------------------------------------------------------------
def read_nodes(path):
    """Course node files: tab-separated, '#' comment header, never quoted
    (quoting=3 = QUOTE_NONE, because blurbs contain stray quote marks)."""
    return pd.read_csv(path, sep="\t", comment="#", quoting=3)


def read_weighted_edges(path):
    """Weighted course edge files. The philosophers file has a real header
    row; the Marvel weighted file comments its header out ('# source ...'),
    so the columns are always named explicitly."""
    df = pd.read_csv(path, sep="\t", comment="#", quoting=3, header=None,
                     names=["source", "target", "weight"])
    df = df[df["source"] != "source"]  # drop a real header row if present
    df["weight"] = df["weight"].astype(int)
    return df.reset_index(drop=True)


def build_graphs(nodes_df, edges_df):
    """Directed weighted graph and its undirected counterpart with the two
    directions' weights summed (the course's recipe). Every roster node is
    added before any edge."""
    D = nx.DiGraph()
    D.add_nodes_from(nodes_df["node_id"])
    for s, t, w in edges_df[["source", "target", "weight"]].itertuples(index=False):
        D.add_edge(s, t, weight=int(w))

    G = nx.Graph()
    G.add_nodes_from(nodes_df["node_id"])
    for s, t, w in edges_df[["source", "target", "weight"]].itertuples(index=False):
        if G.has_edge(s, t):
            G[s][t]["weight"] += int(w)
        else:
            G.add_edge(s, t, weight=int(w))
    return D, G


def giant_component(G):
    return G.subgraph(max(nx.connected_components(G), key=len)).copy()


# ----------------------------------------------------------------------
# Null models (from weeks/week3/network_utils.py)
# ----------------------------------------------------------------------
def clean_configuration_model(degree_sequence, seed):
    """Configuration-model multigraph from the degree sequence, then strip
    self-loops and collapse parallel edges into a simple graph. This is the
    null the course page uses for its 'Q = 0.228 ± 0.002' number (a strict
    double-edge swap gives a slightly lower Q — both are reported)."""
    M = nx.configuration_model(degree_sequence, seed=seed)
    G = nx.Graph(M)
    G.remove_edges_from(nx.selfloop_edges(G))
    return G


def double_edge_swap_null(G, seed, swaps_per_edge=10):
    """Exactly degree-preserving shuffle (every degree kept, no multi-edges)."""
    H = nx.Graph(G.edges())
    m = H.number_of_edges()
    nx.double_edge_swap(H, nswap=swaps_per_edge * m, max_tries=100 * m, seed=seed)
    return H


def z_and_p(real_value, null_values):
    """z-score and one-sided empirical p-value of real_value against an
    array of null-model realizations (direction picked automatically)."""
    null_values = np.asarray(null_values)
    std = null_values.std()
    z = (real_value - null_values.mean()) / std if std > 0 else float("inf")
    if real_value >= null_values.mean():
        p = (np.sum(null_values >= real_value) + 1) / (len(null_values) + 1)
    else:
        p = (np.sum(null_values <= real_value) + 1) / (len(null_values) + 1)
    return float(z), float(p)


# ----------------------------------------------------------------------
# Partitions: our own NMI and modularity (validated against sklearn / nx)
# ----------------------------------------------------------------------
def nmi(labels_a, labels_b):
    """Normalized mutual information, NMI = 2I / (H1 + H2), exactly the
    formula on the course page (§4) and sklearn's default ('arithmetic')."""
    n = len(labels_a)
    ca, cb = Counter(labels_a), Counter(labels_b)
    cab = Counter(zip(labels_a, labels_b))
    I = sum(nxy / n * math.log(n * nxy / (ca[x] * cb[y])) for (x, y), nxy in cab.items())
    Ha = -sum(c / n * math.log(c / n) for c in ca.values())
    Hb = -sum(c / n * math.log(c / n) for c in cb.values())
    if Ha + Hb == 0:
        return 1.0
    return 2 * I / (Ha + Hb)


def modularity(G, labels, weight=None):
    """Per-community formula Q = sum_c [l_c/m - (d_c/2m)^2] (course §3),
    with l_c, d_c and m replaced by weights when weight is given."""
    m = G.size(weight=weight)
    inside, degsum = Counter(), Counter()
    for u, v, d in G.edges(data=True):
        w = d.get(weight, 1) if weight else 1
        if labels[u] == labels[v]:
            inside[labels[u]] += w
    for v, k in G.degree(weight=weight):
        degsum[labels[v]] += k
    return sum(inside[c] / m - (degsum[c] / (2 * m)) ** 2 for c in degsum)


def partition_to_labels(partition, nodes):
    """list-of-sets partition -> label list aligned with `nodes`, communities
    numbered largest first so label 0 is always the biggest."""
    parts = sorted(partition, key=lambda c: (-len(c), min(c)))
    lab = {v: i for i, c in enumerate(parts) for v in c}
    return [lab[v] for v in nodes]


def align_labels(labels, reference):
    """Relabel `labels` so each community gets the id of the reference
    community it overlaps most (Hungarian matching, one-to-one). Communities
    left unmatched get fresh ids after the reference's, so a split never
    hides behind a shared color."""
    a_ids = sorted(set(labels))
    r_ids = sorted(set(reference))
    ai = {c: i for i, c in enumerate(a_ids)}
    ri = {c: i for i, c in enumerate(r_ids)}
    overlap = np.zeros((len(a_ids), len(r_ids)))
    for x, y in zip(labels, reference):
        overlap[ai[x], ri[y]] += 1
    rows, cols = linear_sum_assignment(-overlap)
    mapping = {}
    for r, c in zip(rows, cols):
        if overlap[r, c] > 0:
            mapping[a_ids[r]] = r_ids[c]
    nxt = max(r_ids) + 1
    for c in sorted(a_ids, key=lambda c: -np.sum(overlap[ai[c]])):
        if c not in mapping:
            mapping[c] = nxt
            nxt += 1
    return [mapping[x] for x in labels]


def coassignment(label_runs):
    """Fraction of runs in which each pair of nodes shares a community
    (dense n x n float32; fine for a couple of thousand nodes)."""
    L = np.asarray(label_runs)
    n = L.shape[1]
    F = np.zeros((n, n), dtype=np.float32)
    for row in L:
        F += (row[:, None] == row[None, :])
    return F / len(L)
