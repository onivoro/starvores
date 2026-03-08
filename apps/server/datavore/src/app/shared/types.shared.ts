/**
 * Shared types between client and server for DataVore
 */

export interface DbClientState {
  query: string;
  editor: any; // Monaco editor instance
  selectedTable: string;
  activeTab: 'data' | 'structure';
  isConnected: boolean;
  tableCount: number;
  allTables: string;
  filteredTablesHtml: string;
  dataTabContent: string;
  structureTabContent: string;
  structureLoaded: boolean;
  _executing: boolean; // Prevent multiple simultaneous executions
  currentQueryId: string | null; // Track current query for cancellation
  queryStats: {
    elapsedMs: number;
    rowCount: number;
  } | null;

  // Computed properties
  resultsHtml: string;

  // Methods
  init(): void;
  getConnectionString(): string;
  getStorageKey(): string;
  saveQueryToLocalStorage(query: string): void;
  loadQueryFromLocalStorage(): string;
  initMonaco(): void;
  createEditor(container: HTMLElement): void;
  loadTables(): Promise<void>;
  selectTable(tableName: string): Promise<void>;
  executeQuery(): Promise<void>;
  cancelQuery(): Promise<void>;
  switchTab(tabName: 'data' | 'structure'): void;
  loadStructure(): Promise<void>;
  clearQuery(): void;
}

export interface TableInfo {
  tableName: string;
}

export interface QueryResult {
  html: string;
  rowCount?: number;
  error?: string;
}
