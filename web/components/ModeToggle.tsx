"use client";

import {usePropmon} from "./PropmonProvider";

export function ModeToggle() {
  const {core} = usePropmon();
  return (
    <div className="modeToggle" aria-label="Mode toggle">
      <button className={core.mode === "demo" ? "active" : ""} onClick={() => core.setMode("demo")}>DEMO</button>
      <button className={core.mode === "live" ? "active" : ""} onClick={() => core.setMode("live")}>LIVE</button>
    </div>
  );
}
