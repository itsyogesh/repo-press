import React from "react";

/**
 * RepoPress — Tabs
 * Underline tab bar for switching panes (editor / preview / metadata,
 * dashboard sections). Active tab carries Signal Slate underline + text;
 * the moving underline is a position change, not color-only.
 */

const CSS = `
.rp-tabs { display: flex; align-items: stretch; gap: 2px; border-bottom: 1px solid var(--border); }
.rp-tab {
  position: relative; display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 12px; margin-bottom: -1px;
  font-family: var(--font-sans); font-size: 13px; font-weight: 500;
  letter-spacing: -0.006em; color: var(--text-muted);
  background: transparent; border: 0; cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.rp-tab:hover { color: var(--text-primary); }
.rp-tab[aria-selected="true"] { color: var(--text-primary); border-bottom-color: var(--slate); }
.rp-tab:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); border-radius: 4px; }
.rp-tab__count {
  font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted);
  background: var(--surface-muted); padding: 1px 6px; border-radius: var(--radius-full);
}
.rp-tab[aria-selected="true"] .rp-tab__count { background: var(--slate-subtle); color: var(--slate); }
.rp-tab svg { width: 15px; height: 15px; }
`;

function inject() {
  if (typeof document === "undefined" || document.getElementById("rp-tabs-css")) return;
  const s = document.createElement("style");
  s.id = "rp-tabs-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
inject();

export function Tabs({ tabs = [], value, onChange, className = "", ...rest }) {
  return (
    <div className={["rp-tabs", className].filter(Boolean).join(" ")} role="tablist" {...rest}>
      {tabs.map((t) => {
        const id = typeof t === "string" ? t : t.value;
        const label = typeof t === "string" ? t : t.label;
        const icon = typeof t === "string" ? null : t.icon;
        const count = typeof t === "string" ? undefined : t.count;
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            className="rp-tab"
            onClick={() => onChange && onChange(id)}
          >
            {icon}
            {label}
            {count != null ? <span className="rp-tab__count">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
