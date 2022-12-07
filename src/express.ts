import type { Request, RequestHandler } from "express";
import { handleRpc } from "./server";


export interface ServiceFactory {
  (req: Request): object;
}

export function rpcHandler(serviceOrFactory: object | ServiceFactory) {
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
