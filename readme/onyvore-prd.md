# Product Requirements Document: Onyvore

**Product Name:** Onyvore
**Version:** 1.0.0
**Status:** Final Specification
**Platform:** VS Code Extension (Node.js Runtime)
**Target:** Local-First, Distributed Knowledge Management

---

## 1. Executive Summary
**Onyvore** is a high-performance personal knowledge management (PKM) extension for VS Code. It bridges the gap between the structured reliability of **Joplin** and the networked intelligence of **Obsidian**. Onyvore organizes knowledge into **notebooks** — directories marked by a `.onyvore/` folder — each with its own isolated search index, link graph, metadata, and sync configuration. A single VS Code workspace can contain multiple independent notebooks. Onyvore never mutates user files; all metadata, links, and indexes are computed artifacts stored externally. Notebooks are designed to be open directories — any tool, script, or AI agent can create or modify markdown files, and Onyvore will seamlessly integrate them.

---

## 2. Definitions

### Workspace
The VS Code window. A workspace is the top-level directory (or multi-root configuration) open in VS Code. The workspace itself is not a notebook — it merely contains one or more notebooks. Onyvore discovers notebooks by scanning the workspace for `.onyvore/` directories.

### Notebook
A directory containing a `.onyvore/` directory. A notebook is the fundamental unit of organization in Onyvore. Each notebook is **fully isolated** — it has its own search index, link graph, metadata, sync configuration, and `.onyvoreignore` file. Notes in one notebook cannot link to or appear in search results from another notebook.

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
`.md` files that are not inside any notebook (i.e., not under any directory containing `.onyvore/`). These files are visible in the VS Code file explorer but invisible to Onyvore — not indexed, not linked, not synced. To manage them, the user either initializes a notebook at a parent directory or moves the files into an existing notebook.

---

## 3. Core Philosophy
* **Markdown-First:** All notes are standard `.md` files. No proprietary databases.
* **Zero Mutation:** Onyvore never modifies user files. All metadata, link graphs, and indexes are derived artifacts stored in `.onyvore/`. Files remain exactly as authored.
* **Notebook-Centric:** Each notebook is self-contained. Settings, indexes, and computed artifacts are stored locally within the notebook's `.onyvore/` directory.
* **Open Directory:** Any `.md` file in a notebook directory (recursively, unlimited depth) is part of that notebook, regardless of how it was created — by the extension, an AI agent, a script, or manual copy. Non-markdown files (images, PDFs, etc.) coexist in the notebook and are synced, but only `.md` files are indexed, linked, and searched.
* **Zero-Binary:** No SQLite or native C++ dependencies. Built for universal distributability via Node.js.
* **Sovereign Sync:** Users choose their own infrastructure (S3, Git Remote, or both) without middleman services. Each notebook is configured independently.
* **Zero-Secret Auth:** Leverages existing local environments (AWS Profiles, SSH keys) to avoid storing credentials within the extension.

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
The link graph is updated via file watcher events (Section 4.2). Any filesystem change — whether from the extension, an external agent, a sync pull, or manual editing — triggers an incremental update. There is no separate "index operation" trigger; the file watcher is the single event source for both the search index and the link graph.

#### Initial Notebook Computation
On first initialization (or when `.onyvore/` is absent/deleted), the full notebook must be scanned to build the search index, extract all noun phrases, compute global frequencies, and generate the link graph. This is a materially heavier operation than incremental updates and is handled as a **non-blocking background process:**

1. **Immediate availability:** The Notebook Sidebar, file editing, and sync configuration are available immediately. The notebook is usable before initialization completes.
2. **Progressive search:** The search index is populated incrementally as files are processed. Search works immediately but returns partial results until the scan completes. A status bar indicator shows initialization progress.
3. **Link graph deferred:** The link graph requires global frequency data (the 40% ceiling) and cannot produce correct results until all files are scanned. The Backlinks Panel and Orphan Detection display an "Indexing…" state until the background process completes.
4. **File watcher active during init:** Files created or modified during initialization are queued and processed after the initial scan completes, ensuring no changes are lost.

The exact implementation of the background computation pipeline (batching, concurrency, memory management for large notebooks) requires further design consideration beyond this specification.

#### Startup Reconciliation
When the extension activates and a notebook's `.onyvore/` directory already exists (i.e., not a first-time initialization), the persisted index and link graph may be stale — files could have been created, modified, or deleted while the extension was not running (e.g., by an AI agent, a script, a git operation, or manual editing). Onyvore reconciles the persisted state against the current filesystem on every startup:

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

### 4.5 Versioning & Metadata
Onyvore follows a **progressive enhancement** model. All core features — notebook sidebar, search, link graph, backlinks, orphan detection, and S3 sync — work regardless of whether Git is installed. Git enhances the experience with checkpointing, history, precise timestamps, and robust conflict resolution, but is never required.

