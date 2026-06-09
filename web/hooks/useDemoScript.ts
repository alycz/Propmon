"use client";

import {useState} from "react";

import {type PropmonMode} from "../lib/config";

type Params = {
  mode: PropmonMode;
  accountId?: bigint;
};

export type DemoScript = ReturnType<typeof useDemoScript>;

export function useDemoScript({mode, accountId}: Params) {
  const [demoStatus, setDemoStatus] = useState("");

  async function runDemoScript() {
    if (!accountId) {
      setDemoStatus("Enter or buy an account first.");
      return;
    }
    setDemoStatus("Triggering external Agent 06 demo script...");
    const response = await fetch("/api/demo-script", {
      method: "POST",
      headers: {"content-type": "application/json", "x-propmon-mode": mode},
      body: JSON.stringify({mode, accountId: accountId.toString()})
    });
    const body = await response.json().catch(() => ({}));
    setDemoStatus(response.ok ? "Demo script accepted by Agent 06." : body.error ?? "Demo script service unavailable.");
  }

  return {runDemoScript, demoStatus, setDemoStatus};
}
