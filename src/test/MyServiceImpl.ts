import { MyService } from "./MyService.js";

export class MyServiceImpl implements MyService {
  async hello(name: string) {
    return `Hello ${name}!`;
  }
}
