import type { ExtractedImport } from "@/components/mdx-runtime/transformImports"
import type { CompatibleSourceArtifact } from "@/lib/preview/compatible-artifact"
import {
  type CompatibleFidelityLossCode,
  mergeCompatibleFidelityLosses,
  parseCompatibleFidelityLosses,
} from "./compatible-diagnostics"
import { type CompatibleRenderTree, sanitizeCompatibleRenderTreeWithDiagnostics } from "./compatible-render-tree"
import { compileMdx } from "./compileMdx"
import { transpileAdapter } from "./esbuild-browser"

const COMPATIBLE_WORKER_PROTOCOL_VERSION = 1 as const
const COMPATIBLE_WORKER_CODE_MAX_BYTES = 1024 * 1024
const COMPATIBLE_WORKER_TIMEOUT_MS = 2_000
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type CompatibleWorkerJob = Readonly<{
  protocolVersion: typeof COMPATIBLE_WORKER_PROTOCOL_VERSION
  artifactId: string
  adapterCode: string | null
  mdxCode: string
  imports: readonly ExtractedImport[]
}>
export type CompatibleWorkerRenderResult = Readonly<{
  tree: CompatibleRenderTree
  fidelityLosses: readonly CompatibleFidelityLossCode[]
}>

export type CompatibleWorkerFailureCode =
  | "COMPATIBLE_WORKER_TIMEOUT"
  | "COMPATIBLE_WORKER_PROTOCOL_FAILED"
  | "COMPATIBLE_EXECUTION_FAILED"
  | "COMPATIBLE_RENDER_FAILED"
  | "COMPATIBLE_INERT_TREE_INVALID"

export class CompatibleWorkerPipelineError extends Error {
  readonly code: CompatibleWorkerFailureCode

  constructor(code: CompatibleWorkerFailureCode) {
    super(code)
    this.name = "CompatibleWorkerPipelineError"
    this.code = code
  }
}

type WorkerLike = Pick<Worker, "postMessage" | "terminate">
type MessagePortLike = Pick<MessagePort, "close" | "postMessage" | "start"> & {
  onmessage: ((event: MessageEvent) => void) | null
}

function utf8LengthWithin(value: string, limit: number): boolean {
  if (value.length > limit) return false
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit <= 0x7f) bytes += 1
    else if (unit <= 0x7ff) bytes += 2
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else bytes += 3
    } else bytes += 3
    if (bytes > limit) return false
  }
  return true
}

