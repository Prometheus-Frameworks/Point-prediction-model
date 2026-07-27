import { randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  canonicalForwardJsonBytes,
  canonicalForwardJsonlBytes,
} from '../serialization/canonicalForwardArtifacts.js';
import {
  FORWARD_CANDIDATE_FITTED_MODEL_FILENAME,
  FORWARD_CANDIDATE_MANIFEST_FILENAME,
  FORWARD_CANDIDATE_PLAYER_ROWS_FILENAME,
  type ForwardCandidateBundle,
  type RunForwardCandidateInput,
} from '../services/runForwardCandidateService.js';
import {
  serviceFailure,
  serviceSuccess,
  type ServiceError,
  type ServiceResult,
} from '../services/result.js';
import {
  validateForwardCandidate,
  type ValidateForwardCandidateInput,
} from '../validation/validateForwardCandidate.js';

export interface WriteForwardCandidateArtifactsInput {
  outputDir: string;
  bundle: ForwardCandidateBundle;
  validationContext: RunForwardCandidateInput;
}

export type ForwardCandidateWrittenArtifactKind =
  | 'manifest'
  | 'player_rows'
  | 'fitted_model';

export interface WrittenForwardCandidateArtifact {
  artifact: ForwardCandidateWrittenArtifactKind;
  filename: string;
  path: string;
  content_sha256: string;
  byte_count: number;
}

export interface WriteForwardCandidateArtifactsOutput {
  output_dir: string;
  idempotent_existing_bundle: boolean;
  candidate_only: true;
  promotion_authority: false;
  written_artifacts: readonly WrittenForwardCandidateArtifact[];
}

interface PlannedArtifact {
  artifact: ForwardCandidateWrittenArtifactKind;
  filename: string;
  bytes: Buffer;
  contentSha256: string;
}

interface ExistingArtifact {
  path: string;
  bytes: Buffer | null;
}

const errorDetails = (caught: unknown): unknown =>
  caught instanceof Error
    ? {
        name: caught.name,
        message: caught.message,
        ...('code' in caught && typeof caught.code === 'string'
          ? { code: caught.code }
          : {}),
      }
    : caught;

const readIfPresent = async (artifactPath: string): Promise<ExistingArtifact> => {
  try {
    return { path: artifactPath, bytes: await readFile(artifactPath) };
  } catch (caught) {
    if (
      typeof caught === 'object' &&
      caught !== null &&
      'code' in caught &&
      caught.code === 'ENOENT'
    ) {
      return { path: artifactPath, bytes: null };
    }
    throw caught;
  }
};

const artifactOutput = (
  outputDir: string,
  artifact: PlannedArtifact,
): WrittenForwardCandidateArtifact => ({
  artifact: artifact.artifact,
  filename: artifact.filename,
  path: path.join(outputDir, artifact.filename),
  content_sha256: artifact.contentSha256,
  byte_count: artifact.bytes.byteLength,
});

