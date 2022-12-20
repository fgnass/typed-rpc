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

  sorry(name: string): string {
    throw new Error(`Sorry ${name}.`);
  }

  echoHeader(name: string) {
    return this.headers?.[name.toLowerCase()];
  }

  get recurse() {
    return {
      method() {
        return 'recurse.method';
      }
    }
  }
}
