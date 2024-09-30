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
  handleRpc(req.body, service, {
    transcoder: { serialize, deserialize },
    getErrorMessage: (error: unknown) => "Something went wrong",
    getErrorCode: (error: unknown) => 100,
  })
    .then((result) => res.json(result))
    .catch(next);
});

const server = createServer(app);

const wss = new WebSocketServer({
  path: "/ws",
  server,
});

wss.on('connection', (ws) => {
  ws.on('error', console.error);

  ws.on('message', (data) => {
    handleRpc(data.toString(), complexService, {
      transcoder: {
        serialize: JSON.stringify,
        deserialize: JSON.parse,
      },
      getErrorMessage: (error: unknown) => "Something went wrong",
      getErrorCode: (error: unknown) => 100,
    })
      .then((result) => {
        console.log("res", result)
        ws.send(result)
    })
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Server listening on http://localhost:%s", port);
});
