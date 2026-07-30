/**
 * Exhaustiveness helper for discriminated-union switches.
 *
 *   switch (x.kind) {
 *     case 'A': return …;
 *     case 'B': return …;
 *     default: return assertNever(x);   // TS error if you add 'C' and forget it here
 *   }
 *
 * Adding a new union member without a matching case turns into a compile
 * error at every callsite — refactor-safe.
 */
export function assertNever(x: never): never {
  throw new Error(`Unreachable: unhandled discriminated-union member ${JSON.stringify(x)}`);
}
