import { Module, OnModuleDestroy } from '@nestjs/common';
import { AppController } from './controllers/app.controller';
import { AppServerDatavoreConfig } from './app-server-datavore-config.class';
import { DataSource } from 'typeorm';
import { TableService } from './services/table.service';
import { DatabaseSchemaService } from './services/database-schema.service';
import { TablesController } from './controllers/tables.controller';
import { TableController } from './controllers/table.controller';
import { QueryController } from './controllers/query.controller';

const dbConfig = new AppServerDatavoreConfig();
let dataSource: DataSource | null = null;

@Module({
  imports: [],
  controllers: [AppController, QueryController, TableController, TablesController],
  providers: [
    TableService,
    DatabaseSchemaService,
    { provide: AppServerDatavoreConfig, useValue: dbConfig },
    {
      provide: DataSource,
      useFactory: async () => {
        if (!dataSource) {
          const dataSourceConfig = {
            ...dbConfig,
            synchronize: false,
            logging: true,
            ssl: undefined,
            entities: [],
            extra: {
              max: 10,
              min: 1,
              acquireTimeoutMillis: 30000,
              createTimeoutMillis: 30000,
              destroyTimeoutMillis: 10000,
              idleTimeoutMillis: 30000,
              reapIntervalMillis: 1000,
              createRetryIntervalMillis: 100,
            },
          };

          const _dataSource = new DataSource(dataSourceConfig as any);
          await _dataSource.initialize();
          dataSource = _dataSource;
        }

        return dataSource;
      },
    },
  ],
})
export class AppServerDatavoreModule implements OnModuleDestroy {
  async onModuleDestroy() {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
      console.info('Database connection closed successfully');
    }
  }
}
