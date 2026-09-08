import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The generator's schema location must be overridable.
 *
 * Its default is a sibling-directory read (`../unityworks-vision-ai-backend/...`)
 * which cannot exist in CI, where only one repository is checked out. Without an
 * override, `npm run verify` — and therefore the whole gate — can never run there.
 */
const SCRIPT = join(__dirname, '..', 'scripts', 'generate-types.mjs');

function runGenerator(schemaPath: string): { status: number; stderr: string } {
  try {
    execFileSync('node', [SCRIPT, '--check'], {
      env: { ...process.env, UWV_SCHEMA_PATH: schemaPath },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, stderr: '' };
  } catch (error) {
    const e = error as { status: number; stderr: string };
    return { status: e.status, stderr: e.stderr ?? '' };
  }
}

describe('UWV_SCHEMA_PATH', () => {
  it('is the path the generator reports when it cannot find a schema', () => {
    const missing = join(tmpdir(), 'uwv-no-such-schema.json');
    const { status, stderr } = runGenerator(missing);

    expect(status).toBe(1);
    expect(stderr).toContain(missing);
  });

  it('is read in preference to the sibling default', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uwv-schema-'));
    const schema = join(dir, 'openapi.json');
    writeFileSync(schema, JSON.stringify({ openapi: '3.1.0', paths: {}, components: {} }), 'utf8');

    const { status, stderr } = runGenerator(schema);

    // An empty schema renders types that differ from the committed ones, so
    // --check exits 1 — but with the drift message, proving it READ this file
    // rather than failing to find it.
    expect(status).toBe(1);
    expect(stderr).toContain('out of date');
    expect(stderr).not.toContain('schema not found');
  });
});
