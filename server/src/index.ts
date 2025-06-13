import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getCarrotHttpClient } from "./utils.js";
import { CRT_VAULT_ADDRESS } from "./config.js";

// 1. Create an MCP server with the new name
const server = new McpServer({
  name: "Carrot-Server",
  version: "1.0.0",
  // We're only exposing tools, so no need to specify other capabilities
  capabilities: {
    tools: {},
  },
  // Optional instructions for the LLM on how to use this server
  instructions:
    "This server provides tools to interact with the Carrot Protocol",
});

// 2. Define a tool to get the CRT APY using the http-client
server.tool(
  "get_crt_apy", // Tool name
  "Gets the current APY for the Carrot Protocol token (CRT).", // Tool description for the LLM
  {}, // No input parameters for this tool
  // The tool's implementation
  async () => {
    try {
      // Instantiate the Carrot HTTP client
      // The second argument (AnchorProvider) is not needed for read-only operations.
      const carrotClient = getCarrotHttpClient();

      // Use the client to get the vault performance data
      const performanceData = await carrotClient.getVaultPerformance(
        CRT_VAULT_ADDRESS,
        true, // useCache = true
      );

      const apy = performanceData.apy;

      // Ensure the APY is a number before formatting it
      if (typeof apy !== "number") {
        throw new Error("Invalid APY format received from API.");
      }

      const apyString = `${apy.toFixed(2)}%`;

      // Return the result in the format expected by MCP
      return {
        content: [{ type: "text", text: apyString }],
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";

      // Return an error result if the API call fails
      return {
        content: [
          { type: "text", text: `Error fetching APY: ${errorMessage}` },
        ],
        isError: true,
      };
    }
  },
);

// 3. Start the server using the stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run the server
main();
