import React from "react";

/**
 * RepoPress — Input
 * Hairline text field with Signal Slate focus ring. Supports a leading
 * icon (search) and a monospace mode for paths / technical values.
 */

const CSS = `
.rp-field { display: flex; flex-direction: column; gap: 6px; }
.rp-field__label {
  font-family: var(--font-sans); font-size: 13px; font-weight: 500;
  letter-spacing: -0.006em; color: var(--text-primary);
}
.rp-field__hint { font-size: 12px; color: var(--text-muted); }
.rp-input-wrap { position: relative; display: flex; align-items: center; }
.rp-input-wrap__icon {
  position: absolute; left: 11px; display: inline-flex;
  color: var(--text-muted); pointer-events: none;
}
.rp-input-wrap__icon svg { width: 15px; height: 15px; display: block; }
.rp-input {
  width: 100%; height: 36px; padding: 0 12px;
  font-family: var(--font-sans); font-size: 14px; color: var(--text-primary);
  background: var(--surface-card);
  border: 1px solid var(--border); border-radius: var(--radius);
  transition: border-color var(--dur-fast) var(--ease-standard),
              box-shadow var(--dur-fast) var(--ease-standard);
}
.rp-input::placeholder { color: var(--text-muted); }
.rp-input:hover { border-color: var(--border-strong); }
.rp-input:focus { outline: none; border-color: var(--slate); box-shadow: 0 0 0 3px var(--ring); }
.rp-input--mono { font-family: var(--font-mono); font-size: 13px; }
.rp-input--icon { padding-left: 34px; }
.rp-input--search { background: var(--surface-muted); border-color: transparent; }
.rp-input--search:focus { background: var(--surface-card); }
.rp-input[disabled] { opacity: 0.55; pointer-events: none; }
.rp-input--invalid, .rp-input--invalid:focus { border-color: var(--danger); box-shadow: 0 0 0 3px color-mix(in oklch, var(--danger) 22%, transparent); }
`;

function inject() {
  if (typeof document === "undefined" || document.getElementById("rp-input-css")) return;
  const s = document.createElement("style");
  s.id = "rp-input-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
inject();

export function Input({
  label,
  hint,
  icon,
  mono = false,
  search = false,
  invalid = false,
  className = "",
  id,
  ...rest
}) {
  const inputCls = [
    "rp-input",
    icon && "rp-input--icon",
    mono && "rp-input--mono",
    search && "rp-input--search",
    invalid && "rp-input--invalid",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const field = (
    <div className="rp-input-wrap">
      {icon ? <span className="rp-input-wrap__icon">{icon}</span> : null}
      <input id={id} className={inputCls} aria-invalid={invalid || undefined} {...rest} />
    </div>
  );
  if (!label && !hint) return field;
  return (
    <div className="rp-field">
      {label ? (
        <label className="rp-field__label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {field}
      {hint ? <span className="rp-field__hint">{hint}</span> : null}
    </div>
  );
}
