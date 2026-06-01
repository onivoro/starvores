import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface TableInfo {
  tableName: string;
}

export interface SchemaObjectInfo {
  name: string;
  schema: string;
  type?: string;
}

export interface DatabaseSchemaObjects {
  views: SchemaObjectInfo[];
  functions: SchemaObjectInfo[];
  sequences: SchemaObjectInfo[];
}

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: string;
  columnDefault: string | null;
}

export interface PrimaryKeyInfo {
  columnName: string;
}

export interface ForeignKeyInfo {
  columnName: string;
  foreignTableName: string;
  foreignColumnName: string;
  constraintName: string;
}

export interface IndexInfo {
  indexName: string;
  columnName: string;
  isUnique: boolean;
}

export interface TableStructureInfo {
  columns: ColumnInfo[];
  primaryKeys: PrimaryKeyInfo[];
  foreignKeys: ForeignKeyInfo[];
  indices: IndexInfo[];
}

export interface DatabaseInfo {
  type: string;
  isConnected: boolean;
  databaseName?: string;
  host?: string;
  port?: number;
  username?: string;
  connectionKey?: string;
}

@Injectable()
export class DatabaseSchemaService {

  /**
   * Get database information for debugging
   */
  async getDatabaseInfo(dataSource: DataSource): Promise<DatabaseInfo> {
    try {
      const dbType = dataSource.options.type;
      const isConnected = dataSource.isInitialized;
      const options = dataSource.options as any;
      const databaseName = options.database;
      const host = options.host;
      const port = options.port;
      const username = options.username;

      const normalizedHost = host || 'localhost';
      const normalizedPort = typeof port === 'number' ? port : undefined;
      const normalizedUser = username || 'user';
      const normalizedDatabase = databaseName || 'db';
      const connectionKey = [dbType || 'unknown', normalizedHost, String(normalizedPort ?? ''), normalizedDatabase, normalizedUser].join(':');

      return {
        type: dbType,
        isConnected,
        databaseName,
        host,
        port: normalizedPort,
        username,
        connectionKey,
      };
    } catch (error) {
      return {
        type: 'unknown',
        isConnected: false
      };
    }
  }

  /**
   * Get list of tables in the database
   */
  async getTables(dataSource: DataSource): Promise<TableInfo[]> {
    const dbType = this.getDatabaseType(dataSource);
    console.info(`Getting tables for database type: ${dbType}`);

    const query = this.getTableListQuery(dbType);
    const tables = await dataSource.query(query);

    return tables.map(table => ({
      tableName: this.getRowValue(table, 'table_name', 'TABLE_NAME', 'name')
    }));
  }

  /**
   * Get data from a specific table
   */
  async getTableData(dataSource: DataSource, tableName: string): Promise<any[]> {
    const dbType = this.getDatabaseType(dataSource);
    console.info(`Getting table data for: ${tableName} (database type: ${dbType})`);

    const query = this.getTableDataQuery(dbType, tableName);
    return await dataSource.query(query);
  }

