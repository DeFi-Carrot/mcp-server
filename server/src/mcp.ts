import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CrtClient } from "./crt.js";
import { CRT_MINT, CRT_VAULT_ADDRESS, USDC_MINT } from "./config.js";
import { z } from "zod";
import { CRT_MCP_ERROR, logger } from "./utils.js";
import packageJson from "../package.json" with { type: "json" };
import {
  CallToolResult,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
const { version } = packageJson;

export class CarrotMcpServer {
  private server: McpServer;
  private crtClient: CrtClient;

  constructor() {
    // init mcp server with no tools at first
    this.server = new McpServer({
      name: "carrot-mcp-server",
      version,
      capabilities: {
        tools: {},
        elicitation: {},
      },
      instructions:
        "This server provides tools to interact with Carrot Protocol",
    });

    // init crt client
    // this is the carrot protocol http client under the hood
    this.crtClient = new CrtClient();

    // register all available mcp tools
    this.registerTools();
  }

  // called on incoming connections
  async initialize(transport: StreamableHTTPServerTransport) {
    this.server.connect(transport);
    logger.debug(`mcp server connected`);
  }

  registerTools() {
    // get the current APY for the CRT vault
    this.server.tool(
      "get_crt_apy",
      "Gets the current APY for the Carrot Protocol token (CRT)",
      {
        title: "Get CRT APY",
        description: "Gets the current APY for the Carrot Protocol token (CRT)",
        readOnlyHint: true,
      },
      async () => {
        try {
          const apyString = await this.crtClient.getCrtApy();
          logger.info(`crt apy fetched`, { apy: apyString });
          return {
            content: [{ type: "text", text: apyString }],
          };
        } catch (e) {
          return {
            content: [{ type: "text", text: `Error fetching CRT APY: ${e}` }],
            isError: true,
          };
        }
      },
    );

    // issue crt
    this.server.tool(
      "issue_crt",
      "Mints the Carrot Protocol token (CRT)",
      {
        uiAmount: z.number().describe("The amount of CRT to mint"),
        walletStr: z
          .string()
          .describe(
            "The wallet address to use to mint CRT, this must be the signer and this is the destination address for the minted CRT",
          ),
      },
      {
        title: "Issue CRT",
        description: "Mints the Carrot Protocol token (CRT)",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      async ({ uiAmount, walletStr }, { sendRequest }) => {
        try {
          // create unsigned tx
          const unsignedTx = await this.crtClient.getUnsignedIssueTx(
            uiAmount,
            { selectedMint: CRT_MINT.toString() },
            USDC_MINT.toString(),
            walletStr,
          );
          logger.info(`mint tx created`, {
            uiAmount,
            wallet: walletStr,
            inputMint: USDC_MINT.toString(),
          });

          // elicit signature and send tx
          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to mint ${uiAmount} CRT`,
            `Transaction to mint ${uiAmount} CRT was successful!`,
          );
        } catch (e) {
          logger.error(`error creating mint tx`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );

    // mint crt
    this.server.tool(
      "issue_crt_with_usdc",
      "Mints the Carrot Protocol token (CRT) specified in units of USDC",
      {
        uiAmount: z.number().describe("The amount of USDC to use to mint CRT"),
        walletStr: z
          .string()
          .describe(
            "The wallet address to use to mint CRT, this must be the signer and this is the destination address for the minted CRT",
          ),
      },
      {
        title: "Issue CRT with USDC",
        description:
          "Mints the Carrot Protocol token (CRT) specified in units of USDC",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      async ({ uiAmount, walletStr }, { sendRequest }) => {
        try {
          // create unsigned tx
          const unsignedTx = await this.crtClient.getUnsignedIssueTx(
            uiAmount,
            { selectedMint: USDC_MINT.toString() },
            USDC_MINT.toString(),
            walletStr,
          );
          logger.info(`mint tx created`, {
            uiAmount,
            wallet: walletStr,
            inputMint: USDC_MINT.toString(),
          });

          // elicit signature and send tx
          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to mint ${uiAmount} CRT`,
            `Transaction to mint ${uiAmount} CRT was successful!`,
          );
        } catch (e) {
          logger.error(`error creating mint tx`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );

    // mint all crt
    this.server.tool(
      "issue_all_crt",
      "Uses all of the USDC in the wallet to mint CRT",
      {
        walletStr: z
          .string()
          .describe(
            "The wallet address to use to mint CRT, this must be the signer and this is the destination address for the minted CRT",
          ),
      },
      {
        title: "Issue all CRT",
        description: "Uses all of the USDC in the wallet to mint CRT",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      async ({ walletStr }, { sendRequest }) => {
        logger.info(`issue_all_crt start`, {
          wallet: walletStr,
        });
        try {
          const unsignedTx = await this.crtClient.getUnsignedIssueTx(
            100,
            { issueAll: true },
            USDC_MINT.toString(),
            walletStr,
          );
          logger.info(`issue all tx created`, {
            wallet: walletStr,
            inputMint: USDC_MINT.toString(),
          });

          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to issue all CRT`,
            `Transaction to issue all CRT was successful!`,
          );
        } catch (e) {
          logger.error(`error creating issue tx`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );

    // redeem crt
    this.server.tool(
      "redeem_crt_with_desired_crt_amount",
      "Burns the Carrot Protocol token (CRT) in exchange for USDC",
      {
        uiAmount: z.number().describe("The amount of CRT to redeem"),
        walletStr: z
          .string()
          .describe(
            "The wallet address to use to burn CRT, this must be the signer and this is the destination address for the USDC",
          ),
      },
      {
        title: "Redeem CRT with desired CRT amount",
        description:
          "Redeems the Carrot Protocol token (CRT) in exchange for USDC, burning CRT in the process",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      async ({ uiAmount, walletStr }, { sendRequest }) => {
        logger.info(`redeem_crt_with_desired_crt_amount start`, {
          uiAmount,
          wallet: walletStr,
        });
        try {
          const unsignedTx = await this.crtClient.getUnsignedRedeemTx(
            uiAmount,
            { selectedMint: CRT_MINT.toString(), redeemAll: false },
            USDC_MINT.toString(),
            walletStr,
          );
          logger.info(`burn tx created`, {
            uiAmount,
            wallet: walletStr,
            outputMint: USDC_MINT.toString(),
          });

          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to burn ${uiAmount} CRT`,
            `Transaction to burn ${uiAmount} CRT was successful!`,
          );
        } catch (e) {
          logger.error(`error creating burn tx`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );

    // redeem usdc
    this.server.tool(
      "redeem_crt_with_desired_usdc_amount",
      "Redeems the Carrot Protocol token (CRT) in exchange for desired amount of USDC",
      {
        uiAmount: z
          .number()
          .describe(
            "The amount of USDC you wish to receive, use any CRT amount to get the equivalent USDC amount",
          ),
        walletStr: z
          .string()
          .describe(
            "The wallet address to use to burn CRT, this must be the signer and this is the destination address for the USDC",
          ),
      },
      {
        title: "Redeem CRT with desired USDC amount",
        description:
          "Redeems the Carrot Protocol token (CRT) in exchange for desired amount of USDC, burning CRT in the process",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      async ({ uiAmount, walletStr }, { sendRequest }) => {
        try {
          const unsignedTx = await this.crtClient.getUnsignedRedeemTx(
            uiAmount,
            { selectedMint: USDC_MINT.toString(), redeemAll: false },
            USDC_MINT.toString(),
            walletStr,
          );
          logger.info(`burn tx created`, {
            uiAmount,
            wallet: walletStr,
            outputMint: USDC_MINT.toString(),
          });

          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to redeem ${uiAmount} USDC`,
            `Transaction to redeem ${uiAmount} USDC was successful!`,
          );
        } catch (e) {
          logger.error(`error creating burn tx`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );

    // redeem crt
    this.server.tool(
      "redeem_all_crt",
      "Redeems all the Carrot Protocol token (CRT) in the wallet's ATA in exchange for USDC",
      {
        walletStr: z
          .string()
          .describe(
            "The wallet address to use to burn CRT, this must be the signer and this is the destination address for the USDC",
          ),
      },
      {
        title: "Redeem CRT with desired CRT amount",
        description:
          "Redeems the Carrot Protocol token (CRT) in exchange for USDC, burning CRT in the process",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      async ({ walletStr }, { sendRequest }) => {
        logger.info(`redeem_all_crt start`, {
          wallet: walletStr,
        });
        try {
          const unsignedTx = await this.crtClient.getUnsignedRedeemTx(
            100,
            { redeemAll: true }, // redeem all is true, dont need to specify the amount
            USDC_MINT.toString(),
            walletStr,
          );
          logger.info(`burn all tx created`, {
            wallet: walletStr,
            outputMint: USDC_MINT.toString(),
          });

          return await this.elicitAndSendTransaction(
            unsignedTx,
            sendRequest,
            `Please sign the transaction to burn all CRT`,
            `Transaction to burn all CRT was successful!`,
          );
        } catch (e) {
          logger.error(`error creating burn tx`, { error: e });
          return CRT_MCP_ERROR;
        }
      },
    );
  }

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
    // 1. Elicit a signature from the client by sending the unsigned transaction
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
      // Define the expected response schema from the client
      z.object({
        action: z.literal("accept"),
        content: z.object({
          signedTx: z.string(),
        }),
      }),
    );

    // 2. Client returned the signed transaction, now send it to the network.
    logger.info(`Received signed transaction, sending`);
    const txSig = await this.crtClient.sendTx(
      elicitationResult.content.signedTx,
    );
    logger.info(`Transaction sent successfully`, { txSig });

    // 3. Return the success result to the user
    return {
      content: [
        {
          type: "text",
          text: `${successMessage} Signature: ${txSig}`,
        },
      ],
    };
  }
}
