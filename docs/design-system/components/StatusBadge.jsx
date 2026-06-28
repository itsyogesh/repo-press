import React from "react";

/**
 * RepoPress — StatusBadge
 * The document-workflow status system. One badge per status; published is
 * the only solid fill. Status reads as shape + tone (dot + pill), never
 * color alone.
 */

const STATUSES = {
  draft: { label: "Draft" },
  in_review: { label: "In Review" },
  approved: { label: "Approved" },
  published: { label: "Published" },
  scheduled: { label: "Scheduled" },
  archived: { label: "Archived" },
};

const CSS = `
.rp-status {
  display: inline-flex; align-items: center; gap: 6px;
  height: 22px; padding: 0 10px;
  font-family: var(--font-mono); font-size: 11px; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.06em; line-height: 1;
  white-space: nowrap; border-radius: var(--radius-full);
  border: 1px solid;
}
.rp-status__dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.rp-status--draft { color: var(--status-draft-fg); background: var(--status-draft-bg); border-color: var(--status-draft-border); }
.rp-status--in_review { color: var(--status-review-fg); background: var(--status-review-bg); border-color: var(--status-review-border); }
.rp-status--approved { color: var(--status-approved-fg); background: var(--status-approved-bg); border-color: var(--status-approved-border); }
.rp-status--published { color: var(--status-published-fg); background: var(--status-published-bg); border-color: var(--status-published-border); }
.rp-status--scheduled { color: var(--status-scheduled-fg); background: var(--status-scheduled-bg); border-color: var(--status-scheduled-border); }
.rp-status--archived { color: var(--status-archived-fg); background: var(--status-archived-bg); border-color: var(--status-archived-border); }
`;

function inject() {
  if (typeof document === "undefined" || document.getElementById("rp-status-css")) return;
  const s = document.createElement("style");
  s.id = "rp-status-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
inject();

export function StatusBadge({ status = "draft", dot = true, className = "", ...rest }) {
  const meta = STATUSES[status] || STATUSES.draft;
  return (
    <span className={["rp-status", `rp-status--${status}`, className].filter(Boolean).join(" ")} {...rest}>
      {dot ? <span className="rp-status__dot" /> : null}
      {meta.label}
    </span>
  );
}
