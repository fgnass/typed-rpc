export interface MyService {
  hello(name: string): Promise<string>;
  sorry(name: string): Promise<string>;
  optional(hello: string, world?: string): Promise<string>;
  echoHeader(name: string): Promise<string | string[] | undefined>;
}
