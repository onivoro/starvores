import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('/api/health')
  getHealth() {
    return { ok: true, service: 'datavore' };
  }
}
