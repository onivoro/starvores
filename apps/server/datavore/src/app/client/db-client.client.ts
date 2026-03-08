import type { DbClientState } from '../shared/types.shared';

declare global {
  interface Window {
    Alpine: any;
    monaco: any;
    require: any;
    monacoInitialized?: boolean;
    __monacoEditor?: any; // Store editor outside Alpine's reactivity
  }
}

export function dbClient(): DbClientState {
  return {
    query: '',
    editor: null, // Keep for type compatibility but don't use
    selectedTable: '',
    activeTab: 'data',
    isConnected: true,
    tableCount: 0,
    allTables: '',
    filteredTablesHtml: '<div class="loading"><div class="spinner"></div>Loading tables...</div>',
    dataTabContent: '<div class="empty-state"><div class="empty-state-icon">👋</div><p>Select a table or execute a query</p></div>',
    structureTabContent: '',
    structureLoaded: false,
    _executing: false, // Prevent multiple simultaneous executions
    currentQueryId: null,
    queryStats: null,

    get resultsHtml(): string {
      return this.activeTab === 'data' ? this.dataTabContent : this.structureTabContent;
    },

    init(): void {
      this.loadTables();
      // Initialize Monaco after a short delay to ensure DOM is ready
      setTimeout(() => this.initMonaco(), 300);
    },

    getConnectionString(): string {
      const body = document.querySelector('body');
      return body?.getAttribute('data-connection-string') || 'default';
    },

    getStorageKey(): string {
      return `datavore-query-${this.getConnectionString()}`;
    },

    saveQueryToLocalStorage(query: string): void {
      try {
        localStorage.setItem(this.getStorageKey(), query);
      } catch (error) {
        console.warn('Failed to save query to localStorage:', error);
      }
    },

    loadQueryFromLocalStorage(): string {
      try {
        return localStorage.getItem(this.getStorageKey()) || 'SELECT * FROM table_name;';
      } catch (error) {
        console.warn('Failed to load query from localStorage:', error);
        return 'SELECT * FROM table_name;';
      }
    },

    initMonaco(): void {
      // Check if already initialized for this instance
      if (this.editor) {
        console.log('Monaco editor already initialized');
        return;
      }

      const container = document.getElementById('editor-container');
      if (!container) {
        console.error('Editor container not found');
        return;
      }

      // Check if Monaco is already loaded
      if (window.monaco) {
        this.createEditor(container);
      } else {
        // Load Monaco if not already loaded
        if (!window.monacoInitialized) {
          window.monacoInitialized = true;
          window.require.config({
            paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
          });
        }

        const self = this;
        window.require(['vs/editor/editor.main'], function () {
          if (!window.monaco) {
            console.error('Monaco failed to load');
            return;
          }
          self.createEditor(container);
        });
      }
    },

    createEditor(container: HTMLElement): void {
      // Check if editor already exists globally (outside Alpine's reactivity)
      if (window.__monacoEditor) {
        console.log('Monaco editor already exists');
        return;
      }

            // Load saved query from localStorage
      const savedQuery = this.loadQueryFromLocalStorage();

      // Create the Monaco editor instance with better state management
      const editor = window.monaco.editor.create(container, {
        value: savedQuery,
        language: 'sql',
        theme: 'vs-dark',
        automaticLayout: false, // Critical: prevents layout thrashing
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        readOnly: false,
        tabSize: 2,
      });

      window.__monacoEditor = editor;

      // Add keyboard shortcut - use direct reference to avoid closure issues
      editor.addCommand(
        window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter,
        () => {
          // Get the Alpine component instance from the DOM
          const alpineComponent = (window as any).Alpine.$data(document.querySelector('[x-data]'));
          if (alpineComponent && alpineComponent.executeQuery) {
            alpineComponent.executeQuery();
          }
        }
      );

      console.log('Monaco editor initialized successfully');
    },

    async loadTables(): Promise<void> {
      try {
        this.isConnected = true;
        const response = await fetch('/api/tables');
        const html = await response.text();
        this.allTables = html;
        this.tableCount = (html.match(/data-table/g) || []).length;
        this.filteredTablesHtml = this.allTables;
      } catch (error) {
        this.isConnected = false;
        this.filteredTablesHtml = '<div class="error">Error loading tables</div>';
      }
    },

    async selectTable(tableName: string): Promise<void> {
      this.selectedTable = tableName;
      this.activeTab = 'data';
      this.structureLoaded = false;
      this.structureTabContent = '';

      try {
        this.dataTabContent =
          '<div class="loading"><div class="spinner"></div>Loading table data...</div>';
        const response = await fetch('/api/table/' + tableName);
        const html = await response.text();
        this.dataTabContent = html;
      } catch (error) {
        this.dataTabContent = '<div class="error">Error loading table data</div>';
      }
    },

    async executeQuery(): Promise<void> {
      // Use global editor reference instead of Alpine's reactive property
      const editor = window.__monacoEditor;
      if (!editor) {
        console.error('Editor not initialized');
        return;
      }

      // Prevent multiple simultaneous executions
      if ((this as any)._executing) {
        console.log('Query already executing, skipping...');
        return;
      }

      (this as any)._executing = true;
      this.currentQueryId = `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.queryStats = null;

      try {
        // Get selected text or full text if no selection
        const selection = editor.getSelection();
        let queryToExecute = '';

        try {
          queryToExecute = editor.getModel().getValueInRange(selection);
        } catch (e) {
          console.warn('Could not get selection, using full content');
        }

        // If no text is selected (or selection is collapsed), use entire editor content
        if (!queryToExecute.trim()) {
          queryToExecute = editor.getValue();
        }

        if (!queryToExecute.trim()) {
          (this as any)._executing = false;
          this.currentQueryId = null;
          return;
        }

        // Show loading state
        this.dataTabContent =
          '<div class="loading"><div class="spinner"></div>Executing query...</div>';
        this.activeTab = 'data';

        // Execute query with queryId for cancellation support
        const response = await fetch('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: queryToExecute,
            queryId: this.currentQueryId
          }),
        });

        if (!response.ok) {
          throw new Error(`Query failed: ${response.statusText}`);
        }

        const result = await response.json();
        this.dataTabContent = result.html;
        this.queryStats = {
          elapsedMs: result.elapsedMs,
          rowCount: result.rowCount
        };

        // Save the entire editor content to localStorage (not just the executed portion)
        this.saveQueryToLocalStorage(editor.getValue());
      } catch (error: any) {
        console.error('Query execution error:', error);

        // Check if it was a cancellation
        if (error.name === 'AbortError' || error.message?.includes('cancel')) {
          this.dataTabContent = '<div class="info">Query cancelled by user</div>';
        } else {
          this.dataTabContent =
            '<div class="error">Query error: ' + (error.message || 'Unknown error') + '</div>';
        }

        this.queryStats = null;
      } finally {
        (this as any)._executing = false;
        this.currentQueryId = null;
      }
    },

    async cancelQuery(): Promise<void> {
      if (!this.currentQueryId) {
        console.log('No active query to cancel');
        return;
      }

      try {
        const response = await fetch('/api/query/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queryId: this.currentQueryId }),
        });

        const result = await response.json();
        if (result.cancelled) {
          this.dataTabContent = '<div class="info">Query cancelled successfully</div>';
          this.queryStats = null;
        }
      } catch (error) {
        console.error('Error cancelling query:', error);
      }
    },

    switchTab(tabName: 'data' | 'structure'): void {
      this.activeTab = tabName;
      if (tabName === 'structure' && this.selectedTable && !this.structureLoaded) {
        this.loadStructure();
      }
    },

    async loadStructure(): Promise<void> {
      try {
        this.structureTabContent =
          '<div class="loading"><div class="spinner"></div>Loading structure...</div>';
        const response = await fetch(
          '/api/table/' + this.selectedTable + '/structure'
        );
        const html = await response.text();
        this.structureTabContent = html;
        this.structureLoaded = true;
      } catch (error) {
        this.structureTabContent = '<div class="error">Error loading structure</div>';
      }
    },

    clearQuery(): void {
      const editor = window.__monacoEditor;
      if (editor) {
        editor.setValue('');
      }
    },
  };
}

// Auto-register with Alpine when it initializes
if (typeof window !== 'undefined') {
  // Register immediately if Alpine is already available
  if ((window as any).Alpine) {
    (window as any).Alpine.data('dbClient', dbClient);
  } else {
    // Otherwise wait for Alpine to initialize
    document.addEventListener('alpine:init', () => {
      (window as any).Alpine.data('dbClient', dbClient);
    });
  }
}
