import { useEffect, useMemo, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import Editor from '@monaco-editor/react';
import {
  createDatavoreApi,
  DatabaseInfo,
  TableInfo,
  TableStructureInfo,
} from '@onivoro/axios-datavore';

const api = createDatavoreApi('');

type ResultState = {
  rows: any[];
  rowCount: number;
  elapsedMs: number;
  error?: string;
};

const DEFAULT_QUERY = 'SELECT * FROM table_name LIMIT 100;';

export function App() {
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'data' | 'structure'>('data');
  const [tableData, setTableData] = useState<any[]>([]);
  const [structure, setStructure] = useState<TableStructureInfo | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [query, setQuery] = useState(DEFAULT_QUERY);

  const connectionKey = useMemo(() => {
    if (!dbInfo) return 'default';
    return `${dbInfo.type}:${dbInfo.databaseName ?? 'db'}`;
  }, [dbInfo]);

  useEffect(() => {
    api.getDatabaseInfo().then(({ data }) => setDbInfo(data)).catch(() => null);
    api.getTables().then(({ data }) => setTables(data));
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(`datavore-query:${connectionKey}`);
    if (saved) setQuery(saved);
  }, [connectionKey]);

  const selectTable = async (tableName: string) => {
    setSelectedTable(tableName);
    setActiveTab('data');
    setLoading(true);
    try {
      const [dataRes, structureRes] = await Promise.all([
        api.getTableData(tableName),
        api.getTableStructure(tableName),
      ]);
      setTableData(dataRes.data);
      setStructure(structureRes.data);
    } finally {
      setLoading(false);
    }
  };

  const executeQuery = async () => {
    if (!query.trim() || executing) return;
    setExecuting(true);
    const id = `q-${Date.now()}`;
    setQueryId(id);

    try {
      const { data } = await api.executeQuery(query, id);
      setResult(data);
      setActiveTab('data');
      localStorage.setItem(`datavore-query:${connectionKey}`, query);
    } finally {
      setExecuting(false);
      setQueryId(null);
    }
  };

  const cancelQuery = async () => {
    if (!queryId) return;
    const { data } = await api.cancelQuery(queryId);
    if (data.cancelled) {
      setExecuting(false);
      setResult({ rows: [], rowCount: 0, elapsedMs: 0, error: 'Query cancelled' });
      setQueryId(null);
    }
  };

  return (
    <div className="dv-shell">
      <aside className="dv-sidebar">
        <div className="mb-4">
          <h1 className="text-lg font-semibold">DataVore</h1>
          <p className="text-xs text-subtle mt-1">
            {dbInfo ? `${dbInfo.type} / ${dbInfo.databaseName ?? 'unknown'}` : 'connecting...'}
          </p>
        </div>

        <div className="space-y-2">
          {tables.map((table) => (
            <button
              key={table.tableName}
              className={`dv-input text-left ${selectedTable === table.tableName ? 'ring-1 ring-accent' : ''}`}
              onClick={() => selectTable(table.tableName)}
            >
              {table.tableName}
            </button>
          ))}
        </div>
      </aside>

      <main className="dv-main space-y-4">
        <section className="dv-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-subtle uppercase tracking-wide">SQL Query</h2>
            <div className="flex gap-2">
              <button className="dv-btn-ghost" onClick={() => setQuery('')}>Clear</button>
              {!executing ? (
                <button className="dv-btn" onClick={executeQuery}>Run ⌘↵</button>
              ) : (
                <button className="dv-btn-danger" onClick={cancelQuery}>Cancel</button>
              )}
            </div>
          </div>

          <div className="h-64 border rounded-md overflow-hidden bg-[#11151d]">
            <Editor
              height="100%"
              defaultLanguage="sql"
              value={query}
              onChange={(v) => setQuery(v ?? '')}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
              onMount={(editor, monaco) => {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, executeQuery);
              }}
            />
          </div>
          {result && (
            <p className="text-xs text-subtle">
              {result.rowCount.toLocaleString()} rows • {result.elapsedMs}ms
            </p>
          )}
        </section>

        <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as 'data' | 'structure')}>
          <Tabs.List className="flex gap-2 mb-3">
            <Tabs.Trigger className="dv-tab" value="data">Data</Tabs.Trigger>
            <Tabs.Trigger className="dv-tab" value="structure">Structure</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="data" className="dv-card p-4">
            {loading ? (
              <p className="dv-empty">Loading data…</p>
            ) : result?.error ? (
              <p className="text-danger text-sm">{result.error}</p>
            ) : result ? (
              <DataTable rows={result.rows} />
            ) : selectedTable ? (
              <DataTable rows={tableData} />
            ) : (
              <p className="dv-empty">Select a table or run a query.</p>
            )}
          </Tabs.Content>

          <Tabs.Content value="structure" className="dv-card p-4">
            {structure ? <StructurePanel structure={structure} /> : <p className="dv-empty">No structure loaded.</p>}
          </Tabs.Content>
        </Tabs.Root>
      </main>
    </div>
  );
}

function DataTable({ rows }: { rows: any[] }) {
  if (!rows?.length) return <p className="dv-empty">No rows</p>;
  const columns = Object.keys(rows[0]);

  return (
    <div className="overflow-auto border rounded-md">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-muted text-subtle">
          <tr>
            {columns.map((column) => (
              <th key={column} className="text-left p-2 border-b">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/60">
              {columns.map((column) => (
                <td
                  key={column}
                  className="p-2 font-mono text-xs"
                  title="Click to copy"
                  onClick={() => navigator.clipboard.writeText(String(row[column] ?? ''))}
                >
                  {renderCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StructurePanel({ structure }: { structure: TableStructureInfo }) {
  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="font-semibold mb-2">Columns</h3>
        <DataTable rows={structure.columns} />
      </section>

      {!!structure.primaryKeys.length && (
        <section>
          <h3 className="font-semibold mb-2">Primary Keys</h3>
          <DataTable rows={structure.primaryKeys} />
        </section>
      )}

      {!!structure.foreignKeys.length && (
        <section>
          <h3 className="font-semibold mb-2">Foreign Keys</h3>
          <DataTable rows={structure.foreignKeys} />
        </section>
      )}

      {!!structure.indices.length && (
        <section>
          <h3 className="font-semibold mb-2">Indexes</h3>
          <DataTable rows={structure.indices} />
        </section>
      )}
    </div>
  );
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
