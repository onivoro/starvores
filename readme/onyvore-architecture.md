# Onyvore Technical Architecture

**Companion to:** `onyvore-prd.md`
**Purpose:** Implementation-level decisions for building Onyvore. The PRD defines *what* and *why*; this document defines *how*.

---

## 1. Project Structure

Onyvore follows the `@onivoro/server-vscode` three-tier architecture. Four Nx projects compose the extension:

| Project | Location | Runtime | Build | Purpose |
|---|---|---|---|---|
| `app-vscode-onyvore` | `apps/vscode/onyvore/` | Extension Host | Webpack | Orchestrator: spawns stdio server, serves webview, registers commands, manages file watchers, tracks active notebook |
| `app-stdio-onyvore` | `apps/stdio/onyvore/` | Node.js (child process) | Webpack | Backend: NLP extraction, Orama indexing, link graph computation, `.onyvore/` persistence, startup reconciliation |
| `app-browser-onyvore` | `apps/browser/onyvore/` | Browser (webview) | Vite | React UI: Notebook Sidebar, Links Panel, Orphan Detection, Search overlay |
| `lib-isomorphic-onyvore` | `libs/isomorphic/onyvore/` | Any | Vite | Shared types, command constants, JSON-RPC method names |

### 1.1 Dependency Graph

```
app-vscode-onyvore
├── dependsOn: app-stdio-onyvore:build
├── dependsOn: app-browser-onyvore:build
└── imports: lib-isomorphic-onyvore

app-stdio-onyvore
└── imports: lib-isomorphic-onyvore

app-browser-onyvore
└── imports: lib-isomorphic-onyvore
```

### 1.2 Directory Layouts

**Extension Host** (`apps/vscode/onyvore/`)
```
├── project.json
├── package.json                          # VS Code extension manifest
├── .vscodeignore
├── webpack.config.js
├── tsconfig.json                         # extends tsconfig.server.json
├── tsconfig.app.json                     # types: ["node", "vscode"]
├── tsconfig.spec.json
└── src/
    ├── main.ts                           # createExtensionFromModule()
    ├── assets/
    │   └── icon.svg
    └── app/
        ├── onyvore-extension.module.ts   # @VscodeExtensionModule + @Module
        ├── classes/
        │   └── onyvore-webview-provider.class.ts
        └── services/
            ├── onyvore-command-handler.service.ts
            ├── onyvore-webview-handler.service.ts
            ├── onyvore-server-notification-handler.service.ts
            ├── notebook-discovery.service.ts
            ├── active-notebook.service.ts
            └── file-watcher.service.ts
```

**Stdio Server** (`apps/stdio/onyvore/`)
```
├── project.json
├── webpack.config.js
├── tsconfig.json                         # extends tsconfig.server.json
├── tsconfig.app.json
├── tsconfig.spec.json
└── src/
    ├── main.ts                           # bootstrapStdioApp()
    └── app/
        ├── app-stdio-onyvore.module.ts
        ├── app-stdio-onyvore-config.class.ts
        └── services/
            ├── onyvore-message-handler.service.ts
            ├── nlp.service.ts
            ├── search-index.service.ts
            ├── link-graph.service.ts
            ├── metadata.service.ts
            ├── persistence.service.ts
            └── reconciliation.service.ts
```

**Browser Webview** (`apps/browser/onyvore/`)
```
├── project.json
├── index.html
├── vite.config.ts
├── tsconfig.json                         # extends tsconfig.web.json
├── tsconfig.app.json
└── src/
    ├── main.tsx
    └── app/
        ├── app.tsx
        ├── components/
        │   ├── NotebookSidebar.tsx
        │   ├── NotebookTree.tsx
        │   ├── UnlinkedNotes.tsx
        │   ├── LinksPanel.tsx
        │   ├── OutboundLinks.tsx
        │   ├── InboundLinks.tsx
        │   └── SearchOverlay.tsx
        ├── hooks/
        │   └── use-rpc-request.hook.ts
        └── state/
            ├── store.ts
            ├── middleware/
            │   └── message-bus.middleware.ts
            ├── slices/
            │   ├── jsonrpc-request-entity.slice.ts
            │   ├── jsonrpc-response-entity.slice.ts
            │   ├── notebooks.slice.ts
            │   ├── active-notebook.slice.ts
            │   ├── links.slice.ts
            │   └── search-results.slice.ts
            └── types/
                └── root-state.type.ts
```

