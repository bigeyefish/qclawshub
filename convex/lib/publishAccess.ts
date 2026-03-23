import { ConvexError } from 'convex/values'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server'

export const PUBLISH_ALLOWLIST_ENV = 'PUBLISH_ALLOWLIST'
export const PUBLISH_ACCESS_DENIED_MESSAGE =
  'Upload and import are restricted to approved accounts on this deployment.'

type PublishSubject = {
  userId: Id<'users'>
  handle?: string
  githubLogin?: string
  githubProviderAccountId?: string | null
}

function normalizeIdentifier(value: string | undefined | null) {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

export function parsePublishAllowlist(raw: string | undefined = process.env[PUBLISH_ALLOWLIST_ENV]) {
  return new Set(
    String(raw ?? '')
      .split(/[\s,]+/)
      .map((entry) => normalizeIdentifier(entry))
      .filter((entry): entry is string => Boolean(entry)),
  )
}

export function hasPublishAllowlist() {
  return parsePublishAllowlist().size > 0
}

export function hasPublishAccess(subject: PublishSubject) {
  const allowlist = parsePublishAllowlist()
  if (allowlist.size === 0) return true

  const userId = normalizeIdentifier(subject.userId)
  const handle = normalizeIdentifier(subject.handle)
  const githubLogin = normalizeIdentifier(subject.githubLogin)
  const githubProviderAccountId = normalizeIdentifier(subject.githubProviderAccountId)

  const identifiers = new Set<string>()
  if (userId) identifiers.add(userId)
  if (handle) {
    identifiers.add(handle)
    identifiers.add(`handle:${handle}`)
  }
  if (githubLogin) {
    identifiers.add(githubLogin)
    identifiers.add(`login:${githubLogin}`)
    identifiers.add(`github-login:${githubLogin}`)
  }
  if (githubProviderAccountId) {
    identifiers.add(githubProviderAccountId)
    identifiers.add(`github:${githubProviderAccountId}`)
  }

  for (const identifier of identifiers) {
    if (allowlist.has(identifier)) return true
  }
  return false
}

function assertPublishAccess(subject: PublishSubject) {
  if (!hasPublishAccess(subject)) {
    throw new ConvexError(PUBLISH_ACCESS_DENIED_MESSAGE)
  }
}

async function getGitHubProviderAccountIdByUserId(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  userId: Id<'users'>,
) {
  const account = await ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q) => q.eq('userId', userId).eq('provider', 'github'))
    .unique()
  return account?.providerAccountId ?? null
}

export async function ensurePublishAccessForDb(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  userId: Id<'users'>,
  user?: Pick<Doc<'users'>, '_id' | 'handle' | 'name'> | null,
) {
  if (!hasPublishAllowlist()) return
  const githubProviderAccountId = await getGitHubProviderAccountIdByUserId(ctx, userId)
  assertPublishAccess({
    userId,
    handle: user?.handle,
    githubLogin: user?.name,
    githubProviderAccountId,
  })
}

export async function ensurePublishAccessForAction(
  ctx: Pick<ActionCtx, 'runQuery'>,
  userId: Id<'users'>,
  user?: Pick<Doc<'users'>, '_id' | 'handle' | 'name'> | null,
) {
  if (!hasPublishAllowlist()) return
  const githubProviderAccountId = await ctx.runQuery(
    internal.githubIdentity.getGitHubProviderAccountIdInternal,
    { userId },
  )
  assertPublishAccess({
    userId,
    handle: user?.handle,
    githubLogin: user?.name,
    githubProviderAccountId,
  })
}

export function isPublishAccessDeniedMessage(message: string) {
  return message.trim() === PUBLISH_ACCESS_DENIED_MESSAGE
}
