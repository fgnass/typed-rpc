export interface MyService {
  hello(name: string): Promise<string>;
  sorry(name: string): Promise<string>;
}
