import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { DatabaseInfo, DatabaseSchemaService, TableStructureInfo } from './database-schema.service';

interface QueryExecution {
  queryRunner: QueryRunner;
  startTime: number;
}

@Injectable()
export class TableService {
  private activeQueries: Map<string, QueryExecution> = new Map();

  constructor(
    private readonly dataSource: DataSource,
    private readonly databaseSchemaService: DatabaseSchemaService,
  ) {}

  async getDatabaseInfo(dataSource: DataSource): Promise<DatabaseInfo> {
    return this.databaseSchemaService.getDatabaseInfo(dataSource);
  }

  async getTables(dataSource: DataSource): Promise<{ tableName: string }[]> {
    return this.databaseSchemaService.getTables(dataSource);
  }

  async getTableData(dataSource: DataSource, tableName: string): Promise<any[]> {
    this.assertSafeTableName(tableName);
    return this.databaseSchemaService.getTableData(dataSource, tableName);
  }

  async getTableStructure(dataSource: DataSource, tableName: string): Promise<TableStructureInfo> {
    this.assertSafeTableName(tableName);
    return this.databaseSchemaService.getTableStructure(dataSource, tableName);
  }

  async executeQuery(
    dataSource: DataSource,
    query: string,
    queryId?: string,
  ): Promise<{ rows: any[]; rowCount: number; elapsedMs: number; error?: string }> {
    const startTime = Date.now();
    const queryRunner = dataSource.createQueryRunner();

    if (queryId) {
      this.activeQueries.set(queryId, { queryRunner, startTime });
    }

    try {
      await queryRunner.connect();
      const results = await queryRunner.query(query);
      const rows = Array.isArray(results) ? results : [];
      const rowCount = rows.length;
      const elapsedMs = Date.now() - startTime;

      return { rows, rowCount, elapsedMs };
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      return {
        rows: [],
        rowCount: 0,
        elapsedMs,
        error: error instanceof Error ? error.message : 'Unknown query error',
      };
    } finally {
      if (queryId) {
        this.activeQueries.delete(queryId);
      }
      await queryRunner.release();
    }
  }

  async cancelQuery(queryId: string): Promise<boolean> {
    const execution = this.activeQueries.get(queryId);
    if (!execution) {
      return false;
    }

    try {
      const connection = execution.queryRunner.connection;
      const dbType = connection.options.type;

      if (dbType === 'postgres') {
        const processInfo = await execution.queryRunner.query('SELECT pg_backend_pid() as pid');
        if (processInfo && processInfo[0]?.pid) {
          await connection.query(`SELECT pg_cancel_backend(${processInfo[0].pid})`);
        }
      } else if (dbType === 'mysql') {
        const processInfo = await execution.queryRunner.query('SELECT CONNECTION_ID() as id');
        if (processInfo && processInfo[0]?.id) {
          await connection.query(`KILL QUERY ${processInfo[0].id}`);
        }
      }

      await execution.queryRunner.release();
      this.activeQueries.delete(queryId);
      return true;
    } catch (error) {
      console.error('Error cancelling query:', error);
      return false;
    }
  }

  private assertSafeTableName(tableName: string): void {
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name');
    }
  }
}
