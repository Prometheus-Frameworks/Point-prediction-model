import { describe, expect, it } from 'vitest';
import {
  CanonicalForwardSerializationError,
  canonicalForwardJson,
  canonicalForwardJsonBytes,
  canonicalForwardJsonSha256,
  canonicalForwardJsonlBytes,
  compareForwardCanonicalStrings,
  forwardArtifactSha256,
} from '../src/serialization/canonicalForwardArtifacts.js';

describe('canonical forward-artifact serialization', () => {
  it('sorts nested object keys independently of insertion order while preserving arrays', () => {
    const first = {
      z: [{ second: 2, first: 1 }, 'end'],
      a: { beta: true, alpha: null },
    };
    const second = {
      a: { alpha: null, beta: true },
      z: [{ first: 1, second: 2 }, 'end'],
    };

    const expected =
      '{"a":{"alpha":null,"beta":true},"z":[{"first":1,"second":2},"end"]}';
    expect(canonicalForwardJson(first)).toBe(expected);
    expect(canonicalForwardJson(second)).toBe(expected);
    expect(canonicalForwardJsonSha256(first)).toBe(canonicalForwardJsonSha256(second));
    expect(canonicalForwardJson({ values: [2, 1] })).toBe('{"values":[2,1]}');
  });

  it('uses locale-independent UTF-16 ordering, including integer-like keys', () => {
    expect(['b', '10', '2', 'a'].sort(compareForwardCanonicalStrings)).toEqual([
      '10',
      '2',
      'a',
      'b',
    ]);
    expect(canonicalForwardJson({ 2: 'two', 10: 'ten' })).toBe(
      '{"10":"ten","2":"two"}',
    );
  });

  it('emits UTF-8 without a BOM and with exactly one trailing LF', () => {
    const bytes = canonicalForwardJsonBytes({ text: 'café 🏈' });
    expect(bytes.toString('utf8')).toBe('{"text":"café 🏈"}\n');
    expect([...bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.at(-1)).toBe(0x0a);
    expect(bytes.at(-2)).not.toBe(0x0a);
  });

  it('uses finite ECMAScript number encoding and normalizes negative zero', () => {
    expect(canonicalForwardJson({
      negative_zero: -0,
      passing_yard: 0.04,
      receiving_yard: 0.1,
    })).toBe(
      '{"negative_zero":0,"passing_yard":0.04,"receiving_yard":0.1}',
    );
  });

  it('emits canonical JSONL with one LF per row and zero bytes when empty', () => {
    const bytes = canonicalForwardJsonlBytes([
      { z: 2, a: 1 },
      { id: 'second', values: [2, 1] },
    ]);
    expect(bytes.toString('utf8')).toBe(
      '{"a":1,"z":2}\n{"id":"second","values":[2,1]}\n',
    );
    expect(canonicalForwardJsonlBytes([])).toEqual(Buffer.alloc(0));
  });

  it('hashes exact bytes as lowercase SHA-256', () => {
    const bytes = Buffer.from('forward-artifact\n', 'utf8');
    const digest = forwardArtifactSha256(bytes);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe('ad06d07702068922961bf5cd6ef17faec3d8776c8b8dd6202fb486af55857fad');
  });

  it.each([
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['undefined', undefined],
    ['bigint', BigInt(1)],
    ['function', () => 1],
    ['symbol', Symbol('x')],
    ['Date', new Date('2026-01-01T00:00:00.000Z')],
  ])('rejects %s instead of silently coercing it', (_label, value) => {
    expect(() => canonicalForwardJson({ value })).toThrow(
      CanonicalForwardSerializationError,
    );
  });

  it('rejects sparse arrays, cycles, accessors, symbol keys, and non-enumerable fields', () => {
    const sparse = new Array(2);
    sparse[1] = 'present';

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    const accessor = {};
    Object.defineProperty(accessor, 'value', {
      enumerable: true,
      get: () => 1,
    });

    const symbolKeyed = { valid: true } as Record<PropertyKey, unknown>;
    symbolKeyed[Symbol('hidden')] = true;

    const nonEnumerable = { valid: true };
    Object.defineProperty(nonEnumerable, 'hidden', {
      enumerable: false,
      value: true,
    });

    for (const value of [sparse, cyclic, accessor, symbolKeyed, nonEnumerable]) {
      expect(() => canonicalForwardJson(value)).toThrow(
        CanonicalForwardSerializationError,
      );
    }
  });

  it('rejects non-byte hashing and non-array JSONL input at runtime', () => {
    expect(() =>
      forwardArtifactSha256('not bytes' as unknown as Uint8Array),
    ).toThrow(CanonicalForwardSerializationError);
    expect(() =>
      canonicalForwardJsonlBytes({ row: true } as unknown as readonly unknown[]),
    ).toThrow(CanonicalForwardSerializationError);
  });
});
