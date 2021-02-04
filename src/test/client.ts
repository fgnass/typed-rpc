import { rpcClient } from "../client.js";
import { MyService } from "./MyService.js";
import "isomorphic-fetch";

const client = rpcClient<MyService>("http://localhost:3000/api");

client.hello("world").then(console.log).catch(console.error);
