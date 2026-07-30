import { describe, expect, it } from '@jest/globals';
import { assertNever } from './assert-never.js';

describe('assertNever', () => {
  it('throws with the offending value serialised in the message', () => {
    // Cast: real-world callers only hit this after a runtime check drift
    // (new union member, forgotten switch case) — the whole point of the fn.
    expect(() => assertNever({ __typename: 'Unhandled' } as never)).toThrow(
      /Unhandled discriminated-union member.*Unhandled/,
    );
  });
});
