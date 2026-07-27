import { createHash } from 'node:crypto';

/**
 * JSON values accepted by the forward-artifact serializer.
 *
 * The public serializer accepts `unknown` so every call still receives runtime
 * validation. This type is provided for callers that want compile-time help.
 */
export type CanonicalForwardJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalForwardJsonValue[]
  | { readonly [key: string]: CanonicalForwardJsonValue };

export class CanonicalForwardSerializationError extends TypeError {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Cannot canonically serialize forward artifact value at ${path}: ${reason}`);
    this.name = 'CanonicalForwardSerializationError';
    this.path = path;
  }
}

/**
 * Locale-independent UTF-16 code-unit ordering. This is also the ordering used
 * for canonical object keys and should be reused for load-bearing artifact IDs.
 */
export const compareForwardCanonicalStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const isPlainObject = (value: object): value is Record<string, unknown> => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const childPath = (path: string, key: string | number): string =>
  typeof key === 'number' ? `${path}[${key}]` : `${path}.${key}`;

const reject = (path: string, reason: string): never => {
  throw new CanonicalForwardSerializationError(path, reason);
};

const assertDataProperty = (value: object, key: string, path: string): PropertyDescriptor => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {
    return reject(path, 'property descriptor is unavailable');
  }
  if (!('value' in descriptor)) {
    return reject(path, 'accessor properties are not canonical JSON values');
  }
  if (!descriptor.enumerable) {
    return reject(path, 'non-enumerable properties are not canonical JSON values');
  }
  return descriptor;
};

const serializeArray = (value: readonly unknown[], path: string, ancestors: WeakSet<object>): string => {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    return reject(path, 'array subclasses are not supported');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return reject(path, 'symbol-keyed properties are not canonical JSON values');
  }

  const enumerableKeys = Object.keys(value);
  if (enumerableKeys.length !== value.length) {
    return reject(path, 'arrays must be dense and may not carry extra enumerable properties');
  }

  const values: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    if (!Object.prototype.hasOwnProperty.call(value, key) || enumerableKeys[index] !== key) {
      return reject(childPath(path, index), 'sparse arrays are not canonical JSON values');
    }
    const descriptor = assertDataProperty(value, key, childPath(path, index));
    values.push(serializeValue(descriptor.value, childPath(path, index), ancestors));
  }

  const expectedOwnKeys = new Set<string>(['length', ...enumerableKeys]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !expectedOwnKeys.has(key)) {
      return reject(path, 'arrays may not carry extra non-index properties');
    }
  }

  return `[${values.join(',')}]`;
};

const serializeObject = (value: Record<string, unknown>, path: string, ancestors: WeakSet<object>): string => {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return reject(path, 'symbol-keyed properties are not canonical JSON values');
  }

  const enumerableKeys = Object.keys(value);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== enumerableKeys.length || ownKeys.some((key) => typeof key !== 'string')) {
    return reject(path, 'objects may only contain enumerable string-keyed properties');
  }

  const keys = [...enumerableKeys].sort(compareForwardCanonicalStrings);
  const fields = keys.map((key) => {
    const propertyPath = childPath(path, key);
    const descriptor = assertDataProperty(value, key, propertyPath);
    return `${JSON.stringify(key)}:${serializeValue(descriptor.value, propertyPath, ancestors)}`;
  });
  return `{${fields.join(',')}}`;
};

const serializeValue = (value: unknown, path: string, ancestors: WeakSet<object>): string => {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        return reject(path, 'numbers must be finite');
      }
      return Object.is(value, -0) ? '0' : JSON.stringify(value);
    case 'undefined':
    case 'bigint':
    case 'function':
    case 'symbol':
      return reject(path, `${typeof value} is not a canonical JSON value`);
    case 'object':
      break;
    default:
      return reject(path, 'unsupported value type');
  }

  if (ancestors.has(value)) {
    return reject(path, 'cyclic references are not supported');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return serializeArray(value, path, ancestors);
    }
    if (!isPlainObject(value)) {
      return reject(path, 'only plain objects and arrays are supported');
    }
    return serializeObject(value, path, ancestors);
  } finally {
    ancestors.delete(value);
  }
};

/** Canonical compact JSON without a trailing newline. */
export const canonicalForwardJson = (value: unknown): string =>
  serializeValue(value, '$', new WeakSet<object>());

/**
 * Canonical UTF-8 JSON artifact bytes: no BOM and exactly one trailing LF.
 */
export const canonicalForwardJsonBytes = (value: unknown): Buffer =>
  Buffer.from(`${canonicalForwardJson(value)}\n`, 'utf8');

/**
 * Canonical UTF-8 JSONL bytes. Caller-supplied row order is preserved; a
 * contract-specific builder must sort semantic rows before calling this
 * function. Non-empty output has exactly one LF per row. Empty output is zero
 * bytes.
 */
export const canonicalForwardJsonlBytes = (rows: readonly unknown[]): Buffer => {
  if (!Array.isArray(rows)) {
    return reject('$', 'JSONL input must be an array of rows');
  }
  if (rows.length === 0) return Buffer.alloc(0);
  return Buffer.from(`${rows.map((row, index) => serializeValue(row, `$[${index}]`, new WeakSet<object>())).join('\n')}\n`, 'utf8');
};

/** Lowercase SHA-256 hex over the exact supplied bytes. */
export const forwardArtifactSha256 = (bytes: Uint8Array): string => {
  if (!(bytes instanceof Uint8Array)) {
    return reject('$', 'SHA-256 input must be a Uint8Array of exact artifact bytes');
  }
  return createHash('sha256').update(bytes).digest('hex');
};

export const canonicalForwardJsonSha256 = (value: unknown): string =>
  forwardArtifactSha256(canonicalForwardJsonBytes(value));
