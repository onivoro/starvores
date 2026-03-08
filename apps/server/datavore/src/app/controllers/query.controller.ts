import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { QueryExportError, QueryJsonlExportRequest, TableService } from '../services/table.service';

@Controller('api/query')
export class QueryController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tableService: TableService,
  ) {}

  @Post()
  async execute(@Body() body: { query: string; queryId?: string }) {
    if (!body?.query?.trim()) {
      return { rows: [], rowCount: 0, elapsedMs: 0, error: 'Query is required' };
    }

    return this.tableService.executeQuery(this.dataSource, body.query, body.queryId);
  }

  @Post('export/jsonl')
  async exportJsonl(
    @Body() body: QueryJsonlExportRequest,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const queryId = body?.queryId;
    const cancelOnDisconnect = () => {
      if (!queryId) return;
      void this.tableService.cancelQuery(queryId);
    };

    req.on('aborted', cancelOnDisconnect);
    req.on('close', cancelOnDisconnect);

    try {
      await this.tableService.streamQueryAsJsonl(this.dataSource, res, body);
    } catch (error) {
      if (res.headersSent || res.writableEnded) {
        if (!res.writableEnded && !res.destroyed) {
          res.end();
        }
        return;
      }

      const payload = this.formatExportError(error);
      res.status(payload.status).json({
        code: payload.code,
        message: payload.message,
        details: payload.details,
      });
    } finally {
      req.off('aborted', cancelOnDisconnect);
      req.off('close', cancelOnDisconnect);
    }
  }

  @Post('cancel')
  async cancel(@Body() body: { queryId: string }) {
    const cancelled = await this.tableService.cancelQuery(body.queryId);
    return { cancelled };
  }

  private formatExportError(error: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (error instanceof QueryExportError) {
      return {
        status: error.status,
        code: error.code,
        message: error.message,
        details: error.details,
      };
    }

    if (error instanceof Error) {
      return {
        status: 500,
        code: 'internal_error',
        message: error.message,
      };
    }

    return {
      status: 500,
      code: 'internal_error',
      message: 'Unexpected export error.',
    };
  }
}
