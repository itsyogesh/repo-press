import React from "react";

/**
 * RepoPress — IconButton
 * Square, icon-only control for toolbars and chrome. Transparent at rest,
 * muted fill on hover. 32px standard, 28px compact.
 */

const CSS = `
.rp-iconbtn {
  --_s: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--_s); height: var(--_s); padding: 0;
  color: var(--text-muted); background: transparent;
  border: 1px solid transparent; border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-standard),
              color var(--dur-fast) var(--ease-standard),
              border-color var(--dur-fast) var(--ease-standard);
}
.rp-iconbtn:hover { background: var(--surface-muted); color: var(--text-primary); }
.rp-iconbtn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }
.rp-iconbtn[disabled] { opacity: 0.4; pointer-events: none; }
.rp-iconbtn--sm { --_s: 28px; border-radius: var(--radius-xs); }
.rp-iconbtn--lg { --_s: 40px; border-radius: var(--radius); }
.rp-iconbtn--active { background: var(--slate-subtle); color: var(--slate); }
.rp-iconbtn--solid { background: var(--surface-card); border-color: var(--border); }
.rp-iconbtn--solid:hover { border-color: var(--border-strong); }
.rp-iconbtn svg { width: 1.05em; height: 1.05em; display: block; }
`;

function inject() {
  if (typeof document === "undefined" || document.getElementById("rp-iconbtn-css")) return;
  const s = document.createElement("style");
  s.id = "rp-iconbtn-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
inject();

export function IconButton({
  size = "md",
  variant = "ghost",
  active = false,
  disabled = false,
  label,
  className = "",
  children,
  ...rest
}) {
  const cls = [
    "rp-iconbtn",
    size !== "md" && `rp-iconbtn--${size}`,
    variant === "solid" && "rp-iconbtn--solid",
    active && "rp-iconbtn--active",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} disabled={disabled} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
