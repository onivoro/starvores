import axios, { AxiosInstance } from 'axios';

export interface TableInfo {
  tableName: string;
}

export interface TableStructureInfo {
  columns: Array<{ columnName: string; dataType: string; isNullable: string; columnDefault: string | null }>;
  primaryKeys: Array<{ columnName: string }>;
  foreignKeys: Array<{ columnName: string; foreignTableName: string; foreignColumnName: string; constraintName: string }>;
  indices: Array<{ indexName: string; columnName: string; isUnique: boolean }>;
}

export interface QueryResponse {
  rows: any[];
  rowCount: number;
  elapsedMs: number;
  error?: string;
}

export interface DatabaseInfo {
  type: string;
  isConnected: boolean;
  databaseName?: string;
}

export interface QueryJsonlExportRequest {
  query: string;
  queryId: string;
  limit?: number;
  includeMetadataHeader?: boolean;
  filename?: string;
}

export interface QueryJsonlExportError {
  code?: string;
  message?: string;
  details?: unknown;
}

export class DatavoreApi {
  constructor(private readonly http: AxiosInstance) {}

  getDatabaseInfo() {
    return this.http.get<DatabaseInfo>('/api/tables/debug/info');
  }

  getTables() {
    return this.http.get<TableInfo[]>('/api/tables');
  }

  getTableData(tableName: string) {
    return this.http.get<any[]>(`/api/table/${encodeURIComponent(tableName)}`);
  }

  getTableStructure(tableName: string) {
    return this.http.get<TableStructureInfo>(`/api/table/${encodeURIComponent(tableName)}/structure`);
  }

  executeQuery(query: string, queryId?: string) {
    return this.http.post<QueryResponse>('/api/query', { query, queryId });
  }

  streamQueryJsonl(request: QueryJsonlExportRequest, signal?: AbortSignal): Promise<Response> {
    return fetch(this.resolveApiPath('/api/query/export/jsonl'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
      credentials: 'same-origin',
    });
  }

  cancelQuery(queryId: string) {
    return this.http.post<{ cancelled: boolean }>('/api/query/cancel', { queryId });
  }

  private resolveApiPath(path: string): string {
    const baseURL = this.http.defaults.baseURL;
    if (!baseURL) return path;
    try {
      return new URL(path, baseURL).toString();
    } catch {
      return path;
    }
  }
}

export const createDatavoreApi = (baseURL = '') => {
  const http = axios.create({ baseURL });
  return new DatavoreApi(http);
};
