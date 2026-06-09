"use client";

import {useAgentDemo, type AccountStateLabel} from "../components/AgentDemoProvider";
import {usePropmon} from "../components/PropmonProvider";

export type AccessPolicy = {
  allowed: boolean;
  locked: boolean;
  title: string;
  reason: string;
  ctaLabel?: string;
  ctaHref?: string;
};

const TERMINAL_OK: AccountStateLabel[] = ["PASSED", "FUNDED", "PAYOUT"];

export function useAccessPolicy() {
  const {core} = usePropmon();
  const {effectiveStateLabel} = useAgentDemo();

  const params = new URLSearchParams();
  params.set("mode", core.mode);
  if (core.accountIdInput) params.set("account", core.accountIdInput);
  const query = params.toString();

  const terminalAllowed = TERMINAL_OK.includes(effectiveStateLabel);

  function policyFor(href: string): AccessPolicy {
    if (href === "/terminal") {
      if (terminalAllowed) {
        return {allowed: true, locked: false, title: "", reason: ""};
      }
      const reason =
        effectiveStateLabel === "EXAMINATION"
          ? "You haven't passed your examination yet. Pass it to unlock the funded terminal."
          : effectiveStateLabel === "FAILED"
            ? "This examination failed. Buy a new examination to try again."
            : "Buy an examination account to get started.";
      return {
        allowed: false,
        locked: true,
        title: "Funded Terminal locked",
        reason,
        ctaLabel: "Go to Examination",
        ctaHref: `/examination?${query}`
      };
    }
    // Profile and Examination are always reachable (Examination uses soft nudges).
    return {allowed: true, locked: false, title: "", reason: ""};
  }

  return {effectiveStateLabel, terminalAllowed, policyFor, query};
}
