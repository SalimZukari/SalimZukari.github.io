# 🚀 Build an Interactive Marvel Social Network Explorer

You are an expert **data scientist, network scientist, data visualizer, UX designer, and frontend developer**.

Build a complete, polished, creative, and interactive website that analyzes and visualizes a network of Marvel superheroes from Wikipedia.

The final project must be **ready to deploy on GitHub Pages**.

Do not just create a static mockup. The website should actually load the supplied dataset, calculate the network statistics from scratch, and generate the visualizations dynamically.

---

## 1. Course context

This website is part of a Social Graphs / Network Science course.

The course exercise instructions are here:

https://sunelehmann.com/socialgraphs2026-web/weeks/week1.html

Use the Week 1 exercises as the conceptual foundation for the analysis.

The main exercise asks us to explore the shared Marvel network using ideas such as:

* Degree distributions
* In-degree and out-degree
* Highly connected characters
* Network visualization
* Connected components / islands
* Isolated nodes
* Linear and log–log degree-distribution plots
* Interesting patterns discovered in the network

The Week 1 project specifically asks students to:

1. Set up a public group website using GitHub Pages.
2. Download the frozen Week 1 Marvel network dataset.
3. Explore the network freely using the week's concepts and tools.
4. Create at least one figure or table.
5. Write about:

   * What question we asked
   * What we did
   * What we found
   * What surprised us

Reference the course exercise directly on the website.

---

# 2. Dataset

The dataset represents a Wikipedia network containing:

* 303 Marvel superhero characters/nodes
* Directed links between their Wikipedia pages
* The Week 1 frozen snapshot should be treated as the authoritative dataset.

The project should accept the course's **edge list and node roster files** as input.

IMPORTANT:

Do not assume that every node appears in the edge list.

The node roster must be used so that **isolated nodes are not accidentally removed**.

If the repository already contains the dataset, automatically locate and use it.

If the exact filenames are unknown, inspect the project directory and identify the appropriate node-roster and edge-list files.

Do not fabricate data.

---

# 3. Main goal

Create an interactive website that answers:

> **"What can the structure of the Marvel Wikipedia network tell us about the characters and their relationships?"**

The site should feel more like an **interactive data story / mini network laboratory** than a traditional university assignment.

It should be fun, visually engaging, intuitive, and easy for another student to explore.

---

# 4. Perform the analysis FROM SCRATCH

Do not hard-code the expected results.

The application must calculate the network statistics from the dataset.

At minimum calculate:

### Basic network statistics

* Number of nodes
* Number of directed edges
* Number of unique undirected edges
* Average in-degree
* Average out-degree
* Average degree
* Network density
* Number of isolated nodes
* Number of connected components
* Size of the largest connected component
* Number of nodes outside the largest component

### Node-level statistics

For every character calculate:

* In-degree
* Out-degree
* Total degree
* Undirected degree
* Component membership
* Whether the node is isolated
* Whether the node is part of the largest connected component

Rank characters by:

* Highest in-degree
* Highest out-degree
* Highest total degree

Do not assume that the most connected character according to one metric is also the most connected according to another.

---

# 5. Degree distribution analysis

Create the degree distribution from the data.

Show:

### Linear degree distribution

* X-axis = degree k
* Y-axis = number of nodes with degree k

Create a clear bar chart.

### Log–log degree distribution

Create a log–log visualization of the degree distribution.

Explain in simple language what the user is seeing.

Do NOT automatically claim that the network follows a power law.

Instead say something like:

> "The log–log plot makes the tail of the distribution easier to inspect. A long tail indicates that a small number of characters have substantially more connections than most characters. Whether this pattern follows a power law requires additional statistical analysis."

---

# 6. In-degree vs out-degree

Create an interactive visualization comparing:

**In-degree vs Out-degree**

Each point should represent a Marvel character.

Features:

* Hover over a point to reveal the character's name.
* Show in-degree.
* Show out-degree.
* Allow zooming/panning if practical.
* Add a diagonal reference line if useful.

Explain the interpretation:

