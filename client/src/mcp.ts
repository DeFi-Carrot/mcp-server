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
import { web3 } from "@coral-xyz/anchor";
import {
  ElicitRequest,
  ElicitRequestSchema,
  ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";

const { version } = packageJson;

export class CarrotMcpClient {
  private mcpClient: McpClient;
  private mcpServerUrl: URL;
  private modelClient: Anthropic;
  private tools: Tool[] = [];
  private signer: web3.Keypair;

  constructor(
    modelApiKey: string,
    mcpServerUrl: string,
    signerKeypairPath: string,
  ) {
    this.signer = getSigner(signerKeypairPath);
    this.modelClient = new Anthropic({
      apiKey: modelApiKey,
    });
    this.mcpClient = new McpClient(
      {
        name: "carrot-mcp-client",
        version,
      },
      {
        capabilities: {
          elicitation: {},
        },
      },
    );
    this.mcpServerUrl = new URL(mcpServerUrl);

    // handler dispatching
    this.mcpClient.setRequestHandler(ElicitRequestSchema, async (request) => {
      const { requestedSchema } = request.params;

      // --- Dispatcher Logic ---
      // Check the schema to identify the type of request.

      // 1. Is this a request for a transaction signature?
      // We check if the schema is asking for a `signedTx` property.
      if (requestedSchema.properties?.signedTx) {
        return this.handleSigningRequest(request);
      }

      // --- Fallback for unknown requests ---
      logger.warn("Received an unsupported elicitation request", {
        schema: requestedSchema,
      });
      return {
        action: "decline",
      };
    });
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
      max_tokens: 100,
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
        toolUseContent,
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
        max_tokens: 100,
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

  /**
   * Signs a base64 encoded transaction.
   *
   * @param unsignedTx - The base64 encoded unsigned transaction from the server.
   * @returns A base64 encoded signed transaction string.
   */
  private signTx(unsignedTx: string): string {
    const tx = web3.Transaction.from(Buffer.from(unsignedTx, "base64"));
    tx.sign(this.signer);

    const signedTx = tx.serialize();

    return Buffer.from(signedTx).toString("base64");
  }

  private async handleSigningRequest(
    request: ElicitRequest,
  ): Promise<ElicitResult> {
    const { message, prefilled } = request.params;
    logger.info(`Handling signing request`, { message });

    const unsignedTx = (prefilled as any).unsignedTx as string;
    if (!unsignedTx) {
      const errMsg = "Signing request did not provide an unsigned transaction.";
      logger.error(errMsg);
      return { action: "reject" };
    }

    try {
      const signedTx = this.signTx(unsignedTx);
      logger.info("Transaction signed successfully for request.", { message });

      return {
        action: "accept",
        content: {
          signedTx: signedTx,
        },
      };
    } catch (e) {
      logger.error("Failed to sign transaction", { error: e });
      return {
        action: "reject",
      };
    }
  }
}

function getSigner(signerKeypairPath: string): web3.Keypair {
  const keypair = web3.Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(signerKeypairPath, "utf8"))),
  );
  return keypair;
}
