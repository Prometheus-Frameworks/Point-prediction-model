import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  writeForwardCandidateArtifacts,
} from '../src/artifacts/writeForwardCandidateArtifacts.js';
import {
  FORWARD_CANDIDATE_FITTED_MODEL_FILENAME,
  FORWARD_CANDIDATE_MANIFEST_FILENAME,
  FORWARD_CANDIDATE_PLAYER_ROWS_FILENAME,
  runForwardCandidateService,
  type ForwardCandidateBundle,
} from '../src/services/runForwardCandidateService.js';
import { makeSyntheticForwardRuntimeInput } from './fixtures/forwardRuntimeFixtures.js';

const buildSyntheticBundle = (): {
  bundle: ForwardCandidateBundle;
  context: ReturnType<typeof makeSyntheticForwardRuntimeInput>;
} => {
  const context = makeSyntheticForwardRuntimeInput();
  const result = runForwardCandidateService(context);
  if (!result.ok) {
    throw new Error(
      result.errors.map((entry) => `${entry.code}: ${entry.message}`).join('\n'),
    );
  }
  return { bundle: result.data, context };
};

const errorCodes = (
  result: Awaited<ReturnType<typeof writeForwardCandidateArtifacts>>,
): string[] => result.ok ? [] : result.errors.map((entry) => entry.code);

const expectMissing = async (missingPath: string): Promise<void> => {
  await expect(access(missingPath)).rejects.toMatchObject({ code: 'ENOENT' });
};