| Feature | Without Git | With Git |
| :--- | :--- | :--- |
| **Notebook, Search, Link Graph** | Full | Full |
| **S3 Sync (Pull/Push)** | Full | Full |
| **Conflict Resolution** | Keep-both sidecars | Git merge tooling |
| **Change Detection (for sync)** | File hash comparison against `sync-state.json` | Git-aware (dirty working tree detection) |
| **Checkpointing** | Not available | Automatic on save |
| **History / Timeline** | Not available | Full via VS Code Timeline |
| **Metadata Timestamps** | Filesystem stat (less reliable) | Git log (first/last commit date) |

#### Git Versioning (when Git is installed)
* **Checkpointing:** Onyvore performs background "checkpoint" commits on every file save. Checkpointing and indexing are independent reactions to the same save event — the file watcher handles index/link updates, while a separate listener triggers the checkpoint commit. These run in parallel with no dependency between them. A `git commit` only modifies `.git/` internals and does not trigger the file watcher.
* **Timeline Integration:** Users access granular history through the native VS Code "Timeline" view.
* **Git-Derived Timestamps:** Onyvore derives created and updated timestamps from git log (first commit date and last commit date for each file). These timestamps are stored in `metadata.json` as a progressive enhancement.

#### Metadata Timestamps (without Git)
When Git is absent, timestamps fall back to filesystem stat (birth time / modification time), which may be less reliable (e.g., copied files lose their original creation date).

---

## 5. Technical Architecture

### 5.1 Data Persistence (`.onyvore/` Folder)
Each notebook contains a `.onyvore/` directory with:
* `config.json`: Stores notebook-specific settings (AWS Profile Name, S3 Bucket, Git Remote name).
* `index.bin`: A serialized binary snapshot of the Orama search index.
* `links.json`: The computed weighted link graph between all notes in the notebook.
* `metadata.json`: Derived metadata for each note (timestamps, extracted headings). Timestamps are git-derived when available, filesystem-stat-derived otherwise. See Section 4.5.
* `sync-state.json`: Tracks S3 ETags and local file hashes to manage synchronization logic.
* `conflicts/`: Temporary directory for staging remote file versions during S3 conflict resolution (see Section 5.3). Empty when no conflicts are pending.

All files in `.onyvore/` are derived or transient artifacts. They can be deleted and fully regenerated from the notebook's `.md` files (and git history, if available).

### 5.2 Ignore Files

#### `.gitignore`
On notebook initialization, if a `.git` folder is detected, Onyvore adds `.onyvore/` to the project's `.gitignore` file (creating it if necessary). All `.onyvore/` contents are derived artifacts that should not be committed:
* `index.bin` is a binary blob that would cause merge conflicts.
* `links.json` and `metadata.json` are recomputable from source files.
* `config.json` and `sync-state.json` are machine-specific.
* `conflicts/` contains transient staging files.

#### `.onyvoreignore`
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

Ignored paths are **not** excluded from S3 sync. Sync operates on the full notebook directory (all files except `.onyvore/`). The `.onyvoreignore` file controls what Onyvore indexes, not what it syncs.

### 5.3 Synchronization
All sync operations are **manually initiated** by the user and scoped to a single notebook. There is no automatic sync on activation or background push. Sync scope is **user content only** — all files in the notebook directory except `.onyvore/`. Nested notebooks are excluded from the parent's sync — each notebook syncs independently. Each machine recomputes its own derived artifacts from the synced content.

#### Remote Transport: S3 (Object Storage)
S3 is a dumb file transport. It uploads and downloads files. It does not resolve conflicts.

* **Authentication:** Uses `@aws-sdk/credential-providers` to resolve credentials from a named **AWS Profile** (e.g., `default`, `personal-s3`) in the user's `~/.aws/credentials` file. No Access Keys or Secrets are stored by the extension.
* **Sync Scope:** All files in the notebook directory except `.onyvore/` and nested notebook directories, with no file size cap. This includes non-markdown files (images, PDFs, attachments, etc.). The `.onyvoreignore` file does not affect sync scope — it only controls indexing.

##### S3 Pull Flow
1. Onyvore lists objects in the configured S3 bucket/prefix.
2. For each remote file, compares the S3 ETag against the ETag stored in `sync-state.json`.
3. **No local changes, remote changed:** Download the remote version, overwrite local. Update `sync-state.json`.
4. **Local changed, no remote change:** No action (local is ahead; changes will be pushed).
5. **Both changed (conflict):**
   * **Git installed:** Download the remote version to `.onyvore/conflicts/<filename>`. Apply the remote version to the working tree. Git detects the change as an unstaged modification against the last checkpoint commit. The user resolves via VS Code's built-in Git merge/diff tooling. After resolution, the user commits the result and the conflict staging file is cleaned up.
   * **Git not installed:** Download the remote version to `.onyvore/conflicts/<filename>`. Create a sidecar file `<filename>.conflict.md` in the notebook containing the remote version. Both versions are preserved for the user to manually reconcile. The conflict is recorded in `sync-state.json` so it resurfaces on subsequent syncs until resolved.
6. **Remote deleted, local exists:** Prompt the user to confirm deletion or keep the local copy.
7. Files changed on disk by the pull trigger file watcher events, which update the search index and link graph automatically.

