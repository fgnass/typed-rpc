import { MyService } from "./MyService.js";

export class MyServiceImpl implements MyService {
  async hello(name: string) {
    return `Hello ${name}!`;
  }
  async sorry(name: string): Promise<string> {
    throw new Error(`Sorry ${name}.`);
  }
}