  /**
   * Get table structure information (columns, keys, indices)
   */
  async getTableStructure(dataSource: DataSource, tableName: string): Promise<TableStructureInfo> {
    const dbType = this.getDatabaseType(dataSource);
    console.info(`Getting table structure for: ${tableName} (database type: ${dbType})`);

    if (dbType === 'sqlite') {
      return this.getSqliteTableStructure(dataSource, tableName);
    }

    const [columns, primaryKeys, foreignKeys, indices] = await Promise.all([
      dataSource.query(this.getColumnsQuery(dbType), [tableName]),
      dataSource.query(this.getPrimaryKeysQuery(dbType), [tableName]),
      dataSource.query(this.getForeignKeysQuery(dbType), [tableName]),
      dataSource.query(this.getIndicesQuery(dbType), [tableName])
    ]);

    console.info('Raw columns result:', JSON.stringify(columns.slice(0, 2)));
    console.info('Raw primaryKeys result:', JSON.stringify(primaryKeys.slice(0, 2)));

    return {
      columns: columns.map(col => {
        const mapped = {
          columnName: this.getRowValue(col, 'column_name', 'COLUMN_NAME'),
          dataType: this.getRowValue(col, 'data_type', 'DATA_TYPE'),
          isNullable: this.getRowValue(col, 'is_nullable', 'IS_NULLABLE'),
          columnDefault: this.getRowValue(col, 'column_default', 'COLUMN_DEFAULT') ?? null
        };
        console.info('Mapping column:', JSON.stringify(col), '->', JSON.stringify(mapped));
        return mapped;
      }),
      primaryKeys: primaryKeys.map(pk => ({
        columnName: this.getRowValue(pk, 'column_name', 'COLUMN_NAME')
      })),
      foreignKeys: foreignKeys.map(fk => ({
        columnName: this.getRowValue(fk, 'column_name', 'COLUMN_NAME'),
        foreignTableName: this.getRowValue(fk, 'foreign_table_name', 'FOREIGN_TABLE_NAME'),
        foreignColumnName: this.getRowValue(fk, 'foreign_column_name', 'FOREIGN_COLUMN_NAME'),
        constraintName: this.getRowValue(fk, 'constraint_name', 'CONSTRAINT_NAME')
      })),
      indices: indices.map(idx => ({
        indexName: this.getRowValue(idx, 'index_name', 'INDEX_NAME'),
        columnName: this.getRowValue(idx, 'column_name', 'COLUMN_NAME'),
        isUnique: this.toBoolean(this.getRowValue(idx, 'is_unique', 'IS_UNIQUE'))
      }))
    };
  }

  /**
   * Discover non-table schema objects for the sidebar/intellisense.
   */
  async getSchemaObjects(dataSource: DataSource): Promise<DatabaseSchemaObjects> {
    const dbType = this.getDatabaseType(dataSource);
    console.info(`Discovering schema objects for database type: ${dbType}`);

    const viewsQuery = this.getSchemaViewsQuery(dbType);
    const functionsQuery = this.getSchemaFunctionsQuery(dbType);
    const sequencesQuery = this.getSchemaSequencesQuery(dbType);

    const [views, functions, sequences] = await Promise.all([
      this.querySchemaObjects(dataSource, viewsQuery),
      functionsQuery ? this.querySchemaObjects(dataSource, functionsQuery) : Promise.resolve([]),
      sequencesQuery ? this.querySchemaObjects(dataSource, sequencesQuery) : Promise.resolve([]),
    ]);

    return {
      views: this.mapSchemaObjects(views),
      functions: this.mapSchemaObjects(functions),
      sequences: this.mapSchemaObjects(sequences),
    };
  }

  /**
   * Execute a custom query
   */
  async executeQuery(dataSource: DataSource, query: string): Promise<any[]> {
    const result = await dataSource.query(query);
    return Array.isArray(result) ? result : [];
  }

