import express from "express";
import { rpcHandler } from "../server.js";
import { MyServiceImpl } from "./MyServiceImpl.js";

const app = express();

app.use(express.json());

app.use("/api", (req, res, next) => {
  const status = req.header("Prefer-Status");
  if (status) res.status(parseInt(status)).end();
  else next();
});

app.post("/api", rpcHandler(new MyServiceImpl()));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server listening on http://0.0.0.0:%s", port);
});
