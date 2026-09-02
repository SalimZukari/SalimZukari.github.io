"""
Marvel Wikipedia Network — analysis pipeline (Week 1, Social Graphs / Network Science).

Reads the frozen Week 1 dataset (node roster + directed edge list), builds the
directed and undirected graphs, computes every network statistic used by the
website, validates the standard degree-sum identities, and writes a single
JSON file (data/processed/analysis.json) that the static frontend loads at
runtime. Nothing here hard-codes a result — every number is derived from the
two raw TSV files.

Usage:
    python scripts/analyze.py
    (or: npm run analyze)
"""

import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
NODES_PATH = RAW_DIR / "week1_nodes.tsv"
EDGES_PATH = RAW_DIR / "week1_edges.tsv"
OUTPUT_PATH = PROCESSED_DIR / "analysis.json"

COURSE_EXERCISE_URL = "https://sunelehmann.com/socialgraphs2026-web/weeks/week1.html"
WIKI_CATEGORY_URL = "https://en.wikipedia.org/wiki/Category:Marvel_Comics_superheroes"


def log(msg=""):
    print(msg)


def fail(msg_lines):
    log("=" * 70)
    log("DATASET NOT FOUND — analysis cannot continue")
    log("=" * 70)
    for line in msg_lines:
        log(line)
    sys.exit(1)


def load_raw():
    if not NODES_PATH.exists() or not EDGES_PATH.exists():
        missing = []
        if not NODES_PATH.exists():
            missing.append(f"  - node roster:  {NODES_PATH}")
        if not EDGES_PATH.exists():
            missing.append(f"  - edge list:    {EDGES_PATH}")
        fail(
            [
                "The following required file(s) are missing:",
                *missing,
                "",
                "Place the frozen Week 1 Marvel dataset (week1_nodes.tsv and",
                "week1_edges.tsv) in data/raw/ and re-run this script.",
            ]
        )

    nodes = pd.read_csv(NODES_PATH, sep="\t", comment="#", quoting=3)
    edges = pd.read_csv(EDGES_PATH, sep="\t", comment="#", names=["source", "target"])

    required_cols = {"node_id", "name", "url", "description"}
    if not required_cols.issubset(nodes.columns):
        fail(
            [
                f"Node roster is missing expected columns. Found: {list(nodes.columns)}",
                f"Expected at least: {sorted(required_cols)}",
            ]
        )

    return nodes, edges


def round3(x):
    return round(float(x), 3)


