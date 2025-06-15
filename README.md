# mcp-server

general mcp server for carrot


## setup

```bash
# required for now until claude natively supports remote MCP servers (i think it should be soon)
npm install -g mcp-remote

# get path of node and add to PATH env, we need to ensure we are using an up to date version
which node

# update claude config
vim ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

```json
"carrot": {
  "command": "mcp-remote",
  "args": [
    "http://localhost:8080/mcp",
    "--allow-http"
  ],
  "env": {
    "PATH": "/Users/jack/.nvm/versions/node/v22.4.0/bin"
  }
}
```

```json
"carrot": {
  "command": "mcp-remote",
  "args": [
    "https://mcp.deficarrot.com/mcp"
  ],
  "env": {
    "PATH": "/Users/jack/.nvm/versions/node/v22.4.0/bin"
  }
}
```
