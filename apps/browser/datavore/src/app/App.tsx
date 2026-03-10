import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  addFavorite,
  addSuccessfulQueryToHistory,
  clampSqlSplitterRatio,
  closeTabInWorkspace,
  createTab,
  type FavoriteQuery,
  formatSqlWithFallback,
  getFavoritesStorageKey,
  getNextTabName,
  getPinnedTablesStorageKey,
  getQueryHistoryStorageKey,
  getSqlSplitterStorageKey,
  getTabsStorageKey,
  loadFavorites,
  loadPinnedTables,
  loadQueryHistory,
  loadSqlSplitterRatio,
  loadWorkspaceState,
  removeFavorite,
  renameTabInWorkspace,
  serializeFavorites,
  serializePinnedTables,
  serializeQueryHistory,
  serializeSqlSplitterRatio,
  serializeWorkspaceState,
  SqlQueryHistoryItem,
  SqlWorkspaceState,
  updateTabQueryInWorkspace,
} from './queryWorkspace';

const api = createDatavoreApi('');

/* ── Helpers ─────────────────────────────────────────────── */

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

type DbType = 'postgres' | 'mysql' | string;

let activeDbType: DbType = 'postgres';

const quoteIdentifier = (name: string): string =>
  activeDbType === 'mysql'
    ? `\`${name.replace(/`/g, '``')}\``
    : `"${name.replace(/"/g, '""')}"`;

const escapeSqlValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
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

const parseContentDispositionFilename = (contentDisposition: string | null): string | null => {
  if (!contentDisposition) return null;
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  return match?.[1]?.trim() || null;
};

const getTimestamp = (): string =>
  new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');

const getDefaultExportFilename = (): string => `query-${getTimestamp()}.jsonl`;

const getDefaultCsvFilename = (): string => `export-${getTimestamp()}.csv`;

