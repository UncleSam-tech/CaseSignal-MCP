import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetEntityRiskBriefInputSchema } from '../schemas/input/getEntityRiskBrief.js';
import { GetEntityRiskBriefOutputSchema } from '../schemas/output/getEntityRiskBrief.js';
import { buildEntityRiskBrief } from '../services/briefs/entityRiskBuilder.js';
import { buildMeta } from '../context/toolMeta.js';

const TOOL_NAME = 'get_entity_risk_brief';

export function registerGetEntityRiskBrief(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      title: 'Get Entity Risk Brief',
      description: 'Flagship tool. Use this tool FIRST when summarizing a company\'s litigation history, or when asked who they have sued or been sued by. Returns a complete federal litigation risk brief for a company or person — risk band, risk score, top concerns, notable cases, recent developments, and confidence labels.',
      inputSchema: GetEntityRiskBriefInputSchema,
      outputSchema: GetEntityRiskBriefOutputSchema,
    },
    async (input) => {
      const startTime = Date.now();
      const meta = buildMeta(TOOL_NAME, startTime, 'none');

      const output = await buildEntityRiskBrief(input, meta);
      const validated = GetEntityRiskBriefOutputSchema.parse(output);

      return {
        content: [{ type: 'text', text: JSON.stringify(validated) }],
        structuredContent: validated,
      };
    }
  );
}
