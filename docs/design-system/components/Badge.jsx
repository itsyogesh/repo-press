import React from "react";

/**
 * RepoPress — Badge
 * Small pill for counts, labels, and inline meta. Neutral by default;
 * `accent` uses Signal Slate subtle. Mono option for technical values.
 */

const CSS = `
.rp-badge {
  display: inline-flex; align-items: center; gap: 5px;
  height: 20px; padding: 0 8px;
  font-family: var(--font-sans); font-size: 11.5px; font-weight: 500;
  letter-spacing: -0.005em; line-height: 1; white-space: nowrap;
  border-radius: var(--radius-full); border: 1px solid var(--border);
  background: var(--surface-muted); color: var(--text-secondary);
}
.rp-badge--accent { background: var(--slate-subtle); color: var(--slate); border-color: color-mix(in oklch, var(--slate) 22%, transparent); }
.rp-badge--solid { background: var(--surface-inverse); color: var(--text-on-inverse); border-color: transparent; }
.rp-badge--outline { background: transparent; }
.rp-badge--mono { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0; text-transform: uppercase; }
.rp-badge__dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.rp-badge svg { width: 12px; height: 12px; }
`;

function inject() {
  if (typeof document === "undefined" || document.getElementById("rp-badge-css")) return;
  const s = document.createElement("style");
  s.id = "rp-badge-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
inject();

export function Badge({ variant = "neutral", mono = false, dot = false, className = "", children, ...rest }) {
  const cls = [
    "rp-badge",
    variant !== "neutral" && `rp-badge--${variant}`,
    mono && "rp-badge--mono",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} {...rest}>
      {dot ? <span className="rp-badge__dot" /> : null}
      {children}
    </span>
  );
}
