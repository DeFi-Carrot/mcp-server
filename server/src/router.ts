import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logger } from "./utils.js";
import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./mcp.js";
import packageJson from "../package.json" with { type: "json" };
const { version } = packageJson;

export class Router {
  private mcpServer: McpServer;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } =
    {};

  constructor() {
    this.mcpServer = createMcpServer();
  }

  getIndex = (_req: Request, res: Response) => {
    logger.info("getIndex start", {
      version,
    });
    res.json({
      name: "Carrot MCP",
      version,
    });
  };

  handleMcpRequest = async (req: Request, res: Response) => {
    logger.info("handleMcpRequest start", {
      version,
    });

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && this.transports[sessionId]) {
      // if sessionId is found in transports, use the existing transport
      logger.info("sessionId found in transports", {
        sessionId,
      });
      transport = this.transports[sessionId];
    } else if (isInitializeRequest(req.body)) {
      // if sessionId is not found in transports, but is a valid initialize request, create a new transport
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          logger.info("New session initialized", {
            sessionId: newSessionId,
          });
          this.transports[newSessionId] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && this.transports[sid]) {
          logger.info("Session closed", {
            sessionId: sid,
          });
          delete this.transports[sid];
        }
      };

      await this.mcpServer.connect(transport);
    } else {
      // if sessionId is not found in transports, and is not a valid initialize request, return a bad request error
      const errMsg = "Bad Request: Missing or invalid mcp-session-id header";
      logger.error(errMsg);
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: errMsg,
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  };
}
