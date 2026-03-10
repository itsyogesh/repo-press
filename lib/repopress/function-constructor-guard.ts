let guardCount = 0
let originalDescriptor: PropertyDescriptor | undefined
let evalGuardCount = 0
let originalEvalDescriptor: PropertyDescriptor | undefined

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

export function acquireEvalGuard() {
  if (typeof globalThis === "undefined") {
    return () => {}
  }

  if (evalGuardCount === 0) {
    originalEvalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "eval")
    Object.defineProperty(globalThis, "eval", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: undefined,
    })
  }

  evalGuardCount += 1

  return () => {
    evalGuardCount = Math.max(0, evalGuardCount - 1)
    if (evalGuardCount === 0 && originalEvalDescriptor) {
      Object.defineProperty(globalThis, "eval", originalEvalDescriptor)
    }
  }
}

export function withEvalGuard<T>(callback: () => T): T {
  const release = acquireEvalGuard()
  try {
    return callback()
  } finally {
    release()
  }
}
