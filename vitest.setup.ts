import "@testing-library/jest-dom/vitest"

// jsdom intentionally does not implement scrolling. Radix focus/overlay cleanup
// calls this browser API, so provide the inert test-environment equivalent.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: () => undefined,
    writable: true,
  })
}
