import { NestFactory } from '@nestjs/core';
import { AppServerDatavoreModule } from './app/app-server-datavore.module';

export async function bootstrap() {
  const app = await NestFactory.create(AppServerDatavoreModule, { logger: console });

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log(`DataVore API available at: http://localhost:${port}`);
}
