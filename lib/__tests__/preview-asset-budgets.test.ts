import { beforeEach, describe, expect, it, vi } from "vitest"

const { verifyServerQueryTokenMock } = vi.hoisted(() => ({ verifyServerQueryTokenMock: vi.fn() }))

vi.mock("@/convex/_generated/server", () => ({
  mutation: (definition: unknown) => definition,
  internalMutation: (definition: unknown) => definition,
}))
vi.mock("@/lib/project-access-token", () => ({ verifyServerQueryToken: verifyServerQueryTokenMock }))

import {
  abort,
  begin,
  expireReservation,
  MAX_PREVIEW_ASSET_BYTES,
  PREVIEW_ASSET_RESERVATION_TTL_MS,
  settle,
} from "@/convex/previewAssetBudgets"

type Row = Record<string, any> & { _id: string }

function createCtx() {
  const tables = new Map<string, Row[]>()
  tables.set("projects", [{ _id: "project_1", userId: "owner_1" }])
  let nextId = 1

  const table = (name: string) => {
    const rows = tables.get(name) ?? []
    tables.set(name, rows)
    return rows
  }

  const ctx = {
    db: {
      get: vi.fn(async (id: string) => {
        for (const rows of tables.values()) {
          const row = rows.find((candidate) => candidate._id === id)
          if (row) return row
        }
        return null
      }),
      query: vi.fn((tableName: string) => ({
        withIndex: vi.fn((_indexName: string, applyIndex: (query: any) => unknown) => {
          const filters: Record<string, unknown> = {}
          const query = {
            eq(field: string, value: unknown) {
              filters[field] = value
              return query
            },
          }
          applyIndex(query)
          const matching = () =>
            table(tableName).filter((row) => Object.entries(filters).every(([field, value]) => row[field] === value))
          return {
            first: async () => matching()[0] ?? null,
            collect: async () => matching(),
          }
        }),
      })),
      insert: vi.fn(async (tableName: string, value: Record<string, unknown>) => {
        const id = `${tableName}_${nextId++}`
        table(tableName).push({ _id: id, ...value })
        return id
      }),
      patch: vi.fn(async (id: string, updates: Record<string, unknown>) => {
        const row = await ctx.db.get(id)
        if (!row) throw new Error("missing row")
        Object.assign(row, updates)
      }),
      delete: vi.fn(async (id: string) => {
        for (const rows of tables.values()) {
          const index = rows.findIndex((row) => row._id === id)
          if (index >= 0) rows.splice(index, 1)
        }
      }),
    },
    scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
  }

  return { ctx: ctx as any, tables }
}

const args = {
  projectId: "project_1",
  actingUserId: "editor_1",
  serverQueryToken: "server-token",
}

describe("durable preview asset budgets", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, "now").mockReturnValue(1_000)
    verifyServerQueryTokenMock.mockResolvedValue(true)
  })

  it("requires server proof before reading or writing budget state", async () => {
    verifyServerQueryTokenMock.mockResolvedValue(false)
    const { ctx } = createCtx()

    await expect((begin as any).handler(ctx, args)).rejects.toThrow(/unauthorized/i)
    expect(ctx.db.get).not.toHaveBeenCalled()
    expect(ctx.db.insert).not.toHaveBeenCalled()
  })

  it("atomically rejects a fourth active reservation", async () => {
    const { ctx } = createCtx()
    const reservations = []
    for (let index = 0; index < 3; index += 1) reservations.push(await (begin as any).handler(ctx, args))

    await expect((begin as any).handler(ctx, args)).resolves.toEqual({
      reserved: false,
      reason: "concurrency-limit",
    })
    expect(reservations.every((reservation) => reservation.reserved)).toBe(true)
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(3)
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(
      PREVIEW_ASSET_RESERVATION_TTL_MS,
      expect.anything(),
      expect.objectContaining({ reservationId: reservations[0].reservationId }),
    )
  })

  it("counts aborted fetches toward the eight-attempt window while releasing their reservations", async () => {
    const { ctx } = createCtx()
    for (let index = 0; index < 8; index += 1) {
      const reservation = await (begin as any).handler(ctx, args)
      expect(reservation.reserved).toBe(true)
      await (abort as any).handler(ctx, { ...args, reservationId: reservation.reservationId })
    }

    await expect((begin as any).handler(ctx, args)).resolves.toEqual({ reserved: false, reason: "attempt-limit" })
  })

  it("replaces a maximum reservation with actual bytes and enforces the aggregate byte cap", async () => {
    const { ctx } = createCtx()
    for (let index = 0; index < 3; index += 1) {
      const reservation = await (begin as any).handler(ctx, args)
      await (settle as any).handler(ctx, {
        ...args,
        reservationId: reservation.reservationId,
        actualBytes: MAX_PREVIEW_ASSET_BYTES,
      })
    }

    await expect((begin as any).handler(ctx, args)).resolves.toEqual({ reserved: false, reason: "byte-limit" })
  })

  it("releases concurrency and reserved bytes after an upstream failure so a retry can begin", async () => {
    const { ctx } = createCtx()
    const first = await (begin as any).handler(ctx, args)
    await expect((abort as any).handler(ctx, { ...args, reservationId: first.reservationId })).resolves.toEqual({
      aborted: true,
    })

    await expect((begin as any).handler(ctx, args)).resolves.toMatchObject({ reserved: true })
  })

  it("expires abandoned reservations without stranding concurrency or reserved bytes", async () => {
    const { ctx } = createCtx()
    const abandoned = await (begin as any).handler(ctx, args)
    vi.spyOn(Date, "now").mockReturnValue(1_000 + PREVIEW_ASSET_RESERVATION_TTL_MS + 1)

    const retry = await (begin as any).handler(ctx, args)

    expect(retry).toMatchObject({ reserved: true })
    await expect(
      (settle as any).handler(ctx, {
        ...args,
        reservationId: abandoned.reservationId,
        actualBytes: 1,
      }),
    ).resolves.toEqual({ settled: false, reason: "missing-or-expired" })
  })

  it("durably cleans a lost-response reservation at its expiry deadline", async () => {
    const { ctx, tables } = createCtx()
    const reservation = await (begin as any).handler(ctx, args)
    vi.spyOn(Date, "now").mockReturnValue(1_000 + PREVIEW_ASSET_RESERVATION_TTL_MS - 1)

    await (expireReservation as any).handler(ctx, { reservationId: reservation.reservationId })
    expect(tables.get("previewAssetReservations")).toHaveLength(1)

    vi.spyOn(Date, "now").mockReturnValue(1_000 + PREVIEW_ASSET_RESERVATION_TTL_MS)
    await (expireReservation as any).handler(ctx, { reservationId: reservation.reservationId })
    expect(tables.get("previewAssetReservations")).toHaveLength(0)
  })

  it("fails closed when settlement identity does not match the reservation", async () => {
    const { ctx } = createCtx()
    const reservation = await (begin as any).handler(ctx, args)

    await expect(
      (settle as any).handler(ctx, {
        ...args,
        actingUserId: "other_user",
        reservationId: reservation.reservationId,
        actualBytes: 1,
      }),
    ).resolves.toEqual({ settled: false, reason: "missing-or-expired" })
  })
})
