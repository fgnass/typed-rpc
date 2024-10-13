import {
  type JsonRpcRequest,
  type JsonRpcErrorResponse,
  type JsonRpcSuccessResponse,
  type RpcTranscoder,
  NOTIFY_MARKER,
} from "./types.js";

export * from "./types.js";

/**
 * Type guard to check if a given object is a valid JSON-RPC request.
 */
export function isJsonRpcRequest(req: any): req is JsonRpcRequest {
  if (req.jsonrpc !== "2.0") return false;
  if (typeof req.method !== "string") return false;
  if (!Array.isArray(req.params) && req.params !== undefined) return false;
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
    const stringifiedData = JSON.stringify(err.data);
    if (stringifiedData !== undefined) {
      err.data = JSON.parse(stringifiedData);
    }
    return err.data;
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

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Signature that all RPC methods must adhere to.
 */
export type RpcMethod<V = JsonValue> = (...args: any[]) => V | Promise<V>;

/**
 * Conditional type to verify a given type is a valid RPC method.
 */
type ValidMethod<T, V> = T extends RpcMethod<V> ? T : never;

/**
 * Conditional type to verify that a function is also a valid RPC method.
 */
type RpcServiceProp<T, V> = T extends (...args: any) => any
  ? ValidMethod<T, V>
  : T;

/**
 * Type for RPC services that makes sure that all return values can
 * be serialized.
 */
export type RpcService<T, V> = { [K in keyof T]: RpcServiceProp<T[K], V> };

/**
 * Options to customize the behavior of the RPC handler.
 */
export type RpcHandlerOptions<V> = {
  transcoder?: RpcTranscoder<V>;
  onError?: (err: unknown) => void;
  getErrorCode?: (err: unknown) => number;
  getErrorMessage?: (err: unknown) => string;
  getErrorData?: (err: unknown) => unknown;
  onNotify?: (result: JsonRpcSuccessResponse) => void;
};

export async function handleRpc<T extends RpcService<T, V>, V = JsonValue>(
  request: unknown,
  service: T,
  options?: RpcHandlerOptions<V>
): Promise<JsonRpcErrorResponse | JsonRpcSuccessResponse> {
  const req = options?.transcoder?.deserialize(request) ?? request;
  const id = getRequestId(req);
  const res = (data: any) => {
    const raw = {
      jsonrpc: "2.0",
      id,
      ...data,
    };
    return options?.transcoder?.serialize(raw) ?? raw;
  };

  if (!isJsonRpcRequest(req)) {
    //The JSON sent is not a valid Request object
    return res({ error: { code: -32600, message: "Invalid Request" } });
  }
  let { method, params } = req;
  if (!hasMethod(service, method)) {
    return res({
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  }
  try {
    if (params) {
      params = params.map((param, index) => {
        if (typeof param === 'object' && param.type === NOTIFY_MARKER) {
          return (...params: JsonValue[]) => {
            if (options?.onNotify) {
              const data: any = { params };
              data[NOTIFY_MARKER] = index;
              options.onNotify(res(data));
            }
          };
        }
        return param;
      });
    }
    const result = await service[method as keyof T](...params ?? []);
    return res({ result });
  } catch (err) {
    if (options?.onError) {
      options.onError(err);
    }
    return res({
      error: {
        code: (options?.getErrorCode ?? getErrorCode)(err),
        message: (options?.getErrorMessage ?? getErrorMessage)(err),
        data: (options?.getErrorData ?? getErrorData)(err),
      },
    });
  }
}
