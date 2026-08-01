import React from "react";

/**
 * RepoPress — Select
 * Native select styled as a hairline field with a trailing chevron.
 */

const CSS = `
.rp-select-wrap { position: relative; display: inline-flex; width: 100%; align-items: center; }
.rp-select {
  width: 100%; height: 36px; padding: 0 34px 0 12px;
  font-family: var(--font-sans); font-size: 14px; color: var(--text-primary);
  background: var(--surface-card);
  border: 1px solid var(--border); border-radius: var(--radius);
  appearance: none; cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-standard),
              box-shadow var(--dur-fast) var(--ease-standard);
}
.rp-select:hover { border-color: var(--border-strong); }
.rp-select:focus { outline: none; border-color: var(--slate); box-shadow: 0 0 0 3px var(--ring); }
.rp-select[disabled] { opacity: 0.55; pointer-events: none; }
.rp-select-wrap__chev {
  position: absolute; right: 11px; width: 15px; height: 15px;
  color: var(--text-muted); pointer-events: none;
}
`;

function inject() {
  if (typeof document === "undefined" || document.getElementById("rp-select-css")) return;
  const s = document.createElement("style");
  s.id = "rp-select-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
inject();

export function Select({ options = [], className = "", children, ...rest }) {
  return (
    <span className="rp-select-wrap">
      <select className={["rp-select", className].filter(Boolean).join(" ")} {...rest}>
        {children
          ? children
          : options.map((o) => {
              const value = typeof o === "string" ? o : o.value;
              const label = typeof o === "string" ? o : o.label;
              return (
                <option key={value} value={value}>
                  {label}
                </option>
              );
            })}
      </select>
      <svg className="rp-select-wrap__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}
