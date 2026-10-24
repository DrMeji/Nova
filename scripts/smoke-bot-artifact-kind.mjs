/**
 * Bot asks must not become static-web landings.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-bot-artifact-kind.mjs
 */
import assert from 'node:assert/strict';
import { resolveArtifactKind } from '../src/lib/createArtifactKind.ts';

assert.equal(resolveArtifactKind('Build a Slack bot'), 'node-cli');
assert.equal(resolveArtifactKind('Build a Discord bot with webhooks'), 'node-api');
assert.equal(resolveArtifactKind('Build an API for a Slack bot'), 'node-api');
assert.equal(resolveArtifactKind('Build a library for a Slack bot'), 'library');
assert.equal(resolveArtifactKind('Build a Twitter bot that posts quotes'), 'node-cli');
assert.equal(resolveArtifactKind('Build a Reddit bot'), 'node-cli');
assert.equal(resolveArtifactKind('Build a Mastodon bot with webhooks'), 'node-api');
assert.equal(resolveArtifactKind('Build a Bluesky bot'), 'node-cli');
assert.equal(resolveArtifactKind('Build a Slack app with slash commands'), 'node-api');
assert.equal(resolveArtifactKind('Build a Discord app with slash commands'), 'node-api');

console.log('smoke-bot-artifact-kind: ok');
