#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { McpServer } from "../lib/mcp-server";

const app = new cdk.App();
new McpServer(app, "CarrotMcpServer", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
