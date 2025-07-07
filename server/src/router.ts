import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logger } from "./utils.js";
import { Request, Response } from "express";
import { CarrotMcpServer } from "./mcp.js";
import packageJson from "../package.json" with { type: "json" };
import { randomUUID } from "node:crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  DynamoDbSessionManager,
  getRemainingTtl,
  InMemorySessionManager,
  SessionManager,
} from "./sessionManager.js";
import {
  MCP_SESSION_ID_HEADER,
  SESSION_TABLE_NAME,
  SESSION_TIMEOUT_MS,
} from "./config.js";
const { version } = packageJson;

export class Router {
  private mcpServer: CarrotMcpServer;
  private sessionManager: SessionManager;
  private transports = new Map<string, StreamableHTTPServerTransport>();

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
    const sessionId = req.headers[MCP_SESSION_ID_HEADER] as string | undefined;

    // --- Handle Initialization Request ---
    if (isInitializeRequest(req.body) && !sessionId) {
      // initialize a new session
      try {
        // create a new transport
        let newSessionId: string = "";
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: async (sessionId) => {
            this.transports.set(sessionId, transport);
            const session = await this.sessionManager.createSession(sessionId);
            newSessionId = session.sessionId;
          },
        });

        // set cleanup transport and session on connection close
        transport.onclose = () => {
          this.transports.delete(newSessionId);
          this.sessionManager.deleteSession(newSessionId);
          logger.info(
            "Live transport and session cleaned up on connection close.",
            { sessionId: newSessionId },
          );
        };

        // initialize the transport
        await this.mcpServer.initialize(transport);

        // handle the request
        await transport.handleRequest(req, res, req.body);

        return;
      } catch (error) {
        logger.error("Session creation or initialization failed", { error });
        res.status(500).json({ error: "Failed to initialize session." });
        return;
      }
    }

    // if no session id, return an error
    if (!sessionId) {
      res.status(400).json({
        error: `Invalid request: ${MCP_SESSION_ID_HEADER} header is required.`,
      });
      return;
    }

    // find the transport for the session
    const transport = this.transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    // update the session's last accessed time
    await this.sessionManager.touchSession(sessionId);

    await transport.handleRequest(req, res, req.body);
  };
}
