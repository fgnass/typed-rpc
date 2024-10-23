import {
  type JsonRpcErrorResponse,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type RpcTranscoder,
} from "./types.js";

export * from "./types.js";

/**
 * Type guard to check if a given object is a valid JSON-RPC response.
 */
export function isJsonRpcResponse(res: unknown): res is JsonRpcResponse {
  if (typeof res !== "object" || res === null) return false;
  if (!("jsonrpc" in res) || res.jsonrpc !== "2.0") return false;
  if (
    !("id" in res) ||
    (typeof res.id !== "string" &&
      typeof res.id !== "number" &&
      res.id !== null)
  )
    return false;

  if ("result" in res) {
    // Check for JsonRpcSuccessResponse
    return !("error" in res);
  } else if ("error" in res) {
    // Check for JsonRpcErrorResponse
    const error = (res as JsonRpcErrorResponse).error;
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "number" &&
      "message" in error &&
      typeof error.message === "string"
    );
  }

  return false;
}

/**
 * Error class that is thrown if a remote method returns an error.
 */
export class RpcError extends Error {
  code: number;
  data?: unknown;

  constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
    // https://www.typescriptlang.org/docs/handbook/2/classes.html#inheriting-built-in-types
    Object.setPrototypeOf(this, RpcError.prototype);
  }
}

/**
 * Interface for custom transports. Implementations are expected to serialize
 * the given request and return an object that is a JsonRpcResponse.
 */
export type RpcTransport = (
  req: JsonRpcRequest,
  abortSignal: AbortSignal
) => Promise<JsonRpcResponse>;

export type RpcUuid = () => number | string;

type RpcClientOptions =
  | string
  | ((FetchOptions | { transport: RpcTransport }) & {
      transcoder?: RpcTranscoder<any>;
      uuid?: RpcUuid;
    });

type FetchOptions = {
  url: string;
  transport?: never;
  credentials?: RequestCredentials;
  getHeaders?():
    | Record<string, string>
    | Promise<Record<string, string>>
    | undefined;
};

type Promisify<T> = T extends (...args: any[]) => Promise<any>
  ? T // already a promise
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : T; // not a function;

type PromisifyMethods<T extends object> = {
  [K in keyof T]: Promisify<T[K]>;
};

const identityTranscoder: RpcTranscoder<any> = {
  serialize: (data) => data,
  deserialize: (data) => data,
};

export function rpcClient<T extends object>(options: RpcClientOptions) {
  let transport: RpcTransport;
  let transcoder: RpcTranscoder<any> = identityTranscoder;
  let uuid: RpcUuid | undefined;

  if (typeof options === "string") {
    transport = fetchTransport({ url: options });
  } else if ("transport" in options && options.transport) {
    transport = options.transport;
    transcoder = options.transcoder || identityTranscoder;
    uuid = options.uuid;
  } else {
    transport = fetchTransport(options);
    transcoder = options.transcoder || identityTranscoder;
    uuid = options.uuid;
  }

  const { serialize, deserialize } = transcoder;

  /**
   * Send a request using the configured transport and handle the result.
   */
  const sendRequest = async (
    method: string,
    args: any[],
    signal: AbortSignal
  ) => {
    const req = createRequest(method, args, uuid);
    const raw = await transport(serialize(req as any), signal);
    const res: unknown = deserialize(raw);
    if (!isJsonRpcResponse(res)) {
      throw new TypeError("Not a JSON-RPC 2.0 response");
    }
    if ("error" in res) {
      const { code, message, data } = res.error;
      throw new RpcError(message, code, data);
    } else {
      return res.result;
    }
  };

  // Map of AbortControllers to abort pending requests
  const abortControllers = new WeakMap<Promise<any>, AbortController>();

  const target = {
    /**
     * Abort the request for the given promise.
     */
    $abort: (promise: Promise<any>) => {
      const ac = abortControllers.get(promise);
      ac?.abort();
    },
  };

  return new Proxy(target, {
    /* istanbul ignore next */
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) {
        return Reflect.get(target, prop, receiver);
      }
      if (typeof prop === "symbol") return;
      if (prop === "toJSON") return;
      return (...args: any) => {
        const ac = new AbortController();
        const promise = sendRequest(prop.toString(), args, ac.signal);
        abortControllers.set(promise, ac);
        promise
          .finally(() => {
            // Remove the
            abortControllers.delete(promise);
          })
          .catch(() => {});
        return promise;
      };
    },
  }) as typeof target & PromisifyMethods<T>;
}

/**
 * Create a JsonRpcRequest for the given method.
 */
export function createRequest(
  method: string,
  params?: any[],
  uuid?: RpcUuid
): JsonRpcRequest {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: uuid
      ? uuid()
      : Date.now().toString(36) + Math.random().toString(36).substring(2),
    method,
  };

  if (params?.length) {
    req.params = removeTrailingUndefs(params);
  }

  return req;
}

/**
 * Returns a shallow copy the given array without any
 * trailing `undefined` values.
 */
export function removeTrailingUndefs(values: any[]) {
  const a = [...values];
  while (a.length && a[a.length - 1] === undefined) a.length--;
  return a;
}

/**
 * Create a RpcTransport that uses the global fetch.
 */
export function fetchTransport(options: FetchOptions): RpcTransport {
  return async (req: JsonRpcRequest, signal: AbortSignal): Promise<any> => {
    const headers = options?.getHeaders ? await options.getHeaders() : {};
    const res = await fetch(options.url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(req),
      credentials: options?.credentials,
      signal,
    });
    if (!res.ok) {
      throw new RpcError(res.statusText, res.status);
    }
    return await res.json();
  };
}
