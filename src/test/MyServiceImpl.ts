import { MyService } from "./MyService.js";

export class MyServiceImpl implements MyService {
  constructor(
    private headers?: Record<string, string | string[] | undefined>
  ) {}
  async hello(name: string) {
    return `Hello ${name}!`;
  }
  async sorry(name: string): Promise<string> {
    throw new Error(`Sorry ${name}.`);
  }
  async optional(hello: string, world?: string) {
    return `${hello} ${world}!`;
  }
  async echoHeader(name: string): Promise<string | string[] | undefined> {
    return this.headers?.[name.toLowerCase()];
  }
}
