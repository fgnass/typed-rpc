export class RpcError extends Error {
  code: number;
  data?: unknown;

  constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
    //https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, RpcError.prototype);
  }
}

type Overrides = Record<string, any> & {
  getHeaders?(): Record<string, string> | undefined;
};

export function rpcClient<T extends object, O extends Overrides = {}>(
  url: string,
  overrides?: O
) {
  const request = async (method: string, params: any[]) => {
    const id = Date.now();
    const headers =
      overrides && overrides.getHeaders ? overrides.getHeaders() : {};

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params: removeTrailingUndefs(params),
      }),
      credentials: "include",
    });
    if (!res.ok) {
      throw new RpcError(res.statusText, res.status);
    }
    const { result, error } = await res.json();
    if (error) {
      const { code, message, data } = error;
      throw new RpcError(message, code, data);
    }
    return result;
  };

  const target = overrides || {};
  return new Proxy(target, {
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) {
        return Reflect.get(target, prop, receiver);
      }
      if (isRemote(prop)) {
        return (...args: any) => request(prop.toString(), args);
      }
    },
  }) as T & O;
}

function isRemote(prop: string | symbol) {
  if (typeof prop === "symbol") return false;
  if (prop.startsWith("$")) return false;
  if (prop === "constructor") return false;
  return true;
}

function removeTrailingUndefs(values: any[]) {
  const a = [...values];
  while (a.length && a[a.length - 1] === undefined) a.length--;
  return a;
}
