import type { AuthoringProp } from "./authoring-catalog"

export type AuthoringCapabilityFlags = {
  inline?: boolean
  media?: boolean
  configurable?: boolean
}

/** Derive display-only palette capabilities from validated authoring metadata. */
export function deriveCapabilities(props: AuthoringProp[], kind: "flow" | "text"): AuthoringCapabilityFlags {
  return {
    inline: kind === "text",
    media: props.some((prop) => prop.type === "image"),
    configurable: props.length > 0,
  }
}
