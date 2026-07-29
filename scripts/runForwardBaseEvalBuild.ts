/**
 * Forecast #168 stage 1: build the governed origin-pair packages.
 *
 * Reads TIBER-Data's promoted `player_season_coverage_v0` READ-ONLY at the
 * pinned commit via `git show`, verifies the promoted artifact hash before any
 * use, derives exact integer-cent generic-PPR targets, and writes the
 * deterministic origin-pair package artifact. No network access, no source
 * mutation, no cross-repository write.
 *
 * Usage:
 *   npx tsx scripts/runForwardBaseEvalBuild.ts --data-repo-root ../TIBER-Data
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH,
  FORWARD_BASE_EVAL_SOURCE_COMMIT,
  FORWARD_BASE_EVAL_SOURCE_SHA256,
  buildOriginPairPackages,
} from '../src/experiments/forwardBaseEval/forwardBaseEvaluation.js';
import { canonicalForwardJsonBytes } from '../src/serialization/canonicalForwardArtifacts.js';

const DEFAULT_GENERATED_AT = '2026-07-28T12:00:00.000Z';
const DEFAULT_OUTPUT = 'data/experiments/forwardBaseEval/forward_base_eval_origin_pairs_v1.json';

const argValue = (flag: string, fallback: string): string => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const dataRepoRoot = path.resolve(argValue('--data-repo-root', '../TIBER-Data'));
const outputPath = path.resolve(argValue('--output', DEFAULT_OUTPUT));
const generatedAt = argValue('--generated-at', DEFAULT_GENERATED_AT);

const raw = execFileSync(
  'git',
  ['-C', dataRepoRoot, 'show', `${FORWARD_BASE_EVAL_SOURCE_COMMIT}:${FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH}`],
  { maxBuffer: 256 * 1024 * 1024 },
);
const actualSha = createHash('sha256').update(raw).digest('hex');
if (actualSha !== FORWARD_BASE_EVAL_SOURCE_SHA256) {
  throw new Error(
    `refusing to build: governed source hash mismatch (expected ${FORWARD_BASE_EVAL_SOURCE_SHA256}, got ${actualSha}).`,
  );
}

const parsed = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
const findRows = (value: unknown, depth = 0): unknown[] | null => {
  if (depth > 3) return null;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'season' in (value[0] as object)) {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      const rows = findRows(child, depth + 1);
      if (rows) return rows;
    }
  }
  return null;
};
const coverageRows = findRows(parsed);
if (!coverageRows) throw new Error('governed source rows not found in pinned artifact.');

const packages = buildOriginPairPackages(coverageRows, generatedAt);
const bytes = canonicalForwardJsonBytes(packages);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, bytes);
console.log(
  `Wrote ${outputPath} (${packages.pairs.map((pair) => `${pair.pair_id}:${pair.row_count}`).join(', ')}) sha256=${createHash('sha256').update(bytes).digest('hex')}`,
);
