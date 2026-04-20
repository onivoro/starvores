import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppServerBucketvoreModule } from './app/app-server-bucketvore.module';

export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppServerBucketvoreModule, { logger: console });

  app.useStaticAssets(join(__dirname, 'assets', 'ui'));

  const port = Number(process.env.PORT || 3007);
  await app.listen(port);
  console.log(`BucketVore API available at: http://localhost:${port}`);
}
