export const MODEL_NAME = "claude-3-haiku-20240307";

// read from env var and just check if it's a valid url
export const MCP_SERVER_URL = process.env.MCP_SERVER_URL!.toString();

export const ANTHROPIC_MODEL_API_KEY =
  process.env.ANTHROPIC_MODEL_API_KEY!.toString();
