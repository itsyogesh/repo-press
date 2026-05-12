/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authors from "../authors.js";
import type * as categories from "../categories.js";
import type * as collections from "../collections.js";
import type * as crons from "../crons.js";
import type * as documentHistory from "../documentHistory.js";
import type * as documentHistory_restore from "../documentHistory_restore.js";
import type * as documents from "../documents.js";
import type * as explorerOps from "../explorerOps.js";
import type * as folderMeta from "../folderMeta.js";
import type * as githubWebhook from "../githubWebhook.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as mediaAssets from "../mediaAssets.js";
import type * as mediaGallery from "../mediaGallery.js";
import type * as mediaOps from "../mediaOps.js";
import type * as projects from "../projects.js";
import type * as publishBranches from "../publishBranches.js";
import type * as repoAccessCache from "../repoAccessCache.js";
import type * as tags from "../tags.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authors: typeof authors;
  categories: typeof categories;
  collections: typeof collections;
  crons: typeof crons;
  documentHistory: typeof documentHistory;
  documentHistory_restore: typeof documentHistory_restore;
  documents: typeof documents;
  explorerOps: typeof explorerOps;
  folderMeta: typeof folderMeta;
  githubWebhook: typeof githubWebhook;
  http: typeof http;
  "lib/access": typeof lib_access;
  mediaAssets: typeof mediaAssets;
  mediaGallery: typeof mediaGallery;
  mediaOps: typeof mediaOps;
  projects: typeof projects;
  publishBranches: typeof publishBranches;
  repoAccessCache: typeof repoAccessCache;
  tags: typeof tags;
  webhooks: typeof webhooks;
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
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
