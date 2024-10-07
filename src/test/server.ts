import { isJsonRpcRequest, handleRpc } from "../server.js";

import tap from "tap";

const service = {
  hello(name: string) {
    return `Hello ${name}!`;
  },
  throwError() {
    throw new Error("Test error");
  },
  throwErrorWithCode() {
    const error = new Error("Test error");
    (error as any).code = 1234;
    throw error;
  },
};

tap.test("isJsonRpcRequest", (t) => {
  t.ok(
    isJsonRpcRequest({ jsonrpc: "2.0", method: "test", id: 1 }),
    "Valid request"
  );
  t.notOk(
    isJsonRpcRequest('{ jsonrpc: "2.0", method: "test", id: 1 }'),
    "string instead of object"
  );
  t.notOk(
    isJsonRpcRequest({ jsonrpc: "1.0", method: "test", id: 1 }),
    "Invalid jsonrpc version"
  );
  t.notOk(isJsonRpcRequest({ jsonrpc: "2.0", id: 1 }), "Missing method");
  t.notOk(isJsonRpcRequest({ method: "test", id: 1 }), "Missing jsonrpc");
  t.ok(
    isJsonRpcRequest({ jsonrpc: "2.0", method: "test", params: [], id: 1 }),
    "With params"
  );
  t.ok(
    isJsonRpcRequest({ jsonrpc: "2.0", method: "test", id: null }),
    "With null id"
  );
  t.end();
});

tap.test("handleRpc", async (t) => {
  const result = await handleRpc(
    { jsonrpc: "2.0", method: "hello", params: ["World"], id: 1 },
    service
  );

  t.same(
    result,
    { jsonrpc: "2.0", id: 1, result: "Hello World!" },
    "Handles valid RPC request"
  );

  const errorResult = await handleRpc(
    { jsonrpc: "2.0", method: "nonexistent", id: 2 },
    service
  );

  t.same(
    errorResult,
    {
      jsonrpc: "2.0",
      id: 2,
      error: { code: -32601, message: "Method not found: nonexistent" },
    },
    "Handles non-existent method"
  );

  const invalidRequest = await handleRpc(
    { method: "hello", params: ["World"] },
    service
  );

  t.same(
    invalidRequest,
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" },
    },
    "Handles invalid JSON-RPC request"
  );

  const errorThrowingResult = await handleRpc(
    { jsonrpc: "2.0", method: "throwError", id: 3 },
    service
  );

  t.same(
    errorThrowingResult,
    {
      jsonrpc: "2.0",
      id: 3,
      error: {
        code: -32000,
        message: "Test error",
        data: undefined,
      },
    },
    "Handles service method that throws an error"
  );

  const errorThrowingResultWithCode = await handleRpc(
    { jsonrpc: "2.0", method: "throwErrorWithCode", id: 4 },
    service
  );

  t.same(
    errorThrowingResultWithCode,
    {
      jsonrpc: "2.0",
      id: 4,
      error: {
        code: 1234,
        message: "Test error",
        data: undefined,
      },
    },
    "Handles service method that throws an error with code"
  );

  t.end();
});