**Shared Library** (`libs/isomorphic/onyvore/`)
```
├── project.json
├── tsconfig.json                         # extends tsconfig.isomorphic.json
├── tsconfig.lib.json
├── tsconfig.spec.json
└── src/
    ├── index.ts                          # barrel export
    └── lib/
        ├── constants/
        │   ├── onyvore-commands.constant.ts
        │   ├── onyvore-rpc-methods.constant.ts
        │   └── stop-nouns.constant.ts
        └── types/
            ├── notebook.types.ts
            ├── edge.types.ts
            ├── metadata.types.ts
            ├── links-panel.types.ts
            └── file-event.types.ts
```

---

## 2. Communication Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  VS Code Extension Host (apps/vscode/onyvore)                    │
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────────────────────┐  │
│  │ CommandHandlers     │  │ WebviewHandlers                    │  │
│  │ • initializeNotebook│  │ • getNotebooks                    │  │
│  │ • discoverNotebooks │  │ • getLinksForNote                 │  │
│  │ • searchNotebook    │  │ • getSearchResults                │  │
│  │ • rebuildNotebook   │  │ • openFile (→ vscode.open)        │  │
│  └────────────────────┘  │ • getActiveNotebook                │  │
│                          │ • pickDirectory (→ vscode.showOpen) │  │
│  ┌────────────────────┐  └────────────────────────────────────┘  │
│  │ ServerNotification  │                                         │
│  │ Handlers            │  ┌────────────────────────────────────┐  │
│  │ • initProgress      │  │ FileWatcherService                 │  │
│  │ • reconcileProgress │  │ • FileSystemWatcher per notebook   │  │
│  │ • notebookReady     │  │ • 300ms debounce                  │  │
│  │ • indexUpdated       │  │ • forwards events to stdio server │  │
│  └────────────────────┘  └────────────────────────────────────┘  │
│           ▲                          ▲                            │
└───────────┼──────────────────────────┼────────────────────────────┘
            │ stdio JSON-RPC           │ postMessage
            ▼                          ▼
