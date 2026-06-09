"use client";

import {type ReactNode} from "react";

import {formatBps} from "../lib/format";

export function Panel({title, eyebrow, children, className}: {title: string; eyebrow: string; children: ReactNode; className?: string}) {
  return (
    <section className={className ? `panel ${className}` : "panel"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Metric({label, value, accent}: {label: string; value: string; accent?: "pos" | "neg" | "warn"}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={accent ? `mono accent-${accent}` : "mono"}>{value}</strong>
    </div>
  );
}

export function DrawdownMeter({label, value, limit}: {label: string; value: bigint | undefined; limit: number}) {
  const numeric = Number(value ?? 0n);
  const pct = Math.min(100, Math.round((numeric / limit) * 100));
  const state = pct >= 100 ? "breach" : pct >= 70 ? "warning" : "safe";
  return (
    <div className={`meter ${state}`}>
      <div className="meterLabel">
        <strong>{label}</strong>
        <span className="mono">{formatBps(value)} / {formatBps(limit)}</span>
      </div>
      <div className="meterTrack"><div style={{width: `${pct}%`}} /></div>
    </div>
  );
}
