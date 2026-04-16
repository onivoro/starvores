import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppServerDatavoreModule } from './app/app-server-datavore.module';

export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppServerDatavoreModule, { logger: console });

  app.useStaticAssets(join(__dirname, 'assets', 'ui'));

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log(`DataVore API available at: http://localhost:${port}`);
}
