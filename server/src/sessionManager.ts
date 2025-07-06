import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { logger } from "./utils.js";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// --- DynamoDB Client Setup ---
// The AWS SDK will automatically use credentials from the environment (e.g., IAM role).
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Represents the data stored for a session.
 */
export interface SessionData {
  sessionId: string;
  updatedAt: number;
  ttl: number;
}

export function getRemainingTtl(sessionData: SessionData): number {
  return sessionData.ttl - sessionData.updatedAt;
}

/**
 * Abstract class defining the interface for session management.
 * This allows swapping implementations for local testing vs. production.
 */
export abstract class SessionManager {
  /**
   * Retrieves session data for a given session ID.
   * @param sessionId The ID of the session to retrieve.
   * @returns The session data, or undefined if not found.
   */
  abstract getSession(sessionId: string): Promise<SessionData | undefined>;

  /**
   * Creates a new session and returns its data.
   * @returns The newly created session data.
   */
  abstract createSession(sessionId: string): Promise<SessionData>;

  /**
   * Deletes a session.
   * @param sessionId The ID of the session to delete.
   */
  abstract deleteSession(sessionId: string): Promise<void>;

  /**
   * "Touches" a session to update its last-accessed time and extend its lifetime (TTL).
   * @param sessionId The ID of the session to update.
   */
  abstract touchSession(sessionId: string): Promise<void>;
}

/**
 * In-memory implementation of SessionManager for local development and testing.
 * It mimics the original stateful behavior of the router.
 */
export class InMemorySessionManager extends SessionManager {
  private sessions = new Map<string, SessionData>();
  private sessionTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly sessionTimeoutMs: number;
  private transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(sessionTimeoutMs: number) {
    super();
    this.sessionTimeoutMs = sessionTimeoutMs;
    this.transports = new Map<string, StreamableHTTPServerTransport>();
    logger.info("Using InMemorySessionManager for session storage.", {
      sessionTimeoutMs,
    });
  }

  private resetSessionTimeout(sessionId: string) {
    if (this.sessionTimeouts.has(sessionId)) {
      clearTimeout(this.sessionTimeouts.get(sessionId));
    }
    const timeout = setTimeout(() => {
      logger.info("In-memory session timed out due to inactivity.", {
        sessionId,
      });
      this.deleteSession(sessionId);
    }, this.sessionTimeoutMs);
    this.sessionTimeouts.set(sessionId, timeout);
  }

  async getSession(sessionId: string): Promise<SessionData | undefined> {
    return this.sessions.get(sessionId);
  }

  async createSession(sessionId: string): Promise<SessionData> {
    const session: SessionData = {
      sessionId,
      updatedAt: Math.floor(Date.now()),
      ttl: Math.floor(Date.now()) + this.sessionTimeoutMs,
    };
    this.sessions.set(sessionId, session);
    this.resetSessionTimeout(sessionId);
    logger.info("New in-memory session created", { sessionId });
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }
    logger.info("In-memory session deleted", { sessionId });
  }

  async touchSession(sessionId: string): Promise<void> {
    this.resetSessionTimeout(sessionId);
  }
}

/**
 * DynamoDB implementation of SessionManager for production environments.
 */
export class DynamoDbSessionManager extends SessionManager {
  private readonly tableName: string;
  private readonly sessionTimeoutMs: number;

  constructor(tableName: string, sessionTimeoutMs: number) {
    super();
    this.tableName = tableName;
    this.sessionTimeoutMs = sessionTimeoutMs;
    logger.info("Using DynamoDbSessionManager for session storage.", {
      tableName,
      sessionTimeoutMs,
    });
  }

  async getSession(sessionId: string): Promise<SessionData | undefined> {
    try {
      const { Item } = await docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { sessionId },
        }),
      );
      return Item as SessionData | undefined;
    } catch (error) {
      logger.error("DynamoDB getSession failed", { sessionId, error });
      return undefined;
    }
  }

  async createSession(sessionId: string): Promise<SessionData> {
    const session: SessionData = {
      sessionId,
      updatedAt: Math.floor(Date.now() / 1000),
      ttl: Math.floor(Date.now() / 1000) + this.sessionTimeoutMs,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: session,
        }),
      );
      logger.info("New session created in DynamoDB", {
        sessionId,
      });
      return session;
    } catch (error) {
      logger.error("Failed to create session in DynamoDB", { error });
      throw new Error("Failed to create session in backend store.");
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { sessionId },
        }),
      );
      logger.info("DynamoDB session deleted", { sessionId });
    } catch (error) {
      logger.error("Failed to delete session from DynamoDB", {
        sessionId,
        error,
      });
    }
  }

  async touchSession(sessionId: string): Promise<void> {
    const newTtl = Math.floor(Date.now() / 1000) + this.sessionTimeoutMs;
    const updatedSession = {
      sessionId,
      createdAt: new Date().toISOString(),
      ttl: newTtl,
    };
    try {
      await docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: updatedSession,
        }),
      );
    } catch (error) {
      logger.error("Failed to touch session in DynamoDB", {
        sessionId,
        error,
      });
    }
  }
}
