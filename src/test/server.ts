import express from "express";
import { rpcHandler } from "../express.js";
import { service } from "./service.js";
import { RequestAwareService } from "./RequestAwareService.js";

const app = express();

app.use(express.json());

app.use("/api", (req, res, next) => {
  const status = req.header("Prefer-Status");
  if (status) res.status(parseInt(status)).end();
  else next();
});

app.post("/api", rpcHandler(service));

app.post(
  "/request-aware-api",
  rpcHandler((req) => new RequestAwareService(req.headers))
);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server listening on http://localhost:%s", port);
});
