import config from "eslint-config-agent";

/**
 * ESLint flat config for prisma-bulk-update.
 *
 * Adopts the shared `eslint-config-agent` ruleset. The published package
 * (3.0.4) only ships the strict default export, so this file applies the same
 * warn-level on-ramp that `eslint-config-agent/incremental` uses: every
 * error-level rule is downgraded to a warning. `eslint` therefore exits 0 (CI
 * stays green) while the full quality backlog is still reported, letting the
 * warnings be burned down before flipping rules back to errors.
 */
const ERROR_LEVELS = new Set(["error", 2]);
const downgrade = (severity) =>
  ERROR_LEVELS.has(severity) ? "warn" : severity;

const toWarnings = (block) => {
  if (block.rules === undefined) {
    return block;
  }

  const rules = Object.fromEntries(
    Object.entries(block.rules).map(([name, value]) =>
      Array.isArray(value)
        ? [name, [downgrade(value[0]), ...value.slice(1)]]
        : [name, downgrade(value)]
    )
  );

  return { ...block, rules };
};

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "snapshots/**",
      "prisma/migrations/**",
    ],
  },
  ...config.map(toWarnings),
];
