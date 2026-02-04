# Carrot Protocol MCP Server

An MCP (Model Context Protocol) server that enables AI-powered interaction with the Carrot Protocol - a Solana-based DeFi yield-bearing token system.

## What is this?

This project provides a bridge between Claude AI and the Carrot Protocol, allowing users to:

- **Deposit stablecoins (USDC)** to mint CRT (Carrot Protocol Token)
- **Earn yield** as deposited funds are allocated to lending protocols (Marginfi, Kamino, Mango)
- **Redeem CRT** to withdraw principal plus accumulated yield
- **Interact naturally** using conversational AI through Claude

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │────▶│  CLI Client │────▶│ MCP Server  │────▶│   Carrot    │
│  (Natural   │     │  + Claude   │     │  (Express)  │     │  Protocol   │
│  Language)  │◀────│     AI      │◀────│             │◀────│    API      │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

## Repository Structure

```
mcp-server/
├── server/          # MCP Server - Express.js backend
├── client/          # Interactive CLI with Claude AI
├── infra/           # AWS CDK infrastructure
└── llm/             # LLM configuration files
```

## Quick Start

### Prerequisites

- Node.js 22+
- npm
- Solana keypair (JSON file) for signing transactions
- Anthropic API key

### Server Setup

```bash
cd server
npm install
npm run build
npm start
```

The server starts on `http://localhost:8080`.

### Client Setup

```bash
cd client
npm install
npm run build
```

Create a `.env.local` file:

```env
MCP_SERVER_URL=http://localhost:8080
ANTHROPIC_MODEL_API_KEY=your-anthropic-api-key
```

Place your Solana keypair file as `user1.json` in the client directory.

Run the client:

```bash
npm run local
```

## Client Commands

Once the client is running, you can use these commands:

| Command | Description |
|---------|-------------|
| `send <query>` | Send a natural language query to Claude |
| `list-tools` | Show available MCP tools |
| `list-resources` | Show available MCP resources |
| `list-prompts` | Show available MCP prompts |
| `get-prompt <name>` | Execute a predefined workflow |
| `read-resource <uri>` | Read protocol documentation |
| `help` | Show all commands |
| `exit` | Exit the client |

### Example Interactions

```
> send What is the current APY for CRT?

> send I want to deposit 100 USDC

> send Redeem all my CRT tokens

> get-prompt check_yield
```

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_crt_apy` | Fetch current yield (APY) |
| `issue_crt` | Mint CRT by specifying CRT amount |
| `issue_crt_with_usdc` | Mint CRT by specifying USDC amount |
| `issue_all_crt` | Mint CRT with entire USDC balance |
| `redeem_crt` | Redeem CRT by amount |
| `redeem_crt_for_usdc` | Redeem to get specific USDC amount |
| `redeem_all_crt` | Redeem entire CRT balance |

## Development

### Formatting

```bash
# Format code
make fmt

# Check formatting
make fmt_check
```

### Building

```bash
# Server
cd server && npm run build

# Client
cd client && npm run build
```

### Docker (Server)

```bash
cd server
make push  # Build, tag, and push to AWS ECR
```

## Deployment

### AWS Infrastructure

The project includes AWS CDK infrastructure for production deployment:

```bash
cd infra
npm install
npm run deploy
```

This deploys:
- ECR repository for Docker images
- ECS service running the MCP server
- Application Load Balancer with HTTPS
- CloudWatch logging

### CI/CD

GitHub Actions workflows handle:
- **Server**: Automated builds and ECR pushes on merge to main
- **Client**: Formatting checks on pull requests
- **Infrastructure**: CDK deployment on merge to main

## Configuration

### Blockchain Addresses

| Token | Address |
|-------|---------|
| CRT | `CRTx1JouZhzSU6XytsE42UQraoGqiHgxabocVfARTy2s` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

### API Endpoints

- **Carrot Protocol API**: `https://api.deficarrot.com`

## Technology Stack

- **Runtime**: Node.js 22, TypeScript
- **Server**: Express.js 5.x
- **MCP SDK**: @modelcontextprotocol/sdk
- **AI**: Anthropic Claude (claude-3-haiku)
- **Blockchain**: Solana via @coral-xyz/anchor
- **Infrastructure**: AWS CDK, ECS, ALB
- **Validation**: Zod
- **Logging**: Winston

## Security

- Transaction signing happens client-side only
- Private keys never leave the client
- HTTPS enforced in production
- Session-based authentication with 24-hour timeout

## TODO

- Sticky sessions on ALB
- Privy wallet user in loop
- "Buy 10 bonk" functionality
- "Invest my cash or stables" feature
- Return version for server
- Interactive CRT price chart
- Customized price chart

## License

MIT