const bundleConsistencyErrors = (
  bundle: ForwardCandidateBundle,
  validationInput: ValidateForwardCandidateInput,
): ServiceError[] => {
  const errors: ServiceError[] = [];
  const expectedStructuredBytes = {
    manifest: canonicalForwardJsonBytes(bundle.manifest),
    player_rows: canonicalForwardJsonlBytes(bundle.player_rows),
    fitted_model: canonicalForwardJsonBytes(bundle.fitted_model),
  };
  for (const artifact of ['manifest', 'player_rows', 'fitted_model'] as const) {
    if (!expectedStructuredBytes[artifact].equals(bundle.bytes[artifact])) {
      errors.push({
        code: 'FORWARD_CANDIDATE_BUNDLE_OBJECT_BYTES_MISMATCH',
        message: `${artifact} structured value does not match its canonical bundle bytes.`,
      });
    }
  }

  const validation = validateForwardCandidate(validationInput);
  if (
    bundle.hashes.manifest_sha256 !== validation.manifest_sha256 ||
    bundle.hashes.player_rows_sha256 !== validation.player_rows_sha256 ||
    bundle.hashes.fitted_model_sha256 !== validation.fitted_model_sha256
  ) {
    errors.push({
      code: 'FORWARD_CANDIDATE_BUNDLE_HASH_MISMATCH',
      message: 'Bundle hash metadata does not match the supplied artifact bytes.',
      details: {
        declared: bundle.hashes,
        recomputed: {
          manifest_sha256: validation.manifest_sha256,
          player_rows_sha256: validation.player_rows_sha256,
          fitted_model_sha256: validation.fitted_model_sha256,
        },
      },
    });
  }
  if (!validation.valid) {
    errors.push({
      code: 'FORWARD_CANDIDATE_VALIDATION_FAILED',
      message: 'Candidate artifact bundle failed whole-bundle validation before write.',
      details: {
        validator_id: validation.validator_id,
        validator_version: validation.validator_version,
        candidate_only: validation.candidate_only,
        promotion_authority: validation.promotion_authority,
        errors: validation.errors,
      },
    });
  }
  return errors;
};

const removeKnownPath = async (knownPath: string): Promise<void> => {
  try {
    await unlink(knownPath);
  } catch (caught) {
    if (
      typeof caught !== 'object' ||
      caught === null ||
      !('code' in caught) ||
      caught.code !== 'ENOENT'
    ) {
      throw caught;
    }
  }
};

/**
 * Validates the complete byte bundle before touching the destination. Existing
 * official paths are accepted only when all three files exist and are exactly
 * byte-identical; partial or differing output is never repaired or overwritten.
 */