┌──────────────────────────┐  ┌─────────────────────────────────────┐
│ Stdio Server             │  │ React Webview                       │
│ (apps/stdio/onyvore)     │  │ (apps/browser/onyvore)              │
│                          │  │                                     │
│ NlpService               │  │ NotebookSidebar                     │
│ SearchIndexService       │  │ ├── NotebookTree (per notebook)     │
│ LinkGraphService         │  │ └── UnlinkedNotes                   │
│ MetadataService          │  │ LinksPanel                          │
│ PersistenceService       │  │ ├── OutboundLinks                   │
│ ReconciliationService    │  │ └── InboundLinks                    │
│                          │  │ SearchOverlay                       │
│ @StdioHandler methods    │  │                                     │
│ Progress notifications   │  │ Redux + MessageBus middleware       │
└──────────────────────────┘  └─────────────────────────────────────┘
```

### 2.1 Message Flow

**File change → index update → UI refresh:**
1. `FileWatcherService` (extension host) detects `.md` file event
2. Debounces 300ms, then sends `notebook.fileEvent` request to stdio server
3. Stdio server processes event (NLP, index, link graph, persist)
4. Stdio server sends `notebook.indexUpdated` notification back to extension
5. Extension broadcasts notification to webview
6. Webview Redux store updates, React components re-render

**User searches:**
1. User triggers `Onyvore: Search Notebook` → command handler
2. Webview `SearchOverlay` renders, user types query
3. Webview dispatches `notebook.search` request via Redux middleware
4. Stdio server runs Orama query with graph boost, returns ranked results
5. Response lands in Redux store → `SearchOverlay` renders results

**User clicks link in Links Panel:**
1. Webview dispatches `openFile` to extension via `@WebviewHandler`
2. Extension host calls `vscode.window.showTextDocument()` to open the target note
3. Active notebook may change → `active-notebook.slice` updates → Links Panel re-renders for the new note

---

## 3. Tier Responsibilities

### 3.1 Extension Host (`app-vscode-onyvore`)

The extension host is the orchestrator. It owns VS Code API access and delegates all computation to the stdio server.

**Services:**

| Service | Responsibility |
|---|---|
| `OnyvoreCommandHandlerService` | `@CommandHandler` methods for all command palette commands (PRD Section 6.4) |
| `OnyvoreWebviewHandlerService` | `@WebviewHandler` methods for webview-initiated requests (`openFile`, `pickDirectory`, `getActiveNotebook`, `getConfiguration`) |
| `OnyvoreServerNotificationHandlerService` | `@ServerNotificationHandler` methods for progress updates, index-updated events |
| `NotebookDiscoveryService` | Scans workspace for `.onyvore/` directories. Runs on activation and on `Onyvore: Discover Notebooks`. Registers discovered notebooks with the stdio server |
| `ActiveNotebookService` | Listens to `vscode.window.onDidChangeActiveTextEditor`. Resolves which notebook owns the focused file. Updates the status bar indicator. Notifies the webview of active notebook changes |
| `FileWatcherService` | Creates one `vscode.FileSystemWatcher` per registered notebook. Applies `.onyvoreignore` exclusions. Watches `.onyvoreignore` for changes. Debounces events (300ms). Forwards batched events to the stdio server via JSON-RPC |

**Key design decision:** The extension host does NOT run compromise, Orama, or any link graph computation. It is a thin layer over VS Code APIs that routes events to the stdio server. This keeps the extension host responsive — NLP and indexing run in the child process without blocking the UI.

### 3.2 Stdio Server (`app-stdio-onyvore`)

The stdio server is where the PRD's functional requirements are implemented. It runs as a NestJS child process spawned by the extension host, communicating via stdio JSON-RPC.

**Services:**

| Service | Responsibility |
|---|---|
| `OnyvoreMessageHandlerService` | `@StdioHandler` methods — the JSON-RPC API surface. Routes requests to domain services |
| `NlpService` | Wraps compromise. Extracts noun phrases from markdown content. Runs the extraction pipeline (PRD Section 4.4): parse → decompose → stop nouns → min length |
| `SearchIndexService` | Wraps Orama. Manages per-notebook in-memory search indexes. Handles document insert/update/remove. Runs search queries with graph-boosted ranking. Serializes/deserializes `index.bin` |
| `LinkGraphService` | Manages per-notebook link graphs. Matches noun phrases against note titles. Computes edges (one per source-target pair, aggregated counts). Handles create/change/delete/reverse-match operations. Serializes/deserializes `links.json` |
| `MetadataService` | Manages per-notebook `metadata.json`. Tracks last-seen modification times. Provides the diff-against-filesystem API for reconciliation |
| `PersistenceService` | Writes `index.bin`, `links.json`, `metadata.json` to disk. Called after each debounced batch and on deactivation. Handles periodic checkpointing during initial computation |
| `ReconciliationService` | Runs on startup for existing notebooks. Loads persisted state, diffs against filesystem, processes deltas via create/change/delete paths. Sends progress notifications to extension host |

**StdioHandler methods (JSON-RPC API):**

| Method | Direction | Purpose |
|---|---|---|
| `notebook.register` | ext → server | Register a discovered notebook (path, initial state) |
| `notebook.unregister` | ext → server | Remove a notebook (e.g., `.onyvore/` deleted) |
| `notebook.fileEvent` | ext → server | Batched file watcher events (create/change/delete array) |
| `notebook.ignoreChanged` | ext → server | `.onyvoreignore` was modified — re-evaluate all files |
| `notebook.search` | webview → server | Full-text search query for active notebook |
| `notebook.getLinks` | webview → server | Get outbound + inbound links for a specific note |
| `notebook.getNotebooks` | webview → server | List all registered notebooks with their file trees |
| `notebook.getOrphans` | webview → server | Get unlinked notes for a notebook |
| `notebook.rebuild` | ext → server | Delete derived artifacts and re-index from scratch |
| `notebook.reconcile` | ext → server | Trigger startup reconciliation for a notebook |
| `notebook.initialize` | ext → server | First-time initialization (full scan) for a new notebook |

**Notifications (server → extension):**

| Method | Purpose |
|---|---|
| `notebook.initProgress` | Progress during initial computation (files processed / total) |
| `notebook.reconcileProgress` | Progress during startup reconciliation |
| `notebook.ready` | Notebook initialization or reconciliation complete |
| `notebook.indexUpdated` | Index/links changed — webview should refresh |

### 3.3 Browser Webview (`app-browser-onyvore`)

The React UI rendered in VS Code's sidebar. All data comes from the stdio server via JSON-RPC through the Redux message bus middleware.

**Components:**

| Component | PRD Section | Data Source |
|---|---|---|
| `NotebookSidebar` | 4.1 | `notebook.getNotebooks` — file tree per notebook |
| `UnlinkedNotes` | 4.1 | `notebook.getOrphans` — notes with zero links |
| `LinksPanel` | 4.1 | `notebook.getLinks` — outbound + inbound for active note |
| `OutboundLinks` | 4.1 | Subset of LinksPanel data |
| `InboundLinks` | 4.1 | Subset of LinksPanel data |
| `SearchOverlay` | 4.3 | `notebook.search` — ranked results |

**Redux Slices:**

| Slice | Purpose |
|---|---|
| `notebooks.slice` | Notebook list and file trees. Updated on `notebook.indexUpdated` notifications |
| `active-notebook.slice` | Active notebook ID and active note path. Updated by `@WebviewHandler` broadcast |
| `links.slice` | Current note's outbound and inbound links. Refreshed on active note change and `notebook.indexUpdated` |
| `search-results.slice` | Search results for the active query |

### 3.4 Shared Library (`lib-isomorphic-onyvore`)

Type-safe contracts shared across all three tiers.

**Constants:**

```typescript
// onyvore-commands.constant.ts
export const onyvoreCommands = {
  INITIALIZE_NOTEBOOK: 'onyvore.initializeNotebook',
  DISCOVER_NOTEBOOKS: 'onyvore.discoverNotebooks',
  SEARCH_NOTEBOOK: 'onyvore.searchNotebook',
  REBUILD_NOTEBOOK: 'onyvore.rebuildNotebook',
} as const;
```

```typescript
// onyvore-rpc-methods.constant.ts
export const onyvoreRpcMethods = {
  // Requests
  NOTEBOOK_REGISTER: 'notebook.register',
  NOTEBOOK_UNREGISTER: 'notebook.unregister',
  NOTEBOOK_FILE_EVENT: 'notebook.fileEvent',
  NOTEBOOK_IGNORE_CHANGED: 'notebook.ignoreChanged',
  NOTEBOOK_SEARCH: 'notebook.search',
  NOTEBOOK_GET_LINKS: 'notebook.getLinks',
  NOTEBOOK_GET_NOTEBOOKS: 'notebook.getNotebooks',
  NOTEBOOK_GET_ORPHANS: 'notebook.getOrphans',
  NOTEBOOK_REBUILD: 'notebook.rebuild',
  NOTEBOOK_RECONCILE: 'notebook.reconcile',
  NOTEBOOK_INITIALIZE: 'notebook.initialize',
  // Notifications
  NOTEBOOK_INIT_PROGRESS: 'notebook.initProgress',
  NOTEBOOK_RECONCILE_PROGRESS: 'notebook.reconcileProgress',
  NOTEBOOK_READY: 'notebook.ready',
  NOTEBOOK_INDEX_UPDATED: 'notebook.indexUpdated',
} as const;
```

```typescript
// stop-nouns.constant.ts
export const STOP_NOUNS: ReadonlySet<string> = new Set([
  // Ultra-generic nouns
  'time', 'way', 'thing', 'part', 'people', 'day', 'year', 'example',
  'case', 'place', 'point', 'fact', 'hand', 'end', 'line', 'number',
  'group', 'area', 'world', 'work', 'state', 'system', 'program',
  'question', 'problem', 'issue', 'use', 'kind', 'sort', 'type',
  'form', 'set', 'list', 'level', 'side', 'head', 'home', 'office',
  'room', 'result', 'change', 'order', 'idea',
  // Domain-common (PKM noise)
  'note', 'file', 'page', 'document', 'section', 'item', 'entry',
  'record', 'version', 'name', 'title', 'link', 'tag', 'folder', 'draft',
]);
```

**Types:**

```typescript
// notebook.types.ts
export interface NotebookInfo {
  id: string;               // unique ID (absolute path of notebook root)
  rootPath: string;          // absolute path to the directory containing .onyvore/
  name: string;              // directory basename
  fileCount: number;
  status: 'initializing' | 'reconciling' | 'ready';
  progress?: number;         // 0-100 during init/reconcile
}

