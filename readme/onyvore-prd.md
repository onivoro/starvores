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

### 3.2 File Watching
* **Continuous Monitoring:** Uses VS Code's `FileSystemWatcher` API to detect file creates, changes, and deletes within the vault in real-time, regardless of the source.
* **Incremental Indexing:** File watcher events trigger incremental updates to the search index and link graph, keeping both current without full re-scans.

### 3.3 High-Performance Search
* **Search Engine:** Powered by **Orama**, a pure-TypeScript, in-memory search engine. Orama indexes the full text of each note, providing broad keyword and partial-match recall.
* **Fuzzy Matching:** Instant results for keyword and partial matches across the entire vault.
* **Graph-Boosted Ranking:** Search results are boosted by link graph centrality. Notes with more and stronger inbound links rank higher, surfacing well-connected notes above isolated ones with the same keyword relevance. This allows the link graph to improve search quality without constraining what is searchable.
* **Persistence:** The index is serialized to `.onyvore/index.bin` on exit to allow sub-100ms startup for large vaults (10,000+ notes).

### 3.4 Automatic Linking
Onyvore computes a weighted link graph between notes using deterministic noun-phrase extraction. The graph is rebuilt incrementally on save, commit, and index operations. The link graph and search index are intentionally separate pipelines — full-text search is broad and forgiving, while the link graph is selective and precise. The link graph feeds into search ranking (see Section 3.3) but does not constrain what is indexed.

#### Extraction Pipeline
1. **Parse:** Note content is processed through **compromise** (pure-JS NLP library) to extract noun phrases.
2. **Filter — Stop Nouns:** Ultra-common nouns are removed (e.g., "time," "way," "thing," "part," "people," "day," "year," "example," "case"). This is a built-in static list, not user-configurable.
3. **Filter — Frequency Ceiling:** Noun phrases appearing in more than 40% of vault documents are excluded. This acts as a dynamic IDF-style cutoff — in a vault about cooking, "recipe" won't link everything, but "sourdough" will create meaningful connections.
4. **Filter — Minimum Length:** Single-character tokens and single-letter words are excluded.

#### Matching
Surviving noun phrases are matched against:
* **Note titles** (filenames without the `.md` extension).
* **Headings** (`#`, `##`, `###`, etc.) across all notes in the vault.

A match produces a weighted edge in the link graph.

#### Weighting
Each edge stores the occurrence count of the matched noun phrase in the source note:
```json
{ "source": "note-a.md", "target": "note-b.md", "noun": "sourdough", "weight": 5 }
```
Weight is used to rank backlinks — notes with stronger connections surface first in the Backlinks Panel.

### 3.5 Versioning (Optional Git)
* **Checkpointing:** If a `.git` folder is detected, Onyvore performs background "checkpoint" commits on every file save.
* **Timeline Integration:** Users access granular history through the native VS Code "Timeline" view.
* **Stateless Fallback:** If Git is absent, Onyvore operates in "Basic Mode," relying on filesystem state and optional S3 versioning/conflict files.

---

## 4. Technical Architecture

### 4.1 Data Persistence (`.onyvore/` Folder)
Each workspace folder initialized as an Onyvore Vault contains:
* `config.json`: Stores vault-specific settings (Sync Provider choice, AWS Profile Name, S3 Bucket, or Git Remote name).
* `index.bin`: A serialized binary snapshot of the Orama search index.
* `links.json`: The computed weighted link graph between all notes in the vault.
* `metadata.json`: Derived metadata for each note (created/updated timestamps, unique IDs, extracted headings). Source of truth for metadata without mutating user files.
* `sync-state.json`: Tracks file ETags and timestamps to manage synchronization logic and conflict detection.

### 4.2 Modular Synchronization
Synchronization is an optional enhancement. Users can choose one or neither:

#### **Provider A: S3 (Object Storage)**
* **Authentication:** Uses `@aws-sdk/credential-providers` to resolve credentials from a named **AWS Profile** (e.g., `default`, `personal-s3`) in the user's `~/.aws/credentials` file. No Access Keys or Secrets are stored by the extension.
* **Conflict Handling:** Uses S3 ETags to detect if a remote file has changed. Opens the VS Code Merge Editor for side-by-side resolution if local/remote versions diverge.

#### **Provider B: Git Remote**
* **Implementation:** Interacts with the `vscode.git` API.
* **Workflow:** Automatic `pull --rebase` on vault activation and background `push` after local commits.

### 4.3 Technology Stack
* **Runtime:** Node.js (VS Code Extension Host).
* **Search Engine:** Orama (Pure JS).
* **NLP:** compromise (Pure JS noun-phrase extraction).
* **Cloud SDK:** AWS SDK v3 (Modular packages to minimize bundle size).
* **Bundler:** `esbuild` (Compiles all dependencies into a single, lightweight `extension.js`).

---

## 5. User Experience (UX)

### 5.1 Onboarding Flow
1.  **Initialize:** User runs `Onyvore: Initialize Vault`. Onyvore scans the folder, creates the `.onyvore/` metadata directory, and indexes all existing `.md` files — including any already present in the directory. The link graph is computed on first initialization.
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
