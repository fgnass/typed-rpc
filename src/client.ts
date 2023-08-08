import { JsonRpcRequest, JsonRpcResponse } from "./types";

/**
 * Error class that is thrown if a remote method returns an error.
 */
export class RpcError extends Error {
  code: number;
  data?: unknown;

  constructor(message: string, code: number, data?: unknown) {
    super(message);
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
export type RpcTransport = (req: JsonRpcRequest) => Promise<JsonRpcResponse>;

type RpcClientOptions =
  | string
  | FetchOptions
  | {
      transport: RpcTransport;
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

export function rpcClient<T extends object>(options: RpcClientOptions) {
  if (typeof options === "string") {
    options = { url: options };
  }
  const transport =
    "transport" in options ? options.transport : fetchTransport(options);

  return new Proxy(
    {},
    {
      /* istanbul ignore next */
      get(target, prop, receiver) {
        if (typeof prop === "symbol") return;
        if (prop.startsWith("$")) return;
        if (prop in Object.prototype) return;
        if (prop === "toJSON") return;
        return async (...args: any) => {
          const res = await transport(createRequest(prop.toString(), args));
          if ("result" in res) {
            return res.result;
          } else if ("error" in res) {
            const { code, message, data } = res.error;
            throw new RpcError(message, code, data);
          }
          throw new TypeError("Invalid response");
        };
      },
    }
  ) as PromisifyMethods<T>;
}

/**
 * Create a JsonRpcRequest for the given method.
 */
export function createRequest(method: string, params: any[]): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params: removeTrailingUndefs(params),
  };
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
  return async (req: JsonRpcRequest): Promise<any> => {
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
    });
    if (!res.ok) {
      throw new RpcError(res.statusText, res.status);
    }
    return await res.json();
  };
}
