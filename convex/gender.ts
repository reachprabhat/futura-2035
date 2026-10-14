import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { storyKey } from "./storyKey";
import { legacyImageGenders } from "./legacyStoryboardGenders";
export const genderValidator = v.union(v.literal("girl"), v.literal("boy"), v.literal("unspecified"));
export type Gender = "girl" | "boy" | "unspecified";
export const STORYBOARD_VERSION = "storyboard-photo-v2";
export const genderStoryKey = (title: string, gender?: Gender) => JSON.stringify([STORYBOARD_VERSION, storyKey(title), gender ?? "unspecified"]);
export function storyboardGender(row: { gender?: string; panels: any[] } | null) {
  if (!row) return undefined;
  if (row.gender) return row.gender;
  const images = row.panels.filter(p => p.storageId);
  if (!images.length) return undefined;
  const labels = images.map(p => legacyImageGenders[p.storageId]);
  return labels.every(label => label && label === labels[0]) ? labels[0] : undefined;
}
export async function findStoryboard(ctx: Pick<QueryCtx, "db">, title: string, gender?: Gender) {
  const get = (key: string) => ctx.db.query("storyboards").withIndex("by_key", q => q.eq("key", key)).unique();
  if (gender === "girl" || gender === "boy") {
    return await get(genderStoryKey(title, gender));
  }
  const variants = [await get(genderStoryKey(title)), await get(genderStoryKey(title, "girl")), await get(genderStoryKey(title, "boy"))];
  return variants.find(row => row?.status === "ready") ?? variants.find(row => row?.panels.length) ?? null;
}