* High in-degree → many other pages link to this character.
* High out-degree → this character's Wikipedia page links to many other characters.
* A character can have high in-degree but relatively low out-degree, or vice versa.

Highlight interesting outliers.

---

# 7. "Marvel Network MVPs"

Create a visually exciting ranking section.

Show:

### Top characters by in-degree

Display the top 10.

### Top characters by out-degree

Display the top 10.

### Top characters by total/undirected degree

Display the top 10.

Use horizontal bar charts or visually appealing ranking cards.

Each character should be clickable.

When clicked, open a character detail panel showing:

* Character name
* In-degree
* Out-degree
* Total degree
* Component
* Number of neighbors
* A short automatically generated interpretation

For example:

> "This character is unusually central in the network because many other Marvel pages link to them."

Do not use generic text blindly. Generate the explanation based on that character's actual statistics.

---

# 8. Interactive network graph

This should be one of the main attractions of the website.

Create an interactive network visualization.

Each node = Marvel character.

Each edge = Wikipedia relationship.

Use a force-directed graph.

Users should be able to:

* Drag nodes
* Zoom
* Pan
* Hover over nodes
* Click nodes
* Search for characters
* Highlight a selected character's neighbors
* Hide/show labels
* Reset the graph

Node size should reflect an informative network measure such as:

**undirected degree**

or allow the user to switch between:

* Degree
* In-degree
* Out-degree

Color nodes by connected component if practical.

The largest component should be visually distinguishable.

Avoid creating an unreadable "hairball".

Provide controls for:

* Minimum degree
* Showing only the largest connected component
* Showing isolates
* Node size metric
* Label visibility

---

# 9. Explore the islands

Analyze connected components.

Create an "Islands of Marvel" section.

Show:

* Number of connected components
* Size of each component
* Largest connected component
* Isolated characters

Visualize the component-size distribution.

Make the largest component easy to identify.

Explain:

> "A connected component is a group of characters where every character can reach every other character through some sequence of connections, when we ignore edge direction."

Also explicitly distinguish an isolated node:

> "An isolated character has degree 0 — there are no links connecting them to the rest of the network."

If the dataset produces surprising small components, highlight them.

---

# 10. Network density

Calculate the undirected density:

density = actual edges / possible edges

where:

possible edges = n(n-1)/2

Show:

* Actual number of edges
* Maximum possible number of edges
* Density
* Percentage of possible relationships that are absent

Explain this visually.

For example:

> "Even though the Marvel network contains many relationships, only a small fraction of all possible character-to-character connections actually exist."

Use a simple visual metaphor such as a partially filled connection grid.

Do not hard-code the values.

---

# 11. The "Aha!" section

Automatically identify interesting structural findings from the dataset.

The application should inspect the calculated statistics and generate several observations.

Possible findings include:

* Character with highest degree
* Character with highest in-degree
* Character with highest out-degree
* Most extreme in/out-degree mismatch
* Largest component
* Number of isolates
* Most unusual degree
* Strongly connected or tightly clustered areas, if such analysis is implemented
* Characters that act as structural bridges, if a suitable network metric is implemented

Turn these into visually appealing "Aha!" cards.

Example:

> 💡 **The Connector**
>
> One character has dramatically more connections than most others.
>
> Their degree is X, compared with a network average of Y.

The text must be generated from the actual dataset.

---

# 12. Articulation points / structural importance

If feasible, calculate articulation points in the undirected version of the network.

Explain that a character can be important because removing them can disconnect parts of the network.

This is important because:

> High degree does not necessarily mean structural importance.

If a character is an articulation point, highlight them.

Create a small interactive experiment:

### "Remove a character"

Allow the user to select a character and simulate removing that node.

Show:

* Number of nodes before
* Number of nodes after
* Number of connected components before
* Number of connected components after
* Size of largest component before/after

This makes the concept of structural importance intuitive.

If calculating articulation points is computationally inconvenient in the browser, precompute the values during the analysis/build process.

---

# 13. Exercise section

Include a dedicated section called:

## 🧠 Course Exercise

Clearly display the relevant Week 1 exercise questions.

Include questions such as:

> **What is the degree of each node?**

> **How does the sum of degrees relate to the number of edges?**

