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
import type * as careerCatalog from "../careerCatalog.js";
import type * as costs from "../costs.js";
import type * as data from "../data.js";
import type * as gender from "../gender.js";
import type * as imageRetry from "../imageRetry.js";
import type * as legacyStoryboardGenders from "../legacyStoryboardGenders.js";
import type * as libraryActions from "../libraryActions.js";
import type * as photoPrompt from "../photoPrompt.js";
import type * as photoTests from "../photoTests.js";
import type * as plans from "../plans.js";
import type * as pricing from "../pricing.js";
import type * as sceneCatalog from "../sceneCatalog.js";
import type * as sceneLibrary from "../sceneLibrary.js";
import type * as storyKey from "../storyKey.js";
import type * as storyboardErrors from "../storyboardErrors.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  aiControls: typeof aiControls;
  careerCatalog: typeof careerCatalog;
  costs: typeof costs;
  data: typeof data;
  gender: typeof gender;
  imageRetry: typeof imageRetry;
  legacyStoryboardGenders: typeof legacyStoryboardGenders;
  libraryActions: typeof libraryActions;
  photoPrompt: typeof photoPrompt;
  photoTests: typeof photoTests;
  plans: typeof plans;
  pricing: typeof pricing;
  sceneCatalog: typeof sceneCatalog;
  sceneLibrary: typeof sceneLibrary;
  storyKey: typeof storyKey;
  storyboardErrors: typeof storyboardErrors;
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
