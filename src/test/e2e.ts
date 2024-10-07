import "isomorphic-fetch";
import WS from "isomorphic-ws";
import { serialize, deserialize } from "superjson";
import tap from "tap";
import { rpcClient, RpcError, websocketTransport } from "../client.js";
import type { Service } from "../e2e/service.js";
import type { ComplexService } from "../e2e/complexService.js";

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
  type Client = ReturnType<typeof rpcClient<Service>>;
  let client: Client | undefined;
  let ws: WebSocket | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      client = rpcClient<Service>({
        transport: websocketTransport({
          url: process.env.SERVER_URL + "/ws",
          timeout: 1000, // low timeout for testing
          reconnectTimeout: 0, // disable reconnect
          onOpen(e, _ws) {
            ws = _ws;
            resolve();
          },
          onMessageError(err) {
            reject(err);
          },
        }),
      });
    });
    const result = await client!.hello("world");
    t.equal(result, "Hello world!");
  } finally {
    ws?.close();
  }
});