export interface NotebookFileTree {
  notebookId: string;
  files: NotebookFile[];
}

export interface NotebookFile {
  relativePath: string;      // relative to notebook root
  basename: string;          // filename without .md (= note title)
}
```

```typescript
// edge.types.ts
export interface Edge {
  source: string;            // relative path of source note
  target: string;            // relative path of target note
  noun: string;              // highest-count matching noun phrase (for display)
  count: number;             // aggregate occurrence count
}
```

```typescript
// metadata.types.ts
export interface NoteMetadata {
  relativePath: string;
  mtimeMs: number;           // last-seen modification time (ms since epoch)
}

export interface NotebookMetadata {
  files: Record<string, NoteMetadata>;  // keyed by relative path
}
```

```typescript
// links-panel.types.ts
export interface LinkEntry {
  notePath: string;          // relative path of the linked note
  noteTitle: string;         // basename (for display)
  noun: string;              // top matching noun phrase
  count: number;             // aggregate occurrence count
}

export interface LinksForNote {
  notePath: string;
  outbound: LinkEntry[];     // ranked by count desc
  inbound: LinkEntry[];      // ranked by count desc
}
```

```typescript
// file-event.types.ts
export type FileEventType = 'create' | 'change' | 'delete';

export interface FileEvent {
  type: FileEventType;
  relativePath: string;
  notebookId: string;
}