> **What is the average degree?**

> **What is the density of the network?**

> **What does the degree distribution look like?**

> **What happens when we look at in-degree versus out-degree?**

> **Which characters are the most connected?**

> **What does network structure tell us about importance?**

Link to the official exercise page:

https://sunelehmann.com/socialgraphs2026-web/weeks/week1.html

Use wording that makes clear these are course-inspired questions rather than pretending they are additional official questions if they are not exact quotations.

---

# 14. Explain the mathematics simply

The website should teach while it analyzes.

Use expandable "How is this calculated?" explanations.

For example:

### Average degree

Explain:

> Every undirected edge contributes 2 to the total degree because it touches two nodes.

Therefore:

average degree = 2 × edges / nodes

### Density

Explain:

> Density tells us how many of the possible connections actually exist.

density = actual edges / possible edges

### Degree distribution

Explain:

> Instead of asking how connected one character is, we count how many characters have each possible degree.

Keep explanations short and understandable.

---

# 15. Visual design

Make the site feel like a **Marvel-inspired network exploration dashboard**, but avoid using copyrighted Marvel artwork or logos unless those assets are already legally provided.

Use an original visual identity inspired by:

* Comic-book energy
* Network diagrams
* Data visualization
* Dark mode
* Neon/accent highlights
* Cards
* Large typography
* Subtle animations
* Comic-style section headings

Do not simply copy Marvel's official branding.

Possible title:

# 🕸️ Marvel Network: Behind the Connections

Possible subtitle:

> **303 characters. Thousands of links. One strange social graph.**

Other possible title options can be considered if a better concept emerges.

---

# 16. Landing page

Create a strong hero section.

Include:

**MARVEL NETWORK EXPLORER**

> 303 characters. Hundreds of Wikipedia connections.
> What happens when we turn Marvel's encyclopedia into a network?

Include animated network nodes in the background if performance allows.

Show 3–4 headline statistics dynamically:

* Nodes
* Links
* Average degree
* Network density

These values MUST come from the dataset.

Add a prominent button:

**Explore the network ↓**

---

# 17. Interactive dashboard

Create a dashboard containing cards for:

* 👥 Characters
* 🔗 Links
* 📊 Average degree
* 🕸️ Density
* 🏝️ Components
* 👻 Isolates

Cards should animate subtly when entering the viewport.

Do not overuse animations.

Prioritize performance and readability.

---

# 18. Search

Add a global character search.

When a user types:

"Spider-Man"

the site should suggest matching characters.

Selecting a character should:

* Center the network graph on that character
* Highlight the character
* Highlight its neighbors
* Display its statistics
* Show its component
* Show its rank

The search must work from the actual dataset.

---

# 19. Character profile

Create an interactive character profile panel.

Example structure:

## Spider-Man

**Degree:** 18
**In-degree:** 12
**Out-degree:** 9
**Component:** Largest component
**Network rank:** #4

Then generate a short interpretation.

For example:

> Spider-Man is one of the better-connected characters in this network. More pages point toward Spider-Man than the average character, suggesting that the character occupies a relatively prominent position in the Wikipedia link structure.

Again, calculate all values from the dataset.

---

# 20. Fun interactive experiments

Add several small experiments.

### Experiment 1 — "Who rules the network?"

Let users select:

* Highest degree
* Highest in-degree
* Highest out-degree

Then reveal the winner.

### Experiment 2 — "Delete a hero"

Select a character and remove them from the graph.

Show how the network changes.

### Experiment 3 — "Find a path"

Allow users to select:

Character A → Character B

Then find and visualize the shortest path between them, if one exists.

Display:

> "These characters are X steps apart."

Highlight the path in the network graph.

### Experiment 4 — "Guess the degree"

Show a character and ask users to guess how many connections they have.

Then reveal the actual value.

This is optional but encouraged because it makes the site more playful.

---

# 21. Degree distribution game

Create a small interactive section:

## "Can you spot the super-connectors?"

Show the degree distribution.

Allow the user to hover over bars.

When hovering over degree k:

> "There are X characters with degree k."

Make the tail visually interesting.

