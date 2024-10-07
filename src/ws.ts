import { type RpcTransport, isJsonRpcResponse, RpcError } from "./client.js";

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

export function websocketTransport(
  options: WebSocketTransportOptions
): RpcTransport {
  type Request = {
    resolve: Function;
    reject: Function;
    timeoutId?: ReturnType<typeof setTimeout>;
  };
  const requests = new Map<string | number, Request>();
  const timeout = options.timeout ?? 60_000;

  let ws: WebSocket;

  function connect() {
    ws = new WebSocket(options.url.replace("http", "ws"));

    ws.addEventListener("open", (e) => {
      options.onOpen?.(e, ws);
    });

    ws.addEventListener("message", (e) => {
      const res: unknown = JSON.parse(e.data.toString());
      if (!isJsonRpcResponse(res)) {
        options.onMessageError?.(new TypeError("Invalid response"));
        return;
      }
      if (res.id === null) {
        // Ignore notifications
        return;
      }
      const request = requests.get(res.id);
      if (!request) {
        options.onMessageError?.(
          new Error("Request not found for id: " + res.id)
        );
        return;
      }

      requests.delete(res.id);
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }

      request.resolve(res);
    });

    ws.addEventListener("close", (e) => {
      const reconnectTimeout = options.reconnectTimeout ?? 1000;
      if (reconnectTimeout !== 0 && !e.wasClean) {
        setTimeout(connect, reconnectTimeout);
      }
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  connect();

  return async (req, signal): Promise<any> => {
    const requestId = req.id ?? -1;

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
