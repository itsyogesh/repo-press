# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# toast

- Use Sonner (`sonner` package, `components/ui/sonner.tsx`) for toast notifications. Remove and avoid legacy shadcn/Radix toast files (`use-toast.ts`, `toaster.tsx`, `toast.tsx`, `@radix-ui/react-toast`). Confidence: 0.85

# architecture

- File create/edit/delete operations should be saved as drafts in Convex first; only sync/write to GitHub when the user explicitly clicks Publish. Confidence: 0.85

# workflow

- Before implementing any feature or fix, create a comprehensive, phased plan and present it for review. Do not write code until the plan is confirmed. Confidence: 0.80

