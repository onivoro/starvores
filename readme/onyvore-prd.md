# Product Requirements Document: Onyvore

**Product Name:** Onyvore
**Version:** 1.0.0
**Status:** Final Specification
**Platform:** VS Code Extension (Node.js Runtime)
**Target:** Local-First Personal Knowledge Management

---

## 1. Executive Summary
**Onyvore** is a high-performance personal knowledge management (PKM) extension for VS Code. It bridges the gap between the structured reliability of **Joplin** and the networked intelligence of **Obsidian**. Onyvore organizes knowledge into **notebooks** — directories marked by a `.onyvore/` folder — each with its own isolated search index, link graph, and metadata. A single VS Code workspace can contain multiple independent notebooks. Onyvore never mutates user files; all metadata, links, and indexes are computed artifacts stored externally. Notebooks are designed to be open directories — any tool, script, or AI agent can create or modify markdown files, and Onyvore will seamlessly integrate them.

---

## 2. Definitions

### Workspace
The VS Code window. A workspace is the top-level directory (or multi-root configuration) open in VS Code. The workspace itself is not a notebook — it merely contains one or more notebooks. Onyvore discovers notebooks by scanning the workspace for `.onyvore/` directories.

### Notebook
A directory containing a `.onyvore/` directory. A notebook is the fundamental unit of organization in Onyvore. Each notebook is **fully isolated** — it has its own search index, link graph, metadata, and `.onyvoreignore` file. Notes in one notebook cannot link to or appear in search results from another notebook.

A notebook owns all `.md` files within its directory, recursively and at unlimited depth, **down to but not into** any nested notebook. A subdirectory containing its own `.onyvore/` acts as a boundary — the parent notebook stops claiming files at that point.

```
~/notes/                        ← workspace (not a notebook)
├── work/
│   ├── .onyvore/               ← notebook: owns meetings/, projects.md
│   ├── meetings/
│   │   └── standup.md
│   └── projects.md
├── personal/
│   ├── .onyvore/               ← notebook: owns recipes.md, journal.md
│   ├── recipes.md
│   └── journal.md
└── random-thought.md           ← unmanaged file
```

Nested notebooks are supported:

```
~/notes/                        ← notebook (has .onyvore/)
├── .onyvore/
├── overview.md                 ← owned by ~/notes/
├── general/
│   └── ideas.md                ← owned by ~/notes/
├── work/
│   ├── .onyvore/               ← nested notebook (boundary)
│   ├── projects.md             ← owned by ~/notes/work/
│   └── deep/
│       └── task.md             ← owned by ~/notes/work/
└── personal/
    ├── .onyvore/               ← nested notebook (boundary)
    └── journal.md              ← owned by ~/notes/personal/
```

The parent notebook's file watcher, search index, and link graph skip any subdirectory that contains `.onyvore/`. This is the same boundary pattern as `.git` — git will not recurse into a subdirectory that has its own `.git/` directory.

### Unmanaged Files
`.md` files that are not inside any notebook (i.e., not under any directory containing `.onyvore/`). These files are visible in the VS Code file explorer but invisible to Onyvore — not indexed, not linked. To manage them, the user either initializes a notebook at a parent directory or moves the files into an existing notebook.

---

## 3. Core Philosophy
* **Markdown-First:** All notes are standard `.md` files. No proprietary databases.
* **Zero Mutation:** Onyvore never modifies user files. All metadata, link graphs, and indexes are derived artifacts stored in `.onyvore/`. Files remain exactly as authored.
* **Notebook-Centric:** Each notebook is self-contained. Settings, indexes, and computed artifacts are stored locally within the notebook's `.onyvore/` directory.
* **Open Directory:** Any `.md` file in a notebook directory (recursively, unlimited depth) is part of that notebook, regardless of how it was created — by the extension, an AI agent, a script, or manual copy. Non-markdown files (images, PDFs, etc.) coexist in the notebook but only `.md` files are indexed, linked, and searched.
* **Zero-Binary:** No SQLite or native C++ dependencies. Built for universal distributability via Node.js.

---

## 4. Functional Requirements

