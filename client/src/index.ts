import { MCP_SERVER_URL } from "./config.js";
import { CarrotMcpClient } from "./mcp.js";

async function main() {
  const modelApiKey =
    "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";

  const client = new CarrotMcpClient(modelApiKey, MCP_SERVER_URL, "user1.json");

  await client.connectToMcpServer();

  const response = await client.processQuery("redeem all of my crt");
  console.log(response);
}

main();
