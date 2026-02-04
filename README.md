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

## Quick Start

### Prerequisites

- Node.js 22+
- npm
- Solana keypair (JSON file) for signing transactions
- Anthropic API key

### Setup

```bash
cd client
npm install
npm run build
```

Create a `.env.local` file:

```env
MCP_SERVER_URL=https://mcp.deficarrot.com/mcp
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

## Configuration

### MCP Server

The production MCP server is hosted at:

```
https://mcp.deficarrot.com/mcp
```

### Blockchain Addresses

| Token | Address |
|-------|---------|
| CRT | `CRTx1JouZhzSU6XytsE42UQraoGqiHgxabocVfARTy2s` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

## Security

- Transaction signing happens client-side only
- Private keys never leave the client
- HTTPS enforced in production
- Session-based authentication with 24-hour timeout

## Development

For contributors working on the server or infrastructure:

### Repository Structure

```
mcp-server/
├── server/          # MCP Server - Express.js backend
├── client/          # Interactive CLI with Claude AI
├── infra/           # AWS CDK infrastructure
└── llm/             # LLM configuration files
```

### Local Server Development

```bash
cd server
npm install
npm run build
npm start  # Starts on http://localhost:8080
```

### Formatting

```bash
make fmt        # Format code
make fmt_check  # Check formatting
```

## License

MIT
