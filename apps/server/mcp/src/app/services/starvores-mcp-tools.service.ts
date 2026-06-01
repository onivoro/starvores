import { Injectable } from '@nestjs/common';
import { McpTool } from '@onivoro/server-mcp';
import { z } from 'zod';

const echoSchema = z.object({
  message: z.string().describe('Message to echo back to the caller'),
});

@Injectable()
export class StarvoresMcpToolsService {
  @McpTool({
    name: 'starvores-echo',
    title: 'StarVores Echo',
    description: 'Echo a message through the StarVores MCP server.',
    schema: echoSchema,
    annotations: {
      readOnlyHint: true,
    },
  })
  echo(params: z.infer<typeof echoSchema>) {
    return {
      message: params.message,
    };
  }
}
