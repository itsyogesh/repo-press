type TypeScriptModule = typeof import("typescript")

const WORKDIR_PREFIX =
  typeof process !== "undefined" && typeof process.cwd === "function" ? `${process.cwd().replace(/\\/g, "/")}/` : ""

function normalizeRepoPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/")
  if (WORKDIR_PREFIX && normalized.startsWith(WORKDIR_PREFIX)) return normalized.slice(WORKDIR_PREFIX.length)
  return normalized.replace(/^\/+/, "")
}

function dirname(filePath: string) {
  const normalized = normalizeRepoPath(filePath)
  const lastSlash = normalized.lastIndexOf("/")
  return lastSlash < 0 ? "." : normalized.slice(0, lastSlash) || "."
}

function normalizeJoin(baseDir: string, specifier: string) {
  const segments = `${normalizeRepoPath(baseDir)}/${specifier}`.split("/")
  const output: string[] = []
  for (const segment of segments) {
    if (!segment || segment === ".") continue
    if (segment === "..") output.pop()
    else output.push(segment)
  }
  return output.join("/")
}

function resolveRelative(importer: string, specifier: string, sources: Record<string, string>): string | null {
  const base = normalizeJoin(dirname(importer), specifier)
  const candidates = /\.[a-z0-9]+$/i.test(base)
    ? [base]
    : [
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.jsx`,
        `${base}.mjs`,
        `${base}.cjs`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
        `${base}/index.js`,
        `${base}/index.jsx`,
        `${base}/index.mjs`,
        `${base}/index.cjs`,
      ]
  return candidates.find((candidate) => sources[candidate] !== undefined) ?? null
}

function transpileSource(ts: TypeScriptModule, fileName: string, source: string): string {
  const result = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  })
  const errors = result.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? []
  if (errors.length > 0) {
    throw new Error(
      errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"),
    )
  }
  return result.outputText
}

/**
 * Browser-only, no-network transpilation for an already bounded source graph.
 * TypeScript emits CommonJS and RepoPress wraps each source in a static module
 * function; no WASM fetch, worker, package resolution, or host execution occurs.
 */
export async function transpileAdapter({
  entryPath,
  sources,
}: {
  entryPath: string
  sources: Record<string, string>
}): Promise<string> {
  const ts = await import("typescript")
  const normalizedSources = Object.fromEntries(
    Object.entries(sources).map(([filePath, source]) => [normalizeRepoPath(filePath), source]),
  )
  const normalizedEntryPath = normalizeRepoPath(entryPath)
  if (normalizedSources[normalizedEntryPath] === undefined) {
    throw new Error(`Adapter entry source missing for ${normalizedEntryPath}`)
  }

  const modules = Object.entries(normalizedSources)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fileName, source]) => {
      const output = transpileSource(ts, fileName, source)
      return `${JSON.stringify(fileName)}: function(exports, module, require) {\n${output}\n}`
    })
    .join(",\n")

  const resolutions: Record<string, Record<string, string>> = {}
  for (const [fileName, source] of Object.entries(normalizedSources)) {
    const imports = source.matchAll(/(?:from\s*|require\(\s*|import\(\s*)["'](\.{1,2}\/[^"']+)["']/g)
    for (const match of imports) {
      const resolved = resolveRelative(fileName, match[1], normalizedSources)
      if (!resolved) throw new Error(`Unable to resolve ${match[1]} from ${fileName}`)
      if (!resolutions[fileName]) resolutions[fileName] = {}
      resolutions[fileName][match[1]] = resolved
    }
  }

  return `
const __repopressModules = {${modules}};
const __repopressResolutions = ${JSON.stringify(resolutions)};
const __repopressCache = Object.create(null);
const __repopressExternalRequire = require;
function __repopressLoad(id) {
  if (__repopressCache[id]) return __repopressCache[id].exports;
  const factory = __repopressModules[id];
  if (!factory) throw new Error("Unknown compatible module: " + id);
  const loaded = { exports: {} };
  __repopressCache[id] = loaded;
  factory(loaded.exports, loaded, function(specifier) {
    const local = __repopressResolutions[id] && __repopressResolutions[id][specifier];
    return local ? __repopressLoad(local) : __repopressExternalRequire(specifier);
  });
  return loaded.exports;
}
module.exports = __repopressLoad(${JSON.stringify(normalizedEntryPath)});
`
}
