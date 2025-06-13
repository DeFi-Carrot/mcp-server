# mcp-server

general mcp server for carrot


## setup

```bash
# required for now until claude natively supports remote MCP servers (i think it should be soon)
npm install -g mcp-remote

# get absolute path of mcp-remote binary to prevent npm version issues
which mcp-remote

# update claude config
vim ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

```json
"carrot": {
  "command": "/Users/jack/.nvm/versions/node/v22.4.0/bin/mcp-remote",
  "args": [
    "http://localhost:8080/mcp",
    "--allow-http"
  ]
}
```
