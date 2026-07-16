import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const PRODUCTION_DIRECTORIES = ["app", "components", "lib", "hooks", "convex"] as const
const PRODUCTION_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"])
const EXCLUDED_DIRECTORIES = new Set([
  ".next",
  "__tests__",
  "_generated",
  "build",
  "config",
  "configs",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "out",
  "test",
  "tests",
])
const SANDBOX_ALLOWLIST = path.join("components", "preview-sandbox")

const forbiddenExecutionIdentifiers = new Set([
  "Function",
  "eval",
  "evaluateMdx",
  "evaluateAdapter",
  "transpileAdapter",
  "RepoPressPreviewAdapter",
  "RenderBindings",
  "createRenderBindings",
  "componentsByContext",
])
const forbiddenExecutionModule = /(?:evaluateMdx|evaluate-adapter|esbuild-browser|execution-guard)(?:\.[cm]?[jt]sx?)?$/

type ExecutionTarget = "eval" | "function" | "global" | "import" | "require"

interface ResolvedValue {
  stringValue?: string
  target?: ExecutionTarget
}

function isExcludedProductionFile(fileName: string): boolean {
  return (
    fileName.endsWith(".d.ts") ||
    /(?:^|[.-])(?:test|spec)\.[^.]+$/.test(fileName) ||
    /(?:^|[.-])config\.[^.]+$/.test(fileName) ||
    /(?:^|[.-])setup\.[^.]+$/.test(fileName) ||
    /(?:^|[.-])generated\.[^.]+$/.test(fileName)
  )
}

function isProductionSourceFile(fileName: string): boolean {
  return PRODUCTION_EXTENSIONS.has(path.extname(fileName)) && !isExcludedProductionFile(fileName)
}

function listDirectorySources(root: string, directory: string): string[] {
  const absoluteDirectory = path.join(root, directory)
  if (!fs.existsSync(absoluteDirectory)) return []

  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name) || relativePath === SANDBOX_ALLOWLIST) return []
      return listDirectorySources(root, relativePath)
    }
    return entry.isFile() && isProductionSourceFile(entry.name) ? [relativePath] : []
  })
}

export function listHostProductionFiles(root = process.cwd()): string[] {
  const nestedSources = PRODUCTION_DIRECTORIES.flatMap((directory) => listDirectorySources(root, directory))
  const rootSources = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isProductionSourceFile(entry.name))
    .map((entry) => entry.name)
  return [...nestedSources, ...rootSources]
}

