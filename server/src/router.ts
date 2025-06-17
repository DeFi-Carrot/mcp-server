import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logger } from "./utils.js";
import { Request, Response } from "express";
import { createMcpServer } from "./mcp.js";
import packageJson from "../package.json" with { type: "json" };
const { version } = packageJson;

export class Router {
  private mcpServer: McpServer;

  constructor() {
    this.mcpServer = createMcpServer();
  }

  getIndex = (_req: Request, res: Response) => {
    res.json({
      name: "Carrot MCP",
      version,
    });
  };

  handleMcpRequest = async (req: Request, res: Response) => {
    logger.info("handleMcpRequest start", {
      version,
    });

    // create a stateless transport
    // this will support most operations except for SSE streaming back to server
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless transport
    });

    // connect the transport to the mcp server
    await this.mcpServer.connect(transport);

    // return the response from the mcp server
    await transport.handleRequest(req, res, req.body);

    logger.info("handleMcpRequest end", {
      version,
    });
  };
}
