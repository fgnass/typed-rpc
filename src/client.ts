import type {
  JsonRpcRequest,
  JsonRpcResponse,
  RpcTranscoder,
} from "./types.js";

export * from "./types.js";

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

type RpcClientOptions =
  | string
  | (FetchOptions & {
      transport?: RpcTransport;
      transcoder?: RpcTranscoder<any>;
    });

type FetchOptions = {
  url: string;
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
  if (typeof options === "string") {
    options = { url: options };
  }
  const transport = options.transport || fetchTransport(options);
  const { serialize, deserialize } = options.transcoder || identityTranscoder;

  /**
   * Send a request using the configured transport and handle the result.
   */
  const sendRequest = async (
    method: string,
    args: any[],
    signal: AbortSignal
  ) => {
    const req = createRequest(method, args);
    const raw = await transport(serialize(req as any), signal);
    const res = deserialize(raw);
    if (res?.jsonrpc !== "2.0") {
      throw new TypeError("Not a JSON-RPC 2.0 response");
    }

    if ("error" in res) {
      const { code, message, data } = res.error;
      throw new RpcError(message, code, data);
    }

    if ("result" in res) {
      return res.result;
    }

    throw new TypeError("Invalid response");
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
export function createRequest(method: string, params?: any[]): JsonRpcRequest {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: Date.now(),
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

export type WebSocketTransportOptions = {
  /**
   * The URL to connect to.
   */
  url: string;
  /**
   * Reconnection timeout in milliseconds. Default is 1000ms.
   * Set to 0 to disable reconnection.
   */
  reconnectTimeout?: number;
  /**
   * The timeout in milliseconds for requests.
   * Default is 60_000ms.
   */
  timeout?: number;
  /**
   * Error handler for incoming messages.
   */
  onMessageError?: (err: unknown) => void;
  /**
   * WebSocket open handler.
   * Use to access the WebSocket instance.
   */
  onOpen?: (ev: Event, ws: WebSocket) => void;
};

export function websocketTransport(options: WebSocketTransportOptions): RpcTransport {
  type Request = { resolve: Function, reject: Function, timeoutId?: ReturnType<typeof setTimeout> };
  const requests = new Map<string | number, Request>();
  const timeout = options.timeout ?? 60_000;

  let ws: WebSocket;
  function connect() {
    ws = new WebSocket(options.url.replace("http", "ws"));

    ws.addEventListener('open', (e) => {
      options.onOpen?.(e, ws);
    });

    ws.addEventListener('message', (e) => {
      const raw = e.data.toString();
      const res = JSON.parse(raw) as JsonRpcResponse;
      if (typeof res.id !== "string" || typeof res.id !== "number") {
        options.onMessageError?.(
          new TypeError("Invalid response (missing id)")
        );
        return;
      }

      const request = requests.get(res.id);
      if (!request) {
        options.onMessageError?.(new Error("Request not found for id: " + res.id));
        return;
      }

      requests.delete(res.id);
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }

      request.resolve(raw);
    });

    ws.addEventListener('close', (e) => {
      const reconnectTimeout = options.reconnectTimeout ?? 1000;
      if (reconnectTimeout !== 0 && !e.wasClean) {
        setTimeout(connect, reconnectTimeout);
      }
    });

    ws.addEventListener('error', () => {
      ws.close();
    });
  }

  connect();

  return async (req, signal): Promise<any> => {
    const _req: JsonRpcRequest = typeof req === 'string' ? JSON.parse(req) : req;

    if (typeof _req.id !== 'string' && typeof _req.id !== 'number') { // skip notifications
      return;
    }

    const requestId = _req.id;

    if (requests.has(requestId)) {
      throw new RpcError("Request already exists", -32000);
    }

    const res = await new Promise((resolve, reject) => {
      const request: Request = { resolve, reject };

      if (timeout > 0) {
        request.timeoutId = setTimeout(() => {
          reject(new RpcError("Request timed out", -32000));
        }, timeout);
      }

      signal.onabort = () => {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        reject(new RpcError("Request aborted", -32000));
      };

      requests.set(requestId, request);

      ws.send(JSON.stringify(req));
    });

    return res;
  };
}
