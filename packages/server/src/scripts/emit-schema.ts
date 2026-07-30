import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lexicographicSortSchema, printSchema } from 'graphql';
import { schema } from '../adapters/inbound/graphql/schema.js';

/**
 * Emits the SDL to `packages/contracts/schema.graphql`. Run via:
 *
 *   pnpm --filter @wa/server build:schema
 *
 * The output is deterministic (sorted lexicographically) so CI can diff it
 * against the checked-in file to detect drift between Pothos schema code and
 * the contract.
 *
 * See specs/04-graphql-schema.spec.md §SDL export.
 */

const HEADER = `# GENERATED FILE — do not edit by hand.
#
# Emitted by \`pnpm --filter @wa/server build:schema\` from the Pothos schema
# in packages/server/src/adapters/inbound/graphql. Consumed by
# @wa/contracts (codegen) and any external client. See spec 04.
`;

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const outPath = resolve(scriptDir, '../../../contracts/schema.graphql');

const sdl = `${HEADER}\n${printSchema(lexicographicSortSchema(schema))}\n`;
writeFileSync(outPath, sdl, 'utf8');
console.info(`Wrote ${outPath}`);