export interface FileEventBatch {
  notebookId: string;
  events: FileEvent[];
}
```

---

## 4. Key Implementation Details

### 4.1 NLP Pipeline (`NlpService`)

```typescript
import nlp from 'compromise';
import { STOP_NOUNS } from '@sqlvore/isomorphic-onyvore';

interface ExtractionResult {
  /** All surviving candidates with their occurrence counts */
  phrases: Map<string, number>;  // normalized phrase → count
}

function extractNounPhrases(content: string): ExtractionResult {
  const doc = nlp(content);
  const rawPhrases: string[] = doc.nouns().out('array');
  const phrases = new Map<string, number>();

  for (const raw of rawPhrases) {
    const normalized = raw.toLowerCase().trim();
    if (normalized.length <= 1) continue;

    const words = normalized.split(/\s+/);

    // Full phrase
    if (!STOP_NOUNS.has(normalized)) {
      phrases.set(normalized, (phrases.get(normalized) ?? 0) + 1);
    }

    // Decompose: individual words (only for multi-word phrases)
    if (words.length > 1) {
      for (const word of words) {
        if (word.length <= 1) continue;
        if (STOP_NOUNS.has(word)) continue;
        phrases.set(word, (phrases.get(word) ?? 0) + 1);
      }
    }
  }

  return { phrases };
}
```

### 4.2 Link Graph Computation (`LinkGraphService`)

The link graph is a per-notebook in-memory data structure with two indexes for efficient lookups:

```typescript
interface LinkGraph {
  /** All edges, keyed by "source::target" */
  edges: Map<string, Edge>;

  /** source path → set of edge keys */
  outboundIndex: Map<string, Set<string>>;

  /** target path → set of edge keys */
  inboundIndex: Map<string, Set<string>>;

  /** Cached noun phrases per file: relativePath → Map<normalizedPhrase, count> */
  phraseCache: Map<string, Map<string, number>>;

