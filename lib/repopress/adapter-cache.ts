const ADAPTER_CACHE_DB = "repopress-cache"
const ADAPTER_CACHE_STORE = "adapters"
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

type AdapterCacheRecord = {
  key: string
  sourceSha: string
  transpiledCode: string
  createdAt: number
  expiresAt: number
}

type SetCachedAdapterInput = {
  key: string
  sourceSha: string
  transpiledCode: string
  ttlMs?: number
}

const memoryFallback = new Map<string, AdapterCacheRecord>()
let openDbPromise: Promise<IDBDatabase | null> | null = null

function getIndexedDb(): IDBFactory | null {
  if (typeof globalThis === "undefined") return null
  if (!("indexedDB" in globalThis)) return null
  return globalThis.indexedDB
}

function isExpired(record: Pick<AdapterCacheRecord, "expiresAt">) {
  return record.expiresAt <= Date.now()
}

function openAdapterCacheDb(): Promise<IDBDatabase | null> {
  if (openDbPromise) return openDbPromise

  const indexedDb = getIndexedDb()
  if (!indexedDb) {
    openDbPromise = Promise.resolve(null)
    return openDbPromise
  }

  openDbPromise = new Promise((resolve) => {
    const request = indexedDb.open(ADAPTER_CACHE_DB, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ADAPTER_CACHE_STORE)) {
        db.createObjectStore(ADAPTER_CACHE_STORE, { keyPath: "key" })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      console.warn("[RepoPress] Failed to open adapter cache DB, using memory fallback.")
      resolve(null)
    }
  })

  return openDbPromise
}

function getStore(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): {
  tx: IDBTransaction
  store: IDBObjectStore
} {
  const tx = db.transaction(ADAPTER_CACHE_STORE, mode)
  return { tx, store: tx.objectStore(ADAPTER_CACHE_STORE) }
}

async function deleteRecordByKey(key: string) {
  memoryFallback.delete(key)
  const db = await openAdapterCacheDb()
  if (!db) return

  await new Promise<void>((resolve) => {
    const { tx, store } = getStore(db, "readwrite")
    store.delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export function buildAdapterCacheKey(
  owner: string,
  repo: string,
  branch: string,
  entryPath: string,
  sourceSha: string,
) {
  return `${owner}/${repo}@${branch}:${entryPath}:${sourceSha}`
}

export async function setCachedAdapter(input: SetCachedAdapterInput) {
  const now = Date.now()
  const record: AdapterCacheRecord = {
    key: input.key,
    sourceSha: input.sourceSha,
    transpiledCode: input.transpiledCode,
    createdAt: now,
    expiresAt: now + (input.ttlMs ?? DEFAULT_TTL_MS),
  }

  memoryFallback.set(record.key, record)

  const db = await openAdapterCacheDb()
  if (!db) return

  await new Promise<void>((resolve) => {
    const { tx, store } = getStore(db, "readwrite")
    store.put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export async function getCachedAdapter(key: string, sourceSha?: string): Promise<string | null> {
  const memoryRecord = memoryFallback.get(key)
  if (memoryRecord) {
    if (isExpired(memoryRecord)) {
      await deleteRecordByKey(key)
      return null
    }
    if (sourceSha && memoryRecord.sourceSha !== sourceSha) {
      return null
    }
    return memoryRecord.transpiledCode
  }

  const db = await openAdapterCacheDb()
  if (!db) return null

  const record = await new Promise<AdapterCacheRecord | null>((resolve) => {
    const { tx, store } = getStore(db, "readonly")
    const request = store.get(key)
    request.onsuccess = () => resolve((request.result as AdapterCacheRecord | undefined) ?? null)
    request.onerror = () => resolve(null)
    tx.onerror = () => resolve(null)
  })

  if (!record) return null
  if (isExpired(record)) {
    await deleteRecordByKey(key)
    return null
  }
  if (sourceSha && record.sourceSha !== sourceSha) {
    return null
  }

  memoryFallback.set(key, record)
  return record.transpiledCode
}

export async function invalidateAdapterCache(prefix: string) {
  for (const key of [...memoryFallback.keys()]) {
    if (key.startsWith(prefix)) {
      memoryFallback.delete(key)
    }
  }

  const db = await openAdapterCacheDb()
  if (!db) return

  await new Promise<void>((resolve) => {
    const { tx, store } = getStore(db, "readwrite")
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const key = String(cursor.key)
      if (key.startsWith(prefix)) {
        cursor.delete()
      }
      cursor.continue()
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export async function pruneExpiredAdapterCache() {
  for (const [key, record] of [...memoryFallback.entries()]) {
    if (isExpired(record)) {
      memoryFallback.delete(key)
    }
  }

  const db = await openAdapterCacheDb()
  if (!db) return

  await new Promise<void>((resolve) => {
    const { tx, store } = getStore(db, "readwrite")
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const value = cursor.value as AdapterCacheRecord
      if (isExpired(value)) {
        cursor.delete()
      }
      cursor.continue()
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export async function clearAdapterCache() {
  memoryFallback.clear()
  const db = await openAdapterCacheDb()
  if (!db) return

  await new Promise<void>((resolve) => {
    const { tx, store } = getStore(db, "readwrite")
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}
