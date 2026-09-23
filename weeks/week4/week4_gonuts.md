# Solid cores, moving borders — where are the borders of philosophy?

*Week 4 · Communities & backbones · exercise 4.13, "Go nuts with your LLM".*
Interactive version: [weeks/week4.html](../week4.html) · exploration and validation: [week4_gonuts.ipynb](week4_gonuts.ipynb) ·
pipeline: `scripts/week4_analyze.py` → `data/processed/week4.json`.

A community boundary is a decision, not a fact. Pick an algorithm, a seed, a resolution, a *k*, an α, and a border appears
between two philosophers. We changed each of those decisions in turn on the Wikipedia philosophers network and asked which
borders survive every one of them, which move, and who lives on them. Marvel, the network our Weeks 1–3 posts use, is the
contrast.

**Graph, unless stated otherwise:** the undirected, unweighted giant component of the philosophers network: 1,374 of the
1,444 philosophers and 9,139 links (the 11,135 directed edges with both directions merged). The node roster is loaded
first, so the 70 philosophers outside the giant component are never silently dropped. Data: the course's frozen
2026-09-15 snapshot, checked against the data page on 2026-09-23 (no newer release).

Every number on the page comes from `week4.json`. Every course-page number we could check reproduces; the page's sanity
table lists them side by side.

---

## 1 · The hook

Louvain with seed 0: **9 communities, Q = 0.503**, named after their highest-degree member (Descartes, Kant, Aristotle,
Aquinas, Russell, the Buddha, Avicenna, Confucius, …). It looks like a finding. Ten seeds give **8–10 communities with Q
between 0.500 and 0.508**, and any two runs agree at NMI **0.65–0.83**. The big blocks survive every seed. The borders,
and the small groups, belong to the run.

The names are labels we attach to a partition. The story we'd tell about why they belong together is constructed
afterwards.

## 2 · Is there anything there at all?

| Undirected, unweighted giant component | Philosophers | Marvel |
|---|---|---|
| Louvain Q, ten seeds (mean) | 0.504 | 0.383 |
| configuration-model null (20) | 0.229 ± 0.002 | 0.267 ± 0.005 |
| strict double-edge swap (20) | 0.222 ± 0.002 | 0.248 ± 0.004 |
| G(n, m) (20) | 0.231 ± 0.004 | 0.282 ± 0.007 |
| real − config null (z) | +0.275 (z ≈ 113) | +0.116 (z ≈ 25) |

The degree-preserving null is the right comparison: modularity already subtracts what degrees predict, but an optimiser
searching an astronomical space of partitions always finds *some* border that beats chance. G(n, m) scrambles the degrees
as well, so it can't separate "the hubs make it look grouped" from "it is grouped". A random network's Q isn't zero for
the same reason. The stability check sees what the score can't: two Louvain seeds on the *same* shuffled graph agree at
NMI **0.07–0.10**, against 0.65–0.83 on the real network.

*A note on nulls.* The course's philosopher null (0.228 ± 0.002) matches our configuration model (stubs rewired,
multi-links and self-loops dropped). Its Marvel null (0.25) matches the strict swap. We report both for both networks.
The choice moves the second decimal, not the conclusion.

## 3 · How stable is it?

The full 10 × 10 NMI matrix is on the page. **Lowest pairwise agreement: 0.65**; seeds 0 and 1: 0.76; Marvel's ten
seeds: 0.53–0.89 (seeds 0 and 1: 0.59).

**Consensus.** Co-assignment frequencies across the ten runs, pairs kept if together in ≥ 50% of runs (τ = 0.5, our
choice), Louvain on that weighted graph with all ten seeds until they agree (Lancichinetti & Fortunato 2012). It
converged in one round: **8 communities, Q = 0.509**, NMI 0.75–0.89 with the individual runs.

**Stability score** per philosopher: the average share of runs in which they share a community with the other members
of their consensus community. Median 0.875; nobody scores a perfect 1. Descartes and Locke are together in 8 of 10 runs,
Avicenna and Galileo in 3, Aristotle and Plato in 8, Aristotle and Aquinas in 1. **The border-dwellers** (lowest
stability, degree ≥ 15) are Durkheim, Lucretius, Giordano Bruno, Swedenborg, Lucilio Vanini, Julius Caesar Scaliger,
Cardano, Patricius, Darwin, Mersenne, Galileo and Kepler: mostly Renaissance natural philosophers and early scientists
(our reading). That's where the partition is least sure, and where the history is most tangled.

## 4 · Louvain vs Infomap

Infomap (two-level, undirected, seed 1, best of 10 trials) finds **35 modules** (20 with ≥ 10 philosophers) against the
consensus's 8, NMI **0.74**. That's about as much as two Louvain seeds agree with each other. Infomap is stable across
its own seeds (NMI 0.74–0.83).

