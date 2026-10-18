import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const prodUrl = "https://nautical-chicken-192.convex.cloud";
const adminKey = process.env.PROD_ADMIN_COSTS_KEY;
if (!adminKey || adminKey.length < 32) throw new Error("Set PROD_ADMIN_COSTS_KEY in this PowerShell session before setting production defaults.");
const client = new ConvexHttpClient(prodUrl);
await client.mutation(api.planUnlocks.initializeProductionDefaults, { adminKey });
console.log("Production settings initialized: Plan price ₹199, the default locked-card message, and payment mode free_preview.");
