import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { internalMutation, mutation, query } from './functions'
import { requireUser } from './lib/access'
import { toPublicSkill } from './lib/public'
import { applySkillStatDeltas } from './lib/skillStats'

async function patchSkillStars(ctx: MutationCtx, skillId: Id<'skills'>, delta: 1 | -1) {
  const skill = await ctx.db.get(skillId)
  if (!skill) throw new Error('Skill not found')
  await ctx.db.patch(skill._id, applySkillStatDeltas(skill, { stars: delta }))
  return skill
}

export const isStarred = query({
  args: { skillId: v.id('skills') },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx)
    const existing = await ctx.db
      .query('stars')
      .withIndex('by_skill_user', (q) => q.eq('skillId', args.skillId).eq('userId', userId))
      .unique()
    return Boolean(existing)
  },
})

export const toggle = mutation({
  args: { skillId: v.id('skills') },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx)
    const existing = await ctx.db
      .query('stars')
      .withIndex('by_skill_user', (q) => q.eq('skillId', args.skillId).eq('userId', userId))
      .unique()

    if (existing) {
      await ctx.db.delete(existing._id)
      await patchSkillStars(ctx, args.skillId, -1)
      return { starred: false }
    }

    await ctx.db.insert('stars', {
      skillId: args.skillId,
      userId,
      createdAt: Date.now(),
    })
    await patchSkillStars(ctx, args.skillId, 1)

    return { starred: true }
  },
})

export const listByUser = query({
  args: { userId: v.id('users'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50
    const stars = await ctx.db
      .query('stars')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(limit)
    const skills: NonNullable<ReturnType<typeof toPublicSkill>>[] = []
    for (const star of stars) {
      const skill = await ctx.db.get(star.skillId)
      const publicSkill = toPublicSkill(skill)
      if (!publicSkill) continue
      skills.push(publicSkill)
    }
    return skills
  },
})

export const addStarInternal = internalMutation({
  args: { userId: v.id('users'), skillId: v.id('skills') },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('stars')
      .withIndex('by_skill_user', (q) => q.eq('skillId', args.skillId).eq('userId', args.userId))
      .unique()
    if (existing) return { ok: true as const, starred: true, alreadyStarred: true }

    await ctx.db.insert('stars', {
      skillId: args.skillId,
      userId: args.userId,
      createdAt: Date.now(),
    })
    await patchSkillStars(ctx, args.skillId, 1)

    return { ok: true as const, starred: true, alreadyStarred: false }
  },
})

export const removeStarInternal = internalMutation({
  args: { userId: v.id('users'), skillId: v.id('skills') },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('stars')
      .withIndex('by_skill_user', (q) => q.eq('skillId', args.skillId).eq('userId', args.userId))
      .unique()
    if (!existing) return { ok: true as const, unstarred: false, alreadyUnstarred: true }

    await ctx.db.delete(existing._id)
    await patchSkillStars(ctx, args.skillId, -1)

    return { ok: true as const, unstarred: true, alreadyUnstarred: false }
  },
})