**Why they disagree, in network terms.** The disagreement is Infomap splitting four Louvain communities: the Buddha's
into three modules (around Adi Shankara, the Buddha and Madhvacharya, with 78, 77 and 37 internal links), Avicenna's
into Islamic and Jewish modules (Avicenna 151, Maimonides 99), Kant's (a Tolstoy-centred Russian module) and
Descartes's. This is the **resolution limit**: modularity merges groups with fewer than roughly √(2m) ≈ 135 internal
links, because one link between two small groups is already "more than expected". Of the nine Infomap modules involved
in these splits, four are below that line (Adi Shankara 78, the Buddha 77, Madhvacharya 37, Maimonides 99), two sit just
above it (Descartes 139, Tolstoy 150), where the limit is a guide rather than a hard line, and three are the big cores the
others get merged into. A random walker has
no such threshold. The course's example checks out: the Legalists (a k = 5 clique community of 9 philosophers with 27
links among them) all sit inside Confucius's community.

**Infomap's own null.** On the 20 shuffles Infomap still reports 14–38 modules. They compress the walk by 0.25% (at most
0.41%), against **9.2%** on the real network. The compression is what to read, not the count. **Direction:** directed
Infomap finds 61 modules (NMI 0.64 with undirected). Many articles cite Aristotle without being cited back, so a
directed walker gets caught in "who cites whom" basins. We compare the undirected runs so both methods see the same
graph.

**Which tells the better history?** Chance-corrected agreement (AMI) with Wikidata's movement labels (315 philosophers):
Infomap 0.28, Louvain 0.25. With the century lists: Louvain 0.40, Infomap 0.38. (Raw NMI flatters Infomap's larger
number of groups: 0.56 vs 0.47 on movements.) Infomap tells the finer history of *schools*; Louvain the coarser history
of *civilisations and periods*.

## 5 · Which tradition is Aristotle really in?

Louvain puts him in his own (Greek) community in 8 of 10 runs; once with Aquinas, once with Avicenna. Only 37% of his
300 neighbours are in that community.

**Link communities.** Our implementation of Ahn, Bagrow & Lehmann (2010): Jaccard similarity of the inclusive
neighbourhoods, single linkage over all 9,139 links, cut at maximum partition density **D = 0.054**, which gives **444**
link communities of 3+ links (exactly the course's single cut). **158 of Aristotle's links fall into one link
community**, and the philosophers at the other end are 90 Greek, 41 scholastic, 24 Islamic and 3 early-modern. That one
context, the Aristotelian commentary tradition, runs through three Louvain communities. **91 of his links (30%) belong
to no community at all**, mostly to the Descartes, Kant and Russell communities: passing mentions with no shared
context.

**k-cliques** (reproducing the course's table exactly):

| k | communities | largest | in any | in 2+ | in none |
|---|---|---|---|---|---|
| 3 | 19 | 1,155 | 1,189 (87%) | 29 | 185 |
| 4 | 36 | 817 | 909 (66%) | 86 | 465 |
| 5 | 40 | 467 | 555 (40%) | 112 | 819 |
| 6 | 39 | 171 | 304 (22%) | 86 | 1,070 |

At k = 5 (our choice: separate schools appear without losing most of the network) Aristotle is in 6 communities
(the big Greek–German one, Boethius/Ockham, Avicenna/al-Farabi, Aquinas/Averroes, Husserl/Heidegger, …). Augustine,
Aquinas and Nietzsche are in 5 each.

**Our answer:** Aristotle is in the *Aristotelian* tradition, a thread through three Louvain communities rather than
one of them. By neighbour he belongs everywhere; by context, mostly to one long line of commentary.

**Communities per link.** The raw count tracks degree (Spearman 0.92 over all link communities, 0.60 over 3+ link
ones), so we divide by degree, and only for philosophers with at least half their links in real link communities.
Multi-context bridges: John Peckham, **Kepler (12 from 28)**, Benjamin Franklin, Thomas Reid, Dugald Stewart, Ibn
al-Haytham. One-direction hubs: **Cicero (6 from 98)**, Maimonides, **Diogenes Laertius (6 from 91)**, Ptolemy (3 from
38).

**Limitation.** 393 philosophers have no link in any 3+ link community, and k-cliques leave 185 / 465 / 819 / 1,070 in
none at k = 3 / 4 / 5 / 6. Overlap methods can't see the sparse parts of the network.

## 6 · Strip it to the backbone

Weights summed over both directions run 1–24; 5,899 of 9,139 links have weight 1. Strength and degree agree (Spearman
0.96), with exceptions: Diogenes Laertius is 15th by degree (91) and 5th by strength (230). Strongest ties:
Erasmus–Thomas More 24, John Adams–Thomas Jefferson 22, Whitehead–Russell 19. Hume–Marx: 2 hops (22 middlemen), and the
strongest-tie route (length 1/w) is Hume → Kant → Hegel → Marx over 7, 7, 10.

**Disparity filter, from the formula** (no library): keep a link if (1 − w/s)^(k−1) < α at either end. It reproduces the
course exactly: α = 0.05 / 0.1 / 0.2 / 0.3 / 0.5 keep 292 / 649 / 1,540 / 2,549 / 5,641 links, 348 / 607 / 950 / 1,111 /
1,284 philosophers, giant component 116 / 419 / 816 / 1,052 / 1,270; w ≥ 2 / 3 / 4 keep 3,240 / 1,572 / 785 links.
Aristotle–Moses of Narbonne: (1 − 2/11)⁹ = 0.16 < 0.2, kept for Moses's sake (Aristotle's side scores 0.32; he'd need a
weight of 3). At α = 0.2 the filter attaches 950 philosophers against the w ≥ 3 threshold's 863. **112 are kept by the
filter and dropped by the threshold, and for every one of them the strongest tie is a 2.**

**Where it breaks.** Sweeping α from 0.001 to 0.5 in steps of 0.001, the giant component shrinks steadily (1,052 at 0.3,
816 at 0.2, 419 at 0.1). It breaks at **α ≈ 0.045**, where the second-largest component peaks (40 philosophers against a
largest of 61): the finite-size signature of a percolation transition. That's our definition of "breaks".

**Whose links break it.** Just above the break (α = 0.048) the giant component holds 110 philosophers. Of its
articulation points, the one whose removal leaves the smallest largest piece is **Erasmus**. Without him it splits into
61 (Aristotle, Plato, Aquinas, Cicero, reached through Cicero and Luther) and 45 (Descartes, Nietzsche, Leibniz, Spinoza,
through Augustine). At the break, antiquity and scholasticism hang on to early-modern philosophy through a single
humanist (historical reading ours).

**It comes apart one tradition at a time**, each through a single link:

| below α | link that drops | detached |
|---|---|---|
| 0.297 | Gaudapada – the Buddha | 24 (Adi Shankara, Madhvacharya, Ramanuja) |
| 0.170 | Confucius – Voltaire | 22 (Confucius, Zhu Xi, Laozi) |
| 0.092 | Leibniz – Wilhelm Wundt | 10 (Einstein, Wundt, Helmholtz) |
| 0.081 | Herbert Spencer – William James | 17 (James, Peirce, Dewey, Royce) |
| 0.069 | Diogenes Laertius – Epicurus | 10 (Diogenes Laertius, Anaximander, Zeno of Citium) |
| 0.052 | David Hume – Rousseau | 34 (Kant, Hegel, Hume, Marx) |
| 0.047 | Augustine – Malebranche | 40 (Descartes, Nietzsche, Leibniz, Spinoza) |
| 0.031 | Aristotle – Aquinas | 13 (Aquinas, Averroes, Luther, Erasmus) |

The final figure follows the course's five rules: disparity backbone at α = 0.2 (removes 7,599 links and leaves 424
philosophers with no significant tie); ForceAtlas2 layout of the backbone's giant component only; colour by the consensus
communities detected on the *full* unweighted network; size by strength; the ten strongest labelled.

