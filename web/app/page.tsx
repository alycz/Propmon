"use client";

import {Suspense, useEffect} from "react";
import {useRouter, useSearchParams} from "next/navigation";

import {parseMode} from "../lib/config";

function Redirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("mode", parseMode(searchParams.get("mode")));
    const account = (searchParams.get("account") ?? "").replace(/\D/g, "");
    if (account) params.set("account", account);
    router.replace(`/terminal?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <main className="appShell">
      <section className="panel">Loading Propmon…</section>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
