import React from "react";

/**
 * RepoPress — Tag
 * Taxonomy chip for tags, categories, and collections. Optional leading
 * color dot and a removable affordance for editors.
 */

const CSS = `
.rp-tag {
  display: inline-flex; align-items: center; gap: 6px;
  height: 24px; padding: 0 9px;
  font-family: var(--font-sans); font-size: 12.5px; font-weight: 500;
  letter-spacing: -0.006em; line-height: 1; white-space: nowrap;
  color: var(--text-secondary); background: var(--surface-card);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  transition: border-color var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard);
}
.rp-tag--button { cursor: pointer; }
.rp-tag--button:hover { border-color: var(--border-strong); background: var(--surface-muted); }
.rp-tag--selected { background: var(--slate-subtle); color: var(--slate); border-color: color-mix(in oklch, var(--slate) 30%, transparent); }
.rp-tag__hash { font-family: var(--font-mono); color: var(--text-muted); }
.rp-tag--selected .rp-tag__hash { color: var(--slate); }
.rp-tag__swatch { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.rp-tag__remove {
  display: inline-flex; align-items: center; justify-content: center;
  width: 15px; height: 15px; margin-right: -3px; border: 0; padding: 0;
  background: transparent; color: var(--text-muted); cursor: pointer; border-radius: 4px;
}
.rp-tag__remove:hover { background: var(--surface-muted); color: var(--text-primary); }
.rp-tag__remove svg { width: 11px; height: 11px; }
`;

function inject() {
  if (typeof document === "undefined" || document.getElementById("rp-tag-css")) return;
  const s = document.createElement("style");
  s.id = "rp-tag-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
inject();

export function Tag({ color, hash = false, selected = false, onRemove, onClick, className = "", children, ...rest }) {
  const interactive = !!onClick;
  const cls = [
    "rp-tag",
    interactive && "rp-tag--button",
    selected && "rp-tag--selected",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const Comp = interactive ? "button" : "span";
  return (
    <Comp className={cls} onClick={onClick} type={interactive ? "button" : undefined} {...rest}>
      {color ? <span className="rp-tag__swatch" style={{ background: color }} /> : null}
      {hash ? <span className="rp-tag__hash">#</span> : null}
      {children}
      {onRemove ? (
        <button
          type="button"
          className="rp-tag__remove"
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(e);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </Comp>
  );
}
