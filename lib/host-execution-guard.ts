import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const PRODUCTION_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"])
const EXCLUDED_DIRECTORIES = new Set([
  ".agents",
  ".claude",
  ".codex",
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  ".worktrees",
  "__tests__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
])
const SANDBOX_ALLOWLIST = path.join("components", "preview-sandbox")
const CONVEX_GENERATED_OUTPUT = path.join("convex", "_generated")
const COMPONENT_MAP_PROPERTIES = new Set(["components", "componentsByContext", "RenderBindings"])
const SANDBOX_ROUTE_ENTRY = path.join("app", "preview", "sandbox", "page.tsx")
const SANDBOX_ROUTE_MODULE = "@/components/preview-sandbox/SandboxRuntime"

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
  "createCompatibleWorkerRenderer",
])
const forbiddenExecutionModule = /(?:evaluateMdx|evaluate-adapter|esbuild-browser|execution-guard)(?:\.[cm]?[jt]sx?)?$/
const previewSandboxModule = /(?:^|\/)(?:components\/)?preview-sandbox(?:\/|$)/
const repositoryPreviewAdapterModule = /(?:^|\/)\.repopress\/mdx-preview(?:\/|$|\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$)/

type ExecutionTarget = "adapter" | "component-map" | "eval" | "function" | "global" | "import" | "module" | "require"
type ModuleTarget = "preview-sandbox" | "repository-adapter"

interface ResolvedValue {
  stringValue?: string
  target?: ExecutionTarget
}

function isExcludedProductionFile(fileName: string): boolean {
  return /\.d\.[cm]?ts$/.test(fileName) || /(?:^|[.-])(?:test|spec)\.[^.]+$/.test(fileName)
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
      if (
        EXCLUDED_DIRECTORIES.has(entry.name) ||
        relativePath === CONVEX_GENERATED_OUTPUT ||
        relativePath === SANDBOX_ALLOWLIST
      ) {
        return []
      }
      return listDirectorySources(root, relativePath)
    }
    return entry.isFile() && isProductionSourceFile(entry.name) ? [relativePath] : []
  })
}

export function listHostProductionFiles(root = process.cwd()): string[] {
  return listDirectorySources(root, "")
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

function classifyModuleTarget(specifier: string): ModuleTarget | null {
  if (previewSandboxModule.test(specifier)) return "preview-sandbox"
  if (repositoryPreviewAdapterModule.test(specifier)) return "repository-adapter"
  return null
}

function isTypeOnlyImportDeclaration(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause
  if (!clause) return false
  if (clause.isTypeOnly) return true
  return (
    !clause.name &&
    clause.namedBindings !== undefined &&
    ts.isNamedImports(clause.namedBindings) &&
    clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every((element) => element.isTypeOnly)
  )
}

function importEqualsModuleSpecifier(node: ts.ImportEqualsDeclaration): string | null {
  return ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression &&
    ts.isStringLiteralLike(node.moduleReference.expression)
    ? node.moduleReference.expression.text
    : null
}

function staticModuleSpecifier(
  node: ts.ImportDeclaration | ts.ExportDeclaration | ts.ImportEqualsDeclaration,
): string | null {
  if (ts.isImportEqualsDeclaration(node)) return importEqualsModuleSpecifier(node)
  return node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : null
}

function isPreviewSandboxSource(relativePath: string): boolean {
  const normalizedPath = relativePath.replaceAll("\\", "/")
  return normalizedPath === "components/preview-sandbox" || normalizedPath.startsWith("components/preview-sandbox/")
}

function bindingNameContainsIdentifier(name: ts.BindingName, identifier: ts.Identifier): boolean {
  if (ts.isIdentifier(name)) return name === identifier
  return name.elements.some(
    (element) => !ts.isOmittedExpression(element) && bindingNameContainsIdentifier(element.name, identifier),
  )
}

function isRuntimeIdentifierReference(identifier: ts.Identifier): boolean {
  if (ts.isPartOfTypeNode(identifier)) return false
  let ancestor: ts.Node | undefined = identifier.parent
  while (ancestor && !ts.isStatement(ancestor) && !ts.isSourceFile(ancestor)) {
    if (ts.isTypeQueryNode(ancestor)) return false
    ancestor = ancestor.parent
  }
  const parent = identifier.parent
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isEnumMember(parent)) &&
    parent.name === identifier
  ) {
    return false
  }
  if (ts.isBindingElement(parent)) {
    return !bindingNameContainsIdentifier(parent.name, identifier) && parent.propertyName !== identifier
  }
  if (ts.isVariableDeclaration(parent) || ts.isParameter(parent)) {
    return !bindingNameContainsIdentifier(parent.name, identifier)
  }
  if (
    ((ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isModuleDeclaration(parent)) &&
      parent.name === identifier) ||
    ts.isImportClause(parent) ||
    ts.isImportSpecifier(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isImportEqualsDeclaration(parent) ||
    ts.isExportSpecifier(parent)
  ) {
    return false
  }
  if (
    (ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) &&
    parent.label === identifier
  ) {
    return false
  }
  return true
}

