import express from "express";
import { mcpRouter } from "./router.js";

// Create the main Express application
const app = express();

// Use middleware to parse JSON request bodies
app.use(express.json());

// index route
app.use("/", (_req, res) => {
  res.sendStatus(200);
});

// Mount the MCP router to handle all /mcp traffic
app.use("/mcp", mcpRouter);

// Start the server
async function main() {
  app.listen(8080);
}

// Run the server
main();
