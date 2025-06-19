import { Anthropic } from "@anthropic-ai/sdk";
import {
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import packageJson from "../package.json" with { type: "json" };
import { logger } from "./utils.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MODEL_NAME } from "./config.js";
const { version } = packageJson;

export class CarrotMcpClient {
  private mcpClient: McpClient;
  private mcpServerUrl: URL;
  private modelClient: Anthropic;
  private tools: Tool[] = [];

  constructor(modelApiKey: string, mcpServerUrl: string) {
    this.modelClient = new Anthropic({
      apiKey: modelApiKey,
    });
    this.mcpClient = new McpClient({ name: "carrot-mcp-client", version });
    this.mcpServerUrl = new URL(mcpServerUrl);
  }

  async connectToMcpServer() {
    logger.info("Connecting to MCP server", { url: this.mcpServerUrl });
    await this.mcpClient.connect(
      new StreamableHTTPClientTransport(this.mcpServerUrl),
    );

    // fetch the tools from the server
    logger.info("Fetching tools from server");
    const toolsResult = await this.mcpClient.listTools();
    this.tools = toolsResult.tools.map((tool) => {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      };
    });
    logger.info("Connected to server with tools", {
      toolCount: this.tools.length,
      tools: this.tools.map(({ name }) => name),
    });
  }

  async processQuery(query: string) {
    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    const response = await this.modelClient.messages.create({
      model: MODEL_NAME,
      max_tokens: 100,
      messages,
      tools: this.tools,
    });

    const finalText: string[] = [];

    for (const content of response.content) {
      if (content.type === "text") {
        logger.info("model returned text only response");
        finalText.push(content.text);
      } else if (content.type === "tool_use") {
        const toolName = content.name;
        const toolArgs = content.input as { [x: string]: unknown } | undefined;

        // call mcp tool
        const result = await this.mcpClient.callTool({
          name: toolName,
          arguments: toolArgs,
        });
        finalText.push(
          `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`,
        );
        logger.info("Calling tool", { toolName, toolArgs });

        messages.push({
          role: "user",
          content: result.content as string,
        });

        const response = await this.modelClient.messages.create({
          model: MODEL_NAME,
          max_tokens: 1000,
          messages,
        });

        finalText.push(
          response.content[0].type === "text" ? response.content[0].text : "",
        );
      }
    }

    return finalText.join("\n");
  }
}
