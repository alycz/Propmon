"use client";

import {useState, type ReactNode} from "react";

import {useAccessPolicy} from "../hooks/useAccessPolicy";
import {Modal} from "./Modal";

// Page-level guard so a direct URL visit is gated too. Renders the page content
// inert behind a blocking modal when the route isn't allowed for the current
// (effective) account state.
export function AccessGuard({href, children}: {href: string; children: ReactNode}) {
  const {policyFor} = useAccessPolicy();
  const policy = policyFor(href);
  const [dismissed, setDismissed] = useState(false);
  const open = policy.locked && !dismissed;

  return (
    <>
      <div className={open ? "guardedInert" : undefined} aria-hidden={open}>
        {children}
      </div>
      <Modal
        open={open}
        title={policy.title}
        onClose={() => setDismissed(true)}
        primaryLabel={policy.ctaLabel}
        primaryHref={policy.ctaHref}
      >
        <p>{policy.reason}</p>
      </Modal>
    </>
  );
}
