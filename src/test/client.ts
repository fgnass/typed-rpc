import tap from "tap";
import { isJsonRpcResponse } from "../client.js";

tap.test("isJsonRpcResponse", (t) => {
  t.ok(
    isJsonRpcResponse({
      jsonrpc: "2.0",
      id: 1728322977310,
      result: "Hello world!",
    }),
    "Valid response with result"
  );

  t.ok(
    isJsonRpcResponse({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Error" },
      id: 1,
    }),
    "Valid response with error"
  );
  t.notOk(
    isJsonRpcResponse(
      `{ jsonrpc: "2.0", id: 1728322977310, result: "Hello world!" }`
    ),
    "String instead of object"
  );
  t.notOk(
    isJsonRpcResponse({ jsonrpc: "1.0", result: "test", id: 1 }),
    "Invalid jsonrpc version"
  );
  t.notOk(isJsonRpcResponse({ result: "test", id: 1 }), "Missing jsonrpc");
  t.notOk(
    isJsonRpcResponse({ jsonrpc: "2.0", id: 1 }),
    "Missing result and error"
  );
  t.notOk(
    isJsonRpcResponse({
      jsonrpc: "2.0",
      result: "test",
      error: { code: -32000, message: "Error" },
      id: 1,
    }),
    "Both result and error present"
  );
  t.ok(
    isJsonRpcResponse({ jsonrpc: "2.0", result: null, id: 1 }),
    "Valid response with null result"
  );
  t.ok(
    isJsonRpcResponse({ jsonrpc: "2.0", result: "test", id: null }),
    "Valid response with null id"
  );
  t.notOk(isJsonRpcResponse({ jsonrpc: "2.0", result: "test" }), "Missing id");
  t.end();
});
