import ts from "typescript"

const ALLOWED_MODULES = new Set(["react", "react/jsx-runtime", "react/jsx-dev-runtime", "@repopress/preview"])

export class CompatibleAdapterImportError extends Error {
  constructor(message = "Compatible adapter contains unsupported imports") {
    super(message)
    this.name = "CompatibleAdapterImportError"
  }
}

function moduleSpecifierText(node: ts.Expression): string | null {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null
}

function assertAllowedModule(specifier: string | null): void {
  if (!specifier || !ALLOWED_MODULES.has(specifier)) {
    throw new CompatibleAdapterImportError(`Unsupported compatible adapter import: ${specifier ?? "nonliteral"}`)
  }
}

/**
 * Statically enforces the first compatible-preview pilot's single-file module
 * boundary. This validates source only; repository code is never evaluated in
 * the Studio/route realm.
 */
export function assertCompatibleAdapterImports(source: string, filePath = "adapter.tsx"): void {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const parseDiagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
    .parseDiagnostics
  if (parseDiagnostics.length > 0) {
    throw new CompatibleAdapterImportError("Compatible adapter source could not be parsed")
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      assertAllowedModule(moduleSpecifierText(node.moduleSpecifier))
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      assertAllowedModule(moduleSpecifierText(node.moduleSpecifier))
    } else if (ts.isImportEqualsDeclaration(node)) {
      throw new CompatibleAdapterImportError("Compatible adapters cannot use require imports")
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      throw new CompatibleAdapterImportError("Compatible adapters cannot use dynamic imports")
    } else if (ts.isIdentifier(node) && node.text === "require") {
      throw new CompatibleAdapterImportError("Compatible adapters cannot use require")
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}