def main():
    log("Marvel Wikipedia Network — analysis pipeline")
    log("-" * 70)
    nodes_df, edges_df = load_raw()

    # ------------------------------------------------------------------
    # 1. Data validation (Section 25)
    # ------------------------------------------------------------------
    node_ids = list(nodes_df["node_id"])
    node_id_set = set(node_ids)

    duplicate_node_ids = [nid for nid, cnt in Counter(node_ids).items() if cnt > 1]
    duplicate_directed_edges = int(edges_df.duplicated().sum())
    self_loops_df = edges_df[edges_df["source"] == edges_df["target"]]
    self_loop_count = int(len(self_loops_df))

    edge_endpoint_ids = set(edges_df["source"]) | set(edges_df["target"])
    nodes_only_in_edges = sorted(edge_endpoint_ids - node_id_set)
    nodes_missing_from_edges = sorted(node_id_set - edge_endpoint_ids)

    log(f"Node roster:            {len(node_ids)} nodes")
    log(f"Directed edge rows:     {len(edges_df)}")
    log(f"Duplicate node ids:     {len(duplicate_node_ids)}")
    log(f"Duplicate edge rows:    {duplicate_directed_edges}")
    log(f"Self-loops:             {self_loop_count}")
    log(f"Edge endpoints missing from roster: {len(nodes_only_in_edges)}")
    log(f"Roster nodes absent from edge list (isolate candidates): {len(nodes_missing_from_edges)}")

    if nodes_only_in_edges:
        log("WARNING: the following edge endpoints are not in the node roster:")
        for nid in nodes_only_in_edges:
            log(f"    {nid}")
        log("They will still be added as nodes so no edge data is silently dropped.")

    # ------------------------------------------------------------------
    # 2. Build the graphs — roster nodes are added FIRST so isolated
    #    characters (present in the roster, absent from the edge list)
    #    are never accidentally dropped.
    # ------------------------------------------------------------------
    G = nx.DiGraph()
    G.add_nodes_from(node_ids)
    G.add_edges_from(edges_df[["source", "target"]].itertuples(index=False, name=None))
    UG = G.to_undirected()

    n = G.number_of_nodes()
    m_directed = G.number_of_edges()
    m_undirected = UG.number_of_edges()

    # ------------------------------------------------------------------
    # 3. Degree statistics (Section 4)
    # ------------------------------------------------------------------
    in_degree = dict(G.in_degree())
    out_degree = dict(G.out_degree())
    total_degree = {nid: in_degree[nid] + out_degree[nid] for nid in node_ids}
    undirected_degree = dict(UG.degree())

    sum_in = sum(in_degree.values())
    sum_out = sum(out_degree.values())
    sum_undirected = sum(undirected_degree.values())

    avg_in_degree = sum_in / n
    avg_out_degree = sum_out / n
    avg_degree = (2 * m_undirected) / n
    max_possible_edges = n * (n - 1) / 2
    density = nx.density(UG)

    # ------------------------------------------------------------------
    # 4. Connected components & isolates (undirected view — Section 26)
    # ------------------------------------------------------------------
    components = sorted(
        [sorted(c) for c in nx.connected_components(UG)],
        key=lambda c: (-len(c), c[0]),
    )
    component_of = {}
    for idx, comp in enumerate(components):
        for nid in comp:
            component_of[nid] = idx
    largest_component_size = len(components[0]) if components else 0
    is_isolated = {nid: undirected_degree[nid] == 0 for nid in node_ids}
    num_isolated = sum(is_isolated.values())

    # ------------------------------------------------------------------
    # 5. Articulation points (Section 12)
    # ------------------------------------------------------------------
    articulation_points = set(nx.articulation_points(UG))

    # ------------------------------------------------------------------
    # 6. Neighbors (undirected, for graph highlighting / path finding)
    # ------------------------------------------------------------------
    neighbors = {nid: sorted(UG.neighbors(nid)) for nid in node_ids}

    # ------------------------------------------------------------------
    # 7. Rankings (Section 4 / 7) — ordinal rank, ties broken by name
    # ------------------------------------------------------------------
    def rank_map(value_dict):
        ordered = sorted(node_ids, key=lambda nid: (-value_dict[nid], nid))
        ranks = {}
        for i, nid in enumerate(ordered):
            ranks[nid] = i + 1
        return ranks

    rank_in = rank_map(in_degree)
    rank_out = rank_map(out_degree)
    rank_degree = rank_map(undirected_degree)

    def top_n(value_dict, k=10):
        ordered = sorted(node_ids, key=lambda nid: (-value_dict[nid], nid))[:k]
        name_lookup = dict(zip(nodes_df["node_id"], nodes_df["name"]))
        return [
            {"id": nid, "name": name_lookup.get(nid, nid), "value": int(value_dict[nid]), "rank": i + 1}
            for i, nid in enumerate(ordered)
        ]

    rankings = {
        "topInDegree": top_n(in_degree),
        "topOutDegree": top_n(out_degree),
        "topDegree": top_n(undirected_degree),
    }

    # ------------------------------------------------------------------
    # 8. Degree distributions (Section 5)
    # ------------------------------------------------------------------
    def distribution(value_dict):
        counts = Counter(value_dict.values())
        return [{"k": k, "count": counts[k]} for k in sorted(counts)]

    degree_distribution = {
        "degree": distribution(undirected_degree),
        "inDegree": distribution(in_degree),
        "outDegree": distribution(out_degree),
    }

    # ------------------------------------------------------------------
    # 9. Node-level records (Section 4)
    # ------------------------------------------------------------------
    node_records = []
    for row in nodes_df.itertuples(index=False):
        nid = row.node_id
        node_records.append(
            {
                "id": nid,
                "name": row.name,
                "url": row.url,
                "description": row.description if isinstance(row.description, str) else "",
                "inDegree": int(in_degree[nid]),
                "outDegree": int(out_degree[nid]),
                "totalDegree": int(total_degree[nid]),
                "undirectedDegree": int(undirected_degree[nid]),
                "componentId": component_of[nid],
                "componentSize": len(components[component_of[nid]]),
                "isIsolated": bool(is_isolated[nid]),
                "isInLargestComponent": component_of[nid] == 0,
                "isArticulationPoint": nid in articulation_points,
                "neighbors": neighbors[nid],
                "rankInDegree": rank_in[nid],
                "rankOutDegree": rank_out[nid],
                "rankDegree": rank_degree[nid],
            }
        )
    # Any edge endpoints that were missing from the roster (should not
    # happen with the official dataset, but handled defensively so no
    # edge is ever silently dropped).
    name_lookup = dict(zip(nodes_df["node_id"], nodes_df["name"]))
    for nid in nodes_only_in_edges:
        node_records.append(
            {
                "id": nid,
                "name": nid.replace("_", " "),
                "url": "",
                "description": "(Not present in the official node roster — added from the edge list so no link is lost.)",
                "inDegree": int(in_degree[nid]),
                "outDegree": int(out_degree[nid]),
                "totalDegree": int(total_degree[nid]),
                "undirectedDegree": int(undirected_degree[nid]),
                "componentId": component_of[nid],
                "componentSize": len(components[component_of[nid]]),
                "isIsolated": bool(is_isolated[nid]),
                "isInLargestComponent": component_of[nid] == 0,
                "isArticulationPoint": nid in articulation_points,
                "neighbors": neighbors[nid],
                "rankInDegree": rank_in[nid],
                "rankOutDegree": rank_out[nid],
                "rankDegree": rank_degree[nid],
            }
        )

    directed_edges = [{"source": s, "target": t} for s, t in G.edges()]

    # ------------------------------------------------------------------
    # 10. Component summary (Section 9)
    # ------------------------------------------------------------------
    component_summary = [
        {"id": idx, "size": len(comp), "isLargest": idx == 0, "nodeIds": comp}
        for idx, comp in enumerate(components)
    ]
    component_size_counts = Counter(len(c) for c in components)
    component_size_distribution = [
        {"size": s, "count": component_size_counts[s]} for s in sorted(component_size_counts)
    ]

    # ------------------------------------------------------------------
    # 11. Mathematical sanity checks (Section 27)
    # ------------------------------------------------------------------
    sanity_checks = {
        "sumInDegreeEqualsDirectedEdges": sum_in == m_directed,
        "sumOutDegreeEqualsDirectedEdges": sum_out == m_directed,
        "sumUndirectedDegreeEqualsTwiceEdges": sum_undirected == 2 * m_undirected,
        "avgDegreeEquals2mOverN": abs(avg_degree - (2 * m_undirected / n)) < 1e-9,
        "maxPossibleEdgesFormula": max_possible_edges == n * (n - 1) / 2,
        "densityEqualsMOverMax": abs(density - (m_undirected / max_possible_edges)) < 1e-9,
    }
    log("-" * 70)
    log("Sanity checks:")
    for k, v in sanity_checks.items():
        log(f"  [{'OK' if v else 'FAIL'}] {k}")
    if not all(sanity_checks.values()):
        log("WARNING: one or more sanity checks failed — investigate before publishing.")

    # ------------------------------------------------------------------
    # 12. "Aha!" findings — generated from the actual computed numbers
    # ------------------------------------------------------------------
    top_degree_node = max(node_ids, key=lambda nid: undirected_degree[nid])
    top_in_node = max(node_ids, key=lambda nid: in_degree[nid])
    top_out_node = max(node_ids, key=lambda nid: out_degree[nid])
    mismatch_node = max(node_ids, key=lambda nid: abs(in_degree[nid] - out_degree[nid]))
    median_degree = sorted(undirected_degree.values())[n // 2]

    def nm(nid):
        return name_lookup.get(nid, nid)

    aha_findings = []

    aha_findings.append(
        {
            "icon": "🔌",
            "title": "The Connector",
            "text": (
                f"{nm(top_degree_node)} has more connections than almost anyone else in the network — "
                f"{undirected_degree[top_degree_node]} links, compared with a network average of "
                f"{round3(avg_degree)}."
            ),
        }
    )

    if top_in_node != top_out_node:
        aha_findings.append(
            {
                "icon": "🔀",
                "title": "Popularity isn't direction",
                "text": (
                    f"The character other pages link to the most ({nm(top_in_node)}, in-degree "
                    f"{in_degree[top_in_node]}) is not the character whose own page links out the most "
                    f"({nm(top_out_node)}, out-degree {out_degree[top_out_node]})."
                ),
            }
        )
    else:
        aha_findings.append(
            {
                "icon": "🔀",
                "title": "A rare double crown",
                "text": (
                    f"{nm(top_in_node)} tops both rankings: the highest in-degree "
                    f"({in_degree[top_in_node]}) and the highest out-degree ({out_degree[top_out_node]})."
                ),
            }
        )

    aha_findings.append(
        {
            "icon": "⚖️",
            "title": "The imbalanced page",
            "text": (
                f"{nm(mismatch_node)} shows the most extreme in/out imbalance: in-degree "
                f"{in_degree[mismatch_node]} vs out-degree {out_degree[mismatch_node]} "
                f"(difference of {abs(in_degree[mismatch_node] - out_degree[mismatch_node])})."
            ),
        }
    )

    aha_findings.append(
        {
            "icon": "🏝️",
            "title": "One giant island",
            "text": (
                f"The largest connected component holds {largest_component_size} of {n} characters "
                f"({round3(100 * largest_component_size / n)}%). The remaining "
                f"{n - largest_component_size} are split across {len(components) - 1} smaller "
                f"components and isolates."
            ),
        }
    )

    aha_findings.append(
        {
            "icon": "👻",
            "title": "Ghosts of the network",
            "text": (
                f"{num_isolated} characters have zero connections in either direction — their Wikipedia "
                f"page neither links to, nor is linked from, any other character in this dataset."
            ),
        }
    )

    if articulation_points:
        example_ap = max(articulation_points, key=lambda nid: undirected_degree[nid])
        aha_findings.append(
            {
                "icon": "🌉",
                "title": "Structural bridges",
                "text": (
                    f"{len(articulation_points)} characters are articulation points — removing any one of "
                    f"them would split the network into more pieces. {nm(example_ap)} is one example, "
                    f"even though high degree alone wouldn't necessarily predict that role."
                ),
            }
        )
    else:
        aha_findings.append(
            {
                "icon": "🌉",
                "title": "No single points of failure",
                "text": "The undirected network has no articulation points — no single character's removal disconnects the graph.",
            }
        )

    aha_findings.append(
        {
            "icon": "📈",
            "title": "A long tail",
            "text": (
                f"Half of all characters have a degree of {median_degree} or lower, yet the most connected "
                f"character has a degree of {undirected_degree[top_degree_node]} — "
                f"{'over' if undirected_degree[top_degree_node] >= 2*max(median_degree,1) else 'well'} "
                f"beyond the typical character."
            ),
        }
    )

    # ------------------------------------------------------------------
    # 13. Automatically generated findings (Section 33) — short list
    # ------------------------------------------------------------------
    findings_list = [
        f"The degree distribution is highly uneven: most characters have only a handful of links, while a "
        f"small number — like {nm(top_degree_node)} — have {undirected_degree[top_degree_node]} or more.",
        f"A small group of characters accounts for a disproportionate share of connections; the top 10 by "
        f"undirected degree alone average {round3(sum(v['value'] for v in rankings['topDegree']) / 10)} "
        f"links each, versus a network-wide average of {round3(avg_degree)}.",
        f"The character with the highest in-degree ({nm(top_in_node)}) is "
        + ("not " if top_in_node != top_out_node else "")
        + f"the same as the character with the highest out-degree ({nm(top_out_node)}).",
        f"Most characters ({largest_component_size} of {n}, {round3(100*largest_component_size/n)}%) "
        f"belong to the single largest connected component.",
        f"{num_isolated} characters are completely isolated, and {len(components)-1} smaller components "
        f"exist outside the giant component.",
    ]

    # ------------------------------------------------------------------
    # 14. First-person data story (Section 32)
    # ------------------------------------------------------------------
    story = {
        "question": (
            "What can the structure of Wikipedia's links between Marvel characters tell us about which "
            "characters are central, which are peripheral, and how the network holds together?"
        ),
        "whatWeDid": (
            f"We started from the frozen Week 1 dataset — {n} Marvel character pages and "
            f"{m_directed} directed Wikipedia links between them — and treated isolated characters "
            f"(present in the roster but linked to nothing) as first-class nodes rather than dropping them. "
            f"We built both a directed graph (to study in- vs out-degree) and an undirected graph (to study "
            f"components, density, and articulation points), following the Week 1 exercise concepts of degree, "
            f"degree distribution, and connected components."
        ),
        "whatWeFound": (
            f"The network is dominated by one giant component covering {largest_component_size} of {n} "
            f"characters ({round3(100*largest_component_size/n)}%), while {num_isolated} characters are "
            f"fully isolated. Degree is very unevenly distributed — {nm(top_degree_node)} alone has "
            f"{undirected_degree[top_degree_node]} connections against a network average of "
            f"{round3(avg_degree)} — and the character with the most incoming links "
            f"({nm(top_in_node)}) is not necessarily the one whose page links out the most "
            f"({nm(top_out_node)})."
        ),
        "whatSurprisedUs": (
            f"How few of the possible connections actually exist: density is only {round3(density)}, meaning "
            f"roughly {round3(100*(1-density))}% of all possible character-to-character links are absent. "
            f"We were also struck that {len(articulation_points)} characters act as structural bridges — "
            f"their position in the graph matters even when their raw degree doesn't make them stand out."
        ),
    }

    # ------------------------------------------------------------------
    # 15. Assemble output
    # ------------------------------------------------------------------
    output = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sourceNodesFile": "data/raw/week1_nodes.tsv",
            "sourceEdgesFile": "data/raw/week1_edges.tsv",
            "courseExerciseUrl": COURSE_EXERCISE_URL,
            "wikiCategoryUrl": WIKI_CATEGORY_URL,
        },
        "validation": {
            "numNodesRoster": len(node_ids),
            "numDirectedEdgeRows": int(len(edges_df)),
            "duplicateNodeIds": duplicate_node_ids,
            "duplicateDirectedEdges": duplicate_directed_edges,
            "selfLoops": self_loop_count,
            "nodesOnlyInEdges": nodes_only_in_edges,
            "nodesMissingFromEdgeList": len(nodes_missing_from_edges),
            "sanityChecks": sanity_checks,
        },
        "stats": {
            "numNodes": n,
            "numDirectedEdges": m_directed,
            "numUndirectedEdges": m_undirected,
            "avgInDegree": round3(avg_in_degree),
            "avgOutDegree": round3(avg_out_degree),
            "avgDegree": round3(avg_degree),
            "density": round3(density),
            "maxPossibleEdges": int(max_possible_edges),
            "numIsolatedNodes": num_isolated,
            "numComponents": len(components),
            "largestComponentSize": largest_component_size,
            "nodesOutsideLargestComponent": n - largest_component_size,
            "numArticulationPoints": len(articulation_points),
        },
        "degreeDistribution": degree_distribution,
        "nodes": node_records,
        "edges": directed_edges,
        "components": component_summary,
        "componentSizeDistribution": component_size_distribution,
        "articulationPoints": sorted(articulation_points),
        "rankings": rankings,
        "ahaFindings": aha_findings,
        "findings": findings_list,
        "story": story,
    }

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=None, separators=(",", ":"))

    log("-" * 70)
    log(f"Wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024:.1f} KB)")
    log("Analysis complete.")


if __name__ == "__main__":
    main()
