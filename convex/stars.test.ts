import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/access', () => ({
  requireUser: vi.fn(),
}))

const { requireUser } = await import('./lib/access')
const { addStarInternal, removeStarInternal, toggle } = await import('./stars')

type WrappedHandler<TArgs> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<unknown>
}

const toggleHandler = (toggle as unknown as WrappedHandler<{ skillId: string }>)._handler
const addStarInternalHandler = (
  addStarInternal as unknown as WrappedHandler<{ userId: string; skillId: string }>
)._handler
const removeStarInternalHandler = (
  removeStarInternal as unknown as WrappedHandler<{ userId: string; skillId: string }>
)._handler

function makeDb(overrides: Record<string, unknown>) {
  return {
    get: vi.fn(),
    insert: vi.fn(),
    patch: vi.fn(),
    replace: vi.fn(),
    delete: vi.fn(),
    query: vi.fn(),
    normalizeId: vi.fn(),
    system: {},
    ...overrides,
  }
}

describe('stars mutations', () => {
  afterEach(() => {
    ;(requireUser as ReturnType<typeof vi.fn>).mockReset()
    vi.restoreAllMocks()
  })

  it('toggle increments skill stats immediately when starring', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    ;(requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'users:1' } as never)

    const insert = vi.fn()
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValue({
      _id: 'skills:1',
      stats: {
        downloads: 7,
        installsCurrent: 2,
        installsAllTime: 4,
        stars: 0,
        versions: 1,
        comments: 0,
      },
    })
    const query = vi.fn((table: string) => {
      if (table !== 'stars') throw new Error(`unexpected table ${table}`)
      return {
        withIndex: () => ({
          unique: vi.fn().mockResolvedValue(null),
        }),
      }
    })

    const result = await toggleHandler({ db: makeDb({ get, insert, patch, query }) } as never, {
      skillId: 'skills:1',
    })

    expect(result).toEqual({ starred: true })

    expect(insert).toHaveBeenCalledWith('stars', {
      skillId: 'skills:1',
      userId: 'users:1',
      createdAt: 1_700_000_000_000,
    })
    expect(patch).toHaveBeenCalledWith(
      'skills:1',
      expect.objectContaining({
        statsStars: 1,
        stats: expect.objectContaining({ stars: 1 }),
      }),
    )
  })

  it('addStarInternal is idempotent for an existing star', async () => {
    const insert = vi.fn()
    const patch = vi.fn()
    const query = vi.fn((table: string) => {
      if (table !== 'stars') throw new Error(`unexpected table ${table}`)
      return {
        withIndex: () => ({
          unique: vi.fn().mockResolvedValue({
            _id: 'stars:1',
            skillId: 'skills:1',
            userId: 'users:1',
          }),
        }),
      }
    })

    const result = await addStarInternalHandler(
      { db: makeDb({ insert, patch, query }) } as never,
      { userId: 'users:1', skillId: 'skills:1' },
    )

    expect(result).toEqual({
      ok: true,
      starred: true,
      alreadyStarred: true,
    })

    expect(insert).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
  })

  it('removeStarInternal clamps star counts at zero', async () => {
    const deleteDoc = vi.fn()
    const patch = vi.fn()
    const get = vi.fn().mockResolvedValue({
      _id: 'skills:1',
      stats: {
        downloads: 7,
        installsCurrent: 2,
        installsAllTime: 4,
        stars: 0,
        versions: 1,
        comments: 0,
      },
    })
    const query = vi.fn((table: string) => {
      if (table !== 'stars') throw new Error(`unexpected table ${table}`)
      return {
        withIndex: () => ({
          unique: vi.fn().mockResolvedValue({
            _id: 'stars:1',
            skillId: 'skills:1',
            userId: 'users:1',
          }),
        }),
      }
    })

    const result = await removeStarInternalHandler(
      { db: makeDb({ delete: deleteDoc, get, patch, query }) } as never,
      { userId: 'users:1', skillId: 'skills:1' },
    )

    expect(result).toEqual({
      ok: true,
      unstarred: true,
      alreadyUnstarred: false,
    })

    expect(deleteDoc).toHaveBeenCalledWith('stars:1')
    expect(patch).toHaveBeenCalledWith(
      'skills:1',
      expect.objectContaining({
        statsStars: 0,
        stats: expect.objectContaining({ stars: 0 }),
      }),
    )
  })
})
