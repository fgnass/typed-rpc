export const service = {
  hello(name: string) {
    return `Hello ${name}!`;
  },

  greet(hello: string, name = "world") {
    return `${hello} ${name}!`;
  },

  sorry(name: string): string {
    throw new Error(`Sorry ${name}.`);
  },

  echoHeader(name: string): string | string[] | undefined {
    throw new Error("This service can't access request headers");
  },

  recurse: {
    method() {
      return 'recurse.method';
    }
  }
};

export type Service = typeof service;
