/**
 * Client-side auth state: the bearer token and current user, persisted to
 * localStorage so a reload keeps the session. The token is attached to API
 * requests by constructing a `DaygleClient` with `get(auth).token`.
 */
import { writable } from "svelte/store";
import { browser } from "$app/environment";
import type { User } from "@daygleve/schema";

const STORAGE_KEY = "daygleve.auth";

export interface AuthState {
  token: string | null;
  user: User | null;
}

function initial(): AuthState {
  if (browser) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as AuthState;
    } catch {
      // Ignore malformed/inaccessible storage; fall through to empty state.
    }
  }
  return { token: null, user: null };
}

function createAuthStore() {
  const { subscribe, set } = writable<AuthState>(initial());

  function persist(state: AuthState) {
    if (browser) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Best-effort; a private window may block storage.
      }
    }
    set(state);
  }

  return {
    subscribe,
    signIn(token: string, user: User) {
      persist({ token, user });
    },
    signOut() {
      if (browser) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      }
      set({ token: null, user: null });
    },
  };
}

export const auth = createAuthStore();
