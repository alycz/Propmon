import {NextResponse} from "next/server";

import {parseMode} from "../../../lib/config";

export async function POST(request: Request) {
  const agentApiUrl = process.env.NEXT_PUBLIC_AGENT_API_URL;
  if (!agentApiUrl) {
    return NextResponse.json(
      {ok: false, error: "NEXT_PUBLIC_AGENT_API_URL is not configured for the external Agent 06 service."},
      {status: 503}
    );
  }

  const body = await request.json().catch(() => ({}));
  const mode = parseMode(body.mode);
  const accountId = body.accountId;
  if (!accountId) {
    return NextResponse.json({ok: false, error: "accountId is required."}, {status: 400});
  }

  const upstream = await fetch(`${agentApiUrl.replace(/\/$/, "")}/demo-script`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-propmon-mode": mode
    },
    body: JSON.stringify({...body, mode})
  });

  const responseText = await upstream.text();
  let responseBody: unknown = responseText;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = {ok: upstream.ok, response: responseText};
  }

  return NextResponse.json(responseBody, {status: upstream.status});
}
