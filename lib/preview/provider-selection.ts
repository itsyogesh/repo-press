import type { PreviewFidelity } from "./contracts"

export type NativeProviderKind = "managed-native" | "external-bridge"
export type PreviewProviderKind = NativeProviderKind | "browser-compatible" | "generic-typeset"

export type PreviewDowngradeReason =
  | "NATIVE_UNAVAILABLE"
  | "EXECUTABLE_DIGEST_UNTRUSTED"
  | "BROWSER_CAPABILITY_UNSUPPORTED"

export type ServerResolvedProviderFacts = {
  nativeCandidates: ReadonlyArray<{
    kind: NativeProviderKind
    available: boolean
    executableDigestTrusted: boolean
  }>
  browserBundle: {
    available: boolean
    executableDigestTrusted: boolean
    capabilitySupported: boolean
  }
}

export type PreviewProviderSelection = {
  provider: PreviewProviderKind
  fidelity: PreviewFidelity
  downgradeReasons: PreviewDowngradeReason[]
}

const nativeProviderOrder: NativeProviderKind[] = ["managed-native", "external-bridge"]
const downgradeReasonOrder: PreviewDowngradeReason[] = [
  "NATIVE_UNAVAILABLE",
  "EXECUTABLE_DIGEST_UNTRUSTED",
  "BROWSER_CAPABILITY_UNSUPPORTED",
]

export function selectPreviewProvider(facts: ServerResolvedProviderFacts): PreviewProviderSelection {
  const native = nativeProviderOrder.find((kind) =>
    facts.nativeCandidates.some(
      (candidate) => candidate.kind === kind && candidate.available && candidate.executableDigestTrusted,
    ),
  )

  if (native) {
    return { provider: native, fidelity: "native", downgradeReasons: [] }
  }

  const reasons = new Set<PreviewDowngradeReason>()
  const hasAvailableNative = facts.nativeCandidates.some((candidate) => candidate.available)
  const hasUntrustedAvailableNative = facts.nativeCandidates.some(
    (candidate) => candidate.available && !candidate.executableDigestTrusted,
  )

  if (!hasAvailableNative) reasons.add("NATIVE_UNAVAILABLE")
  if (hasUntrustedAvailableNative) reasons.add("EXECUTABLE_DIGEST_UNTRUSTED")

  const browser = facts.browserBundle
  if (!browser.capabilitySupported) {
    reasons.add("BROWSER_CAPABILITY_UNSUPPORTED")
  }
  if (browser.available && !browser.executableDigestTrusted) {
    reasons.add("EXECUTABLE_DIGEST_UNTRUSTED")
  }

  const downgradeReasons = downgradeReasonOrder.filter((reason) => reasons.has(reason))

  if (browser.available && browser.executableDigestTrusted && browser.capabilitySupported) {
    return {
      provider: "browser-compatible",
      fidelity: "compatible",
      downgradeReasons,
    }
  }

  return {
    provider: "generic-typeset",
    fidelity: "generic",
    downgradeReasons,
  }
}
