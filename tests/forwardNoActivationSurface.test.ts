import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');

describe('forward runtime activation boundary', () => {
  it('has no package command that can execute the forward candidate service', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const scripts = Object.entries(packageJson.scripts ?? {});

    expect(scripts.some(([name]) => name.includes('forward'))).toBe(false);
    expect(
      scripts.some(([, command]) =>
        command.includes('runForwardCandidateService'),
      ),
    ).toBe(false);
  });

  it('does not register the forward candidate service on either server entry point', () => {
    for (const file of ['src/index.ts', 'src/server.ts']) {
      const source = readFileSync(path.join(repoRoot, file), 'utf8');
      expect(source).not.toContain('runForwardCandidateService');
      expect(source).not.toContain('writeForwardCandidateArtifacts');
    }
  });
});
