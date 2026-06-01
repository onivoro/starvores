import { DataSource } from 'typeorm';
import { DatabaseSchemaService } from './database-schema.service';

const createDataSource = (type: string, query: jest.Mock): DataSource => ({
  options: { type },
  query,
} as unknown as DataSource);

describe('DatabaseSchemaService', () => {
  const service = new DatabaseSchemaService();

  it('discovers MySQL base tables from the active database', async () => {
    const query = jest.fn().mockResolvedValue([{ table_name: 'users' }]);

    const tables = await service.getTables(createDataSource('mysql', query));

    expect(tables).toEqual([{ tableName: 'users' }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('table_schema = DATABASE()');
    expect(query.mock.calls[0][0]).toContain("table_type = 'BASE TABLE'");
  });

  it('discovers MySQL views and routines without querying sequences', async () => {
    const query = jest.fn((sql: string) => {
      if (sql.includes('information_schema.views')) {
        return Promise.resolve([{ name: 'active_users', schema: 'app' }]);
      }
      if (sql.includes('information_schema.routines')) {
        return Promise.resolve([{ NAME: 'normalize_email', SCHEMA: 'app', TYPE: 'FUNCTION' }]);
      }
      return Promise.resolve([]);
    });

    const schemaObjects = await service.getSchemaObjects(createDataSource('mysql', query));

    expect(schemaObjects).toEqual({
      views: [{ name: 'active_users', schema: 'app', type: undefined }],
      functions: [{ name: 'normalize_email', schema: 'app', type: 'FUNCTION' }],
      sequences: [],
    });
    expect(query).toHaveBeenCalledTimes(2);
    query.mock.calls.forEach(([sql]) => expect(sql).toContain('DATABASE()'));
  });

  it('uses MySQL discovery for MariaDB-compatible connections', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await service.getSchemaObjects(createDataSource('mariadb', query));

    expect(query).toHaveBeenCalledTimes(2);
    query.mock.calls.forEach(([sql]) => expect(sql).toContain('DATABASE()'));
  });

  it('maps MySQL table structure metadata and preserves falsey values', async () => {
    const query = jest.fn((sql: string, params: unknown[]) => {
      expect(params).toEqual(['users']);

      if (sql.includes('information_schema.columns')) {
        return Promise.resolve([
          { column_name: 'id', data_type: 'int', is_nullable: 'NO', column_default: 0 },
        ]);
      }
      if (sql.includes("constraint_name = 'PRIMARY'")) {
        return Promise.resolve([{ column_name: 'id' }]);
      }
      if (sql.includes('referenced_table_name IS NOT NULL')) {
        return Promise.resolve([
          {
            column_name: 'org_id',
            foreign_table_name: 'organizations',
            foreign_column_name: 'id',
            constraint_name: 'fk_users_org_id',
          },
        ]);
      }
      if (sql.includes('information_schema.statistics')) {
        return Promise.resolve([{ index_name: 'idx_users_email', column_name: 'email', is_unique: 0 }]);
      }
      return Promise.resolve([]);
    });

    const structure = await service.getTableStructure(createDataSource('mysql', query), 'users');

    expect(structure.columns).toEqual([
      { columnName: 'id', dataType: 'int', isNullable: 'NO', columnDefault: 0 },
    ]);
    expect(structure.primaryKeys).toEqual([{ columnName: 'id' }]);
    expect(structure.foreignKeys).toEqual([
      {
        columnName: 'org_id',
        foreignTableName: 'organizations',
        foreignColumnName: 'id',
        constraintName: 'fk_users_org_id',
      },
    ]);
    expect(structure.indices).toEqual([{ indexName: 'idx_users_email', columnName: 'email', isUnique: false }]);
  });

  it('discovers SQLite views without querying information_schema', async () => {
    const query = jest.fn((sql: string) => {
      expect(sql).not.toContain('information_schema');
      return Promise.resolve(sql.includes('sqlite_master') ? [{ name: 'recent_sessions', schema: 'main' }] : []);
    });

    const schemaObjects = await service.getSchemaObjects(createDataSource('sqlite', query));

    expect(schemaObjects).toEqual({
      views: [{ name: 'recent_sessions', schema: 'main', type: undefined }],
      functions: [],
      sequences: [],
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('discovers SQLite table structure using PRAGMA metadata', async () => {
    const query = jest.fn((sql: string) => {
      expect(sql).not.toContain('information_schema');

      if (sql.includes('PRAGMA table_info')) {
        return Promise.resolve([
          { name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
          { name: 'account_id', type: 'TEXT', notnull: 0, dflt_value: "'local'", pk: 0 },
        ]);
      }
      if (sql.includes('PRAGMA foreign_key_list')) {
        return Promise.resolve([{ id: 0, from: 'account_id', table: 'account', to: 'id' }]);
      }
      if (sql.includes('PRAGMA index_list')) {
        return Promise.resolve([{ name: 'idx_session_account_id', unique: 0, origin: 'c' }]);
      }
      if (sql.includes('PRAGMA index_info')) {
        return Promise.resolve([{ name: 'account_id' }]);
      }
      return Promise.resolve([]);
    });

    const structure = await service.getTableStructure(createDataSource('sqlite', query), 'session');

    expect(structure).toEqual({
      columns: [
        { columnName: 'id', dataType: 'TEXT', isNullable: 'NO', columnDefault: null },
        { columnName: 'account_id', dataType: 'TEXT', isNullable: 'YES', columnDefault: "'local'" },
      ],
      primaryKeys: [{ columnName: 'id' }],
      foreignKeys: [
        {
          columnName: 'account_id',
          foreignTableName: 'account',
          foreignColumnName: 'id',
          constraintName: 'fk_session_account_id_0',
        },
      ],
      indices: [{ indexName: 'idx_session_account_id', columnName: 'account_id', isUnique: false }],
    });
  });
});