function scriptKindFor(relativePath: string): ts.ScriptKind {
  if (relativePath.endsWith(".tsx")) return ts.ScriptKind.TSX
  if (relativePath.endsWith(".jsx")) return ts.ScriptKind.JSX
  if (/\.[cm]?js$/.test(relativePath)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function sameValue(left: ResolvedValue | undefined, right: ResolvedValue | undefined): boolean {
  return left?.stringValue === right?.stringValue && left?.target === right?.target
}

export function findHostExecutionViolationsInSource(relativePath: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(relativePath),
  )
  const aliases = new Map<string, ResolvedValue>()

  const resolve = (input: ts.Expression, resolving = new Set<string>()): ResolvedValue | undefined => {
    const expression = unwrapExpression(input)
    if (ts.isStringLiteralLike(expression)) return { stringValue: expression.text }
    if (ts.isIdentifier(expression)) {
      const aliased = aliases.get(expression.text)
      if (aliased && !resolving.has(expression.text)) return aliased
      if (expression.text === "globalThis") return { target: "global" }
      if (expression.text === "Function") return { target: "function" }
      if (expression.text === "eval") return { target: "eval" }
      if (expression.text === "require") return { target: "require" }
      return undefined
    }
    if (expression.kind === ts.SyntaxKind.ImportKeyword) return { target: "import" }
    if (ts.isBinaryExpression(expression)) {
      if (expression.operatorToken.kind === ts.SyntaxKind.CommaToken) return resolve(expression.right, resolving)
      if (expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = resolve(expression.left, resolving)?.stringValue
        const right = resolve(expression.right, resolving)?.stringValue
        if (left !== undefined && right !== undefined) return { stringValue: left + right }
      }
      return undefined
    }
    if (ts.isTemplateExpression(expression)) {
      let value = expression.head.text
      for (const span of expression.templateSpans) {
        const resolvedSpan = resolve(span.expression, resolving)?.stringValue
        if (resolvedSpan === undefined) return undefined
        value += resolvedSpan + span.literal.text
      }
      return { stringValue: value }
    }
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      const propertyName = ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : expression.argumentExpression
          ? resolve(expression.argumentExpression, resolving)?.stringValue
          : undefined
      const base = resolve(expression.expression, resolving)
      if (propertyName === "constructor" || propertyName === "Function") return { target: "function" }
      if (propertyName === "eval") return { target: "eval" }
      if (base?.target === "global" && propertyName === "require") return { target: "require" }
      return undefined
    }
    return undefined
  }

  const resolveLoaderWrapper = (input: ts.Expression): ResolvedValue | undefined => {
    const expression = unwrapExpression(input)
    if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) return undefined
    if (expression.parameters.length !== 1 || !ts.isIdentifier(expression.parameters[0].name)) return undefined
    const parameterName = expression.parameters[0].name.text
    const bodyExpression = ts.isBlock(expression.body)
      ? expression.body.statements.length === 1 && ts.isReturnStatement(expression.body.statements[0])
        ? expression.body.statements[0].expression
        : undefined
      : expression.body
    if (!bodyExpression || !ts.isCallExpression(unwrapExpression(bodyExpression))) return undefined
    const call = unwrapExpression(bodyExpression) as ts.CallExpression
    if (call.arguments.length !== 1 || !ts.isIdentifier(unwrapExpression(call.arguments[0]))) return undefined
    if ((unwrapExpression(call.arguments[0]) as ts.Identifier).text !== parameterName) return undefined
    const target = resolve(call.expression)
    return target?.target === "import" || target?.target === "require" ? target : undefined
  }

  const assignAlias = (name: string, value: ResolvedValue | undefined): boolean => {
    if (!value || sameValue(aliases.get(name), value)) return false
    aliases.set(name, value)
    return true
  }

  const collectAliases = (node: ts.Node): boolean => {
    let changed = false
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        changed =
          assignAlias(node.name.text, resolveLoaderWrapper(node.initializer) ?? resolve(node.initializer)) || changed
      } else if (ts.isObjectBindingPattern(node.name) && resolve(node.initializer)?.target === "global") {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue
          const propertyName = element.propertyName
            ? ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName)
              ? element.propertyName.text
              : undefined
            : element.name.text
          const target = propertyName === "Function" ? "function" : propertyName === "eval" ? "eval" : undefined
          if (target) changed = assignAlias(element.name.text, { target }) || changed
        }
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      changed = assignAlias(node.left.text, resolveLoaderWrapper(node.right) ?? resolve(node.right)) || changed
    }
    ts.forEachChild(node, (child) => {
      changed = collectAliases(child) || changed
    })
    return changed
  }

  for (let pass = 0; pass <= aliases.size + 4 && collectAliases(sourceFile); pass += 1) {
    // Revisit forward and chained aliases until the small symbol table stabilizes.
  }

  const violations: string[] = []
  const reported = new Set<string>()
  const report = (node: ts.Node, label: string) => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    const violation = `${relativePath}:${position.line + 1}: ${label}`
    if (!reported.has(violation)) {
      reported.add(violation)
      violations.push(violation)
    }
  }
  const moduleText = (node: ts.Expression | undefined) => node && resolve(node)?.stringValue

  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && forbiddenExecutionIdentifiers.has(node.text)) {
      report(node, `forbidden execution identifier ${node.text}`)
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const propertyName = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : node.argumentExpression
          ? moduleText(node.argumentExpression)
          : undefined
      if (propertyName === "constructor" || propertyName === "Function") {
        report(node, "dynamic constructor access")
      }
      if (propertyName === "eval") report(node, "computed eval access")
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === "components" &&
        /adapter/i.test(node.expression.getText(sourceFile))
      ) {
        report(node, "executable adapter component-map access")
      }
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier =
        node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : null
      if (specifier && forbiddenExecutionModule.test(specifier)) report(node, "host import of sandbox execution module")
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const target = resolve(node.expression)
      if (target?.target === "function") report(node, "dynamic Function execution")
      if (target?.target === "eval") report(node, "indirect eval execution")
      const specifier = node.arguments?.length === 1 ? moduleText(node.arguments[0]) : undefined
      if (
        specifier &&
        forbiddenExecutionModule.test(specifier) &&
        (target?.target === "import" || target?.target === "require")
      ) {
        report(node, "dynamic host import of sandbox execution module")
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return violations
}

export function findHostExecutionViolations(root = process.cwd()): string[] {
  return listHostProductionFiles(root).flatMap((relativePath) =>
    findHostExecutionViolationsInSource(relativePath, fs.readFileSync(path.join(root, relativePath), "utf8")),
  )
}
