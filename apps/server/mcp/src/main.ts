#!/usr/bin/env node
import { bootstrap } from './index';

bootstrap().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
