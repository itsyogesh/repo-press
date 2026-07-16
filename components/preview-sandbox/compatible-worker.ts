import type { ExtractedImport } from "@/components/mdx-runtime/transformImports"
import type { CompatibleSourceArtifact } from "@/lib/preview/compatible-artifact"
import { type CompatibleRenderTree, sanitizeCompatibleRenderTree } from "./compatible-render-tree"
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
  const addGlobalListener = root.addEventListener.bind(root)
  const removeGlobalListener = root.removeEventListener.bind(root)
  let bootstrapped = false

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
      Object.getPrototypeOf(async () => {}).constructor,
      Object.getPrototypeOf(function* () {}).constructor,
      Object.getPrototypeOf(async function* () {}).constructor,
    ]
    for (const functionConstructor of constructors) {
      try {
        Object.defineProperty(functionConstructor.prototype, "constructor", {
          configurable: false,
          enumerable: false,
          writable: false,
          value: undefined,
        })
      } catch {}
    }
    for (const name of [...blockedNames, "eval"]) {
      try {
        Object.defineProperty(root, name, {
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
    const propsValue = props && typeof props === "object" ? { ...props } : {}
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
    return function RepoPressForwardRef(props: any) {
      return render(props, null)
    }
  }
  function createContext(defaultValue: any) {
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
      count: (children: any) => (Array.isArray(children) ? children.length : children == null ? 0 : 1),
      map: (children: any, callback: any) =>
        (Array.isArray(children) ? children : children == null ? [] : [children]).map(callback),
      toArray: (children: any) => (Array.isArray(children) ? children : children == null ? [] : [children]),
    },
    cloneElement: (value: any, props: any, ...children: any[]) =>
      element(value.type, { ...(value.props || {}), ...(props || {}) }, children.length ? children : undefined),
    createContext,
    createElement,
    forwardRef,
    isValidElement: (value: any) => Boolean(value && value.__repopressElement === 1),
    memo: (component: any) => component,
    useCallback: (callback: any) => callback,
    useContext: (context: any) => context?._currentValue,
    useEffect: () => undefined,
    useId: () => "repopress-static-id",
    useInsertionEffect: () => undefined,
    useLayoutEffect: () => undefined,
    useMemo: (factory: any) => factory(),
    useReducer: (_reducer: any, initial: any, initializer: any) => [
      initializer ? initializer(initial) : initial,
      () => {},
    ],
    useRef: (initial: any) => ({ current: initial }),
    useState: (initial: any) => [typeof initial === "function" ? initial() : initial, () => {}],
  }
  const jsxRuntime = { Fragment, jsx, jsxs: jsx, jsxDEV: jsx }

  function Callout(props: any) {
    return jsx("aside", { className: "repopress-callout", role: "note", children: props.children })
  }
  function DocsImage(props: any) {
    return jsx("figure", {
      className: "repopress-media-placeholder",
      children: jsx("figcaption", { children: props.alt || props.caption || "Image unavailable in static preview" }),
    })
  }
  function DocsVideo(props: any) {
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

  function evaluateAdapter(code: string | null) {
    if (!code) return {}
    const exports: any = {}
    const module: any = { exports }
    const requireModule = (name: string) => {
      if (name === "react") return React
      if (name === "react/jsx-runtime" || name === "react/jsx-dev-runtime") return jsxRuntime
      if (Object.hasOwn(shimModules, name)) return shimModules[name]
      throw new Error(`Module ${name} is unavailable in compatible preview`)
    }
    const values = blockedNames.map(() => undefined)
    const execute = UnsafeFunction("exports", "module", "require", "React", ...blockedNames, code)
    execute(exports, module, requireModule, React, ...values)
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
    const scope = adapter.scope && typeof adapter.scope === "object" ? { ...adapter.scope } : {}
    const allowed = adapter.allowImports && typeof adapter.allowImports === "object" ? adapter.allowImports : {}
    if (!Array.isArray(job.imports) || job.imports.length > 128) throw new Error("Too many compatible imports")
    for (const imported of job.imports) {
      if (
        !imported ||
        typeof imported.source !== "string" ||
        typeof imported.imported !== "string" ||
        typeof imported.local !== "string" ||
        !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(imported.local)
      ) {
        throw new Error("Invalid compatible import binding")
      }
      const moduleValue = allowed[imported.source]
      if (!moduleValue || !Object.hasOwn(moduleValue, imported.imported)) {
        throw new Error(`Import ${imported.imported} from ${imported.source} is unavailable`)
      }
      scope[imported.local] = moduleValue[imported.imported]
    }
    for (const [name, value] of Object.entries(components)) scope[name] = value
    const pairs = Object.entries(scope)
      .filter(([name]) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name))
      .slice(0, 256)
    const missing = (name: string, component: boolean) =>
      component ? (props: any) => jsx("code", { children: [`<${name} />`, props?.children] }) : `[Missing ${name}]`
    pairs.push(["_missingMdxReference", missing])
    for (const name of blockedNames) {
      if (!pairs.some(([key]) => key === name)) pairs.push([name, undefined])
    }
    const mdxConfig = { ...jsxRuntime, useMDXComponents: (value: any) => value || {}, _missingMdxReference: missing }
    const execute = UnsafeFunction("_mdxConfig", ...pairs.map(([name]) => name), job.mdxCode)
    const moduleValue = execute(mdxConfig, ...pairs.map(([, value]) => value))
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
  function safeProps(props: any) {
    const output: any = {}
    if (!props || typeof props !== "object") return output
    const stringKeys = ["aria-description", "aria-label", "aria-live", "className", "role", "scope", "title"]
    for (const key of stringKeys) {
      if (typeof props[key] === "string" && props[key].length <= 1_024) output[key] = props[key]
    }
    if (typeof props["aria-hidden"] === "boolean") output["aria-hidden"] = props["aria-hidden"]
    for (const key of ["colSpan", "rowSpan", "start"]) {
      if (Number.isSafeInteger(props[key]) && props[key] >= 1 && props[key] <= 1_000) output[key] = props[key]
    }
    return output
  }

  function renderTree(value: any) {
    const budget = { nodes: 0, text: 0 }
    const visit = (node: any, depth: number): any[] => {
      if (depth > 32) throw new Error("Compatible render depth exceeded")
      if (node === null || node === undefined || typeof node === "boolean") return []
      if (Array.isArray(node)) {
        if (node.length > 128) throw new Error("Compatible child count exceeded")
        return node.flatMap((child) => visit(child, depth + 1))
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
          const instance = new node.type(props)
          output = instance.render()
        } else output = node.type(props)
        return visit(output, depth + 1)
      }
      if (typeof node.type !== "string") throw new Error("Unsupported compatible component type")
      const tag = node.type.toLowerCase()
      if (dropTags.has(tag)) return []
      const children = visit(props.children, depth + 1)
      if (!allowedTags.has(tag)) return children
      return [{ kind: "element", tag, props: safeProps(props), children }]
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
        const tree = renderTree(rendered)
        send({ type: "repopress:rendered-compatible", requestId, tree })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Compatible worker failed"
        send({ type: "repopress:compatible-error", requestId, message: message.slice(0, 1_024) })
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
    async render(job: CompatibleWorkerJob): Promise<CompatibleRenderTree> {
      if (disposed || activeWorker || activePort) throw new Error("Compatible worker renderer is unavailable")
      const requestId = (options.createRequestId ?? createRequestId)()
      if (!REQUEST_ID_PATTERN.test(requestId)) throw new Error("Invalid compatible worker request ID")
      const worker = (options.createWorker ?? defaultCreateWorker)(createCompatibleWorkerSource())
      const channel = (options.createMessageChannel ?? (() => new MessageChannel()))()
      activeWorker = worker
      activePort = channel.port1

      return await new Promise<CompatibleRenderTree>((resolve, reject) => {
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
          () => finish(() => reject(new Error("Compatible worker timed out"))),
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
            const message = (response as Record<string, unknown>).message
            finish(() => reject(new Error(typeof message === "string" ? message.slice(0, 1_024) : "Worker failed")))
            return
          }
          if ((response as Record<string, unknown>).type !== "repopress:rendered-compatible") return
          const tree = sanitizeCompatibleRenderTree((response as Record<string, unknown>).tree)
          if (!tree) {
            finish(() => reject(new Error("Compatible worker returned an invalid render tree")))
            return
          }
          finish(() => resolve(tree))
        }
        channel.port1.start()
        worker.postMessage({ type: "repopress:compatible-worker-bootstrap" }, [channel.port2])
        channel.port1.postMessage({ type: "repopress:render-compatible", requestId, job })
      })
    },
    dispose,
  })
}
