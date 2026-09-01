/** Public API surface of the client library. */
export { DaygleClient, ApiRequestError } from "./client";
export type { ClientOptions } from "./client";

// Re-export the shared schema types so app code can import them from one place:
//   import type { Vm, VmState } from "$lib/api";
export type * from "@daygleve/schema";
