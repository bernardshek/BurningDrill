/**
 * Local user stub. Shape mirrors a future Postgres `users` row:
 * { id, display_name, created_at, pack_prefs }
 * Server persistence is intentionally out of scope for this slice.
 */

export type LocalUser = {
  id: string;
  display_name: string | null;
  created_at: string;
  pack_prefs: Record<string, string>;
};

const USER_KEY = "poker-trainer:user";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateLocalUser(): LocalUser {
  if (typeof window === "undefined") {
    return {
      id: "ssr-stub",
      display_name: null,
      created_at: new Date().toISOString(),
      pack_prefs: {},
    };
  }
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalUser;
      if (parsed?.id) return parsed;
    }
  } catch {
    /* ignore */
  }
  const user: LocalUser = {
    id: randomId(),
    display_name: null,
    created_at: new Date().toISOString(),
    pack_prefs: {},
  };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export function updateLocalUser(patch: Partial<LocalUser>): LocalUser {
  const current = getOrCreateLocalUser();
  const next = { ...current, ...patch, id: current.id };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  return next;
}
