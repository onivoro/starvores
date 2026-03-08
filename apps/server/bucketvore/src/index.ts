import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppServerBucketvoreModule } from './app/app-server-bucketvore.module';
import { AppServerBucketvoreConfig } from './app/app-server-bucketvore-config.class';

export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppServerBucketvoreModule,
    { logger: console }
  );

  // Serve static assets (including client bundles)
  app.useStaticAssets(join(__dirname, 'assets'), {
    prefix: '/assets/',
  });

  const port = Number(new AppServerBucketvoreConfig().HTTP_PORT);
  await app.listen(port);
  console.log(`BucketVore available at: http://localhost:${port}`);
}
