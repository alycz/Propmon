"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useState} from "react";

import {useAccessPolicy} from "../hooks/useAccessPolicy";
import {LockGlyph, Modal} from "./Modal";

const links = [
  {href: "/terminal", label: "Terminal"},
  {href: "/examination", label: "Examination"},
  {href: "/profile", label: "Profile"}
] as const;

export function TopNav() {
  const pathname = usePathname();
  const {policyFor, query, terminalAllowed} = useAccessPolicy();
  const [gate, setGate] = useState<{title: string; reason: string; ctaLabel?: string; ctaHref?: string} | null>(null);

  return (
    <>
      <nav className="topnav" aria-label="Primary">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const policy = policyFor(link.href);
          const locked = policy.locked;
          const justUnlocked = link.href === "/terminal" && terminalAllowed;
          const className = [
            "topnavLink",
            active ? "active" : "",
            locked ? "locked" : "",
            justUnlocked && !active ? "unlocked" : ""
          ]
            .filter(Boolean)
            .join(" ");

          if (locked) {
            return (
              <button
                key={link.href}
                type="button"
                className={className}
                onClick={() => setGate({title: policy.title, reason: policy.reason, ctaLabel: policy.ctaLabel, ctaHref: policy.ctaHref})}
              >
                <span className="navLock" aria-hidden><LockGlyph /></span>
                {link.label}
              </button>
            );
          }

          return (
            <Link
              key={link.href}
              href={`${link.href}?${query}`}
              className={className}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <Modal
        open={gate != null}
        title={gate?.title ?? ""}
        onClose={() => setGate(null)}
        primaryLabel={gate?.ctaLabel}
        primaryHref={gate?.ctaHref}
      >
        <p>{gate?.reason}</p>
      </Modal>
    </>
  );
}
