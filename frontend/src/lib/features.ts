/**
 * Command-line engines (Claude Code and Codex) run the CLI the user already
 * has installed and signed in. The code stays in the app,
 * but a build can hide it from the interface:
 *
 *   VITE_PHI_CLI_ENGINES=off npm run build
 *
 * Leave the variable unset (as in development) to keep the CLI menu.
 */
export const CLI_ENGINES_ENABLED = import.meta.env.VITE_PHI_CLI_ENGINES !== 'off';
