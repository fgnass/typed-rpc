export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params: any[];
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
}

export interface JsonRpcErrorResponse extends JsonRpcResponse {
  error: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JsonRpcSuccessResponse extends JsonRpcResponse {
  result: any;
}

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

export interface RpcHandlerOptions {
  getErrorCode?: (err: unknown) => number;
  getErrorMessage?: (err: unknown) => string;
}

export async function handleRpc(
  request: JsonRpcRequest,
  service: object,
  options?: RpcHandlerOptions,
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
    console.log("Method %s not found", method, service);
    return {
      jsonrpc,
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }
  try {
    const result = await service[method](...params);
    return { jsonrpc, id, result };
  } catch (err) {
    return {
      jsonrpc,
      id,
      error: {
        code: (options?.getErrorCode ?? getErrorCode)(err),
        message: (options?.getErrorMessage ?? getErrorMessage)(err),
      },
    };
  }
}
