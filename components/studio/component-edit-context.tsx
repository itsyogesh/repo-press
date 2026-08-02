"use client"

import * as React from "react"
import type { AuthoringCatalog, AuthoringComponent } from "@/lib/studio/authoring-catalog"
import {
  buildComponentEditIdentityIndex,
  editComponentProp,
  type MdxComponentEditIdentity,
  type PreparedComponentPropEdit,
  prepareComponentPropEdit,
} from "@/lib/studio/mdx-source-edit"
import { ComponentEditModal } from "./component-edit-modal"

type ComponentEditPosition = Readonly<{ name: string; start: number }>
type ComponentEditRequest = (identity: MdxComponentEditIdentity) => void
type ComponentEditBridge = Readonly<{
  captureIdentity: (position: ComponentEditPosition) => MdxComponentEditIdentity | null
  requestEdit: ComponentEditRequest
}>

const ComponentEditRequestContext = React.createContext<ComponentEditBridge | null>(null)

export function useComponentEditRequest(): ComponentEditBridge | null {
  return React.useContext(ComponentEditRequestContext)
}

type EditSession = Readonly<{ component: AuthoringComponent; prepared: PreparedComponentPropEdit }>

export function ComponentEditProvider({
  authoringCatalog,
  getSource,
  applySource,
  children,
}: {
  authoringCatalog: AuthoringCatalog
  getSource: () => string
  applySource: (source: string) => void
  children: React.ReactNode
}) {
  const [session, setSession] = React.useState<EditSession | null>(null)
  const [refusal, setRefusal] = React.useState<string | null>(null)
  const identityIndexCache = React.useRef<{
    source: string
    index: ReturnType<typeof buildComponentEditIdentityIndex>
  } | null>(null)

  const requestEdit = React.useCallback<ComponentEditRequest>(
    (identity) => {
      setRefusal(null)
      const component = authoringCatalog.find((candidate) => candidate.mdxName === identity.name)
      const source = getSource()
      if (!component) {
        setRefusal("This component cannot be edited safely from the current source.")
        return
      }
      const prepared = prepareComponentPropEdit(source, identity, component)
      if (!prepared.ok) {
        setRefusal("This component cannot be edited safely because its position or props are ambiguous.")
        return
      }
      setSession(Object.freeze({ component, prepared }))
    },
    [authoringCatalog, getSource],
  )

  const captureIdentity = React.useCallback(
    (position: ComponentEditPosition): MdxComponentEditIdentity | null => {
      const source = getSource()
      if (identityIndexCache.current?.source !== source) {
        identityIndexCache.current = { source, index: buildComponentEditIdentityIndex(source) }
      }
      const index = identityIndexCache.current.index
      const captured = index.ok ? index.capture(position) : index
      return captured.ok ? captured.identity : null
    },
    [getSource],
  )

  const editBridge = React.useMemo<ComponentEditBridge>(
    () => Object.freeze({ captureIdentity, requestEdit }),
    [captureIdentity, requestEdit],
  )

  const submit = React.useCallback(
    (changes: Readonly<Record<string, string | number | boolean | undefined>>) => {
      if (!session) return
      const latestSource = getSource()
      const result = editComponentProp(latestSource, session.prepared.target, changes)
      if (!result.ok) {
        setRefusal(
          latestSource === session.prepared.target.sourceSnapshot
            ? "This component cannot be edited safely from the current source."
            : "The source changed while this component was being edited. Reopen it and try again.",
        )
        setSession(null)
        return
      }
      applySource(result.source)
      setSession(null)
      setRefusal(null)
    },
    [applySource, getSource, session],
  )

  return (
    <ComponentEditRequestContext.Provider value={editBridge}>
      {refusal ? (
        <div
          role="alert"
          className="border-b border-studio-attention/30 bg-studio-attention-muted px-4 py-2 text-sm text-studio-attention"
        >
          {refusal}
        </div>
      ) : null}
      {children}
      {session ? (
        <ComponentEditModal
          open
          component={session.component}
          initialProps={session.prepared.initialProps}
          editablePropNames={session.prepared.editablePropNames}
          onOpenChange={(open) => {
            if (!open) setSession(null)
          }}
          onSubmit={submit}
        />
      ) : null}
    </ComponentEditRequestContext.Provider>
  )
}
