import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logger } from "./utils.js";
import { Request, Response } from "express";
import { CarrotMcpServer } from "./mcp.js";
import packageJson from "../package.json" with { type: "json" };
import { randomUUID } from "node:crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
const { version } = packageJson;
const SESSION_TIMEOUT_MS = 1 * 60 * 1000; // 1 minute

export class Router {
  private mcpServer: CarrotMcpServer;
  private transports = new Map<string, StreamableHTTPServerTransport>();
  private sessionTimeouts = new Map<string, NodeJS.Timeout>();

  constructor() {
    logger.info(
      "Router initialized in stateful, multi-session mode with inactivity timeout.",
    );
    this.mcpServer = new CarrotMcpServer();
  }

  // --- NEW: Function to reset the inactivity timer for a session ---
  private resetSessionTimeout(sessionId: string) {
    // Clear any existing timer for this session
    if (this.sessionTimeouts.has(sessionId)) {
      clearTimeout(this.sessionTimeouts.get(sessionId));
    }

    // Set a new timer
    const timeout = setTimeout(() => {
      logger.info("Session timed out due to inactivity.", { sessionId });
      const transport = this.transports.get(sessionId);
      if (transport) {
        transport.close(); // This will trigger the onclose handler
      }
      // The onclose handler will remove it from the maps
    }, SESSION_TIMEOUT_MS);

    this.sessionTimeouts.set(sessionId, timeout);
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
      transport = this.transports.get(sessionId);
      if (!transport) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      this.resetSessionTimeout(sessionId);
    } else if (isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          logger.info(`New MCP session initialized`, {
            sessionId: newSessionId,
          });
          this.transports.set(newSessionId, transport!);
          // --- NEW: Start the inactivity timer for the new session ---
          this.resetSessionTimeout(newSessionId);
        },
      });

      transport.onclose = () => {
        if (transport?.sessionId) {
          const sid = transport.sessionId;
          logger.info("Session closed, removing transport and timeout.", {
            sessionId: sid,
          });
          // --- NEW: Clean up both the transport and the timeout timer ---
          this.transports.delete(sid);
          clearTimeout(this.sessionTimeouts.get(sid));
          this.sessionTimeouts.delete(sid);
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
