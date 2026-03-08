import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import Editor from '@monaco-editor/react';
import {
  createDatavoreApi,
  DatabaseInfo,
  TableInfo,
  TableStructureInfo,
} from '@onivoro/axios-datavore';

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

const DEFAULT_QUERY = 'SELECT * FROM table_name LIMIT 100;';
const DENSITY_STORAGE_KEY = 'datavore-density-mode';

export function App() {
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [dbInfoError, setDbInfoError] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [tablesLoading, setTablesLoading] = useState(true);
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
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [density, setDensity] = useState<DensityMode>(() => {
    const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
    return saved === 'compact' ? 'compact' : 'comfortable';
  });
  const editorRef = useRef<any>(null);
  const tableListRef = useRef<HTMLDivElement | null>(null);

  const connectionKey = useMemo(() => {
    if (!dbInfo) return 'default';
    return `${dbInfo.type}:${dbInfo.databaseName ?? 'db'}`;
  }, [dbInfo]);

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
    const saved = localStorage.getItem(`datavore-query:${connectionKey}`);
    if (saved) setQuery(saved);
  }, [connectionKey]);

  useEffect(() => {
    localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  const selectTable = async (tableName: string) => {
    setSelectedTable(tableName);
    setActiveTab('data');
    setResult(null);
    setResultError(null);
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

  const focusSelectedTable = useCallback(() => {
    if (!tableListRef.current || !tables.length) return;
    const selectedIndex = tables.findIndex((table) => table.tableName === selectedTable);
    const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const target = tableListRef.current.querySelector<HTMLButtonElement>(`button[data-table-idx="${targetIndex}"]`);
    target?.focus();
  }, [selectedTable, tables]);

  const getQueryToExecute = useCallback(() => {
    if (!editorRef.current) return query;
    const selection = editorRef.current.getSelection?.();
    if (selection && typeof selection.isEmpty === 'function' && !selection.isEmpty()) {
      const selectedQuery = editorRef.current.getModel?.()?.getValueInRange?.(selection) ?? '';
      if (selectedQuery.trim()) return selectedQuery;
    }
    return editorRef.current.getValue?.() ?? query;
  }, [query]);

  const executeQuery = useCallback(async () => {
    if (executing) return;
    const queryToExecute = getQueryToExecute();
    if (!queryToExecute.trim()) return;

    setActiveTab('data');
    setResult(null);
    setResultError(null);
    setExecuting(true);
    const id = `q-${Date.now()}`;
    setQueryId(id);

    try {
      const { data } = await api.executeQuery(queryToExecute, id);
      setResult(data);
      localStorage.setItem(`datavore-query:${connectionKey}`, query);
    } catch (error) {
      setResult({ rows: [], rowCount: 0, elapsedMs: 0 });
      setResultError(getErrorMessage(error, 'Failed to execute query.'));
    } finally {
      setExecuting(false);
      setQueryId(null);
      focusEditor();
    }
  }, [connectionKey, executing, focusEditor, getQueryToExecute, query]);

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
        focusSelectedTable();
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
  }, [focusEditor, focusSelectedTable]);

  const handleTableNav = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, tableName: string) => {
      const currentIndex = tables.findIndex((table) => table.tableName === tableName);
      if (currentIndex < 0) return;

      const focusTableByIndex = (index: number) => {
        const target = tables[index];
        if (!target || !tableListRef.current) return;
        const button = tableListRef.current.querySelector<HTMLButtonElement>(`button[data-table-idx="${index}"]`);
        button?.focus();
      };

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusTableByIndex(Math.min(currentIndex + 1, tables.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusTableByIndex(Math.max(currentIndex - 1, 0));
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusTableByIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusTableByIndex(tables.length - 1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void selectTable(tableName);
      }
    },
    [tables],
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
          <h2 className="dv-section-title">Tables</h2>
          <p className="dv-section-meta">{tables.length.toLocaleString()} total</p>
        </div>

        <div className="space-y-2" ref={tableListRef} role="listbox" aria-label="Database tables">
          {tablesLoading && <p className="dv-empty">Loading tables...</p>}
          {tablesError && (
            <div className="dv-state dv-state-error">
              <p>{tablesError}</p>
              <button className="dv-btn-ghost mt-3" onClick={() => void loadTables()}>
                Retry
              </button>
            </div>
          )}
          {!tablesLoading && !tablesError && tables.length === 0 && (
            <p className="dv-empty">No tables available.</p>
          )}
          {!tablesLoading &&
            !tablesError &&
            tables.map((table, idx) => (
              <button
                key={table.tableName}
                className={`dv-input text-left ${selectedTable === table.tableName ? 'ring-1 ring-accent' : ''}`}
                onClick={() => void selectTable(table.tableName)}
                onKeyDown={(event) => handleTableNav(event, table.tableName)}
                data-table-idx={idx}
                role="option"
                aria-selected={selectedTable === table.tableName}
              >
                {table.tableName}
              </button>
            ))}
        </div>
      </aside>

      <main className="dv-main">
        <section className="dv-card dv-card-pad dv-query-section">
          <div className="dv-query-toolbar">
            <div className="dv-section-head">
              <h2 className="dv-section-title">SQL Query</h2>
              <p className="dv-section-meta">Cmd/Ctrl+Enter runs selected SQL</p>
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
                  setQuery('');
                  focusEditor();
                }}
              >
                Clear
              </button>
              {!executing ? (
                <button className="dv-btn" onClick={() => void executeQuery()}>Run</button>
              ) : (
                <button className="dv-btn-danger" onClick={() => void cancelQuery()}>Cancel</button>
              )}
            </div>
          </div>

          <div className="dv-editor-shell">
            <Editor
              height={density === 'compact' ? '220px' : '260px'}
              defaultLanguage="sql"
              value={query}
              onChange={(v) => setQuery(v ?? '')}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                editor.focus();
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                  void executeQuery();
                });
              }}
            />
          </div>
          {executing && <p className="dv-state-text">Executing query...</p>}
          {resultError && <p className="dv-state-text text-danger">{resultError}</p>}
          {result && (
            <p className="text-xs text-subtle">
              {result.rowCount.toLocaleString()} rows • {result.elapsedMs}ms
            </p>
          )}
        </section>

        <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as 'data' | 'structure')}>
          <Tabs.List className="dv-tab-list">
            <Tabs.Trigger className="dv-tab" value="data">Data</Tabs.Trigger>
            <Tabs.Trigger className="dv-tab" value="structure">Structure</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="data" className="dv-card dv-card-pad">
            {tableDataLoading ? (
              <p className="dv-empty">Loading table data...</p>
            ) : executing ? (
              <p className="dv-empty">Executing query...</p>
            ) : tableDataError ? (
              <p className="text-danger text-sm">{tableDataError}</p>
            ) : resultError ? (
              <p className="text-danger text-sm">{resultError}</p>
            ) : result?.error ? (
              <p className="text-danger text-sm">{result.error}</p>
            ) : result ? (
              <DataTable rows={result.rows} rowCount={result.rowCount} density={density} />
            ) : selectedTable ? (
              <DataTable rows={tableData} density={density} />
            ) : (
              <p className="dv-empty">Select a table or run a query.</p>
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
  if (!rows?.length) return <p className="dv-empty">No rows</p>;
  const columns = Object.keys(rows[0] ?? {});
  const totalRows = rowCount ?? rows.length;

  return (
    <div className="dv-table-shell" data-density={density}>
      <table className="dv-table">
        <thead>
          <tr>
            <th className="dv-table-index">#</th>
            {columns.map((column) => (
              <th key={column} className="text-left">{column}</th>
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
      <p className="dv-table-footer">{totalRows.toLocaleString()} rows</p>
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
