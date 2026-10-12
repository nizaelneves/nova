/**
 * Phi was renamed to Phibe, and every localStorage key went from `phi-*` to `phibe-*`.
 * Copy the old values over once so settings, conversations and workspaces survive the rename.
 * The old keys are left in place (harmless, and a rollback keeps working).
 * Import this module first in each entry point: the store reads localStorage when it loads.
 */
try {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('phi-')) continue;
    const next = `phibe-${key.slice(4)}`;
    if (localStorage.getItem(next) === null) {
      const value = localStorage.getItem(key);
      if (value !== null) localStorage.setItem(next, value);
    }
  }
} catch {
  // storage unavailable (private window, blocked): nothing to migrate
}
