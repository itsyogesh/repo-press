"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { AuthoringComponent } from "@/lib/studio/authoring-catalog"
import { ComponentPropForm, type PropFormState, validateFormState } from "./component-prop-form"

export function ComponentEditModal({
  open,
  component,
  initialProps,
  editablePropNames,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  component: AuthoringComponent
  initialProps: Readonly<PropFormState>
  editablePropNames: readonly string[]
  onOpenChange: (open: boolean) => void
  onSubmit: (changes: Readonly<Record<string, string | number | boolean | undefined>>) => void
}) {
  const [formState, setFormState] = React.useState<PropFormState>(() => ({ ...initialProps }))
  React.useEffect(() => setFormState({ ...initialProps }), [initialProps])
  const editableNames = React.useMemo(() => new Set(editablePropNames), [editablePropNames])
  const editableComponent = React.useMemo(
    () => ({ ...component, props: component.props.filter((prop) => editableNames.has(prop.name)) }),
    [component, editableNames],
  )
  const errors = validateFormState(editableComponent, formState, { validateSlots: false })
  const changedProps = editableComponent.props.filter(
    (prop) => !Object.is(initialProps[prop.name], formState[prop.name]),
  )
  const canSubmit = changedProps.length === 1 && Object.keys(errors).length === 0

  const submit = () => {
    const prop = changedProps[0]
    if (!prop || !canSubmit) return
    const rawValue = formState[prop.name]
    const value = prop.type === "number" && rawValue !== undefined ? Number(rawValue) : rawValue
    onSubmit(Object.freeze({ [prop.name]: value as string | number | boolean | undefined }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {component.displayName}</DialogTitle>
          <DialogDescription>Change one declared literal prop without reserializing the document.</DialogDescription>
        </DialogHeader>
        <ComponentPropForm
          def={editableComponent}
          formState={formState}
          onFormChange={setFormState}
          errors={errors}
          preserveSlots
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={submit}>
            Update Component
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
