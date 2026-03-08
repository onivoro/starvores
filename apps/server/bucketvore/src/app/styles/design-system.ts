/**
 * Design System for BucketVore UI
 * Modern dark theme file explorer
 */

export const DESIGN_SYSTEM_STYLES = `
  /* ====================================================================
     Design System Variables
     ==================================================================== */

  :root {
    /* Colors - Dark Theme */
    --color-bg-primary: #1a1a1a;
    --color-bg-secondary: #242424;
    --color-bg-tertiary: #2d2d2d;
    --color-border: #3a3a3a;
    --color-border-light: #4a4a4a;
    --color-text-primary: #e8e8e8;
    --color-text-secondary: #a0a0a0;
    --color-text-tertiary: #707070;

    /* Accents */
    --color-accent-primary: #0ea5e9;
    --color-accent-secondary: #8b5cf6;
    --color-accent-tertiary: #06b6d4;

    /* Status Colors */
    --color-status-success: #10b981;
    --color-status-warning: #f59e0b;
    --color-status-error: #ef4444;
    --color-status-info: #06b6d4;

    /* Typography */
    --font-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    --font-mono: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    --weight-normal: 400;
    --weight-medium: 500;
    --weight-semibold: 600;
    --weight-bold: 700;

    /* Font Sizes */
    --size-xs: 0.75rem;
    --size-sm: 0.875rem;
    --size-base: 1rem;
    --size-lg: 1.125rem;
    --size-xl: 1.25rem;
    --size-2xl: 1.5rem;

    /* Spacing */
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-6: 1.5rem;
    --space-8: 2rem;

    /* Border Radius */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;

    /* Transitions */
    --transition-fast: all 150ms ease-out;
    --transition-base: all 300ms ease-out;
  }

  /* ====================================================================
     Global Reset & Base Styles
     ==================================================================== */

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html, body {
    height: 100%;
    overflow: hidden;
  }

  body {
    font-family: var(--font-primary);
    background-color: var(--color-bg-primary);
    color: var(--color-text-primary);
    font-size: var(--size-base);
    font-weight: var(--weight-normal);
    line-height: 1.5;
    display: flex;
    flex-direction: column;
  }

  /* ====================================================================
     Layout
     ==================================================================== */

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
    padding: 0 var(--space-8);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .header-info h1 {
    font-size: var(--size-xl);
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
  }

  .header-info p {
    font-size: var(--size-sm);
    color: var(--color-text-secondary);
  }

  .header-actions {
    display: flex;
    gap: var(--space-3);
  }

  .container {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  aside {
    width: 280px;
    background-color: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sidebar-header {
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-header h2 {
    font-size: var(--size-sm);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }

  .bucket-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
  }

  .bucket-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: var(--transition-fast);
  }

  .bucket-item:hover {
    background-color: var(--color-bg-tertiary);
  }

  .bucket-item.active {
    background-color: var(--color-bg-tertiary);
    color: var(--color-accent-primary);
  }

  .bucket-icon {
    font-size: var(--size-xl);
  }

  .bucket-info {
    flex: 1;
    min-width: 0;
  }

  .bucket-name {
    font-weight: var(--weight-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bucket-date {
    font-size: var(--size-xs);
    color: var(--color-text-secondary);
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-6);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    overflow-x: auto;
  }

  .breadcrumb-item {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: var(--size-sm);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    transition: var(--transition-fast);
    white-space: nowrap;
    font-family: var(--font-primary);
  }

  .breadcrumb-item:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .breadcrumb-separator {
    color: var(--color-text-tertiary);
  }

  .toolbar-actions {
    display: flex;
    gap: var(--space-2);
  }

  .file-explorer {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: var(--transition-fast);
  }

  .file-item:hover {
    background-color: var(--color-bg-tertiary);
    border-color: var(--color-border-light);
  }

  .file-item.folder {
    font-weight: var(--weight-medium);
    cursor: pointer;
  }

  .file-icon {
    font-size: var(--size-xl);
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    font-size: var(--size-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-meta {
    font-size: var(--size-xs);
    color: var(--color-text-secondary);
    margin-top: var(--space-1);
  }

  .file-actions {
    display: flex;
    gap: var(--space-2);
    opacity: 0;
    transition: var(--transition-fast);
  }

  .file-item:hover .file-actions {
    opacity: 1;
  }

  /* ====================================================================
     Buttons
     ==================================================================== */

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background-color: var(--color-accent-primary);
    color: #ffffff;
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: var(--transition-fast);
    font-family: var(--font-primary);
  }

  .btn:hover:not(:disabled) {
    background-color: #0d9ecf;
    transform: scale(1.02);
  }

  .btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.secondary {
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .btn.secondary:hover:not(:disabled) {
    background-color: var(--color-border);
  }

  .btn-icon {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: var(--size-lg);
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    transition: var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-icon:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .btn-close {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: var(--size-xl);
    cursor: pointer;
    padding: var(--space-2);
    line-height: 1;
    transition: var(--transition-fast);
  }

  .btn-close:hover {
    color: var(--color-text-primary);
  }

  /* ====================================================================
     Modal & Preview
     ==================================================================== */

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-8);
  }

  .modal {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .file-preview {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--color-border);
  }

  .preview-header h3 {
    font-size: var(--size-lg);
    font-weight: var(--weight-semibold);
    margin: 0;
  }

  .preview-meta {
    padding: var(--space-3) var(--space-6);
    background-color: var(--color-bg-tertiary);
    font-size: var(--size-xs);
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .preview-content {
    flex: 1;
    overflow: auto;
    padding: var(--space-6);
  }

  .preview-image-container,
  .preview-video-container,
  .preview-audio-container,
  .preview-pdf-container {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-text-container pre {
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    overflow: auto;
    font-family: var(--font-mono);
    font-size: var(--size-sm);
    line-height: 1.6;
  }

  .preview-unavailable {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-8);
    text-align: center;
  }

  .preview-actions {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--color-border);
    background-color: var(--color-bg-secondary);
  }

  /* ====================================================================
     Upload Zone
     ==================================================================== */

  .upload-zone {
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-8);
    text-align: center;
    transition: var(--transition-fast);
    cursor: pointer;
  }

  .upload-zone:hover,
  .upload-zone.drag-over {
    border-color: var(--color-accent-primary);
    background-color: var(--color-bg-tertiary);
  }

  .upload-zone-icon {
    font-size: 3rem;
    margin-bottom: var(--space-4);
  }

  .upload-zone input[type="file"] {
    display: none;
  }

  /* ====================================================================
     States
     ==================================================================== */

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-8);
    color: var(--color-text-secondary);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-8);
    color: var(--color-text-secondary);
    text-align: center;
  }

  .empty-state-icon {
    font-size: 4rem;
    opacity: 0.5;
  }

  .error {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--color-status-error);
    border-radius: var(--radius-md);
    color: var(--color-status-error);
  }

  .error-icon {
    font-size: var(--size-xl);
  }

  /* ====================================================================
     Scrollbars
     ==================================================================== */

  ::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

  ::-webkit-scrollbar-track {
    background-color: var(--color-bg-primary);
  }

  ::-webkit-scrollbar-thumb {
    background-color: var(--color-border);
    border-radius: var(--radius-sm);
    border: 2px solid var(--color-bg-primary);
  }

  ::-webkit-scrollbar-thumb:hover {
    background-color: var(--color-border-light);
  }
`;
