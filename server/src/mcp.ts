import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CrtClient } from "./crt.js";
import { CRT_MINT, USDC_MINT } from "./config.js";
import { z } from "zod";
import { CRT_MCP_ERROR, logger } from "./utils.js";
import packageJson from "../package.json" with { type: "json" };
import {
  CallToolResult,
  GetPromptResult,
  ReadResourceResult,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";

const { version } = packageJson;

export class CarrotMcpServer {
  public readonly server: McpServer;
  private crtClient: CrtClient;

  constructor() {
    // Initialize the MCP server with detailed instructions for the LLM,
    // and declare all the capabilities this server will provide.
    this.server = new McpServer(
      {
        name: "carrot-mcp-server",
        version,
        title: "Carrot Protocol Server",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          elicitation: {},
        },
        instructions: `You are an expert assistant for the Carrot Protocol.
        The Carrot Protocol powers CRT, a yield-bearing token.
        Key concepts:
        - Users deposit stablecoins (like USDC) to mint CRT.
        - The deposited funds are allocated to various lending protocols (e.g., Marginfi, Kamino) to generate yield.
        - The value of the CRT token increases over time as this yield accrues.
        - Users can redeem their CRT at any time to get back their original principal plus the earned yield, minus a small fee.
        Your primary role is to help users manage their CRT assets by using the available tools to check yield (APY), issue (mint/deposit), and redeem (withdraw) CRT.
        Always use the wallet address provided by the user for any transaction-related tools.`,
      },
    );

    // Initialize the Carrot Protocol HTTP client
    this.crtClient = new CrtClient();

    // Register all server capabilities
    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }

  // Establishes the connection with a client transport.
  public async initialize(transport: StreamableHTTPServerTransport) {
    await this.server.connect(transport);
    logger.debug(`MCP server connected`);
  }

  /**
   * Registers all the tools this server exposes to the LLM.
   * Descriptions are enhanced to provide clear, actionable context for the LLM.
   */
  private registerTools() {
    // --- Read-Only Tools ---

    this.server.registerTool(
      "get_crt_apy",
      {
        title: "Get CRT APY",
        description:
          "Gets the current Annual Percentage Yield (APY) for the Carrot Protocol Token (CRT). This value represents the real-time, weighted average yield being earned from all underlying lending protocols.",
        annotations: {
          readOnlyHint: true,
        },
      },
      async () => {
        try {
          const apyString = await this.crtClient.getCrtApy();
          logger.info(`CRT APY fetched`, { apy: apyString });
          return {
            content: [{ type: "text", text: apyString }],
          };
        } catch (e) {
          logger.error("Error fetching CRT APY", { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );

    // --- Transactional Tools (Issue/Mint) ---

    this.server.registerTool(
      "issue_crt",
      {
        title: "Issue CRT (by CRT amount)",
        description:
          "Mints a specific amount of CRT by depositing an equivalent value of USDC. The server calculates the required USDC based on the current CRT price. This action requires a transaction signature.",
        inputSchema: {
          uiAmount: z
            .number()
            .positive()
            .describe("The amount of CRT tokens to mint."),
          walletStr: z
            .string()
            .describe(
              "The user's Solana wallet address. This wallet will sign the transaction and receive the minted CRT.",
            ),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
        },
      },
      async ({ uiAmount, walletStr }, { sendRequest }) => {
        try {
          const unsignedTx = await this.crtClient.getUnsignedIssueTx(
            uiAmount,
            { selectedMint: CRT_MINT.toString() },
            USDC_MINT.toString(),
            walletStr,
          );
          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to mint ${uiAmount} CRT`,
            `Transaction to mint ${uiAmount} CRT was successful!`,
          );
        } catch (e) {
          logger.error(`Error creating issue tx`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );

    this.server.registerTool(
      "issue_crt_with_usdc",
      {
        title: "Issue CRT (by USDC amount)",
        description:
          "Mints CRT by depositing a specific amount of USDC. This is for users who want to invest a fixed amount of stablecoin. This action requires a transaction signature.",
        inputSchema: {
          uiAmount: z
            .number()
            .positive()
            .describe("The amount of USDC to deposit."),
          walletStr: z
            .string()
            .describe(
              "The user's Solana wallet address. This wallet will provide the USDC, sign the transaction, and receive the minted CRT.",
            ),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
        },
      },
      async ({ uiAmount, walletStr }, { sendRequest }) => {
        try {
          const unsignedTx = await this.crtClient.getUnsignedIssueTx(
            uiAmount,
            { selectedMint: USDC_MINT.toString() },
            USDC_MINT.toString(),
            walletStr,
          );
          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to deposit ${uiAmount} USDC for CRT`,
            `Transaction to deposit ${uiAmount} USDC was successful!`,
          );
        } catch (e) {
          logger.error(`Error creating issue tx with USDC`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );

    this.server.registerTool(
      "issue_all_crt",
      {
        title: "Issue CRT with all USDC",
        description:
          "Mints CRT by depositing the entire USDC balance from the user's wallet. Use this for a 'max deposit' action. This action requires a transaction signature.",
        inputSchema: {
          walletStr: z
            .string()
            .describe(
              "The user's Solana wallet address, which holds the USDC to be deposited.",
            ),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
        },
      },
      async ({ walletStr }, { sendRequest }) => {
        try {
          const unsignedTx = await this.crtClient.getUnsignedIssueTx(
            0, // Amount is ignored when issueAll is true
            { issueAll: true },
            USDC_MINT.toString(),
            walletStr,
          );
          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to deposit all available USDC for CRT`,
            `Transaction to deposit all USDC was successful!`,
          );
        } catch (e) {
          logger.error(`Error creating issue_all tx`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );

    // --- Transactional Tools (Redeem/Withdraw) ---

    this.server.registerTool(
      "redeem_crt",
      {
        title: "Redeem CRT (by CRT amount)",
        description:
          "Redeems a specific amount of CRT, burning the tokens in exchange for the underlying stablecoin (e.g., USDC) plus any accrued yield. A 0.05% redemption fee applies. This action requires a transaction signature.",
        inputSchema: {
          uiAmount: z
            .number()
            .positive()
            .describe("The amount of CRT tokens to redeem."),
          walletStr: z
            .string()
            .describe(
              "The user's Solana wallet address. This wallet will provide the CRT, sign the transaction, and receive the stablecoin.",
            ),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
        },
      },
      async ({ uiAmount, walletStr }, { sendRequest }) => {
        try {
          const unsignedTx = await this.crtClient.getUnsignedRedeemTx(
            uiAmount,
            { selectedMint: CRT_MINT.toString() },
            USDC_MINT.toString(),
            walletStr,
          );
          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to redeem ${uiAmount} CRT`,
            `Transaction to redeem ${uiAmount} CRT was successful!`,
          );
        } catch (e) {
          logger.error(`Error creating redeem tx`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );

    this.server.registerTool(
      "redeem_crt_for_usdc",
      {
        title: "Redeem CRT (for USDC amount)",
        description:
          "Redeems CRT to receive a specific target amount of USDC. The server calculates the required CRT to burn based on the current price. Includes accrued yield. A 0.05% redemption fee applies. This action requires a transaction signature.",
        inputSchema: {
          uiAmount: z
            .number()
            .positive()
            .describe("The target amount of USDC to receive."),
          walletStr: z
            .string()
            .describe(
              "The user's Solana wallet address. This wallet will provide the CRT, sign the transaction, and receive the USDC.",
            ),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
        },
      },
      async ({ uiAmount, walletStr }, { sendRequest }) => {
        try {
          const unsignedTx = await this.crtClient.getUnsignedRedeemTx(
            uiAmount,
            { selectedMint: USDC_MINT.toString() },
            USDC_MINT.toString(),
            walletStr,
          );
          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to receive ${uiAmount} USDC`,
            `Transaction to receive ${uiAmount} USDC was successful!`,
          );
        } catch (e) {
          logger.error(`Error creating redeem_for_usdc tx`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );

    this.server.registerTool(
      "redeem_all_crt",
      {
        title: "Redeem all CRT",
        description:
          "Redeems the entire CRT balance from the user's wallet. Use this for a 'full withdrawal' action to receive the underlying stablecoin plus all accrued yield. A 0.05% redemption fee applies. This action requires a transaction signature.",
        inputSchema: {
          walletStr: z
            .string()
            .describe(
              "The user's Solana wallet address which holds the CRT to be redeemed.",
            ),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
        },
      },
      async ({ walletStr }, { sendRequest }) => {
        try {
          const unsignedTx = await this.crtClient.getUnsignedRedeemTx(
            0, // Amount is ignored when redeemAll is true
            { redeemAll: true },
            USDC_MINT.toString(),
            walletStr,
          );
          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to redeem all available CRT`,
            `Transaction to redeem all CRT was successful!`,
          );
        } catch (e) {
          logger.error(`Error creating redeem_all tx`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );
  }

  /**
   * Registers resources that provide contextual information to the LLM.
   */
  private registerResources() {
    this.server.registerResource(
      "protocol-summary",
      "carrot-protocol://summary",
      {
        title: "Carrot Protocol Summary",
        description:
          "A summary of how the Carrot Protocol and the CRT token work, including yield generation and redemption.",
        mimeType: "text/markdown",
      },
      async (): Promise<ReadResourceResult> => {
        const summary = `
# Carrot Protocol (CRT) Overview
- **What it is:** CRT is a yield-bearing token.
- **How to get it:** Users deposit stablecoins (like USDC) to mint CRT 1:1.
- **How it works:** The deposited funds are automatically put into top-tier lending protocols (like Marginfi, Kamino, Mango) to earn yield.
- **Value Accrual:** The yield earned increases the value of the CRT token itself. Your CRT balance doesn't change, but each token becomes worth more over time.
- **Redemption:** You can redeem your CRT at any time to get back your original stablecoin plus the accumulated yield, minus a 0.05% fee.
        `;
        return {
          contents: [
            {
              uri: "carrot-protocol://summary",
              text: summary.trim(),
            },
          ],
        };
      },
    );
  }

  /**
   * Registers prompts that guide users through common workflows.
   */
  private registerPrompts() {
    this.server.registerPrompt(
      "check_yield",
      {
        title: "Check CRT Yield",
        description:
          "Check the current APY for CRT to see the yield you are earning.",
      },
      async (): Promise<GetPromptResult> => {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "What is the current APY for CRT?",
              },
            },
          ],
        };
      },
    );

    this.server.registerPrompt(
      "deposit_usdc",
      {
        title: "Deposit USDC to get CRT",
        description: "Start earning yield by depositing USDC to mint CRT.",
        argsSchema: {
          amount: z
            .string()
            .describe(
              "The amount of USDC to deposit. You can also say 'all' to deposit your entire balance.",
            ),
          wallet: z.string().describe("Your Solana wallet address."),
        },
      },
      async ({ amount, wallet }): Promise<GetPromptResult> => {
        let queryText: string;
        if (amount.toLowerCase() === "all") {
          queryText = `I want to deposit all my USDC from wallet ${wallet} to get CRT.`;
        } else {
          queryText = `I want to deposit ${amount} USDC from wallet ${wallet} to get CRT.`;
        }
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: queryText,
              },
            },
          ],
        };
      },
    );
  }

  /**
   * Handles the elicitation flow for signing transactions.
   * This remains unchanged from your original implementation as it's a solid security pattern.
   */
  private async elicitAndSendTransaction(
    unsignedTx: string,
    sendRequest: (
      req: ServerRequest,
      resultSchema: z.ZodType<any>,
      options?: RequestOptions,
    ) => Promise<any>,
    elicitationMessage: string,
    successMessage: string,
  ): Promise<CallToolResult> {
    logger.info(`Requesting signature from client`, {
      message: elicitationMessage,
    });

    const elicitationResult = await sendRequest(
      {
        method: "elicitation/create",
        params: {
          message: elicitationMessage,
          requestedSchema: {
            type: "object",
            properties: {
              unsignedTx: { type: "string" },
              signedTx: { type: "string" },
            },
            required: ["signedTx"],
          },
          prefilled: {
            unsignedTx,
          },
        },
      },
      z.object({
        action: z.literal("accept"),
        content: z.object({
          signedTx: z.string(),
        }),
      }),
    );

    logger.info(`Received signed transaction, sending`);
    const txSig = await this.crtClient.sendTx(
      elicitationResult.content.signedTx,
    );
    logger.info(`Transaction sent successfully`, { txSig });

    return {
      content: [
        {
          type: "text",
          text: `${successMessage} Transaction Signature: ${txSig}`,
        },
      ],
    };
  }
}