  // Private helper methods for database-specific queries
  private getTableListQuery(dbType: string): string {
    if (this.isMysqlFamily(dbType)) {
      return `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;
    }

    switch (dbType) {
      case 'postgres':
        return `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `;
      case 'sqlite':
        return `
          SELECT name AS table_name
          FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `;
      default:
        return `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
            AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `;
    }
  }

  private getTableDataQuery(dbType: string, tableName: string): string {
    const escaped = this.escapeIdentifier(dbType, tableName);
    return `SELECT * FROM ${escaped} LIMIT 100`;
  }

  private escapeIdentifier(dbType: string, identifier: string): string {
    if (this.isMysqlFamily(dbType)) {
      return `\`${identifier.replace(/`/g, '``')}\``;
    }

    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private getColumnsQuery(dbType: string): string {
    if (this.isMysqlFamily(dbType)) {
      return `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = ? AND table_schema = DATABASE()
        ORDER BY ordinal_position
      `;
    }

    switch (dbType) {
      case 'postgres':
        return `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `;
      default:
        return `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_name = ?
          ORDER BY ordinal_position
        `;
    }
  }

  private getPrimaryKeysQuery(dbType: string): string {
    if (this.isMysqlFamily(dbType)) {
      return `
        SELECT column_name
        FROM information_schema.key_column_usage
        WHERE table_name = ?
          AND table_schema = DATABASE()
          AND constraint_name = 'PRIMARY'
        ORDER BY ordinal_position
      `;
    }

    switch (dbType) {
      case 'postgres':
        return `
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_name = $1
            AND tc.table_schema = 'public'
          ORDER BY kcu.ordinal_position
        `;
      default:
        return `SELECT column_name FROM information_schema.key_column_usage WHERE table_name = ? AND constraint_name = 'PRIMARY'`;
    }
  }

  private getForeignKeysQuery(dbType: string): string {
    if (this.isMysqlFamily(dbType)) {
      return `
        SELECT
          kcu.column_name,
          kcu.referenced_table_name AS foreign_table_name,
          kcu.referenced_column_name AS foreign_column_name,
          kcu.constraint_name
        FROM information_schema.key_column_usage kcu
        WHERE kcu.table_name = ?
          AND kcu.table_schema = DATABASE()
          AND kcu.referenced_table_name IS NOT NULL
      `;
    }

    switch (dbType) {
      case 'postgres':
        return `
          SELECT
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            tc.constraint_name
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = $1
            AND tc.table_schema = 'public'
        `;
      default:
        return `SELECT '' AS column_name, '' AS foreign_table_name, '' AS foreign_column_name, '' AS constraint_name WHERE 1=0`;
    }
  }

  private getIndicesQuery(dbType: string): string {
    if (this.isMysqlFamily(dbType)) {
      return `
        SELECT
          index_name,
          column_name,
          CASE WHEN non_unique = 0 THEN true ELSE false END AS is_unique
        FROM information_schema.statistics
        WHERE table_name = ?
          AND table_schema = DATABASE()
          AND index_name != 'PRIMARY'
        ORDER BY index_name, seq_in_index
      `;
    }

    switch (dbType) {
      case 'postgres':
        return `
          SELECT
            i.relname AS index_name,
            a.attname AS column_name,
            ix.indisunique AS is_unique,
            ix.indisprimary AS is_primary
          FROM pg_class t
          JOIN pg_index ix ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
          WHERE t.relname = $1
            AND t.relkind = 'r'
            AND NOT ix.indisprimary
          ORDER BY i.relname, a.attname
        `;
      default:
        return `SELECT '' AS index_name, '' AS column_name, false AS is_unique WHERE 1=0`;
    }
  }

  private getSchemaViewsQuery(dbType: string): string {
    if (this.isMysqlFamily(dbType)) {
      return `
        SELECT table_name AS name, table_schema AS \`schema\`
        FROM information_schema.views
        WHERE table_schema = DATABASE()
        ORDER BY table_name
      `;
    }

    if (dbType === 'sqlite') {
      return `
        SELECT name AS name, 'main' AS schema
        FROM sqlite_master
        WHERE type = 'view' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `;
    }

    if (dbType === 'postgres') {
      return `
        SELECT table_name AS name, table_schema AS schema
        FROM information_schema.views
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
      `;
    }

    return `
      SELECT table_name AS name, table_schema AS schema
      FROM information_schema.views
      WHERE table_schema NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
      ORDER BY table_schema, table_name
    `;
  }

  private getSchemaFunctionsQuery(dbType: string): string | null {
    if (this.isMysqlFamily(dbType)) {
      return `
        SELECT routine_name AS name, routine_schema AS \`schema\`, routine_type AS type
        FROM information_schema.routines
        WHERE routine_schema = DATABASE()
        ORDER BY routine_name
      `;
    }

    if (dbType === 'sqlite') {
      return null;
    }

    if (dbType === 'postgres') {
      return `
        SELECT routine_name AS name, routine_schema AS schema, routine_type AS type
        FROM information_schema.routines
        WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY routine_schema, routine_name
      `;
    }

    return `
      SELECT routine_name AS name, routine_schema AS schema, routine_type AS type
      FROM information_schema.routines
      WHERE routine_schema NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
      ORDER BY routine_schema, routine_name
    `;
  }

  private getSchemaSequencesQuery(dbType: string): string | null {
    if (this.isMysqlFamily(dbType)) {
      return null;
    }

    if (dbType === 'sqlite') {
      return null;
    }

    if (dbType === 'postgres') {
      return `
        SELECT sequence_name AS name, sequence_schema AS schema
        FROM information_schema.sequences
        WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY sequence_schema, sequence_name
      `;
    }

    return `
      SELECT sequence_name AS name, sequence_schema AS schema
      FROM information_schema.sequences
      WHERE sequence_schema NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
      ORDER BY sequence_schema, sequence_name
    `;
  }

  private async querySchemaObjects(dataSource: DataSource, query: string): Promise<any[]> {
    try {
      const rows = await dataSource.query(query);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      console.warn('Schema discovery query failed:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  private mapSchemaObjects(rows: any[]): SchemaObjectInfo[] {
    return rows.map(row => ({
      name: this.getRowValue(row, 'name', 'NAME'),
      schema: this.getRowValue(row, 'schema', 'SCHEMA'),
      type: this.getRowValue(row, 'type', 'TYPE'),
    })).filter(item => item.name && item.schema);
  }

  private getDatabaseType(dataSource: DataSource): string {
    return String(dataSource.options.type || '');
  }

  private isMysqlFamily(dbType: string): boolean {
    return dbType === 'mysql' || dbType === 'mariadb' || dbType === 'aurora-mysql';
  }

  private getRowValue(row: Record<string, any>, ...keys: string[]): any {
    for (const key of keys) {
      if (row[key] !== undefined) return row[key];
    }

    return undefined;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
    return false;
  }

  private async getSqliteTableStructure(dataSource: DataSource, tableName: string): Promise<TableStructureInfo> {
    const escapedTableName = this.escapeIdentifier('sqlite', tableName);
    const columns = await dataSource.query(`PRAGMA table_info(${escapedTableName})`);
    const foreignKeys = await dataSource.query(`PRAGMA foreign_key_list(${escapedTableName})`);
    const indexRows = await dataSource.query(`PRAGMA index_list(${escapedTableName})`);

    const indices = (await Promise.all(
      indexRows
        .filter(index => index.origin !== 'pk')
        .map(async index => {
          const indexColumns = await dataSource.query(`PRAGMA index_info(${this.escapeIdentifier('sqlite', index.name)})`);
          return indexColumns.map(indexColumn => ({
            indexName: index.name,
            columnName: indexColumn.name,
            isUnique: this.toBoolean(index.unique),
          }));
        }),
    )).flat();

    return {
      columns: columns.map(col => ({
        columnName: col.name,
        dataType: col.type || '',
        isNullable: this.toBoolean(col.notnull) ? 'NO' : 'YES',
        columnDefault: col.dflt_value ?? null,
      })),
      primaryKeys: columns
        .filter(col => Number(col.pk) > 0)
        .sort((a, b) => Number(a.pk) - Number(b.pk))
        .map(col => ({ columnName: col.name })),
      foreignKeys: foreignKeys.map((fk, index) => ({
        columnName: fk.from,
        foreignTableName: fk.table,
        foreignColumnName: fk.to,
        constraintName: `fk_${tableName}_${fk.from}_${fk.id ?? index}`,
      })),
      indices,
    };
  }
}
