"use client";

import Link from "next/link";

import {useAccessPolicy} from "../hooks/useAccessPolicy";

export function ExamGateBanner() {
  const {effectiveStateLabel, query} = useAccessPolicy();

  if (effectiveStateLabel === "NONE") {
    return (
      <div className="gateBanner buy">
        <span>You need an examination account first. Buy one to begin your evaluation.</span>
        <a className="gateBannerCta" href="#tiers">Buy an examination</a>
      </div>
    );
  }

  if (effectiveStateLabel === "FAILED") {
    return (
      <div className="gateBanner fail">
        <span>This examination failed. Buy a new examination to try again.</span>
        <a className="gateBannerCta" href="#tiers">Buy a new examination</a>
      </div>
    );
  }

  if (effectiveStateLabel === "PASSED" || effectiveStateLabel === "FUNDED" || effectiveStateLabel === "PAYOUT") {
    return (
      <div className="gateBanner pass">
        <span>You&apos;ve passed — the funded Terminal is unlocked.</span>
        <Link className="gateBannerCta" href={`/terminal?${query}`}>Continue to Terminal →</Link>
      </div>
    );
  }

  return null;
}