function bindingNameIncludes(name: ts.BindingName, identifier: string): boolean {
  if (ts.isIdentifier(name)) return name.text === identifier
  return name.elements.some(
    (element) => !ts.isOmittedExpression(element) && bindingNameIncludes(element.name, identifier),
  )
}

function hasDeclareModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword))
  )
}

function isDeclarationOnlyContext(node: ts.Node): boolean {
  let current: ts.Node | undefined = node
  while (current) {
    if (ts.isSourceFile(current)) return current.isDeclarationFile
    if (hasDeclareModifier(current)) return true
    current = current.parent
  }
  return false
}

function statementDeclaresIdentifier(statement: ts.Statement, identifier: string): boolean {
  if (ts.isFunctionDeclaration(statement)) {
    return statement.name?.text === identifier && statement.body !== undefined && !isDeclarationOnlyContext(statement)
  }
  if (ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement)) {
    return (
      statement.name !== undefined &&
      ts.isIdentifier(statement.name) &&
      statement.name.text === identifier &&
      !isDeclarationOnlyContext(statement)
    )
  }
  if (ts.isVariableStatement(statement) && !isDeclarationOnlyContext(statement)) {
    return statement.declarationList.declarations.some((declaration) =>
      bindingNameIncludes(declaration.name, identifier),
    )
  }
  if (ts.isImportEqualsDeclaration(statement)) {
    return !statement.isTypeOnly && !isDeclarationOnlyContext(statement) && statement.name.text === identifier
  }
  if (ts.isImportDeclaration(statement) && statement.importClause) {
    const clause = statement.importClause
    if (clause.isTypeOnly) return false
    if (clause.name?.text === identifier) return true
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) return clause.namedBindings.name.text === identifier
      return clause.namedBindings.elements.some((element) => !element.isTypeOnly && element.name.text === identifier)
    }
  }
  return false
}

