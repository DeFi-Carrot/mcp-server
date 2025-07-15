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
  ElicitRequestSchema,
  GetPromptRequest,
  GetPromptResultSchema,
  ListPromptsRequest,
  ListPromptsResultSchema,
  Prompt,
  ReadResourceRequest,
  ReadResourceResultSchema,
  Resource,
  ListResourcesRequest,
  ListResourcesResultSchema,
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
      const { message, prefilled } = request.params;
      logger.info(`Handling signing request`, { message });

      const unsignedTx = (prefilled as any).unsignedTx as string;
      if (!unsignedTx) {
        const errMsg =
          "Signing request did not provide an unsigned transaction.";
        logger.error(errMsg);
        return { action: "reject" };
      }
      logger.info(`parsed unsigned tx`);

      try {
        const signedTx = this.signTx(unsignedTx);
        logger.info("Transaction signed successfully for request.", {
          message,
        });

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
    });
  }

  async connectToMcpServer() {
    logger.info("Connecting to MCP server", { url: this.mcpServerUrl });
    await this.mcpClient.connect(
      new StreamableHTTPClientTransport(this.mcpServerUrl),
    );

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

  async listResources(): Promise<Resource[]> {
    logger.info("Listing available resources...");
    const request: ListResourcesRequest = {
      method: "resources/list",
      params: {},
    };
    const result = await this.mcpClient.request(
      request,
      ListResourcesResultSchema,
    );
    return result.resources;
  }

  async readResource(uri: string): Promise<string> {
    logger.info(`Reading resource: ${uri}`);
    const request: ReadResourceRequest = {
      method: "resources/read",
      params: { uri },
    };
    const result = await this.mcpClient.request(
      request,
      ReadResourceResultSchema,
    );
    return result.contents
      .map((c) => (c as { text: string }).text)
      .join("\n---\n");
  }

  async listPrompts(): Promise<Prompt[]> {
    logger.info("Listing available prompts...");
    const request: ListPromptsRequest = {
      method: "prompts/list",
      params: {},
    };
    const result = await this.mcpClient.request(
      request,
      ListPromptsResultSchema,
    );
    return result.prompts;
  }

  async getPrompt(name: string, args: Record<string, string>): Promise<string> {
    logger.info(`Getting prompt '${name}' with args:`, args);
    const request: GetPromptRequest = {
      method: "prompts/get",
      params: { name, arguments: args },
    };
    const result = await this.mcpClient.request(request, GetPromptResultSchema);
    const firstUserMessage = result.messages.find((m) => m.role === "user");
    if (firstUserMessage && firstUserMessage.content.type === "text") {
      return firstUserMessage.content.text;
    }
    return "Could not generate a query from the prompt.";
  }

  async processQuery(query: string): Promise<string> {
    // --- RAG IMPLEMENTATION ---
    // 1. Retrieve the protocol summary resource to provide context to the LLM.
    const summaryContext = await this.readResource("carrot-protocol://summary");

    // 2. Construct the prompt with the retrieved context.
    // This ensures the LLM has the correct information before it tries to answer.
    const augmentedQuery = `
Here is some context about the Carrot Protocol:
---
${summaryContext}
---
Now, please answer the following user query: "${query}"
`;

    const messages: MessageParam[] = [
      {
        role: "user",
        content: augmentedQuery, // Use the augmented query
      },
    ];

    logger.info("Processing augmented query with Claude", { query });

    const initialResponse = await this.modelClient.messages.create({
      model: MODEL_NAME,
      max_tokens: 1024,
      messages,
      tools: this.tools,
    });

    messages.push({
      role: "assistant",
      content: initialResponse.content,
    });

    const toolUseContent = initialResponse.content.find(
      (content) => content.type === "tool_use",
    );

    if (toolUseContent && toolUseContent.type === "tool_use") {
      const toolName = toolUseContent.name;
      const toolArgs = (toolUseContent.input as any) || {};
      logger.info("Tool call requested", {
        toolName,
        toolArgs,
      });

      const toolSchema = this.tools.find((t) => t.name === toolName)!;

      if (
        toolSchema.input_schema.properties &&
        (toolSchema.input_schema.properties as any).walletStr
      ) {
        const walletStr = this.signer.publicKey.toString();
        toolArgs.walletStr = walletStr;
        logger.info(`Injecting wallet address for tool`, {
          tool: toolName,
          args: toolArgs,
        });
      }

      const toolResult = await this.mcpClient.callTool({
        name: toolName,
        arguments: toolArgs,
      });

      const toolOutputText = (
        toolResult.content as { text?: string }[] | undefined
      )?.[0]?.text;
      if (toolOutputText === undefined) {
        throw new Error("Tool call did not return text content.");
      }

      logger.info("Tool executed", { result: toolOutputText });

      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseContent.id,
            content: toolOutputText,
          },
        ],
      });

      const finalResponse = await this.modelClient.messages.create({
        model: MODEL_NAME,
        max_tokens: 1024,
        messages,
        tools: this.tools,
      });

      return finalResponse.content[0].type === "text"
        ? finalResponse.content[0].text
        : "The model did not return a text response.";
    } else if (initialResponse.content[0].type === "text") {
      logger.info("Claude responded directly without using a tool.");
      return initialResponse.content[0].text;
    }

    return "An unexpected response format was received from the model.";
  }

  private signTx(unsignedTx: string): string {
    const tx = web3.VersionedTransaction.deserialize(
      Buffer.from(unsignedTx, "base64"),
    );
    tx.sign([this.signer]);
    const signedTx = tx.serialize();
    return Buffer.from(signedTx).toString("base64");
  }
}

function getSigner(signerKeypairPath: string): web3.Keypair {
  const keypair = web3.Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(signerKeypairPath, "utf8"))),
  );
  return keypair;
}
