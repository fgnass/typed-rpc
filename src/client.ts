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

export function rpcClient<T>(url: string) {
  const request = async (method: string, params: any[]) => {
    const id = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const {result, error} = await res.json();
    if (error) {
      const {code, message, data} = error;
      throw new RpcError(message, code, data);
    }
    return result;
  };

  return new Proxy({}, {
    get(target, prop, receiver) {
      return (...args: any) => request(prop.toString(), args);
    }
  }) as T;
}
