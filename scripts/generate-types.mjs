/**
 * Generate `src/shared/types/openapi.ts` from the backend's exported schema.
 *
 *     npm run types:generate        write the types
 *     npm run types:check           fail if they are out of date
 *
 * ### Why a local generator rather than `openapi-typescript`
 *
 * The full generator brings a dependency tree larger than this application's
 * runtime, to emit types for twelve paths whose shapes are already stable. This
 * reads the same committed schema and emits the same thing, with no dependency
 * and no network.
 *
 * ### The drift rule
 *
 * The backend is the source of truth. `npm run types:check` regenerates and
 * compares; a route added without regenerating is a frontend typed against an
 * API that no longer exists. Run it in CI, and after every backend change:
 *
 *     cd ../unityworks-vision-ai-backend
 *     python scripts/export_openapi.py
 *     cd ../unityworks-vision-ai-frontend
 *     npm run types:generate
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
// The default is a sibling-directory read, which is correct on a developer's
// machine and impossible in CI, where only this repository is checked out.
// UWV_SCHEMA_PATH lets CI point at a schema it fetched from the backend repo at
// a pinned commit — making the contract version an explicit, reviewable fact.
const SCHEMA =
  process.env.UWV_SCHEMA_PATH ??
  join(root, '..', 'unityworks-vision-ai-backend', 'docs', 'api', 'openapi.json');
const OUT = join(root, 'src', 'shared', 'types', 'openapi.ts');

const check = process.argv.includes('--check');

function tsType(schema, components, depth = 0) {
  if (!schema || depth > 8) return 'unknown';
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    const target = components?.[name];
    return target ? tsType(target, components, depth + 1) : 'unknown';
  }
  if (schema.anyOf || schema.oneOf) {
    const parts = (schema.anyOf ?? schema.oneOf).map((s) => tsType(s, components, depth + 1));
    return [...new Set(parts)].join(' | ');
  }
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `Array<${tsType(schema.items, components, depth + 1)}>`;
    case 'object': {
      const props = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      const entries = Object.entries(props);
      if (entries.length === 0) return 'Record<string, unknown>';
      const body = entries
        .map(([key, value]) => {
          const optional = required.has(key) ? '' : '?';
          return `  ${JSON.stringify(key)}${optional}: ${tsType(value, components, depth + 1)};`;
        })
        .join('\n');
      return `{\n${body}\n}`;
    }
    default:
      return 'unknown';
  }
}

function pascal(operationId) {
  return operationId
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function generate(schema) {
  const components = schema.components?.schemas ?? {};
  const lines = [
    '/**',
    ' * GENERATED FILE — do not edit.',
    ' *',
    ' * Source: ../unityworks-vision-ai-backend/docs/api/openapi.json',
    ' * Regenerate: npm run types:generate',
    ' * Verify:     npm run types:check',
    ' */',
    '',
    '/* eslint-disable */',
    '',
    `export const API_PATHS = ${JSON.stringify(Object.keys(schema.paths).sort(), null, 2)} as const;`,
    '',
    'export type ApiPath = (typeof API_PATHS)[number];',
    '',
  ];

  for (const [name, component] of Object.entries(components)) {
    lines.push(`export type ${name} = ${tsType(component, components)};`, '');
  }

  for (const [path, methods] of Object.entries(schema.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const id = operation.operationId ?? `${method}${path}`;
      const ok =
        operation.responses?.['200']?.content?.['application/json']?.schema ??
        operation.responses?.['201']?.content?.['application/json']?.schema;
      lines.push(
        `/** \`${method.toUpperCase()} ${path}\` */`,
        `export type ${pascal(id)}Response = ${ok ? tsType(ok, components) : 'unknown'};`,
        '',
      );
    }
  }

  return lines.join('\n');
}

if (!existsSync(SCHEMA)) {
  console.error(`schema not found: ${SCHEMA}\nRun the backend exporter first.`);
  process.exit(1);
}

const rendered = generate(JSON.parse(readFileSync(SCHEMA, 'utf8')));

if (check) {
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== rendered) {
    console.error('src/shared/types/openapi.ts is out of date. Run: npm run types:generate');
    process.exit(1);
  }
  console.log('openapi types are up to date');
} else {
  writeFileSync(OUT, rendered, 'utf8');
  console.log(`wrote ${OUT}`);
}
