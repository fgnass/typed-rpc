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

  returnDate(s: string): Date {
	return new Date(s);
  }

  receiveDate(s: Date): number {
	return s.getFullYear();
  }

  returnSet(s: string[]): Set<string> {
	return new Set(s);
  }
}
