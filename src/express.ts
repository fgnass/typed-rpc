import type { Request, RequestHandler } from "express";
import type { RpcHandlerOptions } from "./server";
import { handleRpc } from "./server";


export interface ServiceFactory {
  (req: Request): object;
}

export function rpcHandler(serviceOrFactory: object | ServiceFactory, options?: RpcHandlerOptions) {
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
