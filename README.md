# typed-rpc

Lightweight [JSON-RPC](https://www.jsonrpc.org/specification) solution for TypeScript projects. It has beed designed for use-cases where you control both client and server and your client is the only API consumer you need to support. Therefore it comes with the following features and tradeoffs:

- Service definition via TypeScript interfaces
- No code generation step
- Uses ES6 proxies (sorry, no IE11 support)
- No runtime type-checking
- Uses the JSON-RPC 2.0 protocol
- No batch requests
- HTTP(S) as only transport

## Usage

Interface shared between client and server:

```ts
export interface MyService {
  hello(name: string): Promise<string>;
}
```

Client code:

```ts
import { rpcClient } from "typed-rpc";
import { MyService } from "../shared/MyService";

const client = rpcClient<MyService>("http://localhost:3000/api");

async function greet() {
  const greeting = await client.hello("world");
  console.log(greeting);
}
```

Server code:

```ts
import express from "express";
import { rpcHandler } from "typed-rpc/server";
import { MyService } from "../shared/MyService";

class MyServiceImpl implements MyService {
  async hello(name: string) {
    return `Hello ${name}!`;
  }
}

const app = express();
app.use(express.json());

app.post("/api", rpcHandler(new MyServiceImpl()));

app.listen(3000);
```

# License

MIT
