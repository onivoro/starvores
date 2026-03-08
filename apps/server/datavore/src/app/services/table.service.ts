import { BadRequestException, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { once } from 'events';
import { DataSource, QueryRunner } from 'typeorm';
import { DatabaseInfo, DatabaseSchemaService, TableStructureInfo } from './database-schema.service';

interface ActiveQueryExecution {
  cancel: () => Promise<void>;
  cancelled: boolean;
  startTime: number;
}

export interface QueryJsonlExportRequest {
  query: string;
  queryId: string;
  limit?: number;
  includeMetadataHeader?: boolean;
  filename?: string;
}

export interface QueryJsonlExportResult {
  rowCount: number;
  byteCount: number;
  durationMs: number;
  cancelled: boolean;
  truncated: boolean;
  truncationReason?: 'row_limit' | 'byte_limit' | 'duration_limit';
}

interface QueryCancellationToken {
  backendPid?: number;
  connectionId?: number;
}

const DEFAULT_EXPORT_BATCH_SIZE = 1000;
const DEFAULT_EXPORT_MAX_ROWS = 1_000_000;
const DEFAULT_EXPORT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_EXPORT_MAX_DURATION_MS = 5 * 60 * 1000;

export class QueryExportError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function sanitizeJsonlFilename(filename?: string): string {
  const trimmed = (filename ?? '').trim();
  const withoutControlChars = trimmed.replace(/[\u0000-\u001F\u007F]/g, '');
  const safe = withoutControlChars.replace(/[\\/]/g, '-').replace(/\.{2,}/g, '.').replace(/[^A-Za-z0-9._-]/g, '_');
  const bounded = safe.slice(0, 120) || `query-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (bounded.toLowerCase().endsWith('.jsonl')) {
    return bounded.slice(0, -6) + '.jsonl';
  }
  return `${bounded}.jsonl`;
}

function isExportableQuery(query: string): boolean {
  return /^(select|with)\b/i.test(query.trim());
}

function stripTrailingSemicolon(query: string): string {
  return query.trim().replace(/;+\s*$/, '');
}

function toFinitePositiveInteger(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value <= 0) return undefined;
  return Math.floor(value);
}

@Injectable()
export class TableService {
  private readonly activeQueries: Map<string, ActiveQueryExecution> = new Map();

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

    try {
      await queryRunner.connect();
      const dbType = queryRunner.connection.options.type;
      const cancellationToken = await this.getCancellationToken(queryRunner, dbType);

      if (queryId) {
        this.registerActiveQuery(queryId, {
          cancel: async () => {
            await this.cancelConnectionByToken(dataSource, dbType, cancellationToken);
            await this.safeReleaseQueryRunner(queryRunner);
          },
          cancelled: false,
          startTime,
        });
      }

      const results = await queryRunner.query(query);
      const rows = Array.isArray(results) ? results : [];
      const rowCount = rows.length;
      const elapsedMs = Date.now() - startTime;

      return { rows, rowCount, elapsedMs };
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const cancelled = queryId ? this.activeQueries.get(queryId)?.cancelled : false;
      return {
        rows: [],
        rowCount: 0,
        elapsedMs,
        error: cancelled
          ? 'Query cancelled by user'
          : error instanceof Error
            ? error.message
            : 'Unknown query error',
      };
    } finally {
      if (queryId) {
        this.activeQueries.delete(queryId);
      }
      await this.safeReleaseQueryRunner(queryRunner);
    }
  }

  async streamQueryAsJsonl(
    dataSource: DataSource,
    res: Response,
    request: QueryJsonlExportRequest,
  ): Promise<QueryJsonlExportResult> {
    const query = request?.query?.trim();
    const queryId = request?.queryId?.trim();

    if (!query) {
      throw new QueryExportError('bad_request', 400, 'Query is required.');
    }
    if (!queryId) {
      throw new QueryExportError('bad_request', 400, 'queryId is required for export.');
    }
    if (!isExportableQuery(query)) {
      throw new QueryExportError('bad_request', 400, 'Only SELECT/WITH queries can be exported as JSONL.');
    }

    const hardMaxRows = toFinitePositiveInteger(Number(process.env.DV_EXPORT_MAX_ROWS)) ?? DEFAULT_EXPORT_MAX_ROWS;
    const hardMaxBytes = toFinitePositiveInteger(Number(process.env.DV_EXPORT_MAX_BYTES)) ?? DEFAULT_EXPORT_MAX_BYTES;
    const hardMaxDurationMs =
      toFinitePositiveInteger(Number(process.env.DV_EXPORT_MAX_DURATION_MS)) ?? DEFAULT_EXPORT_MAX_DURATION_MS;
    const batchSize = toFinitePositiveInteger(Number(process.env.DV_EXPORT_BATCH_SIZE)) ?? DEFAULT_EXPORT_BATCH_SIZE;
    const requestedLimit = toFinitePositiveInteger(request.limit);
    const exportRowLimit = Math.min(requestedLimit ?? hardMaxRows, hardMaxRows);

    const normalizedQuery = stripTrailingSemicolon(query);
    const startedAt = Date.now();
    const queryRunner = dataSource.createQueryRunner();
    let cancelled = false;
    let truncated = false;
    let truncationReason: QueryJsonlExportResult['truncationReason'];

    try {
      await queryRunner.connect();
      const dbType = queryRunner.connection.options.type;
      const cancellationToken = await this.getCancellationToken(queryRunner, dbType);

      this.registerActiveQuery(queryId, {
        cancel: async () => {
          cancelled = true;
          await this.cancelConnectionByToken(dataSource, dbType, cancellationToken);
          await this.safeReleaseQueryRunner(queryRunner);
        },
        cancelled: false,
        startTime: startedAt,
      });

      const firstBatchSize = Math.min(batchSize, exportRowLimit);
      const firstBatch = await this.fetchExportBatch(queryRunner, normalizedQuery, firstBatchSize, 0);

      const filename = sanitizeJsonlFilename(request.filename);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200);

      let byteCount = 0;
      let rowCount = 0;

      const writeLine = async (line: string): Promise<void> => {
        const activeExecution = this.activeQueries.get(queryId);
        if (!activeExecution || activeExecution.cancelled || cancelled || res.writableEnded || res.destroyed) {
          throw new QueryExportError('cancelled', 499, 'Export cancelled by user.');
        }

        const bytes = Buffer.byteLength(line, 'utf8');
        byteCount += bytes;
        if (byteCount > hardMaxBytes) {
          truncated = true;
          truncationReason = 'byte_limit';
          throw new QueryExportError('limit_exceeded', 413, 'Export byte limit exceeded.');
        }

        if (!res.write(line)) {
          await once(res, 'drain');
        }
      };

      if (request.includeMetadataHeader) {
        const columns = firstBatch.length > 0 ? Object.keys(firstBatch[0] ?? {}) : [];
        const metadataLine = `${JSON.stringify({
          _meta: {
            columns,
            exportedAt: new Date().toISOString(),
            queryId,
          },
        })}\n`;
        await writeLine(metadataLine);
      }

      const writeRows = async (rows: Record<string, unknown>[]) => {
        for (const row of rows) {
          const elapsedMs = Date.now() - startedAt;
          if (elapsedMs > hardMaxDurationMs) {
            truncated = true;
            truncationReason = 'duration_limit';
            throw new QueryExportError('timeout', 408, 'Export exceeded maximum duration.');
          }

          if (rowCount >= exportRowLimit) {
            truncated = true;
            truncationReason = 'row_limit';
            return;
          }

          await writeLine(`${JSON.stringify(row)}\n`);
          rowCount += 1;
        }
      };

      await writeRows(firstBatch);

      let offset = firstBatch.length;
      let lastBatchLength = firstBatch.length;
      while (lastBatchLength > 0 && rowCount < exportRowLimit && !truncated) {
        const remaining = exportRowLimit - rowCount;
        const currentBatchSize = Math.min(batchSize, remaining);
        if (currentBatchSize <= 0) break;

        const nextBatch = await this.fetchExportBatch(queryRunner, normalizedQuery, currentBatchSize, offset);
        if (!nextBatch.length) break;

        await writeRows(nextBatch);
        lastBatchLength = nextBatch.length;
        offset += nextBatch.length;

        if (nextBatch.length < currentBatchSize) break;
      }

      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }

      return {
        rowCount,
        byteCount,
        durationMs: Date.now() - startedAt,
        cancelled: cancelled || Boolean(this.activeQueries.get(queryId)?.cancelled),
        truncated,
        truncationReason,
      };
    } catch (error) {
      const queryExecution = this.activeQueries.get(queryId);
      const wasCancelled = cancelled || Boolean(queryExecution?.cancelled);

      if (wasCancelled && !(error instanceof QueryExportError)) {
        console.info('JSONL export stopped: cancelled', { queryId });
        throw new QueryExportError('cancelled', 499, 'Export cancelled by user.');
      }

      if (error instanceof QueryExportError) {
        const reason = error.code === 'timeout' ? 'timeout' : error.code === 'limit_exceeded' ? 'limit_exceeded' : error.code;
        console.error('JSONL export failed', { queryId, reason, message: error.message });
        throw error;
      }

      console.error('JSONL export failed', {
        queryId,
        reason: 'query_error',
        message: error instanceof Error ? error.message : String(error),
      });
      throw new QueryExportError(
        'query_error',
        500,
        error instanceof Error ? error.message : 'Failed to stream JSONL export.',
      );
    } finally {
      this.activeQueries.delete(queryId);
      await this.safeReleaseQueryRunner(queryRunner);
    }
  }

  async cancelQuery(queryId: string): Promise<boolean> {
    const execution = this.activeQueries.get(queryId);
    if (!execution) {
      return false;
    }

    execution.cancelled = true;

    try {
      await execution.cancel();
      this.activeQueries.delete(queryId);
      return true;
    } catch (error) {
      console.error('Error cancelling query:', error);
      this.activeQueries.delete(queryId);
      return false;
    }
  }

  private registerActiveQuery(queryId: string, execution: ActiveQueryExecution): void {
    this.activeQueries.set(queryId, execution);
  }

  private async fetchExportBatch(
    queryRunner: QueryRunner,
    query: string,
    batchSize: number,
    offset: number,
  ): Promise<Record<string, unknown>[]> {
    const pagedQuery = `SELECT * FROM (${query}) AS dv_export_jsonl LIMIT ${batchSize} OFFSET ${offset}`;
    const batch = await queryRunner.query(pagedQuery);
    return Array.isArray(batch) ? (batch as Record<string, unknown>[]) : [];
  }

  private async getCancellationToken(
    queryRunner: QueryRunner,
    dbType: unknown,
  ): Promise<QueryCancellationToken | undefined> {
    if (dbType === 'postgres') {
      const processInfo = await queryRunner.query('SELECT pg_backend_pid() as pid');
      const backendPid = processInfo?.[0]?.pid;
      if (typeof backendPid === 'number') {
        return { backendPid };
      }
    }

    if (dbType === 'mysql') {
      const processInfo = await queryRunner.query('SELECT CONNECTION_ID() as id');
      const connectionId = processInfo?.[0]?.id;
      if (typeof connectionId === 'number') {
        return { connectionId };
      }
    }

    return undefined;
  }

  private async cancelConnectionByToken(
    dataSource: DataSource,
    dbType: unknown,
    token: QueryCancellationToken | undefined,
  ): Promise<void> {
    if (dbType === 'postgres' && token?.backendPid) {
      await dataSource.query('SELECT pg_cancel_backend($1)', [token.backendPid]);
      return;
    }

    if (dbType === 'mysql' && token?.connectionId) {
      await dataSource.query(`KILL QUERY ${token.connectionId}`);
    }
  }

  private async safeReleaseQueryRunner(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.isReleased) return;
    try {
      await queryRunner.release();
    } catch {
      // Ignore release race conditions from cancellation and finally blocks.
    }
  }

  private assertSafeTableName(tableName: string): void {
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name');
    }
  }
}
