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

    logger.info("Processing query with Claude", { query });

    // === LLM Turn 1: Decide which tool to use ===
    const initialResponse = await this.modelClient.messages.create({
      model: MODEL_NAME,
      max_tokens: 1000, // Increased from 100 for more robust tool use reasoning
      messages,
      tools: this.tools,
    });

    // Append the assistant's response (including the tool_use request) to the message history
    messages.push({
      role: "assistant",
      content: initialResponse.content,
    });

    // Check if the model wants to use a tool
    const toolUseContent = initialResponse.content.find(
      (content) => content.type === "tool_use",
    );

    if (toolUseContent && toolUseContent.type === "tool_use") {
      logger.info("Claude requested a tool call", {
        toolName: toolUseContent.name,
      });

      // === Your Code's Turn: Execute the tool ===
      const toolResult = await this.mcpClient.callTool({
        name: toolUseContent.name,
        args: toolUseContent.input,
      });

      // Extract the text from the tool result
      const toolOutputText = (
        toolResult.content as { text?: string }[] | undefined
      )?.[0]?.text;
      if (toolOutputText === undefined) {
        throw new Error("Tool call did not return text content.");
      }

      logger.info("Tool executed successfully", { result: toolOutputText });

      // === LLM Turn 2: Send the tool result back to the model ===
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseContent.id,
            content: toolOutputText, // Pass the extracted text string here
          },
        ],
      });

      // Get the final response from the model
      const finalResponse = await this.modelClient.messages.create({
        model: MODEL_NAME,
        max_tokens: 1000,
        messages, // Send the full conversation history
        tools: this.tools,
      });

      // Assuming the final response is text
      return finalResponse.content[0].type === "text"
        ? finalResponse.content[0].text
        : "The model did not return a text response.";
    } else if (initialResponse.content[0].type === "text") {
      // If no tool was used, just return the initial text response
      logger.info("Claude responded directly without using a tool.");
      return initialResponse.content[0].text;
    }

    return "An unexpected response format was received from the model.";
  }
}
