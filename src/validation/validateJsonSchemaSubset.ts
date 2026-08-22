/**
 * Deterministic validator for the JSON Schema subset used by the frozen
 * Fantasy ↔ Forecast contract artifacts (FFI-1, TIBER-Forecast #182).
 *
 * The repository intentionally has no external JSON Schema dependency, so the
 * contract schemas are constrained to a small, fully supported keyword subset
 * and this validator FAILS CLOSED on anything outside it: an unsupported
 * keyword throws instead of being skipped, so a schema can never silently
 * promise semantics that nothing enforces.
 *
 * Supported keywords: boolean schemas, `type` (object/array/string/number/
 * integer/boolean), `const`, `enum`, `required`, `properties`,
 * `additionalProperties` (boolean only), `minLength`, `pattern`, `minimum`,
 * `maximum`, `minItems`, `maxItems`, `items` (single schema), `oneOf`.
 * Ignored annotations: `$schema`, `$id`, `title`, `description`.
 */

export type JsonSchemaSubset = boolean | JsonSchemaSubsetObject;

export interface JsonSchemaSubsetObject {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  readonly const?: string | number | boolean;
  readonly enum?: ReadonlyArray<string | number | boolean>;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchemaSubset>>;
  readonly additionalProperties?: boolean;
  readonly minLength?: number;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly items?: JsonSchemaSubset;
  readonly oneOf?: readonly JsonSchemaSubset[];
}

const ANNOTATION_KEYWORDS = new Set(['$schema', '$id', 'title', 'description']);

const VALIDATION_KEYWORDS = new Set([
  'type',
  'const',
  'enum',
  'required',
  'properties',
  'additionalProperties',
  'minLength',
  'pattern',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'items',
  'oneOf',
]);

export class UnsupportedJsonSchemaKeywordError extends Error {
  constructor(keyword: string, schemaPath: string) {
    super(
      `Unsupported JSON Schema keyword "${keyword}" at ${schemaPath}. ` +
        'The FFI-1 subset validator fails closed on keywords it cannot enforce.',
    );
    this.name = 'UnsupportedJsonSchemaKeywordError';
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const describeType = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const matchesType = (value: unknown, type: NonNullable<JsonSchemaSubsetObject['type']>): boolean => {
  switch (type) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
  }
};

const assertSupportedKeywords = (schema: JsonSchemaSubsetObject, schemaPath: string): void => {
  for (const keyword of Object.keys(schema)) {
    if (!ANNOTATION_KEYWORDS.has(keyword) && !VALIDATION_KEYWORDS.has(keyword)) {
      throw new UnsupportedJsonSchemaKeywordError(keyword, schemaPath);
    }
  }

  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') {
    throw new UnsupportedJsonSchemaKeywordError('additionalProperties (non-boolean form)', schemaPath);
  }
};

const validateNode = (
  value: unknown,
  schema: JsonSchemaSubset,
  path: string,
  schemaPath: string,
  issues: string[],
): void => {
  if (schema === true) return;
  if (schema === false) {
    issues.push(`${path} is not allowed by this contract.`);
    return;
  }

  assertSupportedKeywords(schema, schemaPath);

  if (schema.oneOf !== undefined) {
    const matching: number[] = [];
    const branchIssues: string[][] = [];
    schema.oneOf.forEach((branch, index) => {
      const collected: string[] = [];
      validateNode(value, branch, path, `${schemaPath}.oneOf[${index}]`, collected);
      branchIssues.push(collected);
      if (collected.length === 0) matching.push(index);
    });

    if (matching.length === 1) {
      // fall through to any sibling keywords below
    } else if (matching.length === 0) {
      issues.push(
        `${path} matches none of the ${schema.oneOf.length} oneOf branches. ` +
          branchIssues.map((list, index) => `[branch ${index}] ${list.join(' | ') || 'no issues recorded'}`).join(' ; '),
      );
    } else {
      issues.push(`${path} ambiguously matches oneOf branches ${matching.join(', ')}; exactly one must match.`);
    }
  }

  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    issues.push(`${path} must be of type ${schema.type}. Received ${describeType(value)}.`);
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    issues.push(`${path} must equal ${JSON.stringify(schema.const)}. Received ${JSON.stringify(value)}.`);
  }

  if (schema.enum !== undefined && !schema.enum.includes(value as string | number | boolean)) {
    issues.push(`${path} must be one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(', ')}. Received ${JSON.stringify(value)}.`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push(`${path} must have at least ${schema.minLength} character(s).`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      issues.push(`${path} must match pattern ${schema.pattern}. Received ${JSON.stringify(value)}.`);
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push(`${path} must be >= ${schema.minimum}. Received ${value}.`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push(`${path} must be <= ${schema.maximum}. Received ${value}.`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push(`${path} must contain at least ${schema.minItems} item(s). Received ${value.length}.`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push(`${path} must contain at most ${schema.maxItems} item(s). Received ${value.length}.`);
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) =>
        validateNode(item, schema.items as JsonSchemaSubset, `${path}[${index}]`, `${schemaPath}.items`, issues),
      );
    }
  }

  if (isPlainObject(value)) {
    for (const requiredKey of schema.required ?? []) {
      if (!(requiredKey in value)) {
        issues.push(`${path}.${requiredKey} is required.`);
      }
    }

    const properties = schema.properties ?? {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) {
        validateNode(value[key], propertySchema, `${path}.${key}`, `${schemaPath}.properties.${key}`, issues);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          issues.push(`${path}.${key} is not a recognized field of this contract and unknown fields are rejected.`);
        }
      }
    }
  }
};

/**
 * Validate a JSON value against a subset schema. Returns the accumulated issue
 * list (empty means valid), matching the style of
 * `src/api/validation/validateScoringRequest.ts`.
 */
export const validateJsonSchemaSubset = (value: unknown, schema: JsonSchemaSubset): string[] => {
  const issues: string[] = [];
  validateNode(value, schema, '$', '#', issues);
  return issues;
};
