import type React from "react"

type Status = "draft" | "in_review" | "approved" | "published"

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; border: string }> = {
  draft: { label: "Draft", color: "#fbbf24", bg: "#1c1917", border: "#854d0e" },
  in_review: { label: "In Review", color: "#60a5fa", bg: "#0c1d36", border: "#1e40af" },
  approved: { label: "Approved", color: "#22c55e", bg: "#052e16", border: "#166534" },
  published: { label: "Published", color: "#3b82f6", bg: "#0a1628", border: "#3b82f6" },
}

interface StatusChipProps {
  status: Status
  scale?: number
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, scale = 1 }) => {
  const cfg = STATUS_CONFIG[status]
  return (
    <div
      style={{
        transform: `scale(${Math.min(scale, 1)})`,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 22px",
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 600,
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1.5px solid ${cfg.border}`,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cfg.color }} />
      {cfg.label}
    </div>
  )
}
