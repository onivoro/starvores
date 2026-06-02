import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Editor from '@monaco-editor/react';
import jsonata from 'jsonata';
import {
  createDatavoreApi,
  DatabaseInfo,
  QueryJsonlExportError,
  RelationshipInfo,
  SchemaObjectInfo,
  TableInfo,
  TableRelationships,
  TableStructureInfo,
} from '@onivoro/axios-datavore';
import {
  addSuccessfulQueryToHistory,
  clampSqlSplitterRatio,
  closeTabInWorkspace,
  createTab,
  formatSqlWithFallback,
  getNextTabName,
  getPinnedTablesStorageKey,
  getQueryHistoryStorageKey,
  getSqlSplitterStorageKey,
  getTabsStorageKey,
  loadPinnedTables,
  loadQueryHistory,
  loadSqlSplitterRatio,
  loadWorkspaceState,
  renameTabInWorkspace,
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

const isMysqlFamily = (dbType: string): boolean => dbType === 'mysql' || dbType === 'mariadb' || dbType === 'aurora-mysql';

const quoteIdentifier = (name: string): string =>
  isMysqlFamily(activeDbType)
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
  if (isMysqlFamily(activeDbType)) {
    return `CAST(${quoteIdentifier(col)} AS CHAR) LIKE '%${escaped}%'`;
  }
  if (activeDbType === 'sqlite') {
    return `CAST(${quoteIdentifier(col)} AS TEXT) LIKE '%${escaped}%'`;
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

const buildRelationshipJoinQuery = (relationship: RelationshipInfo): string =>
  `SELECT *\nFROM ${quoteIdentifier(relationship.sourceTable)}\nJOIN ${quoteIdentifier(relationship.targetTable)} ON ${quoteIdentifier(relationship.sourceTable)}.${quoteIdentifier(relationship.sourceColumn)} = ${quoteIdentifier(relationship.targetTable)}.${quoteIdentifier(relationship.targetColumn)}\nLIMIT 100;`;

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

const buildUpdateRowQuery = (
  table: string,
  values: Record<string, string>,
  originalValues: Record<string, string>,
  pkColumns: string[],
  row: Record<string, unknown>,
): string => {
  const changedColumns = Object.keys(values).filter((column) => values[column] !== originalValues[column]);
  if (!changedColumns.length) return '';
  const setClause = changedColumns
    .map((column) => `${quoteIdentifier(column)} = ${values[column] === '' ? 'NULL' : escapeSqlValue(values[column])}`)
    .join(', ');
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
type SchemaObject = SchemaObjectInfo;
type SidebarSchemaSection = 'tables' | 'views' | 'functions' | 'sequences';
type SchemaSearchType = 'table' | 'column' | 'view' | 'function' | 'sequence';

type SchemaSearchEntry = {
  id: string;
  type: SchemaSearchType;
  name: string;
  tableName?: string;
  schema?: string;
  dataType?: string;
  searchable: string;
};

type CommandActionId =
  | 'open-sql-view'
  | 'focus-table-filter'
  | 'new-tab'
  | 'run-query'
  | 'explain-query'
  | 'format-sql'
  | 'export-csv'
  | 'toggle-filter-bar';

type ExportState = {
  status: ExportStatus;
  rowCount: number;
  bytesWritten: number;
  filename: string;
  partialSaved: boolean;
  message?: string;
};

type RowFormMode = 'add' | 'edit';

type RowFormState = {
  mode: RowFormMode;
  values: Record<string, string>;
  originalValues: Record<string, string>;
  row?: Record<string, unknown>;
} | null;

type JsonCellModalState = {
  value: unknown;
  column: string;
  rowIndex?: number;
} | null;

type JsonataErrorInfo = {
  message: string;
  code?: string;
  position?: number;
  token?: string;
  value?: string;
};

type JsonPathSuggestion = {
  label: string;
  jsonataPath: string;
  jsonPath: string;
};

type JsonataPreviewColumn = {
  id: string;
  sourceColumn: string;
  expression: string;
  label: string;
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
  const [schemaSearchTypes, setSchemaSearchTypes] = useState<Record<SchemaSearchType, boolean>>({
    table: true,
    column: true,
    view: true,
    function: true,
    sequence: true,
  });
  const [schemaIndexVersion, setSchemaIndexVersion] = useState(0);
  const [schemaMetadataLoading, setSchemaMetadataLoading] = useState(false);

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
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);
  const [tableDataError, setTableDataError] = useState<string | null>(null);
  const [tableDataLoading, setTableDataLoading] = useState(false);
  const [structure, setStructure] = useState<TableStructureInfo | null>(null);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [relationships, setRelationships] = useState<TableRelationships | null>(null);
  const [relationshipsError, setRelationshipsError] = useState<string | null>(null);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [selectedTableRow, setSelectedTableRow] = useState<Record<string, unknown> | null>(null);
  const [highlightedColumn, setHighlightedColumn] = useState<string | null>(null);

  /* ── Table browsing (sort/filter/pagination) ── */
  const [tableSort, setTableSort] = useState<SortState>(null);
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({});
  const [filterBarOpen, setFilterBarOpen] = useState(false);
  const [tablePageSize, setTablePageSize] = useState(DEFAULT_PAGE_SIZE);
  const [tablePageOffset, setTablePageOffset] = useState(0);
  const [tableTotalRows, setTableTotalRows] = useState<number | null>(null);

  /* ── Inline editing ── */
  const [editMode, setEditMode] = useState(false);
  const [rowForm, setRowForm] = useState<RowFormState>(null);

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

  /* ── Export ── */
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState(getDefaultExportFilename());
  const [exportLimitMode, setExportLimitMode] = useState<ExportLimitMode>(DEFAULT_EXPORT_LIMIT_MODE);
  const [exportCustomLimit, setExportCustomLimit] = useState('250000');
  const [includeMetadataHeader, setIncludeMetadataHeader] = useState(false);
  const [exportState, setExportState] = useState<ExportState>(DEFAULT_EXPORT_STATE);
  const [jsonCellModal, setJsonCellModal] = useState<JsonCellModalState>(null);

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

  const schemaSearchEntries = useMemo<SchemaSearchEntry[]>(() => {
    const entries: SchemaSearchEntry[] = [];
    tables.forEach((table) => {
      entries.push({
        id: `table:${table.tableName}`,
        type: 'table',
        name: table.tableName,
        tableName: table.tableName,
        searchable: `table ${table.tableName}`.toLowerCase(),
      });
      const structureForTable = structureCacheRef.current.get(table.tableName);
      structureForTable?.columns.forEach((column) => {
        entries.push({
          id: `column:${table.tableName}.${column.columnName}`,
          type: 'column',
          name: column.columnName,
          tableName: table.tableName,
          dataType: column.dataType,
          searchable: `column ${table.tableName} ${column.columnName} ${column.dataType}`.toLowerCase(),
        });
      });
    });
    schemaViews.forEach((view) => entries.push({
      id: `view:${view.schema}.${view.name}`,
      type: 'view',
      name: view.name,
      schema: view.schema,
      tableName: view.name,
      searchable: `view ${view.schema} ${view.name}`.toLowerCase(),
    }));
    schemaFunctions.forEach((fn, index) => entries.push({
      id: `function:${fn.schema}.${fn.name}.${index}`,
      type: 'function',
      name: fn.name,
      schema: fn.schema,
      searchable: `function routine ${fn.schema} ${fn.name} ${fn.type ?? ''}`.toLowerCase(),
    }));
    schemaSequences.forEach((seq) => entries.push({
      id: `sequence:${seq.schema}.${seq.name}`,
      type: 'sequence',
      name: seq.name,
      schema: seq.schema,
      searchable: `sequence ${seq.schema} ${seq.name}`.toLowerCase(),
    }));
    return entries;
  }, [schemaFunctions, schemaIndexVersion, schemaSequences, schemaViews, tables]);

  const schemaSearchResults = useMemo(() => {
    const filter = tableFilter.trim().toLowerCase();
    if (!filter) return [];
    const terms = filter.split(/\s+/).filter(Boolean);
    return schemaSearchEntries
      .filter((entry) => schemaSearchTypes[entry.type] && terms.every((term) => entry.searchable.includes(term)))
      .slice(0, 80);
  }, [schemaSearchEntries, schemaSearchTypes, tableFilter]);

  const groupedSchemaSearchResults = useMemo(() => {
    const groups: Record<SchemaSearchType, SchemaSearchEntry[]> = {
      table: [],
      column: [],
      view: [],
      function: [],
      sequence: [],
    };
    schemaSearchResults.forEach((entry) => groups[entry.type].push(entry));
    return groups;
  }, [schemaSearchResults]);

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

  const loadSchemaObjects = useCallback(async () => {
    try {
      const { data } = await api.getSchemaObjects();
      setSchemaViews(data.views);
      setSchemaFunctions(data.functions);
      setSchemaSequences(data.sequences);
    } catch {
      setSchemaViews([]);
      setSchemaFunctions([]);
      setSchemaSequences([]);
    }
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
    const batchSize = 25;
    setSchemaMetadataLoading(true);
    for (let offset = 0; offset < tableList.length; offset += batchSize) {
      const batch = tableList.slice(offset, offset + batchSize);
      const results = await Promise.allSettled(
        batch.map((t) => api.getTableStructure(t.tableName)),
      );
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          structureCacheRef.current.set(batch[i].tableName, r.value.data);
        }
      });
      setSchemaIndexVersion((version) => version + 1);
    }
    setSchemaMetadataLoading(false);
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

      void loadSchemaObjects();
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
      setTableData([]);
      setStructure(null);
      setRelationships(null);
      setSelectedTableRow(null);
      setTableDataError(null);
      setStructureError(null);
      setRelationshipsError(null);
      setTableSort(null);
      setTableFilters({});
      setTablePageOffset(0);
      setTableTotalRows(null);
      setEditMode(false);
      setRowForm(null);

      setTableDataLoading(true);
      setStructureLoading(true);
      setRelationshipsLoading(true);

      const [dataResult, structureResult, relationshipsResult] = await Promise.allSettled([
        api.executeQuery(buildSelectQuery(tableName, null, {}, tablePageSize, 0)),
        api.getTableStructure(tableName),
        api.getTableRelationships(tableName),
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
        setSchemaIndexVersion((version) => version + 1);
      } else {
        setStructureError(getErrorMessage(structureResult.reason, 'Failed to load table structure.'));
      }
      setStructureLoading(false);

      if (relationshipsResult.status === 'fulfilled') {
        setRelationships(relationshipsResult.value.data);
      } else {
        setRelationshipsError(getErrorMessage(relationshipsResult.reason, 'Failed to load table relationships.'));
      }
      setRelationshipsLoading(false);

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

  /* ── Row editing ── */

  const getEditableColumns = useCallback(() => {
    if (structure?.columns.length) return structure.columns.map((column) => column.columnName);
    return Object.keys(tableData[0] ?? {});
  }, [structure, tableData]);

  const openAddRowModal = useCallback(() => {
    const values = Object.fromEntries(getEditableColumns().map((column) => [column, '']));
    setRowForm({ mode: 'add', values, originalValues: {} });
  }, [getEditableColumns]);

  const openEditRowModal = useCallback(
    (rowIndex: number) => {
      const row = tableData[rowIndex];
      if (!row) return;
      const values = Object.fromEntries(getEditableColumns().map((column) => [column, formatFormValue(row[column])]));
      setRowForm({ mode: 'edit', values, originalValues: values, row });
    },
    [getEditableColumns, tableData],
  );

  const submitRowForm = useCallback(
    async () => {
      if (!selectedTable || !rowForm) return;
      const sql = rowForm.mode === 'add'
        ? buildInsertQuery(selectedTable, rowForm.values)
        : rowForm.row
          ? buildUpdateRowQuery(selectedTable, rowForm.values, rowForm.originalValues, primaryKeyColumns, rowForm.row)
          : '';
      if (!sql) { setRowForm(null); return; }

      try {
        const { data } = await api.executeQuery(sql);
        if (data.error) { setTableDataError(data.error); return; }
        setRowForm(null);
        void loadTableBrowseData(selectedTable, tableSort, tableFilters, tablePageSize, tablePageOffset);
      } catch (error) {
        setTableDataError(getErrorMessage(error, rowForm.mode === 'add' ? 'Failed to insert row.' : 'Failed to save row.'));
      }
    },
    [loadTableBrowseData, primaryKeyColumns, rowForm, selectedTable, tableFilters, tablePageOffset, tablePageSize, tableSort],
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

  const navigateRelationship = useCallback(
    (relationship: RelationshipInfo) => {
      const isOutbound = relationship.sourceTable === selectedTable;
      const targetTable = isOutbound ? relationship.targetTable : relationship.sourceTable;
      const targetColumn = isOutbound ? relationship.targetColumn : relationship.sourceColumn;
      const valueColumn = isOutbound ? relationship.sourceColumn : relationship.targetColumn;
      const value = selectedTableRow?.[valueColumn];

      if (value === null || value === undefined) {
        void selectTable(targetTable);
        return;
      }

      navigateToFk(targetTable, targetColumn, value);
    },
    [navigateToFk, selectTable, selectedTable, selectedTableRow],
  );

  const openRelationshipJoinQuery = useCallback(
    (relationship: RelationshipInfo) => {
      const query = buildRelationshipJoinQuery(relationship);
      setSqlWorkspace((current) => {
        const newTab = createTab(query, current.tabs.length, `${relationship.sourceTable} join`);
        return { tabs: [...current.tabs, newTab], activeTabId: newTab.id };
      });
      setActiveView('sql');
      requestAnimationFrame(() => editorRef.current?.focus());
    },
    [],
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
        : activeDbType === 'sqlite'
          ? 'EXPLAIN QUERY PLAN'
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

  const openSchemaSearchEntry = useCallback(
    (entry: SchemaSearchEntry) => {
      if (entry.type === 'table' || entry.type === 'view') {
        setHighlightedColumn(null);
        void selectTable(entry.tableName ?? entry.name);
        return;
      }
      if (entry.type === 'column' && entry.tableName) {
        setHighlightedColumn(entry.name);
        setFilterBarOpen(true);
        void selectTable(entry.tableName).then(() => setHighlightedColumn(entry.name));
        return;
      }
      if (entry.type === 'function') {
        const prefix = entry.schema && entry.schema !== 'public' ? `${quoteIdentifier(entry.schema)}.` : '';
        loadQueryIntoEditor(`SELECT * FROM ${prefix}${quoteIdentifier(entry.name)}()`);
        return;
      }
      if (entry.type === 'sequence') {
        const prefix = entry.schema && entry.schema !== 'public' ? `${quoteIdentifier(entry.schema)}.` : '';
        loadQueryIntoEditor(`SELECT * FROM ${prefix}${quoteIdentifier(entry.name)}`);
      }
    },
    [loadQueryIntoEditor, selectTable],
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

        <div className="dv-schema-search">
          <div className="dv-sidebar-filter-row">
            <label className="dv-sidebar-search-label" htmlFor="schema-search">Schema Search</label>
            <p className="dv-section-meta">
              {tableFilter.trim() ? `${schemaSearchResults.length} result${schemaSearchResults.length === 1 ? '' : 's'}` : `${tables.length} tables`}
            </p>
          </div>
          <div className="dv-sidebar-filter-input-row">
            <input
              id="schema-search"
              ref={tableFilterInputRef}
              className="dv-input"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder="Search tables, columns, views..."
            />
            {tableFilter.trim() && (
              <button className="dv-btn-ghost dv-btn-sm" onClick={() => setTableFilter('')}>Clear</button>
            )}
          </div>
          <div className="dv-schema-type-filters" aria-label="Schema search type filters">
            {(['table', 'column', 'view', 'function', 'sequence'] as SchemaSearchType[]).map((type) => (
              <button
                key={type}
                className={`dv-schema-type-chip ${schemaSearchTypes[type] ? 'is-active' : ''}`}
                onClick={() => setSchemaSearchTypes((current) => ({ ...current, [type]: !current[type] }))}
              >
                {type === 'function' ? 'Routines' : `${type.charAt(0).toUpperCase()}${type.slice(1)}s`}
              </button>
            ))}
          </div>
          {tableFilter.trim() && (
            <div className="dv-schema-search-results" role="listbox" aria-label="Schema search results">
              {schemaSearchResults.length ? (
                (['table', 'column', 'view', 'function', 'sequence'] as SchemaSearchType[]).map((type) => {
                  const entries = groupedSchemaSearchResults[type];
                  if (!entries.length) return null;
                  return (
                    <div className="dv-schema-search-group" key={type}>
                      <p className="dv-section-meta">{type === 'function' ? 'Routines' : `${type.charAt(0).toUpperCase()}${type.slice(1)}s`} ({entries.length})</p>
                      {entries.map((entry) => (
                        <button key={entry.id} className="dv-schema-search-result" onClick={() => openSchemaSearchEntry(entry)}>
                          <span className="dv-schema-icon">{entry.type === 'column' ? 'C' : entry.type.charAt(0).toUpperCase()}</span>
                          <span>
                            <strong>{entry.type === 'column' && entry.tableName ? `${entry.tableName}.${entry.name}` : entry.name}</strong>
                            <small>{entry.type}{entry.dataType ? ` · ${entry.dataType}` : entry.schema ? ` · ${entry.schema}` : ''}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })
              ) : (
                <p className="dv-empty dv-empty-tight">No schema results.</p>
              )}
              {schemaMetadataLoading && <p className="dv-section-meta">Loading column metadata...</p>}
            </div>
          )}
        </div>

        {/* Schema sections */}
        {!tableFilter.trim() && <div className="space-y-1">
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
                <span className="dv-sidebar-search-label">Visible</span>
                <p className="dv-section-meta">
                  {filteredTables.length} match{filteredTables.length === 1 ? '' : 'es'}
                </p>
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
        </div>}
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

        {jsonCellModal && (
          <JsonataModal
            cell={jsonCellModal}
            onClose={() => setJsonCellModal(null)}
          />
        )}

        {rowForm && (
          <RowFormModal
            tableName={selectedTable}
            mode={rowForm.mode}
            values={rowForm.values}
            structure={structure}
            onChange={(column, value) => setRowForm((current) => current ? ({ ...current, values: { ...current.values, [column]: value } }) : current)}
            onClose={() => setRowForm(null)}
            onSubmit={() => void submitRowForm()}
          />
        )}

        {/* ── SQL View ── */}
        {activeView === 'sql' ? (
          <div className="dv-sql-workbench">
            <section className="dv-card dv-card-pad dv-sql-query-results" aria-label="SQL query and results">
              <div className="dv-query-toolbar">
                <div className="dv-section-head">
                  <h2 className="dv-section-title">SQL Query + Results</h2>
                  <p className="dv-section-meta">
                    Query and output stay paired. Cmd+Enter run &middot; Shift+Cmd+Enter explain
                  </p>
                </div>
                <div className="dv-toolbar-actions">
                  <button className="dv-btn-ghost" onClick={() => void formatActiveSql()}>Format</button>
                  <button className="dv-btn-ghost" onClick={() => setQueryHistoryOpen((c) => !c)}>
                    {queryHistoryOpen ? 'Top 5 History' : 'All History'}
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

              <div
                className="dv-sql-split"
                ref={sqlSplitShellRef}
                style={{
                  gridTemplateRows: `minmax(260px, ${sqlSplitRatio * 100}%) 10px minmax(180px, ${(1 - sqlSplitRatio) * 100}%)`,
                }}
              >
                <section className="dv-query-section" aria-label="SQL query editor">
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

                <section className="dv-sql-results-pane" aria-label="SQL query results">
                  <div className="dv-pane-header">
                    <div className="dv-section-head">
                      <h3 className="dv-section-title">Results</h3>
                      <p className="dv-section-meta">Output for the query above.</p>
                    </div>
                  </div>
                  <QueryResultDisplay
                    executing={executing}
                    resultError={resultError}
                    result={result}
                    emptyMessage="Run the query above to view results."
                    onOpenJsonCell={(value, column, rowIndex) => setJsonCellModal({ value, column, rowIndex })}
                  />
                </section>
              </div>
            </section>

            <SqlQueryInspector
              dbInfo={dbInfo}
              result={result}
              resultError={resultError}
              executing={executing}
              activeQuery={activeSqlTab?.query ?? ''}
              queryHistory={queryHistory}
              queryHistoryOpen={queryHistoryOpen}
              onToggleHistory={() => setQueryHistoryOpen((current) => !current)}
              onRerunHistory={(item) => void rerunFromHistory(item)}
              explainOpen={explainOpen}
              explainResult={explainResult}
              onCloseExplain={() => setExplainOpen(false)}
            />
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
                  onClick={() => setEditMode((c) => !c)}
                >
                  {editMode ? 'Done Editing' : 'Edit'}
                </button>
                {editMode && (
                  <button className="dv-btn-ghost" onClick={openAddRowModal} disabled={!selectedTable}>
                    + Add Row
                  </button>
                )}
              </div>
            </div>

            <div className="dv-table-workbench">
              <section className="dv-card dv-card-pad dv-table-data-pane" aria-label="Table data">
                <div className="dv-pane-header">
                  <div className="dv-section-head">
                    <h3 className="dv-section-title">{selectedTable ? `${selectedTable} Data` : 'Data'}</h3>
                    <p className="dv-section-meta">Rows stay visible while inspecting columns and keys.</p>
                  </div>
                </div>
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

                    <DataTable
                      rows={tableData}
                            sortable
                      serverSort={tableSort}
                      onServerSort={handleTableSort}
                      editable={editMode}
                      onEditRow={openEditRowModal}
                      onDeleteRow={deleteRow}
                      fkMap={foreignKeyMap}
                      onFkNavigate={navigateToFk}
                      onOpenJsonCell={(value, column, rowIndex) => setJsonCellModal({ value, column, rowIndex })}
                      onSelectedRowChange={setSelectedTableRow}
                      previewScopeKey={selectedTable}
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
              </section>

              <aside className="dv-card dv-card-pad dv-object-details" aria-label="Table structure and details">
                <div className="dv-pane-header">
                  <div className="dv-section-head">
                    <h3 className="dv-section-title">{selectedTable ? `${selectedTable} Structure` : 'Structure'}</h3>
                    <p className="dv-section-meta">Columns, keys, and indexes for {selectedTable || 'the selected object'}.</p>
                  </div>
                </div>
                {!selectedTable ? (
                  <p className="dv-empty">Select a table to inspect structure.</p>
                ) : structureLoading ? (
                  <p className="dv-empty">Loading structure...</p>
                ) : structureError ? (
                  <p className="text-danger text-sm">{structureError}</p>
                ) : structure ? (
                  <ObjectDetailsPanel
                    structure={structure}
                    relationships={relationships}
                    relationshipsLoading={relationshipsLoading}
                    relationshipsError={relationshipsError}
                    selectedRow={selectedTableRow}
                    highlightedColumn={highlightedColumn}
                    onNavigateRelationship={navigateRelationship}
                    onOpenJoinQuery={openRelationshipJoinQuery}
                  />
                ) : (
                  <p className="dv-empty">No structure loaded.</p>
                )}
              </aside>
            </div>
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
  onOpenJsonCell,
}: {
  executing: boolean;
  resultError: string | null;
  result: ResultState | null;
  emptyMessage?: string;
  onOpenJsonCell?: (value: unknown, column: string, rowIndex: number) => void;
}) {
  if (executing) return <p className="dv-empty">Executing query...</p>;
  if (resultError) return <p className="text-danger text-sm">{resultError}</p>;
  if (result?.error) return <p className="text-danger text-sm">{result.error}</p>;
  if (result) return <DataTable rows={result.rows} rowCount={result.rowCount} sortable onOpenJsonCell={onOpenJsonCell} />;
  if (emptyMessage) return <p className="dv-empty">{emptyMessage}</p>;
  return null;
}

/* ── SQL Query Inspector ─────────────────────────────────── */

function SqlQueryInspector({
  dbInfo,
  result,
  resultError,
  executing,
  activeQuery,
  queryHistory,
  queryHistoryOpen,
  onToggleHistory,
  onRerunHistory,
  explainOpen,
  explainResult,
  onCloseExplain,
}: {
  dbInfo: DatabaseInfo | null;
  result: ResultState | null;
  resultError: string | null;
  executing: boolean;
  activeQuery: string;
  queryHistory: SqlQueryHistoryItem[];
  queryHistoryOpen: boolean;
  onToggleHistory: () => void;
  onRerunHistory: (item: SqlQueryHistoryItem) => void;
  explainOpen: boolean;
  explainResult: string | null;
  onCloseExplain: () => void;
}) {
  const resultColumns = result?.rows[0] ? Object.keys(result.rows[0]) : [];
  const visibleHistory = queryHistoryOpen ? queryHistory : queryHistory.slice(0, 5);
  const queryLineCount = Math.max(1, activeQuery.split('\n').length);
  const status = executing ? 'Running' : resultError || result?.error ? 'Error' : result ? 'Ready' : 'Idle';

  return (
    <aside className="dv-card dv-card-pad dv-sql-inspector" aria-label="SQL query details">
      <div className="dv-pane-header">
        <div className="dv-section-head">
          <h3 className="dv-section-title">Query Inspector</h3>
          <p className="dv-section-meta">Context, plan, and history stay visible beside results.</p>
        </div>
      </div>

      <div className="dv-sql-inspector-stack">
        <section>
          <h4 className="dv-object-detail-title">Execution</h4>
          <div className="dv-object-summary-grid">
            <span>Status <strong>{status}</strong></span>
            <span>Rows <strong>{result?.rowCount?.toLocaleString() ?? '0'}</strong></span>
            <span>Time <strong>{result ? `${result.elapsedMs}ms` : 'n/a'}</strong></span>
            <span>Columns <strong>{resultColumns.length}</strong></span>
          </div>
        </section>

        <section>
          <h4 className="dv-object-detail-title">Connection</h4>
          <dl className="dv-sql-meta-list">
            <div><dt>Type</dt><dd>{dbInfo?.type ?? activeDbType}</dd></div>
            <div><dt>Database</dt><dd>{dbInfo?.databaseName ?? 'unknown'}</dd></div>
            <div><dt>Query</dt><dd>{queryLineCount} line{queryLineCount === 1 ? '' : 's'}</dd></div>
          </dl>
        </section>

        <section>
          <div className="dv-query-toolbar">
            <h4 className="dv-object-detail-title">Result Columns</h4>
          </div>
          {resultColumns.length ? (
            <div className="dv-sql-column-chips">
              {resultColumns.map((column) => <span key={column}>{column}</span>)}
            </div>
          ) : (
            <p className="dv-empty dv-empty-tight">No result columns yet.</p>
          )}
        </section>

        <section>
          <div className="dv-query-toolbar">
            <h4 className="dv-object-detail-title">Query Plan</h4>
            {explainOpen && explainResult && <button className="dv-btn-ghost dv-btn-sm" onClick={onCloseExplain}>Close</button>}
          </div>
          {explainOpen && explainResult ? (
            <pre className="dv-explain-pre dv-explain-pre-compact">{explainResult}</pre>
          ) : (
            <p className="dv-empty dv-empty-tight">Run Explain to pin the plan here.</p>
          )}
        </section>

        <section>
          <div className="dv-query-toolbar">
            <div>
              <h4 className="dv-object-detail-title">Recent Queries</h4>
              <p className="dv-section-meta">{queryHistory.length} saved</p>
            </div>
            <button className="dv-btn-ghost dv-btn-sm" onClick={onToggleHistory}>
              {queryHistoryOpen ? 'Top 5' : 'All'}
            </button>
          </div>
          {visibleHistory.length ? (
            <div className="dv-query-history-list dv-query-history-list-compact">
              {visibleHistory.map((item) => (
                <div className="dv-query-history-item" key={item.id}>
                  <button className="dv-query-history-query" onClick={() => onRerunHistory(item)}>
                    {item.query}
                  </button>
                  <p className="dv-section-meta">
                    {item.rowCount.toLocaleString()} rows &middot; {item.elapsedMs}ms &middot; {new Date(item.executedAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="dv-empty dv-empty-tight">No queries yet.</p>
          )}
        </section>
      </div>
    </aside>
  );
}

/* ── DataTable ───────────────────────────────────────────── */

function RowFormModal({
  tableName,
  mode,
  values,
  structure,
  onChange,
  onClose,
  onSubmit,
}: {
  tableName: string;
  mode: RowFormMode;
  values: Record<string, string>;
  structure: TableStructureInfo | null;
  onChange: (column: string, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const columns = structure?.columns.length
    ? structure.columns
    : Object.keys(values).map((columnName) => ({ columnName, dataType: '', isNullable: 'YES', columnDefault: null }));
  const title = mode === 'add' ? `Add row to ${tableName}` : `Edit row in ${tableName}`;

  return (
    <section className="dv-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dv-modal dv-row-form-modal">
        <div className="dv-query-toolbar">
          <div className="dv-section-head">
            <h2 className="dv-section-title">{title}</h2>
            <p className="dv-section-meta">Blank fields are omitted on insert and set to NULL on edit.</p>
          </div>
          <button className="dv-btn-ghost" onClick={onClose}>Close</button>
        </div>

        <div className="dv-row-form-grid">
          {columns.map((column) => (
            <label className="dv-row-form-field" key={column.columnName}>
              <span>
                <strong>{column.columnName}</strong>
                <small>{column.dataType || 'value'} · {column.isNullable === 'YES' ? 'nullable' : 'required'}{column.columnDefault ? ' · default' : ''}</small>
              </span>
              <textarea
                className="dv-input dv-row-form-input"
                value={values[column.columnName] ?? ''}
                onChange={(event) => onChange(column.columnName, event.target.value)}
                spellCheck={false}
              />
            </label>
          ))}
        </div>

        <div className="dv-modal-actions">
          <button className="dv-btn" onClick={onSubmit}>{mode === 'add' ? 'Insert Row' : 'Save Row'}</button>
          <button className="dv-btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </section>
  );
}

function DataTable({
  rows,
  rowCount,
  sortable,
  serverSort,
  onServerSort,
  editable,
  onEditRow,
  onDeleteRow,
  fkMap,
  onFkNavigate,
  onOpenJsonCell,
  onSelectedRowChange,
  previewScopeKey,
}: {
  rows: Record<string, unknown>[];
  rowCount?: number;
  sortable?: boolean;
  serverSort?: SortState;
  onServerSort?: (column: string) => void;
  editable?: boolean;
  onEditRow?: (rowIndex: number) => void;
  onDeleteRow?: (rowIndex: number) => Promise<void>;
  fkMap?: Map<string, { table: string; column: string }>;
  onFkNavigate?: (table: string, column: string, value: unknown) => void;
  onOpenJsonCell?: (value: unknown, column: string, rowIndex: number) => void;
  onSelectedRowChange?: (row: Record<string, unknown> | null) => void;
  previewScopeKey?: string;
}) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [clientSort, setClientSort] = useState<SortState>(null);
  const [expandedJsonFields, setExpandedJsonFields] = useState<Set<string>>(new Set());
  const [jsonataDrafts, setJsonataDrafts] = useState<Record<string, string>>({});
  const [jsonataPreviewColumns, setJsonataPreviewColumns] = useState<JsonataPreviewColumn[]>([]);
  const [jsonataPreviewValues, setJsonataPreviewValues] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (selectedRowIndex !== null && !rows[selectedRowIndex]) {
      setSelectedRowIndex(null);
      onSelectedRowChange?.(null);
    }
  }, [onSelectedRowChange, rows, selectedRowIndex]);

  useEffect(() => {
    setJsonataPreviewColumns([]);
    setJsonataPreviewValues({});
    setExpandedJsonFields(new Set());
    setJsonataDrafts({});
  }, [previewScopeKey]);

  useEffect(() => {
    let cancelled = false;
    const evaluatePreviewColumns = async () => {
      const nextValues: Record<string, string> = {};
      await Promise.all(jsonataPreviewColumns.flatMap((previewColumn) => rows.map(async (row, rowIndex) => {
        const sourceJson = getJsonCellValue(row[previewColumn.sourceColumn]);
        if (!sourceJson) {
          nextValues[`${previewColumn.id}:${rowIndex}`] = 'NULL';
          return;
        }
        const result = await evaluateJsonataPreview(sourceJson, previewColumn.expression);
        nextValues[`${previewColumn.id}:${rowIndex}`] = result.error ? `Error: ${result.error.message}` : result.output;
      })));
      if (!cancelled) setJsonataPreviewValues(nextValues);
    };
    void evaluatePreviewColumns();
    return () => { cancelled = true; };
  }, [jsonataPreviewColumns, rows]);

  const columns = Object.keys(rows[0] ?? {});
  const renderedColumns = [...columns, ...jsonataPreviewColumns.map((column) => column.label)];
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

  if (!rows?.length) return <p className="dv-empty">No rows</p>;

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

  const addJsonataPreviewColumn = (sourceColumn: string, expression: string) => {
    const trimmedExpression = expression.trim() || '$';
    setJsonataPreviewColumns((current) => [
      ...current,
      {
        id: `${sourceColumn}:${trimmedExpression}:${Date.now()}`,
        sourceColumn,
        expression: trimmedExpression,
        label: `${sourceColumn} ${trimmedExpression}`,
      },
    ]);
  };

  return (
    <div className="dv-table-shell" data-density="compact">
      <div className="dv-table-status">
        <span>{totalRows.toLocaleString()} rows &middot; {columns.length} columns{jsonataPreviewColumns.length ? ` · ${jsonataPreviewColumns.length} preview` : ''}</span>
        {jsonataPreviewColumns.length > 0 && (
          <button className="dv-btn-ghost dv-btn-sm" onClick={() => setJsonataPreviewColumns([])}>Clear Previews</button>
        )}
        {editable && selectedRowIndex !== null && onEditRow && (
          <button className="dv-btn-ghost dv-btn-sm" onClick={() => onEditRow(selectedRowIndex)}>
            Edit Row
          </button>
        )}
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
                {renderedColumns.map((column) => {
                  const isPreviewColumn = !columns.includes(column);
                  return (
                  <th
                    key={column}
                    className={`text-left ${sortable && !isPreviewColumn ? 'dv-th-sortable' : ''}`}
                    style={columnWidths[column] ? { width: `${columnWidths[column]}px` } : undefined}
                    onClick={() => { if (!isPreviewColumn) handleSort(column); }}
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
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => {
                const isSelected = selectedRowIndex === idx;
                return (
                  <tr
                    key={idx}
                    className={isSelected ? 'dv-table-row-selected' : ''}
                    onClick={() => {
                      setSelectedRowIndex(idx);
                      onSelectedRowChange?.(row);
                    }}
                  >
                    <td className="dv-table-index">{idx + 1}</td>
                    {renderedColumns.map((column) => {
                      const previewColumn = jsonataPreviewColumns.find((preview) => preview.label === column);
                      const fk = fkMap?.get(column);
                      const cellValue = previewColumn
                        ? jsonataPreviewValues[`${previewColumn.id}:${idx}`] ?? '...'
                        : row[column];

                      return (
                        <td
                          key={column}
                          className={`dv-table-cell ${editable ? 'dv-cell-editable' : ''}`}
                          style={columnWidths[column] ? { width: `${columnWidths[column]}px` } : undefined}
                          title={editable ? 'Double-click to edit row' : 'Click to copy'}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedRowIndex(idx);
                            onSelectedRowChange?.(row);
                            if (!editable) void navigator.clipboard.writeText(formatCellValue(cellValue));
                          }}
                          onDoubleClick={() => {
                            if (editable) onEditRow?.(idx);
                          }}
                        >
                          {previewColumn ? (
                            <span className="dv-jsonata-preview-cell">{String(cellValue ?? '')}</span>
                          ) : fk && cellValue !== null && cellValue !== undefined && onFkNavigate ? (
                            <span className="dv-fk-link" onClick={(e) => { e.stopPropagation(); onFkNavigate(fk.table, fk.column, cellValue); }}>
                              {renderCell(cellValue, column, idx, onOpenJsonCell)}
                            </span>
                          ) : (
                            renderCell(cellValue, column, idx, onOpenJsonCell)
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
              <div className="dv-toolbar-actions">
                {editable && onEditRow && <button className="dv-btn-ghost" onClick={() => onEditRow(selectedRowIndex ?? 0)}>Edit</button>}
                <button className="dv-btn-ghost" onClick={() => { setSelectedRowIndex(null); onSelectedRowChange?.(null); }}>Close</button>
              </div>
            </div>
            <dl className="dv-row-drawer-grid">
              {columns.map((column) => {
                const fk = fkMap?.get(column);
                const val = selectedRow[column];
                return (
                  <div key={column} className="dv-row-drawer-item">
                    <dt>{column} {fk && <span className="text-accent text-xs">FK → {fk.table}</span>}</dt>
                    <dd>
                      {getJsonCellValue(val) ? (
                        <JsonDrawerTools
                          value={val}
                          column={column}
                          rowIndex={selectedRowIndex ?? 0}
                          expanded={expandedJsonFields.has(`${selectedRowIndex ?? 0}:${column}`)}
                          expression={jsonataDrafts[column] ?? '$'}
                          onToggleExpanded={() => {
                            const key = `${selectedRowIndex ?? 0}:${column}`;
                            setExpandedJsonFields((current) => {
                              const next = new Set(current);
                              if (next.has(key)) next.delete(key); else next.add(key);
                              return next;
                            });
                          }}
                          onExpressionChange={(expression) => setJsonataDrafts((current) => ({ ...current, [column]: expression }))}
                          onOpenJsonCell={onOpenJsonCell}
                          onAddPreviewColumn={addJsonataPreviewColumn}
                        />
                      ) : fk && val !== null && val !== undefined && onFkNavigate ? (
                        <span className="dv-fk-link" onClick={() => onFkNavigate(fk.table, fk.column, val)}>
                          {renderCell(val, column, selectedRowIndex ?? 0, onOpenJsonCell)}
                        </span>
                      ) : (
                        renderCell(val, column, selectedRowIndex ?? 0, onOpenJsonCell)
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

function JsonDrawerTools({
  value,
  column,
  rowIndex,
  expanded,
  expression,
  onToggleExpanded,
  onExpressionChange,
  onOpenJsonCell,
  onAddPreviewColumn,
}: {
  value: unknown;
  column: string;
  rowIndex: number;
  expanded: boolean;
  expression: string;
  onToggleExpanded: () => void;
  onExpressionChange: (expression: string) => void;
  onOpenJsonCell?: (value: unknown, column: string, rowIndex: number) => void;
  onAddPreviewColumn: (column: string, expression: string) => void;
}) {
  const jsonValue = getJsonCellValue(value) ?? value;
  const [preview, setPreview] = useState<{ output: string; error?: JsonataErrorInfo }>({ output: formatJson(jsonValue) });
  const pathSuggestions = useMemo(() => getJsonPathSuggestions(jsonValue).slice(0, 24), [jsonValue]);

  useEffect(() => {
    let cancelled = false;
    const evaluate = async () => {
      const result = await evaluateJsonataPreview(jsonValue, expression);
      if (!cancelled) setPreview(result);
    };
    void evaluate();
    return () => { cancelled = true; };
  }, [expression, jsonValue]);

  const label = Array.isArray(jsonValue) ? `JSON array (${jsonValue.length})` : 'JSON object';

  return (
    <div className="dv-json-drawer-tools">
      <div className="dv-json-drawer-actions">
        <span className="dv-key-pill">{label}</span>
        <button className="dv-btn-ghost dv-btn-sm" onClick={onToggleExpanded}>{expanded ? 'Collapse' : 'Expand'}</button>
        {onOpenJsonCell && (
          <button className="dv-btn-ghost dv-btn-sm" onClick={() => onOpenJsonCell(jsonValue, column, rowIndex)}>JSONata Modal</button>
        )}
      </div>
      {expanded && (
        <>
          <pre className="dv-json-preview-pre">{formatJson(jsonValue)}</pre>
          {pathSuggestions.length > 0 && (
            <div className="dv-json-path-list">
              <span className="dv-section-meta">Copy path</span>
              {pathSuggestions.map((path) => (
                <button
                  key={`${path.jsonataPath}-${path.jsonPath}`}
                  className="dv-json-path-chip"
                  title={`Copy JSONPath ${path.jsonPath}`}
                  onClick={() => void navigator.clipboard.writeText(path.jsonataPath)}
                >
                  {path.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <div className="dv-jsonata-inline">
        <input
          className="dv-input"
          value={expression}
          onChange={(event) => onExpressionChange(event.target.value)}
          placeholder="JSONata expression"
          spellCheck={false}
        />
        <button className="dv-btn-ghost dv-btn-sm" onClick={() => onAddPreviewColumn(column, expression)}>Add Preview Column</button>
      </div>
      <pre className={`dv-jsonata-inline-output ${preview.error ? 'text-danger' : ''}`}>
        {preview.error ? preview.error.message : preview.output}
      </pre>
    </div>
  );
}

function ObjectDetailsPanel({
  structure,
  relationships,
  relationshipsLoading,
  relationshipsError,
  selectedRow,
  highlightedColumn,
  onNavigateRelationship,
  onOpenJoinQuery,
}: {
  structure: TableStructureInfo;
  relationships: TableRelationships | null;
  relationshipsLoading: boolean;
  relationshipsError: string | null;
  selectedRow: Record<string, unknown> | null;
  highlightedColumn: string | null;
  onNavigateRelationship: (relationship: RelationshipInfo) => void;
  onOpenJoinQuery: (relationship: RelationshipInfo) => void;
}) {
  const primaryKeys = new Set(structure.primaryKeys.map((pk) => pk.columnName));
  const foreignKeys = new Map(structure.foreignKeys.map((fk) => [fk.columnName, fk]));

  return (
    <div className="dv-object-detail-stack">
      <div className="dv-object-summary-grid">
        <span><strong>{structure.columns.length}</strong> columns</span>
        <span><strong>{structure.primaryKeys.length}</strong> PK</span>
        <span><strong>{structure.foreignKeys.length}</strong> FK</span>
        <span><strong>{structure.indices.length}</strong> indexes</span>
      </div>

      <section>
        <h4 className="dv-object-detail-title">Columns</h4>
        <div className="dv-object-column-list" role="list">
          {structure.columns.map((column) => {
            const foreignKey = foreignKeys.get(column.columnName);
            return (
                <div className={`dv-object-column ${highlightedColumn === column.columnName ? 'is-highlighted' : ''}`} key={column.columnName} role="listitem">
                <div className="dv-object-column-main">
                  <span className="dv-object-column-name">{column.columnName}</span>
                  <span className="dv-object-column-type">{column.dataType}</span>
                </div>
                <div className="dv-object-column-meta">
                  {primaryKeys.has(column.columnName) && <span className="dv-key-pill">PK</span>}
                  {foreignKey && <span className="dv-key-pill">FK → {foreignKey.foreignTableName}</span>}
                  <span>{column.isNullable === 'YES' ? 'nullable' : 'required'}</span>
                  {column.columnDefault && <span>default</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h4 className="dv-object-detail-title">Indexes</h4>
        {structure.indices.length ? (
          <div className="dv-object-index-list">
            {structure.indices.map((index, i) => {
              const indexRecord = index as Record<string, unknown>;
              return (
                <div className="dv-object-index" key={`${String(indexRecord.indexName ?? 'index')}-${i}`}>
                  <span>{String(indexRecord.indexName ?? 'index')}</span>
                  <small>{String(indexRecord.columnNames ?? indexRecord.columnName ?? '')}</small>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="dv-empty">No indexes.</p>
        )}
      </section>

      <RelationshipExplorer
        relationships={relationships}
        loading={relationshipsLoading}
        error={relationshipsError}
        selectedRow={selectedRow}
        onNavigate={onNavigateRelationship}
        onOpenJoinQuery={onOpenJoinQuery}
      />
    </div>
  );
}

function RelationshipExplorer({
  relationships,
  loading,
  error,
  selectedRow,
  onNavigate,
  onOpenJoinQuery,
}: {
  relationships: TableRelationships | null;
  loading: boolean;
  error: string | null;
  selectedRow: Record<string, unknown> | null;
  onNavigate: (relationship: RelationshipInfo) => void;
  onOpenJoinQuery: (relationship: RelationshipInfo) => void;
}) {
  const outbound = relationships?.outbound ?? [];
  const inbound = relationships?.inbound ?? [];

  return (
    <section>
      <div className="dv-query-toolbar">
        <div>
          <h4 className="dv-object-detail-title">Relationships</h4>
          <p className="dv-section-meta">Outbound {outbound.length} &middot; Inbound {inbound.length}</p>
        </div>
      </div>
      {loading ? (
        <p className="dv-empty dv-empty-tight">Loading relationships...</p>
      ) : error ? (
        <p className="text-danger text-sm">{error}</p>
      ) : outbound.length || inbound.length ? (
        <div className="dv-relationship-stack">
          <RelationshipList
            title="This table references"
            relationships={outbound}
            selectedRow={selectedRow}
            valueColumn="sourceColumn"
            onNavigate={onNavigate}
            onOpenJoinQuery={onOpenJoinQuery}
          />
          <RelationshipList
            title="Referenced by"
            relationships={inbound}
            selectedRow={selectedRow}
            valueColumn="targetColumn"
            onNavigate={onNavigate}
            onOpenJoinQuery={onOpenJoinQuery}
          />
        </div>
      ) : (
        <p className="dv-empty dv-empty-tight">No relationships found.</p>
      )}
      {!selectedRow && (outbound.length || inbound.length) ? (
        <p className="dv-section-meta">Select a row to make relationship navigation apply value filters.</p>
      ) : null}
    </section>
  );
}

function RelationshipList({
  title,
  relationships,
  selectedRow,
  valueColumn,
  onNavigate,
  onOpenJoinQuery,
}: {
  title: string;
  relationships: RelationshipInfo[];
  selectedRow: Record<string, unknown> | null;
  valueColumn: 'sourceColumn' | 'targetColumn';
  onNavigate: (relationship: RelationshipInfo) => void;
  onOpenJoinQuery: (relationship: RelationshipInfo) => void;
}) {
  if (!relationships.length) return null;

  return (
    <div className="dv-relationship-group">
      <h5>{title}</h5>
      {relationships.map((relationship, index) => {
        const rowValue = selectedRow?.[relationship[valueColumn]];
        const hasRowValue = rowValue !== null && rowValue !== undefined;
        return (
          <article className="dv-relationship-card" key={`${relationship.constraintName ?? 'relationship'}-${index}`}>
            <button className="dv-relationship-path" onClick={() => onNavigate(relationship)}>
              <span>{relationship.sourceTable}.{relationship.sourceColumn}</span>
              <span>&rarr;</span>
              <span>{relationship.targetTable}.{relationship.targetColumn}</span>
            </button>
            <div className="dv-relationship-meta">
              {relationship.constraintName && <span>{relationship.constraintName}</span>}
              {relationship.onDelete && <span>delete {relationship.onDelete}</span>}
              {relationship.onUpdate && <span>update {relationship.onUpdate}</span>}
              {hasRowValue && <span>value {formatCellValue(rowValue)}</span>}
            </div>
            <div className="dv-relationship-actions">
              <button className="dv-btn-ghost dv-btn-sm" onClick={() => onNavigate(relationship)}>
                {hasRowValue ? 'Open Filtered' : 'Open Table'}
              </button>
              <button className="dv-btn-ghost dv-btn-sm" onClick={() => onOpenJoinQuery(relationship)}>Open Join</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ── Cell helpers ────────────────────────────────────────── */

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatFormValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function getJsonCellValue(value: unknown): unknown | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function formatJson(value: unknown): string {
  try {
    const formatted = JSON.stringify(value, null, 2);
    return formatted === undefined ? String(value) : formatted;
  } catch {
    return String(value);
  }
}

function formatJsonataError(err: unknown): JsonataErrorInfo {
  if (!err || typeof err !== 'object') {
    return { message: 'JSONata evaluation failed.' };
  }

  const details = err as Record<string, unknown>;
  const message = details.message;

  return {
    message: typeof message === 'string' && message ? message : 'JSONata evaluation failed.',
    code: typeof details.code === 'string' ? details.code : undefined,
    position: typeof details.position === 'number' ? details.position : undefined,
    token: typeof details.token === 'string' ? details.token : undefined,
    value: details.value === undefined ? undefined : formatJson(details.value),
  };
}

function toJsonPathKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function toJsonataPathKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `.\`${key.replace(/`/g, '``')}\``;
}

function getJsonPathSuggestions(value: unknown): JsonPathSuggestion[] {
  const suggestions: JsonPathSuggestion[] = [];
  const addSuggestion = (label: string, jsonataPath: string, jsonPath: string) => {
    suggestions.push({ label, jsonataPath, jsonPath });
  };

  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item, index) => {
      const arrayJsonataPath = `[${index}]`;
      const arrayJsonPath = `$[${index}]`;
      addSuggestion(arrayJsonataPath, arrayJsonataPath, arrayJsonPath);
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        Object.keys(item as Record<string, unknown>).slice(0, 8).forEach((key) => {
          addSuggestion(`${arrayJsonataPath}${toJsonataPathKey(key)}`, `${arrayJsonataPath}${toJsonataPathKey(key)}`, `${arrayJsonPath}${toJsonPathKey(key)}`);
        });
      }
    });
    return suggestions;
  }

  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).slice(0, 20).forEach(([key, nestedValue]) => {
      const jsonataPath = key;
      const jsonPath = `$${toJsonPathKey(key)}`;
      addSuggestion(jsonataPath, jsonataPath, jsonPath);
      if (nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
        Object.keys(nestedValue as Record<string, unknown>).slice(0, 8).forEach((nestedKey) => {
          addSuggestion(`${jsonataPath}${toJsonataPathKey(nestedKey)}`, `${jsonataPath}${toJsonataPathKey(nestedKey)}`, `${jsonPath}${toJsonPathKey(nestedKey)}`);
        });
      }
    });
  }

  return suggestions;
}

async function evaluateJsonataPreview(value: unknown, expression: string): Promise<{ output: string; error?: JsonataErrorInfo }> {
  try {
    const result = await jsonata(expression || '$').evaluate(value);
    return { output: formatJson(result) };
  } catch (err) {
    return { output: '', error: formatJsonataError(err) };
  }
}

function renderCell(
  value: unknown,
  column?: string,
  rowIndex?: number,
  onOpenJsonCell?: (value: unknown, column: string, rowIndex: number) => void,
) {
  if (value === null || value === undefined) return <span className="dv-cell-null">NULL</span>;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const jsonValue = getJsonCellValue(value);
  if (jsonValue && column !== undefined && rowIndex !== undefined && onOpenJsonCell) {
    const label = Array.isArray(jsonValue) ? `JSON array (${jsonValue.length})` : 'JSON object';
    return (
      <button
        className="dv-json-cell-btn"
        onClick={(event) => {
          event.stopPropagation();
          onOpenJsonCell(jsonValue, column, rowIndex);
        }}
        title="Open JSONata editor"
      >
        <span>{label}</span>
        <small>JSONata</small>
      </button>
    );
  }
  if (jsonValue) return formatJson(jsonValue);
  return String(value);
}

function JsonataModal({ cell, onClose }: { cell: NonNullable<JsonCellModalState>; onClose: () => void }) {
  const jsonValue = useMemo(() => getJsonCellValue(cell.value) ?? cell.value, [cell.value]);
  const [expression, setExpression] = useState('$');
  const [output, setOutput] = useState(formatJson(jsonValue));
  const [error, setError] = useState<JsonataErrorInfo | null>(null);

  const evaluateExpression = useCallback(async () => {
    try {
      setError(null);
      const result = await jsonata(expression || '$').evaluate(jsonValue);
      setOutput(formatJson(result));
    } catch (err) {
      setError(formatJsonataError(err));
    }
  }, [expression, jsonValue]);

  useEffect(() => {
    void evaluateExpression();
  }, [evaluateExpression]);

  return (
    <section className="dv-modal-backdrop" role="dialog" aria-modal="true" aria-label="JSONata editor">
      <div className="dv-modal dv-jsonata-modal">
        <div className="dv-query-toolbar">
          <div className="dv-section-head">
            <h2 className="dv-section-title">JSONata Editor</h2>
            <p className="dv-section-meta">
              {cell.column}{cell.rowIndex !== undefined ? ` · row ${cell.rowIndex + 1}` : ''}
            </p>
          </div>
          <button className="dv-btn-ghost" onClick={onClose}>Close</button>
        </div>

        <label className="dv-modal-field">
          JSONata expression
          <textarea
            className="dv-input dv-jsonata-expression"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void evaluateExpression();
              }
            }}
            spellCheck={false}
          />
        </label>

        {error && (
          <div className="dv-jsonata-error" role="alert">
            <p className="dv-state-text text-danger">{error.message}</p>
            {(error.code || error.position !== undefined || error.token || error.value) && (
              <dl>
                {error.code && <><dt>Code</dt><dd>{error.code}</dd></>}
                {error.position !== undefined && <><dt>Position</dt><dd>{error.position}</dd></>}
                {error.token && <><dt>Token</dt><dd>{error.token}</dd></>}
                {error.value && <><dt>Value</dt><dd>{error.value}</dd></>}
              </dl>
            )}
          </div>
        )}

        <div className="dv-jsonata-grid">
          <section>
            <div className="dv-pane-header">
              <h3 className="dv-section-title">Input JSON</h3>
            </div>
            <Editor
              height="360px"
              defaultLanguage="json"
              value={formatJson(jsonValue)}
              theme="vs-dark"
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }}
            />
          </section>
          <section>
            <div className="dv-pane-header">
              <h3 className="dv-section-title">JSONata Result</h3>
              <button className="dv-btn-ghost dv-btn-sm" onClick={() => void navigator.clipboard.writeText(output)}>Copy</button>
            </div>
            <Editor
              height="360px"
              defaultLanguage="json"
              value={output}
              theme="vs-dark"
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }}
            />
          </section>
        </div>

        <div className="dv-modal-actions">
          <button className="dv-btn-ghost" onClick={() => setExpression('$')}>Reset</button>
          <span className="dv-section-meta">Expression evaluates as you type.</span>
        </div>
      </div>
    </section>
  );
}