  /** All note titles (basenames, lowercase): title → set of relative paths */
  titleIndex: Map<string, Set<string>>;
}
```

**Operations:**

**Create** (new file added):
1. Extract noun phrases → cache in `phraseCache`
2. Register the file's title in `titleIndex`
3. Match phrases against `titleIndex` → add outbound edges (skip self-links)
4. Reverse match: scan `phraseCache` of all other files for phrases matching this file's title → add inbound edges

**Change** (file modified):
1. Remove all outbound edges for this file from `edges` and `outboundIndex`
2. Re-extract noun phrases → update `phraseCache`
3. Match new phrases against `titleIndex` → add outbound edges

**Delete** (file removed):
1. Remove all outbound edges for this file
2. Remove all inbound edges pointing to this file
3. Remove from `phraseCache` and `titleIndex`

**Matching logic:**
```typescript
function matchPhrasesAgainstTitles(
  sourcePath: string,
  phrases: Map<string, number>,
  titleIndex: Map<string, Set<string>>,
): Edge[] {
  const sourceBasename = basename(sourcePath, '.md').toLowerCase();
  const edgeMap = new Map<string, Edge>();  // "source::target" → Edge

  for (const [phrase, count] of phrases) {
    const matchingPaths = titleIndex.get(phrase);
    if (!matchingPaths) continue;

    for (const targetPath of matchingPaths) {
      // Self-link exclusion
      if (targetPath === sourcePath) continue;

      const key = `${sourcePath}::${targetPath}`;
      const existing = edgeMap.get(key);
      if (existing) {
        existing.count += count;
        // Keep the noun with the highest individual count
        if (count > (phrases.get(existing.noun) ?? 0)) {
          existing.noun = phrase;
        }
      } else {
        edgeMap.set(key, {
          source: sourcePath,
          target: targetPath,
          noun: phrase,
          count,
        });
      }
    }
  }

  return Array.from(edgeMap.values());
}
```

### 4.3 Search Index (`SearchIndexService`)

```typescript
import { create, insert, remove, search, save, load } from '@orama/orama';

// Schema per notebook
const schema = {
  relativePath: 'string',
  title: 'string',       // basename without .md
  content: 'string',     // full markdown content
} as const;
```

**Graph-boosted ranking:** After Orama returns text-relevance results, each result's score is adjusted by its inbound link count from the `LinkGraphService`. The exact combination formula is an implementation detail subject to tuning — a reasonable starting point is:

```
finalScore = oramaScore * (1 + log2(1 + inboundLinkCount))
```

This gives diminishing returns to additional links while ensuring well-connected notes outrank isolated ones at equivalent text relevance.

### 4.4 Persistence (`PersistenceService`)

**Triggers:**
- After each debounced batch of incremental updates completes
- On extension deactivation
- Periodically during initial computation (every 100 files)

**Files written atomically** (write to temp file, then rename) to prevent corruption from mid-write crashes:

```typescript
async function persistArtifact(filePath: string, data: Buffer | string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, data);
  await fs.rename(tmpPath, filePath);
}
```

**`links.json` format:**
```json
{
  "edges": [
    { "source": "recipes/sourdough.md", "target": "flour.md", "noun": "flour", "count": 3 },
    { "source": "recipes/sourdough.md", "target": "starter.md", "noun": "sourdough starter", "count": 7 }
  ]
}
```

**`metadata.json` format:**
```json
{
  "files": {
    "recipes/sourdough.md": { "mtimeMs": 1711584000000 },
    "flour.md": { "mtimeMs": 1711580400000 }
  }
}
```

### 4.5 File Watcher (`FileWatcherService`)

Runs in the extension host. One `vscode.FileSystemWatcher` per registered notebook.

```typescript
// Glob pattern per notebook: watch .md files recursively
const pattern = new vscode.RelativePattern(notebookRoot, '**/*.md');
const watcher = vscode.workspace.createFileSystemWatcher(pattern);
```

**Exclusions applied in the event handler** (not the glob — VS Code's glob doesn't support negation patterns from `.onyvoreignore`):
1. Check if the file path is inside a nested notebook (subdirectory with `.onyvore/`)
2. Check if the file path matches any `.onyvoreignore` pattern
3. If either, discard the event

**Debounce implementation:**
```typescript
// Per-notebook event buffer
const pending = new Map<string, FileEvent>();  // path → latest event
let timer: NodeJS.Timeout | null = null;

