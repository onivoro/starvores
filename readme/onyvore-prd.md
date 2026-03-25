# Product Requirements Document: Onyvore

**Product Name:** Onyvore
**Version:** 1.0.0
**Status:** Final Specification
**Platform:** VS Code Extension (Node.js Runtime)
**Target:** Local-First, Distributed Knowledge Management

---

## 1. Executive Summary
**Onyvore** is a high-performance personal knowledge management (PKM) extension for VS Code. It bridges the gap between the structured reliability of **Joplin** and the networked intelligence of **Obsidian**. By treating every folder as an isolated, self-contained "Vault," Onyvore ensures that your data remains portable, private, and future-proof. Vaults are designed to be open directories — any tool, script, or AI agent can create or modify markdown files, and Onyvore will seamlessly integrate them. Onyvore never mutates user files; all metadata, links, and indexes are computed artifacts stored externally.

---

## 2. Core Philosophy
* **Markdown-First:** All notes are standard `.md` files. No proprietary databases.
* **Zero Mutation:** Onyvore never modifies user files. All metadata, link graphs, and indexes are derived artifacts stored in `.onyvore/`. Files remain exactly as authored.
* **Vault-Centric:** Settings, indexes, and computed artifacts are stored locally within each folder in a hidden `.onyvore/` directory.
* **Open Directory:** The vault is the folder. Any `.md` file in the directory is part of the vault, regardless of how it was created — by the extension, an AI agent, a script, or manual copy.
* **Zero-Binary:** No SQLite or native C++ dependencies. Built for universal distributability via Node.js.
* **Sovereign Sync:** Users choose their own infrastructure (S3 or Git Remote) without middleman services.
* **Zero-Secret Auth:** Leverages existing local environments (AWS Profiles) to avoid storing credentials within the extension.

---

## 3. Functional Requirements

### 3.1 Knowledge Organization
* **Notebook Sidebar:** A hierarchical tree view that renders folders as "Notebooks," providing a familiar structure for users migrating from traditional note-taking apps.
* **Automatic Link Graph:** Connections between notes are computed automatically — no manual linking syntax required. See Section 3.4 for the linking algorithm.
* **Backlinks Panel:** A dedicated sidebar panel displays all notes connected to the active note, ranked by link weight (strongest connections first).
* **Orphan Detection:** Notes with zero inbound and outbound links are surfaced in the sidebar as "Unlinked Notes," helping users discover disconnected knowledge. Computed directly from the link graph at zero additional cost.

### 3.2 File Watching
* **Continuous Monitoring:** Uses VS Code's `FileSystemWatcher` API to detect file creates, changes, and deletes within the vault in real-time, regardless of the source.
* **Incremental Updates:** File watcher events trigger incremental updates to the search index and link graph, keeping both current without full re-scans.
* **Deletion Cleanup:** When a file is deleted, its entries are removed from `metadata.json`, `links.json`, and the search index. Dangling backlinks (edges pointing to the deleted file) are pruned from the graph.

### 3.3 High-Performance Search
* **Search Engine:** Powered by **Orama**, a pure-TypeScript, in-memory search engine. Orama indexes the full text of each note, providing broad keyword and partial-match recall.
* **Fuzzy Matching:** Instant results for keyword and partial matches across the entire vault.
* **Graph-Boosted Ranking:** Search results are boosted by link graph centrality. Notes with more and stronger inbound links rank higher, surfacing well-connected notes above isolated ones with the same keyword relevance. This allows the link graph to improve search quality without constraining what is searchable.
* **Persistence:** The index is serialized to `.onyvore/index.bin` on exit to allow sub-100ms startup for large vaults (10,000+ notes).

### 3.4 Automatic Linking
Onyvore computes a weighted link graph between notes using deterministic noun-phrase extraction. The link graph and search index are intentionally separate pipelines — full-text search is broad and forgiving, while the link graph is selective and precise. The link graph feeds into search ranking (see Section 3.3) but does not constrain what is indexed.

**v1 is English-only.** The NLP library (compromise) supports English noun-phrase extraction. Multilingual support is a future consideration.

#### Trigger Model
The link graph is updated via file watcher events (Section 3.2). Any filesystem change — whether from the extension, an external agent, a git pull, or manual editing — triggers an incremental update. There is no separate "index operation" trigger; the file watcher is the single event source for both the search index and the link graph.

#### Extraction Pipeline
1. **Parse:** Note content is processed through **compromise** (pure-JS NLP library) to extract noun phrases.
2. **Filter — Stop Nouns:** Ultra-common nouns are removed (e.g., "time," "way," "thing," "part," "people," "day," "year," "example," "case"). This is a built-in static list, not user-configurable.
3. **Filter — Frequency Ceiling:** Noun phrases appearing in more than 40% of vault documents are excluded. This acts as a dynamic IDF-style cutoff — in a vault about cooking, "recipe" won't link everything, but "sourdough" will create meaningful connections. Note: this is a global computation. When a single file changes, the frequency of its noun phrases is recalculated against the full vault. If a noun phrase crosses the 40% threshold in either direction, affected edges across all files are added or removed.
4. **Filter — Minimum Length:** Single-character tokens and single-letter words are excluded.

#### Matching
Surviving noun phrases are matched against:
* **Note titles** (filenames without the `.md` extension).
* **Headings** (`#`, `##`, `###`, etc.) across all notes in the vault.

A match produces a weighted edge in the link graph. Links target the file as a whole, not specific headings within it.

#### Weighting
Each edge stores the occurrence count of the matched noun phrase in the source note:
```json
{ "source": "note-a.md", "target": "note-b.md", "noun": "sourdough", "weight": 5 }
```
Weight is used to rank backlinks — notes with stronger connections surface first in the Backlinks Panel.

