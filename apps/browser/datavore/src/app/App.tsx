import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import Editor from '@monaco-editor/react';
import {
  createDatavoreApi,
  DatabaseInfo,
  QueryJsonlExportError,
  TableInfo,
  TableStructureInfo,
} from '@onivoro/axios-datavore';
import {
  closeTabInWorkspace,
  createTab,
  getNextTabName,
  getPinnedTablesStorageKey,
  getTabsStorageKey,
  loadPinnedTables,
  loadWorkspaceState,
  renameTabInWorkspace,
  serializePinnedTables,
  serializeWorkspaceState,
  SqlWorkspaceState,
  updateTabQueryInWorkspace,
} from './queryWorkspace';

const api = createDatavoreApi('');

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown }; status?: number } }).response;
    const message = response?.data?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (typeof response?.status === 'number') return `${fallback} (HTTP ${response.status})`;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

type ResultState = {
  rows: Record<string, unknown>[];
  rowCount: number;
  elapsedMs: number;
  error?: string;
};

type DensityMode = 'comfortable' | 'compact';
type SidebarView = 'sql' | 'table';
type ExportStatus = 'idle' | 'preparing' | 'streaming' | 'completed' | 'cancelled' | 'failed';
type ExportLimitMode = 'none' | '10k' | '100k' | 'custom';

type ExportState = {
  status: ExportStatus;
  rowCount: number;
  bytesWritten: number;
  filename: string;
  partialSaved: boolean;
  message?: string;
};

type SidebarNavItem = {
  id: string;
  type: 'sql' | 'table';
  tableName?: string;
};

const DEFAULT_QUERY = 'SELECT * FROM table_name LIMIT 100;';
const QUERY_STORAGE_PREFIX = 'datavore-query';
const DENSITY_STORAGE_KEY = 'datavore-density-mode';

const getQueryStorageKey = (dbInfo: DatabaseInfo | null): string | null => {
  if (!dbInfo) return null;

  const stableConnectionKey = dbInfo.connectionKey?.trim();
  if (stableConnectionKey) {
    return `${QUERY_STORAGE_PREFIX}:${stableConnectionKey}`;
  }

  const type = dbInfo.type ?? 'unknown';
  const databaseName = dbInfo.databaseName ?? 'db';
  const host = dbInfo.host ?? 'localhost';
  const port = String(dbInfo.port ?? '');
  const username = dbInfo.username ?? 'user';

  return `${QUERY_STORAGE_PREFIX}:${[type, host, port, databaseName, username].join(':')}`;
};
const DEFAULT_EXPORT_LIMIT_MODE: ExportLimitMode = 'none';

const DEFAULT_EXPORT_STATE: ExportState = {
  status: 'idle',
  rowCount: 0,
  bytesWritten: 0,
  filename: '',
  partialSaved: false,
};

const getDefaultExportFilename = (): string => {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  return `query-${timestamp}.jsonl`;
};

const parseContentDispositionFilename = (contentDisposition: string | null): string | null => {
  if (!contentDisposition) return null;
  const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  return match?.[1]?.trim() || null;
};

const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const countNewlines = (text: string): number => (text.match(/\n/g) ?? []).length;

const getJsonlExportErrorMessage = (errorData: QueryJsonlExportError | null, status: number): string => {
  const message = errorData?.message;
  if (typeof message === 'string' && message.trim()) return message;
  return `Export request failed (HTTP ${status}).`;
};

const getTableFilterMatcher = (tableFilter: string): ((table: TableInfo) => boolean) => {
  const filter = tableFilter.trim().toLowerCase();
  if (!filter) return () => true;
  return (table) => table.tableName.toLowerCase().includes(filter);
};

