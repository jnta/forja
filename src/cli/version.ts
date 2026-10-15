/**
 * CLI version, replaced at build time by tsup `define`. When running from
 * source (tests, `node --experimental-strip-types`) the identifier is undeclared
 * and the `typeof` guard keeps the fallback safe.
 */
declare const __FORJA_CLI_VERSION__: string | undefined;

export const CLI_VERSION: string =
  typeof __FORJA_CLI_VERSION__ === "string" && __FORJA_CLI_VERSION__.length > 0
    ? __FORJA_CLI_VERSION__
    : "0.0.0-dev";