### 3.5 Versioning & Metadata (Optional Git)
* **Checkpointing:** If a `.git` folder is detected, Onyvore performs background "checkpoint" commits on every file save.
* **Timeline Integration:** Users access granular history through the native VS Code "Timeline" view.
* **Git-Derived Timestamps:** When Git is available, Onyvore derives created and updated timestamps from git log (first commit date and last commit date for each file). These timestamps are stored in `metadata.json` as a progressive enhancement. When Git is absent, timestamps fall back to filesystem stat (birth time / modification time), which may be less reliable (e.g., copied files lose their original creation date).
* **Stateless Fallback:** If Git is absent, Onyvore operates in "Basic Mode," relying on filesystem state and optional S3 versioning/conflict files.

---

## 4. Technical Architecture

### 4.1 Data Persistence (`.onyvore/` Folder)
Each workspace folder initialized as an Onyvore Vault contains:
* `config.json`: Stores vault-specific settings (Sync Provider choice, AWS Profile Name, S3 Bucket, or Git Remote name).
* `index.bin`: A serialized binary snapshot of the Orama search index.
* `links.json`: The computed weighted link graph between all notes in the vault.
* `metadata.json`: Derived metadata for each note (timestamps, extracted headings). Timestamps are git-derived when available, filesystem-stat-derived otherwise. See Section 3.5.
* `sync-state.json`: Tracks file ETags and timestamps to manage synchronization logic and conflict detection.

All files in `.onyvore/` are derived artifacts. They can be deleted and fully regenerated from the vault's `.md` files (and git history, if available).

### 4.2 Gitignore
On vault initialization, Onyvore adds `.onyvore/` to the project's `.gitignore` file (creating it if necessary). All `.onyvore/` contents are derived artifacts that should not be committed:
* `index.bin` is a binary blob that would cause merge conflicts.
* `links.json` and `metadata.json` are recomputable from source files.
* `config.json` and `sync-state.json` are machine-specific.

### 4.3 Modular Synchronization
Synchronization is an optional enhancement. Users can choose one or neither. Both providers sync **user content only** (`.md` files and other non-`.onyvore/` files). The `.onyvore/` directory is excluded — each machine recomputes its own derived artifacts from the synced content.

#### **Provider A: S3 (Object Storage)**
* **Authentication:** Uses `@aws-sdk/credential-providers` to resolve credentials from a named **AWS Profile** (e.g., `default`, `personal-s3`) in the user's `~/.aws/credentials` file. No Access Keys or Secrets are stored by the extension.
* **Sync Scope:** All files in the vault directory except `.onyvore/`. S3 sync treats `.onyvore/` the same way git treats gitignored paths.
* **Conflict Handling:** Uses S3 ETags to detect if a remote file has changed. Opens the VS Code Merge Editor for side-by-side resolution if local/remote versions diverge.

#### **Provider B: Git Remote**
* **Implementation:** Interacts with the `vscode.git` API.
* **Sync Scope:** All tracked files. `.onyvore/` is gitignored (see Section 4.2).
* **Workflow:** Automatic `pull --rebase` on vault activation and background `push` after local commits.

### 4.4 Technology Stack
* **Runtime:** Node.js (VS Code Extension Host).
* **Search Engine:** Orama (Pure JS).
* **NLP:** compromise (Pure JS noun-phrase extraction).
* **Cloud SDK:** AWS SDK v3 (Modular packages to minimize bundle size).
* **Bundler:** `esbuild` (Compiles all dependencies into a single, lightweight `extension.js`).

---

## 5. User Experience (UX)

### 5.1 Onboarding Flow
1.  **Initialize:** User runs `Onyvore: Initialize Vault`. Onyvore scans the folder, creates the `.onyvore/` metadata directory, adds `.onyvore/` to `.gitignore`, and indexes all existing `.md` files — including any already present in the directory. The link graph is computed on first initialization.
2.  **Configure:** User selects a sync method via a VS Code Walkthrough or Command Palette.
3.  **Search:** Integrated search bar provides instant, scoped access to the vault's contents.

### 5.2 Command Palette Highlights
* `Onyvore: Search Vault` (Fuzzy-search overlay).
* `Onyvore: Sync Now` (Manual sync trigger).

---

## 6. Comparison Analysis

| Feature | Joplin | Obsidian | **Onyvore** |
| :--- | :--- | :--- | :--- |
| **Storage** | SQLite DB | Markdown Files | **Markdown Files** |
| **Indexing** | Persistent DB | File Scan | **In-Memory (Orama)** |
| **Linking** | Manual | Manual (`[[wikilinks]]`) | **Automatic (NLP-computed)** |
| **File Mutation** | Yes | Yes (frontmatter) | **None (sidecar metadata)** |
| **Sync** | Dropbox/OneDrive | Paid/Manual | **S3 (Profiles) / Git Remote** |
| **Secrets** | Managed in App | Managed in App | **None (Native OS Auth)** |
| **Portability** | Moderate | High | **Maximum (Self-Contained)** |
| **External Authoring** | No | Limited | **Full (Open Directory)** |

---

## 7. Distribution Strategy
* **Universal VSIX:** A single bundle package under 2MB.
* **Platform Support:** Functioning immediately on Windows, macOS, and Linux.
* **Zero Setup:** No external installation of Bun, SQLite, or CLI tools required.

---

## 8. Future Considerations
* **Link Graph Visualization:** With the computed link graph already in place, a read-only force-directed graph view (via a VS Code Webview) is a natural addition. The data layer exists; only the rendering is needed.
* **Multilingual NLP:** compromise is English-only. Multilingual noun-phrase extraction would require evaluating alternative pure-JS NLP libraries or a pluggable extraction backend.
