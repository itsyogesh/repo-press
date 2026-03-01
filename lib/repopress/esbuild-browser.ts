import * as esbuild from "esbuild-wasm"

let esbuildInitialized = false

export async function initEsbuild() {
  if (esbuildInitialized) return

  try {
    await esbuild.initialize({
      worker: false, // In browser, we might use worker. For simple tasks, worker: false is easier to setup without external URLs
      wasmURL: "/esbuild.wasm",
    })
    esbuildInitialized = true
  } catch (e: any) {
    if (e.message.includes('Cannot call "initialize" more than once')) {
      esbuildInitialized = true
      return
    }
    console.error("Failed to initialize esbuild", e)
    throw e
  }
}

export async function transpileAdapter(source: string): Promise<string> {
  await initEsbuild()

  const result = await esbuild.transform(source, {
    loader: "tsx",
    target: "es2020",
    format: "cjs",
  })

  return result.code
}
