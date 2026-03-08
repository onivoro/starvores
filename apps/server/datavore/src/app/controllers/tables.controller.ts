import { Controller, Get, Res } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TableService } from '../services/table.service';

@Controller('api/tables')
export class TablesController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tableService: TableService,
  ) { }

  @Get()
  async get() {
    return await this.tableService.getTables(this.dataSource);
  }

  @Get('debug/info')
  async getDatabaseInfo() {
    return await this.tableService.getDatabaseInfo(this.dataSource);
  }
}
