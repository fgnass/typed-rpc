import "isomorphic-fetch";
import superjson from "superjson";
import tap from "tap";
import { fetchTransport, rpcClient, RpcError } from "../client";
import type { Service } from "./service";
import type { ComplexService } from "./complexService";
import type { RpcTransport } from "../client";

const url = process.env.SERVER_URL + "/api";

const mockedTransport = (handle: (req: any) => any) => {
  let peer: (data: any) => void;

  return <RpcTransport>{
    post: (data) => peer(data),
    on: (cb) => {
      peer = (req) => {
        const res = handle(req);
        cb(res);
      };
    },
  }
};

tap.test("should talk to the server", async (t) => {
  const client = rpcClient<Service>({
    transport: fetchTransport({ url }),
    transcoder: {
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    },
  });
  const result = await client.hello("world");
  t.equal(result, "Hello world!");
});

tap.test("should omit trailing undefined params", async (t) => {
  const client = rpcClient<Service>({
    transport: fetchTransport({ url }),
    transcoder: {
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    },
  });
  const result = await client.greet("hello", undefined);
  t.equal(result, "hello world!");
});

tap.test("should override headers", async (t) => {
  const client = rpcClient<Service>({
    transport: fetchTransport({
      url,
      getHeaders() {
        return {
          "Prefer-Status": "400",
        };
      },
    }),
    transcoder: {
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    },
  });
  const promise = client.hello("world");
  t.rejects(promise, new RpcError("Bad Request", 400));
});

tap.test("should echo headers", async (t) => {
  const client = rpcClient<Service>({
    transport: fetchTransport({
      url: process.env.SERVER_URL + "/request-aware-api",
      getHeaders() {
        return {
          "X-Hello": "world",
        };
      },
    }),
    transcoder: {
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    },
  });
  const res = await client.echoHeader("X-Hello");
  t.equal(res, "world");
});

tap.test("should throw on errors", async (t) => {
  const client = rpcClient<Service>({
    transport: fetchTransport({ url }),
    transcoder: {
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    },
  });
  const promise = client.sorry("Dave");
  t.rejects(promise, new RpcError("Sorry Dave.", -32000));
});

tap.test("should pass error payload to client", async (t) => {
  const client = rpcClient<Service>({
    transport: fetchTransport({ url }),
    transcoder: {
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    },
  });
  const data = { foo: "bar" };
  const promise = client.sorry("Dave", data);
  t.rejects(promise, new RpcError("Sorry Dave.", -32000, data));
});

tap.test("should support custom transports", async (t) => {
  const client = rpcClient<Service>({
    transport: mockedTransport((req) => {
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: "Custom!",
      };
    }),
  });
  const result = await client.hello("world");
  t.equal(result, "Custom!");
});

tap.test("should use custom error message if configured", async (t) => {
  const client = rpcClient<Service>({
    transport: fetchTransport({ url: process.env.SERVER_URL + "/error-masked-api" }),
    transcoder: {
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    },
  });
  const promise = client.sorry("Dave");
  t.rejects(promise, new RpcError("Something went wrong", 100));
});

tap.test("should support custom transcoders", async (t) => {
  const client = rpcClient<ComplexService>({
    transport: fetchTransport({ url: process.env.SERVER_URL + "/complex-api" }),
    transcoder: {
      serialize: superjson.stringify,
      deserialize: superjson.parse,
    },
  });
  const date = await client.startOfEpoch();
  t.type(date, Date);
});

tap.test("should fail on invalid response", async (t) => {
  const client = rpcClient<Service>({
    transport: mockedTransport((req) => {
      if (req.method === "hello") {
        return {
          invalid: "response",
        };
      }
    }),
  });
  const res = client.hello("world");
  t.rejects(res);
});

// tap.test("should abort", async (t) => {
//   const client = rpcClient<Service>({
//     transport: fetchTransport({ url }),
//   });
//   const res = client.hello("world");
//   client.$abort(res.id);
//   t.rejects(res, { name: "AbortError" });
// });

tap.test("should not relay internal methods", async (t) => {
  const client = rpcClient<Service>({
    transport: fetchTransport({ url }),
  });
  JSON.stringify(client);
  client.toString();
  //@ts-expect-error
  client[Symbol()];
});

tap.test("should use websocket", async (t) => {
  const client = rpcClient<Service>({
    transport: mockedTransport((req) => {
      if (req.method === "hello") {
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: "Hello world!",
        };
      }
    }),
    // transcoder: {
    //   serialize: JSON.stringify,
    //   deserialize: JSON.parse,
    // }
  });

  const result = await client.hello("world");
  t.equal(result, "Hello world!");
});