describe('writeForwardCandidateArtifacts', () => {
  let tempRoot: string;
  let outputDir: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'forward-candidate-writer-'));
    outputDir = path.join(tempRoot, 'candidate');
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('writes the three validated byte streams exactly and repeats idempotently', async () => {
    const { bundle, context } = buildSyntheticBundle();
    const first = await writeForwardCandidateArtifacts({
      outputDir,
      bundle,
      validationContext: context,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data).toMatchObject({
      output_dir: path.resolve(outputDir),
      idempotent_existing_bundle: false,
      candidate_only: true,
      promotion_authority: false,
    });
    expect(first.data.written_artifacts).toHaveLength(3);

    await expect(
      readFile(path.join(outputDir, FORWARD_CANDIDATE_MANIFEST_FILENAME)),
    ).resolves.toEqual(bundle.bytes.manifest);
    await expect(
      readFile(path.join(outputDir, FORWARD_CANDIDATE_PLAYER_ROWS_FILENAME)),
    ).resolves.toEqual(bundle.bytes.player_rows);
    await expect(
      readFile(path.join(outputDir, FORWARD_CANDIDATE_FITTED_MODEL_FILENAME)),
    ).resolves.toEqual(bundle.bytes.fitted_model);

    const second = await writeForwardCandidateArtifacts({
      outputDir,
      bundle,
      validationContext: context,
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.idempotent_existing_bundle).toBe(true);
      expect(second.data.written_artifacts).toEqual(
        first.data.written_artifacts,
      );
    }
  });

  it('refuses to overwrite any member of an existing non-identical bundle', async () => {
    const { bundle, context } = buildSyntheticBundle();
    const first = await writeForwardCandidateArtifacts({
      outputDir,
      bundle,
      validationContext: context,
    });
    expect(first.ok).toBe(true);

    const manifestPath = path.join(
      outputDir,
      FORWARD_CANDIDATE_MANIFEST_FILENAME,
    );
    const tampered = Buffer.from('tampered existing bytes\n');
    await writeFile(manifestPath, tampered);
    const fittedBefore = await readFile(
      path.join(outputDir, FORWARD_CANDIDATE_FITTED_MODEL_FILENAME),
    );

    const attempted = await writeForwardCandidateArtifacts({
      outputDir,
      bundle,
      validationContext: context,
    });
    expect(attempted.ok).toBe(false);
    expect(errorCodes(attempted)).toContain(
      'FORWARD_CANDIDATE_OUTPUT_MISMATCH',
    );
    await expect(readFile(manifestPath)).resolves.toEqual(tampered);
    await expect(
      readFile(path.join(outputDir, FORWARD_CANDIDATE_FITTED_MODEL_FILENAME)),
    ).resolves.toEqual(fittedBefore);
  });

  it('refuses partial official output without filling or changing it', async () => {
    const { bundle, context } = buildSyntheticBundle();
    await mkdir(outputDir, { recursive: true });
    const manifestPath = path.join(
      outputDir,
      FORWARD_CANDIDATE_MANIFEST_FILENAME,
    );
    await writeFile(manifestPath, bundle.bytes.manifest);

    const attempted = await writeForwardCandidateArtifacts({
      outputDir,
      bundle,
      validationContext: context,
    });
    expect(attempted.ok).toBe(false);
    expect(errorCodes(attempted)).toContain(
      'FORWARD_CANDIDATE_PARTIAL_OUTPUT_PRESENT',
    );
    await expect(readFile(manifestPath)).resolves.toEqual(bundle.bytes.manifest);
    await expectMissing(
      path.join(outputDir, FORWARD_CANDIDATE_PLAYER_ROWS_FILENAME),
    );
    await expectMissing(
      path.join(outputDir, FORWARD_CANDIDATE_FITTED_MODEL_FILENAME),
    );
  });

  it('validates the whole bundle before creating the destination', async () => {
    const { bundle, context } = buildSyntheticBundle();
    const invalidBundle: ForwardCandidateBundle = {
      ...bundle,
      bytes: {
        ...bundle.bytes,
        player_rows: bundle.bytes.player_rows.subarray(
          0,
          bundle.bytes.player_rows.length - 1,
        ),
      },
    };

    const attempted = await writeForwardCandidateArtifacts({
      outputDir,
      bundle: invalidBundle,
      validationContext: context,
    });
    expect(attempted.ok).toBe(false);
    expect(errorCodes(attempted)).toEqual(
      expect.arrayContaining([
        'FORWARD_CANDIDATE_BUNDLE_OBJECT_BYTES_MISMATCH',
        'FORWARD_CANDIDATE_BUNDLE_HASH_MISMATCH',
        'FORWARD_CANDIDATE_VALIDATION_FAILED',
      ]),
    );
    await expectMissing(outputDir);
  });

  it('rejects an empty output directory instead of resolving it to the working directory', async () => {
    const { bundle, context } = buildSyntheticBundle();
    const attempted = await writeForwardCandidateArtifacts({
      outputDir: '   ',
      bundle,
      validationContext: context,
    });
    expect(errorCodes(attempted)).toContain(
      'FORWARD_CANDIDATE_OUTPUT_DIR_INVALID',
    );
  });

  it('rejects structured-object or declared-hash drift even when byte streams are valid', async () => {
    const { bundle, context } = buildSyntheticBundle();
    const objectDrift = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        limitations: [...bundle.manifest.limitations, 'caller-only mutation'],
      },
    } as ForwardCandidateBundle;
    const objectAttempt = await writeForwardCandidateArtifacts({
      outputDir,
      bundle: objectDrift,
      validationContext: context,
    });
    expect(errorCodes(objectAttempt)).toContain(
      'FORWARD_CANDIDATE_BUNDLE_OBJECT_BYTES_MISMATCH',
    );
    await expectMissing(outputDir);

    const hashDrift: ForwardCandidateBundle = {
      ...bundle,
      hashes: {
        ...bundle.hashes,
        manifest_sha256: 'f'.repeat(64),
      },
    };
    const hashAttempt = await writeForwardCandidateArtifacts({
      outputDir,
      bundle: hashDrift,
      validationContext: context,
    });
    expect(errorCodes(hashAttempt)).toContain(
      'FORWARD_CANDIDATE_BUNDLE_HASH_MISMATCH',
    );
    await expectMissing(outputDir);
  });
});
