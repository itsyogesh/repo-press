import React from "react";

/**
 * RepoPress — Card
 * The standard content container: hairline border, 12px radius, subtle
 * raised shadow. `interactive` adds hover lift; `featured` tints with Slate;
 * `inverse` is the dark editorial block used on light marketing pages.
 */

const CSS = `
.rp-card {
  display: block; position: relative;
  background: var(--surface-card);
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-1);
  padding: var(--space-6);
  transition: border-color var(--dur-base) var(--ease-standard),
              box-shadow var(--dur-base) var(--ease-standard),
              transform var(--dur-base) var(--ease-out);
}
.rp-card--pad-compact { padding: var(--space-4); }
.rp-card--pad-spacious { padding: var(--space-8); }
.rp-card--pad-none { padding: 0; }
.rp-card--interactive { cursor: pointer; }
.rp-card--interactive:hover { border-color: var(--border-strong); box-shadow: var(--shadow-2); transform: translateY(-2px); }
.rp-card--featured { background: var(--slate-subtle); border-color: color-mix(in oklch, var(--slate) 24%, transparent); }
.rp-card--inverse { background: var(--surface-inverse); border-color: var(--border-inverse); color: var(--text-on-inverse); box-shadow: none; }
.rp-card--flat { box-shadow: none; }
`;

function inject() {
  if (typeof document === "undefined" || document.getElementById("rp-card-css")) return;
  const s = document.createElement("style");
  s.id = "rp-card-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
inject();

export function Card({
  variant = "default",
  padding = "default",
  interactive = false,
  flat = false,
  as: Comp = "div",
  className = "",
  children,
  ...rest
}) {
  const cls = [
    "rp-card",
    variant !== "default" && `rp-card--${variant}`,
    padding !== "default" && `rp-card--pad-${padding}`,
    interactive && "rp-card--interactive",
    flat && "rp-card--flat",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Comp className={cls} {...rest}>
      {children}
    </Comp>
  );
}