const exportCsv = (rows: Record<string, unknown>[], filename: string) => {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const csvRows = [
    columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      columns
        .map((c) => {
          const val = row[c];
          if (val === null || val === undefined) return '';
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(','),
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
};

const buildFilterClause = (col: string, val: string): string => {
  const escaped = val.replace(/'/g, "''");
  if (activeDbType === 'mysql') {
    return `CAST(${quoteIdentifier(col)} AS CHAR) LIKE '%${escaped}%'`;
  }
  return `${quoteIdentifier(col)}::text ILIKE '%${escaped}%'`;
};

const buildWhereClause = (filters: Record<string, string>): string => {
  const clauses = Object.entries(filters)
    .filter(([, v]) => v.trim())
    .map(([col, val]) => buildFilterClause(col, val));
  return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
};

const buildSelectQuery = (
  table: string,
  sort: SortState,
  filters: Record<string, string>,
  limit: number,
  offset: number,
): string => {
  let sql = `SELECT * FROM ${quoteIdentifier(table)}${buildWhereClause(filters)}`;
  if (sort) sql += ` ORDER BY ${quoteIdentifier(sort.column)} ${sort.direction.toUpperCase()}`;
  sql += ` LIMIT ${limit} OFFSET ${offset}`;
  return sql;
};

const buildCountQuery = (table: string, filters: Record<string, string>): string =>
  `SELECT COUNT(*) as total FROM ${quoteIdentifier(table)}${buildWhereClause(filters)}`;

const buildRowWhereClause = (pkColumns: string[], row: Record<string, unknown>): string => {
  const keyColumns = pkColumns.length ? pkColumns : Object.keys(row);
  const clauses = keyColumns.map((col) => {
    const val = row[col];
    return val === null || val === undefined
      ? `${quoteIdentifier(col)} IS NULL`
      : `${quoteIdentifier(col)} = ${escapeSqlValue(val)}`;
  });
  return clauses.join(' AND ');
};

const buildUpdateQuery = (
  table: string,
  column: string,
  newValue: string,
  pkColumns: string[],
  row: Record<string, unknown>,
): string => {
  const setClause = `${quoteIdentifier(column)} = ${newValue === '' ? 'NULL' : escapeSqlValue(newValue)}`;
  return `UPDATE ${quoteIdentifier(table)} SET ${setClause} WHERE ${buildRowWhereClause(pkColumns, row)}`;
};

const buildDeleteQuery = (
  table: string,
  pkColumns: string[],
  row: Record<string, unknown>,
): string =>
  `DELETE FROM ${quoteIdentifier(table)} WHERE ${buildRowWhereClause(pkColumns, row)}`;

const buildInsertQuery = (
  table: string,
  values: Record<string, string>,
): string => {
  const cols = Object.keys(values).filter((k) => values[k].trim() !== '');
  if (!cols.length) return '';
  const colList = cols.map(quoteIdentifier).join(', ');
  const valList = cols.map((c) => escapeSqlValue(values[c])).join(', ');
  return `INSERT INTO ${quoteIdentifier(table)} (${colList}) VALUES (${valList})`;
};

/* ── Types ───────────────────────────────────────────────── */

type ResultState = {
  rows: Record<string, unknown>[];
  rowCount: number;
  elapsedMs: number;
  error?: string;
};

type SidebarView = 'sql' | 'table';
type ExportStatus = 'idle' | 'preparing' | 'streaming' | 'completed' | 'cancelled' | 'failed';
type ExportLimitMode = 'none' | '10k' | '100k' | 'custom';
type SortState = { column: string; direction: 'asc' | 'desc' } | null;
type SchemaObject = { name: string; schema: string; type?: string };
type SidebarSchemaSection = 'tables' | 'views' | 'functions' | 'sequences';

type CommandActionId =
  | 'open-sql-view'
  | 'focus-table-filter'
  | 'new-tab'
  | 'run-query'
  | 'explain-query'
  | 'format-sql'
  | 'export-csv'
  | 'toggle-filter-bar'
  | 'add-favorite';

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
const DEFAULT_PAGE_SIZE = 100;
const PAGE_SIZES = [25, 50, 100, 250, 500, 1000];

const getSchemaViewsQuery = (dbType: DbType): string => {
  if (dbType === 'mysql') {
    return `SELECT table_name as name, table_schema as \`schema\`
FROM information_schema.views
WHERE table_schema = DATABASE()
ORDER BY table_name`;
  }
  return `SELECT table_name as name, table_schema as schema
FROM information_schema.views
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_name`;
};

const getSchemaFunctionsQuery = (dbType: DbType): string => {
  if (dbType === 'mysql') {
    return `SELECT routine_name as name, routine_schema as \`schema\`, routine_type as type
FROM information_schema.routines
WHERE routine_schema = DATABASE()
ORDER BY routine_name`;
  }
  return `SELECT routine_name as name, routine_schema as schema, routine_type as type
FROM information_schema.routines
WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY routine_name`;
};

const getSchemaSequencesQuery = (dbType: DbType): string | null => {
  if (dbType === 'mysql') return null; // MySQL has no sequences (before 8.0 has none in info_schema)
  return `SELECT sequence_name as name, sequence_schema as schema
FROM information_schema.sequences
WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY sequence_name`;
};

declare global {
  interface Window {
    pgFormat?: (query: string) => string | Promise<string>;
  }
}

const getQueryStorageKey = (dbInfo: DatabaseInfo | null): string | null => {
  if (!dbInfo) return null;
  const stableConnectionKey = dbInfo.connectionKey?.trim();
  if (stableConnectionKey) return `${QUERY_STORAGE_PREFIX}:${stableConnectionKey}`;
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

/* ── App ─────────────────────────────────────────────────── */

export function App() {
  /* ── Connection & tables ── */
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [dbInfoError, setDbInfoError] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('');
  const [pinnedTables, setPinnedTables] = useState<string[]>([]);

  /* ── Schema objects ── */
  const [schemaViews, setSchemaViews] = useState<SchemaObject[]>([]);
  const [schemaFunctions, setSchemaFunctions] = useState<SchemaObject[]>([]);
  const [schemaSequences, setSchemaSequences] = useState<SchemaObject[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<SidebarSchemaSection, boolean>>({
    tables: true,
    views: false,
    functions: false,
    sequences: false,
  });

  /* ── View state ── */
  const [activeView, setActiveView] = useState<SidebarView>('sql');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'data' | 'structure'>('data');
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);
  const [tableDataError, setTableDataError] = useState<string | null>(null);
  const [tableDataLoading, setTableDataLoading] = useState(false);
  const [structure, setStructure] = useState<TableStructureInfo | null>(null);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);

  /* ── Table browsing (sort/filter/pagination) ── */
  const [tableSort, setTableSort] = useState<SortState>(null);
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({});
  const [filterBarOpen, setFilterBarOpen] = useState(false);
  const [tablePageSize, setTablePageSize] = useState(DEFAULT_PAGE_SIZE);
  const [tablePageOffset, setTablePageOffset] = useState(0);
  const [tableTotalRows, setTableTotalRows] = useState<number | null>(null);

  /* ── Inline editing ── */
  const [editMode, setEditMode] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string } | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [addingRow, setAddingRow] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});

  /* ── SQL workspace ── */
  const [result, setResult] = useState<ResultState | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<SqlQueryHistoryItem[]>([]);
  const [queryHistoryOpen, setQueryHistoryOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [sqlSplitRatio, setSqlSplitRatio] = useState(() => loadSqlSplitterRatio(null));
  const [sqlWorkspace, setSqlWorkspace] = useState<SqlWorkspaceState>(() => loadWorkspaceState(null, DEFAULT_QUERY));
  const [workspaceHydratedForKey, setWorkspaceHydratedForKey] = useState<string | null>(null);
  const [canPersistWorkspace, setCanPersistWorkspace] = useState(false);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [tabNameDraft, setTabNameDraft] = useState('');

  /* ── EXPLAIN ── */
  const [explainResult, setExplainResult] = useState<string | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);

  /* ── Favorites ── */
  const [favoriteQueries, setFavoriteQueries] = useState<FavoriteQuery[]>([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favoriteNameDraft, setFavoriteNameDraft] = useState('');
  const [saveFavoriteOpen, setSaveFavoriteOpen] = useState(false);

  /* ── Export ── */
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState(getDefaultExportFilename());
  const [exportLimitMode, setExportLimitMode] = useState<ExportLimitMode>(DEFAULT_EXPORT_LIMIT_MODE);
  const [exportCustomLimit, setExportCustomLimit] = useState('250000');
  const [includeMetadataHeader, setIncludeMetadataHeader] = useState(false);
  const [exportState, setExportState] = useState<ExportState>(DEFAULT_EXPORT_STATE);

  /* ── Command palette ── */
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteFilter, setCommandPaletteFilter] = useState('');
  const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);

  /* ── Refs ── */
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [editorReady, setEditorReady] = useState(false);
  const tableListRef = useRef<HTMLDivElement | null>(null);
  const tableFilterInputRef = useRef<HTMLInputElement | null>(null);
  const sqlSplitShellRef = useRef<HTMLDivElement | null>(null);
  const sqlSplitDragRef = useRef<{ startY: number; startRatio: number } | null>(null);
  const commandPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const exportQueryIdRef = useRef<string | null>(null);
  const exportCancelledByUserRef = useRef(false);
  const tablesRef = useRef<TableInfo[]>([]);
  const structureCacheRef = useRef<Map<string, TableStructureInfo>>(new Map());

  /* ── Derived state ── */
  const queryStorageKey = useMemo(() => getQueryStorageKey(dbInfo), [dbInfo]);
  const tabsStorageKey = useMemo(() => getTabsStorageKey(queryStorageKey), [queryStorageKey]);
  const pinnedTablesStorageKey = useMemo(() => getPinnedTablesStorageKey(queryStorageKey), [queryStorageKey]);
  const queryHistoryStorageKey = useMemo(() => getQueryHistoryStorageKey(queryStorageKey), [queryStorageKey]);
  const sqlSplitterStorageKey = useMemo(() => getSqlSplitterStorageKey(queryStorageKey), [queryStorageKey]);
  const favoritesStorageKey = useMemo(() => getFavoritesStorageKey(queryStorageKey), [queryStorageKey]);

  const activeSqlTab = useMemo(
    () => sqlWorkspace.tabs.find((tab) => tab.id === sqlWorkspace.activeTabId) ?? sqlWorkspace.tabs[0],
    [sqlWorkspace.activeTabId, sqlWorkspace.tabs],
  );

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

  const exportInProgress = exportState.status === 'preparing' || exportState.status === 'streaming';

  const primaryKeyColumns = useMemo(() => {
    if (!structure) return [];
    return structure.primaryKeys.map((pk) => pk.columnName);
  }, [structure]);

  const foreignKeyMap = useMemo(() => {
    if (!structure) return new Map<string, { table: string; column: string }>();
    const map = new Map<string, { table: string; column: string }>();
    structure.foreignKeys.forEach((fk) => {
      map.set(fk.columnName, { table: fk.foreignTableName, column: fk.foreignColumnName });
    });
    return map;
  }, [structure]);

  /* ── Data loading ── */

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      setTablesError(null);
      const { data } = await api.getTables();
      setTables(data);
      tablesRef.current = data;
    } catch (error) {
      setTables([]);
      setTablesError(getErrorMessage(error, 'Failed to load tables.'));
    } finally {
      setTablesLoading(false);
    }
  }, []);

  const loadSchemaObjects = useCallback(async (dbType: DbType) => {
    const viewsQuery = getSchemaViewsQuery(dbType);
    const functionsQuery = getSchemaFunctionsQuery(dbType);
    const sequencesQuery = getSchemaSequencesQuery(dbType);

    const promises = [
      api.executeQuery(viewsQuery),
      api.executeQuery(functionsQuery),
      ...(sequencesQuery ? [api.executeQuery(sequencesQuery)] : []),
    ];
    const results = await Promise.allSettled(promises);

    if (results[0]?.status === 'fulfilled') setSchemaViews(results[0].value.data.rows as SchemaObject[]);
    if (results[1]?.status === 'fulfilled') setSchemaFunctions(results[1].value.data.rows as SchemaObject[]);
    if (results[2]?.status === 'fulfilled') setSchemaSequences(results[2].value.data.rows as SchemaObject[]);
    else if (!sequencesQuery) setSchemaSequences([]);
  }, []);

  const loadTableBrowseData = useCallback(
    async (tableName: string, sort: SortState, filters: Record<string, string>, pageSize: number, pageOffset: number) => {
      setTableDataLoading(true);
      setTableDataError(null);
      try {
        const [dataResult, countResult] = await Promise.allSettled([
          api.executeQuery(buildSelectQuery(tableName, sort, filters, pageSize, pageOffset)),
          api.executeQuery(buildCountQuery(tableName, filters)),
        ]);
        if (dataResult.status === 'fulfilled') {
          setTableData(dataResult.value.data.rows as Record<string, unknown>[]);
        } else {
          setTableDataError(getErrorMessage(dataResult.reason, 'Failed to load table data.'));
        }
        if (countResult.status === 'fulfilled') {
          const totalRow = countResult.value.data.rows[0] as Record<string, unknown> | undefined;
          setTableTotalRows(totalRow ? Number(totalRow.total) : null);
        }
      } catch (error) {
        setTableDataError(getErrorMessage(error, 'Failed to load table data.'));
      } finally {
        setTableDataLoading(false);
      }
    },
    [],
  );

  /* ── Eager schema preload ── */

  const preloadAllStructures = useCallback(async (tableList: TableInfo[]) => {
    const batch = tableList.slice(0, 50); // preload up to 50 tables
    const results = await Promise.allSettled(
      batch.map((t) => api.getTableStructure(t.tableName)),
    );
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        structureCacheRef.current.set(batch[i].tableName, r.value.data);
      }
    });
  }, []);

  /* ── Init effects ── */

  useEffect(() => {
    const init = async () => {
      // Load connection info first to get DB type
      try {
        const { data } = await api.getDatabaseInfo();
        setDbInfo(data);
        setDbInfoError(null);
        activeDbType = data.type ?? 'postgres';
      } catch (error) {
        setDbInfo(null);
        setDbInfoError(getErrorMessage(error, 'Failed to load connection info.'));
      }

      // Load tables, then preload structures for intellisense
      try {
        setTablesError(null);
        const { data } = await api.getTables();
        setTables(data);
        tablesRef.current = data;
        void preloadAllStructures(data);
      } catch (error) {
        setTables([]);
        setTablesError(getErrorMessage(error, 'Failed to load tables.'));
      } finally {
        setTablesLoading(false);
      }

      void loadSchemaObjects(activeDbType);
    };
    void init();
  }, [loadSchemaObjects, preloadAllStructures]);

  /* ── Workspace hydration ── */

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

    const hydratedActiveTab =
      hydratedWorkspace.tabs.find((tab) => tab.id === hydratedWorkspace.activeTabId) ?? hydratedWorkspace.tabs[0];
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
    if (!pinnedTablesStorageKey) { setPinnedTables([]); return; }
    setPinnedTables(loadPinnedTables(localStorage.getItem(pinnedTablesStorageKey)));
  }, [pinnedTablesStorageKey]);

  useEffect(() => {
    if (!queryHistoryStorageKey) { setQueryHistory([]); return; }
    setQueryHistory(loadQueryHistory(localStorage.getItem(queryHistoryStorageKey)));
  }, [queryHistoryStorageKey]);

  useEffect(() => {
    if (!sqlSplitterStorageKey) { setSqlSplitRatio(loadSqlSplitterRatio(null)); return; }
    setSqlSplitRatio(loadSqlSplitterRatio(localStorage.getItem(sqlSplitterStorageKey)));
  }, [sqlSplitterStorageKey]);

  useEffect(() => {
    if (!favoritesStorageKey) { setFavoriteQueries([]); return; }
    setFavoriteQueries(loadFavorites(localStorage.getItem(favoritesStorageKey)));
  }, [favoritesStorageKey]);

  /* ── Persistence effects ── */

  useEffect(() => {
    if (!canPersistWorkspace || !tabsStorageKey || workspaceHydratedForKey !== tabsStorageKey) return;
    localStorage.setItem(tabsStorageKey, serializeWorkspaceState(sqlWorkspace));
    if (queryStorageKey && activeSqlTab) localStorage.setItem(queryStorageKey, activeSqlTab.query);
  }, [activeSqlTab, canPersistWorkspace, queryStorageKey, sqlWorkspace, tabsStorageKey, workspaceHydratedForKey]);

  useEffect(() => {
    if (!pinnedTablesStorageKey) return;
    localStorage.setItem(pinnedTablesStorageKey, serializePinnedTables(pinnedTables));
  }, [pinnedTables, pinnedTablesStorageKey]);

  useEffect(() => {
    if (!queryHistoryStorageKey) return;
    localStorage.setItem(queryHistoryStorageKey, serializeQueryHistory(queryHistory));
  }, [queryHistory, queryHistoryStorageKey]);

  useEffect(() => {
    if (!sqlSplitterStorageKey) return;
    localStorage.setItem(sqlSplitterStorageKey, serializeSqlSplitterRatio(sqlSplitRatio));
  }, [sqlSplitRatio, sqlSplitterStorageKey]);

  useEffect(() => {
    if (!favoritesStorageKey) return;
    localStorage.setItem(favoritesStorageKey, serializeFavorites(favoriteQueries));
  }, [favoriteQueries, favoritesStorageKey]);

  /* ── Editor sync ── */

  useEffect(() => {
    if (!editorReady) return;
    const editor = editorRef.current;
    if (!editor || !activeSqlTab) return;
    const currentValue = editor.getValue?.();
    if (typeof currentValue === 'string' && currentValue !== activeSqlTab.query) editor.setValue(activeSqlTab.query);
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
      editorRef.current = null;
    },
    [],
  );

  /* ── Command palette effects ── */

  useEffect(() => {
    if (!commandPaletteOpen) return;
    setCommandPaletteFilter('');
    setCommandPaletteIndex(0);
    requestAnimationFrame(() => commandPaletteInputRef.current?.focus());
  }, [commandPaletteOpen]);

  /* ── Split pane resize ── */

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const activeDrag = sqlSplitDragRef.current;
      const shell = sqlSplitShellRef.current;
      if (!activeDrag || !shell) return;
      const rect = shell.getBoundingClientRect();
      if (!rect.height) return;
      const deltaY = event.clientY - activeDrag.startY;
      const ratioDelta = deltaY / rect.height;
      setSqlSplitRatio(clampSqlSplitterRatio(activeDrag.startRatio + ratioDelta));
    };
    const handleMouseUp = () => {
      if (!sqlSplitDragRef.current) return;
      sqlSplitDragRef.current = null;
      document.body.classList.remove('dv-split-resizing');
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('dv-split-resizing');
    };
  }, []);

  /* ── Tab operations ── */

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
      return { tabs: [...current.tabs, newTab], activeTabId: newTab.id };
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

  /* ── Table selection ── */

  const selectTable = useCallback(
    async (tableName: string) => {
      setActiveView('table');
      setSelectedTable(tableName);
      setActiveTab('data');
      setTableData([]);
      setStructure(null);
      setTableDataError(null);
      setStructureError(null);
      setTableSort(null);
      setTableFilters({});
      setTablePageOffset(0);
      setTableTotalRows(null);
      setEditMode(false);
      setEditingCell(null);
      setAddingRow(false);

      setTableDataLoading(true);
      setStructureLoading(true);

      const [dataResult, structureResult] = await Promise.allSettled([
        api.executeQuery(buildSelectQuery(tableName, null, {}, tablePageSize, 0)),
        api.getTableStructure(tableName),
      ]);

      if (dataResult.status === 'fulfilled') {
        setTableData(dataResult.value.data.rows as Record<string, unknown>[]);
      } else {
        setTableDataError(getErrorMessage(dataResult.reason, 'Failed to load table data.'));
      }
      setTableDataLoading(false);

      if (structureResult.status === 'fulfilled') {
        setStructure(structureResult.value.data);
        structureCacheRef.current.set(tableName, structureResult.value.data);
      } else {
        setStructureError(getErrorMessage(structureResult.reason, 'Failed to load table structure.'));
      }
      setStructureLoading(false);

      // Get total count
      try {
        const countRes = await api.executeQuery(buildCountQuery(tableName, {}));
        const total = countRes.data.rows[0] as Record<string, unknown> | undefined;
        setTableTotalRows(total ? Number(total.total) : null);
      } catch { /* ignore */ }
    },
    [tablePageSize],
  );

  /* ── Table sort/filter/page changes ── */

  const handleTableSort = useCallback(
    (column: string) => {
      if (!selectedTable) return;
      setTableSort((current) => {
        let next: SortState;
        if (current?.column === column) {
          next = current.direction === 'asc' ? { column, direction: 'desc' } : null;
        } else {
          next = { column, direction: 'asc' };
        }
        void loadTableBrowseData(selectedTable, next, tableFilters, tablePageSize, 0);
        setTablePageOffset(0);
        return next;
      });
    },
    [selectedTable, tableFilters, tablePageSize, loadTableBrowseData],
  );

  const applyTableFilters = useCallback(() => {
    if (!selectedTable) return;
    setTablePageOffset(0);
    void loadTableBrowseData(selectedTable, tableSort, tableFilters, tablePageSize, 0);
  }, [selectedTable, tableSort, tableFilters, tablePageSize, loadTableBrowseData]);

  const clearTableFilters = useCallback(() => {
    if (!selectedTable) return;
    setTableFilters({});
    setTablePageOffset(0);
    void loadTableBrowseData(selectedTable, tableSort, {}, tablePageSize, 0);
  }, [selectedTable, tableSort, tablePageSize, loadTableBrowseData]);

  const handlePageChange = useCallback(
    (newOffset: number) => {
      if (!selectedTable) return;
      setTablePageOffset(newOffset);
      void loadTableBrowseData(selectedTable, tableSort, tableFilters, tablePageSize, newOffset);
    },
    [selectedTable, tableSort, tableFilters, tablePageSize, loadTableBrowseData],
  );

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      if (!selectedTable) return;
      setTablePageSize(newSize);
      setTablePageOffset(0);
      void loadTableBrowseData(selectedTable, tableSort, tableFilters, newSize, 0);
    },
    [selectedTable, tableSort, tableFilters, loadTableBrowseData],
  );

  /* ── Inline editing ── */

  const commitCellEdit = useCallback(
    async (rowIndex: number, column: string, newValue: string) => {
      if (!selectedTable) return;
      const row = tableData[rowIndex];
      if (!row) return;
      const oldValue = formatCellValue(row[column]);
      if (newValue === oldValue) { setEditingCell(null); return; }

      const sql = buildUpdateQuery(selectedTable, column, newValue, primaryKeyColumns, row);
      try {
        const { data } = await api.executeQuery(sql);
        if (data.error) { setTableDataError(data.error); return; }
        // Refresh data
        void loadTableBrowseData(selectedTable, tableSort, tableFilters, tablePageSize, tablePageOffset);
      } catch (error) {
        setTableDataError(getErrorMessage(error, 'Failed to save edit.'));
      }
      setEditingCell(null);
    },
    [selectedTable, tableData, primaryKeyColumns, tableSort, tableFilters, tablePageSize, tablePageOffset, loadTableBrowseData],
  );

  const deleteRow = useCallback(
    async (rowIndex: number) => {
      if (!selectedTable) return;
      const row = tableData[rowIndex];
      if (!row) return;
      const sql = buildDeleteQuery(selectedTable, primaryKeyColumns, row);
      try {
        const { data } = await api.executeQuery(sql);
        if (data.error) { setTableDataError(data.error); return; }
        void loadTableBrowseData(selectedTable, tableSort, tableFilters, tablePageSize, tablePageOffset);
      } catch (error) {
        setTableDataError(getErrorMessage(error, 'Failed to delete row.'));
      }
    },
    [selectedTable, tableData, primaryKeyColumns, tableSort, tableFilters, tablePageSize, tablePageOffset, loadTableBrowseData],
  );

  const insertRow = useCallback(
    async () => {
      if (!selectedTable) return;
      const sql = buildInsertQuery(selectedTable, newRowValues);
      if (!sql) return;
      try {
        const { data } = await api.executeQuery(sql);
        if (data.error) { setTableDataError(data.error); return; }
        setAddingRow(false);
        setNewRowValues({});
        void loadTableBrowseData(selectedTable, tableSort, tableFilters, tablePageSize, tablePageOffset);
      } catch (error) {
        setTableDataError(getErrorMessage(error, 'Failed to insert row.'));
      }
    },
    [selectedTable, newRowValues, tableSort, tableFilters, tablePageSize, tablePageOffset, loadTableBrowseData],
  );

  /* ── FK navigation ── */

  const navigateToFk = useCallback(
    (fkTable: string, fkColumn: string, value: unknown) => {
      const filterVal = value === null || value === undefined ? '' : String(value);
      setTableFilters({ [fkColumn]: filterVal });
      setFilterBarOpen(true);
      void selectTable(fkTable).then(() => {
        setTableFilters({ [fkColumn]: filterVal });
        void loadTableBrowseData(fkTable, null, { [fkColumn]: filterVal }, tablePageSize, 0);
      });
    },
    [selectTable, tablePageSize, loadTableBrowseData],
  );

  /* ── Focus helpers ── */

  const focusEditor = useCallback(() => { editorRef.current?.focus(); }, []);

  const focusTableFilter = useCallback(() => {
    tableFilterInputRef.current?.focus();
    tableFilterInputRef.current?.select();
  }, []);

  const startSqlSplitResize = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!sqlSplitShellRef.current) return;
      event.preventDefault();
      sqlSplitDragRef.current = { startY: event.clientY, startRatio: sqlSplitRatio };
      document.body.classList.add('dv-split-resizing');
    },
    [sqlSplitRatio],
  );

  const getEditorContents = useCallback(
    () => editorRef.current?.getValue?.() ?? activeSqlTab?.query ?? '',
    [activeSqlTab?.query],
  );

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

  /* ── Pin toggle ── */

  const togglePin = useCallback((tableName: string) => {
    setPinnedTables((current) =>
      current.includes(tableName) ? current.filter((name) => name !== tableName) : [...current, tableName],
    );
  }, []);

  /* ── Export helpers ── */

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
    setExportState((current) => ({ ...current, status: 'cancelled', message: 'Cancelling export...' }));
    try { await api.cancelQuery(activeQueryId); } catch { /* best effort */ }
  }, []);

  const startJsonlExport = useCallback(async () => {
    if (exportInProgress) return;
    const queryToExport = getQueryToExecute();
    if (!queryToExport.trim()) {
      setExportState({ ...DEFAULT_EXPORT_STATE, status: 'failed', filename: exportFilename, message: 'Query is required before exporting.' });
      return;
    }

    const queryIdForExport = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    exportQueryIdRef.current = queryIdForExport;
    exportCancelledByUserRef.current = false;
    const controller = new AbortController();
    exportAbortControllerRef.current = controller;

    setExportState({ status: 'preparing', rowCount: 0, bytesWritten: 0, filename: exportFilename, partialSaved: false, message: 'Preparing export...' });

    let bytesWritten = 0;
    let lineCount = 0;
    let metadataLineSeen = false;
    const textDecoder = new TextDecoder();
    const chunks: Uint8Array[] = [];

    try {
      const response = await api.streamQueryJsonl(
        { query: queryToExport, queryId: queryIdForExport, limit: getExportLimit(), includeMetadataHeader, filename: exportFilename },
        controller.signal,
      );
      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as QueryJsonlExportError | null;
        throw new Error(getJsonlExportErrorMessage(errorData, response.status));
      }
      const filenameFromHeader = parseContentDispositionFilename(response.headers.get('content-disposition'));
      const resolvedFilename = filenameFromHeader ?? exportFilename;
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Streaming response body is not available in this browser.');

      setExportState((current) => ({ ...current, status: 'streaming', filename: resolvedFilename, message: 'Streaming export...' }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        bytesWritten += value.byteLength;
        const chunkText = textDecoder.decode(value, { stream: true });
        lineCount += countNewlines(chunkText);
        if (!metadataLineSeen && includeMetadataHeader && lineCount > 0) metadataLineSeen = true;
        const estimatedRows = includeMetadataHeader && metadataLineSeen ? Math.max(lineCount - 1, 0) : lineCount;
        setExportState((current) => ({
          ...current, status: 'streaming', rowCount: estimatedRows, bytesWritten,
          filename: resolvedFilename, partialSaved: bytesWritten > 0, message: 'Streaming export...',
        }));
      }

      triggerDownload(new Blob(chunks, { type: 'application/x-ndjson;charset=utf-8' }), resolvedFilename);
      setExportState((current) => ({
        ...current, status: 'completed', rowCount: current.rowCount, bytesWritten,
        filename: resolvedFilename, partialSaved: bytesWritten > 0, message: 'Export completed.',
      }));
    } catch (error) {
      if (controller.signal.aborted || exportCancelledByUserRef.current) {
        setExportState((current) => ({
          ...current, status: 'cancelled', partialSaved: bytesWritten > 0 || current.bytesWritten > 0,
          message: bytesWritten > 0 ? 'Export cancelled. A partial file may exist.' : 'Export cancelled.',
        }));
      } else {
        setExportState((current) => ({
          ...current, status: 'failed', partialSaved: bytesWritten > 0 || current.bytesWritten > 0,
          message: getErrorMessage(error, 'Export failed.'),
        }));
      }
    } finally {
      exportAbortControllerRef.current = null;
      exportQueryIdRef.current = null;
      exportCancelledByUserRef.current = false;
    }
  }, [exportCustomLimit, exportFilename, exportInProgress, exportLimitMode, getQueryToExecute, includeMetadataHeader]);

  /* ── Query execution ── */

  const executeQuery = useCallback(
    async (queryOverride?: string) => {
      if (executing) return;
      const queryToExecute = queryOverride ?? getQueryToExecute();
      if (!queryToExecute.trim()) return;

      setActiveView('sql');
      setActiveTab('data');
      setResult(null);
      setResultError(null);
      setExplainResult(null);
      setExplainOpen(false);
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
        if (!data.error) {
          setQueryHistory((current) =>
            addSuccessfulQueryToHistory(current, queryToExecute, data.rowCount ?? 0, data.elapsedMs ?? 0),
          );
        }
      } catch (error) {
        setResult({ rows: [], rowCount: 0, elapsedMs: 0 });
        setResultError(getErrorMessage(error, 'Failed to execute query.'));
      } finally {
        setExecuting(false);
        setQueryId(null);
        focusEditor();
      }
    },
    [activeSqlTab, executing, focusEditor, getEditorContents, getQueryToExecute],
  );

  /* ── EXPLAIN ── */

  const runExplain = useCallback(async () => {
    if (executing) return;
    const queryToExplain = getQueryToExecute();
    if (!queryToExplain.trim()) return;

    setExecuting(true);
    setExplainResult(null);
    setExplainOpen(true);
    const id = `q-${Date.now()}`;
    setQueryId(id);

    try {
      const explainPrefix = activeDbType === 'mysql'
        ? 'EXPLAIN ANALYZE'
        : 'EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT TEXT)';
      const { data } = await api.executeQuery(`${explainPrefix} ${queryToExplain}`, id);
      if (data.error) {
        setExplainResult(data.error);
      } else {
        const planLines = data.rows.map((row: any) => {
          const firstKey = Object.keys(row)[0];
          return firstKey ? String(row[firstKey]) : '';
        });
        setExplainResult(planLines.join('\n'));
      }
    } catch (error) {
      setExplainResult(getErrorMessage(error, 'EXPLAIN failed.'));
    } finally {
      setExecuting(false);
      setQueryId(null);
    }
  }, [executing, getQueryToExecute]);

  /* ── SQL formatting ── */

  const formatActiveSql = useCallback(async () => {
    if (!activeSqlTab) return;
    const sourceQuery = getEditorContents();
    const formatted = await formatSqlWithFallback(sourceQuery, window.pgFormat);
    updateActiveTabQuery(formatted);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, [activeSqlTab, getEditorContents, updateActiveTabQuery]);

  /* ── Load query into editor ── */

  const loadQueryIntoEditor = useCallback(
    (query: string) => {
      setActiveView('sql');
      updateActiveTabQuery(query);
      editorRef.current?.setValue?.(query);
      editorRef.current?.focus?.();
    },
    [updateActiveTabQuery],
  );

  /* ── History ── */

  const rerunFromHistory = useCallback(
    async (item: SqlQueryHistoryItem) => {
      if (!activeSqlTab) return;
      loadQueryIntoEditor(item.query);
      await executeQuery(item.query);
    },
    [activeSqlTab, executeQuery, loadQueryIntoEditor],
  );

  /* ── Favorites ── */

  const saveFavorite = useCallback(() => {
    const query = getQueryToExecute();
    if (!query.trim()) return;
    setFavoriteQueries((current) => addFavorite(current, favoriteNameDraft, query));
    setSaveFavoriteOpen(false);
    setFavoriteNameDraft('');
  }, [favoriteNameDraft, getQueryToExecute]);

  const deleteFavorite = useCallback((id: string) => {
    setFavoriteQueries((current) => removeFavorite(current, id));
  }, []);

  const loadFavoriteIntoEditor = useCallback(
    (fav: FavoriteQuery) => {
      if (!activeSqlTab) return;
      loadQueryIntoEditor(fav.query);
    },
    [activeSqlTab, loadQueryIntoEditor],
  );

  /* ── CSV export ── */

  const exportCurrentCsv = useCallback(() => {
    if (activeView === 'sql' && result?.rows.length) {
      exportCsv(result.rows, getDefaultCsvFilename());
    } else if (activeView === 'table' && tableData.length) {
      exportCsv(tableData, `${selectedTable || 'table'}.csv`);
    }
  }, [activeView, result, tableData, selectedTable]);

  /* ── Cancel query ── */

  const cancelQuery = async () => {
    if (!queryId) return;
    try {
      const { data } = await api.cancelQuery(queryId);
      if (!data.cancelled) { setResultError('Query cancellation was not acknowledged by the server.'); return; }
      setExecuting(false);
      setResultError('Query cancelled by user.');
      setResult({ rows: [], rowCount: 0, elapsedMs: 0, error: 'Query cancelled' });
      setQueryId(null);
    } catch (error) {
      setResultError(getErrorMessage(error, 'Failed to cancel query.'));
    }
  };

  /* ── Command palette ── */

  const runCommandAction = useCallback(
    (actionId: CommandActionId) => {
      if (actionId === 'open-sql-view') { setActiveView('sql'); requestAnimationFrame(() => editorRef.current?.focus()); return; }
      if (actionId === 'focus-table-filter') { focusTableFilter(); return; }
      if (actionId === 'new-tab') { createNewSqlTab(); return; }
      if (actionId === 'run-query') { void executeQuery(); return; }
      if (actionId === 'explain-query') { void runExplain(); return; }
      if (actionId === 'format-sql') { void formatActiveSql(); return; }
      if (actionId === 'export-csv') { exportCurrentCsv(); return; }
      if (actionId === 'toggle-filter-bar') { setFilterBarOpen((c) => !c); return; }
      if (actionId === 'add-favorite') { setSaveFavoriteOpen(true); return; }
    },
    [createNewSqlTab, executeQuery, exportCurrentCsv, focusTableFilter, formatActiveSql, runExplain],
  );

  const commandActions = useMemo(
    () => [
      { id: 'open-sql-view' as const, label: 'Open SQL view', hint: 'Switch to SQL query workspace' },
      { id: 'focus-table-filter' as const, label: 'Focus table filter', hint: 'Jump to sidebar table filter' },
      { id: 'new-tab' as const, label: 'New tab', hint: 'Create a SQL tab' },
      { id: 'run-query' as const, label: 'Run query', hint: 'Execute selected text or active SQL' },
      { id: 'explain-query' as const, label: 'Explain query', hint: 'Show EXPLAIN ANALYZE plan' },
      { id: 'format-sql' as const, label: 'Format SQL', hint: 'Auto-format SQL in editor' },
      { id: 'export-csv' as const, label: 'Export CSV', hint: 'Download current results as CSV' },
      { id: 'toggle-filter-bar' as const, label: 'Toggle filter bar', hint: 'Show/hide column filters in table view' },
      { id: 'add-favorite' as const, label: 'Save as favorite', hint: 'Save current query as a favorite' },
    ],
    [],
  );

  const filteredCommandActions = useMemo(() => {
    const filter = commandPaletteFilter.trim().toLowerCase();
    if (!filter) return commandActions;
    return commandActions.filter((action) => `${action.label} ${action.hint}`.toLowerCase().includes(filter));
  }, [commandActions, commandPaletteFilter]);

  useEffect(() => {
    if (commandPaletteIndex >= filteredCommandActions.length) setCommandPaletteIndex(0);
  }, [commandPaletteIndex, filteredCommandActions.length]);

  /* ── Keyboard shortcuts ── */

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen((current) => !current);
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'e') { event.preventDefault(); focusEditor(); return; }
      if (key === 'l') { event.preventDefault(); focusSelectedSidebarItem(); return; }
      if (key === 'w') { event.preventDefault(); closeSqlTab(); return; }
      if (key === 'enter' && !event.shiftKey) { event.preventDefault(); void executeQuery(); return; }
      if (key === 'enter' && event.shiftKey) { event.preventDefault(); void runExplain(); return; }
      if (key === 'f' && event.shiftKey) { event.preventDefault(); void formatActiveSql(); return; }
      if (key === '1') { event.preventDefault(); setActiveTab('data'); return; }
      if (key === '2') { event.preventDefault(); setActiveTab('structure'); return; }
      if (key === 's') { event.preventDefault(); setSaveFavoriteOpen(true); return; }
      if (key === 'b') { event.preventDefault(); setFilterBarOpen((c) => !c); return; }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [closeSqlTab, createNewSqlTab, executeQuery, focusEditor, focusSelectedSidebarItem, formatActiveSql, runExplain]);

  const selectSqlView = useCallback(() => { setActiveView('sql'); }, []);

  /* ── Sidebar keyboard nav ── */

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
        if (target.type === 'sql') { selectSqlView(); return; }
        if (target.tableName) void selectTable(target.tableName);
      };
      if (event.key === 'ArrowDown') { event.preventDefault(); focusItemByIndex(Math.min(currentIndex + 1, maxIndex)); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); focusItemByIndex(Math.max(currentIndex - 1, 0)); }
      else if (event.key === 'Home') { event.preventDefault(); focusItemByIndex(0); }
      else if (event.key === 'End') { event.preventDefault(); focusItemByIndex(maxIndex); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateIndex(currentIndex); }
    },
    [selectSqlView, selectTable, sidebarNavItems],
  );

  /* ── Schema section toggle ── */

  const toggleSection = useCallback((section: SidebarSchemaSection) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  }, []);

  /* ── Register Monaco autocomplete ── */

  const registerAutocomplete = useCallback((monaco: any) => {
    const SQL_KEYWORDS = [
      'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS',
      'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT INTO', 'VALUES',
      'UPDATE', 'SET', 'DELETE', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'AS',
      'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS NULL',
      'IS NOT NULL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'DISTINCT',
      'WITH', 'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'RETURNING',
      'ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST', 'TRUE', 'FALSE', 'NULL',
    ];

    const SQL_FUNCTIONS = [
      { name: 'COUNT', sig: 'COUNT(expression)' },
      { name: 'SUM', sig: 'SUM(expression)' },
      { name: 'AVG', sig: 'AVG(expression)' },
      { name: 'MIN', sig: 'MIN(expression)' },
      { name: 'MAX', sig: 'MAX(expression)' },
      { name: 'COALESCE', sig: 'COALESCE(val1, val2, ...)' },
      { name: 'NULLIF', sig: 'NULLIF(val1, val2)' },
      { name: 'CAST', sig: 'CAST(expr AS type)' },
      { name: 'LOWER', sig: 'LOWER(string)' },
      { name: 'UPPER', sig: 'UPPER(string)' },
      { name: 'TRIM', sig: 'TRIM(string)' },
      { name: 'LENGTH', sig: 'LENGTH(string)' },
      { name: 'SUBSTRING', sig: 'SUBSTRING(string FROM start FOR length)' },
      { name: 'REPLACE', sig: 'REPLACE(string, from, to)' },
      { name: 'NOW', sig: 'NOW()' },
      { name: 'CURRENT_TIMESTAMP', sig: 'CURRENT_TIMESTAMP' },
      { name: 'EXTRACT', sig: 'EXTRACT(field FROM source)' },
      { name: 'ROUND', sig: 'ROUND(number, decimals)' },
      { name: 'ABS', sig: 'ABS(number)' },
      { name: 'CONCAT', sig: 'CONCAT(str1, str2, ...)' },
    ];

    // Context keywords that signal "suggest tables next"
    const TABLE_CONTEXT = new Set(['from', 'join', 'into', 'update', 'table']);
    // Context keywords that signal "suggest columns next"
    const COLUMN_CONTEXT = new Set(['select', 'where', 'on', 'by', 'set', 'and', 'or', 'having']);

    /** Parse table references and aliases from the full SQL text */
    const parseTableReferences = (text: string): Map<string, string> => {
      const aliases = new Map<string, string>(); // alias → tableName
      const tablePattern = /\b(?:from|join|update|into)\s+([`"[\]]?\w+[`"\]]?)(?:\s+(?:as\s+)?([`"[\]]?\w+[`"\]]?))?/gi;
      let match;
      while ((match = tablePattern.exec(text)) !== null) {
        const rawTable = match[1].replace(/[`"[\]]/g, '');
        const rawAlias = match[2]?.replace(/[`"[\]]/g, '') ?? '';
        if (rawAlias && !TABLE_CONTEXT.has(rawAlias.toLowerCase()) && !COLUMN_CONTEXT.has(rawAlias.toLowerCase())) {
          aliases.set(rawAlias.toLowerCase(), rawTable);
        }
        aliases.set(rawTable.toLowerCase(), rawTable);
      }
      return aliases;
    };

    /** Get the word immediately before the cursor position */
    const getPrecedingContext = (text: string): { word: string; dotPrefix: string | null } => {
      // Check for alias.column pattern (word followed by dot at the end)
      const dotMatch = text.match(/(\w+)\.\s*$/);
      if (dotMatch) {
        return { word: '', dotPrefix: dotMatch[1] };
      }
      // Get the last keyword/word before cursor
      const words = text.replace(/[^\w\s.]/g, ' ').trim().split(/\s+/);
      return { word: words[words.length - 1]?.toLowerCase() ?? '', dotPrefix: null };
    };

    monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ' '],
      provideCompletionItems: (model: any, position: any) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const fullText = model.getValue();
        const suggestions: any[] = [];

        const ctx = getPrecedingContext(textUntilPosition);
        const tableRefs = parseTableReferences(fullText);

        // After "alias." → suggest only that table's columns
        if (ctx.dotPrefix) {
          const aliasLower = ctx.dotPrefix.toLowerCase();
          const resolvedTable = tableRefs.get(aliasLower);
          if (resolvedTable) {
            const struct = structureCacheRef.current.get(resolvedTable);
            if (struct) {
              struct.columns.forEach((col) => {
                const nullable = col.isNullable === 'YES' ? ', nullable' : '';
                const defaultVal = col.columnDefault ? `, default: ${col.columnDefault}` : '';
                suggestions.push({
                  label: col.columnName,
                  kind: monaco.languages.CompletionItemKind.Field,
                  insertText: col.columnName,
                  detail: `${col.dataType}${nullable}`,
                  documentation: `Column on ${resolvedTable} (${col.dataType}${nullable}${defaultVal})`,
                  sortText: `0_${col.columnName}`,
                });
              });
            }
          }
          return { suggestions };
        }

        // After FROM/JOIN/INTO/UPDATE → prioritize tables
        if (TABLE_CONTEXT.has(ctx.word)) {
          tablesRef.current.forEach((table) => {
            const struct = structureCacheRef.current.get(table.tableName);
            const colCount = struct ? `${struct.columns.length} columns` : '';
            suggestions.push({
              label: table.tableName,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: table.tableName,
              detail: `table${colCount ? ` · ${colCount}` : ''}`,
              sortText: `0_${table.tableName}`,
            });
          });
          return { suggestions };
        }

        // After SELECT/WHERE/ON/ORDER BY/GROUP BY → prioritize columns from referenced tables
        if (COLUMN_CONTEXT.has(ctx.word)) {
          // Columns from referenced tables first
          tableRefs.forEach((tableName) => {
            const struct = structureCacheRef.current.get(tableName);
            if (!struct) return;
            struct.columns.forEach((col) => {
              suggestions.push({
                label: col.columnName,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.columnName,
                detail: `${tableName} · ${col.dataType}`,
                sortText: `0_${col.columnName}`,
              });
            });
          });

          // Also add functions for SELECT/WHERE context
          SQL_FUNCTIONS.forEach((fn) => {
            suggestions.push({
              label: fn.name,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: fn.name + '($0)',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: fn.sig,
              sortText: `1_${fn.name}`,
            });
          });

          return { suggestions };
        }

        // Default: show everything
        SQL_KEYWORDS.forEach((kw) => {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            detail: 'keyword',
            sortText: `2_${kw}`,
          });
        });

        SQL_FUNCTIONS.forEach((fn) => {
          suggestions.push({
            label: fn.name,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: fn.name + '($0)',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: fn.sig,
            sortText: `1_${fn.name}`,
          });
        });

        tablesRef.current.forEach((table) => {
          suggestions.push({
            label: table.tableName,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: table.tableName,
            detail: 'table',
            sortText: `1_${table.tableName}`,
          });
        });

        // All cached columns (lower priority in default context)
        structureCacheRef.current.forEach((struct, tableName) => {
          struct.columns.forEach((col) => {
            suggestions.push({
              label: col.columnName,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: col.columnName,
              detail: `${tableName} · ${col.dataType}`,
              sortText: `3_${col.columnName}`,
            });
          });
        });

        return { suggestions };
      },
    });
  }, []);

  /* ── Render ── */

  return (
    <div className="dv-shell" data-density="compact">
      {/* ── Sidebar ── */}
      <aside className="dv-sidebar">
        <div className="dv-sidebar-head">
          <h1 className="text-base font-semibold tracking-tight">DataVore</h1>
          {dbInfo ? (
            <div className="dv-conn-detail">
              <div className="dv-conn-detail-row">
                <span className="dv-conn-label">DB:</span>
                <span className="dv-conn-value">{dbInfo.databaseName ?? 'unknown'}</span>
              </div>
              <div className="dv-conn-detail-row">
                <span className="dv-conn-label">Host:</span>
                <span className="dv-conn-value">{dbInfo.host ?? 'localhost'}:{dbInfo.port ?? ''}</span>
              </div>
              <div className="dv-conn-detail-row">
                <span className="dv-conn-label">User:</span>
                <span className="dv-conn-value">{dbInfo.username ?? ''}</span>
              </div>
              <span className={`dv-badge ${dbInfo.isConnected ? 'dv-badge-success' : 'dv-badge-warn'}`}>
                {dbInfo.isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          ) : (
            <p className="text-xs text-subtle mt-1">{dbInfoError ?? 'Connecting...'}</p>
          )}
        </div>

        {/* SQL Query nav item */}
        <div className="mb-3">
          <button
            className={`dv-input dv-nav-query text-left ${activeView === 'sql' ? 'ring-1 ring-accent' : ''}`}
            onClick={selectSqlView}
            data-sidebar-idx={0}
          >
            SQL Query
          </button>
        </div>

        {/* Schema sections */}
        <div className="space-y-1">
          {/* Tables section */}
          <button className={`dv-schema-toggle ${expandedSections.tables ? 'is-active' : ''}`} onClick={() => toggleSection('tables')}>
            <span>
              <span className={`dv-schema-chevron ${expandedSections.tables ? 'is-open' : ''}`}>&#9656;</span>
              {' '}Tables
            </span>
            <span className="dv-schema-toggle-count">{tables.length}</span>
          </button>
          {expandedSections.tables && (
            <div className="dv-schema-items">
              <div className="dv-sidebar-filter-row">
                <label className="dv-sidebar-search-label" htmlFor="table-search">Filter</label>
                <p className="dv-section-meta">
                  {filteredTables.length} match{filteredTables.length === 1 ? '' : 'es'}
                </p>
              </div>
              <div className="dv-sidebar-filter-input-row">
                <input
                  id="table-search"
                  ref={tableFilterInputRef}
                  className="dv-input"
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  placeholder="Search tables..."
                />
                {tableFilter.trim() && (
                  <button className="dv-btn-ghost dv-btn-sm" onClick={() => setTableFilter('')}>Clear</button>
                )}
              </div>

              {tablesLoading && <p className="dv-empty">Loading tables...</p>}
              {tablesError && (
                <div className="dv-state dv-state-error">
                  <p>{tablesError}</p>
                  <button className="dv-btn-ghost mt-2" onClick={() => void loadTables()}>Retry</button>
                </div>
              )}
              {!tablesLoading && !tablesError && filteredTables.length === 0 && (
                <p className="dv-empty">No matching tables.</p>
              )}

              <div ref={tableListRef} role="listbox" aria-label="Tables">
                {!tablesLoading && !tablesError && pinnedVisibleTables.length > 0 && (
                  <div className="dv-sidebar-subsection">
                    <p className="dv-section-meta">Pinned</p>
                    {pinnedVisibleTables.map((table) => {
                      const itemIndex = sidebarNavItems.findIndex((item) => item.id === `table:${table.tableName}`);
                      return (
                        <div className="dv-nav-row" key={`pinned-${table.tableName}`}>
                          <button
                            className={`dv-schema-item ${activeView === 'table' && selectedTable === table.tableName ? 'is-active' : ''}`}
                            onClick={() => void selectTable(table.tableName)}
                            onKeyDown={(e) => handleSidebarNav(e, itemIndex)}
                            data-sidebar-idx={itemIndex}
                            role="option"
                            aria-selected={activeView === 'table' && selectedTable === table.tableName}
                          >
                            <span className="dv-schema-icon">T</span>
                            {table.tableName}
                          </button>
                          <button className="dv-pin-btn" onClick={() => togglePin(table.tableName)} title="Unpin">&#9733;</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {!tablesLoading && !tablesError && unpinnedVisibleTables.map((table) => {
                  const itemIndex = sidebarNavItems.findIndex((item) => item.id === `table:${table.tableName}`);
                  return (
                    <div className="dv-nav-row" key={table.tableName}>
                      <button
                        className={`dv-schema-item ${activeView === 'table' && selectedTable === table.tableName ? 'is-active' : ''}`}
                        onClick={() => void selectTable(table.tableName)}
                        onKeyDown={(e) => handleSidebarNav(e, itemIndex)}
                        data-sidebar-idx={itemIndex}
                        role="option"
                        aria-selected={activeView === 'table' && selectedTable === table.tableName}
                      >
                        <span className="dv-schema-icon">T</span>
                        {table.tableName}
                      </button>
                      <button
                        className="dv-pin-btn"
                        onClick={() => togglePin(table.tableName)}
                        title={pinnedTableSet.has(table.tableName) ? 'Unpin' : 'Pin'}
                      >
                        {pinnedTableSet.has(table.tableName) ? '★' : '☆'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Views section */}
          <button className={`dv-schema-toggle ${expandedSections.views ? 'is-active' : ''}`} onClick={() => toggleSection('views')}>
            <span>
              <span className={`dv-schema-chevron ${expandedSections.views ? 'is-open' : ''}`}>&#9656;</span>
              {' '}Views
            </span>
            <span className="dv-schema-toggle-count">{schemaViews.length}</span>
          </button>
          {expandedSections.views && (
            <div className="dv-schema-items">
              {schemaViews.length === 0 ? (
                <p className="dv-empty">No views found.</p>
              ) : (
                schemaViews.map((view) => (
                  <button
                    key={`${view.schema}.${view.name}`}
                    className={`dv-schema-item ${activeView === 'table' && selectedTable === view.name ? 'is-active' : ''}`}
                    onClick={() => void selectTable(view.name)}
                  >
                    <span className="dv-schema-icon">V</span>
                    {view.schema !== 'public' ? `${view.schema}.${view.name}` : view.name}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Functions section */}
          <button className={`dv-schema-toggle ${expandedSections.functions ? 'is-active' : ''}`} onClick={() => toggleSection('functions')}>
            <span>
              <span className={`dv-schema-chevron ${expandedSections.functions ? 'is-open' : ''}`}>&#9656;</span>
              {' '}Functions
            </span>
            <span className="dv-schema-toggle-count">{schemaFunctions.length}</span>
          </button>
          {expandedSections.functions && (
            <div className="dv-schema-items">
              {schemaFunctions.length === 0 ? (
                <p className="dv-empty">No functions found.</p>
              ) : (
                schemaFunctions.map((fn, i) => (
                  <button
                    key={`${fn.schema}.${fn.name}-${i}`}
                    className="dv-schema-item"
                    onClick={() => {
                      const prefix = fn.schema !== 'public' ? `${quoteIdentifier(fn.schema)}.` : '';
                      loadQueryIntoEditor(`SELECT * FROM ${prefix}${quoteIdentifier(fn.name)}()`);
                    }}
                  >
                    <span className="dv-schema-icon">f</span>
                    {fn.schema !== 'public' ? `${fn.schema}.${fn.name}` : fn.name}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Sequences section */}
          <button className={`dv-schema-toggle ${expandedSections.sequences ? 'is-active' : ''}`} onClick={() => toggleSection('sequences')}>
            <span>
              <span className={`dv-schema-chevron ${expandedSections.sequences ? 'is-open' : ''}`}>&#9656;</span>
              {' '}Sequences
            </span>
            <span className="dv-schema-toggle-count">{schemaSequences.length}</span>
          </button>
          {expandedSections.sequences && (
            <div className="dv-schema-items">
              {schemaSequences.length === 0 ? (
                <p className="dv-empty">No sequences found.</p>
              ) : (
                schemaSequences.map((seq) => (
                  <button
                    key={`${seq.schema}.${seq.name}`}
                    className="dv-schema-item"
                    onClick={() => {
                      const prefix = seq.schema !== 'public' ? `${quoteIdentifier(seq.schema)}.` : '';
                      loadQueryIntoEditor(`SELECT * FROM ${prefix}${quoteIdentifier(seq.name)}`);
                    }}
                  >
                    <span className="dv-schema-icon">S</span>
                    {seq.schema !== 'public' ? `${seq.schema}.${seq.name}` : seq.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="dv-main">
        {/* ── Export JSONL modal ── */}
        {exportModalOpen && (
          <section className="dv-modal-backdrop" role="dialog" aria-modal="true" aria-label="Export JSONL">
            <div className="dv-modal">
              <div className="dv-section-head">
                <h2 className="dv-section-title">Export JSONL</h2>
                <p className="dv-section-meta">Uses selected SQL text when a selection exists.</p>
              </div>
              <label className="dv-modal-field">
                Filename
                <input className="dv-input" value={exportFilename} onChange={(e) => setExportFilename(e.target.value)} />
              </label>
              <label className="dv-modal-field">
                Row limit
                <select className="dv-select" value={exportLimitMode} onChange={(e) => setExportLimitMode(e.target.value as ExportLimitMode)}>
                  <option value="none">No limit (server cap applies)</option>
                  <option value="10k">10k</option>
                  <option value="100k">100k</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              {exportLimitMode === 'custom' && (
                <label className="dv-modal-field">
                  Custom limit
                  <input className="dv-input" type="number" min={1} step={1} value={exportCustomLimit} onChange={(e) => setExportCustomLimit(e.target.value)} />
                </label>
              )}
              <label className="dv-modal-check">
                <input type="checkbox" checked={includeMetadataHeader} onChange={(e) => setIncludeMetadataHeader(e.target.checked)} />
                Include metadata header line
              </label>
              <div className="dv-modal-actions">
                <button className="dv-btn" onClick={() => void startJsonlExport()} disabled={exportInProgress}>
                  {exportInProgress ? 'Exporting...' : 'Start export'}
                </button>
                {exportInProgress && (
                  <button className="dv-btn-danger" onClick={() => void cancelExport()}>Cancel export</button>
                )}
                <button className="dv-btn-ghost" onClick={() => setExportModalOpen(false)} disabled={exportInProgress}>Close</button>
              </div>
            </div>
          </section>
        )}

        {/* ── Save favorite modal ── */}
        {saveFavoriteOpen && (
          <section className="dv-modal-backdrop" role="dialog" aria-modal="true" aria-label="Save favorite">
            <div className="dv-modal">
              <div className="dv-section-head">
                <h2 className="dv-section-title">Save Query as Favorite</h2>
              </div>
              <label className="dv-modal-field">
                Name
                <input
                  className="dv-input"
                  value={favoriteNameDraft}
                  onChange={(e) => setFavoriteNameDraft(e.target.value)}
                  placeholder="My favorite query"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveFavorite(); } if (e.key === 'Escape') setSaveFavoriteOpen(false); }}
                />
              </label>
              <p className="text-xs text-subtle font-mono break-words">{getQueryToExecute().slice(0, 200)}{getQueryToExecute().length > 200 ? '...' : ''}</p>
              <div className="dv-modal-actions">
                <button className="dv-btn" onClick={saveFavorite}>Save</button>
                <button className="dv-btn-ghost" onClick={() => setSaveFavoriteOpen(false)}>Cancel</button>
              </div>
            </div>
          </section>
        )}

        {/* ── Command palette ── */}
        {commandPaletteOpen && (
          <section className="dv-modal-backdrop" role="dialog" aria-modal="true" aria-label="Command palette">
            <div className="dv-modal dv-command-palette">
              <div className="dv-section-head">
                <h2 className="dv-section-title">Command Palette</h2>
                <p className="dv-section-meta">Cmd/Ctrl+K</p>
              </div>
              <input
                ref={commandPaletteInputRef}
                className="dv-input"
                value={commandPaletteFilter}
                onChange={(e) => { setCommandPaletteFilter(e.target.value); setCommandPaletteIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); setCommandPaletteOpen(false); return; }
                  if (e.key === 'ArrowDown') { e.preventDefault(); setCommandPaletteIndex((c) => filteredCommandActions.length ? Math.min(c + 1, filteredCommandActions.length - 1) : 0); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setCommandPaletteIndex((c) => Math.max(0, c - 1)); return; }
                  if (e.key === 'Enter') {
                    const selected = filteredCommandActions[commandPaletteIndex];
                    if (!selected) return;
                    e.preventDefault();
                    runCommandAction(selected.id);
                    setCommandPaletteOpen(false);
                  }
                }}
                placeholder="Type a command..."
              />
              <div className="dv-command-list" role="listbox" aria-label="Commands">
                {filteredCommandActions.length ? (
                  filteredCommandActions.map((action, index) => (
                    <button
                      key={action.id}
                      className={`dv-command-item ${index === commandPaletteIndex ? 'is-active' : ''}`}
                      onClick={() => { runCommandAction(action.id); setCommandPaletteOpen(false); }}
                    >
                      <span>{action.label}</span>
                      <span className="dv-command-hint">{action.hint}</span>
                    </button>
                  ))
                ) : (
                  <p className="dv-empty">No matching commands.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── SQL View ── */}
        {activeView === 'sql' ? (
          <div
            className="dv-sql-split"
            ref={sqlSplitShellRef}
            style={{
              gridTemplateRows: `minmax(260px, ${sqlSplitRatio * 100}%) 10px minmax(180px, ${(1 - sqlSplitRatio) * 100}%)`,
            }}
          >
            <section className="dv-card dv-card-pad dv-query-section">
              <div className="dv-query-toolbar">
                <div className="dv-section-head">
                  <h2 className="dv-section-title">SQL Query Workspace</h2>
                  <p className="dv-section-meta">
                    Cmd+Enter run &middot; Shift+Cmd+Enter explain &middot; Cmd+S save favorite
                  </p>
                </div>
                <div className="dv-toolbar-actions">
                  <button className="dv-btn-ghost" onClick={() => void formatActiveSql()}>Format</button>
                  <button className="dv-btn-ghost" onClick={() => setQueryHistoryOpen((c) => !c)}>
                    {queryHistoryOpen ? 'Hide History' : 'History'}
                  </button>
                  <button className="dv-btn-ghost" onClick={() => setFavoritesOpen((c) => !c)}>
                    {favoritesOpen ? 'Hide Favorites' : 'Favorites'}
                  </button>
                  <button className="dv-btn-ghost" onClick={() => { updateActiveTabQuery(''); focusEditor(); }}>Clear</button>
                  <span className="dv-toolbar-sep" />
                  <button className="dv-btn-ghost" onClick={exportCurrentCsv} disabled={!result?.rows.length}>CSV</button>
                  <button
                    className="dv-btn-ghost"
                    onClick={() => { setExportFilename(getDefaultExportFilename()); setExportModalOpen(true); }}
                    disabled={!hasExecutableQuery || exportInProgress}
                  >
                    JSONL
                  </button>
                  <span className="dv-toolbar-sep" />
                  <button className="dv-btn-ghost" onClick={() => void runExplain()} disabled={executing || !hasExecutableQuery}>
                    Explain
                  </button>
                  {!executing ? (
                    <button className="dv-btn" onClick={() => void executeQuery()}>Run</button>
                  ) : (
                    <button className="dv-btn-danger" onClick={() => void cancelQuery()}>Cancel</button>
                  )}
                </div>
              </div>

              {/* SQL tabs */}
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
                        onClick={() => { setActiveView('sql'); setSqlWorkspace((c) => ({ ...c, activeTabId: tab.id })); }}
                        onDoubleClick={() => startRenameTab(tab.id, tab.name)}
                      >
                        {isRenaming ? (
                          <input
                            className="dv-sql-tab-input"
                            value={tabNameDraft}
                            onChange={(e) => setTabNameDraft(e.target.value)}
                            onBlur={commitRenameTab}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); commitRenameTab(); }
                              if (e.key === 'Escape') { e.preventDefault(); setRenamingTabId(null); setTabNameDraft(''); }
                            }}
                            autoFocus
                          />
                        ) : (
                          <span className="truncate">{tab.name}</span>
                        )}
                      </button>
                      <button className="dv-sql-tab-close" onClick={(e) => { e.stopPropagation(); closeSqlTab(tab.id); }} title="Close tab">
                        &times;
                      </button>
                    </div>
                  );
                })}
                <button className="dv-sql-tab-add" onClick={createNewSqlTab} title="New SQL tab">+</button>
              </div>

              {/* Monaco editor */}
              <div className="dv-editor-shell">
                <Editor
                  height="180px"
                  defaultLanguage="sql"
                  value={activeSqlTab?.query ?? ''}
                  onChange={(v) => updateActiveTabQuery(v ?? '')}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    scrollBeyondLastLine: false,
                    suggestOnTriggerCharacters: true,
                    quickSuggestions: true,
                  }}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    monacoRef.current = monaco;
                    setEditorReady(true);
                    if (editor.getValue() !== (activeSqlTab?.query ?? '')) editor.setValue(activeSqlTab?.query ?? '');
                    editor.focus();
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { void executeQuery(); });
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => { closeSqlTab(); });
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => { void runExplain(); });
                    registerAutocomplete(monaco);
                  }}
                />
              </div>

              {/* Favorites panel */}
              {favoritesOpen && (
                <section className="dv-favorites">
                  <div className="dv-section-head">
                    <h3 className="dv-section-title">Favorites</h3>
                    <p className="dv-section-meta">{favoriteQueries.length} saved</p>
                  </div>
                  {favoriteQueries.length ? (
                    <div className="dv-favorites-list">
                      {favoriteQueries.map((fav) => (
                        <div className="dv-favorite-item" key={fav.id}>
                          <div className="dv-favorite-main">
                            <div className="dv-favorite-name">{fav.name}</div>
                            <button className="dv-favorite-query" onClick={() => loadFavoriteIntoEditor(fav)}>
                              {fav.query.slice(0, 120)}{fav.query.length > 120 ? '...' : ''}
                            </button>
                          </div>
                          <button className="dv-btn-ghost dv-btn-sm" onClick={() => deleteFavorite(fav.id)} title="Remove">
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="dv-empty">No favorites saved. Press Cmd+S to save a query.</p>
                  )}
                </section>
              )}

              {/* History panel */}
              {queryHistoryOpen && (
                <section className="dv-query-history">
                  <div className="dv-section-head">
                    <h3 className="dv-section-title">Recent queries</h3>
                    <p className="dv-section-meta">{queryHistory.length} saved</p>
                  </div>
                  {queryHistory.length ? (
                    <div className="dv-query-history-list">
                      {queryHistory.map((item) => (
                        <div className="dv-query-history-item" key={item.id}>
                          <button className="dv-query-history-query" onClick={() => void rerunFromHistory(item)}>
                            {item.query}
                          </button>
                          <p className="dv-section-meta">
                            {item.rowCount.toLocaleString()} rows &middot; {item.elapsedMs}ms &middot;{' '}
                            {new Date(item.executedAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="dv-empty">No queries yet.</p>
                  )}
                </section>
              )}

              {executing && <p className="dv-state-text">Executing query...</p>}
              {resultError && <p className="dv-state-text text-danger">{resultError}</p>}
              {exportState.status !== 'idle' && (
                <p className={`dv-state-text ${exportState.status === 'failed' ? 'text-danger' : ''}`}>
                  Export {exportState.status} &middot; {exportState.rowCount.toLocaleString()} rows &middot;{' '}
                  {exportState.bytesWritten.toLocaleString()} bytes
                  {exportState.partialSaved ? ' · partial data' : ''}
                  {exportState.message ? ` · ${exportState.message}` : ''}
                </p>
              )}
              {result && (
                <p className="text-xs text-subtle">
                  {result.rowCount.toLocaleString()} rows &middot; {result.elapsedMs}ms
                </p>
              )}
            </section>

            <div className="dv-sql-splitter" role="separator" aria-orientation="horizontal" onMouseDown={startSqlSplitResize} />

            <section className="dv-card dv-card-pad">
              {/* EXPLAIN result */}
              {explainOpen && explainResult && (
                <div className="dv-explain-panel">
                  <div className="dv-query-toolbar">
                    <h3 className="dv-section-title">Query Plan (EXPLAIN ANALYZE)</h3>
                    <button className="dv-btn-ghost dv-btn-sm" onClick={() => setExplainOpen(false)}>Close</button>
                  </div>
                  <pre className="dv-explain-pre">{explainResult}</pre>
                </div>
              )}
              {/* Query results */}
              <QueryResultDisplay
                executing={executing}
                resultError={resultError}
                result={result}
                emptyMessage="Run a query to view results."
              />
            </section>
          </div>
        ) : (
          /* ── Table View ── */
          <>
            <div className="dv-query-toolbar">
              <div className="dv-section-head">
                <h2 className="dv-section-title">{selectedTable ? `Table: ${selectedTable}` : 'Table View'}</h2>
                <p className="dv-section-meta">
                  {tableTotalRows !== null ? `${tableTotalRows.toLocaleString()} total rows` : 'Browse data and structure.'}
                </p>
              </div>
              <div className="dv-toolbar-actions">
                <button className="dv-btn-ghost" onClick={selectSqlView}>SQL Query</button>
                <span className="dv-toolbar-sep" />
                <button className="dv-btn-ghost" onClick={() => setFilterBarOpen((c) => !c)}>
                  {filterBarOpen ? 'Hide Filters' : 'Filters'}
                </button>
                <button className="dv-btn-ghost" onClick={exportCurrentCsv} disabled={!tableData.length}>CSV</button>
                <span className="dv-toolbar-sep" />
                <button
                  className={`dv-btn-ghost ${editMode ? 'ring-1 ring-accent' : ''}`}
                  onClick={() => { setEditMode((c) => !c); setEditingCell(null); setAddingRow(false); }}
                >
                  {editMode ? 'Done Editing' : 'Edit'}
                </button>
                {editMode && (
                  <button className="dv-btn-ghost" onClick={() => { setAddingRow(true); setNewRowValues({}); }}>
                    + Add Row
                  </button>
                )}
              </div>
            </div>

            {(executing || resultError || result) && (
              <section className="dv-card dv-card-pad">
                <div className="dv-query-toolbar">
                  <div className="dv-section-head">
                    <h3 className="dv-section-title">Latest SQL Result</h3>
                    <p className="dv-section-meta">From SQL Query workspace</p>
                  </div>
                  <button className="dv-btn-ghost" onClick={selectSqlView}>Open SQL Query</button>
                </div>
                <QueryResultDisplay
                  executing={executing}
                  resultError={resultError}
                  result={result}
                  />
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
                  <div>
                    <p className="text-danger text-sm">{tableDataError}</p>
                    <button className="dv-btn-ghost mt-2" onClick={() => void loadTableBrowseData(selectedTable, tableSort, tableFilters, tablePageSize, tablePageOffset)}>
                      Retry
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Filter bar */}
                    {filterBarOpen && tableData.length > 0 && (
                      <div className="dv-filter-bar">
                        <span className="text-subtle">Filter:</span>
                        {Object.keys(tableData[0] ?? {}).slice(0, 8).map((col) => (
                          <input
                            key={col}
                            className="dv-filter-input"
                            placeholder={col}
                            value={tableFilters[col] ?? ''}
                            onChange={(e) => setTableFilters((c) => ({ ...c, [col]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') applyTableFilters(); }}
                          />
                        ))}
                        <button className="dv-btn-ghost dv-btn-sm" onClick={applyTableFilters}>Apply</button>
                        <button className="dv-btn-ghost dv-btn-sm" onClick={clearTableFilters}>Clear</button>
                      </div>
                    )}

                    {/* Add row form */}
                    {addingRow && editMode && tableData.length > 0 && (
                      <div className="dv-edit-toolbar">
                        <span className="text-xs text-subtle">New row:</span>
                        {Object.keys(tableData[0] ?? {}).map((col) => (
                          <input
                            key={col}
                            className="dv-filter-input"
                            placeholder={col}
                            value={newRowValues[col] ?? ''}
                            onChange={(e) => setNewRowValues((c) => ({ ...c, [col]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') void insertRow(); }}
                          />
                        ))}
                        <button className="dv-btn dv-btn-sm" onClick={() => void insertRow()}>Insert</button>
                        <button className="dv-btn-ghost dv-btn-sm" onClick={() => { setAddingRow(false); setNewRowValues({}); }}>Cancel</button>
                      </div>
                    )}

                    <DataTable
                      rows={tableData}
                            sortable
                      serverSort={tableSort}
                      onServerSort={handleTableSort}
                      editable={editMode}
                      editingCell={editingCell}
                      editDraft={editDraft}
                      onStartEdit={(rowIndex, column) => {
                        setEditingCell({ rowIndex, column });
                        setEditDraft(formatCellValue(tableData[rowIndex]?.[column]));
                      }}
                      onEditDraftChange={setEditDraft}
                      onCommitEdit={commitCellEdit}
                      onCancelEdit={() => setEditingCell(null)}
                      onDeleteRow={deleteRow}
                      fkMap={foreignKeyMap}
                      onFkNavigate={navigateToFk}
                    />

                    {/* Pagination */}
                    {tableTotalRows !== null && (
                      <div className="dv-pagination">
                        <div className="dv-pagination-controls">
                          <button
                            className="dv-page-btn"
                            disabled={tablePageOffset === 0}
                            onClick={() => handlePageChange(0)}
                          >
                            First
                          </button>
                          <button
                            className="dv-page-btn"
                            disabled={tablePageOffset === 0}
                            onClick={() => handlePageChange(Math.max(0, tablePageOffset - tablePageSize))}
                          >
                            Prev
                          </button>
                          <span className="dv-page-info">
                            {tablePageOffset + 1}&ndash;{Math.min(tablePageOffset + tablePageSize, tableTotalRows)} of {tableTotalRows.toLocaleString()}
                          </span>
                          <button
                            className="dv-page-btn"
                            disabled={tablePageOffset + tablePageSize >= tableTotalRows}
                            onClick={() => handlePageChange(tablePageOffset + tablePageSize)}
                          >
                            Next
                          </button>
                          <button
                            className="dv-page-btn"
                            disabled={tablePageOffset + tablePageSize >= tableTotalRows}
                            onClick={() => {
                              const lastPage = Math.max(0, Math.floor((tableTotalRows - 1) / tablePageSize) * tablePageSize);
                              handlePageChange(lastPage);
                            }}
                          >
                            Last
                          </button>
                        </div>
                        <div className="dv-pagination-controls">
                          <span className="text-xs text-subtle">Rows per page:</span>
                          <select
                            className="dv-page-size-select"
                            value={tablePageSize}
                            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                          >
                            {PAGE_SIZES.map((size) => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </>
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
                  <StructurePanel structure={structure} />
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

/* ── QueryResultDisplay ──────────────────────────────────── */

function QueryResultDisplay({
  executing,
  resultError,
  result,
  emptyMessage,
}: {
  executing: boolean;
  resultError: string | null;
  result: ResultState | null;
  emptyMessage?: string;
}) {
  if (executing) return <p className="dv-empty">Executing query...</p>;
  if (resultError) return <p className="text-danger text-sm">{resultError}</p>;
  if (result?.error) return <p className="text-danger text-sm">{result.error}</p>;
  if (result) return <DataTable rows={result.rows} rowCount={result.rowCount} sortable />;
  if (emptyMessage) return <p className="dv-empty">{emptyMessage}</p>;
  return null;
}

/* ── DataTable ───────────────────────────────────────────── */

function DataTable({
  rows,
  rowCount,
  sortable,
  serverSort,
  onServerSort,
  editable,
  editingCell,
  editDraft,
  onStartEdit,
  onEditDraftChange,
  onCommitEdit,
  onCancelEdit,
  onDeleteRow,
  fkMap,
  onFkNavigate,
}: {
  rows: Record<string, unknown>[];
  rowCount?: number;
  sortable?: boolean;
  serverSort?: SortState;
  onServerSort?: (column: string) => void;
  editable?: boolean;
  editingCell?: { rowIndex: number; column: string } | null;
  editDraft?: string;
  onStartEdit?: (rowIndex: number, column: string) => void;
  onEditDraftChange?: (value: string) => void;
  onCommitEdit?: (rowIndex: number, column: string, value: string) => Promise<void>;
  onCancelEdit?: () => void;
  onDeleteRow?: (rowIndex: number) => Promise<void>;
  fkMap?: Map<string, { table: string; column: string }>;
  onFkNavigate?: (table: string, column: string, value: unknown) => void;
}) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [clientSort, setClientSort] = useState<SortState>(null);
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
  const selectedRow = selectedRowIndex === null ? null : rows[selectedRowIndex] ?? null;

  // Client-side sorting
  const activeSort = onServerSort ? serverSort : clientSort;
  const displayRows = useMemo(() => {
    if (onServerSort || !clientSort) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const aVal = a[clientSort.column];
      const bVal = b[clientSort.column];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const aStr = typeof aVal === 'object' ? JSON.stringify(aVal) : String(aVal);
      const bStr = typeof bVal === 'object' ? JSON.stringify(bVal) : String(bVal);
      const aNum = Number(aStr);
      const bNum = Number(bStr);
      if (!isNaN(aNum) && !isNaN(bNum)) return clientSort.direction === 'asc' ? aNum - bNum : bNum - aNum;
      return clientSort.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return sorted;
  }, [rows, clientSort, onServerSort]);

  const handleSort = (column: string) => {
    if (!sortable) return;
    if (onServerSort) {
      onServerSort(column);
    } else {
      setClientSort((current) => {
        if (current?.column === column) {
          return current.direction === 'asc' ? { column, direction: 'desc' } : null;
        }
        return { column, direction: 'asc' };
      });
    }
  };

  const getSortIndicator = (column: string) => {
    if (activeSort?.column !== column) return null;
    return <span className="dv-sort-indicator">{activeSort.direction === 'asc' ? '▲' : '▼'}</span>;
  };

  return (
    <div className="dv-table-shell" data-density="compact">
      <div className="dv-table-status">
        <span>{totalRows.toLocaleString()} rows &middot; {columns.length} columns</span>
        {editable && selectedRowIndex !== null && onDeleteRow && (
          <button className="dv-btn-danger dv-btn-sm" onClick={() => void onDeleteRow(selectedRowIndex)}>
            Delete Row
          </button>
        )}
      </div>
      <div className="dv-table-content">
        <div className="dv-table-scroll">
          <table className="dv-table">
            <thead>
              <tr>
                <th className="dv-table-index">#</th>
                {columns.map((column) => (
                  <th
                    key={column}
                    className={`text-left ${sortable ? 'dv-th-sortable' : ''}`}
                    style={columnWidths[column] ? { width: `${columnWidths[column]}px` } : undefined}
                    onClick={() => handleSort(column)}
                  >
                    <div className="dv-th-content">
                      <span>{column}{getSortIndicator(column)}</span>
                      <span
                        className="dv-col-resizer"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const currentWidth = (event.currentTarget.parentElement?.parentElement as HTMLElement | null)?.offsetWidth ?? 140;
                          resizingRef.current = { key: column, startX: event.clientX, startWidth: currentWidth };
                          document.body.classList.add('dv-col-resizing');
                        }}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => {
                const isSelected = selectedRowIndex === idx;
                return (
                  <tr
                    key={idx}
                    className={isSelected ? 'dv-table-row-selected' : ''}
                    onClick={() => setSelectedRowIndex(idx)}
                  >
                    <td className="dv-table-index">{idx + 1}</td>
                    {columns.map((column) => {
                      const isEditing = editable && editingCell?.rowIndex === idx && editingCell?.column === column;
                      const fk = fkMap?.get(column);
                      const cellValue = row[column];

                      if (isEditing) {
                        return (
                          <td key={column} className="dv-cell-edited" style={columnWidths[column] ? { width: `${columnWidths[column]}px` } : undefined}>
                            <input
                              className="dv-cell-edit-input"
                              value={editDraft ?? ''}
                              onChange={(e) => onEditDraftChange?.(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); void onCommitEdit?.(idx, column, editDraft ?? ''); }
                                if (e.key === 'Escape') { e.preventDefault(); onCancelEdit?.(); }
                                if (e.key === 'Tab') {
                                  e.preventDefault();
                                  void onCommitEdit?.(idx, column, editDraft ?? '');
                                  const nextColIdx = columns.indexOf(column) + 1;
                                  if (nextColIdx < columns.length) onStartEdit?.(idx, columns[nextColIdx]);
                                }
                              }}
                              onBlur={() => void onCommitEdit?.(idx, column, editDraft ?? '')}
                              autoFocus
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={column}
                          className={`dv-table-cell ${editable ? 'dv-cell-editable' : ''}`}
                          style={columnWidths[column] ? { width: `${columnWidths[column]}px` } : undefined}
                          title={editable ? 'Double-click to edit' : 'Click to copy'}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedRowIndex(idx);
                            if (!editable) void navigator.clipboard.writeText(formatCellValue(cellValue));
                          }}
                          onDoubleClick={() => {
                            if (editable) onStartEdit?.(idx, column);
                          }}
                        >
                          {fk && cellValue !== null && cellValue !== undefined && onFkNavigate ? (
                            <span className="dv-fk-link" onClick={(e) => { e.stopPropagation(); onFkNavigate(fk.table, fk.column, cellValue); }}>
                              {renderCell(cellValue)}
                            </span>
                          ) : (
                            renderCell(cellValue)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {selectedRow && (
          <aside className="dv-row-drawer" aria-label="Selected row details">
            <div className="dv-query-toolbar">
              <div className="dv-section-head">
                <h3 className="dv-section-title">Row {(selectedRowIndex ?? 0) + 1}</h3>
                <p className="dv-section-meta">{columns.length} fields</p>
              </div>
              <button className="dv-btn-ghost" onClick={() => setSelectedRowIndex(null)}>Close</button>
            </div>
            <dl className="dv-row-drawer-grid">
              {columns.map((column) => {
                const fk = fkMap?.get(column);
                const val = selectedRow[column];
                return (
                  <div key={column} className="dv-row-drawer-item">
                    <dt>{column} {fk && <span className="text-accent text-xs">FK → {fk.table}</span>}</dt>
                    <dd>
                      {fk && val !== null && val !== undefined && onFkNavigate ? (
                        <span className="dv-fk-link" onClick={() => onFkNavigate(fk.table, fk.column, val)}>
                          {renderCell(val)}
                        </span>
                      ) : (
                        renderCell(val)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </aside>
        )}
      </div>
    </div>
  );
}

/* ── StructurePanel ──────────────────────────────────────── */

function StructurePanel({ structure }: { structure: TableStructureInfo }) {
  const sections: { label: string; emptyLabel: string; rows: Record<string, unknown>[]; sortable?: boolean }[] = [
    { label: 'Columns', emptyLabel: 'No columns.', rows: structure.columns, sortable: true },
    { label: 'Primary Keys', emptyLabel: 'No primary keys.', rows: structure.primaryKeys },
    { label: 'Foreign Keys', emptyLabel: 'No foreign keys.', rows: structure.foreignKeys, sortable: true },
    { label: 'Indexes', emptyLabel: 'No indexes.', rows: structure.indices, sortable: true },
  ];

  return (
    <div className="space-y-6 text-sm">
      {sections.map(({ label, emptyLabel, rows, sortable }) => (
        <section key={label}>
          <h3 className="font-semibold mb-2">{label} ({rows.length})</h3>
          {rows.length ? (
            <DataTable rows={rows} sortable={sortable} />
          ) : (
            <p className="dv-empty">{emptyLabel}</p>
          )}
        </section>
      ))}
    </div>
  );
}

/* ── Cell helpers ────────────────────────────────────────── */

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
