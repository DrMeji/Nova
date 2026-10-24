/**
 * General coding asks must route create/edit — not web-only or delete.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-coding-routing-artifacts.mjs
 */
import assert from 'node:assert/strict';
import { classifyTurn } from '../src/lib/classifyTurn.ts';

const cli = classifyTurn('Build a node CLI tool that renames files', { workspaceEmpty: true });
assert.equal(cli.kind, 'create', `CLI → create, got ${cli.kind}/${cli.reason}`);

const api = classifyTurn('Build an Express REST API for todos — no frontend', { workspaceEmpty: true });
assert.equal(api.kind, 'create', `API → create, got ${api.kind}/${api.reason}`);

const tests = classifyTurn('Write tests for parser.ts', {
  diskRoot: 'C:\\tmp\\proj',
  projectId: 'proj-1',
});
assert.equal(tests.kind, 'edit', `tests on bound → edit, got ${tests.kind}/${tests.reason}`);
const testsNew = classifyTurn('Write a pytest test suite for the parser module', {});
assert.equal(testsNew.kind, 'create', `tests unbound → create, got ${testsNew.kind}/${testsNew.reason}`);

const dash = classifyTurn('Build a React dashboard for sales metrics on disk', { workspaceEmpty: true });
// May be create or edit depending on micro shell — must not be delete/chat-only refuse
assert.notEqual(dash.kind, 'delete', `dashboard must not delete`);

const scraper = classifyTurn('Build a web scraper for prices', { workspaceEmpty: true });
assert.equal(scraper.kind, 'create', `scraper → create, got ${scraper.kind}/${scraper.reason}`);

const clone = classifyTurn('Build a Trello clone', { workspaceEmpty: true });
assert.equal(clone.kind, 'create', `clone → create, got ${clone.kind}/${clone.reason}`);

const rag = classifyTurn('Build a RAG pipeline over PDFs', { workspaceEmpty: true });
assert.equal(rag.kind, 'create', `RAG → create, got ${rag.kind}/${rag.reason}`);

const softApi = classifyTurn('I need an API', { workspaceEmpty: true });
assert.equal(softApi.kind, 'create', `soft API → create, got ${softApi.kind}/${softApi.reason}`);

const softCli = classifyTurn('Gimme a CLI for renaming', { workspaceEmpty: true });
assert.equal(softCli.kind, 'create', `soft CLI → create, got ${softCli.kind}/${softCli.reason}`);

const plugin = classifyTurn('Build a Vite plugin', { workspaceEmpty: true });
assert.equal(plugin.kind, 'create', `plugin → create, got ${plugin.kind}/${plugin.reason}`);

const processor = classifyTurn('Build a BullMQ job processor', { workspaceEmpty: true });
assert.equal(processor.kind, 'create', `processor → create, got ${processor.kind}/${processor.reason}`);

const engine = classifyTurn('Build a Recommendation engine', { workspaceEmpty: true });
assert.equal(engine.kind, 'create', `engine → create, got ${engine.kind}/${engine.reason}`);

const demo = classifyTurn('Build a Matter.js physics demo', { workspaceEmpty: true });
assert.equal(demo.kind, 'create', `demo → create, got ${demo.kind}/${demo.reason}`);

const ship = classifyTurn('Ship a Cloudflare worker', { workspaceEmpty: true });
assert.equal(ship.kind, 'create', `ship worker → create, got ${ship.kind}/${ship.reason}`);

const bareCli = classifyTurn('coffee inventory CLI', { workspaceEmpty: true });
assert.equal(bareCli.kind, 'create', `bare CLI → create, got ${bareCli.kind}/${bareCli.reason}`);

const bareApi = classifyTurn('shop inventory API', { workspaceEmpty: true });
assert.equal(bareApi.kind, 'create', `bare API → create, got ${bareApi.kind}/${bareApi.reason}`);

const salesDash = classifyTurn('Build a sales dashboard for my shoe store', { workspaceEmpty: true });
assert.equal(salesDash.kind, 'create', `sales dashboard → create, got ${salesDash.kind}/${salesDash.reason}`);

const controlPanel = classifyTurn('Build a control panel for IoT', { workspaceEmpty: true });
assert.equal(controlPanel.kind, 'create', `control panel → create, got ${controlPanel.kind}/${controlPanel.reason}`);

const renameThing = classifyTurn('Make something that renames PDFs', { workspaceEmpty: true });
assert.equal(renameThing.kind, 'create', `rename thing → create, got ${renameThing.kind}/${renameThing.reason}`);

const fineTune = classifyTurn('Fine-tune an LLM', { workspaceEmpty: true });
assert.equal(fineTune.kind, 'create', `fine-tune → create, got ${fineTune.kind}/${fineTune.reason}`);

const darkMode = classifyTurn('Add dark mode to the dashboard', { workspaceEmpty: true });
assert.equal(darkMode.kind, 'edit', `dark mode unbound → edit, got ${darkMode.kind}/${darkMode.reason}`);

const writeLib = classifyTurn('Write me a library for dates', { workspaceEmpty: true });
assert.equal(writeLib.kind, 'create', `write me library → create, got ${writeLib.kind}/${writeLib.reason}`);

const spinWorker = classifyTurn('Spin up a Cloudflare worker', { workspaceEmpty: true });
assert.equal(spinWorker.kind, 'create', `spin worker → create, got ${spinWorker.kind}/${spinWorker.reason}`);

const onlineStore = classifyTurn('Online store for sneakers', { workspaceEmpty: true });
assert.equal(onlineStore.kind, 'create', `online store → create, got ${onlineStore.kind}/${onlineStore.reason}`);

const dashFor = classifyTurn('Dashboard for my shoe store', { workspaceEmpty: true });
assert.equal(dashFor.kind, 'create', `dashboard for → create, got ${dashFor.kind}/${dashFor.reason}`);

const canYouApi = classifyTurn('Can you build an API?', { workspaceEmpty: true });
assert.equal(canYouApi.kind, 'chat', `can you build API? → chat, got ${canYouApi.kind}/${canYouApi.reason}`);

console.log('smoke-coding-routing-artifacts: ok', {
  cli, api, tests, dash, scraper, clone, rag, softApi, softCli, plugin,
  processor, engine, demo, ship, bareCli, bareApi,
  salesDash, controlPanel, renameThing, fineTune, darkMode,
  writeLib, spinWorker, onlineStore, dashFor, canYouApi,
});
