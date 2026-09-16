"""
Shared helpers reused across week-2 exercises 2.5b, 2.6.1, 2.6.2, ...
Pulled out here so later exercises don't re-implement the same logic.
"""

import csv
import os
import numpy as np
import networkx as nx
import random

# Resolve data files relative to this module's own location (not the
# caller's working directory), so scripts in other week-2 subfolders
# (e.g. 2.8/) can import this module and still find the data.
_DATA_DIR = os.path.dirname(os.path.abspath(__file__))
EDGES_FILE = os.path.join(_DATA_DIR, "week1_edges.tsv")
NODES_FILE = os.path.join(_DATA_DIR, "week1_nodes.tsv")


# ── from 2.5b: endpoint-list preferential attachment ──────────────────────────

def build_pa_network(n):
    """Preferential attachment via the endpoint-list trick (see 2_5b.py)."""
    G = nx.Graph()
    G.add_edge(0, 1)
    endpoint_list = [0, 1]
    for new_node in range(2, n):
        target = random.choice(endpoint_list)
        G.add_edge(new_node, target)
        endpoint_list.append(new_node)
        endpoint_list.append(target)
    return G


def build_uniform_network(n):
    """Uniform-attachment control network (see 2_5b.py)."""
    G = nx.Graph()
    G.add_edge(0, 1)
    for new_node in range(2, n):
        target = random.randint(0, new_node - 1)
        G.add_edge(new_node, target)
    return G


# ── from 2.6.1: week-1 log-binning scheme and Marvel loader ──────────────────

def week1_log_bins(degrees):
    """Width-1 bins for u=k+1 in 1..7, then doubling bins [8,16),[16,32),...
    normalized by bin width, doubling bins plotted at their geometric mean."""
    u = np.asarray(degrees) + 1
    edges = [1, 2, 3, 4, 5, 6, 7, 8]
    e = 8
    while e < u.max():
        e *= 2
        edges.append(e)
    edges = np.array(edges, dtype=float)

    counts, edges = np.histogram(u, bins=edges)
    widths = np.diff(edges)
    density = counts / (widths * len(u))
    midpoints = np.where(widths == 1, edges[:-1], np.sqrt(edges[:-1] * edges[1:]))

    mask = counts > 0
    return midpoints[mask] - 1, density[mask]


def ccdf(degrees):
    """Empirical complementary CDF, P(K >= k), using every data point."""
    x = np.sort(np.asarray(degrees))[::-1]
    y = np.arange(1, len(x) + 1) / len(x)
    return x, y


def load_marvel_digraph():
    """Directed Marvel network: edge A -> B when A's article links to B.
    All 303 nodes added first so the 17 isolates aren't silently dropped."""
    G = nx.DiGraph()

    with open(NODES_FILE, encoding="utf-8") as f:
        reader = csv.reader((line for line in f if not line.startswith("#")),
                             delimiter="\t", quoting=csv.QUOTE_NONE)
        next(reader)
        for row in reader:
            if row:
                G.add_node(row[0])

    with open(EDGES_FILE, encoding="utf-8") as f:
        reader = csv.reader((line for line in f if not line.startswith("#")),
                             delimiter="\t", quoting=csv.QUOTE_NONE)
        next(reader)
        for row in reader:
            if row:
                G.add_edge(row[0], row[1])

    return G


def load_marvel_graph():
    """Undirected Marvel network (see 2_2_4_marvel_vs_random.py)."""
    G = nx.Graph()
    with open(NODES_FILE, encoding="utf-8") as f:
        reader = csv.reader((line for line in f if not line.startswith("#")),
                             delimiter="\t", quoting=csv.QUOTE_NONE)
        next(reader)
        for row in reader:
            if row:
                G.add_node(row[0])
    with open(EDGES_FILE, encoding="utf-8") as f:
        reader = csv.reader((line for line in f if not line.startswith("#")),
                             delimiter="\t", quoting=csv.QUOTE_NONE)
        next(reader)
        for row in reader:
            if row:
                G.add_edge(row[0], row[1])
    return G


# ── from 2.8.4-2.8.6: configuration-model null and significance helpers ──────

def clean_configuration_model(degree_sequence, seed):
    """Build a configuration-model multigraph from the degree sequence, then
    strip self-loops and collapse parallel edges into a simple graph."""
    M = nx.configuration_model(degree_sequence, seed=seed)
    G = nx.Graph(M)                              # collapses parallel edges
    G.remove_edges_from(nx.selfloop_edges(G))     # drops self-loops
    return G


def z_and_p(real_value, null_values):
    """z-score and one-sided empirical p-value of real_value against an
    array of null-model realizations (direction picked automatically)."""
    null_values = np.asarray(null_values)
    std = null_values.std()
    # Z Scores in units of standard deviations how far the real value is from the null mean 0.33
    # Empirical p-value is the proportion of null values that are more extreme than the real value 0.33
    z = (real_value - null_values.mean()) / std if std > 0 else float("inf")
    if real_value >= null_values.mean():
        p = (np.sum(null_values >= real_value) + 1) / (len(null_values) + 1)
    else:
        p = (np.sum(null_values <= real_value) + 1) / (len(null_values) + 1)
    return z, p
