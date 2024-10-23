import "isomorphic-fetch";
import WS from "isomorphic-ws";
import { serialize, deserialize } from "superjson";
import tap from "tap";
import { rpcClient, RpcError } from "../client.js";
import type { Service } from "../e2e/service.js";
import type { ComplexService } from "../e2e/complexService.js";
import { websocketTransport } from "../ws.js";
import type { BrokenService } from "../e2e/BrokenService.js";

function createWebSocketClient<T extends object>(options: {
  url: string;
  timeout?: number;
  reconnectTimeout?: number;
  onOpen?: (ws: WebSocket) => void;
  onMessageError?: (err: unknown) => void;
}) {
  let ws: WebSocket;
  const client = rpcClient<T>({
    transport: websocketTransport({
      url: options.url,
      timeout: options.timeout ?? 100,
      reconnectTimeout: options.reconnectTimeout ?? 0,
      onOpen(e, _ws) {
        ws = _ws;
        options.onOpen?.(ws);
      },
      onMessageError: options.onMessageError,
    }),
  });

  return {
    client,
    closeWs: (code?: number, reason?: string) => {
      ws?.close(code, reason);
    },
  };
}

const url = process.env.SERVER_URL + "/api";
globalThis.WebSocket = WS as any;

tap.test("should talk to the server", async (t) => {
  const client = rpcClient<Service>(url);
  const result = await client.hello("world");
  t.equal(result, "Hello world!");
});

tap.test("should omit trailing undefined params", async (t) => {
  const client = rpcClient<Service>({ url });
  const result = await client.greet("hello", undefined);
  t.equal(result, "hello world!");
});

tap.test("should override headers", async (t) => {
  const client = rpcClient<Service>({
    url,
    getHeaders() {
      return {
        "Prefer-Status": "400",
      };
    },
  });
  const promise = client.hello("world");
  t.rejects(promise, new RpcError("Bad Request", 400));
});

tap.test("should echo headers", async (t) => {
  const client = rpcClient<Service>({
    url: process.env.SERVER_URL + "/request-aware-api",
    getHeaders() {
      return {
        "X-Hello": "world",
      };
    },
  });
  const res = await client.echoHeader("X-Hello");
  t.equal(res, "world");
});

tap.test("should throw on errors", async (t) => {
  const client = rpcClient<Service>({ url });
  const promise = client.sorry("Dave");
  t.rejects(promise, new RpcError("Sorry Dave.", -32000));
});

tap.test("should pass error payload to client", async (t) => {
  const client = rpcClient<Service>({ url });
  const data = { foo: "bar" };
  const promise = client.sorry("Dave", data);
  t.rejects(promise, new RpcError("Sorry Dave.", -32000, data));
});

tap.test("should support custom transports", async (t) => {
  const client = rpcClient<Service>({
    transport: async (req) => {
      return {
        jsonrpc: "2.0",
        result: "Custom!",
        id: null,
      };
    },
  });
  const result = await client.hello("world");
  t.equal(result, "Custom!");
});

tap.test("should use custom error message if configured", async (t) => {
  const client = rpcClient<Service>(
    process.env.SERVER_URL + "/error-masked-api"
  );
  const promise = client.sorry("Dave");
  t.rejects(promise, new RpcError("Something went wrong", 100));
});

tap.test("should support custom transcoders", async (t) => {
  const client = rpcClient<ComplexService>({
    url: process.env.SERVER_URL + "/complex-api",
    transcoder: { serialize, deserialize },
  });
  const date = await client.startOfEpoch();
  t.type(date, Date);
});

tap.test("should fail on invalid response", async (t) => {
  const client = rpcClient<Service>({
    transport: async (req) => {
      return {
        invalid: "",
      } as any;
    },
  });
  const res = client.hello("world");
  t.rejects(res);
});

tap.test("should abort", async (t) => {
  const client = rpcClient<Service>(url);
  const res = client.hello("world");
  client.$abort(res);
  t.rejects(res, { name: "AbortError" });
});

tap.test("should not relay internal methods", async (t) => {
  const client = rpcClient<Service>(url);
  JSON.stringify(client);
  client.toString();
  //@ts-expect-error
  client[Symbol()];
});

tap.test("should use websocket", async (t) => {
  const { client, closeWs } = createWebSocketClient<Service>({
    url: process.env.SERVER_URL + "/ws",
    onMessageError: (err: any) => {
      t.fail(err);
    },
  });

  try {
    t.equal(await client.hello("world"), "Hello world!");
    t.equal(await client.greet("Hi", "all"), "Hi all!");
  } finally {
    closeWs();
  }
});

tap.test("should handle errors via websocket", async (t) => {
  const { client, closeWs } = createWebSocketClient<Service>({
    url: process.env.SERVER_URL + "/ws",
    onMessageError: (err: any) => {
      t.fail(err);
    },
  });

  const promise = client.sorry("Dave");
  await t.rejects(promise, new RpcError("Something went wrong", 100));
  t.teardown(closeWs);
});

tap.test("should timeout on websocket", async (t) => {
  const { client, closeWs } = createWebSocketClient<Service>({
    url: process.env.SERVER_URL + "/ws",
    onMessageError: (err: any) => {
      t.fail(err);
    },
  });

  // Call a method that will take longer than the timeout
  const promise = client.sleep(1000);
  await t.rejects(promise, new RpcError("Request timed out", -32000));
  t.teardown(closeWs);
});

tap.test("should reconnect on WebSocket close", async (t) => {
  let reconnectCount = 0;
  const { client, closeWs } = createWebSocketClient<Service>({
    url: process.env.SERVER_URL + "/ws",
    reconnectTimeout: 100,
    onOpen: (_ws) => {
      reconnectCount++;
    },
    onMessageError: (err: any) => {
      t.fail(err);
    },
  });

  // Wait for initial connection
  await t.resolves(client.hello("world"));
  t.equal(reconnectCount, 1, "Initial connection established");

  // Force reconnect
  closeWs(1000, "reconnect");

  // Wait for reconnection
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Verify reconnection
  await t.resolves(client.hello("world"));
  t.equal(reconnectCount, 2, "Reconnection successful");

  closeWs();
});

tap.test("should handle invalid response from WebSocket", async (t) => {
  const promise = new Promise((_resolve, reject) => {
    const { client, closeWs } = createWebSocketClient<BrokenService>({
      url: process.env.SERVER_URL + "/broken-ws",
      onMessageError: reject,
    });
    t.teardown(closeWs);
    client.sendInvalidVersion();
  });
  await t.rejects(promise, new TypeError("Invalid response"));
});

tap.test("should handle errors during send", async (t) => {
  const { client, closeWs } = createWebSocketClient<Service>({
    url: process.env.SERVER_URL + "/404",
  });
  t.teardown(closeWs);
  await t.rejects(client.hello("world"), new Error("socket hang up"));
});
