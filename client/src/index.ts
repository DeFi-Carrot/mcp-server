import { ANTHROPIC_MODEL_API_KEY, MCP_SERVER_URL } from "./config.js";
import { CarrotMcpClient } from "./mcp.js";
import readline from "node:readline/promises";
import { getDisplayName } from "@modelcontextprotocol/sdk/shared/metadataUtils.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function printHelp() {
  console.log(`
Available Commands:
  send <query>         - Send a natural language query to the LLM (e.g., send redeem all my crt).
  list-prompts         - List all available prompts from the server.
  list-resources       - List all available resources from the server.
  list-tools           - List all available tools from the server.
  get-prompt <name>    - Use a prompt to generate a query.
                         Example: get-prompt deposit_usdc
  read-resource <uri>  - Read the content of a specific resource.
                         Example: read-resource carrot-protocol://summary
  help                 - Show this help message.
  quit                 - Exit the client.
    `);
}

async function main() {
  console.log("--- Carrot MCP Interactive Test Client ---");
  const client = new CarrotMcpClient(
    ANTHROPIC_MODEL_API_KEY,
    MCP_SERVER_URL,
    "user1.json", // Make sure user1.json exists and contains your keypair
  );

  try {
    await client.connectToMcpServer();
    console.log("✅ Connected to MCP Server.");
    printHelp();
  } catch (error) {
    console.error("❌ Failed to connect to MCP Server:", error);
    process.exit(1);
  }

  while (true) {
    const input = await rl.question("> ");
    const [command, ...args] = input.trim().split(" ");

    switch (command.toLowerCase()) {
      case "send":
        if (args.length === 0) {
          console.log("Usage: send <natural language query>");
          continue;
        }
        const query = args.join(" ");
        console.log(`Sending query: "${query}"`);
        try {
          const response = await client.processQuery(query);
          console.log("\nLLM Response:\n", response);
        } catch (e) {
          console.error("Error processing query:", e);
        }
        break;

      case "list-prompts":
        const prompts = await client.listPrompts();
        console.log("\nAvailable Prompts:");
        prompts.forEach((p) => console.log(`- ${p.name}: ${p.description}`));
        break;

      case "list-resources":
        const resources = await client.listResources();
        console.log("\nAvailable Resources:");
        resources.forEach((r) => console.log(`- ${r.uri} (${r.name})`));
        break;

      case "list-tools":
        const tools = await client.listTools();
        console.log("\nAvailable Tools:");
        tools.forEach((r) => console.log(`- ${r.name}: ${r.description}`));
        break;

      case "get-prompt":
        const promptName = args[0];
        if (!promptName) {
          console.log("Usage: get-prompt <prompt_name>");
          continue;
        }
        const availablePrompts = await client.listPrompts();
        const selectedPrompt = availablePrompts.find(
          (p) => p.name === promptName,
        );

        if (!selectedPrompt) {
          console.log(`Prompt '${promptName}' not found.`);
          continue;
        }

        const promptArgs: Record<string, string> = {};
        if (selectedPrompt.arguments) {
          for (const arg of selectedPrompt.arguments) {
            const value = await rl.question(
              `  Enter value for '${arg.name}' (${arg.description}): `,
            );
            promptArgs[arg.name] = value;
          }
        }

        const generatedQuery = await client.getPrompt(promptName, promptArgs);
        console.log(`\nGenerated Query from Prompt: "${generatedQuery}"`);
        console.log("Sending to LLM...");
        try {
          const response = await client.processQuery(generatedQuery);
          console.log("\nLLM Response:\n", response);
        } catch (e) {
          console.error("Error processing generated query:", e);
        }
        break;

      case "read-resource":
        const uri = args[0];
        if (!uri) {
          console.log("Usage: read-resource <resource_uri>");
          continue;
        }
        const content = await client.readResource(uri);
        console.log(`\nContent of ${uri}:\n---\n${content}\n---`);
        break;

      case "help":
        printHelp();
        break;

      case "quit":
        console.log("Exiting client. Goodbye!");
        rl.close();
        return;

      default:
        if (command) {
          console.log(
            `Unknown command: "${command}". Type 'help' for a list of commands.`,
          );
        }
        break;
    }
  }
}

main().catch((err) => {
  console.error("A fatal error occurred:", err);
  rl.close();
});