Explain why most real networks have many nodes with relatively few connections and fewer nodes with very high connectivity.

---

# 22. Technical requirements

Prefer a lightweight modern frontend.

Use technologies that work reliably with GitHub Pages.

Recommended:

* HTML
* CSS
* JavaScript
* D3.js or another suitable client-side visualization library
* No backend required

If a framework is used, make sure it can generate a static build compatible with GitHub Pages.

The final project must not require a server.

---

# 23. Data processing architecture

Separate the project into:

### Raw data

The original node and edge files.

### Analysis

A script that reads the raw data and produces calculated network statistics.

### Frontend data

Generate a JSON file containing the processed information needed by the website.

For example:

```text
data/
    nodes.csv
    edges.csv
    analysis.json
```

The exact structure may be improved if necessary.

The analysis should be reproducible.

If someone replaces the dataset and runs the analysis again, the site should update accordingly.

---

# 24. Reproducibility

Create a clear script such as:

```text
npm run analyze
```

or an equivalent command.

It should:

1. Load the node roster.
2. Load the edge list.
3. Preserve isolates.
4. Build the graph.
5. Calculate all statistics.
6. Generate the analysis JSON.
7. Prepare the frontend data.

Do not manually type analysis results into the website.

---

# 25. Data validation

Before generating the website, check:

* Number of nodes
* Number of edges
* Duplicate edges
* Self-loops
* Missing nodes
* Nodes appearing only in edges
* Isolated nodes
* Directed versus undirected interpretation

Print a concise analysis report during the build.

If the dataset produces unexpected values, investigate rather than silently changing the data.

---

# 26. Directed vs undirected network

Be explicit throughout the site.

The original Wikipedia network is **directed**:

A → B

means page A links to page B.

For some analyses, convert the network to an **undirected** network:

A ↔ B

when studying:

* Degree
* Density
* Connected components
* Articulation points
* Shortest paths, unless direction is specifically being studied

Clearly label which representation is being used.

Do not mix directed and undirected statistics without explanation.

---

# 27. Important mathematical sanity checks

The analysis should verify:

For a directed graph:

sum(in-degree) = number of directed edges

sum(out-degree) = number of directed edges

For an undirected graph:

sum(degrees) = 2 × number of undirected edges

Average degree:

average degree = 2m / n

Maximum possible undirected edges:

n(n−1)/2

Density:

m / [n(n−1)/2]

Include these relationships in the analysis code as validation checks.

---

# 28. Accessibility

Make the website accessible.

Include:

* Good contrast
* Keyboard navigation
* Meaningful button labels
* Alt text where appropriate
* Reduced-motion support
* Responsive design
* Mobile-friendly layouts
* Charts with text summaries

Do not rely exclusively on color to communicate information.

---

# 29. Responsive design

The website must work on:

* Desktop
* Laptop
* Tablet
* Mobile

On mobile:

* Stack cards vertically
* Make graphs responsive
* Provide simplified network controls
* Ensure charts remain readable
* Avoid horizontal scrolling wherever possible

---

# 30. GitHub Pages readiness

Create everything required for deployment.

Include:

* README.md
* package.json if appropriate
* analysis scripts
* source data structure
* frontend
* build instructions
* GitHub Pages deployment instructions

If using Vite or another build system, configure the base path correctly for GitHub Pages.

Do not require a backend.

The finished site should be deployable with GitHub Pages.

---

# 31. README

Create a useful README containing:

## Project

Short description.

## Course

Social Graphs / Network Science

## Exercise

Link:

https://sunelehmann.com/socialgraphs2026-web/weeks/week1.html

## Dataset

Explain that the project uses the frozen Week 1 Marvel Wikipedia network dataset.

## Analysis

List the metrics calculated.

## Running locally

Explain exactly how to run the analysis and website.

## GitHub Pages

Explain how to deploy.

## Reproducibility

Explain how the analysis is regenerated from the raw data.

---

# 32. First-person data story

The website should include a short section presenting the project as a student investigation.

Use this structure:

## Our question

What did we want to know?

## What we did

What data and network concepts did we use?

## What we found

