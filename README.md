# typed-rpc

![npm bundle size](https://img.shields.io/bundlephobia/minzip/typed-rpc)

Lightweight [JSON-RPC](https://www.jsonrpc.org/specification) solution for TypeScript projects
that comes with the following features and non-features:

- 👩‍🔧 Service definition via TypeScript types
- 📜 JSON-RPC 2.0 protocol
- 🕵️ Full IDE autocompletion
- 🪶 Tiny footprint (< 1kB)
- 🌎 Support for Deno and edge runtimes
- 🚫 No code generation step
- 🚫 No dependencies
- 🚫 No batch requests
- 🚫 No transports other than HTTP(S)
- 🚫 No runtime type-checking
- 🚫 No IE11 support
- 🥱 No fancy project page, just this README

## Philosophy

The philosophy of `typed-rpc` is to strictly focus on the core functionality and keep things as [simple](#basic-usage) as possible. The whole library basically consists of two files, one for the client and one for the server.

You won't find any unnecessarily complex concepts like middlewares, adapters, resolvers, transformers, queries or mutations.

(If you want queries and mutations though, [we've got you covered](#react-hooks).)

And instead of having adapters for all the different servers, meta frameworks or edge runtimes, we provide a generic package that is request/response agnostic and leave the wiring [up to the user](#support-for-other-runtimes).

## Basic Usage

Create a _service_ in your backend and export its type, so that the
frontend can access type information:

```ts
// server/myService.ts

export const myService = {
  hello(name: string) {
    return `Hello ${name}!`;
  },
};

export type MyService = typeof myService;
```

> **Note**
> Of course, the functions in your service can also be `async`.

Create a server with a route to handle the API requests:

```ts
// server/index.ts

import express from "express";
import { rpcHandler } from "typed-rpc/express";
import { myService } from "./myService.ts";

const app = express();
app.use(express.json());
app.post("/api", rpcHandler(myService));
app.listen(3000);
```

> **Note**
> You can also use typed-rpc in servers other than Express.
> Check out to docs below for [examples](#support-for-other-runtimes).

On the client-side, import the shared type and create a typed `rpcClient` with it:

```ts
// client/index.ts

import { rpcClient } from "typed-rpc";

// Import the type (not the implementation!)
import type { MyService } from "../server/myService";

// Create a typed client:
const client = rpcClient<MyService>("http://localhost:3000/api");

// Call a remote method:
console.log(await client.hello("world"));
```

That's all it takes to create a type-safe JSON-RPC API. 🎉

## Demo

You can play with a live example over at StackBlitz:

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/edit/typed-rpc-express?file=client%2Fmain.ts)

# Advanced Usage

## Accessing the request

Sometimes it's necessary to access the request object inside the service. A common pattern is to define the service as `class` and create a new instance for each request:

```ts
export class MyServiceImpl {
  /**
   * Create a new service instance for the given request headers.
   */
  constructor(private headers: Record<string, string | string[]>) {}

  /**
   * Echo the request header with the specified name.
   */
  async echoHeader(name: string) {
    return this.headers[name.toLowerCase()];
  }
}

export type MyService = typeof MyServiceImpl;
```

Then, in your server, pass a _function_ to `rpcHandler` that creates a service instance with the headers taken from the incoming request:

```ts
app.post(
  "/api",
  rpcHandler((req) => new MyService(req.user))
);
```

## Sending custom headers

A client can send custom request headers by providing a `getHeaders` function:

```ts
const client = rpcClient<MyService>(apiUrl, {
  getHeaders() {
    return {
      Authorization: auth,
    };
  },
});
```

> **Note**
> The `getHeaders` function can also be `async`.

## CORS credentials

To include credentials in cross-origin requests, pass `credentials: 'include'` as option.

## Support for other runtimes

The generic `typed-rpc/server` package can be used with any server (or edge) runtime.
Here is an example for a [Cloudflare Worker](https://workers.cloudflare.com/):

```ts
import { handleRpc } from "typed-rpc/server";
import { myService } from "./myService";

export default {
  async fetch(request: Request) {
    const json = await request.json();
    const data = await handleRpc(json, service);
    return event.respondWith(
      new Response(JSON.stringify(data), {
        headers: {
          "content-type": "application/json;charset=UTF-8",
        },
      })
    );
  },
};
```

🦕 You can also use `typed-rpc` in Deno like in this [example](https://github.com/fgnass/typed-rpc-deno-example).

> **Note**
> This package is also published under https://deno.land/x/typed_rpc

## Runtime type checking

> **Warning**
> Keep in mind that `typed-rpc` does not perform any runtime type checks.

This is usually not an issue as long as your service can handle this gracefully.
If you want, you can use a library like [io-ts](https://gcanti.github.io/io-ts/)
or [ts-runtime](https://fabiandev.github.io/ts-runtime/) to make sure that the
arguments you receive match the expected type.

## React hooks

While `typed-rpc` itself does not provide any built-in UI framework integrations,
you can pair it with [react-api-query](https://www.npmjs.com/package/react-api-query),
a thin wrapper around _TanStack Query_. A type-safe match made in heaven. 💕

# License

MIT
