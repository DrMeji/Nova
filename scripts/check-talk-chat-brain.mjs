/**
 * Guard: familiarity talk stays chat; imperative builds create + use coding brain.
 */
import assert from 'node:assert/strict';
import { looksLikeCodeAsk, classifyChatIntent } from '../src/lib/chatIntent.ts';
import { looksLikeTalkBeforeCreateAsk } from '../src/lib/chatIdeaIntent.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { looksLikeBuildStart } from '../src/lib/chatStudio.ts';
import { rankedReadyEngineIds } from '../src/lib/enginePick.ts';

const twitch = 'i want to build a app like twitch tv, Are you familiar with Twitch TV the Streaming platform app';
const discord = 'i want to build a app like discord, are you familiar with Discord';
const buildMe = 'Build me a website';
const scaffold = 'scaffold a chat app now';
const wantBuildNoQ = 'i want to build a Discord-like chat app called PulseCord';
const wantYouBuild = 'I want you to build a todo app';

assert.equal(looksLikeTalkBeforeCreateAsk(discord), true);
assert.equal(looksLikeCodeAsk(discord), false, 'discord talk must not be coding');
assert.equal(classifyChatIntent(discord), 'chat');
assert.equal(classifyTurn(discord).kind, 'chat');

assert.equal(looksLikeTalkBeforeCreateAsk(twitch), true);
assert.equal(looksLikeCodeAsk(twitch), false);
assert.equal(classifyChatIntent(twitch), 'chat');

assert.equal(looksLikeTalkBeforeCreateAsk(wantBuildNoQ), false, 'clear build ask must not stay talk-before');
assert.equal(looksLikeBuildStart(wantBuildNoQ), true);
assert.equal(classifyTurn(wantBuildNoQ).kind, 'create');
assert.equal(classifyChatIntent(wantBuildNoQ), 'coding');

assert.equal(looksLikeTalkBeforeCreateAsk(wantYouBuild), false);
assert.equal(classifyTurn(wantYouBuild).kind, 'create');

assert.equal(looksLikeCodeAsk(buildMe), true);
assert.equal(classifyChatIntent(buildMe), 'coding');
assert.equal(classifyTurn(buildMe).kind, 'create');

assert.equal(looksLikeCodeAsk(scaffold), true);
assert.equal(classifyTurn(scaffold).kind, 'create');

// Bound folder + new named product → create, not edit-on-splash
const boundCreate = classifyTurn(
  'ok lets build this out — create a Discord-like chat web app called FreshCord with servers and channels',
  { diskRoot: 'C:/tmp/old', projectId: 'p1', files: { 'src/App.tsx': 'x'.repeat(50) } },
);
assert.equal(boundCreate.kind, 'create', 'new named Discord create must not become edit on bound folder');

const codingRank = rankedReadyEngineIds(
  [
    { id: 'qwen25-7b', status: 'ready' },
    { id: 'qwen25-coder-7b', status: 'ready' },
  ],
  'coding',
  16,
);
assert.equal(codingRank[0], 'qwen25-coder-7b');
assert.ok(!codingRank.includes('qwen25-7b'), 'coding Auto must not fall through to Instruct');

const codingNoCoder = rankedReadyEngineIds(
  [{ id: 'qwen25-7b', status: 'ready' }],
  'coding',
  16,
);
assert.deepEqual(codingNoCoder, [], 'no coder ready → empty coding list (honest miss)');

// Adaptive: strongest ready coder that fits this PC wins first; smaller stay as failover.
const codingMulti = rankedReadyEngineIds(
  [
    { id: 'qwen25-coder-7b', status: 'ready' },
    { id: 'qwen25-coder-32b', status: 'ready' },
    { id: 'qwen25-coder-14b', status: 'ready' },
    { id: 'qwen25-7b', status: 'ready' },
  ],
  'coding',
  64,
  32,
);
assert.deepEqual(
  codingMulti,
  ['qwen25-coder-32b', 'qwen25-coder-14b', 'qwen25-coder-7b'],
  'strong PC: largest coder first, Instruct excluded',
);

const codingCapped = rankedReadyEngineIds(
  [
    { id: 'qwen25-coder-7b', status: 'ready' },
    { id: 'qwen25-coder-32b', status: 'ready' },
    { id: 'qwen25-coder-14b', status: 'ready' },
  ],
  'coding',
  16,
  7,
);
assert.deepEqual(codingCapped, ['qwen25-coder-7b'], 'weak PC: only 7B when capped at 7B');

console.log('PASS  talk-before stays chat; imperative builds create; adaptive coder-only Auto');
