import superjson from "superjson";

export class RpcError extends Error {
	code: number;
	data?: unknown;

	constructor(message: string, code: number, data?: unknown) {
		super(message);
		this.code = code;
		this.data = data;
		// https://www.typescriptlang.org/docs/handbook/2/classes.html#inheriting-built-in-types
		Object.setPrototypeOf(this, RpcError.prototype);
	}
}

type RpcOptions = {
	credentials?: RequestCredentials;
	getHeaders?():
		| Record<string, string>
		| Promise<Record<string, string>>
		| undefined;
};

type Promisify<T> = T extends (...args: any[]) => Promise<any>
	? T // already a promise
	: T extends (...args: infer A) => infer R
	? (...args: A) => Promise<R>
	: T; // not a function;

type PromisifyMethods<T extends object> = {
	[K in keyof T]: Promisify<T[K]>;
};

export function rpcClient<T extends object>(url: string, options?: RpcOptions) {
	const request = async (method: string, params: any[]) => {
		const id = Date.now();
		const headers = options?.getHeaders ? await options.getHeaders() : {};
		const { json: paramJson, meta: paramMeta } = superjson.serialize(
			removeTrailingUndefs(params)
		);

		const res = await fetch(url, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				...headers,
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id,
				method,
				params: paramJson,
				meta: paramMeta,
			}),
			credentials: options?.credentials,
		});
		if (!res.ok) {
			throw new RpcError(res.statusText, res.status);
		}
		const { result, error, meta } = await res.json();
		if (error) {
			const { code, message, data } = error;
			throw new RpcError(message, code, data);
		}
		if (meta) {
			return superjson.deserialize({ json: result, meta });
		}
		return result;
	};

	return new Proxy(
		{},
		{
			/* istanbul ignore next */
			get(target, prop, receiver) {
				if (typeof prop === "symbol") return;
				if (prop.startsWith("$")) return;
				if (prop in Object.prototype) return;
				if (prop === "toJSON") return;
				return (...args: any) => request(prop.toString(), args);
			},
		}
	) as PromisifyMethods<T>;
}

function removeTrailingUndefs(values: any[]) {
	const a = [...values];
	while (a.length && a[a.length - 1] === undefined) a.length--;
	return a;
}
