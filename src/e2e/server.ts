import express from "express";
import { serialize, deserialize } from "superjson";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";

import { handleRpc } from "../server.js";
import { service } from "./service.js";
import { RequestAwareService } from "./RequestAwareService.js";
import { complexService } from "./complexService.js";

const app = express();

app.use(express.json());

app.use("/api", (req, res, next) => {
  const status = req.header("Prefer-Status");
  if (status) res.status(parseInt(status)).end();
  else next();
});

app.post("/api", (req, res, next) => {
  handleRpc(req.body, service)
    .then((result) => res.json(result))
    .catch(next);
});

app.post("/request-aware-api", (req, res, next) => {
  handleRpc(req.body, new RequestAwareService(req.headers))
    .then((result) => res.json(result))
    .catch(next);
});

app.post("/error-masked-api", (req, res, next) => {
  handleRpc(req.body, service, {
    getErrorMessage: (error: unknown) => "Something went wrong",
    getErrorCode: (error: unknown) => 100,
  })
    .then((result) => res.json(result))
    .catch(next);
});

app.post("/complex-api", (req, res, next) => {
  handleRpc(req.body, complexService, {
    transcoder: { serialize, deserialize },
    getErrorMessage: (error: unknown) => "Something went wrong",
    getErrorCode: (error: unknown) => 100,
  })
    .then((result) => res.json(result))
    .catch(next);
});

const server = createServer(app);

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  ws.on("error", console.error);

  ws.on("message", (data) => {
    handleRpc(JSON.parse(data.toString()), service, {
      getErrorMessage: (error: unknown) => "Something went wrong",
      getErrorCode: (error: unknown) => 100,
    }).then((result) => ws.send(JSON.stringify(result)));
  });
});

const brokenWss = new WebSocketServer({ noServer: true });

brokenWss.on("connection", (ws) => {
  ws.on("error", console.error);

  ws.on("message", (data) => {
    const parsedMessage = JSON.parse(data.toString());
    const method = parsedMessage.method;

    switch (method) {
      case "sendInvalidVersion":
        ws.send('{"jsonrpc": "1.0"}');
        break;
      case "sendInvalidJSON":
        ws.send('{"invalid json":');
        break;
      case "sendUnknownID":
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "unknown-id",
            result: "This ID does not exist",
          })
        );
        break;
      case "sendServerError":
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: parsedMessage.id,
            error: {
              code: -32000,
              message: "Simulated server error",
            },
          })
        );
        break;
      default:
        // For any other method, send a normal response
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: parsedMessage.id,
            result: `Received method: ${method}`,
          })
        );
    }
  });
});

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else if (request.url === "/broken-ws") {
    brokenWss.handleUpgrade(request, socket, head, (ws) => {
      brokenWss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Server listening on http://localhost:%s", port);
});
