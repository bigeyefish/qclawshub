import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PUBLISH_ACCESS_DENIED_MESSAGE,
  ensurePublishAccessForAction,
  ensurePublishAccessForDb,
  hasPublishAccess,
  parsePublishAllowlist,
} from './publishAccess'

const originalAllowlist = process.env.PUBLISH_ALLOWLIST

afterEach(() => {
  if (originalAllowlist === undefined) delete process.env.PUBLISH_ALLOWLIST
  else process.env.PUBLISH_ALLOWLIST = originalAllowlist
})

describe('publishAccess', () => {
  it('treats an empty allowlist as disabled', () => {
    delete process.env.PUBLISH_ALLOWLIST

    expect(parsePublishAllowlist()).toEqual(new Set())
    expect(
      hasPublishAccess({
        userId: 'users:demo' as never,
        handle: 'demo',
      }),
    ).toBe(true)
  })

  it('matches supported identifiers', () => {
    process.env.PUBLISH_ALLOWLIST = 'users:owner github:12345 login:octocat handle:alias'

    expect(
      hasPublishAccess({
        userId: 'users:owner' as never,
      }),
    ).toBe(true)
    expect(
      hasPublishAccess({
        userId: 'users:other' as never,
        githubProviderAccountId: '12345',
      }),
    ).toBe(true)
    expect(
      hasPublishAccess({
        userId: 'users:other' as never,
        githubLogin: 'octocat',
      }),
    ).toBe(true)
    expect(
      hasPublishAccess({
        userId: 'users:other' as never,
        handle: 'alias',
      }),
    ).toBe(true)
  })

  it('rejects accounts outside the allowlist', async () => {
    process.env.PUBLISH_ALLOWLIST = 'users:allowed'

    await expect(
      ensurePublishAccessForDb(
        {
          db: {
            query: vi.fn(() => ({
              withIndex: vi.fn(() => ({
                unique: vi.fn().mockResolvedValue(null),
              })),
            })),
          },
        } as never,
        'users:blocked' as never,
        { _id: 'users:blocked' as never, handle: 'blocked', name: 'blocked-gh' },
      ),
    ).rejects.toThrow(PUBLISH_ACCESS_DENIED_MESSAGE)
  })

  it('accepts allowlisted action callers by GitHub provider id', async () => {
    process.env.PUBLISH_ALLOWLIST = 'github:999'

    await expect(
      ensurePublishAccessForAction(
        {
          runQuery: vi.fn().mockResolvedValue('999'),
        } as never,
        'users:any' as never,
        { _id: 'users:any' as never, handle: 'blocked', name: 'blocked-gh' },
      ),
    ).resolves.toBeUndefined()
  })
})
