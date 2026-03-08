/**
 * Design System for DataVore UI
 * Modern dark theme inspired by Postico2
 * All design tokens and base styles
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
    --space-12: 3rem;

    /* Border Radius */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.15);

    /* Transitions */
    --transition-fast: all 150ms ease-out;
    --transition-base: all 300ms ease-out;
    --transition-slow: all 500ms ease-out;
  }

  /* ====================================================================
     Global Reset & Base Styles
     ==================================================================== */

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html {
    font-size: 16px;
  }

  body {
    font-family: var(--font-primary);
    background-color: var(--color-bg-primary);
    color: var(--color-text-primary);
    font-size: var(--size-base);
    font-weight: var(--weight-normal);
    line-height: 1.5;
  }

  /* ====================================================================
     Layout Structure
     ==================================================================== */

  .container {
    display: flex;
    height: 100vh;
    background-color: var(--color-bg-primary);
  }

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
    gap: var(--space-3);
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: var(--color-status-success);
    box-shadow: 0 0 0 2px var(--color-bg-secondary);
    flex-shrink: 0;
  }

  .status-indicator.disconnected {
    background-color: var(--color-status-error);
  }

  .status-indicator.connecting {
    background-color: var(--color-status-warning);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .header-info h1 {
    font-size: var(--size-lg);
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
    margin-bottom: var(--space-1);
  }

  .header-info p {
    font-size: var(--size-sm);
    color: var(--color-text-secondary);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .stats {
    display: flex;
    gap: var(--space-6);
    font-size: var(--size-sm);
    color: var(--color-text-secondary);
  }

  .stats span {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stats span strong {
    color: var(--color-text-primary);
    font-weight: var(--weight-semibold);
    font-size: var(--size-base);
  }

  /* ====================================================================
     Sidebar
     ==================================================================== */

  aside {
    width: 300px;
    background-color: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow: hidden;
  }

  .sidebar-header {
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .sidebar-header h2 {
    font-size: var(--size-sm);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }

  .search-box {
    position: relative;
  }

  .search-box input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--size-sm);
    font-family: var(--font-primary);
  }

  .search-box input::placeholder {
    color: var(--color-text-tertiary);
  }

  .search-box input:focus {
    outline: none;
    border-color: var(--color-accent-primary);
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
    background-color: var(--color-bg-secondary);
  }

  .table-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3) 0;
  }

  .table-item {
    padding: var(--space-3) var(--space-4);
    cursor: pointer;
    border-left: 3px solid transparent;
    transition: var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: var(--size-sm);
  }

  .table-item:hover {
    background-color: var(--color-bg-tertiary);
    border-left-color: var(--color-accent-primary);
  }

  .table-item.active {
    background-color: var(--color-bg-tertiary);
    color: var(--color-accent-primary);
    border-left-color: var(--color-accent-primary);
    font-weight: var(--weight-semibold);
  }

  .table-item-icon {
    opacity: 0.6;
    font-size: var(--size-lg);
    flex-shrink: 0;
  }

  .table-item-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .table-item-count {
    font-size: var(--size-xs);
    color: var(--color-text-secondary);
    background-color: var(--color-bg-secondary);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  /* ====================================================================
     Main Content Area
     ==================================================================== */

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ====================================================================
     Query Editor
     ==================================================================== */

  .query-editor {
    display: flex;
    flex-direction: column;
    padding: var(--space-6);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    min-height: 300px;
    max-height: 70%;
    overflow: hidden;
  }

  .query-editor-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .query-editor-header h3 {
    font-size: var(--size-sm);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    flex: 1;
  }

  .query-editor-actions {
    display: flex;
    gap: var(--space-2);
  }

  #editor-container {
    background-color: var(--color-bg-tertiary);
  }

  /* Monaco editor overrides for dark theme consistency */
  .monaco-editor {
    background-color: var(--color-bg-tertiary) !important;
  }

  .monaco-editor .margin {
    background-color: var(--color-bg-secondary) !important;
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

  .btn.danger {
    background-color: #dc3545;
    border: 1px solid #c82333;
    color: white;
  }

  .btn.danger:hover:not(:disabled) {
    background-color: #c82333;
    border-color: #bd2130;
  }

  /* ====================================================================
     Results Area
     ==================================================================== */

  .results-area {
    flex: 1;
    overflow: auto;
    padding: var(--space-6);
    background-color: var(--color-bg-primary);
  }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-4);
  }

  .tab {
    padding: var(--space-3) var(--space-4);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-text-secondary);
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: var(--transition-fast);
    font-family: var(--font-primary);
  }

  .tab:hover {
    color: var(--color-text-primary);
    border-bottom-color: var(--color-border);
  }

  .tab.active {
    color: var(--color-accent-primary);
    border-bottom-color: var(--color-accent-primary);
  }

  .tab-content {
    display: none;
  }

  .tab-content.active {
    display: block;
    animation: fadeIn 200ms ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ====================================================================
     Tables
     ==================================================================== */

  .table-container {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--size-sm);
  }

  thead {
    position: sticky;
    top: 0;
    background-color: var(--color-bg-primary);
    border-bottom: 1px solid var(--color-border);
  }

  th {
    padding: var(--space-3) var(--space-4);
    text-align: left;
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
    white-space: nowrap;
    user-select: none;
  }

  tbody tr {
    border-bottom: 1px solid var(--color-border);
    transition: var(--transition-fast);
  }

  tbody tr:hover {
    background-color: var(--color-bg-tertiary);
  }

  tbody tr:nth-child(even) {
    background-color: rgba(45, 45, 45, 0.5);
  }

  td {
    padding: var(--space-3) var(--space-4);
    color: var(--color-text-primary);
  }

  td[data-copy-value] {
    cursor: pointer;
    position: relative;
  }

  td[data-copy-value]:hover {
    background-color: rgba(14, 165, 233, 0.1) !important;
  }

  td[data-copy-value]:active {
    background-color: rgba(14, 165, 233, 0.2) !important;
  }

  /* ====================================================================
     Type Badges
     ==================================================================== */

  .type-badge {
    display: inline-block;
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-light);
    color: var(--color-text-secondary);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--size-xs);
    white-space: nowrap;
  }

  /* ====================================================================
     NULL Value
     ==================================================================== */

  .null-value {
    color: var(--color-text-tertiary);
    font-style: italic;
    opacity: 0.7;
  }

  /* ====================================================================
     Status Badge
     ==================================================================== */

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--size-xs);
    font-weight: var(--weight-medium);
  }

  .status-badge.success {
    background-color: rgba(16, 185, 129, 0.1);
    color: var(--color-status-success);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .status-badge.error {
    background-color: rgba(239, 68, 68, 0.1);
    color: var(--color-status-error);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  /* ====================================================================
     Loading State
     ==================================================================== */

  .loading {
    text-align: center;
    padding: var(--space-12);
    color: var(--color-text-secondary);
  }

  .spinner {
    display: inline-block;
    width: 24px;
    height: 24px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: var(--space-4);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ====================================================================
     Error State
     ==================================================================== */

  .error {
    padding: var(--space-4);
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md);
    color: var(--color-status-error);
    font-size: var(--size-sm);
  }

  /* ====================================================================
     Info State
     ==================================================================== */

  .info {
    padding: var(--space-4);
    background-color: rgba(14, 165, 233, 0.1);
    border: 1px solid rgba(14, 165, 233, 0.3);
    border-radius: var(--radius-md);
    color: var(--color-accent-primary);
    font-size: var(--size-sm);
  }

  /* ====================================================================
     Empty State
     ==================================================================== */

  .empty-state {
    text-align: center;
    padding: var(--space-12);
    color: var(--color-text-secondary);
  }

  .empty-state-icon {
    font-size: 3rem;
    margin-bottom: var(--space-4);
    opacity: 0.5;
  }

  /* ====================================================================
     Scrollbars
     ==================================================================== */

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background-color: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background-color: var(--color-border);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background-color: var(--color-border-light);
  }

  /* ====================================================================
     Accessibility
     ==================================================================== */

  *:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 2px;
  }

  /* ====================================================================
     Responsive Design
     ==================================================================== */

  @media (max-width: 768px) {
    aside {
      width: 250px;
    }

    header {
      padding: 0 var(--space-4);
    }

    .query-editor {
      padding: var(--space-4);
    }

    .results-area {
      padding: var(--space-4);
    }

    .stats {
      display: none;
    }
  }
`;
