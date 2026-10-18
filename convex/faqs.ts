import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const faqPage = v.union(v.literal("landing"), v.literal("results"));
const faqRow = v.object({
  id: v.id("faqs"), page: faqPage, question: v.string(), answer: v.string(), displayOrder: v.number(),
});
const pageNames = ["landing", "results"] as const;
type FaqPage = typeof pageNames[number];
const seedMarkerKey = "faq-defaults-seeded-v1";

const defaults: { page: FaqPage; question: string; answer: string }[] = [
  {
    page: "landing",
    question: "Does this choose a career for my child?",
    answer: "No. Interests and your hopes are starting points. Projects give your family something to discuss before deciding what to explore next.",
  },
  {
    page: "landing",
    question: "Is this a course or a subscription?",
    answer: "No. The proposed purchase is one 12-month project plan for one pathway, paid once. Live classes and mentoring are not included.",
  },
  {
    page: "results",
    question: "How do my hopes influence the suggestions?",
    answer: "Your hopes, such as earning potential, stability or working abroad, help decide which careers we suggest alongside your child's interests. We do not predict earnings, job security or the chance of working abroad.",
  },
  {
    page: "results",
    question: "How were these possibilities selected?",
    answer: "We match your child's interests and your hopes against potential career paths in the AI age and show the three that fit best. They are starting points to explore, not a skill assessment or a hard prediction.",
  },
];

function requireAdmin(adminKey: string) {
  const expected = process.env.ADMIN_COSTS_KEY;
  if (!expected || adminKey.length < 32 || adminKey !== expected) throw new ConvexError("Admin access required.");
}

async function rowsForPage(ctx: Pick<QueryCtx, "db">, page: FaqPage) {
  return await ctx.db.query("faqs").withIndex("by_page_order", q => q.eq("page", page)).order("asc").take(250);
}

function asFaq(row: { _id: Id<"faqs">; page: FaqPage; question: string; answer: string; displayOrder: number }) {
  return { id: row._id, page: row.page, question: row.question, answer: row.answer, displayOrder: row.displayOrder };
}

function cleanText(question: string, answer: string) {
  const normalizedQuestion = question.trim();
  const normalizedAnswer = answer.trim();
  if (!normalizedQuestion) throw new ConvexError("Enter a FAQ question.");
  if (normalizedQuestion.length > 300) throw new ConvexError("The FAQ question must be 300 characters or fewer.");
  if (!normalizedAnswer) throw new ConvexError("Enter a FAQ answer.");
  if (normalizedAnswer.length > 4000) throw new ConvexError("The FAQ answer must be 4,000 characters or fewer.");
  return { question: normalizedQuestion, answer: normalizedAnswer };
}

export const list = query({
  args: { page: faqPage },
  returns: v.array(faqRow),
  handler: async (ctx, { page }) => (await rowsForPage(ctx, page)).map(asFaq),
});

export const adminList = query({
  args: { adminKey: v.string() },
  returns: v.array(faqRow),
  handler: async (ctx, { adminKey }) => {
    requireAdmin(adminKey);
    const pages = await Promise.all(pageNames.map(page => rowsForPage(ctx, page)));
    return pages.flat().map(asFaq);
  },
});

// Fixed, idempotent defaults: seed once only while the FAQ table is empty.
export const seedDefaults = mutation({
  args: {},
  returns: v.object({ seeded: v.boolean(), inserted: v.number() }),
  handler: async (ctx) => {
    const marker = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", seedMarkerKey)).unique();
    if (marker?.value === "done") return { seeded: false, inserted: 0 };
    const existing = await ctx.db.query("faqs").take(1);
    if (existing.length) {
      if (marker) await ctx.db.patch(marker._id, { value: "done", updatedAt: Date.now() });
      else await ctx.db.insert("appSettings", { key: seedMarkerKey, value: "done", updatedAt: Date.now() });
      return { seeded: false, inserted: 0 };
    }
    for (const [index, faq] of defaults.entries()) {
      await ctx.db.insert("faqs", { ...faq, displayOrder: faq.page === "landing" ? index + 1 : index - 1 });
    }
    if (marker) await ctx.db.patch(marker._id, { value: "done", updatedAt: Date.now() });
    else await ctx.db.insert("appSettings", { key: seedMarkerKey, value: "done", updatedAt: Date.now() });
    return { seeded: true, inserted: defaults.length };
  },
});

export const create = mutation({
  args: { adminKey: v.string(), page: faqPage, question: v.string(), answer: v.string() },
  returns: v.id("faqs"),
  handler: async (ctx, { adminKey, page, question, answer }) => {
    requireAdmin(adminKey);
    const rows = await rowsForPage(ctx, page);
    if (rows.length >= 250) throw new ConvexError("A page can have up to 250 FAQs.");
    const text = cleanText(question, answer);
    return await ctx.db.insert("faqs", { page, ...text, displayOrder: rows.length ? rows[rows.length - 1].displayOrder + 1 : 1 });
  },
});

export const update = mutation({
  args: { adminKey: v.string(), id: v.id("faqs"), question: v.string(), answer: v.string() },
  returns: v.null(),
  handler: async (ctx, { adminKey, id, question, answer }) => {
    requireAdmin(adminKey);
    const faq = await ctx.db.get(id);
    if (!faq) throw new ConvexError("This FAQ no longer exists.");
    await ctx.db.patch(id, cleanText(question, answer));
    return null;
  },
});

export const remove = mutation({
  args: { adminKey: v.string(), id: v.id("faqs") },
  returns: v.null(),
  handler: async (ctx: MutationCtx, { adminKey, id }) => {
    requireAdmin(adminKey);
    const faq = await ctx.db.get(id);
    if (!faq) return null;
    await ctx.db.delete(id);
    const rows = await rowsForPage(ctx, faq.page);
    for (const [index, row] of rows.entries()) {
      if (row.displayOrder !== index + 1) await ctx.db.patch(row._id, { displayOrder: index + 1 });
    }
    return null;
  },
});

export const reorder = mutation({
  args: { adminKey: v.string(), page: faqPage, orderedIds: v.array(v.id("faqs")) },
  returns: v.null(),
  handler: async (ctx: MutationCtx, { adminKey, page, orderedIds }) => {
    requireAdmin(adminKey);
    if (orderedIds.length > 250) throw new ConvexError("A page can have up to 250 FAQs.");
    const rows = await rowsForPage(ctx, page);
    const byId = new Map(rows.map(row => [row._id, row]));
    if (orderedIds.length !== rows.length || new Set(orderedIds).size !== rows.length || orderedIds.some(id => !byId.has(id))) {
      throw new ConvexError("Refresh the FAQ list before changing its order.");
    }
    for (const [index, id] of orderedIds.entries()) {
      const row = byId.get(id)!;
      if (row.displayOrder !== index + 1) await ctx.db.patch(id, { displayOrder: index + 1 });
    }
    return null;
  },
});
