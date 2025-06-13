import express, { NextFunction } from "express";
import { Router } from "./router.js";

export class Api {
  private app: express.Express;

  constructor() {
    const router = new Router();
    const app = express();

    app.use(express.json());

    // routes
    app.get("/", router.getIndex);
    app.post("/mcp", asyncHandler(router.handleMcpRequest));

    this.app = app;
  }

  async listen(port: number = 8080): Promise<void> {
    this.app.listen(port, () => {});
  }
}

// Wrap async handlers for thrown error propagation to error middleware
function asyncHandler(fn: any) {
  return function (req: any, res: any, next: any) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}
