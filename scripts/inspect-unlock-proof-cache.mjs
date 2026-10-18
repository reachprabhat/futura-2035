import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const client = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const plans = makeFunctionReference("plans:get");
const stories = makeFunctionReference("data:cachedCareer");
const price = makeFunctionReference("planUnlocks:price");
console.log(JSON.stringify({ devPlanPrice: await client.query(price, {}) }));
for (const item of [{ title: "Doctor", gender: "girl" }, { title: "Author", gender: "boy" }]) {
  const [plan, story] = await Promise.all([
    client.query(plans, { title: item.title }),
    client.query(stories, item),
  ]);
  console.log(JSON.stringify({ ...item, planStatus: plan?.status ?? null, months: plan?.plan?.projects?.length ?? 0, taggedMonths: plan?.plan?.projects?.filter(project => project.thumbnailThemeId).length ?? 0, storyPanels: story?.panels?.length ?? 0, panelImages: story?.panels?.filter(panel => panel.imageUrl).length ?? 0 }));
}
