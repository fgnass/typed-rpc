import type {
  JsonRpcRequest,
  JsonRpcErrorResponse,
  JsonRpcSuccessResponse,
} from "./types.d.js";

/**
 * Type guard to check if a given object is a valid JSON-RPC request.
 */
export function isJsonRpcRequest(req: any): req is JsonRpcRequest {
  if (req.jsonrpc !== "2.0") return false;
  if (typeof req.method !== "string") return false;
  if (!Array.isArray(req.params)) return false;
  return true;
}

/**
 * Type guard to check if an object has a certain property.
 */
function hasProperty<T, P extends string>(
  obj: T,
  prop: P
): obj is T & Record<P, unknown> {
  return typeof obj === "object" && obj !== null && prop in obj;
}

/**
 * Type guard to check if an object has a certain method.
 */
function hasMethod<T, P extends string>(
  obj: T,
  prop: P
): obj is T & Record<P, (...params: any[]) => any> {
  return hasProperty(obj, prop) && typeof obj[prop] === "function";
}

function getErrorCode(err: unknown) {
  if (hasProperty(err, "code") && typeof err.code === "number") {
    return err.code;
  }
  return -32000;
}

function getErrorMessage(err: unknown) {
  if (hasProperty(err, "message") && typeof err.message === "string") {
    return err.message;
  }
  return "";
}

function getErrorData(err: unknown) {
  if (hasProperty(err, "data")) {
    return (err.data = JSON.parse(JSON.stringify(err.data)));
  }
}

/**
 * Returns the id or null if there is no valid id.
 */
function getRequestId(req: unknown) {
  if (hasProperty(req, "id")) {
    const id = req.id;
    if (typeof id === "string" || typeof id === "number") return id;
  }
  return null;
}

/**
 * Valid RPC return types that can be serialized.
 */
export type RpcResult =
  | string
  | number
  | boolean
  | null
  | RpcResult[]
  | { [key: string]: RpcResult };

/**
 * Signature that all RPC methods must adhere to.
 */
export type RpcMethod = (...args: any[]) => RpcResult | Promise<RpcResult>;

/**
 * Conditional type to verify a given type is a valid RPC method.
 */
type ValidMethod<T> = T extends RpcMethod ? T : never;

/**
 * Conditional type to verify that a function is also a valid RPC method.
 */
type RpcServiceProp<T> = T extends (...args: any) => any ? ValidMethod<T> : T;

/**
 * Type for RPC services that makes sure that all return values can
 * be serialized.
 */
export type RpcService<T> = { [K in keyof T]: RpcServiceProp<T[K]> };

export async function handleRpc<T extends RpcService<T>>(
  request: unknown,
  service: T
): Promise<JsonRpcErrorResponse | JsonRpcSuccessResponse> {
  const id = getRequestId(request);
  if (!isJsonRpcRequest(request)) {
    //The JSON sent is not a valid Request object
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: "Invalid Request" },
    };
  }
  const { jsonrpc, method, params } = request;
  if (!hasMethod(service, method)) {
    return {
      jsonrpc,
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }
  try {
    const result = await service[method as keyof T](...params);
    return { jsonrpc, id, result };
  } catch (err) {
    return {
      jsonrpc,
      id,
      error: {
        code: getErrorCode(err),
        message: getErrorMessage(err),
        data: getErrorData(err),
      },
    };
  }
}
