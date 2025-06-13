import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getCarrotHttpClient } from "./utils.js";
import { CRT_VAULT_ADDRESS } from "./config.js";
import express, { Request, Response, Router } from "express";
import { randomUUID } from "node:crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./mcp.js";

/**
 * A class to encapsulate the MCP server, transport management, and routing logic.
 */
class CarrotMcpRouter {
  public router: Router;
  private mcpServer: McpServer;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } =
    {};

  constructor() {
    this.mcpServer = createMcpServer();
    this.router = Router();
    this.setupRoutes();
  }

  /**
   * Sets up the Express router for handling MCP requests.
   */
  private setupRoutes(): void {
    this.router.post("/", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports[sessionId]) {
        transport = this.transports[sessionId];
      } else if (isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            console.error(`New session initialized: ${newSessionId}`);
            this.transports[newSessionId] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && this.transports[sid]) {
            console.error(`Session closed: ${sid}`);
            delete this.transports[sid];
          }
        };

        await this.mcpServer.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: Missing or invalid mcp-session-id header.",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    });
  }
}

// Instantiate the class and export its router
const carrotRouter = new CarrotMcpRouter();
export const mcpRouter = carrotRouter.router;
