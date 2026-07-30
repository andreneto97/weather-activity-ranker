/**
 * Exhaustiveness check for discriminated unions.
 * Compile error if a new union member is added and not handled.
 *
 * Example:
 *   switch (result.__typename) {
 *     case 'A': return ...;
 *     case 'B': return ...;
 *     default: return assertNever(result);
 *   }
 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled discriminated-union member: ${JSON.stringify(x)}`);
}
