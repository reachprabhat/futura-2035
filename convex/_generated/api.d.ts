/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as aiControls from "../aiControls.js";
import type * as aiSafety from "../aiSafety.js";
import type * as careerCatalog from "../careerCatalog.js";
import type * as costs from "../costs.js";
import type * as data from "../data.js";
import type * as earnings2030s from "../earnings2030s.js";
import type * as faqs from "../faqs.js";
import type * as funnelMath from "../funnelMath.js";
import type * as gender from "../gender.js";
import type * as imageRetry from "../imageRetry.js";
import type * as legacyStoryboardGenders from "../legacyStoryboardGenders.js";
import type * as libraryActions from "../libraryActions.js";
import type * as photoPrompt from "../photoPrompt.js";
import type * as photoTests from "../photoTests.js";
import type * as planQuality from "../planQuality.js";
import type * as planThumbnailActions from "../planThumbnailActions.js";
import type * as planThumbnails from "../planThumbnails.js";
import type * as planTime from "../planTime.js";
import type * as planUnlocks from "../planUnlocks.js";
import type * as plans from "../plans.js";
import type * as pricing from "../pricing.js";
import type * as releaseAssets from "../releaseAssets.js";
import type * as sceneCatalog from "../sceneCatalog.js";
import type * as sceneLibrary from "../sceneLibrary.js";
import type * as storyKey from "../storyKey.js";
import type * as storyboardErrors from "../storyboardErrors.js";
import type * as thumbnailCatalog from "../thumbnailCatalog.js";
import type * as tracking from "../tracking.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  aiControls: typeof aiControls;
  aiSafety: typeof aiSafety;
  careerCatalog: typeof careerCatalog;
  costs: typeof costs;
  data: typeof data;
  earnings2030s: typeof earnings2030s;
  faqs: typeof faqs;
  funnelMath: typeof funnelMath;
  gender: typeof gender;
  imageRetry: typeof imageRetry;
  legacyStoryboardGenders: typeof legacyStoryboardGenders;
  libraryActions: typeof libraryActions;
  photoPrompt: typeof photoPrompt;
  photoTests: typeof photoTests;
  planQuality: typeof planQuality;
  planThumbnailActions: typeof planThumbnailActions;
  planThumbnails: typeof planThumbnails;
  planTime: typeof planTime;
  planUnlocks: typeof planUnlocks;
  plans: typeof plans;
  pricing: typeof pricing;
  releaseAssets: typeof releaseAssets;
  sceneCatalog: typeof sceneCatalog;
  sceneLibrary: typeof sceneLibrary;
  storyKey: typeof storyKey;
  storyboardErrors: typeof storyboardErrors;
  thumbnailCatalog: typeof thumbnailCatalog;
  tracking: typeof tracking;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