export const writeForwardCandidateArtifacts = async (
  input: WriteForwardCandidateArtifactsInput,
): Promise<ServiceResult<WriteForwardCandidateArtifactsOutput>> => {
  if (
    typeof input.outputDir !== 'string' ||
    input.outputDir.trim().length === 0
  ) {
    return serviceFailure({
      code: 'FORWARD_CANDIDATE_OUTPUT_DIR_INVALID',
      message: 'A non-empty candidate output directory is required.',
    });
  }

  const validationInput: ValidateForwardCandidateInput = {
    manifestBytes: input.bundle.bytes.manifest,
    playerRowsBytes: input.bundle.bytes.player_rows,
    fittedModelBytes: input.bundle.bytes.fitted_model,
    context: input.validationContext,
  };
  let consistencyErrors: ServiceError[];
  try {
    consistencyErrors = bundleConsistencyErrors(
      input.bundle,
      validationInput,
    );
  } catch (caught) {
    return serviceFailure({
      code: 'FORWARD_CANDIDATE_VALIDATION_FAILED',
      message: 'Candidate artifact bundle could not be validated before write.',
      details: errorDetails(caught),
    });
  }
  if (consistencyErrors.length > 0) {
    return serviceFailure(consistencyErrors);
  }

  const outputDir = path.resolve(input.outputDir);
  const planned: PlannedArtifact[] = [
    {
      artifact: 'manifest',
      filename: FORWARD_CANDIDATE_MANIFEST_FILENAME,
      bytes: input.bundle.bytes.manifest,
      contentSha256: input.bundle.hashes.manifest_sha256,
    },
    {
      artifact: 'player_rows',
      filename: FORWARD_CANDIDATE_PLAYER_ROWS_FILENAME,
      bytes: input.bundle.bytes.player_rows,
      contentSha256: input.bundle.hashes.player_rows_sha256,
    },
    {
      artifact: 'fitted_model',
      filename: FORWARD_CANDIDATE_FITTED_MODEL_FILENAME,
      bytes: input.bundle.bytes.fitted_model,
      contentSha256: input.bundle.hashes.fitted_model_sha256,
    },
  ];
  const officialPaths = planned.map((artifact) =>
    path.join(outputDir, artifact.filename));

  try {
    const initialExisting = await Promise.all(
      officialPaths.map(readIfPresent),
    );
    const existingCount = initialExisting.filter(
      (entry) => entry.bytes !== null,
    ).length;
    if (existingCount !== 0 && existingCount !== planned.length) {
      return serviceFailure({
        code: 'FORWARD_CANDIDATE_PARTIAL_OUTPUT_PRESENT',
        message: 'Refusing to write into a partial candidate output bundle.',
        details: {
          present: initialExisting
            .filter((entry) => entry.bytes !== null)
            .map((entry) => path.basename(entry.path)),
          missing: initialExisting
            .filter((entry) => entry.bytes === null)
            .map((entry) => path.basename(entry.path)),
        },
      });
    }
    if (existingCount === planned.length) {
      const mismatched = initialExisting
        .map((entry, index) => ({
          filename: planned[index].filename,
          matches: entry.bytes?.equals(planned[index].bytes) === true,
        }))
        .filter((entry) => !entry.matches)
        .map((entry) => entry.filename);
      if (mismatched.length > 0) {
        return serviceFailure({
          code: 'FORWARD_CANDIDATE_OUTPUT_MISMATCH',
          message: 'Refusing to overwrite an existing non-identical candidate bundle.',
          details: { mismatched },
        });
      }
      return serviceSuccess({
        output_dir: outputDir,
        idempotent_existing_bundle: true,
        candidate_only: true,
        promotion_authority: false,
        written_artifacts: planned.map((artifact) =>
          artifactOutput(outputDir, artifact)),
      });
    }

    await mkdir(outputDir, { recursive: true });

    // Recheck after directory creation so a concurrent writer cannot turn an
    // observed empty destination into an implicit overwrite.
    const afterMkdir = await Promise.all(officialPaths.map(readIfPresent));
    if (afterMkdir.some((entry) => entry.bytes !== null)) {
      return serviceFailure({
        code: 'FORWARD_CANDIDATE_OUTPUT_RACE',
        message: 'Candidate output paths changed while preparing the write; no overwrite was attempted.',
      });
    }

    const transactionId = `${process.pid}-${randomUUID()}`;
    const temporaryPaths = planned.map((artifact) =>
      path.join(outputDir, `.${artifact.filename}.${transactionId}.tmp`));
    const linkedOfficialPaths: string[] = [];
    try {
      for (let index = 0; index < planned.length; index += 1) {
        await writeFile(temporaryPaths[index], planned[index].bytes, {
          flag: 'wx',
        });
      }
      for (let index = 0; index < planned.length; index += 1) {
        await link(temporaryPaths[index], officialPaths[index]);
        linkedOfficialPaths.push(officialPaths[index]);
      }
      await Promise.all(temporaryPaths.map(removeKnownPath));
    } catch (caught) {
      const rollbackErrors: unknown[] = [];
      for (const linkedPath of linkedOfficialPaths) {
        try {
          await removeKnownPath(linkedPath);
        } catch (rollbackError) {
          rollbackErrors.push(errorDetails(rollbackError));
        }
      }
      for (const temporaryPath of temporaryPaths) {
        try {
          await removeKnownPath(temporaryPath);
        } catch (rollbackError) {
          rollbackErrors.push(errorDetails(rollbackError));
        }
      }
      return serviceFailure({
        code: 'FORWARD_CANDIDATE_ARTIFACT_WRITE_FAILED',
        message: 'Failed to commit the validated candidate bundle.',
        details: {
          cause: errorDetails(caught),
          rollback_errors: rollbackErrors,
        },
      });
    }

    return serviceSuccess({
      output_dir: outputDir,
      idempotent_existing_bundle: false,
      candidate_only: true,
      promotion_authority: false,
      written_artifacts: planned.map((artifact) =>
        artifactOutput(outputDir, artifact)),
    });
  } catch (caught) {
    return serviceFailure({
      code: 'FORWARD_CANDIDATE_ARTIFACT_WRITE_FAILED',
      message: 'Failed to inspect or write candidate artifacts.',
      details: errorDetails(caught),
    });
  }
};
