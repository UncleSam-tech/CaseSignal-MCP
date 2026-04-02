import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import env from '../config/env.js';
import { registerSearchEntityLitigation } from '../tools/searchEntityLitigation.js';
import { registerGetCaseDigest } from '../tools/getCaseDigest.js';
import { registerGetEntityRiskBrief } from '../tools/getEntityRiskBrief.js';
import { registerListCaseUpdates } from '../tools/listCaseUpdates.js';
import { registerCompareEntitiesLitigation } from '../tools/compareEntitiesLitigation.js';

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: env.MCP_SERVER_NAME,
      version: env.MCP_SERVER_VERSION,
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );

  registerSearchEntityLitigation(server);
  registerGetCaseDigest(server);
  registerGetEntityRiskBrief(server);
  registerListCaseUpdates(server);
  registerCompareEntitiesLitigation(server);

  return server;
}
