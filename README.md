# typed-rpc

![npm bundle size](https://img.shields.io/bundlephobia/minzip/typed-rpc)

Lightweight [JSON-RPC](https://www.jsonrpc.org/specification) solution for TypeScript projects with the following features:

- 👩‍🔧 Service definition via TypeScript types
- 📜 JSON-RPC 2.0 protocol
- 🕵️ Full IDE autocompletion
- 🪶 Tiny footprint (< 1kB)
- 🏝️ Optional support for non-JSON types
- 🚚 Support for custom transports
- 🔌 Optional websocket support
- 🌎 Support for Deno and edge runtimes
- 🚫 No code generation step
- 🚫 No dependencies
- 🚫 No batch requests
- 🚫 No runtime type-checking
- 🚫 No IE11 support
- 🥱 No fancy project page, just this README

## Philosophy

`typed-rpc` focuses on core functionality, keeping things as [simple](#basic-usage) as possible. The library consists of just two files: one for the _client_ and one for the _server_.

You'll find no unnecessary complexities like middlewares, adapters, resolvers, queries, or mutations. Instead, we offer a generic package that is request/response agnostic, leaving the wiring [up to the user](#support-for-other-runtimes).

## Basic Usage

### Server-Side

First, define your typed service. This example shows a simple service with a single method:

```ts
// server/myService.ts

export const myService = {
  hello(name: string) {
    return `Hello ${name}!`;
  },
};

export type MyService = typeof myService;
```

> **Tip**: Functions in your service can also be `async`.

Create a server route to handle API requests:

```ts
// server/index.ts

import express from "express";
import { handleRpc } from "typed-rpc/server";
import { myService } from "./myService.ts";

const app = express();
app.use(express.json());
app.post("/api", (req, res, next) => {
  handleRpc(req.body, myService)
    .then((result) => res.json(result))
    .catch(next);
});
app.listen(3000);
```

> **Note**: `typed-rpc` can be used with servers other than Express. Check out the docs below for [examples](#support-for-other-runtimes).

### Client-Side

Import the shared type and create a typed `rpcClient`:

```ts
// client/index.ts

import { rpcClient } from "typed-rpc";
import type { MyService } from "../server/myService";

const client = rpcClient<MyService>("/api");

console.log(await client.hello("world"));
```

Once you start typing `client.` in your IDE, you'll see all your service methods and their signatures suggested for auto-completion. 🎉

## Demo

Play with a live example on StackBlitz:

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/edit/typed-rpc-express?file=client%2Fmain.ts)

## Advanced Usage

### Accessing the Incoming Request

Define the service as a `class` to access request headers:

```ts
export class MyServiceImpl {
  constructor(private headers: Record<string, string | string[]>) {}

  async echoHeader(name: string) {
    return this.headers[name.toLowerCase()];
  }
}

export type MyService = typeof MyServiceImpl;
```

Create a new service instance for each request:

```ts
app.post("/api", (req, res, next) => {
  handleRpc(req.body, new MyService(req.headers))
    .then((result) => res.json(result))
    .catch(next);
});
```

### Sending Custom Headers

Clients can send custom headers using a `getHeaders` function:

```ts
const client = rpcClient<MyService>({
  url: "/api",
  getHeaders() {
    return { Authorization: auth };
  },
});
```

> **Tip**: The `getHeaders` function can also be `async`.

### Aborting Requests

Abort requests by passing the Promise to `client.$abort()`:

```ts
const client = rpcClient<HelloService>(url);

const res = client.hello("world");
client.$abort(res);
```

### Error Handling

In case of an error, the client throws an `RpcError` with `message`, `code`, and optionally `data`. Customize errors with `RpcHandlerOptions` or provide an `onError` handler for logging.

For internal errors (invalid request, method not found), the error code follows [the specs](https://www.jsonrpc.org/specification#error_object).

### CORS Credentials

Include credentials in cross-origin requests with `credentials: 'include'`.

### Custom Transport

Use a different transport mechanism by specifying custom transport:

```ts
const client = rpcClient<MyService>({
  transport: async (req: JsonRpcRequest, abortSignal: AbortSignal) => {
    return {
      error: null,
      result: {
        /* ... */
      },
    };
  },
});
```

### Websockets

Typed-rpc comes with an alternative transport that uses websockets:

```ts
import { websocketTransport } from "typed-rpc/ws";

import
const client = rpcClient<MyService>({
  transport: websocketTransport({
    url: "wss://websocket.example.org"
  })
});
```

## Support for Other Runtimes

`typed-rpc/server` can be used with any server framework or edge runtime.

### Fastify

Example with [Fastify](https://www.fastify.io/):

```ts
import { handleRpc } from "typed-rpc/server";

fastify.post("/api", async (req, reply) => {
  const res = await handleRpc(req.body, new Service(req.headers));
  reply.send(res);
});
```

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/edit/typed-rpc-fastify?file=server%2Findex.ts)

### Deno

Example with Deno in this [repository](https://github.com/fgnass/typed-rpc-deno-example).

### Next.js

Example with Next.js:

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/edit/typed-rpc-nextjs?file=pages%2Findex.tsx)

### Cloudflare Workers

Example with [Cloudflare Workers](https://workers.cloudflare.com/):

```ts
import { handleRpc } from "typed-rpc/server";
import { myService } from "./myService";

export default {
  async fetch(request: Request) {
    const json = await request.json();
    const data = await handleRpc(json, myService);
    return new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json;charset=UTF-8" },
    });
  },
};
```

## Support for Non-JSON Types

Configure a `transcoder` like [superjson](https://github.com/flightcontrolhq/superjson) for non-JSON types.

On the client:

```ts
import { serialize, deserialize } from "superjson";
const transcoder = { serialize, deserialize };

const client = rpcClient<DateService>({
  url: "/my-date-api",
  transcoder,
});
```

On the server:

```ts
import { serialize, deserialize } from "superjson";
const transcoder = { serialize, deserialize };

handleRpc(json, dateService, { transcoder });
```

## Runtime Type Checks

`typed-rpc` does not perform runtime type checks. Consider pairing it with [type-assurance](https://github.com/fgnass/type-assurance) for added safety.

## React Hooks

Pair `typed-rpc` with [react-api-query](https://www.npmjs.com/package/react-api-query) for UI framework integration.

## What's new in v6

- Services can now expose APIs with non-JSON types like Dates, Maps, Sets, etc. by plugging in a [transcoder](#support-for-non-json-types) like superjson.
- Previously, typed-rpc only shipped a CommonJS build in `/lib` and Deno users would directily consume the TypeScript code in `/src`. We now use [pkgroll](https://github.com/privatenumber/pkgroll) to create a hybrid module in `/dist` with both `.mjs` and `.cjs` files.
- We removed the previously included express adapter to align with the core philosopy of keeping things as simple as possible.

## License

MIT