function onFileEvent(event: FileEvent) {
  if (isExcluded(event.relativePath)) return;

  // For the same file, a later event supersedes an earlier one
  // Exception: delete followed by create = both kept (rename)
  pending.set(event.relativePath, event);

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const batch: FileEvent[] = Array.from(pending.values());
    pending.clear();
    messageBus.sendRequest('notebook.fileEvent', { notebookId, events: batch });
  }, 300);
}
```

**`.onyvoreignore` watching:**
The extension host watches the `.onyvoreignore` file at `{notebookRoot}/.onyvoreignore` using a separate `FileSystemWatcher`. On change, it sends `notebook.ignoreChanged` to the stdio server, which re-evaluates all files against the new patterns.

### 4.6 Startup Reconciliation (`ReconciliationService`)

Runs in the stdio server when `notebook.reconcile` is received.

```typescript
async function reconcile(notebookId: string): Promise<void> {
  const metadata = await this.metadataService.load(notebookId);
  const currentFiles = await this.scanFilesystem(notebookId);  // all .md files

  const knownPaths = new Set(Object.keys(metadata.files));
  const currentPaths = new Set(currentFiles.map(f => f.relativePath));

  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const file of currentFiles) {
    if (!knownPaths.has(file.relativePath)) {
      created.push(file.relativePath);
    } else if (file.mtimeMs > metadata.files[file.relativePath].mtimeMs) {
      modified.push(file.relativePath);
    }
  }

  for (const knownPath of knownPaths) {
    if (!currentPaths.has(knownPath)) {
      deleted.push(knownPath);
    }
  }

  const total = created.length + modified.length + deleted.length;
  let processed = 0;

  // Process deletes first (clean up stale data)
  for (const path of deleted) {
    await this.processDelete(notebookId, path);
    this.sendProgress(notebookId, ++processed, total);
  }

  // Then creates and modifications
  for (const path of [...created, ...modified]) {
    const content = await this.readFile(notebookId, path);
    const eventType = created.includes(path) ? 'create' : 'change';
    await this.processFileEvent(notebookId, { type: eventType, relativePath: path }, content);
    this.sendProgress(notebookId, ++processed, total);
  }

  await this.persistenceService.persistAll(notebookId);
  this.messageBus.sendNotification('notebook.ready', { notebookId });
}
```

---

## 5. VS Code Extension Manifest

Key sections of `apps/vscode/onyvore/package.json`:

```json
{
  "name": "onyvore",
  "displayName": "Onyvore",
  "description": "Local-first personal knowledge management for VS Code",
  "version": "1.0.0",
  "publisher": "sqlvore",
  "engines": { "vscode": "^1.74.0" },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/main.js",
  "repository": {
    "type": "git",
    "url": "https://github.com/sqlvore/monorepo"
  },
  "contributes": {
    "commands": [
      { "command": "onyvore.initializeNotebook", "title": "Onyvore: Initialize Notebook" },
      { "command": "onyvore.discoverNotebooks", "title": "Onyvore: Discover Notebooks" },
      { "command": "onyvore.searchNotebook", "title": "Onyvore: Search Notebook" },
      { "command": "onyvore.rebuildNotebook", "title": "Onyvore: Rebuild Notebook" }
    ],
    "viewsContainers": {
      "activitybar": [
        { "id": "onyvore", "title": "Onyvore", "icon": "resources/icon.svg" }
      ]
    },
    "views": {
      "onyvore": [
        { "type": "webview", "id": "onyvore.webview", "name": "Onyvore", "icon": "resources/icon.svg" }
      ]
    }
  }
}
```

**Alignment checklist:**
- `contributes.commands[*].command` ↔ `onyvoreCommands` constants ↔ `@CommandHandler()` decorators
- `contributes.views.onyvore[0].id` ↔ `OnyvoreWebviewProvider.viewType` ↔ `@VscodeExtensionModule.webviewViewType`
- `main` → webpack output entry point

---

## 6. Nx Configuration

### 6.1 `tsconfig.base.json` Path Mapping

Add to the existing `paths` object:

```json
"@sqlvore/isomorphic-onyvore": ["libs/isomorphic/onyvore/src/index.ts"]
```

### 6.2 Project Configurations

**`apps/vscode/onyvore/project.json`:**
```json
{
  "name": "app-vscode-onyvore",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/vscode/onyvore/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nx/webpack:webpack",
      "dependsOn": ["app-stdio-onyvore:build", "app-browser-onyvore:build"],
      "outputs": ["{options.outputPath}"],
      "defaultConfiguration": "production",
      "options": {
        "target": "node",
        "compiler": "tsc",
        "outputPath": "apps/vscode/onyvore/dist",
        "main": "apps/vscode/onyvore/src/main.ts",
        "tsConfig": "apps/vscode/onyvore/tsconfig.app.json",
        "generatePackageJson": false,
        "assets": [
          { "input": "apps/vscode/onyvore", "glob": "package.json", "output": "." },
          { "input": "apps/vscode/onyvore", "glob": "README.md", "output": "." },
          { "input": "apps/vscode/onyvore", "glob": ".vscodeignore", "output": "." },
          { "input": "apps/vscode/onyvore/src/assets", "glob": "**/*", "output": "./resources" },
          { "input": "apps/stdio/onyvore/dist", "glob": "main.js", "output": "./server" },
          { "input": "apps/stdio/onyvore/dist", "glob": "main.js.map", "output": "./server" },
          { "input": "dist/apps/browser/onyvore", "glob": "**/*", "output": "./webview" }
        ],
        "isolatedConfig": true,
        "sourceMap": true,
        "webpackConfig": "apps/vscode/onyvore/webpack.config.js"
      },
      "configurations": {
        "development": {},
        "production": {}
      }
    },
    "package": {
      "executor": "nx:run-commands",
      "dependsOn": ["build"],
      "options": {
        "command": "cd apps/vscode/onyvore/dist && node -e \"const p=require('./package.json');p.main='./main.js';require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2))\" && mkdir -p dist && mv server dist/server && mv webview dist/webview && vsce package --no-dependencies --skip-license -o ../onyvore.vsix --baseContentUrl https://github.com/sqlvore/monorepo --baseImagesUrl https://github.com/sqlvore/monorepo"
      }
    }
  },
  "tags": []
}
```

**`apps/stdio/onyvore/project.json`:**
```json
{
  "name": "app-stdio-onyvore",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/stdio/onyvore/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nx/webpack:webpack",
      "outputs": ["{options.outputPath}"],
      "defaultConfiguration": "production",
      "options": {
        "target": "node",
        "compiler": "tsc",
        "outputPath": "apps/stdio/onyvore/dist",
        "main": "apps/stdio/onyvore/src/main.ts",
        "tsConfig": "apps/stdio/onyvore/tsconfig.app.json",
        "generatePackageJson": false,
        "isolatedConfig": true,
        "sourceMap": true,
        "webpackConfig": "apps/stdio/onyvore/webpack.config.js"
      },
      "configurations": {
        "development": {},
        "production": {}
      }
    }
  },
  "tags": []
}
```

**`apps/browser/onyvore/project.json`:**
```json
{
  "name": "app-browser-onyvore",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/browser/onyvore/src",
  "projectType": "application",
  "targets": {},
  "tags": []
}
```

**`libs/isomorphic/onyvore/project.json`:**
```json
{
  "name": "lib-isomorphic-onyvore",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/isomorphic/onyvore/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nx/vite:build",
      "generatePackageJson": true,
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/isomorphic/onyvore"
      }
    }
  },
  "tags": []
}
```

---

## 7. Dependencies

### 7.1 Framework (`@onivoro/*`)

| Package | Used In |
|---|---|
| `@onivoro/server-vscode` | `app-vscode-onyvore` |
| `@onivoro/server-stdio` | `app-stdio-onyvore` |
| `@onivoro/isomorphic-jsonrpc` | all tiers |
| `@onivoro/browser-jsonrpc` | `app-browser-onyvore` |
| `@onivoro/browser-redux` | `app-browser-onyvore` |

### 7.2 Domain

| Package | Used In | Purpose |
|---|---|---|
| `compromise` | `app-stdio-onyvore` | NLP noun-phrase extraction |
| `@orama/orama` | `app-stdio-onyvore` | Full-text search index |

### 7.3 UI

| Package | Used In | Purpose |
|---|---|---|
| `react`, `react-dom` | `app-browser-onyvore` | UI framework |
| `@reduxjs/toolkit`, `react-redux` | `app-browser-onyvore` | State management |
| `@mui/material`, `@emotion/react`, `@emotion/styled` | `app-browser-onyvore` | Component library |
| `uuid` | `app-browser-onyvore` | JSON-RPC request IDs |

### 7.4 Build

| Package | Used In | Purpose |
|---|---|---|
| `@nestjs/common`, `@nestjs/core` | `app-vscode-onyvore`, `app-stdio-onyvore` | DI framework |
| `reflect-metadata` | `app-vscode-onyvore` | NestJS decorator metadata |
| `@nx/webpack`, `webpack` | `app-vscode-onyvore`, `app-stdio-onyvore` | Bundling |
| `@nx/vite`, `vite`, `@vitejs/plugin-react` | `app-browser-onyvore`, `lib-isomorphic-onyvore` | Bundling |
| `@vscode/vsce` | devDependency (root) | VSIX packaging |
