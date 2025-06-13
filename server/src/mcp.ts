import { getCarrotHttpClient } from "./utils.js";
import { CRT_VAULT_ADDRESS } from "./config.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Creates and configures a single, long-lived MCP server instance.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "carrot-mcp-server",
    version: "1.0.0",
    capabilities: {
      tools: {},
    },
    instructions: "This server provides tools to interact with Carrot",
  });

  server.tool(
    "get_crt_apy",
    "Gets the current APY for the Carrot Protocol token (CRT).",
    {},
    async () => {
      try {
        const carrotClient = getCarrotHttpClient();
        const performanceData = await carrotClient.getVaultPerformance(
          CRT_VAULT_ADDRESS,
          true,
        );
        const apy = performanceData.apy;

        if (typeof apy !== "number") {
          throw new Error("Invalid APY format received from API.");
        }
        const apyString = `${apy.toFixed(2)}%`;
        return {
          content: [{ type: "text", text: apyString }],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred";
        return {
          content: [
            { type: "text", text: `Error fetching APY: ${errorMessage}` },
          ],
          isError: true,
        };
      }
    },
  );
  return server;
}
