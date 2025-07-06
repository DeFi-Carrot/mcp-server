import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logger } from "./utils.js";
import { Request, Response } from "express";
import { CarrotMcpServer } from "./mcp.js";
import packageJson from "../package.json" with { type: "json" };
import { randomUUID } from "node:crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  DynamoDbSessionManager,
  InMemorySessionManager,
  SessionManager,
} from "./sessionManager.js";
import { SESSION_TABLE_NAME, SESSION_TIMEOUT_MS } from "./config.js";
const { version } = packageJson;

export class Router {
  private mcpServer: CarrotMcpServer;
  private sessionManager: SessionManager;

  constructor(sessionManager: "memory" | "dynamodb") {
    if (sessionManager === "dynamodb") {
      this.sessionManager = new DynamoDbSessionManager(
        SESSION_TABLE_NAME!,
        SESSION_TIMEOUT_MS,
      );
    } else {
      this.sessionManager = new InMemorySessionManager(SESSION_TIMEOUT_MS);
    }
    logger.info(
      "Router initialized in stateful, multi-session mode with inactivity timeout.",
    );
    this.mcpServer = new CarrotMcpServer();
  }

  getIndex = (_req: Request, res: Response) => {
    res.json({
      name: "Carrot MCP",
      version,
    });
  };

  handleMcpRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport | undefined = undefined;

    if (sessionId) {
      const sessionData = await this.sessionManager.getSession(sessionId);
      if (!sessionData) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // touch the session to reset the timeout
      this.sessionManager.touchSession(sessionId);
    } else if (isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: async (newSessionId) => {
          const sessionData = await this.sessionManager.createSession();
          logger.info(`New MCP session initialized`, {
            sessionId: sessionData.sessionId,
          });
        },
      });

      transport.onclose = async () => {
        if (transport?.sessionId) {
          const sid = transport.sessionId;
          logger.info("Session closed, removing transport and timeout.", {
            sessionId: sid,
          });
          await this.sessionManager.deleteSession(sid);
        }
      };

      await this.mcpServer.initialize(transport);
    }

    if (!transport) {
      res.status(400).json({ error: "Invalid request." });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  };
}