async function assertNoDynamicImports(sources: readonly { fileName: string; code: string }[]): Promise<void> {
  const ts = await import("typescript")
  for (const source of sources) {
    const sourceFile = ts.createSourceFile(
      source.fileName,
      source.code,
      ts.ScriptTarget.Latest,
      true,
      source.fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.JS,
    )
    let forbidden = false
    const visit = (node: import("typescript").Node) => {
      if (
        (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
        (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword)
      ) {
        forbidden = true
        return
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    if (forbidden) throw new TypeError(`Dynamic imports are unavailable in compatible preview (${source.fileName})`)
  }
}

/** Compiles bounded source without invoking repository components or adapters. */
export async function prepareCompatibleWorkerJob(artifact: CompatibleSourceArtifact): Promise<CompatibleWorkerJob> {
  const adapterSources = artifact.adapter
    ? Object.entries(artifact.adapter.sources).map(([fileName, code]) => ({ fileName, code }))
    : []
  await assertNoDynamicImports(adapterSources)

  const adapterCode = artifact.adapter ? await transpileAdapter(artifact.adapter) : null
  const compiled = await compileMdx(artifact.documentSource, {}, { deferImportValidation: true })
  if (!compiled.code || compiled.error) throw new Error(compiled.error ?? "Compatible MDX compilation failed")
  await assertNoDynamicImports([{ fileName: "document.mdx.js", code: compiled.code }])
  if (
    !utf8LengthWithin(compiled.code, COMPATIBLE_WORKER_CODE_MAX_BYTES) ||
    (adapterCode !== null && !utf8LengthWithin(adapterCode, COMPATIBLE_WORKER_CODE_MAX_BYTES))
  ) {
    throw new RangeError("Compatible compiled output exceeds its worker budget")
  }
  return Object.freeze({
    protocolVersion: COMPATIBLE_WORKER_PROTOCOL_VERSION,
    artifactId: artifact.artifactId,
    adapterCode,
    mdxCode: compiled.code,
    imports: Object.freeze(compiled.imports ?? []),
  })
}

function createRequestId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

/** This function is stringified. It must remain completely self-contained. */
function compatibleWorkerMain() {
  const root = globalThis as any
  const UnsafeFunction = Function
  const uncurryThis = (fn: any) => Function.prototype.call.bind(fn)
  const arrayPush = uncurryThis(Array.prototype.push)
  const arrayIsArray = Array.isArray
  const numberIsSafeInteger = Number.isSafeInteger
  const objectAssign = Object.assign
  const objectCreate = Object.create
  const objectDefineProperty = Object.defineProperty
  const objectEntries = Object.entries
  const objectFreeze = Object.freeze
  const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
  const objectGetPrototypeOf = Object.getPrototypeOf
  const objectHasOwn = Object.hasOwn
  const objectKeys = Object.keys
  const reflectApply = Reflect.apply
  const regexpTest = uncurryThis(RegExp.prototype.test)
  const setHas = uncurryThis(Set.prototype.has)
  const weakSetAdd = uncurryThis(WeakSet.prototype.add)
  const weakSetHas = uncurryThis(WeakSet.prototype.has)
  const stringToLowerCase = uncurryThis(String.prototype.toLowerCase)
  const addGlobalListener = root.addEventListener.bind(root)
  const removeGlobalListener = root.removeEventListener.bind(root)
  let bootstrapped = false
  const fidelityLosses: string[] = []
  const recordedFidelityLosses = objectCreate(null)

  function appendArray(target: any[], source: readonly any[], limit = source.length) {
    const boundedLength = limit < source.length ? limit : source.length
    for (let index = 0; index < boundedLength; index += 1) arrayPush(target, source[index])
    return target
  }

  function copyArray(source: readonly any[], limit = source.length) {
    return appendArray([], source, limit)
  }

  function recordFidelityLoss(code: string) {
    if (fidelityLosses.length >= 32 || objectHasOwn(recordedFidelityLosses, code)) return
    recordedFidelityLosses[code] = true
    arrayPush(fidelityLosses, code)
  }

  const frozenOwnedValues = new WeakSet<object>()
  function deepFreezeOwned(value: any) {
    if (
      (typeof value !== "object" && typeof value !== "function") ||
      value === null ||
      weakSetHas(frozenOwnedValues, value)
    ) {
      return value
    }
    weakSetAdd(frozenOwnedValues, value)
    const keys = objectKeys(value)
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]
      const descriptor = objectGetOwnPropertyDescriptor(value, key)
      if (descriptor && objectHasOwn(descriptor, "value")) deepFreezeOwned(descriptor.value)
    }
    return objectFreeze(value)
  }

  const blockedNames = [
    "window",
    "document",
    "parent",
    "top",
    "opener",
    "frames",
    "location",
    "self",
    "globalThis",
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "Navigator",
    "navigator",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "caches",
    "Worker",
    "SharedWorker",
    "MessageChannel",
    "MessagePort",
    "BroadcastChannel",
    "postMessage",
    "addEventListener",
    "removeEventListener",
    "dispatchEvent",
    "importScripts",
    "setTimeout",
    "setInterval",
    "requestAnimationFrame",
    "queueMicrotask",
    "crypto",
    "Function",
  ]

  function lockDownRealm() {
    const constructors = [
      UnsafeFunction,
      objectGetPrototypeOf(async () => {}).constructor,
      objectGetPrototypeOf(function* () {}).constructor,
      objectGetPrototypeOf(async function* () {}).constructor,
    ]
    for (let index = 0; index < constructors.length; index += 1) {
      const functionConstructor = constructors[index]
      try {
        objectDefineProperty(functionConstructor.prototype, "constructor", {
          configurable: false,
          enumerable: false,
          writable: false,
          value: undefined,
        })
      } catch {}
    }
    for (let index = 0; index <= blockedNames.length; index += 1) {
      const name = index === blockedNames.length ? "eval" : blockedNames[index]
      try {
        objectDefineProperty(root, name, {
          configurable: false,
          enumerable: false,
          writable: false,
          value: undefined,
        })
      } catch {
        try {
          root[name] = undefined
        } catch {}
      }
    }
  }

  const Fragment = Symbol("RepoPress.Fragment")
  function element(type: any, props: any, childrenOverride?: any[]) {
    const propsValue = props && typeof props === "object" ? objectAssign(objectCreate(null), props) : objectCreate(null)
    if (childrenOverride) propsValue.children = childrenOverride.length === 1 ? childrenOverride[0] : childrenOverride
    return { __repopressElement: 1, type, props: propsValue }
  }
  function createElement(type: any, props: any, ...children: any[]) {
    return element(type, props, children)
  }
  function jsx(type: any, props: any) {
    return element(type, props)
  }
  function forwardRef(render: any) {
    recordFidelityLoss("STATIC_INERT_REF")
    return function RepoPressForwardRef(props: any) {
      return render(props, null)
    }
  }
  function createContext(defaultValue: any) {
    recordFidelityLoss("STATIC_INERT_UNSUPPORTED_HOOK")
    const context: any = { _currentValue: defaultValue }
    context.Provider = ({ value, children }: any) => {
      context._currentValue = value
      return children
    }
    context.Consumer = ({ children }: any) => children(context._currentValue)
    return context
  }
  const React = {
    Fragment,
    Children: {
      count: (children: any) => (arrayIsArray(children) ? children.length : children == null ? 0 : 1),
      map: (children: any, callback: any) => {
        const source = arrayIsArray(children) ? children : children == null ? [] : [children]
        const output: any[] = []
        for (let index = 0; index < source.length; index += 1) {
          arrayPush(output, reflectApply(callback, undefined, [source[index], index]))
        }
        return output
      },
      toArray: (children: any) => (arrayIsArray(children) ? copyArray(children) : children == null ? [] : [children]),
    },
    cloneElement: (value: any, props: any, ...children: any[]) =>
      element(
        value.type,
        objectAssign(objectCreate(null), value.props || {}, props || {}),
        children.length ? children : undefined,
      ),
    createContext,
    createElement,
    forwardRef,
    isValidElement: (value: any) => Boolean(value && value.__repopressElement === 1),
    memo: (component: any) => {
      recordFidelityLoss("STATIC_INERT_UNSUPPORTED_COMPONENT")
      return component
    },
    useCallback: (callback: any) => callback,
    useContext: (context: any) => {
      recordFidelityLoss("STATIC_INERT_UNSUPPORTED_HOOK")
      return context?._currentValue
    },
    useEffect: () => recordFidelityLoss("STATIC_INERT_EFFECT"),
    useId: () => "repopress-static-id",
    useInsertionEffect: () => recordFidelityLoss("STATIC_INERT_INSERTION_EFFECT"),
    useLayoutEffect: () => recordFidelityLoss("STATIC_INERT_LAYOUT_EFFECT"),
    useMemo: (factory: any) => factory(),
    useReducer: (_reducer: any, initial: any, initializer: any) => {
      recordFidelityLoss("STATIC_INERT_REDUCER")
      return [initializer ? initializer(initial) : initial, () => {}]
    },
    useRef: (initial: any) => {
      recordFidelityLoss("STATIC_INERT_REF")
      return { current: initial }
    },
    useState: (initial: any) => {
      recordFidelityLoss("STATIC_INERT_STATE")
      return [typeof initial === "function" ? initial() : initial, () => {}]
    },
  }
  const jsxRuntime = { Fragment, jsx, jsxs: jsx, jsxDEV: jsx }

  function Callout(props: any) {
    return jsx("aside", { className: "repopress-callout", role: "note", children: props.children })
  }
  function DocsImage(props: any) {
    recordFidelityLoss("STATIC_INERT_MEDIA")
    return jsx("figure", {
      className: "repopress-media-placeholder",
      children: jsx("figcaption", { children: props.alt || props.caption || "Image unavailable in static preview" }),
    })
  }
  function DocsVideo(props: any) {
    recordFidelityLoss("STATIC_INERT_MEDIA")
    return jsx("figure", {
      className: "repopress-media-placeholder",
      children: jsx("figcaption", { children: props.title || "Video unavailable in static preview" }),
    })
  }
  const shimModules: any = {
    "@/components/docs/doc-media": { Callout, DocsImage, DocsVideo },
    "@components/docs/doc-media": { Callout, DocsImage, DocsVideo },
    "@/lib/constants/docs": { DOCS_SETUP_MEDIA: {} },
    "@lib/constants/docs": { DOCS_SETUP_MEDIA: {} },
  }
  deepFreezeOwned(React)
  deepFreezeOwned(jsxRuntime)
  deepFreezeOwned(shimModules)

  function evaluateAdapter(code: string | null) {
    if (!code) return {}
    const exports: any = {}
    const module: any = { exports }
    const requireModule = (name: string) => {
      if (name === "react") return React
      if (name === "react/jsx-runtime" || name === "react/jsx-dev-runtime") return jsxRuntime
      if (objectHasOwn(shimModules, name)) return shimModules[name]
      throw new Error(`Module ${name} is unavailable in compatible preview`)
    }
    const parameters = ["exports", "module", "require", "React"]
    appendArray(parameters, blockedNames)
    arrayPush(parameters, code)
    const execute = reflectApply(UnsafeFunction, undefined, parameters)
    const values = [exports, module, requireModule, React]
    for (let index = 0; index < blockedNames.length; index += 1) arrayPush(values, undefined)
    reflectApply(execute, undefined, values)
    const output = module.exports || exports
    return (
      output.adapter ||
      output.default || {
        components: output.components,
        scope: output.scope,
        allowImports: output.allowImports,
      }
    )
  }

  function evaluateDocument(job: any, adapter: any) {
    const components = adapter.components && typeof adapter.components === "object" ? adapter.components : {}
    const scope =
      adapter.scope && typeof adapter.scope === "object"
        ? objectAssign(objectCreate(null), adapter.scope)
        : objectCreate(null)
    const allowed = adapter.allowImports && typeof adapter.allowImports === "object" ? adapter.allowImports : {}
    if (!arrayIsArray(job.imports) || job.imports.length > 128) throw new Error("Too many compatible imports")
    for (let index = 0; index < job.imports.length; index += 1) {
      const imported = job.imports[index]
      if (
        !imported ||
        typeof imported.source !== "string" ||
        typeof imported.imported !== "string" ||
        typeof imported.local !== "string" ||
        !regexpTest(/^[A-Za-z_$][A-Za-z0-9_$]*$/, imported.local)
      ) {
        throw new Error("Invalid compatible import binding")
      }
      const moduleValue = allowed[imported.source]
      if (!moduleValue || !objectHasOwn(moduleValue, imported.imported)) {
        throw new Error(`Import ${imported.imported} from ${imported.source} is unavailable`)
      }
      scope[imported.local] = moduleValue[imported.imported]
    }
    const componentEntries = objectEntries(components)
    for (let index = 0; index < componentEntries.length; index += 1) {
      const pair = componentEntries[index]
      scope[pair[0]] = pair[1]
    }
    const scopeEntries = objectEntries(scope)
    const pairs: any[] = []
    for (let index = 0; index < scopeEntries.length && pairs.length < 256; index += 1) {
      const pair = scopeEntries[index]
      if (typeof pair[0] === "string" && regexpTest(/^[A-Za-z_$][A-Za-z0-9_$]*$/, pair[0])) {
        arrayPush(pairs, pair)
      }
    }
    const missing = (name: string, component: boolean) => {
      recordFidelityLoss("STATIC_INERT_MISSING_REFERENCE")
      return component
        ? (props: any) => jsx("code", { children: [`<${name} />`, props?.children] })
        : `[Missing ${name}]`
    }
    arrayPush(pairs, ["_missingMdxReference", missing])
    for (let nameIndex = 0; nameIndex < blockedNames.length; nameIndex += 1) {
      const name = blockedNames[nameIndex]
      let present = false
      for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
        if (pairs[pairIndex][0] === name) {
          present = true
          break
        }
      }
      if (!present) arrayPush(pairs, [name, undefined])
    }
    const mdxConfig = objectAssign(objectCreate(null), jsxRuntime, {
      useMDXComponents: (value: any) => value || {},
      _missingMdxReference: missing,
    })
    const parameters = ["_mdxConfig"]
    const values = [mdxConfig]
    for (let index = 0; index < pairs.length; index += 1) {
      arrayPush(parameters, pairs[index][0])
      arrayPush(values, pairs[index][1])
    }
    arrayPush(parameters, job.mdxCode)
    const execute = reflectApply(UnsafeFunction, undefined, parameters)
    const moduleValue = reflectApply(execute, undefined, values)
    if (!moduleValue || typeof moduleValue.default !== "function") throw new Error("Compatible MDX has no component")
    return moduleValue.default({ components })
  }

  const allowedTags = new Set([
    "article",
    "aside",
    "blockquote",
    "br",
    "code",
    "dd",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "kbd",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
  ])
  const dropTags = new Set([
    "audio",
    "base",
    "canvas",
    "embed",
    "iframe",
    "img",
    "link",
    "math",
    "meta",
    "noscript",
    "object",
    "script",
    "source",
    "style",
    "svg",
    "template",
    "track",
    "video",
  ])
  const mediaTags = new Set(["audio", "canvas", "img", "source", "track", "video"])
  const frameTags = new Set(["embed", "iframe", "object"])
  const formTags = new Set([
    "button",
    "datalist",
    "fieldset",
    "form",
    "input",
    "label",
    "legend",
    "option",
    "select",
    "textarea",
  ])
  const navigationTags = new Set(["a", "nav"])
  const networkTags = new Set(["base", "link", "meta"])
  const activeContentTags = new Set(["math", "noscript", "script", "style", "svg", "template"])
  const stringPropKeys = ["aria-description", "aria-label", "aria-live", "className", "role", "scope", "title"]
  const integerPropKeys = ["colSpan", "rowSpan", "start"]
  const safePropNames = new Set([
    "aria-description",
    "aria-label",
    "aria-live",
    "className",
    "role",
    "scope",
    "title",
    "aria-hidden",
    "colSpan",
    "rowSpan",
    "start",
  ])
  function safeProps(props: any) {
    const output: any = objectCreate(null)
    if (!props || typeof props !== "object") return output
    for (let index = 0; index < stringPropKeys.length; index += 1) {
      const key = stringPropKeys[index]
      if (typeof props[key] === "string" && props[key].length <= 1_024) output[key] = props[key]
    }
    if (typeof props["aria-hidden"] === "boolean") output["aria-hidden"] = props["aria-hidden"]
    for (let index = 0; index < integerPropKeys.length; index += 1) {
      const key = integerPropKeys[index]
      if (numberIsSafeInteger(props[key]) && props[key] >= 1 && props[key] <= 1_000) output[key] = props[key]
    }
    let inspected = 0
    const keys = objectKeys(props)
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]
      inspected += 1
      if (inspected > 64) {
        recordFidelityLoss("STATIC_INERT_PROP")
        break
      }
      if (key === "children" || key === "key") continue
      if (regexpTest(/^on[A-Z]/, key)) recordFidelityLoss("STATIC_INERT_EVENT")
      else if (key === "ref") recordFidelityLoss("STATIC_INERT_REF")
      else if (key === "style" || key === "dangerouslySetInnerHTML") recordFidelityLoss("STATIC_INERT_STYLE")
      else if (!setHas(safePropNames, key)) {
        recordFidelityLoss("STATIC_INERT_PROP")
      }
    }
    return output
  }

  function recordTagLoss(tag: string) {
    if (setHas(mediaTags, tag)) recordFidelityLoss("STATIC_INERT_MEDIA")
    if (setHas(frameTags, tag)) recordFidelityLoss("STATIC_INERT_FRAME")
    if (setHas(formTags, tag)) recordFidelityLoss("STATIC_INERT_FORM")
    if (tag === "a") recordFidelityLoss("STATIC_INERT_LINK")
    if (tag === "nav") recordFidelityLoss("STATIC_INERT_NAVIGATION")
    if (setHas(networkTags, tag)) recordFidelityLoss("STATIC_INERT_NETWORK_ELEMENT")
    if (setHas(activeContentTags, tag)) recordFidelityLoss("STATIC_INERT_ACTIVE_CONTENT")
  }

  function renderTree(value: any) {
    const budget = { nodes: 0, text: 0 }
    const visit = (node: any, depth: number): any[] => {
      if (depth > 32) throw new Error("Compatible render depth exceeded")
      if (node === null || node === undefined || typeof node === "boolean") return []
      if (arrayIsArray(node)) {
        if (node.length > 128) throw new Error("Compatible child count exceeded")
        const children: any[] = []
        for (let index = 0; index < node.length; index += 1) {
          appendArray(children, visit(node[index], depth + 1))
        }
        return children
      }
      if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") {
        const text = String(node)
        budget.nodes += 1
        budget.text += text.length
        if (budget.nodes > 2_048 || budget.text > 192 * 1_024) throw new Error("Compatible render budget exceeded")
        return [{ kind: "text", value: text }]
      }
      if (!node || node.__repopressElement !== 1) throw new Error("Unsupported compatible render value")
      budget.nodes += 1
      if (budget.nodes > 2_048) throw new Error("Compatible render node budget exceeded")
      const props = node.props && typeof node.props === "object" ? node.props : {}
      if (node.type === Fragment) return visit(props.children, depth + 1)
      if (typeof node.type === "function") {
        let output: any
        if (node.type.prototype && typeof node.type.prototype.render === "function") {
          recordFidelityLoss("STATIC_INERT_UNSUPPORTED_COMPONENT")
          const instance = new node.type(props)
          output = instance.render()
        } else output = node.type(props)
        return visit(output, depth + 1)
      }
      if (typeof node.type !== "string") throw new Error("Unsupported compatible component type")
      const tag = stringToLowerCase(node.type)
      recordTagLoss(tag)
      const sanitizedProps = safeProps(props)
      if (setHas(dropTags, tag)) return []
      const children = visit(props.children, depth + 1)
      if (!setHas(allowedTags, tag)) {
        if (!setHas(formTags, tag) && !setHas(navigationTags, tag)) {
          recordFidelityLoss("STATIC_INERT_UNSUPPORTED_ELEMENT")
        }
        return children
      }
      return [{ kind: "element", tag, props: sanitizedProps, children }]
    }
    return visit(value, 1)
  }

  async function onBootstrap(event: any) {
    if (bootstrapped) return
    const port = event?.ports?.[0]
    if (!port) return
    bootstrapped = true
    removeGlobalListener("message", onBootstrap)
    const send = port.postMessage.bind(port)
    let handled = false
    port.onmessage = (messageEvent: any) => {
      if (handled) return
      handled = true
      const request = messageEvent.data
      if (
        !request ||
        request.type !== "repopress:render-compatible" ||
        typeof request.requestId !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(request.requestId) ||
        !request.job ||
        request.job.protocolVersion !== 1
      ) {
        port.close()
        return
      }
      const requestId = request.requestId
      const job = request.job
      lockDownRealm()
      try {
        const adapter = evaluateAdapter(job.adapterCode)
        const rendered = evaluateDocument(job, adapter)
        try {
          const tree = renderTree(rendered)
          send({
            type: "repopress:rendered-compatible",
            requestId,
            tree,
            fidelityLosses: copyArray(fidelityLosses, 32),
          })
        } catch {
          send({ type: "repopress:compatible-error", requestId, code: "COMPATIBLE_RENDER_FAILED" })
        }
      } catch {
        send({ type: "repopress:compatible-error", requestId, code: "COMPATIBLE_EXECUTION_FAILED" })
      } finally {
        port.close()
      }
    }
    port.start()
  }
  addGlobalListener("message", onBootstrap)
}

