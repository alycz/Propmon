import {NextResponse} from "next/server";

export async function GET() {
  const agentApiUrl = process.env.NEXT_PUBLIC_AGENT_API_URL;
  if (!agentApiUrl) {
    return NextResponse.json(
      {ok: false, error: "NEXT_PUBLIC_AGENT_API_URL is not configured for the external Agent service."},
      {status: 503}
    );
  }

  const upstream = await fetch(`${agentApiUrl.replace(/\/$/, "")}/agent-signer`, {
    method: "GET",
    cache: "no-store"
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
