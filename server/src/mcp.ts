import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CrtClient } from "./crt.js";
import { USDC_MINT } from "./config.js";
import { z } from "zod";
import { logger } from "./utils.js";
import packageJson from "../package.json" with { type: "json" };
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

    // mint crt
    this.server.tool(
      "mint_crt",
      "Mints the Carrot Protocol token (CRT)",
      {
        uiAmount: z.number().describe("The amount of USDC to use to mint CRT"),
        walletStr: z
          .string()
          .describe(
            "The wallet address to use to mint CRT, this must be the signer and this is the destination address for the minted CRT",
          ),
      },
      {
        title: "Mint CRT",
        description: "Mints the Carrot Protocol token (CRT)",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      async ({ uiAmount, walletStr }, { sendRequest }) => {
        try {
          const mint = USDC_MINT.toString();
          const unsignedTx = await this.crtClient.getUnsignedIssueTx(
            uiAmount,
            mint,
            walletStr,
          );
          logger.info(`mint tx created`, {
            uiAmount,
            wallet: walletStr,
            inputMint: mint,
          });

          const elicitationResult = await sendRequest(
            {
              method: "elicitation/create",
              params: {
                message: `Please sign the transaction to mint ${uiAmount} CRT.`,
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

          // 2. Client returned the signed transaction, now send it.
          logger.info(`Received signed transaction, sending to network...`);
          const txSig = await this.crtClient.sendTx(
            elicitationResult.content.signedTx,
          );
          logger.info(`tx sent`, { txSig });
          return {
            content: [
              {
                type: "text",
                text: `Transaction to mint ${uiAmount} CRT was successful! Signature: ${txSig}`,
              },
            ],
          };
        } catch (e) {
          logger.error(`error creating mint tx`, { error: e });
          return {
            content: [
              {
                type: "text",
                text: `Error creating unsigned tx for minting CRT: ${e}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // burn crt
    this.server.tool(
      "burn_crt",
      "Burns the Carrot Protocol token (CRT) in exchange for USDC",
      {
        uiAmount: z.number().describe("The amount of CRT to use to burn"),
        walletStr: z
          .string()
          .describe(
            "The wallet address to use to burn CRT, this must be the signer and this is the destination address for the USDC",
          ),
      },
      {
        title: "Burn CRT",
        description:
          "Burns the Carrot Protocol token (CRT) in exchange for USDC",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      async ({ uiAmount, walletStr }, { sendRequest }) => {
        try {
          const unsignedTx = await this.crtClient.getUnsignedRedeemTx(
            uiAmount,
            USDC_MINT.toString(),
            walletStr,
          );
          logger.info(`burn tx created`, {
            uiAmount,
            wallet: walletStr,
            outputMint: USDC_MINT.toString(),
          });

          const elicitationResult = await sendRequest(
            {
              method: "elicitation/create",
              params: {
                message: `Please sign the transaction to mint ${uiAmount} CRT.`,
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

          // 2. Client returned the signed transaction, now send it.
          logger.info(`Received signed transaction, sending to network...`);
          const txSig = await this.crtClient.sendTx(
            elicitationResult.content.signedTx,
          );

          logger.info(`tx sent`, { txSig });
          return {
            content: [
              {
                type: "text",
                text: `Transaction to burn ${uiAmount} CRT was successful! Signature: ${txSig}`,
              },
            ],
          };
        } catch (e) {
          logger.error(`error creating burn tx`, { error: e });
          return {
            content: [
              {
                type: "text",
                text: `Error creating unsigned tx for burning CRT: ${e}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  }
}
