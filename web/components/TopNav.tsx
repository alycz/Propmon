"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";

import {usePropmon} from "./PropmonProvider";

const links = [
  {href: "/terminal", label: "Terminal"},
  {href: "/examination", label: "Examination"},
  {href: "/profile", label: "Profile"}
] as const;

export function TopNav() {
  const {core} = usePropmon();
  const pathname = usePathname();

  // Carry the active mode (and account, if selected) across every navigation so
  // demo/live state and the working account survive client-side route changes.
  const params = new URLSearchParams();
  params.set("mode", core.mode);
  if (core.accountIdInput) params.set("account", core.accountIdInput);
  const query = params.toString();

  return (
    <nav className="topnav" aria-label="Primary">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={`${link.href}?${query}`}
            className={active ? "topnavLink active" : "topnavLink"}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
