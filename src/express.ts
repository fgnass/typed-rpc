import type { Request, RequestHandler } from "express";
import { RpcHandlerOptions, RpcService, handleRpc } from "./server.js";

export type RpcServiceFactory<T> = (req: Request) => RpcService<T>;

export function rpcHandler<T extends RpcService<T>>(
  serviceOrFactory: T | RpcServiceFactory<T>,
  options?: RpcHandlerOptions
) {
  const handler: RequestHandler = (req, res, next) => {
    const service =
      typeof serviceOrFactory === "function"
        ? serviceOrFactory(req)
        : serviceOrFactory;

    handleRpc(req.body, service, options)
      .then((result) => res.json(result))
      .catch(next);
  };

  return handler;
}
