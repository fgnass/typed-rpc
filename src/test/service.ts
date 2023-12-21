export const service = {
  hello(name: string) {
    return `Hello ${name}!`;
  },

  greet(hello: string, name = "world") {
    return `${hello} ${name}!`;
  },

  sorry(name: string, data?: unknown): string {
    const err = new Error(`Sorry ${name}.`);
    if (data) {
      (err as any).data = data;
    }
    throw err;
  },

  echoHeader(name: string): string | string[] | null {
    throw new Error("This service can't access request headers");
  },
};

export type Service = typeof service;
