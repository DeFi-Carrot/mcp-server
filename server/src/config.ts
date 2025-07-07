import { web3 } from "@coral-xyz/anchor";

export const CRT_MINT = new web3.PublicKey(
  "CRTx1JouZhzSU6XytsE42UQraoGqiHgxabocVfARTy2s",
);

export const CRT_MINT_DECIMALS = 9;

export const CRT_VAULT_ADDRESS = new web3.PublicKey(
  "FfCRL34rkJiMiX5emNDrYp3MdWH2mES3FvDQyFppqgpJ",
);

export const CARROT_API_URL = "https://api.deficarrot.com";

export const USDC_MINT = new web3.PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

// default to memory session manager
export const SESSION_MANAGER =
  (process.env.SESSION_MANAGER?.toString() as "memory" | "dynamodb") ??
  "memory";

// for dynamodb session manager
export const SESSION_TABLE_NAME: string | undefined =
  process.env.SESSION_TABLE_NAME?.toString();

export const SESSION_TIMEOUT_MS = Number(
  process.env.SESSION_TIMEOUT_MS ?? 86000 * 1000, // default 24 hours
);

// standard mcp session id header
export const MCP_SESSION_ID_HEADER = "mcp-session-id";
