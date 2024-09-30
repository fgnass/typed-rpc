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
export type RpcTransport = {
  post: (req: any) => void | Promise<void>,
  on: (fn: (res: any) => void) => void,
};

type RpcClientOptions = {
  timeout?: number; // in milliseconds (default: 60_000ms)
  transport: RpcTransport;
  transcoder?: RpcTranscoder<any>;
};

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
  const transport = options.transport;
  const { serialize, deserialize } = options.transcoder || identityTranscoder;
  const timeout = options.timeout || 60_000;

  const requests = new Map<string | number, { resolve: (arg: any) => void, reject: (error: any) => void, timeoutId?: ReturnType<typeof setTimeout> }>();

  /**
   * Send a request using the configured transport and handle the result.
   */
  const sendRequest = async (
    method: string,
    args: any[],
  ) => {
    const id = Date.now().toString();
    const req = createRequest(id, method, args);

    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new RpcError("Request timed out", -1));
        requests.delete(id);
      }, timeout);

      requests.set(id, { resolve, reject, timeoutId });
      try {
        await transport.post(serialize(req))
      } catch (err) {
        clearTimeout(timeoutId);
        requests.delete(id);
        reject(err);
      }
    });
  };

  transport.on((raw) => {
    console.log("response 1", raw);
    const res = deserialize(raw);
    console.log("response 2", res);
    if (!res) {
      console.log("ignored response", raw);
      return;
    }

    if (typeof res.id !== "string" && typeof res.id !== "number") {
      console.log("ignored response", res, raw);
      throw new TypeError("Invalid response (missing id)"); // TODO: handle this better
    }

    const promise = requests.get(res.id);
    if (!promise) {
      throw new Error("Matching request not found"); // TODO: handle this better
    }

    if (promise.timeoutId) {
      clearTimeout(promise.timeoutId!);
    }
    requests.delete(res.id);

    if ("result" in res) {
      promise.resolve(res.result);
      return;
    }

    if ("error" in res) {
      const { code, message, data } = res.error;
      promise.reject(new RpcError(message, code, data));
      return;
    }

    promise.reject(new TypeError("Invalid response"));
  });

  const target = {
    /**
     * Request the given method with the given arguments.
     */
    $request: sendRequest,

    /**
     * Notify the server of the given method with the given arguments.
     * This method does not expect a response.
     */
    $notify: (method: string, ...args: any[]) => {
      const req = createRequest(undefined, method, args);
      transport.post(serialize(req));
    },

    /**
     * Abort the request for the given promise.
     */
    $abort: (id: JsonRpcRequest['id']) => {
      if (id === undefined || id === null) {
        throw new Error("Id is required");
      }

      const promise = requests.get(id);
      if (!promise) {
        return;
      }
      clearTimeout(promise.timeoutId!);
      requests.delete(id);
      promise.reject(new Error("Request aborted"));
    },

    /**
     * Abort all pending requests.
     */
    $close: () => {
      for (const [id, promise] of requests) {
        clearTimeout(promise.timeoutId!);
        promise.reject(new Error("Request aborted"));
      }
      requests.clear();
    }
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
        return sendRequest(prop.toString(), args);
      };
    },
  }) as typeof target & PromisifyMethods<T>;
}

/**
 * Create a JsonRpcRequest for the given method.
 */
function createRequest(id: JsonRpcRequest['id'], method: string, params?: any[]): JsonRpcRequest {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    method,
  };

  if (id !== undefined) {
    req.id = id;
  }

  if (params?.length) {
    req.params = removeTrailingUndefs(params)
  }

  return req;
}

/**
 * Returns a shallow copy the given array without any
 * trailing `undefined` values.
 */
function removeTrailingUndefs(values: any[]) {
  const a = [...values];
  while (a.length && a[a.length - 1] === undefined) a.length--;
  return a;
}

/**
 * Create a RpcTransport that uses the global fetch.
 */
export function fetchTransport(options: FetchOptions | string): RpcTransport {

  if (typeof options === "string") {
    options = { url: options };
  }

  let handleResponse: (res: any) => void;

  return <RpcTransport>{
    post: async(req) => {
      const headers = options?.getHeaders ? await options.getHeaders() : {};
      const res = await fetch(options.url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...headers,
        },
        body: req,
        credentials: options?.credentials,
        // signal,
      });
      if (!res.ok) {
        throw new RpcError(res.statusText, res.status);
      }

      const data = await res.text();
      if (!handleResponse) {
        throw new Error("No callback set");
      }
      handleResponse(data);
    },
    on: (_handleResponse: (req: JsonRpcResponse) => void) => {
      handleResponse = _handleResponse;
    }
  };
}

export function websocketTransport(options: { url: string }): RpcTransport {
  let ws: WebSocket = new WebSocket(options.url);

  ws.onclose = () => {
    ws = new WebSocket(options.url);
  }

  return <RpcTransport>{
    post: async(req) => {
      ws.send(JSON.stringify(req));
    },
    on: (handleResponse) => {
      ws.onmessage = (event) => handleResponse(event.data);
    }
  };
}