### 4.1 Knowledge Organization
* **Notebook Sidebar:** A hierarchical tree view showing all discovered notebooks in the workspace. Each notebook displays its contained folders and notes. Notebooks are visually distinct from regular directories.
* **Automatic Link Graph:** Connections between notes are computed automatically within each notebook — no manual linking syntax required. Links do not cross notebook boundaries. See Section 4.4 for the linking algorithm.
* **Backlinks Panel:** A dedicated sidebar panel displays all notes connected to the active note, ranked by link weight (strongest connections first).
* **Orphan Detection:** Notes with zero inbound and outbound links are surfaced in the sidebar as "Unlinked Notes," helping users discover disconnected knowledge. Computed directly from the link graph at zero additional cost.

### 4.2 File Watching
* **Continuous Monitoring:** Uses VS Code's `FileSystemWatcher` API to detect `.md` file creates, changes, and deletes within each notebook in real-time, regardless of the source. Non-markdown files are ignored by the watcher. Paths matching `.onyvoreignore` patterns are excluded (see Section 5.2). Subdirectories containing `.onyvore/` (nested notebooks) are excluded — each notebook manages its own watcher independently.
* **Incremental Updates:** File watcher events trigger incremental updates to the notebook's search index and link graph, keeping both current without full re-scans. The update behavior depends on the event type:
  * **Create:** The new file is indexed and its noun phrases are extracted and matched against existing titles/headings (outbound links). Additionally, existing noun phrases already cached in the link graph are re-evaluated against the new file's title and headings to form inbound links. This reverse match is a string comparison against cached data — no NLP re-run is needed.
  * **Change:** The changed file's noun phrases are re-extracted and its outbound edges are rebuilt. If the file's title or headings changed, a reverse match against cached noun phrases is also performed to update inbound edges.
  * **Delete:** The file's entries are removed from `metadata.json`, `links.json`, and the search index. Dangling backlinks (edges pointing to the deleted file) are pruned from the graph.
