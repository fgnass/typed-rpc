import { Service } from "./service";

/**
 * A `Service` implementation with access to the request headers.
 */
export class RequestAwareService implements Service {
  constructor(
    private headers?: Record<string, string | string[] | undefined>
  ) {}

  hello(name: string) {
    return `Hello ${name}!`;
  }

  greet(hello: string, name = "world") {
    return `${hello} ${name}!`;
  }

  sorry(name: string, data?: unknown): string {
    const err = new Error(`Sorry ${name}.`);
    if (data) {
      (err as any).data = data;
    }
    throw err;
  }

  echoHeader(name: string) {
    return this.headers?.[name.toLowerCase()];
  }
}
