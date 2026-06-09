import type {Address, Hex} from "viem";

export type PerplAuthSession = {
  address: Address;
  message: string;
  signature: Hex;
  nonce: string;
  cookie: string;
};

export type PerplSignMessage = (message: string) => Promise<Hex>;

export class PerplWhitelistError extends Error {
  readonly status: number;

  constructor(status: number, message = "Perpl wallet is not whitelisted for authenticated trading") {
    super(`${message} (${status}). Use PROPMON_MODE=demo for funded execution.`);
    this.name = "PerplWhitelistError";
    this.status = status;
  }
}

export async function connectPerpl(input: {
  apiUrl: string;
  address: Address;
  chainId: number;
  signMessage: PerplSignMessage;
  fetchImpl?: typeof fetch;
}): Promise<PerplAuthSession> {
  const fetcher = input.fetchImpl ?? fetch;
  const payloadResponse = await fetcher(`${input.apiUrl}/v1/auth/payload`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({address: input.address, chain_id: input.chainId})
  });

  assertNotWhitelistFailure(payloadResponse);
  if (!payloadResponse.ok) throw new Error(`Perpl auth payload failed with HTTP ${payloadResponse.status}`);

  const payloadCookie = cookieFromHeaders(payloadResponse.headers);
  const payload = await payloadResponse.json() as Record<string, unknown>;
  const message = stringField(payload, ["message", "payload", "siwe_message"]);
  const signature = await input.signMessage(message);

  const connectResponse = await fetcher(`${input.apiUrl}/v1/auth/connect`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(payloadCookie ? {cookie: payloadCookie} : {})
    },
    body: JSON.stringify({address: input.address, message, signature})
  });

  assertNotWhitelistFailure(connectResponse);
  if (!connectResponse.ok) throw new Error(`Perpl auth connect failed with HTTP ${connectResponse.status}`);

  const connectPayload = await connectResponse.json() as Record<string, unknown>;
  const nonce = stringField(connectPayload, ["nonce", "auth_nonce", "ws_nonce"]);
  const connectCookie = cookieFromHeaders(connectResponse.headers) || payloadCookie;
  if (!connectCookie) throw new Error("Perpl auth connect did not return an auth cookie");

  return {address: input.address, message, signature, nonce, cookie: connectCookie};
}

function assertNotWhitelistFailure(response: Response): void {
  if (response.status === 418 || response.status === 423) {
    throw new PerplWhitelistError(response.status);
  }
}

function stringField(payload: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = payload[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  throw new Error(`Perpl response missing string field: ${names.join(" or ")}`);
}

function cookieFromHeaders(headers: Headers): string {
  const setCookie = headers.get("set-cookie");
  if (!setCookie) return "";
  return setCookie.split(",").map((part) => part.split(";")[0]?.trim()).filter(Boolean).join("; ");
}
