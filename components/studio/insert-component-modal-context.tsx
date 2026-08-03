"use client"

import * as React from "react"

type InsertComponentModalContextValue = {
  open: boolean
  canInsert: boolean
  setOpen: (open: boolean) => void
}

const InsertComponentModalContext = React.createContext<InsertComponentModalContextValue | null>(null)

export function InsertComponentModalProvider({
  open,
  canInsert,
  onOpenChange,
  children,
}: {
  open: boolean
  canInsert: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  React.useEffect(() => {
    if (!canInsert && open) onOpenChange(false)
  }, [canInsert, onOpenChange, open])

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && !canInsert) return
      onOpenChange(nextOpen)
    },
    [canInsert, onOpenChange],
  )
  const value = React.useMemo(() => ({ open: canInsert && open, canInsert, setOpen }), [canInsert, open, setOpen])

  return <InsertComponentModalContext.Provider value={value}>{children}</InsertComponentModalContext.Provider>
}

export function useInsertComponentModal() {
  return React.useContext(InsertComponentModalContext)
}
