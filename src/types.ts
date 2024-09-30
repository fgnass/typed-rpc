export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any[];
}

export interface BaseJsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
}

export interface JsonRpcErrorResponse extends BaseJsonRpcResponse {
  error: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JsonRpcSuccessResponse extends BaseJsonRpcResponse {
  result: any;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export type RpcTranscoder<T> = {
  serialize: (data: T) => any;
  deserialize: (data: any) => T;
};
