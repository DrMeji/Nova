/**
 * CLI / API asks must not default to vite-react.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-project-kind-cli.mjs
 */
import assert from 'node:assert/strict';
import { detectProjectKind } from '../src/lib/projectKind.ts';

assert.equal(detectProjectKind('Build a node CLI tool that renames files'), 'node-cli');
assert.equal(detectProjectKind('Create a command-line tool with yargs for batch resize'), 'node-cli');
assert.equal(detectProjectKind('Build an Express REST API for todos — no frontend'), 'node-cli');
assert.equal(detectProjectKind('Write a Python FastAPI service for invoices'), 'python');
assert.equal(detectProjectKind('Build a Vite React dashboard for analytics'), 'vite-react');
assert.equal(detectProjectKind('Invent a standing desk brand website with shop'), 'vite-react');

console.log('smoke-project-kind-cli: ok');
