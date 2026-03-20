import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateEmbeddingMock = vi.fn()
const requireGitHubAccountAgeMock = vi.fn()
const generateSoulChangelogForPublishMock = vi.fn()

vi.mock('./embeddings', () => ({
  generateEmbedding: (...args: unknown[]) => generateEmbeddingMock(...args),
}))

vi.mock('./githubAccount', () => ({
  requireGitHubAccountAge: (...args: unknown[]) => requireGitHubAccountAgeMock(...args),
}))

vi.mock('./soulChangelog', () => ({
  generateSoulChangelogForPublish: (...args: unknown[]) =>
    generateSoulChangelogForPublishMock(...args),
}))

const { publishSoulVersionForUser } = await import('./soulPublish')

describe('soulPublish', () => {
  beforeEach(() => {
    generateEmbeddingMock.mockReset()
    requireGitHubAccountAgeMock.mockReset()
    generateSoulChangelogForPublishMock.mockReset()

    generateEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3])
    requireGitHubAccountAgeMock.mockResolvedValue(undefined)
    generateSoulChangelogForPublishMock.mockResolvedValue('- Updated soul bundle.')
  })

  it('publishes soul bundles with support files while embedding only SOUL.md', async () => {
    const runMutation = vi.fn().mockResolvedValue({
      soulId: 'souls:1',
      versionId: 'soulVersions:1',
      embeddingId: 'soulEmbeddings:1',
    })
    const runQuery = vi.fn(async (_query: unknown, args: Record<string, unknown>) => {
      if ('userId' in args) {
        return {
          _id: 'users:1',
          handle: 'demo',
        }
      }
      return null
    })
    const runAfter = vi.fn().mockResolvedValue(undefined)

    const storage = new Map<string, Blob>([
      [
        '_storage:1',
        new Blob(
          [
            `---
description: Demo soul summary
---
# Demo Soul
Primary lore content.
`,
          ],
          { type: 'text/markdown' },
        ),
      ],
      ['_storage:2', new Blob(['Support notes that should stay out of embeddings.'])],
      ['_storage:3', new Blob(['{"state":"ok"}'], { type: 'application/json' })],
    ])

    const result = await publishSoulVersionForUser(
      {
        storage: {
          get: vi.fn(async (id: string) => storage.get(id) ?? null),
        },
        runMutation,
        runQuery,
        scheduler: {
          runAfter,
        },
      } as never,
      'users:1' as never,
      {
        slug: 'demo-soul',
        displayName: 'Demo Soul',
        version: '1.0.0',
        changelog: '',
        files: [
          {
            path: 'SOUL.md',
            size: 64,
            storageId: '_storage:1' as never,
            sha256: 'a'.repeat(64),
            contentType: 'text/markdown',
          },
          {
            path: 'notes.txt',
            size: 32,
            storageId: '_storage:2' as never,
            sha256: 'b'.repeat(64),
            contentType: 'text/plain',
          },
          {
            path: '.openclaw/workspace-state.json',
            size: 16,
            storageId: '_storage:3' as never,
            sha256: 'c'.repeat(64),
            contentType: 'application/json',
          },
        ],
      },
    )

    expect(result).toEqual({
      soulId: 'souls:1',
      versionId: 'soulVersions:1',
      embeddingId: 'soulEmbeddings:1',
    })
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        summary: 'Demo soul summary',
        files: expect.arrayContaining([
          expect.objectContaining({ path: 'SOUL.md' }),
          expect.objectContaining({ path: 'notes.txt' }),
          expect.objectContaining({ path: '.openclaw/workspace-state.json' }),
        ]),
      }),
    )
    expect(generateSoulChangelogForPublishMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        files: [
          { path: 'SOUL.md', sha256: 'a'.repeat(64) },
          { path: 'notes.txt', sha256: 'b'.repeat(64) },
          { path: '.openclaw/workspace-state.json', sha256: 'c'.repeat(64) },
        ],
      }),
    )
    expect(generateEmbeddingMock).toHaveBeenCalledWith(expect.stringContaining('Primary lore content.'))
    expect(generateEmbeddingMock).not.toHaveBeenCalledWith(
      expect.stringContaining('Support notes that should stay out of embeddings.'),
    )
    expect(runAfter).toHaveBeenCalled()
  })
})