export function findHostExecutionViolationsInSource(relativePath: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(relativePath),
  )
  const permitsCommonJsLoader = isPreviewSandboxSource(relativePath)
  const aliases = new Map<string, ResolvedValue>()

  const isLocallyBound = (identifier: ts.Identifier): boolean => {
    let current: ts.Node | undefined = identifier.parent
    while (current) {
      if (ts.isSourceFile(current) || ts.isBlock(current)) {
        if (current.statements.some((statement) => statementDeclaresIdentifier(statement, identifier.text))) {
          return true
        }
      }
      if (ts.isFunctionLike(current)) {
        if (current.parameters.some((parameter) => bindingNameIncludes(parameter.name, identifier.text))) return true
        if (
          (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current)) &&
          current.name?.text === identifier.text
        ) {
          return true
        }
      }
      if (ts.isCatchClause(current) && current.variableDeclaration) {
        if (bindingNameIncludes(current.variableDeclaration.name, identifier.text)) return true
      }
      if (ts.isForStatement(current) && current.initializer && ts.isVariableDeclarationList(current.initializer)) {
        if (
          current.initializer.declarations.some((declaration) => bindingNameIncludes(declaration.name, identifier.text))
        ) {
          return true
        }
      }
      if (
        (ts.isForInStatement(current) || ts.isForOfStatement(current)) &&
        ts.isVariableDeclarationList(current.initializer)
      ) {
        if (
          current.initializer.declarations.some((declaration) => bindingNameIncludes(declaration.name, identifier.text))
        ) {
          return true
        }
      }
      current = current.parent
    }
    return false
  }

  const resolve = (input: ts.Expression, resolving = new Set<string>()): ResolvedValue | undefined => {
    const expression = unwrapExpression(input)
    if (ts.isStringLiteralLike(expression)) return { stringValue: expression.text }
    if (ts.isIdentifier(expression)) {
      const aliased = aliases.get(expression.text)
      if (aliased && !resolving.has(expression.text)) return aliased
      if (expression.text === "globalThis" && !isLocallyBound(expression)) return { target: "global" }
      if (expression.text === "Function") return { target: "function" }
      if (expression.text === "eval") return { target: "eval" }
      if (expression.text === "require" && !isLocallyBound(expression)) return { target: "require" }
      if (expression.text === "module" && !isLocallyBound(expression)) return { target: "module" }
      if (expression.text === "componentsByContext" || expression.text === "RenderBindings") {
        return { target: "component-map" }
      }
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
      if (propertyName === "adapter") return { target: "adapter" }
      if ((base?.target === "global" || base?.target === "module") && propertyName === "require") {
        return { target: "require" }
      }
      if (propertyName && COMPONENT_MAP_PROPERTIES.has(propertyName) && base?.target === "adapter") {
        return { target: "component-map" }
      }
      if (base?.target === "component-map") return { target: "component-map" }
      return undefined
    }
    if (ts.isCallExpression(expression)) {
      if (ts.isIdentifier(expression.expression) && expression.expression.text === "createRenderBindings") {
        return { target: "component-map" }
      }
      if (
        ts.isPropertyAccessExpression(expression.expression) &&
        expression.expression.name.text === "bind" &&
        resolve(expression.expression.expression, resolving)?.target === "require"
      ) {
        return { target: "require" }
      }
      const loaderTarget = resolve(expression.expression, resolving)?.target
      const moduleSpecifier =
        expression.arguments.length === 1 ? resolve(expression.arguments[0], resolving)?.stringValue : undefined
      if (
        loaderTarget === "require" &&
        moduleSpecifier &&
        classifyModuleTarget(moduleSpecifier) === "repository-adapter"
      ) {
        return { target: "adapter" }
      }
    }
    return undefined
  }

  const propertyNameText = (propertyName: ts.PropertyName | undefined): string | undefined => {
    if (!propertyName) return undefined
    if (ts.isIdentifier(propertyName) || ts.isStringLiteralLike(propertyName)) return propertyName.text
    if (ts.isComputedPropertyName(propertyName)) return resolve(propertyName.expression)?.stringValue
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

  const assignObjectBindingAliases = (pattern: ts.ObjectBindingPattern, initializer: ts.Expression): boolean => {
    const sourceTarget = resolve(initializer)?.target
    let changed = false
    for (const element of pattern.elements) {
      if (!ts.isIdentifier(element.name)) continue
      const propertyName = propertyNameText(element.propertyName) ?? element.name.text
      if (propertyName === "adapter") {
        changed = assignAlias(element.name.text, { target: "adapter" }) || changed
        continue
      }
      if (
        sourceTarget !== "adapter" &&
        sourceTarget !== "global" &&
        sourceTarget !== "module" &&
        sourceTarget !== "component-map"
      ) {
        continue
      }
      const target =
        sourceTarget === "global" || sourceTarget === "module"
          ? propertyName === "Function"
            ? "function"
            : propertyName === "eval"
              ? "eval"
              : propertyName === "require"
                ? "require"
                : undefined
          : COMPONENT_MAP_PROPERTIES.has(propertyName) || sourceTarget === "component-map"
            ? "component-map"
            : undefined
      if (target) changed = assignAlias(element.name.text, { target }) || changed
    }
    return changed
  }

  const assignObjectLiteralAliases = (pattern: ts.ObjectLiteralExpression, initializer: ts.Expression): boolean => {
    const sourceTarget = resolve(initializer)?.target
    let changed = false
    for (const property of pattern.properties) {
      const propertyName = propertyNameText(property.name)
      const assignedName = ts.isShorthandPropertyAssignment(property)
        ? property.name.text
        : ts.isPropertyAssignment(property) && ts.isIdentifier(unwrapExpression(property.initializer))
          ? (unwrapExpression(property.initializer) as ts.Identifier).text
          : undefined
      if (!propertyName || !assignedName) continue
      if (propertyName === "adapter") {
        changed = assignAlias(assignedName, { target: "adapter" }) || changed
      } else if (
        (sourceTarget === "adapter" || sourceTarget === "component-map") &&
        (COMPONENT_MAP_PROPERTIES.has(propertyName) || sourceTarget === "component-map")
      ) {
        changed = assignAlias(assignedName, { target: "component-map" }) || changed
      } else if ((sourceTarget === "global" || sourceTarget === "module") && propertyName === "require") {
        changed = assignAlias(assignedName, { target: "require" }) || changed
      }
    }
    return changed
  }

  const collectAliases = (node: ts.Node): boolean => {
    let changed = false
    if (ts.isImportDeclaration(node) && node.importClause && !isTypeOnlyImportDeclaration(node)) {
      const specifier = ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined
      if (specifier && classifyModuleTarget(specifier) === "repository-adapter") {
        const clause = node.importClause
        if (clause.name) changed = assignAlias(clause.name.text, { target: "adapter" }) || changed
        if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            changed = assignAlias(clause.namedBindings.name.text, { target: "adapter" }) || changed
          } else {
            for (const element of clause.namedBindings.elements) {
              if (element.isTypeOnly) continue
              const importedName = element.propertyName?.text ?? element.name.text
              if (importedName === "adapter" || importedName === "default") {
                changed = assignAlias(element.name.text, { target: "adapter" }) || changed
              }
            }
          }
        }
      }
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
      const specifier = importEqualsModuleSpecifier(node)
      if (specifier && classifyModuleTarget(specifier) === "repository-adapter") {
        changed = assignAlias(node.name.text, { target: "adapter" }) || changed
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        changed =
          assignAlias(node.name.text, resolveLoaderWrapper(node.initializer) ?? resolve(node.initializer)) || changed
      } else if (ts.isObjectBindingPattern(node.name)) {
        changed = assignObjectBindingAliases(node.name, node.initializer) || changed
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      changed = assignAlias(node.left.text, resolveLoaderWrapper(node.right) ?? resolve(node.right)) || changed
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = unwrapExpression(node.left)
      if (ts.isObjectLiteralExpression(left)) changed = assignObjectLiteralAliases(left, node.right) || changed
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
  const isTypeOnlyModuleEdge = (
    node: ts.ImportDeclaration | ts.ExportDeclaration | ts.ImportEqualsDeclaration,
  ): boolean => {
    if (ts.isImportEqualsDeclaration(node)) return node.isTypeOnly
    if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly) return true
      return (
        node.exportClause !== undefined &&
        ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.length > 0 &&
        node.exportClause.elements.every((element) => element.isTypeOnly)
      )
    }
    return isTypeOnlyImportDeclaration(node)
  }
  const isSandboxRouteEntry = (node: ts.ImportDeclaration | ts.ExportDeclaration, specifier: string): boolean => {
    if (relativePath !== SANDBOX_ROUTE_ENTRY || specifier !== SANDBOX_ROUTE_MODULE || !ts.isImportDeclaration(node)) {
      return false
    }
    const clause = node.importClause
    return (
      clause !== undefined &&
      !clause.isTypeOnly &&
      !clause.name &&
      clause.namedBindings !== undefined &&
      ts.isNamedImports(clause.namedBindings) &&
      clause.namedBindings.elements.length === 1 &&
      !clause.namedBindings.elements[0].isTypeOnly &&
      !clause.namedBindings.elements[0].propertyName &&
      clause.namedBindings.elements[0].name.text === "SandboxRuntime"
    )
  }

  const visit = (node: ts.Node) => {
    if (
      !permitsCommonJsLoader &&
      ts.isIdentifier(node) &&
      isRuntimeIdentifierReference(node) &&
      ((node.text === "require" && !isLocallyBound(node)) || (node.text === "module" && !isLocallyBound(node)))
    ) {
      report(node, "ambient CommonJS loader use")
    }
    if (ts.isIdentifier(node) && forbiddenExecutionIdentifiers.has(node.text)) {
      report(node, `forbidden execution identifier ${node.text}`)
    }
    if (ts.isIdentifier(node) && aliases.get(node.text)?.target === "component-map") {
      report(node, "executable adapter component-map alias")
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
      const baseTarget = resolve(node.expression)?.target
      if (
        !permitsCommonJsLoader &&
        propertyName === "require" &&
        (baseTarget === "global" || baseTarget === "module")
      ) {
        report(node, "ambient CommonJS loader use")
      }
      if (propertyName && COMPONENT_MAP_PROPERTIES.has(propertyName) && baseTarget === "adapter") {
        report(node, "executable adapter component-map access")
      }
      if (baseTarget === "component-map") report(node, "executable adapter component-map member use")
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
      const specifier = staticModuleSpecifier(node)
      const moduleTarget = specifier ? classifyModuleTarget(specifier) : null
      if (
        !permitsCommonJsLoader &&
        ts.isImportEqualsDeclaration(node) &&
        specifier &&
        !node.isTypeOnly &&
        !isDeclarationOnlyContext(node)
      ) {
        report(node, "ambient CommonJS loader use")
      }
      if (
        specifier &&
        moduleTarget === "preview-sandbox" &&
        !isTypeOnlyModuleEdge(node) &&
        !(ts.isImportDeclaration(node) && isSandboxRouteEntry(node, specifier))
      ) {
        report(node, "host import of preview sandbox module")
      }
      if (specifier && moduleTarget === "repository-adapter" && !isTypeOnlyModuleEdge(node)) {
        report(node, "host import of repository preview adapter module")
      }
      if (specifier && forbiddenExecutionModule.test(specifier)) report(node, "host import of sandbox execution module")
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const target = resolve(node.expression)
      if (!permitsCommonJsLoader && target?.target === "require") {
        report(node, "ambient CommonJS loader use")
      }
      if (target?.target === "function") report(node, "dynamic Function execution")
      if (target?.target === "eval") report(node, "indirect eval execution")
      if (target?.target === "component-map") report(node, "executable adapter component-map invocation")
      const specifier = node.arguments?.length === 1 ? moduleText(node.arguments[0]) : undefined
      const moduleTarget = specifier ? classifyModuleTarget(specifier) : null
      if (
        specifier &&
        forbiddenExecutionModule.test(specifier) &&
        (target?.target === "import" || target?.target === "require")
      ) {
        report(node, "dynamic host import of sandbox execution module")
      }
      if (
        specifier &&
        moduleTarget === "preview-sandbox" &&
        (target?.target === "import" || target?.target === "require")
      ) {
        report(node, "dynamic host import of preview sandbox module")
      }
      if (
        specifier &&
        moduleTarget === "repository-adapter" &&
        (target?.target === "import" || target?.target === "require")
      ) {
        report(node, "dynamic host import of repository preview adapter module")
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
