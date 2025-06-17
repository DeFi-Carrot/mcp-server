import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CrtClient } from "./crt.js";
import { USDC_MINT } from "./config.js";
import { z } from "zod";
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

    // send tx
    this.server.tool(
      "send_tx",
      "Sends a transaction to the network",
      {
        signedTx: z
          .string()
          .describe("The signed transaction to send to the network"),
      },
      {
        title: "Send Transaction",
        description: "Sends a transaction to the network",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      async ({ signedTx }) => {
        try {
          const txSig = await this.crtClient.sendTx(signedTx);
          return {
            content: [
              {
                type: "text",
                text: `tx sent successfully, here's the transaction signature: ${txSig}`,
              },
            ],
          };
        } catch (e) {
          return {
            content: [{ type: "text", text: `Error sending tx: ${e}` }],
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
      async ({ uiAmount, walletStr }) => {
        try {
          const unsignedTx = await this.crtClient.getUnsignedIssueTx(
            uiAmount,
            USDC_MINT.toString(),
            walletStr,
          );
          return {
            content: [
              {
                type: "text",
                text: `sign this tx: ${unsignedTx} with ${walletStr} and send it back here using the send_tx tool`,
              },
            ],
          };
        } catch (e) {
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
  }
}
