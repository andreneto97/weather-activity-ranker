// graphql-codegen config for @wa/web.
// Reads the canonical SDL from `./schema.graphql` (emitted by Pothos in @wa/server).
// Writes typed operations + fragment-masked helpers into `../web/src/gql/`.
//
// Runs via: `pnpm --filter @wa/contracts codegen`
// Watch mode:  `pnpm --filter @wa/contracts codegen:watch`

import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: './schema.graphql',
  documents: [
    '../web/src/**/*.{ts,tsx,graphql}',
    '!../web/src/gql/**',
    // Pact tests redeclare the query string verbatim (the pact JSON needs the
    // literal SDL). Excluding them avoids codegen's "duplicate operation" error.
    '!../web/src/**/__pacts__/**',
  ],
  generates: {
    '../web/src/gql/': {
      preset: 'client',
      presetConfig: {
        fragmentMasking: { unmaskFunctionName: 'getFragmentData' },
      },
      config: {
        useTypeImports: true,
        scalars: {
          ID: 'string',
        },
      },
    },
  },
  hooks: {
    afterAllFileWrite: ['biome format --write'],
  },
};

export default config;
