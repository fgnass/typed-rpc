import { rpcClient, RpcError } from "../client.js";
import { MyService } from "./MyService.js";
import tap from "tap";
import "isomorphic-fetch";

const apiUrl = process.env.SERVER_URL + "/api";

tap.test("should talk to server", async (t) => {
  const client = rpcClient<MyService>(apiUrl);
  const result = await client.hello("world");
  t.equal(result, "Hello world!");
});

tap.test("should override methods", async (t) => {
  const client = rpcClient<MyService>(apiUrl, {
    hello() {
      return "override";
    },
  });
  const result = await client.hello("world");
  t.equal(result, "override");
});

tap.test("should add additional methods", (t) => {
  const locals = {
    goodbye() {
      return "Bye!";
    },
  };
  const client = rpcClient<MyService, typeof locals>(apiUrl, locals);
  t.equal(client.goodbye(), "Bye!");
  t.end();
});

tap.test("should throw on errors", async (t) => {
  const client = rpcClient<MyService>(apiUrl);
  const promise = client.sorry("Dave");
  t.rejects(promise, new RpcError("Sorry Dave.", -32000));
});

tap.test("should override headers", async (t) => {
  const client = rpcClient<MyService>(apiUrl, {
    getHeaders() {
      return {
        "Prefer-Status": "400",
      };
    },
  });
  const promise = client.hello("world");
  t.rejects(promise, new RpcError("Bad Request", 400));
});

tap.test("should access this in overrides", async (t) => {
  const overrides = {
    status: "",
    setStatus(status: number) {
      this.status = status.toString();
    },
    getHeaders() {
      if (!this.status) return;
      return {
        "Prefer-Status": this.status,
      };
    },
  };
  const client = rpcClient<MyService, typeof overrides>(apiUrl, overrides);
  client.setStatus(404);
  const promise = client.hello("world");
  t.rejects(promise, new RpcError("Not Found", 404));
});
