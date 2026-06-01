import { Module } from '@nestjs/common';
import { McpStdioModule } from '@onivoro/server-mcp';
import { StarvoresMcpToolsService } from './services/starvores-mcp-tools.service';

@Module({
  imports: [
    McpStdioModule.registerAndServeStdio({
      metadata: {
        name: 'starvores-mcp',
        version: '24.38.2',
        description: 'StarVores stdio MCP server',
      },
    }),
  ],
  providers: [StarvoresMcpToolsService],
})
export class AppServerMcpModule {}
