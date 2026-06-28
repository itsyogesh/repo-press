import React from "react";

/**
 * RepoPress — Avatar
 * Author / user avatar. Image when available, else warm monochrome initials.
 * Rounded-full (one of the few allowed full-radius uses).
 */

const CSS = `
.rp-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--_s, 32px); height: var(--_s, 32px); flex: none;
  border-radius: var(--radius-full); overflow: hidden;
  background: var(--surface-muted); color: var(--text-secondary);
  font-family: var(--font-sans); font-weight: 500; line-height: 1;
  font-size: calc(var(--_s, 32px) * 0.4);
  box-shadow: 0 0 0 1px var(--border) inset;
  user-select: none;
}
.rp-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rp-avatar--accent { background: var(--slate-subtle); color: var(--slate); box-shadow: 0 0 0 1px color-mix(in oklch, var(--slate) 22%, transparent) inset; }
.rp-avatar-stack { display: inline-flex; }
.rp-avatar-stack > .rp-avatar { margin-left: -8px; box-shadow: 0 0 0 2px var(--background); }
.rp-avatar-stack > .rp-avatar:first-child { margin-left: 0; }
`;

function inject() {
  if (typeof document === "undefined" || document.getElementById("rp-avatar-css")) return;
  const s = document.createElement("style");
  s.id = "rp-avatar-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
inject();

const SIZES = { sm: 24, md: 32, lg: 40, xl: 56 };

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name = "", src, size = "md", accent = false, className = "", style, ...rest }) {
  const px = SIZES[size] || size;
  const cls = ["rp-avatar", accent && "rp-avatar--accent", className].filter(Boolean).join(" ");
  return (
    <span className={cls} style={{ "--_s": `${px}px`, ...style }} title={name || undefined} {...rest}>
      {src ? <img src={src} alt={name} /> : initials(name)}
    </span>
  );
}

export function AvatarStack({ children, className = "", ...rest }) {
  return (
    <span className={["rp-avatar-stack", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </span>
  );
}
