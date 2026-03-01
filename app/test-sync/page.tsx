"use client"
import { useState } from "react"
import { syncProjectsFromConfigAction } from "@/app/dashboard/[owner]/[repo]/actions"

export default function TestSync() {
  const [result, setResult] = useState<any>(null)

  const handleSync = async () => {
    try {
      const res = await syncProjectsFromConfigAction("owner", "repo", "main")
      setResult({ success: true, res })
    } catch (err: any) {
      setResult({ success: false, error: err.message })
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-xl mb-4">Test Config Sync</h1>
      <button type="button" onClick={handleSync} className="px-4 py-2 bg-blue-500 text-white rounded">
        Sync Config Action
      </button>
      <pre className="mt-4 p-4 bg-muted">{JSON.stringify(result, null, 2)}</pre>
    </div>
  )
}
