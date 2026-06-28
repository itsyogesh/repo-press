import React from "react";

/**
 * RepoPress — Button
 * Primary action uses Signal Slate (the one accent). Secondary/ghost stay
 * achromatic. Editorial-soft 8px radius. Never weight 700.
 */

const CSS = `
.rp-btn {
  --_h: 36px; --_px: 14px; --_fs: 13px;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: var(--_h); padding: 0 var(--_px);
  font-family: var(--font-sans); font-size: var(--_fs); font-weight: 500;
  letter-spacing: -0.01em; line-height: 1; white-space: nowrap;
  border-radius: var(--radius); border: 1px solid transparent;
  cursor: pointer; user-select: none;
  transition: background var(--dur-fast) var(--ease-standard),
              border-color var(--dur-fast) var(--ease-standard),
              color var(--dur-fast) var(--ease-standard),
              transform var(--dur-fast) var(--ease-standard);
}
.rp-btn:active { transform: translateY(0.5px) scale(0.992); }
.rp-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }
.rp-btn[disabled] { opacity: 0.45; pointer-events: none; }
.rp-btn--sm { --_h: 30px; --_px: 11px; --_fs: 12px; }
.rp-btn--lg { --_h: 44px; --_px: 20px; --_fs: 14px; border-radius: var(--radius-md); }

.rp-btn--primary { background: var(--slate); color: var(--slate-on); }
.rp-btn--primary:hover { background: var(--slate-hover); }

.rp-btn--secondary { background: var(--surface-card); color: var(--text-primary); border-color: var(--border); }
.rp-btn--secondary:hover { background: var(--surface-muted); border-color: var(--border-strong); }

.rp-btn--ghost { background: transparent; color: var(--text-secondary); }
.rp-btn--ghost:hover { background: var(--surface-muted); color: var(--text-primary); }

.rp-btn--destructive { background: transparent; color: var(--danger); border-color: color-mix(in oklch, var(--danger) 32%, transparent); }
.rp-btn--destructive:hover { background: var(--danger); color: #fff; border-color: var(--danger); }

.rp-btn__icon { display: inline-flex; width: 1em; height: 1em; align-items: center; justify-content: center; }
.rp-btn__icon svg { width: 100%; height: 100%; display: block; }
`;

function inject() {
  if (typeof document === "undefined" || document.getElementById("rp-button-css")) return;
  const s = document.createElement("style");
  s.id = "rp-button-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
inject();

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const cls = ["rp-btn", `rp-btn--${variant}`, size !== "md" && `rp-btn--${size}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} disabled={disabled} {...rest}>
      {icon ? <span className="rp-btn__icon">{icon}</span> : null}
      {children}
      {iconRight ? <span className="rp-btn__icon">{iconRight}</span> : null}
    </button>
  );
}
