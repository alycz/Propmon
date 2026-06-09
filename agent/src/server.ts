import {createServer, type IncomingMessage, type ServerResponse} from "node:http";

import {loadAgentConfig} from "./config.js";
import {runDemoScript} from "./demo-runner.js";
import {createAgentSigner} from "./signer.js";

const DEFAULT_PORT = 8787;

async function main(): Promise<void> {
  const port = Number(process.env.AGENT_API_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("AGENT_API_PORT must be a positive integer");
  }

  const server = createServer((request, response) => {
    void route(request, response).catch((error) => {
      sendJson(response, 500, {ok: false, error: error instanceof Error ? error.message : String(error)});
    });
  });

  server.listen(port, () => {
    console.log(`Propmon Agent API listening on http://127.0.0.1:${port}`);
  });
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, {ok: true});
    return;
  }

  if (request.method === "GET" && request.url === "/agent-signer") {
    const config = loadAgentConfig({...process.env, AGENT_ACCOUNT_ID: process.env.AGENT_ACCOUNT_ID || "0"});
    const signer = createAgentSigner(config);
    sendJson(response, 200, {ok: true, mode: signer.mode, address: await signer.getAddress()});
    return;
  }

  if (request.method !== "POST" || request.url !== "/demo-script") {
    sendJson(response, 404, {ok: false, error: "Not found"});
    return;
  }

  const body = await readJsonBody(request);
  const accountId = body.accountId?.toString();
  if (!accountId || !/^\d+$/.test(accountId)) {
    sendJson(response, 400, {ok: false, error: "accountId is required and must be a non-negative integer"});
    return;
  }

  const mode = (body.mode ?? request.headers["x-propmon-mode"] ?? "demo").toString();
  if (mode !== "demo") {
    sendJson(response, 400, {ok: false, error: "The demo-script endpoint only executes demo mode"});
    return;
  }

  const config = loadAgentConfig({...process.env, PROPMON_MODE: "demo", AGENT_ACCOUNT_ID: accountId});
  const result = await runDemoScript(config);
  sendJson(response, 200, result);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {"content-type": "application/json"});
  response.end(JSON.stringify(body, bigintReplacer));
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