##### S3 Push Flow
1. Onyvore scans the notebook for files that have changed since the last sync (comparing local file hashes against `sync-state.json`).
2. **Pending conflicts block push.** If any unresolved conflicts exist in `sync-state.json`, the push is aborted with a message directing the user to resolve conflicts first.
3. Changed files are uploaded to S3. `sync-state.json` is updated with new ETags.
4. Locally deleted files are deleted from S3.

#### Remote Transport: Git Remote
When Git is installed and a remote is configured, sync operates through standard Git mechanisms.

* **Implementation:** Interacts with the `vscode.git` API.
* **Sync Scope:** All tracked files. `.onyvore/` is gitignored (see Section 5.2).
* **Pull:** `git pull --rebase` from the configured remote. Conflicts are resolved through Git's native merge tooling in VS Code. Files changed by the pull trigger file watcher events, which update the search index and link graph automatically.
* **Push:** `git push` to the configured remote. Onyvore verifies the working tree is clean (all checkpoint commits are up to date) before pushing.

#### Using S3 and Git Together
S3 and Git Remote can be configured simultaneously on a notebook. In this configuration, Git Remote is the primary sync mechanism (it handles versioning and conflict resolution natively). S3 serves as a secondary backup or as a transport for non-developer collaborators who don't use Git. Users manage each independently via separate commands.

### 5.4 Technology Stack
* **Runtime:** Node.js (VS Code Extension Host).
* **Search Engine:** Orama (Pure JS).
* **NLP:** compromise (Pure JS noun-phrase extraction).
* **Cloud SDK:** AWS SDK v3 (Modular packages to minimize bundle size).
* **Bundler:** `esbuild` (Compiles all dependencies into a single, lightweight `extension.js`).

---

## 6. User Experience (UX)

### 6.1 Notebook Discovery
On workspace activation, Onyvore scans the workspace for directories containing `.onyvore/`. Each discovered notebook is registered and its file watcher, search index, and link graph are initialized. New notebooks can be created at any time via the Command Palette.

### 6.2 Active Notebook
The **active notebook** is the notebook that contains the file currently focused in the editor. All notebook-scoped commands (Search, Pull, Push) operate on the active notebook. The active notebook is determined automatically:

* **By focused file:** When the user opens or switches to a file, Onyvore resolves which notebook owns that file and sets it as active. If the file is unmanaged (not inside any notebook), there is no active notebook.
* **Status bar indicator:** The active notebook's name (its directory name) is displayed in the VS Code status bar. This provides constant visibility into which notebook commands will target. If no notebook is active, the status bar shows "No Notebook."
* **No manual selection required.** The active notebook always follows focus. There is no "pin" or "lock" mechanism — switching to a file in a different notebook switches the active notebook.

When no notebook is active, notebook-scoped commands (Search, Pull, Push) are disabled with a message prompting the user to open a file within a notebook.

### 6.3 Onboarding Flow
1.  **Initialize:** User runs `Onyvore: Initialize Notebook` while focused on a directory. Onyvore creates the `.onyvore/` metadata directory, adds `.onyvore/` to `.gitignore` (if Git is detected), and begins a background scan of all `.md` files within the notebook's scope. The notebook is immediately usable — search returns progressive results as indexing proceeds, and the link graph becomes available once the initial scan completes (see Section 4.4, Initial Notebook Computation).
2.  **Configure:** User optionally configures a sync target (S3 bucket, Git Remote, or both) via a VS Code Walkthrough or Command Palette. Configuration is per-notebook.
3.  **Search:** Integrated search bar provides instant, scoped access to the active notebook's contents.

### 6.4 Command Palette Highlights
* `Onyvore: Initialize Notebook` (Create a new notebook in the focused directory).
* `Onyvore: Search Notebook` (Fuzzy-search overlay, scoped to the active notebook).
* `Onyvore: Pull` (Pull changes from configured remote — S3 or Git — for the active notebook).
* `Onyvore: Push` (Push local changes to configured remote — S3 or Git — for the active notebook).

---

## 7. Comparison Analysis

| Feature | Joplin | Obsidian | **Onyvore** |
| :--- | :--- | :--- | :--- |
| **Storage** | SQLite DB | Markdown Files | **Markdown Files** |
| **Indexing** | Persistent DB | File Scan | **In-Memory (Orama)** |
| **Linking** | Manual | Manual (`[[wikilinks]]`) | **Automatic (NLP-computed)** |
| **File Mutation** | Yes | Yes (frontmatter) | **None (sidecar metadata)** |
| **Multi-notebook workspace** | Single profile | One vault per window | **Multiple notebooks per workspace** |
| **Sync** | Dropbox/OneDrive | Paid/Manual | **S3 / Git Remote (manual, per-notebook)** |
| **Conflict Resolution** | Last-write-wins | Manual | **Git merge (full) / Keep-both (basic)** |
| **Secrets** | Managed in App | Managed in App | **None (Native OS Auth)** |
| **Portability** | Moderate | High | **Maximum (Self-Contained)** |
| **External Authoring** | No | Limited | **Full (Open Directory)** |

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
