import React from "react";

/**
 * RepoPress — Switch
 * Pill toggle. Off = muted track; On = Signal Slate. The thumb travels
 * (position change), so state is never color-only.
 */

const CSS = `
.rp-switch {
  position: relative; display: inline-flex; align-items: center;
  width: 38px; height: 22px; padding: 0; flex: none;
  background: var(--surface-muted); border: 1px solid var(--border);
  border-radius: var(--radius-full); cursor: pointer;
  transition: background var(--dur-base) var(--ease-standard),
              border-color var(--dur-base) var(--ease-standard);
}
.rp-switch__thumb {
  position: absolute; left: 2px; width: 16px; height: 16px;
  background: var(--surface-card); border-radius: 50%;
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.25);
  transition: transform var(--dur-base) var(--ease-out);
}
.rp-switch[data-on="true"] { background: var(--slate); border-color: var(--slate); }
.rp-switch[data-on="true"] .rp-switch__thumb { transform: translateX(16px); background: #fff; }
.rp-switch:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }
.rp-switch[disabled] { opacity: 0.45; pointer-events: none; }
.rp-switch-row { display: inline-flex; align-items: center; gap: 10px; }
.rp-switch-row__label { font-family: var(--font-sans); font-size: 13px; font-weight: 500; color: var(--text-primary); }
`;

function inject() {
  if (typeof document === "undefined" || document.getElementById("rp-switch-css")) return;
  const s = document.createElement("style");
  s.id = "rp-switch-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
inject();

export function Switch({ checked = false, onChange, disabled = false, label, id, className = "", ...rest }) {
  const toggle = () => !disabled && onChange && onChange(!checked);
  const btn = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-on={checked}
      disabled={disabled}
      onClick={toggle}
      id={id}
      className={["rp-switch", className].filter(Boolean).join(" ")}
      {...rest}
    >
      <span className="rp-switch__thumb" />
    </button>
  );
  if (!label) return btn;
  return (
    <span className="rp-switch-row">
      {btn}
      <label className="rp-switch-row__label" htmlFor={id} onClick={toggle}>
        {label}
      </label>
    </span>
  );
}
