import * as esbuild from "esbuild-wasm"

let esbuildInitialized = false
let esbuildInitPromise: Promise<void> | null = null
const WORKDIR_PREFIX =
  typeof process !== "undefined" && typeof process.cwd === "function" ? `${process.cwd().replace(/\\/g, "/")}/` : ""

export async function initEsbuild() {
  if (esbuildInitialized) return
  // Concurrent callers share a single in-flight initialization. esbuild-wasm
  // throws if initialize() runs twice, so guarding on a boolean alone races.
  if (esbuildInitPromise) return esbuildInitPromise

  esbuildInitPromise = (async () => {
    try {
      if (typeof window === "undefined") {
        esbuildInitialized = true
        return
      }
      await esbuild.initialize({
        worker: false, // In browser, we might use worker. For simple tasks, worker: false is easier to setup without external URLs
        wasmURL: "/esbuild.wasm",
      })
      esbuildInitialized = true
    } catch (e: any) {
      if (typeof e?.message === "string" && e.message.includes('Cannot call "initialize" more than once')) {
        esbuildInitialized = true
        return
      }
      esbuildInitPromise = null // allow a genuine failure to be retried
      console.error("Failed to initialize esbuild", e)
      throw e
    }
  })()

  return esbuildInitPromise
}

function loaderForFile(filePath: string): esbuild.Loader {
  const dotIndex = filePath.lastIndexOf(".")
  const ext = dotIndex >= 0 ? filePath.slice(dotIndex).toLowerCase() : ""
  switch (ext) {
    case ".ts":
      return "ts"
    case ".tsx":
      return "tsx"
    case ".jsx":
      return "jsx"
    default:
      return "js"
  }
}

function dirname(filePath: string) {
  const normalized = normalizeRepoPath(filePath)
  const lastSlash = normalized.lastIndexOf("/")
  if (lastSlash <= 0) return "."
  return normalized.slice(0, lastSlash)
}

function normalizeRepoPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/")
  if (WORKDIR_PREFIX && normalized.startsWith(WORKDIR_PREFIX)) {
    return normalized.slice(WORKDIR_PREFIX.length)
  }
  return normalized.replace(/^\/+/, "")
}

function normalizeJoin(baseDir: string, specifier: string) {
  const input = `${normalizeRepoPath(baseDir)}/${specifier}`.replace(/\\/g, "/")
  const segments = input.split("/")
  const output: string[] = []

  for (const segment of segments) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      output.pop()
      continue
    }
    output.push(segment)
  }

  return output.join("/")
}

function normalizeAliasJoin(rootDir: string, specifier: string) {
  const aliasPath = specifier.replace(/^[@~]\//, "")
  return normalizeJoin(rootDir || ".", aliasPath)
}

function moduleCandidates(resolvedBase: string) {
  return /\.[a-z0-9]+$/i.test(resolvedBase)
    ? [resolvedBase]
    : [
        `${resolvedBase}.ts`,
        `${resolvedBase}.tsx`,
        `${resolvedBase}.js`,
        `${resolvedBase}.jsx`,
        `${resolvedBase}.mjs`,
        `${resolvedBase}.cjs`,
        `${resolvedBase}/index.ts`,
        `${resolvedBase}/index.tsx`,
        `${resolvedBase}/index.js`,
        `${resolvedBase}/index.jsx`,
        `${resolvedBase}/index.mjs`,
        `${resolvedBase}/index.cjs`,
      ]
}

export async function transpileAdapter({
  entryPath,
  sources,
  runtimeRoot,
}: {
  entryPath: string
  sources: Record<string, string>
  runtimeRoot?: string | null
}): Promise<string> {
  await initEsbuild()

  const normalizedSources = Object.fromEntries(
    Object.entries(sources).map(([filePath, source]) => [normalizeRepoPath(filePath), source]),
  )
  const normalizedEntryPath = normalizeRepoPath(entryPath)
  const normalizedRuntimeRoot = normalizeRepoPath(
    runtimeRoot === undefined ? dirname(normalizedEntryPath) : runtimeRoot || "",
  )
  const entrySource = normalizedSources[normalizedEntryPath]
  if (!entrySource) {
    throw new Error(`Adapter entry source missing for ${normalizedEntryPath}`)
  }

  const result = await esbuild.build({
    bundle: true,
    write: false,
    target: "es2020",
    format: "cjs",
    platform: "browser",
    stdin: {
      contents: entrySource,
      sourcefile: normalizedEntryPath,
      resolveDir: dirname(normalizedEntryPath),
      loader: loaderForFile(normalizedEntryPath),
    },
    plugins: [
      {
        name: "repo-local-modules",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (
              args.path.startsWith("./") ||
              args.path.startsWith("../") ||
              args.path.startsWith("@/") ||
              args.path.startsWith("~/")
            ) {
              const isAliasImport = args.path.startsWith("@/") || args.path.startsWith("~/")
              const resolvedBase = isAliasImport
                ? normalizeAliasJoin(normalizedRuntimeRoot, args.path)
                : normalizeJoin(args.resolveDir || dirname(args.importer || normalizedEntryPath), args.path)
              const candidates = moduleCandidates(resolvedBase)

              for (const candidate of candidates) {
                if (normalizedSources[candidate] !== undefined) {
                  return { path: candidate, namespace: "repo-local" }
                }
              }

              if (isAliasImport) {
                return { path: args.path, external: true }
              }

              return {
                errors: [{ text: `Unable to resolve ${args.path} from ${args.importer || normalizedEntryPath}` }],
              }
            }

            return { path: args.path, external: true }
          })

          build.onLoad({ filter: /.*/, namespace: "repo-local" }, (args) => ({
            contents: normalizedSources[args.path],
            loader: loaderForFile(args.path),
            resolveDir: dirname(args.path),
          }))
        },
      },
    ],
  })

  return result.outputFiles[0]?.text || ""
}
