// @wa/contracts owns the GraphQL SDL (schema.graphql) and the codegen config.
// It has no runtime TypeScript exports of its own — the generated client code
// lives in `packages/web/src/gql/` and is imported from there directly.
//
// This file exists so the package has a valid `main`/`types` entry point and
// TypeScript can compile the workspace with project references.

/** Semver of the schema.graphql file. Bumped when the SDL changes. */
export const CONTRACTS_SCHEMA_VERSION = '0.1.0' as const;
