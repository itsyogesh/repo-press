let guardCount = 0
let originalDescriptor: PropertyDescriptor | undefined

export function acquireFunctionConstructorGuard() {
  if (typeof Function === "undefined") {
    return () => {}
  }

  if (guardCount === 0) {
    originalDescriptor = Object.getOwnPropertyDescriptor(Function.prototype, "constructor")
    Object.defineProperty(Function.prototype, "constructor", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: undefined,
    })
  }

  guardCount += 1

  return () => {
    guardCount = Math.max(0, guardCount - 1)
    if (guardCount === 0 && originalDescriptor) {
      Object.defineProperty(Function.prototype, "constructor", originalDescriptor)
    }
  }
}

export function withFunctionConstructorGuard<T>(callback: () => T): T {
  const release = acquireFunctionConstructorGuard()
  try {
    return callback()
  } finally {
    release()
  }
}