export function App() {
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [dbInfoError, setDbInfoError] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('');
  const [pinnedTables, setPinnedTables] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<SidebarView>('sql');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'data' | 'structure'>('data');
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);
  const [tableDataError, setTableDataError] = useState<string | null>(null);
  const [tableDataLoading, setTableDataLoading] = useState(false);
  const [structure, setStructure] = useState<TableStructureInfo | null>(null);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [sqlWorkspace, setSqlWorkspace] = useState<SqlWorkspaceState>(() => loadWorkspaceState(null, DEFAULT_QUERY));
  const [workspaceHydratedForKey, setWorkspaceHydratedForKey] = useState<string | null>(null);
  const [canPersistWorkspace, setCanPersistWorkspace] = useState(false);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [tabNameDraft, setTabNameDraft] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState(getDefaultExportFilename());
  const [exportLimitMode, setExportLimitMode] = useState<ExportLimitMode>(DEFAULT_EXPORT_LIMIT_MODE);
  const [exportCustomLimit, setExportCustomLimit] = useState('250000');
  const [includeMetadataHeader, setIncludeMetadataHeader] = useState(false);
  const [exportState, setExportState] = useState<ExportState>(DEFAULT_EXPORT_STATE);
  const [density, setDensity] = useState<DensityMode>(() => {
    const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
    return saved === 'compact' ? 'compact' : 'comfortable';
  });
  const editorRef = useRef<any>(null);
  const [editorReady, setEditorReady] = useState(false);
  const tableListRef = useRef<HTMLDivElement | null>(null);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const exportQueryIdRef = useRef<string | null>(null);
  const exportCancelledByUserRef = useRef(false);

  const queryStorageKey = useMemo(() => getQueryStorageKey(dbInfo), [dbInfo]);
  const tabsStorageKey = useMemo(() => getTabsStorageKey(queryStorageKey), [queryStorageKey]);
  const pinnedTablesStorageKey = useMemo(() => getPinnedTablesStorageKey(queryStorageKey), [queryStorageKey]);

  const activeSqlTab = useMemo(
    () => sqlWorkspace.tabs.find((tab) => tab.id === sqlWorkspace.activeTabId) ?? sqlWorkspace.tabs[0],
    [sqlWorkspace.activeTabId, sqlWorkspace.tabs],
  );


  const loadConnectionInfo = useCallback(async () => {
    try {
      setDbInfoError(null);
      const { data } = await api.getDatabaseInfo();
      setDbInfo(data);
    } catch (error) {
      setDbInfo(null);
      setDbInfoError(getErrorMessage(error, 'Failed to load connection info.'));
    }
  }, []);

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      setTablesError(null);
      const { data } = await api.getTables();
      setTables(data);
    } catch (error) {
      setTables([]);
      setTablesError(getErrorMessage(error, 'Failed to load tables.'));
    } finally {
      setTablesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnectionInfo();
    void loadTables();
  }, [loadConnectionInfo, loadTables]);

  useEffect(() => {
    setCanPersistWorkspace(false);

    if (!tabsStorageKey) {
      setSqlWorkspace(loadWorkspaceState(null, DEFAULT_QUERY));
      setWorkspaceHydratedForKey(null);
      requestAnimationFrame(() => setCanPersistWorkspace(true));
      return;
    }

    const legacyQuery = queryStorageKey ? localStorage.getItem(queryStorageKey) : null;
    const rawWorkspace = localStorage.getItem(tabsStorageKey);
    const hydratedWorkspace = loadWorkspaceState(rawWorkspace, legacyQuery || DEFAULT_QUERY);
    setSqlWorkspace(hydratedWorkspace);
    setWorkspaceHydratedForKey(tabsStorageKey);

    const hydratedActiveTab = hydratedWorkspace.tabs.find((tab) => tab.id === hydratedWorkspace.activeTabId) ?? hydratedWorkspace.tabs[0];
    if (hydratedActiveTab?.query) {
      requestAnimationFrame(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const currentValue = editor.getValue?.();
        if (typeof currentValue === 'string' && currentValue !== hydratedActiveTab.query) {
          editor.setValue(hydratedActiveTab.query);
        }
      });
    }

    requestAnimationFrame(() => setCanPersistWorkspace(true));
  }, [queryStorageKey, tabsStorageKey]);

  useEffect(() => {
    if (!pinnedTablesStorageKey) {
      setPinnedTables([]);
      return;
    }

    setPinnedTables(loadPinnedTables(localStorage.getItem(pinnedTablesStorageKey)));
  }, [pinnedTablesStorageKey]);

  useEffect(() => {
    localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  useEffect(() => {
    if (!canPersistWorkspace || !tabsStorageKey || workspaceHydratedForKey !== tabsStorageKey) return;

    localStorage.setItem(tabsStorageKey, serializeWorkspaceState(sqlWorkspace));
    if (queryStorageKey && activeSqlTab) {
      localStorage.setItem(queryStorageKey, activeSqlTab.query);
    }
  }, [activeSqlTab, canPersistWorkspace, queryStorageKey, sqlWorkspace, tabsStorageKey, workspaceHydratedForKey]);

  useEffect(() => {
    if (!pinnedTablesStorageKey) return;
    localStorage.setItem(pinnedTablesStorageKey, serializePinnedTables(pinnedTables));
  }, [pinnedTables, pinnedTablesStorageKey]);

  useEffect(() => {
    if (!editorReady) return;
    const editor = editorRef.current;
    if (!editor || !activeSqlTab) return;
    const currentValue = editor.getValue?.();
    if (typeof currentValue === 'string' && currentValue !== activeSqlTab.query) {
      editor.setValue(activeSqlTab.query);
    }
  }, [activeSqlTab, editorReady]);

  useEffect(() => {
    if (!activeSqlTab || !queryStorageKey) return;
    const persistedQuery = localStorage.getItem(queryStorageKey);
    if (!persistedQuery || persistedQuery === activeSqlTab.query) return;

    setSqlWorkspace((current) => updateTabQueryInWorkspace(current, activeSqlTab.id, persistedQuery));
  }, [activeSqlTab, queryStorageKey]);

  useEffect(
    () => () => {
      exportAbortControllerRef.current?.abort();
    },
    [],
  );

  const updateActiveTabQuery = useCallback(
    (value: string) => {
      if (!activeSqlTab) return;
      setSqlWorkspace((current) => updateTabQueryInWorkspace(current, activeSqlTab.id, value));
    },
    [activeSqlTab],
  );

  const createNewSqlTab = useCallback(() => {
    setSqlWorkspace((current) => {
      const newTab = createTab('', current.tabs.length, getNextTabName(current.tabs));
      return {
        tabs: [...current.tabs, newTab],
        activeTabId: newTab.id,
      };
    });
    setActiveView('sql');
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const closeSqlTab = useCallback(
    (tabId?: string) => {
      const targetTabId = tabId ?? activeSqlTab?.id;
      if (!targetTabId) return;
      setSqlWorkspace((current) => closeTabInWorkspace(current, targetTabId, DEFAULT_QUERY));
      if (renamingTabId === targetTabId) {
        setRenamingTabId(null);
        setTabNameDraft('');
      }
    },
    [activeSqlTab?.id, renamingTabId],
  );

  const startRenameTab = useCallback((tabId: string, currentName: string) => {
    setRenamingTabId(tabId);
    setTabNameDraft(currentName);
  }, []);

  const commitRenameTab = useCallback(() => {
    if (!renamingTabId) return;
    setSqlWorkspace((current) => renameTabInWorkspace(current, renamingTabId, tabNameDraft));
    setRenamingTabId(null);
    setTabNameDraft('');
  }, [renamingTabId, tabNameDraft]);

  const selectTable = async (tableName: string) => {
    setActiveView('table');
    setSelectedTable(tableName);
    setActiveTab('data');
    setTableData([]);
    setStructure(null);
    setTableDataError(null);
    setStructureError(null);
    setTableDataLoading(true);
    setStructureLoading(true);

    const [dataResult, structureResult] = await Promise.allSettled([
      api.getTableData(tableName),
      api.getTableStructure(tableName),
    ]);

    if (dataResult.status === 'fulfilled') {
      setTableData(dataResult.value.data as Record<string, unknown>[]);
    } else {
      setTableDataError(getErrorMessage(dataResult.reason, 'Failed to load table data.'));
    }
    setTableDataLoading(false);

    if (structureResult.status === 'fulfilled') {
      setStructure(structureResult.value.data);
    } else {
      setStructureError(getErrorMessage(structureResult.reason, 'Failed to load table structure.'));
    }
    setStructureLoading(false);
  };

  const focusEditor = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const getEditorContents = useCallback(() => {
    return editorRef.current?.getValue?.() ?? activeSqlTab?.query ?? '';
  }, [activeSqlTab?.query]);

  const tableMatchesFilter = useMemo(() => getTableFilterMatcher(tableFilter), [tableFilter]);

  const filteredTables = useMemo(() => tables.filter(tableMatchesFilter), [tableMatchesFilter, tables]);

  const pinnedTableSet = useMemo(() => new Set(pinnedTables), [pinnedTables]);

  const pinnedVisibleTables = useMemo(
    () => filteredTables.filter((table) => pinnedTableSet.has(table.tableName)),
    [filteredTables, pinnedTableSet],
  );

  const unpinnedVisibleTables = useMemo(
    () => filteredTables.filter((table) => !pinnedTableSet.has(table.tableName)),
    [filteredTables, pinnedTableSet],
  );

  const sidebarNavItems = useMemo<SidebarNavItem[]>(() => {
    const items: SidebarNavItem[] = [{ id: 'sql', type: 'sql' }];
    pinnedVisibleTables.forEach((table) => {
      items.push({ id: `table:${table.tableName}`, type: 'table', tableName: table.tableName });
    });
    unpinnedVisibleTables.forEach((table) => {
      items.push({ id: `table:${table.tableName}`, type: 'table', tableName: table.tableName });
    });
    return items;
  }, [pinnedVisibleTables, unpinnedVisibleTables]);

  const focusSelectedSidebarItem = useCallback(() => {
    if (!tableListRef.current) return;
    const selectedIndex = sidebarNavItems.findIndex((item) => {
      if (activeView === 'sql') return item.type === 'sql';
      return item.type === 'table' && item.tableName === selectedTable;
    });
    const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const target = tableListRef.current.querySelector<HTMLButtonElement>(`button[data-sidebar-idx="${targetIndex}"]`);
    target?.focus();
  }, [activeView, selectedTable, sidebarNavItems]);

  const getQueryToExecute = useCallback(() => {
    const activeQuery = activeSqlTab?.query ?? '';
    if (!editorRef.current) return activeQuery;
    const selection = editorRef.current.getSelection?.();
    if (selection && typeof selection.isEmpty === 'function' && !selection.isEmpty()) {
      const selectedQuery = editorRef.current.getModel?.()?.getValueInRange?.(selection) ?? '';
      if (selectedQuery.trim()) return selectedQuery;
    }
    return getEditorContents();
  }, [activeSqlTab?.query, getEditorContents]);

  const hasExecutableQuery = useMemo(() => getQueryToExecute().trim().length > 0, [getQueryToExecute]);
  const exportInProgress = exportState.status === 'preparing' || exportState.status === 'streaming';

  const togglePin = useCallback((tableName: string) => {
    setPinnedTables((current) =>
      current.includes(tableName) ? current.filter((name) => name !== tableName) : [...current, tableName],
    );
  }, []);

  const getExportLimit = (): number | undefined => {
    if (exportLimitMode === 'none') return undefined;
    if (exportLimitMode === '10k') return 10_000;
    if (exportLimitMode === '100k') return 100_000;
    const parsed = Number(exportCustomLimit);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed);
  };

  const cancelExport = useCallback(async () => {
    const activeQueryId = exportQueryIdRef.current;
    if (!activeQueryId) return;

    exportCancelledByUserRef.current = true;
    exportAbortControllerRef.current?.abort();
    setExportState((current) => ({
      ...current,
      status: 'cancelled',
      message: 'Cancelling export...',
    }));

    try {
      await api.cancelQuery(activeQueryId);
    } catch {
      // Best effort only; local abort already stops browser stream.
    }
  }, []);

  const startJsonlExport = useCallback(async () => {
    if (exportInProgress) return;

    const queryToExport = getQueryToExecute();
    if (!queryToExport.trim()) {
      setExportState({
        ...DEFAULT_EXPORT_STATE,
        status: 'failed',
        filename: exportFilename,
        message: 'Query is required before exporting.',
      });
      return;
    }

    const queryIdForExport = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    exportQueryIdRef.current = queryIdForExport;
    exportCancelledByUserRef.current = false;

    const controller = new AbortController();
    exportAbortControllerRef.current = controller;

    setExportState({
      status: 'preparing',
      rowCount: 0,
      bytesWritten: 0,
      filename: exportFilename,
      partialSaved: false,
      message: 'Preparing export...',
    });

    let bytesWritten = 0;
    let lineCount = 0;
    let metadataLineSeen = false;
    const textDecoder = new TextDecoder();
    const chunks: Uint8Array[] = [];

    try {
      const response = await api.streamQueryJsonl(
        {
          query: queryToExport,
          queryId: queryIdForExport,
          limit: getExportLimit(),
          includeMetadataHeader,
          filename: exportFilename,
        },
        controller.signal,
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as QueryJsonlExportError | null;
        throw new Error(getJsonlExportErrorMessage(errorData, response.status));
      }

      const filenameFromHeader = parseContentDispositionFilename(response.headers.get('content-disposition'));
      const resolvedFilename = filenameFromHeader ?? exportFilename;
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming response body is not available in this browser.');
      }

      setExportState((current) => ({
        ...current,
        status: 'streaming',
        filename: resolvedFilename,
        message: 'Streaming export...',
      }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        chunks.push(value);
        bytesWritten += value.byteLength;

        const chunkText = textDecoder.decode(value, { stream: true });
        lineCount += countNewlines(chunkText);
        if (!metadataLineSeen && includeMetadataHeader && lineCount > 0) {
          metadataLineSeen = true;
        }

        const estimatedRows = includeMetadataHeader && metadataLineSeen ? Math.max(lineCount - 1, 0) : lineCount;
        setExportState((current) => ({
          ...current,
          status: 'streaming',
          rowCount: estimatedRows,
          bytesWritten,
          filename: resolvedFilename,
          partialSaved: bytesWritten > 0,
          message: 'Streaming export...',
        }));
      }

      triggerDownload(new Blob(chunks, { type: 'application/x-ndjson;charset=utf-8' }), resolvedFilename);
      setExportState((current) => ({
        ...current,
        status: 'completed',
        rowCount: current.rowCount,
        bytesWritten,
        filename: resolvedFilename,
        partialSaved: bytesWritten > 0,
        message: 'Export completed.',
      }));
    } catch (error) {
      if (controller.signal.aborted || exportCancelledByUserRef.current) {
        setExportState((current) => ({
          ...current,
          status: 'cancelled',
          partialSaved: bytesWritten > 0 || current.bytesWritten > 0,
          message: bytesWritten > 0 ? 'Export cancelled. A partial file may exist.' : 'Export cancelled.',
        }));
      } else {
        setExportState((current) => ({
          ...current,
          status: 'failed',
          partialSaved: bytesWritten > 0 || current.bytesWritten > 0,
          message: getErrorMessage(error, 'Export failed.'),
        }));
      }
    } finally {
      exportAbortControllerRef.current = null;
      exportQueryIdRef.current = null;
      exportCancelledByUserRef.current = false;
    }
  }, [
    exportCustomLimit,
    exportFilename,
    exportInProgress,
    exportLimitMode,
    getQueryToExecute,
    includeMetadataHeader,
  ]);

  const executeQuery = useCallback(async () => {
    if (executing) return;
    const queryToExecute = getQueryToExecute();
    if (!queryToExecute.trim()) return;

    setActiveView('sql');
    setActiveTab('data');
    setResult(null);
    setResultError(null);
    setExecuting(true);
    const id = `q-${Date.now()}`;
    setQueryId(id);

    const editorContents = getEditorContents();
    if (activeSqlTab) {
      setSqlWorkspace((current) => updateTabQueryInWorkspace(current, activeSqlTab.id, editorContents));
    }

    try {
      const { data } = await api.executeQuery(queryToExecute, id);
      setResult(data);
    } catch (error) {
      setResult({ rows: [], rowCount: 0, elapsedMs: 0 });
      setResultError(getErrorMessage(error, 'Failed to execute query.'));
    } finally {
      setExecuting(false);
      setQueryId(null);
      focusEditor();
    }
  }, [activeSqlTab, executing, focusEditor, getEditorContents, getQueryToExecute]);

  const cancelQuery = async () => {
    if (!queryId) return;
    try {
      const { data } = await api.cancelQuery(queryId);
      if (!data.cancelled) {
        setResultError('Query cancellation was not acknowledged by the server.');
        return;
      }
      setExecuting(false);
      setResultError('Query cancelled by user.');
      setResult({ rows: [], rowCount: 0, elapsedMs: 0, error: 'Query cancelled' });
      setQueryId(null);
    } catch (error) {
      setResultError(getErrorMessage(error, 'Failed to cancel query.'));
    }
  };

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'e') {
        event.preventDefault();
        focusEditor();
        return;
      }
      if (key === 'l') {
        event.preventDefault();
        focusSelectedSidebarItem();
        return;
      }
      if (key === 't' && !event.shiftKey) {
        event.preventDefault();
        createNewSqlTab();
        return;
      }
      if (key === 'w') {
        event.preventDefault();
        closeSqlTab();
        return;
      }
      if (key === 'enter') {
        event.preventDefault();
        void executeQuery();
        return;
      }
      if (key === '1') {
        event.preventDefault();
        setActiveTab('data');
        return;
      }
      if (key === '2') {
        event.preventDefault();
        setActiveTab('structure');
        return;
      }
      if (key === ',') {
        event.preventDefault();
        setDensity((current) => (current === 'comfortable' ? 'compact' : 'comfortable'));
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [closeSqlTab, createNewSqlTab, executeQuery, focusEditor, focusSelectedSidebarItem]);

  const selectSqlView = useCallback(() => {
    setActiveView('sql');
  }, []);

  const handleSidebarNav = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      const maxIndex = sidebarNavItems.length - 1;

      const focusItemByIndex = (index: number) => {
        if (!tableListRef.current) return;
        const button = tableListRef.current.querySelector<HTMLButtonElement>(`button[data-sidebar-idx="${index}"]`);
        button?.focus();
      };

      const activateIndex = (index: number) => {
        const target = sidebarNavItems[index];
        if (!target) return;
        if (target.type === 'sql') {
          selectSqlView();
          return;
        }
        if (target.tableName) {
          void selectTable(target.tableName);
        }
      };

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusItemByIndex(Math.min(currentIndex + 1, maxIndex));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusItemByIndex(Math.max(currentIndex - 1, 0));
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusItemByIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusItemByIndex(maxIndex);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateIndex(currentIndex);
      }
    },
    [selectSqlView, selectTable, sidebarNavItems],
  );

  return (
    <div className="dv-shell" data-density={density}>
      <aside className="dv-sidebar">
        <div className="dv-sidebar-head">
          <h1 className="text-lg font-semibold">DataVore</h1>
          <p className="text-xs text-subtle mt-1" aria-live="polite">
            {dbInfo
              ? `${dbInfo.type} / ${dbInfo.databaseName ?? 'unknown'}`
              : dbInfoError ?? 'Connecting...'}
          </p>
        </div>

        <div className="dv-section-head">
          <h2 className="dv-section-title">Navigator</h2>
        </div>

        <div className="dv-section-head">
          <h2 className="dv-section-title">Tables</h2>
          <p className="dv-section-meta">{tables.length.toLocaleString()} total</p>
        </div>

        <label className="dv-sidebar-search-label" htmlFor="table-search">Filter tables</label>
        <input
          id="table-search"
          className="dv-input"
          value={tableFilter}
          onChange={(event) => setTableFilter(event.target.value)}
          placeholder="Search table names"
        />

        <div className="space-y-2" ref={tableListRef} role="listbox" aria-label="Database navigation">
          <button
            className={`dv-input dv-nav-query text-left ${activeView === 'sql' ? 'ring-1 ring-accent' : ''}`}
            onClick={selectSqlView}
            onKeyDown={(event) => handleSidebarNav(event, 0)}
            data-sidebar-idx={0}
            role="option"
            aria-selected={activeView === 'sql'}
          >
            SQL Query
          </button>

          {tablesLoading && <p className="dv-empty">Loading tables...</p>}
          {tablesError && (
            <div className="dv-state dv-state-error">
              <p>{tablesError}</p>
              <button className="dv-btn-ghost mt-3" onClick={() => void loadTables()}>
                Retry
              </button>
            </div>
          )}
          {!tablesLoading && !tablesError && filteredTables.length === 0 && (
            <p className="dv-empty">No matching tables.</p>
          )}

          {!tablesLoading && !tablesError && pinnedVisibleTables.length > 0 && (
            <div className="dv-sidebar-subsection">
              <p className="dv-section-meta">Pinned</p>
              {pinnedVisibleTables.map((table, index) => {
                const itemIndex = sidebarNavItems.findIndex((item) => item.id === `table:${table.tableName}`);
                return (
                  <div className="dv-nav-row" key={`pinned-${table.tableName}`}>
                    <button
                      className={`dv-input text-left ${activeView === 'table' && selectedTable === table.tableName ? 'ring-1 ring-accent' : ''}`}
                      onClick={() => void selectTable(table.tableName)}
                      onKeyDown={(event) => handleSidebarNav(event, itemIndex)}
                      data-sidebar-idx={itemIndex}
                      role="option"
                      aria-selected={activeView === 'table' && selectedTable === table.tableName}
                    >
                      {table.tableName}
                    </button>
                    <button
                      className="dv-pin-btn"
                      onClick={() => togglePin(table.tableName)}
                      aria-label={`Unpin ${table.tableName}`}
                      title="Unpin table"
                    >
                      ★
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!tablesLoading &&
            !tablesError &&
            unpinnedVisibleTables.map((table) => {
              const itemIndex = sidebarNavItems.findIndex((item) => item.id === `table:${table.tableName}`);
              const isPinned = pinnedTableSet.has(table.tableName);
              return (
                <div className="dv-nav-row" key={table.tableName}>
                  <button
                    className={`dv-input text-left ${activeView === 'table' && selectedTable === table.tableName ? 'ring-1 ring-accent' : ''}`}
                    onClick={() => void selectTable(table.tableName)}
                    onKeyDown={(event) => handleSidebarNav(event, itemIndex)}
                    data-sidebar-idx={itemIndex}
                    role="option"
                    aria-selected={activeView === 'table' && selectedTable === table.tableName}
                  >
                    {table.tableName}
                  </button>
                  <button
                    className="dv-pin-btn"
                    onClick={() => togglePin(table.tableName)}
                    aria-label={isPinned ? `Unpin ${table.tableName}` : `Pin ${table.tableName}`}
                    title={isPinned ? 'Unpin table' : 'Pin table'}
                  >
                    {isPinned ? '★' : '☆'}
                  </button>
                </div>
              );
            })}
        </div>
      </aside>

      <main className="dv-main">
        {exportModalOpen && (
          <section className="dv-modal-backdrop" role="dialog" aria-modal="true" aria-label="Export JSONL">
            <div className="dv-modal">
              <div className="dv-section-head">
                <h2 className="dv-section-title">Export JSONL</h2>
                <p className="dv-section-meta">Uses selected SQL text when a selection exists.</p>
              </div>

              <label className="dv-modal-field">
                Filename
                <input
                  className="dv-input"
                  value={exportFilename}
                  onChange={(event) => setExportFilename(event.target.value)}
                />
              </label>

              <label className="dv-modal-field">
                Row limit
                <select
                  className="dv-select"
                  value={exportLimitMode}
                  onChange={(event) => setExportLimitMode(event.target.value as ExportLimitMode)}
                >
                  <option value="none">No limit (server cap applies)</option>
                  <option value="10k">10k</option>
                  <option value="100k">100k</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              {exportLimitMode === 'custom' && (
                <label className="dv-modal-field">
                  Custom limit
                  <input
                    className="dv-input"
                    type="number"
                    min={1}
                    step={1}
                    value={exportCustomLimit}
                    onChange={(event) => setExportCustomLimit(event.target.value)}
                  />
                </label>
              )}

              <label className="dv-modal-check">
                <input
                  type="checkbox"
                  checked={includeMetadataHeader}
                  onChange={(event) => setIncludeMetadataHeader(event.target.checked)}
                />
                Include metadata header line
              </label>

              <div className="dv-modal-actions">
                <button className="dv-btn" onClick={() => void startJsonlExport()} disabled={exportInProgress}>
                  {exportInProgress ? 'Exporting...' : 'Start export'}
                </button>
                {exportInProgress && (
                  <button className="dv-btn-danger" onClick={() => void cancelExport()}>
                    Cancel export
                  </button>
                )}
                <button className="dv-btn-ghost" onClick={() => setExportModalOpen(false)} disabled={exportInProgress}>
                  Close
                </button>
              </div>
            </div>
          </section>
        )}

        {activeView === 'sql' ? (
          <>
            <section className="dv-card dv-card-pad dv-query-section">
              <div className="dv-query-toolbar">
                <div className="dv-section-head">
                  <h2 className="dv-section-title">SQL Query Workspace</h2>
                  <p className="dv-section-meta">Cmd/Ctrl+T new tab • Cmd/Ctrl+W close tab • Cmd/Ctrl+Enter run</p>
                </div>
                <div className="dv-toolbar-actions">
                  <label className="dv-density-label" htmlFor="density-mode">Density</label>
                  <select
                    id="density-mode"
                    className="dv-select"
                    value={density}
                    onChange={(event) => setDensity(event.target.value as DensityMode)}
                    aria-label="Set layout density"
                  >
                    <option value="comfortable">Comfortable</option>
                    <option value="compact">Compact</option>
                  </select>
                  <button
                    className="dv-btn-ghost"
                    onClick={() => {
                      updateActiveTabQuery('');
                      focusEditor();
                    }}
                  >
                    Clear
                  </button>
                  <button
                    className="dv-btn-ghost"
                    onClick={() => {
                      setExportFilename(getDefaultExportFilename());
                      setExportModalOpen(true);
                    }}
                    disabled={!hasExecutableQuery || exportInProgress}
                  >
                    Export JSONL
                  </button>
                  {!executing ? (
                    <button className="dv-btn" onClick={() => void executeQuery()}>Run</button>
                  ) : (
                    <button className="dv-btn-danger" onClick={() => void cancelQuery()}>Cancel</button>
                  )}
                </div>
              </div>

              <div className="dv-sql-tabs" role="tablist" aria-label="SQL tabs">
                {sqlWorkspace.tabs.map((tab) => {
                  const isActive = tab.id === activeSqlTab?.id;
                  const isRenaming = tab.id === renamingTabId;
                  return (
                    <div key={tab.id} className={`dv-sql-tab ${isActive ? 'is-active' : ''}`}>
                      <button
                        role="tab"
                        aria-selected={isActive}
                        className="dv-sql-tab-main"
                        onClick={() => {
                          setActiveView('sql');
                          setSqlWorkspace((current) => ({ ...current, activeTabId: tab.id }));
                        }}
                        onDoubleClick={() => startRenameTab(tab.id, tab.name)}
                      >
                        {isRenaming ? (
                          <input
                            className="dv-sql-tab-input"
                            value={tabNameDraft}
                            onChange={(event) => setTabNameDraft(event.target.value)}
                            onBlur={commitRenameTab}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                commitRenameTab();
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setRenamingTabId(null);
                                setTabNameDraft('');
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <span className="truncate">{tab.name}</span>
                        )}
                      </button>
                      <button
                        className="dv-sql-tab-close"
                        onClick={(event) => {
                          event.stopPropagation();
                          closeSqlTab(tab.id);
                        }}
                        aria-label={`Close ${tab.name}`}
                        title="Close tab"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                <button className="dv-sql-tab-add" onClick={createNewSqlTab} aria-label="New SQL tab" title="New SQL tab">
                  +
                </button>
              </div>

              <div className="dv-editor-shell">
                <Editor
                  height={density === 'compact' ? '220px' : '260px'}
                  defaultLanguage="sql"
                  value={activeSqlTab?.query ?? ''}
                  onChange={(v) => updateActiveTabQuery(v ?? '')}
                  theme="vs-dark"
                  options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    setEditorReady(true);
                    if (editor.getValue() !== (activeSqlTab?.query ?? '')) {
                      editor.setValue(activeSqlTab?.query ?? '');
                    }
                    editor.focus();
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                      void executeQuery();
                    });
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT, () => {
                      createNewSqlTab();
                    });
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
                      closeSqlTab();
                    });
                  }}
                  onUnmount={() => {
                    editorRef.current = null;
                    setEditorReady(false);
                  }}
                />
              </div>
              {executing && <p className="dv-state-text">Executing query...</p>}
              {resultError && <p className="dv-state-text text-danger">{resultError}</p>}
              {exportState.status !== 'idle' && (
                <p className={`dv-state-text ${exportState.status === 'failed' ? 'text-danger' : ''}`}>
                  Export {exportState.status} • {exportState.rowCount.toLocaleString()} rows •{' '}
                  {exportState.bytesWritten.toLocaleString()} bytes
                  {exportState.partialSaved ? ' • partial data' : ''}
                  {exportState.message ? ` • ${exportState.message}` : ''}
                </p>
              )}
              {result && (
                <p className="text-xs text-subtle">
                  {result.rowCount.toLocaleString()} rows • {result.elapsedMs}ms
                </p>
              )}
            </section>

            <section className="dv-card dv-card-pad">
              {executing ? (
                <p className="dv-empty">Executing query...</p>
              ) : resultError ? (
                <p className="text-danger text-sm">{resultError}</p>
              ) : result?.error ? (
                <p className="text-danger text-sm">{result.error}</p>
              ) : result ? (
                <DataTable rows={result.rows} rowCount={result.rowCount} density={density} />
              ) : (
                <p className="dv-empty">Run a query to view results.</p>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="dv-query-toolbar">
              <div className="dv-section-head">
                <h2 className="dv-section-title">{selectedTable ? `Table: ${selectedTable}` : 'Table View'}</h2>
                <p className="dv-section-meta">Browse data and structure.</p>
              </div>
              <div className="dv-toolbar-actions">
                <button className="dv-btn-ghost" onClick={selectSqlView}>
                  Open SQL Query
                </button>
              </div>
            </div>

            {(executing || resultError || result) && (
              <section className="dv-card dv-card-pad">
                <div className="dv-query-toolbar">
                  <div className="dv-section-head">
                    <h3 className="dv-section-title">Latest SQL Result</h3>
                    <p className="dv-section-meta">From SQL Query workspace</p>
                  </div>
                  <div className="dv-toolbar-actions">
                    <button className="dv-btn-ghost" onClick={selectSqlView}>Open SQL Query</button>
                  </div>
                </div>
                {executing ? (
                  <p className="dv-empty">Executing query...</p>
                ) : resultError ? (
                  <p className="text-danger text-sm">{resultError}</p>
                ) : result?.error ? (
                  <p className="text-danger text-sm">{result.error}</p>
                ) : result ? (
                  <DataTable rows={result.rows} rowCount={result.rowCount} density={density} />
                ) : null}
              </section>
            )}

            <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as 'data' | 'structure')}>
              <Tabs.List className="dv-tab-list">
                <Tabs.Trigger className="dv-tab" value="data">Data</Tabs.Trigger>
                <Tabs.Trigger className="dv-tab" value="structure">Structure</Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="data" className="dv-card dv-card-pad">
                {!selectedTable ? (
                  <p className="dv-empty">Select a table to view data.</p>
                ) : tableDataLoading ? (
                  <p className="dv-empty">Loading table data...</p>
                ) : tableDataError ? (
                  <p className="text-danger text-sm">{tableDataError}</p>
                ) : (
                  <DataTable rows={tableData} density={density} />
                )}
              </Tabs.Content>

              <Tabs.Content value="structure" className="dv-card dv-card-pad">
                {!selectedTable ? (
                  <p className="dv-empty">Select a table to inspect structure.</p>
                ) : structureLoading ? (
                  <p className="dv-empty">Loading structure...</p>
                ) : structureError ? (
                  <p className="text-danger text-sm">{structureError}</p>
                ) : structure ? (
                  <StructurePanel structure={structure} density={density} />
                ) : (
                  <p className="dv-empty">No structure loaded.</p>
                )}
              </Tabs.Content>
            </Tabs.Root>
          </>
        )}
      </main>
    </div>
  );
}

function DataTable({
  rows,
  rowCount,
  density,
}: {
  rows: Record<string, unknown>[];
  rowCount?: number;
  density: DensityMode;
}) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const activeResize = resizingRef.current;
      if (!activeResize) return;
      const nextWidth = Math.max(80, activeResize.startWidth + (event.clientX - activeResize.startX));
      setColumnWidths((current) => ({ ...current, [activeResize.key]: nextWidth }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.body.classList.remove('dv-col-resizing');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('dv-col-resizing');
    };
  }, []);

  if (!rows?.length) return <p className="dv-empty">No rows</p>;
  const columns = Object.keys(rows[0] ?? {});
  const totalRows = rowCount ?? rows.length;

  return (
    <div className="dv-table-shell" data-density={density}>
      <div className="dv-table-status">
        <span>{totalRows.toLocaleString()} rows</span>
        <span>{columns.length.toLocaleString()} columns</span>
      </div>
      <div className="dv-table-scroll">
        <table className="dv-table">
          <thead>
            <tr>
              <th className="dv-table-index">#</th>
              {columns.map((column) => (
                <th key={column} className="text-left" style={columnWidths[column] ? { width: `${columnWidths[column]}px` } : undefined}>
                  <div className="dv-th-content">
                    <span>{column}</span>
                    <span
                      className="dv-col-resizer"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        const currentWidth = (event.currentTarget.parentElement?.parentElement as HTMLElement | null)?.offsetWidth ?? 140;
                        resizingRef.current = {
                          key: column,
                          startX: event.clientX,
                          startWidth: currentWidth,
                        };
                        document.body.classList.add('dv-col-resizing');
                      }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td className="dv-table-index">{idx + 1}</td>
                {columns.map((column) => (
                  <td
                    key={column}
                    className="dv-table-cell"
                    style={columnWidths[column] ? { width: `${columnWidths[column]}px` } : undefined}
                    title="Click to copy"
                    onClick={() => {
                      void navigator.clipboard.writeText(formatCellValue(row[column]));
                    }}
                  >
                    {renderCell(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StructurePanel({ structure, density }: { structure: TableStructureInfo; density: DensityMode }) {
  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="font-semibold mb-2">Columns</h3>
        <DataTable rows={structure.columns} density={density} />
      </section>

      <section>
        <h3 className="font-semibold mb-2">Primary Keys</h3>
        {structure.primaryKeys.length ? (
          <DataTable rows={structure.primaryKeys} density={density} />
        ) : (
          <p className="dv-empty">No primary keys.</p>
        )}
      </section>

      <section>
        <h3 className="font-semibold mb-2">Foreign Keys</h3>
        {structure.foreignKeys.length ? (
          <DataTable rows={structure.foreignKeys} density={density} />
        ) : (
          <p className="dv-empty">No foreign keys.</p>
        )}
      </section>

      <section>
        <h3 className="font-semibold mb-2">Indexes</h3>
        {structure.indices.length ? (
          <DataTable rows={structure.indices} density={density} />
        ) : (
          <p className="dv-empty">No indexes.</p>
        )}
      </section>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function renderCell(value: unknown) {
  if (value === null || value === undefined) return <span className="dv-cell-null">NULL</span>;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