## 7 · Weighted vs unweighted

Weighted Louvain (ten seeds) finds 7–10 communities; its consensus has 9 and agrees with the unweighted consensus at
**NMI 0.72**. 261 philosophers move (Marx, Darwin, Galileo, Spencer, Nishida, Tolstoy, Hayek, Ptolemy, …), and a large
share of them are ones the unweighted seeds couldn't settle either. **Don't compare weighted Q (0.55–0.56) with
unweighted Q.** Different questions, different ceilings. Against its own null (the same links, weights shuffled between
them: 0.496 ± 0.009) the strong ties sit inside groups more than chance would put them (z ≈ 6.7). That's a statement
about where weight sits, not a stronger community structure.

## 8 · Grading an LLM

We gave an LLM (Claude) one prompt: *"Write a short paragraph for a blog post about what the Louvain communities of the
Wikipedia philosophers network tell us about the history of philosophy."* It produced: a modularity with no null ("above
0.3 is significant"), one seed presented as the answer ("9 clear communities"), community names presented as findings
("Islamic philosophy"), a weighted Q compared to an unweighted one ("weights raise modularity to 0.56"), and "proves
that philosophy divides into 9 schools". The page grades each claim.

## What we can and can't conclude

**Can:** the philosophers network has community structure far beyond its degree sequence (z ≈ 113), much stronger than
Marvel's (+0.12 over its null), and the large blocks survive every seed, both algorithms and the consensus.

**Can't:** that philosophy "divides into N schools" (N is 8–10 for Louvain, 7–10 weighted, 35 for Infomap, 15–20 at γ =
2); that any border is a fact; that the names mean anything; that this is about ideas rather than how Wikipedia editors
cross-reference articles; that the backbone is data (it's a picture).

**Peixoto's objection.** All of this is descriptive: partitions that score well, checked against nulls and each other.
Whether groups *generated* the links is an inferential question that modularity plus an afterwards null can't answer.
With another week we'd fit a nested, degree-corrected stochastic block model by Bayesian inference (graph-tool), compare
its posterior over partitions with our consensus, and check that it returns a single block on the shuffles.

**Bottom line: solid cores, moving borders.** Change the seed and the Renaissance moves. Change the algorithm and Indian
philosophy splits in three. Change the overlap method and Aristotle stops being in one place. Tighten α and Erasmus is
what holds antiquity to modernity.
