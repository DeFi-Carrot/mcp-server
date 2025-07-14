import { ANTHROPIC_MODEL_API_KEY, MCP_SERVER_URL } from "./config.js";
import { CarrotMcpClient } from "./mcp.js";

async function main() {
  const client = new CarrotMcpClient(
    ANTHROPIC_MODEL_API_KEY,
    MCP_SERVER_URL,
    "user1.json",
  );

  await client.connectToMcpServer();

  const response = await client.processQuery("redeem all of my crt");
  console.log(response);
}

main();
