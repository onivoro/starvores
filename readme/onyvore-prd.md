# Product Requirements Document: Aether

**Project Codename:** Aether
**Version:** 1.0.0
**Status:** Final Specification
**Platform:** VS Code Extension (Node.js Runtime)
**Target:** Local-First, Distributed Knowledge Management

---

## 1. Executive Summary
**Aether** is a high-performance personal knowledge management (PKM) extension for VS Code. It bridges the gap between the structured reliability of **Joplin** and the networked intelligence of **Obsidian**. By treating every folder as an isolated, self-contained "Vault," Aether ensures that your data remains portable, private, and future-proof.

---

## 2. Core Philosophy
* **Markdown-First:** All notes are standard `.md` files. No proprietary databases.
* **Vault-Centric:** Settings, indexes, and sync states are stored locally within each folder in a hidden `.aether/` directory.
* **Zero-Binary:** No SQLite or native C++ dependencies. Built for universal distributability via Node.js.
* **Sovereign Sync:** Users choose their own infrastructure (S3 or Git Remote) without middleman services.
* **Zero-Secret Auth:** Leverages existing local environments (AWS Profiles) to avoid storing credentials within the extension.

---

## 3. Functional Requirements

### 3.1 Knowledge Organization
* **Notebook Sidebar:** A hierarchical tree view that renders folders as "Notebooks," providing a familiar structure for users migrating from traditional note-taking apps.
* **Wikilinks & Backlinks:** Support for `[[Note Title]]` syntax. A dedicated sidebar panel displays all files referencing the active note in real-time.
* **Auto-Metadata:** Automatic injection and maintenance of YAML frontmatter (created/updated timestamps, unique IDs) to facilitate tracking without manual entry.

### 3.2 High-Performance Search
* **Search Engine:** Powered by **Orama**, a pure-TypeScript, in-memory search engine.
* **Fuzzy Matching:** Instant results for keyword and partial matches across the entire vault.
* **Persistence:** The index is serialized to `.aether/index.bin` on exit to allow sub-100ms startup for large vaults (10,000+ notes).

### 3.3 Versioning (Optional Git)
* **Checkpointing:** If a `.git` folder is detected, Aether performs background "checkpoint" commits on every file save.
* **Timeline Integration:** Users access granular history through the native VS Code "Timeline" view.
* **Stateless Fallback:** If Git is absent, Aether operates in "Basic Mode," relying on filesystem state and optional S3 versioning/conflict files.

---

## 4. Technical Architecture

### 4.1 Data Persistence (`.aether/` Folder)
Each workspace folder initialized as an Aether Vault contains:
* `config.json`: Stores vault-specific settings (Sync Provider choice, AWS Profile Name, S3 Bucket, or Git Remote name).
* `index.bin`: A serialized binary snapshot of the Orama search index.
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
* **Cloud SDK:** AWS SDK v3 (Modular packages to minimize bundle size).
* **Bundler:** `esbuild` (Compiles all dependencies into a single, lightweight `extension.js`).

---

## 5. User Experience (UX)

### 5.1 Onboarding Flow
1.  **Initialize:** User runs `Aether: Initialize Vault`. Aether scans the folder and creates the `.aether/` metadata directory.
2.  **Configure:** User selects a sync method via a VS Code Walkthrough or Command Palette.
3.  **Search:** Integrated search bar provides instant, scoped access to the vault's contents.

### 5.2 Command Palette Highlights
* `Aether: Search Vault` (Fuzzy-search overlay).
* `Aether: Open Graph View` (Visualizes note connections using a D3.js Webview).
* `Aether: Sync Now` (Manual sync trigger).
* `Aether: Insert Wikilink` (Fuzzy picker for internal note linking).

---

## 6. Comparison Analysis

| Feature | Joplin | Obsidian | **Aether** |
| :--- | :--- | :--- | :--- |
| **Storage** | SQLite DB | Markdown Files | **Markdown Files** |
| **Indexing** | Persistent DB | File Scan | **In-Memory (Orama)** |
| **Sync** | Dropbox/OneDrive | Paid/Manual | **S3 (Profiles) / Git Remote** |
| **Secrets** | Managed in App | Managed in App | **None (Native OS Auth)** |
| **Portability** | Moderate | High | **Maximum (Self-Contained)** |

---

## 7. Distribution Strategy
* **Universal VSIX:** A single bundle package under 2MB.
* **Platform Support:** Functioning immediately on Windows, macOS, and Linux.
* **Zero Setup:** No external installation of Bun, SQLite, or CLI tools required.