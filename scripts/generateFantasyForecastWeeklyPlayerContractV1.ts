/**
 * Deterministic generator for the frozen FFI-1 weekly-player contract
 * artifacts (TIBER-Forecast #182): two JSON Schemas, seven golden fixtures,
 * and a sha256 manifest under `data/contracts/fantasyForecastWeeklyPlayerV1/`.
 *
 * The single semantic source is `src/contracts/fantasyForecastWeeklyPlayerV1.ts`;
 * this script only performs IO. Determinism: no clock, no randomness, no
 * network — fixture timestamps are pinned constants and the valid response
 * card is produced by the actual scoring services, so repeated runs at the
 * same source produce byte-identical output.
 *
 *   npx tsx scripts/generateFantasyForecastWeeklyPlayerContractV1.ts
 *   npx tsx scripts/generateFantasyForecastWeeklyPlayerContractV1.ts --check   # verify, write nothing
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_V1_DIR,
  buildFantasyForecastWeeklyPlayerContractV1Artifacts,
} from '../src/contracts/fantasyForecastWeeklyPlayerV1.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_V1_DIR);

const checkOnly = process.argv.includes('--check');
const artifacts = buildFantasyForecastWeeklyPlayerContractV1Artifacts();

let drifted = 0;

for (const artifact of artifacts) {
  const target = path.join(OUT_DIR, artifact.relativePath);

  if (checkOnly) {
    const matches = existsSync(target) && readFileSync(target).equals(artifact.bytes);
    if (!matches) {
      drifted += 1;
      console.error(`DRIFT ${artifact.relativePath} (expected sha256 ${artifact.sha256})`);
    } else {
      console.log(`ok    ${artifact.relativePath} sha256 ${artifact.sha256}`);
    }
    continue;
  }

  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, artifact.bytes);
  console.log(`wrote ${artifact.relativePath} sha256 ${artifact.sha256}`);
}

if (checkOnly && drifted > 0) {
  console.error(`${drifted} artifact(s) drifted from the contract source. Re-run the generator.`);
  process.exit(1);
}
