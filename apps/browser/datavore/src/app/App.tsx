import { useEffect, useMemo, useState } from 'react';
import { createDatavoreApi, TableInfo, TableStructureInfo } from '@onivoro/axios-datavore';

const api = createDatavoreApi('');

export function App() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableData, setTableData] = useState<any[]>([]);
  const [structure, setStructure] = useState<TableStructureInfo | null>(null);
  const [query, setQuery] = useState('SELECT * FROM table_name LIMIT 100;');
  const [queryRows, setQueryRows] = useState<any[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getTables()
      .then((res) => setTables(res.data))
      .catch((e) => setError(e?.message || 'Failed to load tables'));
  }, []);

  const columns = useMemo(() => (tableData.length ? Object.keys(tableData[0]) : []), [tableData]);

  const selectTable = async (tableName: string) => {
    setSelectedTable(tableName);
    setError('');
    setLoading(true);
    try {
      const [dataRes, structureRes] = await Promise.all([
        api.getTableData(tableName),
        api.getTableStructure(tableName),
      ]);
      setTableData(dataRes.data);
      setStructure(structureRes.data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load table details');
    } finally {
      setLoading(false);
    }
  };

  const executeQuery = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.executeQuery(query);
      setQueryRows(res.data.rows || []);
      setRowCount(res.data.rowCount || 0);
      setElapsedMs(res.data.elapsedMs || 0);
      if (res.data.error) setError(res.data.error);
    } catch (e: any) {
      setError(e?.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  const queryColumns = queryRows.length ? Object.keys(queryRows[0]) : [];

  return (
    <div className="page">
      <aside className="sidebar">
        <h2>Tables</h2>
        {tables.map((table) => (
          <button
            key={table.tableName}
            className={selectedTable === table.tableName ? 'table active' : 'table'}
            onClick={() => selectTable(table.tableName)}
          >
            {table.tableName}
          </button>
        ))}
      </aside>
      <main className="main">
        <h1>DataVore</h1>
        <section className="query">
          <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={8} />
          <button onClick={executeQuery} disabled={loading}>Run Query</button>
          {!!queryRows.length && <p>{rowCount} rows in {elapsedMs}ms</p>}
          {queryRows.length > 0 && <DataTable columns={queryColumns} rows={queryRows} />}
        </section>

        {selectedTable && (
          <section>
            <h2>{selectedTable}</h2>
            {loading ? <p>Loading…</p> : <DataTable columns={columns} rows={tableData} />}
            {structure && (
              <div className="structure">
                <h3>Structure</h3>
                <ul>
                  {structure.columns.map((col) => (
                    <li key={col.columnName}>{col.columnName} — {col.dataType}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {error && <div className="error">{error}</div>}
      </main>
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: any[] }) {
  if (!rows.length) return <p>No rows</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((column) => <td key={column}>{String(row[column] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