* **Rename Handling:** `FileSystemWatcher` emits a delete + create pair for renames. The delete path prunes old edges; the create path rebuilds them against the new filename and content. The link graph self-heals — no stable file IDs are needed. Note: this approach performs redundant work (full NLP extraction on content that hasn't changed). Optimizing rename detection (e.g., matching content hashes within a short time window to coalesce delete + create into a single rename operation) is deferred to a future iteration.

### 4.3 High-Performance Search
* **Search Engine:** Powered by **Orama**, a pure-TypeScript, in-memory search engine. Orama indexes the full text of each note, providing broad keyword and partial-match recall. Each notebook has its own independent search index.
* **Fuzzy Matching:** Instant results for keyword and partial matches across the active notebook.
* **Graph-Boosted Ranking:** Search results are boosted by link graph centrality. Notes with more and stronger inbound links rank higher, surfacing well-connected notes above isolated ones with the same keyword relevance. This allows the link graph to improve search quality without constraining what is searchable.
* **Persistence:** The index is serialized to `.onyvore/index.bin` on exit to allow sub-100ms startup for large notebooks (10,000+ notes).

### 4.4 Automatic Linking
Onyvore computes a weighted link graph between notes within each notebook using deterministic noun-phrase extraction. The link graph and search index are intentionally separate pipelines — full-text search is broad and forgiving, while the link graph is selective and precise. The link graph feeds into search ranking (see Section 4.3) but does not constrain what is indexed. Links do not cross notebook boundaries.

**v1 is English-only.** The NLP library (compromise) supports English noun-phrase extraction. Multilingual support is a future consideration.

#### Trigger Model
The link graph is updated via file watcher events (Section 4.2). Any filesystem change — whether from the extension, an external agent, or manual editing — triggers an incremental update. There is no separate "index operation" trigger; the file watcher is the single event source for both the search index and the link graph.

#### Initial Notebook Computation
On first initialization (or when `.onyvore/` is absent/deleted), the full notebook must be scanned to build the search index, extract all noun phrases, compute global frequencies, and generate the link graph. This is a materially heavier operation than incremental updates and is handled as a **non-blocking background process:**

1. **Immediate availability:** The Notebook Sidebar and file editing are available immediately. The notebook is usable before initialization completes.
2. **Progressive search:** The search index is populated incrementally as files are processed. Search works immediately but returns partial results until the scan completes. A status bar indicator shows initialization progress.
3. **Link graph deferred:** The link graph requires global frequency data (the 40% ceiling) and cannot produce correct results until all files are scanned. The Backlinks Panel and Orphan Detection display an "Indexing…" state until the background process completes.
4. **File watcher active during init:** Files created or modified during initialization are queued and processed after the initial scan completes, ensuring no changes are lost.

The exact implementation of the background computation pipeline (batching, concurrency, memory management for large notebooks) requires further design consideration beyond this specification.

#### Startup Reconciliation
When the extension activates and a notebook's `.onyvore/` directory already exists (i.e., not a first-time initialization), the persisted index and link graph may be stale — files could have been created, modified, or deleted while the extension was not running (e.g., by an AI agent, a script, or manual editing). Onyvore reconciles the persisted state against the current filesystem on every startup:

1. **Load persisted state:** `index.bin`, `links.json`, and `metadata.json` are loaded from disk. Search and backlinks are immediately available using the persisted (potentially stale) data.
2. **Diff against filesystem:** Onyvore compares the current filesystem state against `metadata.json` (which tracks known files and their last-seen modification times):
   * **New files** (on disk but not in metadata) → processed via the Create path (index, extract, link).
   * **Modified files** (modification time newer than recorded in metadata) → processed via the Change path (re-index, re-extract, rebuild edges).
   * **Deleted files** (in metadata but no longer on disk) → processed via the Delete path (remove from index, metadata, and link graph; prune dangling backlinks).
3. **Non-blocking:** Reconciliation runs as a background process using the same progressive model as initial computation. The notebook is fully usable during reconciliation — search and backlinks serve persisted data immediately, with corrections applied incrementally as diffs are processed.
4. **File watcher starts immediately:** Real-time changes made during reconciliation are queued and processed after reconciliation completes.

#### NLP Behavior (compromise)
Compromise is the pure-JS NLP library used for noun phrase extraction. Its behavior has been empirically tested (see `tools/scripts/compromise-test.ts`) and the following characteristics inform the pipeline design:

* **Unknown words default to nouns.** Made-up words (e.g., "onyvore") are reliably tagged as nouns regardless of casing or sentence position. Compromise does not require words to be in a dictionary.
* **Casing does not affect extraction.** Both "Onyvore" and "onyvore" are extracted as nouns. Capitalized unknown words may additionally be tagged as ProperNouns, but extraction succeeds either way.
* **Noun phrase grouping is greedy.** Compromise groups adjacent nouns into a single phrase. "onyvore search engine" is extracted as one phrase, not three separate nouns. This must be handled in the matching step (see below).
* **Gerunds are excluded.** Words like "indexing" and "working" are tagged as verbs (Gerund), not nouns. This is desirable — it reduces noise.
* **Hyphenated compounds are decomposed.** "machine-learning" is split into "machine" and "learning," both tagged as nouns.

#### Extraction Pipeline
1. **Parse:** Note content is processed through compromise to extract noun phrases.
2. **Decompose:** Multi-word noun phrases are retained as-is and also decomposed into constituent nouns. For example, "onyvore search engine" produces three candidates: "onyvore search engine" (full phrase), "onyvore", "search engine". Single-word phrases are not decomposed.
3. **Filter — Stop Nouns:** Ultra-common nouns are removed (e.g., "time," "way," "thing," "part," "people," "day," "year," "example," "case"). This is a built-in static list, not user-configurable.
4. **Filter — Frequency Ceiling:** Noun phrases appearing in more than 40% of notebook documents are excluded. This acts as a dynamic IDF-style cutoff — in a notebook about cooking, "recipe" won't link everything, but "sourdough" will create meaningful connections. Note: this is a global computation. When a single file changes, the frequency of its noun phrases is recalculated against the full notebook. If a noun phrase crosses the 40% threshold in either direction, affected edges across all files are added or removed.
5. **Filter — Minimum Length:** Single-character tokens and single-letter words are excluded.

#### Matching
Surviving noun phrases are matched **case-insensitively** against:
* **Note titles** (filenames without the `.md` extension).
* **Headings** (`#`, `##`, `###`, etc.) across all notes in the notebook.

A match produces a weighted edge in the link graph. Links target the file as a whole, not specific headings within it.

**Full phrase matches are weighted higher than constituent matches.** If "onyvore search engine" is extracted from Note A and matches a note titled `Onyvore Search Engine.md` (full phrase match), that edge receives a higher weight than a match from the constituent "onyvore" against `Onyvore.md`. Specifically, full phrase match weights are multiplied by 2x relative to constituent match weights. This ensures that more specific connections rank above incidental ones in the Backlinks Panel.

#### Weighting
Each edge stores the occurrence count of the matched noun phrase in the source note, multiplied by the match type modifier:
```json
{ "source": "note-a.md", "target": "note-b.md", "noun": "sourdough", "weight": 5, "matchType": "full" }
```
* `"matchType": "full"` — the extracted phrase matched the target title/heading exactly. Weight = occurrence count × 2.
* `"matchType": "constituent"` — a constituent of a larger extracted phrase matched the target. Weight = occurrence count × 1.

Weight is used to rank backlinks — notes with stronger connections surface first in the Backlinks Panel.

### 4.5 Metadata
Onyvore derives metadata for each note and stores it in `metadata.json`. Metadata is computed from filesystem state:
* **Timestamps:** Filesystem stat (birth time for created, modification time for updated). These may be less reliable for copied or moved files.
* **Extracted headings:** All headings (`#`, `##`, etc.) found in the note, used as link targets by the matching step.

---

## 5. Technical Architecture

### 5.1 Data Persistence (`.onyvore/` Folder)
Each notebook contains a `.onyvore/` directory with:
* `config.json`: Stores notebook-specific settings.
* `index.bin`: A serialized binary snapshot of the Orama search index.
* `links.json`: The computed weighted link graph between all notes in the notebook.
* `metadata.json`: Derived metadata for each note (timestamps, extracted headings, last-seen modification time for reconciliation). See Section 4.5.

All files in `.onyvore/` are derived artifacts. They can be deleted and fully regenerated from the notebook's `.md` files.

### 5.2 `.onyvoreignore`
Users can create a `.onyvoreignore` file in the notebook root to exclude paths from indexing, linking, and file watching. The syntax follows `.gitignore` conventions (glob patterns, `#` comments, `!` negation). Each notebook's `.onyvoreignore` is self-contained — a parent notebook's ignore file does not propagate into nested notebooks. Examples:

```
# Exclude documentation from a codebase
docs/api/
vendor/

# Exclude a scratch folder
_drafts/
```

Ignored paths are excluded from:
* File watching (no index/link updates for changes in ignored paths)
* Search indexing (ignored files do not appear in search results)
* Link graph (ignored files are not scanned for noun phrases and cannot be link targets)
* Initial notebook computation (ignored files are skipped during the background scan)

### 5.3 Technology Stack
* **Runtime:** Node.js (VS Code Extension Host).
* **Search Engine:** Orama (Pure JS).
* **NLP:** compromise (Pure JS noun-phrase extraction).
* **Bundler:** `esbuild` (Compiles all dependencies into a single, lightweight `extension.js`).

---

## 6. User Experience (UX)

### 6.1 Notebook Discovery
On workspace activation, Onyvore scans the workspace for directories containing `.onyvore/`. Each discovered notebook is registered and its file watcher, search index, and link graph are initialized. New notebooks can be created at any time via the Command Palette.

### 6.2 Active Notebook
The **active notebook** is the notebook that contains the file currently focused in the editor. All notebook-scoped commands (Search) operate on the active notebook. The active notebook is determined automatically:

* **By focused file:** When the user opens or switches to a file, Onyvore resolves which notebook owns that file and sets it as active. If the file is unmanaged (not inside any notebook), there is no active notebook.
* **Status bar indicator:** The active notebook's name (its directory name) is displayed in the VS Code status bar. This provides constant visibility into which notebook commands will target. If no notebook is active, the status bar shows "No Notebook."
* **No manual selection required.** The active notebook always follows focus. There is no "pin" or "lock" mechanism — switching to a file in a different notebook switches the active notebook.

When no notebook is active, notebook-scoped commands are disabled with a message prompting the user to open a file within a notebook.

### 6.3 Onboarding Flow
1.  **Initialize:** User runs `Onyvore: Initialize Notebook` while focused on a directory. Onyvore creates the `.onyvore/` metadata directory and begins a background scan of all `.md` files within the notebook's scope. The notebook is immediately usable — search returns progressive results as indexing proceeds, and the link graph becomes available once the initial scan completes (see Section 4.4, Initial Notebook Computation).
2.  **Search:** Integrated search bar provides instant, scoped access to the active notebook's contents.

### 6.4 Command Palette Highlights
* `Onyvore: Initialize Notebook` (Create a new notebook in the focused directory).
* `Onyvore: Search Notebook` (Fuzzy-search overlay, scoped to the active notebook).

---

## 7. Comparison Analysis

| Feature | Joplin | Obsidian | **Onyvore** |
| :--- | :--- | :--- | :--- |
| **Storage** | SQLite DB | Markdown Files | **Markdown Files** |
| **Indexing** | Persistent DB | File Scan | **In-Memory (Orama)** |
| **Linking** | Manual | Manual (`[[wikilinks]]`) | **Automatic (NLP-computed)** |
| **File Mutation** | Yes | Yes (frontmatter) | **None (sidecar metadata)** |
| **Multi-notebook workspace** | Single profile | One vault per window | **Multiple notebooks per workspace** |
| **Portability** | Moderate | High | **Maximum (Self-Contained)** |
| **External Authoring** | No | Limited | **Full (Open Directory)** |

### Key Distinctions: Onyvore vs. Obsidian

Obsidian is Onyvore's closest competitor. Both are markdown-first, file-based knowledge management tools. The following distinctions define Onyvore's core value proposition:

**1. Automatic linking vs. manual wikilinks.**
Obsidian requires users to explicitly create `[[wikilinks]]` between notes. This means connections only exist where the user remembered to create them. Onyvore computes links automatically using NLP — every note is analyzed for noun phrases and matched against titles and headings across the notebook. Connections are discovered, not authored. For large knowledge bases, this surfaces relationships that manual linking would never capture.

**2. Zero file mutation vs. frontmatter injection.**
Obsidian injects YAML frontmatter into files and rewrites content when links are updated or files are renamed. Onyvore never touches user files. All metadata, links, and indexes are sidecar artifacts in `.onyvore/`. This makes Onyvore safe for environments where files are authored by multiple tools — AI agents, scripts, CI pipelines — because there is no risk of Onyvore's modifications conflicting with external writes.

**3. VS Code native vs. standalone application.**
Obsidian is a standalone Electron app with its own editor, plugin system, and window management. Onyvore runs inside VS Code, inheriting its full ecosystem — terminal, git integration, extensions, multi-root workspaces, remote development, and keyboard shortcuts. Users who already live in VS Code don't need to context-switch to a separate application for knowledge management.

**4. Multiple notebooks per workspace vs. one vault per window.**
Obsidian supports one vault per window. To work across multiple vaults, users must open multiple Obsidian windows. Onyvore supports multiple independent notebooks within a single VS Code workspace, with automatic active-notebook switching as the user moves between files.

**5. Agent-friendly by design.**
Obsidian's linking model assumes a human author creating `[[wikilinks]]` manually. AI agents and scripts would need to know Obsidian's link syntax, frontmatter conventions, and file mutation rules. Onyvore's open directory model requires nothing — an agent just writes a `.md` file to the directory, and Onyvore handles indexing, linking, and integration automatically. The zero-mutation guarantee means there are no conflicting writes between the extension and external tools.

---

## 8. Distribution Strategy
* **Universal VSIX:** A single bundle package under 2MB.
* **Platform Support:** Functioning immediately on Windows, macOS, and Linux.
* **Zero Setup:** No external installation of Bun, SQLite, or CLI tools required.

---

## 9. Future Considerations
* **Link Graph Visualization:** With the computed link graph already in place, a read-only force-directed graph view (via a VS Code Webview) is a natural addition. The data layer exists; only the rendering is needed.
* **Multilingual NLP:** compromise is English-only. Multilingual noun-phrase extraction would require evaluating alternative pure-JS NLP libraries or a pluggable extraction backend.
* **Cross-Notebook Search:** A workspace-level search that spans all notebooks, with results grouped by notebook. Requires aggregating across independent indexes.
