import { describe, expect, it } from "vitest"
import { type ServerResolvedProviderFacts, selectPreviewProvider } from "../provider-selection"

const defaultFacts: ServerResolvedProviderFacts = {
  nativeCandidates: [{ kind: "managed-native", available: true, executableDigestTrusted: true }],
  browserBundle: {
    available: true,
    executableDigestTrusted: true,
    capabilitySupported: true,
  },
}

const facts = (overrides: Partial<ServerResolvedProviderFacts> = {}): ServerResolvedProviderFacts => ({
  ...defaultFacts,
  ...overrides,
})

describe("preview provider selection", () => {
  it("selects the first trusted available native provider", () => {
    expect(selectPreviewProvider(facts())).toEqual({
      provider: "managed-native",
      fidelity: "native",
      downgradeReasons: [],
    })
  })

  it("uses a trusted compatible browser bundle when native is unavailable", () => {
    expect(
      selectPreviewProvider(
        facts({
          nativeCandidates: [
            {
              kind: "managed-native",
              available: false,
              executableDigestTrusted: true,
            },
          ],
        }),
      ),
    ).toEqual({
      provider: "browser-compatible",
      fidelity: "compatible",
      downgradeReasons: ["NATIVE_UNAVAILABLE"],
    })
  })

  it("does not select an untrusted native provider", () => {
    expect(
      selectPreviewProvider(
        facts({
          nativeCandidates: [
            {
              kind: "managed-native",
              available: true,
              executableDigestTrusted: false,
            },
          ],
        }),
      ),
    ).toEqual({
      provider: "browser-compatible",
      fidelity: "compatible",
      downgradeReasons: ["EXECUTABLE_DIGEST_UNTRUSTED"],
    })
  })

  it("chooses generic when the compatible bundle is untrusted", () => {
    expect(
      selectPreviewProvider(
        facts({
          nativeCandidates: [],
          browserBundle: {
            available: true,
            executableDigestTrusted: false,
            capabilitySupported: true,
          },
        }),
      ),
    ).toEqual({
      provider: "generic-typeset",
      fidelity: "generic",
      downgradeReasons: ["NATIVE_UNAVAILABLE", "EXECUTABLE_DIGEST_UNTRUSTED"],
    })
  })

  it("reports all applicable downgrade reasons once in stable order", () => {
    expect(
      selectPreviewProvider(
        facts({
          nativeCandidates: [
            {
              kind: "managed-native",
              available: true,
              executableDigestTrusted: false,
            },
            {
              kind: "external-bridge",
              available: true,
              executableDigestTrusted: false,
            },
          ],
          browserBundle: {
            available: true,
            executableDigestTrusted: false,
            capabilitySupported: false,
          },
        }),
      ),
    ).toEqual({
      provider: "generic-typeset",
      fidelity: "generic",
      downgradeReasons: ["EXECUTABLE_DIGEST_UNTRUSTED", "BROWSER_CAPABILITY_UNSUPPORTED"],
    })
  })

  it("selects an available trusted native candidate deterministically", () => {
    expect(
      selectPreviewProvider(
        facts({
          nativeCandidates: [
            {
              kind: "external-bridge",
              available: true,
              executableDigestTrusted: true,
            },
            {
              kind: "managed-native",
              available: true,
              executableDigestTrusted: true,
            },
          ],
        }),
      ),
    ).toEqual({
      provider: "managed-native",
      fidelity: "native",
      downgradeReasons: [],
    })
  })

  it("reports when a capable compatible provider is unavailable", () => {
    expect(
      selectPreviewProvider(
        facts({
          nativeCandidates: [],
          browserBundle: {
            available: false,
            executableDigestTrusted: true,
            capabilitySupported: true,
          },
        }),
      ),
    ).toEqual({
      provider: "generic-typeset",
      fidelity: "generic",
      downgradeReasons: ["NATIVE_UNAVAILABLE", "COMPATIBLE_UNAVAILABLE"],
    })
  })

  it("distinguishes compatible unavailability from unsupported capability", () => {
    expect(
      selectPreviewProvider(
        facts({
          nativeCandidates: [],
          browserBundle: {
            available: false,
            executableDigestTrusted: true,
            capabilitySupported: false,
          },
        }),
      ),
    ).toEqual({
      provider: "generic-typeset",
      fidelity: "generic",
      downgradeReasons: ["NATIVE_UNAVAILABLE", "COMPATIBLE_UNAVAILABLE", "BROWSER_CAPABILITY_UNSUPPORTED"],
    })
  })
})
