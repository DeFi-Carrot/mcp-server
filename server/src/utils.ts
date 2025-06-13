import { Client as CarrotHttpClient } from "@carrot-protocol/http-client";
import { CARROT_API_URL } from "./config.js";
import winston from "winston";

export function getCarrotHttpClient() {
  return new CarrotHttpClient(CARROT_API_URL);
}

// Base logger configuration
const loggerConfig = {
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf((info) => {
      const { timestamp, level, message, service, ...metadata } = info;
      return (
        `${timestamp} [${level}] [${service}]: ${message}` +
        (Object.keys(metadata).length ? ` ${JSON.stringify(metadata)}` : "")
      );
    }),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
};

// Create the base logger
export const logger = winston.createLogger({
  ...loggerConfig,
  defaultMeta: { service: "mcp-server" },
});
