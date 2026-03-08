import { Controller, Get, Param } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TableService } from '../services/table.service';

@Controller('api/table/:tableName')
export class TableController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tableService: TableService,
  ) { }

  @Get('structure')
  async getStructure(@Param('tableName') tableName: string) {
    return await this.tableService.getTableStructure(this.dataSource, tableName);
  }

   @Get()
  async get(@Param('tableName') tableName: string) {
    return await this.tableService.getTableData(this.dataSource, tableName);
  }
}
