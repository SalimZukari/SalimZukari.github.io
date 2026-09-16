# Who holds the Marvel universe together?

Spider-Man tops every centrality measure on the Marvel Wikipedia network — degree, closeness,
betweenness, PageRank, all of them. That's not a finding, it's what 106 links looks like. The
interesting question this week isn't "who's on top," it's who is more (or less) central than their
raw popularity alone would predict, and what breaks when you start removing people.

## The hook: Spider-Man is exactly as central as his 106 links predict

Spider-Man has 106 links pointing at his page — more than 40 ahead of the #2 hub (Hulk, 65) — and
a betweenness centrality of 0.235: almost a quarter of all shortest paths between other character
pairs in the 277-character giant component run through him. Against 200 degree-preserving shuffles
of the same giant component (every character's degree fixed, edges rewired), his betweenness
averages 0.232 — his real value is a z-score of **+0.34** away from that null. His closeness sits
at −0.97 standard deviations. Both are statistically unremarkable: a character with 106 links looks
exactly like this in *any* network with this degree sequence, real or shuffled. Spider-Man isn't a
special bridge or an unusually reachable character — he's just enormous, and enormous nodes behave
predictably.

## The real brokers

The interesting story is in the characters who *deviate* from what their degree predicts. We ran
200 degree-preserving shuffles of the undirected giant component (277 nodes, 1,421 edges) and
computed a z-score of real betweenness against that null for every character:

| Character | Degree | Betweenness | Shuffled mean | z |
|---|---|---|---|---|
| Rockman | 2 | 0.0073 | 0.0002 | **+8.03** |
| Black Widow | 25 | 0.0351 | 0.0158 | **+4.89** |
| Hercules | 26 | 0.0374 | 0.0183 | **+4.19** |
| U.S. Agent | 21 | 0.0255 | 0.0122 | **+3.43** |
| Black Cat | 28 | 0.0071 | 0.0201 | **−2.70** |

**Hercules and Black Widow** are the headline brokers: comparable degree (26 and 25 — not
especially high, ranked around #20 by degree) but betweenness roughly twice their shuffled
expectation, 4+ standard deviations out. Both connect the core Avengers/Hulk/Wolverine hub cluster
to low-degree peripheries the hub core doesn't touch directly — Hercules to a scattering of
cosmic/Asgardian characters (Ajak, Dargo Ktor, Firelord, Balder the Brave), Black Widow to a
Spider-Man-adjacent, street-level fringe (Rockman, Blue Eagle, Yelena Belova). Their extensive
crossover history is exactly what makes their articles a rare door between two Wikipedia
neighborhoods that otherwise wouldn't connect.

**Rockman is the single most surprising node in the entire giant component**, by a wide margin —
degree 2, betweenness z = +8.03. His two neighbors are Black Widow (a hub) and The Witness, a
degree-1 character whose *only* connection to the other 275 characters in the giant component runs
through Rockman. Every shortest path in or out of The Witness has no alternative route. Degree
counts how many edges a node has; betweenness cares what those specific edges are load-bearing for,
and a single dead-end neighbor is enough to turn a degree-2 node into a critical bridge — a much
more extreme version of the same mechanism that makes Hercules and Black Widow brokers.

**Black Cat is the mirror image**: 28 links (more than either broker above), yet betweenness *below*
what her degree predicts (z = −2.70) — well-connected, but not a broker. Her links mostly stay
inside one already-dense neighborhood rather than crossing between separate ones.

**Closeness is much harder to be surprising at.** Only 2 characters clear |z| > 4 for closeness
(Cyclops at z ≈ −5.06, Quasar at z ≈ −4.79 — both moderately-high-degree characters whose real
closeness sits below what their degree predicts), against 5 for betweenness — despite the closeness
null moving far *less* between shuffles in relative terms. Closeness is a sum over every other node's
distance, so it self-averages: one unusual edge can only nudge a small fraction of those n−1 terms.
Betweenness is a sum over *specific* shortest paths, so one structurally load-bearing edge (Rockman's
dead-end neighbor) can dominate it completely. Neither Hercules nor Black Widow show up near either
end of the closeness ranking — closeness never "notices" the specific bridging role that makes them
betweenness outliers, because their large-scale reach is already almost fully explained by degree.

## Break the universe

Which single character's removal fragments the network the most — and is it the
highest-betweenness character? We ran two related experiments on the 277-node giant component.

**Single-node removal.** Removing Spider-Man alone shrinks the giant component from 277 to 271
nodes (splitting off six small pieces, mostly pendant characters who connected to the rest of the
network only through him) — a 2% drop. That *is* the largest single-node effect in the whole giant
component, and it *is* the highest-betweenness character. So for this network: **yes, the most
fragmenting single removal is the highest-betweenness character** — but the effect size is modest.
Removing any one character barely dents a 277-node component; real fragmentation is a multi-removal
story.

**Sequential removal**, five orders, giant-component fraction tracked after each removal:

- **Degree** (fixed order, computed once)
- **Betweenness, static** (fixed order, computed once)
- **Betweenness, dynamic** (recomputed after every single removal)
- **PageRank** (fixed order, from the directed network)
- **Random** (averaged over 50 runs)

Ranking strategies by area under their curve (lower = fragments faster): **dynamic betweenness
(0.211) < static betweenness (0.259) < degree (0.265) < PageRank (0.293) ≪ random (0.462)**.
Recomputing betweenness after every removal beats every fixed-order strategy, including
betweenness computed just once — because once you remove today's biggest broker, a *different*
character often becomes the new best bridge, and only the dynamic strategy adapts to that. PageRank,
despite directly modeling "prestige," is a noticeably worse attack order than plain degree or
betweenness here — being frequently linked to doesn't make you structurally load-bearing for paths
between *other* characters. And every targeted order fragments the network far faster than random
removal: the same "robust to random failure, fragile to targeted attack" signature seen in other
heavy-tailed, hub-dominated networks.

## Six degrees of Spider-Man

Try the widget below: type any character and follow the chain to Spider-Man.

We already knew the headline before running anything: Spider-Man is the giant component's *center*
(radius = 3, established in the paths section), and a center's eccentricity equals the radius by
definition. **Nobody in Spider-Man's own giant component is more than 3 hops from him** — "six
degrees" is generous for this particular hub. Eighteen characters sit at that maximum distance of 3
(e.g. Box (comics), G.W. Bridge, Kid Colt, The Witness, Thena). One example chain:

```
Spider-Man → Deadpool → Garrison Kane → Box (comics)
```

Box is the same minor, thinly-connected Alpha Flight character (in-degree 1 in the full 303-node
network) that turned up in the paths section's directed-asymmetry example — a peripheral page that
only a single other article bothers to link to, so every route in has to funnel through one or two
specific intermediaries.

Direction flips the story. Toggle "follow arrows" and the search instead asks whether the typed
character's *own article*, followed forward, eventually links its way to Spider-Man's page.
Spider-Man's article links out to only 9 other characters, so chains *starting from* him and
following arrows outward reach just 230 of the other 302 characters — nowhere near the "everyone
within 3 hops" result from the undirected graph. Flip the direction and ask who has *some* directed
chain leading *into* him: 273 of 302 characters do, since so many articles link to him somewhere
along the way even when he never links back. Twenty-six characters (17 true isolates plus a
9-character side-component) are unreachable from Spider-Man no matter which mode you use — they
simply aren't connected to his part of the network at all.

## Cliques and team homophily

The Marvel giant component's clique number is **8** — six different maximal 8-character cliques, all
sharing the same five-character core (Cyclops, Emma Frost, Jean Grey, Rachel Summers, Wolverine)
with three more X-Men-adjacent characters (Betsy Braddock, Cable, Northstar, Jubilee, Storm, Phoenix)
rotating through the remaining slots. **Yes — every maximal 8-clique here is an X-Men team cluster.**
Counting every complete subgraph (not just maximal ones) gives 1,835 triangles and 477 five-cliques,
both matching the course page exactly — a clean validation that this clique count means the same
thing the course means by it.

That teams form cliques is suggestive, not proof of homophily — cliques could just as easily be a
byproduct of degree. So we tested directly: pull each character's primary team from Wikidata
(property P463, "member of"), which resolves for 101 of the 277 giant-component characters across 44
distinct teams (Avengers 23, X-Men 18, Alpha Flight 5, Starjammers 3, S.H.I.E.L.D. 3, and smaller
groups). Real team assortativity is **r = 0.156** — much higher than degree assortativity ever got.
Against 200 shuffles of the team *labels* (not the edges — the network stays exactly as it is, only
which character gets which team label changes), the null averages −0.017 ± 0.010, giving **z ≈
17.47**. That's an enormous effect: characters who share a Wikidata team claim are dramatically more
likely to be cross-linked on Wikipedia than any random relabeling would predict. Comic-book teams are
*written* to interact with each other, so this is exactly the structural fingerprint homophily
testing is built to catch — and it is a genuinely different kind of null than the ones used
elsewhere in this post. Degree assortativity (r = −0.105, shuffled −0.120 ± 0.012, z = 1.33) asks "is
this surprising given the degree sequence," the right question when degree is a known driver. Team
membership isn't a structural graph property at all — it's metadata draped over fixed nodes — so the
right null re-deals the *labels* and leaves every edge untouched, isolating exactly the question
being asked.

Direction adds one more wrinkle to mixing: correlating source in-degree against target out-degree
gives r = +0.10 (positive), while source out-degree against target in-degree gives r = −0.02 (near
zero). Famous, heavily-linked-to characters don't just link anywhere — their outbound links skew
toward already richly cross-referenced pages (which is exactly what a page with a lot of its own
outgoing links tends to be), reinforcing a core of mutually-reinforcing major articles rather than
spreading attention evenly out to peripheral stubs.

## Grading an LLM

We asked an LLM to write a short paragraph about who matters most in the Marvel network and why,
then checked every claim against what we actually computed.

> Spider-Man is clearly the most important character in the network: he has the most connections,
> which means he also has the highest betweenness centrality, so removing him would fragment the
> network more than removing anyone else. Because popular characters link to each other, the network
> shows positive degree assortativity — hubs like Spider-Man, Hulk, and Wolverine cluster together.
> Closeness centrality tells us roughly the same story as degree, since the most popular characters
> are also, obviously, the ones everyone else is closest to. PageRank should basically reproduce the
> in-degree ranking, since both measure how many pages point at a character.

- **"Degree → highest betweenness → most fragmenting removal."** Partly right, partly a
  non-sequitur. Degree and betweenness do correlate strongly (Spearman ρ = 0.914), and both do point
  to Spider-Man here — but "most fragmenting removal" is a separate empirical claim, answered by an
  actual removal experiment, not something high betweenness guarantees in general.
- **"Positive degree assortativity, hubs cluster together."** Wrong. Measured r = −0.105: the
  network is disassortative. Hubs disproportionately connect to low-degree periphery characters, not
  to each other — the opposite of the claim.
- **"Closeness tells the same story as degree."** Overstated. They correlate (ρ = 0.853), but
  closeness's z-scores against the shuffle null are far smaller and rarer than betweenness's, and
  its outlier list (Cyclops, Quasar) barely overlaps with the betweenness outlier list (Hercules,
  Black Widow, Rockman) — different questions, different answers, not "roughly the same story."
- **"PageRank should reproduce in-degree."** Wrong. Their top-ten lists diverge by five characters
  each way — a single link from a high-PageRank, low-out-degree character like Spider-Man
  (contributing a fixed 26–35% of Black Cat's, Mayday Parker's, and Venom's total PageRank each) can
  outweigh a dozen links from the middle of the pack, which plain in-degree counting cannot see.

## What we can and can't conclude

This is a Wikipedia hyperlink graph, not a social network: an edge means "the article for A links to
the article for B," so every centrality here measures editorial/narrative prominence, not
in-universe importance or real-world popularity. We checked the course data page for an updated
Marvel snapshot before starting — as of this week only a Week 4 *weighted-edges* addition exists (a
later week's dataset); no newer unweighted snapshot has been published, so this post uses the same
frozen `week1_nodes.tsv` / `week1_edges.tsv` as Weeks 1–2.

The degree-preserving shuffle tests whether a result needs more than the degree sequence to appear —
it does not rule out every other explanation. A z-score of +4 for Hercules means "not explained by
degree alone," not "definitely explained by his in-universe crossover history" (though that reading
is the best one we have from looking at his actual neighbor list). Team homophily's z ≈ 17.5 is a much
stronger and differently-tested result (against a label-shuffle null, not an edge-shuffle null), and
the two shouldn't be read on the same scale. The removal experiment operates on a static snapshot and
says nothing about how the network might be rewired in response to a real disruption — Wikipedia
editors adding new cross-links after an event, for instance — which this frozen graph cannot capture.

**Conclusion.** Spider-Man is exactly as central as his 106 links predict — a sanity check, not a
finding. The real brokers are Hercules and Black Widow, and far more extremely, Rockman: genuinely
unusual bridging positions a degree-preserving null cannot explain away. Fragmenting the network
seriously is a multi-removal, not a single-node, story, and *how* you choose the order matters —
dynamically recomputed betweenness beats every other strategy tried here, including betweenness
computed only once. And despite the "six degrees" framing, everybody in Spider-Man's own giant
component is at most three hops from him — as long as you don't insist the links go the right way.
