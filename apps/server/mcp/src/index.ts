import { NestFactory } from '@nestjs/core';
import { AppServerMcpModule } from './app/app-server-mcp.module';

export async function bootstrap() {
  await NestFactory.createApplicationContext(AppServerMcpModule, { logger: false });
}