export function createCompatibleWorkerSource(): string {
  return `;(${compatibleWorkerMain.toString()})();`
}

function defaultCreateWorker(source: string): WorkerLike {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }))
  try {
    return new Worker(url, { name: "repopress-compatible-renderer" })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function createCompatibleWorkerRenderer(
  options: {
    createWorker?: (source: string) => WorkerLike
    createMessageChannel?: () => { port1: MessagePortLike; port2: Transferable }
    createRequestId?: () => string
    timeoutMs?: number
  } = {},
) {
  let activeWorker: WorkerLike | null = null
  let activePort: MessagePortLike | null = null
  let disposed = false

  const dispose = () => {
    activePort?.close()
    activePort = null
    activeWorker?.terminate()
    activeWorker = null
    disposed = true
  }

  return Object.freeze({
    async render(job: CompatibleWorkerJob): Promise<CompatibleWorkerRenderResult> {
      if (disposed || activeWorker || activePort) throw new Error("Compatible worker renderer is unavailable")
      const requestId = (options.createRequestId ?? createRequestId)()
      if (!REQUEST_ID_PATTERN.test(requestId)) throw new Error("Invalid compatible worker request ID")
      const worker = (options.createWorker ?? defaultCreateWorker)(createCompatibleWorkerSource())
      const channel = (options.createMessageChannel ?? (() => new MessageChannel()))()
      activeWorker = worker
      activePort = channel.port1

      return await new Promise<CompatibleWorkerRenderResult>((resolve, reject) => {
        let settled = false
        const finish = (callback: () => void) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          activePort?.close()
          activePort = null
          activeWorker?.terminate()
          activeWorker = null
          disposed = true
          callback()
        }
        const timeout = setTimeout(
          () => finish(() => reject(new CompatibleWorkerPipelineError("COMPATIBLE_WORKER_TIMEOUT"))),
          options.timeoutMs ?? COMPATIBLE_WORKER_TIMEOUT_MS,
        )
        channel.port1.onmessage = (event) => {
          const response = event.data as unknown
          if (
            typeof response !== "object" ||
            response === null ||
            Array.isArray(response) ||
            (response as Record<string, unknown>).requestId !== requestId
          ) {
            return
          }
          if ((response as Record<string, unknown>).type === "repopress:compatible-error") {
            const code = (response as Record<string, unknown>).code
            if (code !== "COMPATIBLE_EXECUTION_FAILED" && code !== "COMPATIBLE_RENDER_FAILED") {
              finish(() => reject(new CompatibleWorkerPipelineError("COMPATIBLE_WORKER_PROTOCOL_FAILED")))
              return
            }
            finish(() => reject(new CompatibleWorkerPipelineError(code)))
            return
          }
          if ((response as Record<string, unknown>).type !== "repopress:rendered-compatible") return
          const workerLosses = parseCompatibleFidelityLosses((response as Record<string, unknown>).fidelityLosses)
          const sanitized = sanitizeCompatibleRenderTreeWithDiagnostics((response as Record<string, unknown>).tree)
          if (!workerLosses || !sanitized) {
            finish(() => reject(new CompatibleWorkerPipelineError("COMPATIBLE_INERT_TREE_INVALID")))
            return
          }
          finish(() =>
            resolve({
              tree: sanitized.tree,
              fidelityLosses: mergeCompatibleFidelityLosses(workerLosses, sanitized.fidelityLosses),
            }),
          )
        }
        channel.port1.start()
        worker.postMessage({ type: "repopress:compatible-worker-bootstrap" }, [channel.port2])
        channel.port1.postMessage({ type: "repopress:render-compatible", requestId, job })
      })
    },
    dispose,
  })
}
