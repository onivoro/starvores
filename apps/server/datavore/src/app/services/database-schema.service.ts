import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface TableInfo {
  tableName: string;
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
      const databaseName = (dataSource.options as any).database;

      return {
        type: dbType,
        isConnected,
        databaseName
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
    const dbType = dataSource.options.type;
    console.info(`Getting tables for database type: ${dbType}`);

    const query = this.getTableListQuery(dbType);
    const tables = await dataSource.query(query);

    return tables.map(table => ({
      tableName: table.table_name || table.TABLE_NAME || table.name
    }));
  }  /**
   * Get data from a specific table
   */
  async getTableData(dataSource: DataSource, tableName: string): Promise<any[]> {
    const dbType = dataSource.options.type;
    console.info(`Getting table data for: ${tableName} (database type: ${dbType})`);

    const query = this.getTableDataQuery(dbType, tableName);
    return await dataSource.query(query);
  }

  /**
   * Get table structure information (columns, keys, indices)
   */
  async getTableStructure(dataSource: DataSource, tableName: string): Promise<TableStructureInfo> {
    const dbType = dataSource.options.type;
    console.info(`Getting table structure for: ${tableName} (database type: ${dbType})`);

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
          columnName: col.column_name || col.COLUMN_NAME,
          dataType: col.data_type || col.DATA_TYPE,
          isNullable: col.is_nullable || col.IS_NULLABLE,
          columnDefault: col.column_default || col.COLUMN_DEFAULT
        };
        console.info('Mapping column:', JSON.stringify(col), '->', JSON.stringify(mapped));
        return mapped;
      }),
      primaryKeys: primaryKeys.map(pk => ({
        columnName: pk.column_name || pk.COLUMN_NAME
      })),
      foreignKeys: foreignKeys.map(fk => ({
        columnName: fk.column_name || fk.COLUMN_NAME,
        foreignTableName: fk.foreign_table_name || fk.FOREIGN_TABLE_NAME,
        foreignColumnName: fk.foreign_column_name || fk.FOREIGN_COLUMN_NAME,
        constraintName: fk.constraint_name || fk.CONSTRAINT_NAME
      })),
      indices: indices.map(idx => ({
        indexName: idx.index_name || idx.INDEX_NAME,
        columnName: idx.column_name || idx.COLUMN_NAME,
        isUnique: idx.is_unique || idx.IS_UNIQUE
      }))
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
    switch (dbType) {
      case 'postgres':
        return `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          ORDER BY table_name
        `;
      case 'mysql':
        return `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = DATABASE()
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
          ORDER BY table_name
        `;
    }
  }

  private getTableDataQuery(dbType: string, tableName: string): string {
    const escaped = this.escapeIdentifier(dbType, tableName);
    return `SELECT * FROM ${escaped} LIMIT 100`;
  }

  private escapeIdentifier(dbType: string, identifier: string): string {
    if (dbType === 'mysql') {
      return `\`${identifier.replace(/`/g, '``')}\``;
    }

    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private getColumnsQuery(dbType: string): string {
    switch (dbType) {
      case 'postgres':
        return `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `;
      case 'mysql':
        return `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_name = ? AND table_schema = DATABASE()
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
      case 'mysql':
        return `
          SELECT column_name
          FROM information_schema.key_column_usage
          WHERE table_name = ?
            AND table_schema = DATABASE()
            AND constraint_name = 'PRIMARY'
          ORDER BY ordinal_position
        `;
      default:
        return `SELECT column_name FROM information_schema.key_column_usage WHERE table_name = ? AND constraint_name = 'PRIMARY'`;
    }
  }

  private getForeignKeysQuery(dbType: string): string {
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
      case 'mysql':
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
      default:
        return `SELECT '' AS column_name, '' AS foreign_table_name, '' AS foreign_column_name, '' AS constraint_name WHERE 1=0`;
    }
  }

  private getIndicesQuery(dbType: string): string {
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
      case 'mysql':
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
      default:
        return `SELECT '' AS index_name, '' AS column_name, false AS is_unique WHERE 1=0`;
    }
  }
}
