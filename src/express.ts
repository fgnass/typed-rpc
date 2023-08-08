import type { Request, RequestHandler } from "express";
import { RpcService, handleRpc } from "./server";

export type RpcServiceFactory<T> = (req: Request) => RpcService<T>;

export function rpcHandler<T extends RpcService<T>>(
  serviceOrFactory: T | RpcServiceFactory<T>
) {
  const handler: RequestHandler = (req, res, next) => {
    const service =
      typeof serviceOrFactory === "function"
        ? serviceOrFactory(req)
        : serviceOrFactory;

    handleRpc(req.body, service)
      .then((result) => res.json(result))
      .catch(next);
  };

  return handler;
}
