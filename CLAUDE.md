# CLAUDE.md

This file provides context for Claude Code when working with this repository.

## Project Overview

This is an MCP (Model Context Protocol) Server for the Carrot Protocol - a Solana-based DeFi yield-bearing token system. The project enables AI-powered interaction with blockchain operations for minting and redeeming CRT (Carrot Protocol Token).

## Repository Structure

```
mcp-server/
├── server/          # MCP Server (Express + Carrot Protocol integration)
├── client/          # Interactive CLI Client (Node.js + Claude AI)
├── infra/           # AWS CDK Infrastructure as Code
├── llm/             # LLM-related files
└── makefile         # Root-level development commands
```

## Key Components

### Server (`/server`)
- **Entry point**: `src/index.ts` - Starts Express server on port 8080
- **MCP tools**: `src/mcp.ts` - Defines 7 blockchain operation tools
- **Session management**: `src/router.ts` - Multi-session HTTP transport with 24hr timeout
- **Protocol client**: `src/crt.ts` - Carrot Protocol API wrapper
- **Configuration**: `src/config.ts` - Blockchain addresses and API endpoints

### Client (`/client`)
- **Entry point**: `src/index.ts` - Interactive CLI with readline interface
- **MCP client**: `src/mcp.ts` - Claude AI integration and tool execution
- **Configuration**: `src/config.ts` - Environment variables and model settings

### Infrastructure (`/infra`)
- **CDK Stack**: `lib/mcp-server.ts` - ECS, ALB, ECR deployment to AWS

## Common Commands

```bash
# Server
cd server && npm install && npm run build && npm start

# Client
cd client && npm install && npm run build
npm run local   # Uses .env.local
npm run prod    # Uses .env.prod

# Formatting
make fmt        # Format code with Prettier
make fmt_check  # Check formatting

# Docker (server)
cd server && make push  # Build and push to ECR

# Infrastructure
cd infra && npm run deploy
```

## MCP Tools Available

| Tool | Description |
|------|-------------|
| `get_crt_apy` | Fetch current yield (APY) |
| `issue_crt` | Mint CRT by specifying CRT amount |
| `issue_crt_with_usdc` | Mint CRT by specifying USDC amount |
| `issue_all_crt` | Mint CRT with entire USDC balance |
| `redeem_crt` | Redeem CRT by amount |
| `redeem_crt_for_usdc` | Redeem to get specific USDC amount |
| `redeem_all_crt` | Redeem entire CRT balance |

## Important Addresses

- **CRT Mint**: `CRTx1JouZhzSU6XytsE42UQraoGqiHgxabocVfARTy2s`
- **USDC Mint**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **MCP Server (Production)**: `https://mcp.deficarrot.com/mcp`
- **Carrot API**: `https://api.deficarrot.com`

## Environment Variables

### Client
- `MCP_SERVER_URL` - URL of the MCP server
- `ANTHROPIC_MODEL_API_KEY` - Anthropic API key for Claude
- Requires `user1.json` - Solana keypair file for signing transactions

## Architecture Flow

```
User → CLI Client → Claude AI → MCP Server → Carrot Protocol API → Solana Blockchain
                        ↑                           ↓
                   Tool calls              Unsigned transactions
                        ↓                           ↓
                   Client signs          Signed tx broadcast
```

## Development Notes

- TypeScript with strict typing throughout
- Zod for runtime validation
- Winston for structured logging
- Multi-stage Docker builds for production
- GitHub Actions CI/CD for automated deployments
