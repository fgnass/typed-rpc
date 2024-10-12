import {
  type JsonRpcResponse,
  type RpcTransport,
  isJsonRpcResponse,
  RpcError,
} from "./client.js";

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

type PendingResponse = {
  resolve: (res: JsonRpcResponse) => void;
  reject: (err: RpcError) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
};

export function websocketTransport(
  options: WebSocketTransportOptions
): RpcTransport {
  const pendingResponses = new Map<string | number, PendingResponse>();
  const timeout = options.timeout ?? 60_000;

  let wsPromise: Promise<WebSocket>;

  function connect() {
    wsPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(options.url);
      ws.addEventListener("open", (ev) => {
        options.onOpen?.(ev, ws);
        resolve(ws);
      });
      ws.addEventListener(
        "error",
        (ev: any) => {
          ws.close();
          reject(ev.error);
        },
        { once: true }
      );

      ws.addEventListener("message", (ev) => {
        let res: unknown;
        try {
          res = JSON.parse(ev.data.toString());
        } catch (err) {
          options.onMessageError?.(err);
          return;
        }
        if (!isJsonRpcResponse(res)) {
          options.onMessageError?.(new TypeError("Invalid response"));
          return;
        }
        if (res.id === null) {
          // Ignore notifications
          return;
        }
        const pending = pendingResponses.get(res.id);
        if (!pending) {
          options.onMessageError?.(
            new Error("Request not found for id: " + res.id)
          );
          return;
        }

        pendingResponses.delete(res.id);
        if (pending.timeoutId) {
          clearTimeout(pending.timeoutId);
        }

        pending.resolve(res);
      });

      ws.addEventListener("close", (ev) => {
        const reconnectTimeout = options.reconnectTimeout ?? 1000;
        if (
          reconnectTimeout !== 0 &&
          (!ev.wasClean || ev.reason === "reconnect")
        ) {
          setTimeout(connect, reconnectTimeout);
        }
      });
    });
  }

  connect();

  return (req, signal): Promise<any> => {
    const requestId = req.id ?? -1;
    return new Promise((resolve, reject) => {
      const pending: PendingResponse = { resolve, reject };

      if (timeout > 0) {
        pending.timeoutId = setTimeout(() => {
          reject(new RpcError("Request timed out", -32000));
        }, timeout);
      }

      signal.onabort = () => {
        if (pending.timeoutId) {
          clearTimeout(pending.timeoutId);
        }
        reject(new RpcError("Request aborted", -32000));
      };

      pendingResponses.set(requestId, pending);

      wsPromise
        .then((ws) => {
          ws.send(JSON.stringify(req));
        })
        .catch((err) => {
          pendingResponses.delete(requestId);
          if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
          }
          reject(err);
        });
    });
  };
}
