"use client"

import { parseExpressionAt } from "acorn"

type EvalScope = Record<string, any>

type EvalResult = { ok: true; value: any } | { ok: false; reason: string }

// Evaluate a restricted subset of JS expressions safely:
// - Literals, arrays, plain objects
// - Member access into the provided scope (no calls)
export function safeEvalJsExpression(expression: string, scope: EvalScope): EvalResult {
  let node: any
  try {
    node = parseExpressionAt(expression, 0, {
      ecmaVersion: 2020,
      sourceType: "module",
    } as any)
  } catch (error) {
    return { ok: false, reason: `Parse error: ${(error as Error).message}` }
  }

  try {
    const value = evalNode(node, scope)
    return { ok: true, value }
  } catch (error) {
    return { ok: false, reason: (error as Error).message }
  }
}

function evalNode(node: any, scope: EvalScope): any {
  switch (node.type) {
    case "Literal":
      return (node as any).value

    case "Identifier": {
      const name = node.name as string
      if (!(name in scope)) {
        throw new Error(`Identifier "${name}" is not allowed`)
      }
      return scope[name]
    }

    case "MemberExpression": {
      const object = evalNode(node.object, scope)
      const property = node.computed ? evalNode(node.property, scope) : node.property.name
      if (object == null) {
        throw new Error("Cannot read property of null/undefined")
      }
      return object[property as keyof typeof object]
    }

    case "ArrayExpression":
      return node.elements.map((el: any) => {
        if (!el) return undefined
        if (el.type === "SpreadElement") {
          throw new Error("Spread in arrays is not allowed")
        }
        return evalNode(el, scope)
      })

    case "ObjectExpression": {
      const result: Record<string, any> = {}
      for (const prop of node.properties) {
        if (prop.type === "SpreadElement") {
          throw new Error("Spread in objects is not allowed")
        }
        const keyNode = prop.key
        let key: string
        if (keyNode.type === "Identifier") {
          key = keyNode.name
        } else if (keyNode.type === "Literal") {
          key = String(keyNode.value)
        } else {
          throw new Error("Unsupported object key type")
        }
        result[key] = evalNode(prop.value, scope)
      }
      return result
    }

    default:
      throw new Error(`Expression type "${node.type}" is not allowed`)
  }
}
