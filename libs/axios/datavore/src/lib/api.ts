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

  cancelQuery(queryId: string) {
    return this.http.post<{ cancelled: boolean }>('/api/query/cancel', { queryId });
  }
}

export const createDatavoreApi = (baseURL = '') => {
  const http = axios.create({ baseURL });
  return new DatavoreApi(http);
};
