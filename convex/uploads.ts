import { v } from 'convex/values'
import { internalMutation, mutation } from './functions'
import { requireUser } from './lib/access'
import { ensurePublishAccessForDb } from './lib/publishAccess'

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireUser(ctx)
    await ensurePublishAccessForDb(ctx, userId, user)
    return ctx.storage.generateUploadUrl()
  },
})

export const generateUploadUrlForUserInternal = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user || user.deletedAt || user.deactivatedAt) throw new Error('User not found')
    await ensurePublishAccessForDb(ctx, args.userId, user)
    return ctx.storage.generateUploadUrl()
  },
})
