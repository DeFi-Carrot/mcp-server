import { CarrotMcpClient } from "./mcp.js";

async function main() {
  const modelApiKey =
    "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";
  const mcpServerUrl = "http://localhost:8080/mcp";

  const client = new CarrotMcpClient(modelApiKey, mcpServerUrl, "user1.json");

  await client.connectToMcpServer();

  const response = await client.processQuery("mint 1000 usdc worth of crt");
  console.log(response);
}

main();
