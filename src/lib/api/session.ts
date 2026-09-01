/** Build a `DaygleClient` carrying the current session's bearer token. */
import { get } from "svelte/store";
import { auth } from "$lib/stores/auth";
import { DaygleClient } from "./client";

export function client(): DaygleClient {
  return new DaygleClient({ token: get(auth).token ?? undefined });
}
