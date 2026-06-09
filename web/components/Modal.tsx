"use client";

import Link from "next/link";
import {type ReactNode} from "react";

type Props = {
  open: boolean;
  title: string;
  children?: ReactNode;
  onClose: () => void;
  primaryLabel?: string;
  primaryHref?: string;
  onPrimary?: () => void;
};

export function Modal({open, title, children, onClose, primaryLabel, primaryHref, onPrimary}: Props) {
  if (!open) return null;
  return (
    <div className="modalOverlay" onClick={onClose} role="presentation">
      <div className="modalCard" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modalHead">
          <span className="modalLock" aria-hidden>
            <LockGlyph />
          </span>
          <h2>{title}</h2>
        </div>
        <div className="modalBody">{children}</div>
        <div className="modalActions">
          {primaryLabel && primaryHref && (
            <Link className="primary" href={primaryHref} onClick={onClose}>{primaryLabel}</Link>
          )}
          {primaryLabel && !primaryHref && onPrimary && (
            <button className="primary" onClick={() => { onPrimary(); onClose(); }}>{primaryLabel}</button>
          )}
          <button className="secondary" onClick={onClose}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

export function LockGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="1" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