What were the most interesting patterns?

## What surprised us

What result was unexpected?

Do not fabricate findings.

Generate these sections after actually analyzing the data.

---

# 33. Automatically generate insights

After analyzing the data, create a small set of automatically generated findings.

For example:

### Finding 1

The distribution is highly uneven.

### Finding 2

A small group of characters have much higher degree than the majority.

### Finding 3

The character with the highest in-degree is not necessarily the character with the highest out-degree.

### Finding 4

Most characters belong to the largest connected component.

### Finding 5

Some characters are isolated or belong to small components.

Only display findings that are actually supported by the calculated data.

---

# 34. Don't fabricate results

This is extremely important.

Never invent:

* Character rankings
* Degree values
* Component sizes
* Network statistics
* Dataset properties
* Surprising findings

Everything must come from the supplied dataset.

If the dataset cannot be found, clearly report that and tell me what file is required rather than generating fake results.

---

# 35. UX philosophy

The website should answer three questions immediately:

### 1. What is this?

A network of Marvel characters based on Wikipedia links.

### 2. What can I explore?

Connections, degree, centrality, components, paths, and network structure.

### 3. What did we learn?

The network is not random: some characters occupy much more connected positions than others.

Make the experience feel like discovering the answer rather than reading a textbook.

---

# 36. Suggested page structure

Build a single scrolling data-story website with sections:

1. **Hero**
2. **The Network at a Glance**
3. **Meet the Super-Connectors**
4. **Degree Distribution**
5. **In-Degree vs Out-Degree**
6. **Explore the Network**
7. **Marvel's Islands**
8. **Delete a Character**
9. **Find a Path**
10. **Network Density**
11. **Aha! Findings**
12. **Course Exercise**
13. **Our Data Story**
14. **Methodology**
15. **Dataset / Reproducibility**
16. **Course link / Credits**

Use smooth navigation between sections.

Add a small sticky navigation bar.

---

# 37. Visual storytelling

Do not put every statistic on the page at once.

Guide the visitor through the story.

For example:

> **303 characters.**

Then:

> **But how evenly connected are they?**

Then reveal the degree distribution.

Then:

> **A few characters stand out.**

Then show the rankings.

Then:

> **But being popular isn't the only form of importance.**

Then introduce articulation points and the "Delete a Character" experiment.

Then:

> **And most of the network lives on one giant island.**

Then show components.

This narrative structure is strongly encouraged.

---

# 38. Final quality check

Before finishing, test:

* Does the project build successfully?
* Does the analysis run from raw data?
* Are isolates preserved?
* Do degree sums pass validation?
* Does the number of edges match the dataset?
* Are charts populated from calculated data?
* Does character search work?
* Does the graph render?
* Does the path finder work?
* Does node removal work?
* Does the site work on mobile?
* Does GitHub Pages deployment work?
* Are there any hard-coded fake statistics?
* Are all course links correct?

Fix problems rather than simply reporting them.

---

# 39. Final deliverables

Produce a complete project containing:

```text
/
├── index.html
├── README.md
├── package.json
├── src/
│   ├── ...
├── data/
│   ├── raw/
│   └── processed/
├── scripts/
│   └── analyze.*
├── assets/
└── ...
```

Adapt the structure to the chosen technology.

The final result should be polished enough that a student can:

1. Put the dataset into the project.
2. Run the analysis.
3. Run/build the website.
4. Push the repository to GitHub.
5. Enable GitHub Pages.
6. Share the resulting URL with the course.

---

# 40. Most important instruction

Do not stop at designing the website.

**Actually implement it.**

First inspect the available files and dataset.

Then perform the analysis.

Then generate the processed data.

Then build the visualizations.

Then build the interactive website.

Then test it.

Then make it GitHub Pages ready.

The final product should feel like a **fun interactive investigation into the hidden structure of the Marvel universe**, while still clearly demonstrating the Week 1 concepts from the Social Graphs course.

Use the official exercise page throughout the project:

https://sunelehmann.com/socialgraphs2026-web/weeks/week1.html
https://en.wikipedia.org/wiki/Category:Marvel_Comics_superheroes
