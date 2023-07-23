import { rpcClient, RpcError } from "../client.js";
import { Service } from "./service.js";
import tap from "tap";
import "isomorphic-fetch";

const apiUrl = process.env.SERVER_URL + "/api";

tap.test("should talk to the server", async (t) => {
  const client = rpcClient<Service>(apiUrl);
  const result = await client.hello("world");
  t.equal(result, "Hello world!");
});

tap.test("should omit trailing undefined params", async (t) => {
  const client = rpcClient<Service>(apiUrl);
  const result = await client.greet("hello", undefined);
  t.equal(result, "hello world!");
});

tap.test("should override headers", async (t) => {
  const client = rpcClient<Service>(apiUrl, {
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
  const client = rpcClient<Service>(
    process.env.SERVER_URL + "/request-aware-api",
    {
      getHeaders() {
        return {
          "X-Hello": "world",
        };
      },
    }
  );
  const res = await client.echoHeader("X-Hello");
  t.equal(res, "world");
});

tap.test("should throw on errors", async (t) => {
  const client = rpcClient<Service>(apiUrl);
  const promise = client.sorry("Dave");
  t.rejects(promise, new RpcError("Sorry Dave.", -32000));
});

tap.test("should return a date", async (t) => {
	const client = rpcClient<Service>(apiUrl);
	const d = new Date();
	const result = await client.returnDate(d.toISOString());
	t.equal(result.toISOString(), d.toISOString())
});

tap.test("should receive a date and return full year", async (t) => {
	const client = rpcClient<Service>(apiUrl);
	const d = new Date();
	const result = await client.receiveDate(d);
	t.equal(result, d.getFullYear())
});

tap.test("should return a Set", async (t) => {
	const client = rpcClient<Service>(apiUrl);
	const list = ["foo", "bar", "baz", "foo", "bar"]
	const result = await client.returnSet(list);
	t.equal(result.size, 3)
});
