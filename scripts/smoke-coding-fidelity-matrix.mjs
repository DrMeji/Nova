/**
 * Ask → kind → scaffold → evidence matrix (anything, not websites-only).
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-coding-fidelity-matrix.mjs
 */
import assert from 'node:assert/strict';
import { resolveArtifactKind, projectKindFromArtifactKind, isNonWebArtifactKind, stripWebShellFromNonWebFiles } from '../src/lib/createArtifactKind.ts';
import { buildScaffoldFiles, projectUsesNpm } from '../src/lib/projectScaffolds.ts';
import { verifyArtifactFiles } from '../src/lib/artifactEvidence.ts';
import { formatThinCreateCraftRules } from '../src/lib/createThinPath.ts';
import { buildCreateBrief, runReadyAndAssetsCheck, loopWroteNonMetaCode, codingLoopMaxSteps } from '../src/lib/novaBuildLoop.ts';
import { looksLikeTalkBeforeCreateAsk } from '../src/lib/chatIdeaIntent.ts';

const rows = [
  ['Build a node CLI tool for coffee shop inventory', 'node-cli', /bin\/cli/],
  ['Build an Express API for bookings', 'node-api', /src\/server/],
  ['Build a TypeScript library for date math', 'library', /src\/index/],
  ['Write a pytest test suite for the parser', 'test-suite', /tests\/test_/],
  ['Write tests for the parser', 'test-suite', /\.test\./],
  ['Write test cases for the checkout flow', 'test-suite', /\.test\./],
  ['Build a Chrome extension that blocks sites', 'extension', /manifest\.json/],
  ['Build a Firefox extension for tabs', 'extension', /manifest\.json/],
  ['Build an Edge extension for bookmarks', 'extension', /manifest\.json/],
  ['Build an Electron desktop app for notes', 'electron', /electron\/main/],
  ['Build a desktop app for notes', 'electron', /electron\/main/],
  ['Build a Python desktop app with Tkinter', 'python', /requirements|\.py/, /electron\//],
  ['Build a C# desktop app', 'unknown', /README\.md/, /electron\//],
  ['Build a snake game with pygame', 'python', /requirements|\.py/, /src\/App/],
  ['Build a Tkinter todo app', 'python', /requirements|\.py/],
  ['Build a Rust API', 'unknown', /README\.md/, /src\/server/],
  ['Build a Go game', 'unknown', /README\.md/, /src\/App/],
  ['Build a terminal game in Node', 'node-cli', /bin\/cli/],
  ['Build a text adventure game', 'node-cli', /bin\/cli/],
  ['Build a TypeScript library for parsing Rust code', 'library', /src\/index/],
  ['Build a weather app', 'web-app', /src\/App/],
  ['Build a recipe finder', 'web-app', /src\/App/],
  ['Build a notes app', 'web-app', /src\/App/],
  ['Build a portfolio', 'web-app', /src\/App/],
  ['Build a pricing page', 'web-app', /src\/App|index\.html/],
  ['Build a wordle clone', 'web-app', /src\/App/],
  ['Build a Three.js solar system', 'web-app', /src\/App/],
  ['Build a PDF merger web app', 'web-app', /src\/App/],
  ['Build a microservice for payments', 'node-api', /src\/server/],
  ['Build an auth service', 'node-api', /src\/server/],
  ['Build an Android app', 'unknown', /README\.md/, /src\/App/],
  ['Make a canvas snake game', 'game', /src\/App/],
  ['Build a React dashboard for sales', 'web-app', /src\/App/],
  ['Build a landing page for our npm package', 'web-app', /./],
  ['Add a script that renames files', 'node-cli', /bin\/cli/],
  ['Build a game with a leaderboard API', 'game', /src\/App/],
  ['Build a game server with matchmaking', 'node-api', /src\/server/],
  ['Build a Python CLI that renames files', 'python', /requirements|\.py/],
  ['Build a web scraper for product prices', 'python', /requirements|\.py/],
  ['Build a scraper for product prices', 'python', /requirements|\.py/],
  ['Build a Next.js app for analytics', 'web-app', /src\/App/],
  ['Build a Vue app for notes', 'web-app', /src\/App/],
  ['Build a VS Code extension for todo notes', 'extension', /extension\.js/, /manifest\.json/],
  ['Build a UI component library for React', 'library', /src\/index/],
  ['Build a Python library for date math', 'python', /requirements|\.py/, /package\.json/],
  ['Build a Twitter bot that posts quotes', 'node-cli', /bin\/cli/],
  ['Build a bot that posts quotes', 'node-cli', /bin\/cli/],
  ['Build a Slack app with slash commands', 'node-api', /src\/server/],
  ['Build a REST API with a React frontend', 'web-app', /src\/App/],
  ['Build a FastAPI backend with a React frontend', 'web-app', /src\/App/],
  ['Build a fullstack app with Express and React', 'web-app', /src\/App/],
  ['Build an API client for Stripe', 'library', /src\/index/],
  ['Build an SDK for Stripe', 'library', /src\/index/],
  ['Build an Express middleware package', 'library', /src\/index/],
  ['Build a SvelteKit app for notes', 'web-app', /src\/App/],
  ['Build a Go CLI that greps logs', 'unknown', /README\.md/, /index\.html/],
  ['Build a React Native app', 'unknown', /README\.md/, /src\/App/],
  ['Build a gRPC service for users', 'node-api', /src\/server/],
  ['Build a Cloudflare Worker', 'node-cli', /bin\/cli/],
  ['Build a Lambda function for webhooks', 'node-cli', /bin\/cli/],
  ['Build a JWT auth middleware for Express', 'library', /src\/index/],
  ['Build a Playwright scraper', 'node-cli', /bin\/cli/],
  ['Build a Redis cache wrapper', 'library', /src\/index/],
  ['Build a Kafka consumer', 'node-cli', /bin\/cli/],
  ['Build a Tauri desktop app', 'unknown', /README\.md/, /electron\//],
  ['Build a Terraform module for VPC', 'unknown', /README\.md/, /index\.html/],
  ['Build a Docker Compose stack for postgres', 'unknown', /README\.md/, /index\.html/],
  ['Build a GitHub Action that runs tests', 'unknown', /README\.md/, /index\.html/],
  ['Make a thing that renames files', 'node-cli', /bin\/cli/],
  ['I need an API', 'node-api', /src\/server/],
  ['Refactor the CLI to use commander', 'node-cli', /bin\/cli/],
  ['Convert this library to TypeScript', 'library', /src\/index/],
  ['Build a Stripe webhook handler', 'node-api', /src\/server/],
  ['Build a NestJS API', 'node-api', /src\/server/],
  ['Build a tRPC router', 'node-api', /src\/server/],
  ['Build a Zod schema package', 'library', /src\/index/],
  ['Wrap the OpenAI API in a small client', 'library', /src\/index/],
  ['Port this Python script to Node', 'node-cli', /bin\/cli/],
  ['Build a Unity game', 'unknown', /README\.md/, /src\/App/],
  ['Build a Godot game', 'unknown', /README\.md/, /src\/App/],
  ['Build a BullMQ job processor', 'node-cli', /bin\/cli/],
  ['Build an Axios interceptor package', 'library', /src\/index/],
  ['Build a date-fns style utility package', 'library', /src\/index/],
  ['Build a Figma plugin', 'unknown', /README\.md/, /index\.html/],
  ['Build an Obsidian plugin', 'unknown', /README\.md/, /index\.html/],
  ['Build a Raycast extension', 'unknown', /README\.md/, /manifest\.json/],
  ['Build a Tampermonkey userscript', 'unknown', /README\.md/, /manifest\.json/],
  ['Build a WordPress plugin', 'unknown', /README\.md/, /index\.html/],
  ['Build a Capacitor mobile app', 'unknown', /README\.md/, /src\/App/],
  ['Build an Ionic app', 'unknown', /README\.md/, /src\/App/],
  ['Create a tip calculator', 'static-web', /index\.html|App/],
  ['Build a kanban board', 'web-app', /src\/App/],
  ['Build a markdown note editor', 'web-app', /src\/App/],
  ['Build a JSON to CSV converter CLI', 'node-cli', /bin\/cli/],
  ['Build a PDF invoice generator', 'node-cli', /bin\/cli/],
  ['Build a CSV report aggregator', 'node-cli', /bin\/cli/],
  ['Build a HTTP load tester', 'node-cli', /bin\/cli/],
  ['Build a DNS lookup tool', 'node-cli', /bin\/cli/],
  ['Create a stopwatch', 'static-web', /index\.html|App/],
  ['Build a color picker app', 'static-web', /index\.html|App/],
  ['Build a unit converter', 'static-web', /index\.html|App/],
  ['Build a RAG pipeline over PDFs', 'node-cli', /bin\/cli/],
  ['Build an AI agent that books flights', 'node-cli', /bin\/cli/],
  ['Build a local LLM chat UI', 'web-app', /src\/App/],
  ['Build a YOLO object detector', 'python', /requirements|\.py/],
  ['Build a prompt playground', 'web-app', /src\/App/],
  ['Build a Streamlit dashboard for ML metrics', 'python', /requirements|\.py/],
  ['Build a Gradio demo', 'python', /requirements|\.py/],
  ['Build a FastAPI RAG service', 'python', /requirements|\.py/],
  ['Build a LangChain tool', 'node-cli', /bin\/cli/],
  ['Build a vector search service', 'node-cli', /bin\/cli/],
  ['Build a CRM for a dental clinic', 'web-app', /src\/App/],
  ['Build an inventory management system', 'web-app', /src\/App/],
  ['Build a booking system for a salon', 'web-app', /src\/App/],
  ['Build a helpdesk ticket tracker', 'web-app', /src\/App/],
  ['Build a time tracking app', 'web-app', /src\/App/],
  ['Build an expense tracker', 'web-app', /src\/App/],
  ['Build a POS system', 'web-app', /src\/App/],
  ['Build a project management app', 'web-app', /src\/App/],
  ['Build a sudoku puzzle', 'game', /src\/App/],
  ['Build a 2048 clone', 'game', /src\/App/],
  ['Build a flappy bird clone', 'game', /src\/App/],
  ['Build a quiz app', 'web-app', /src\/App/],
  ['Build a habit tracker', 'web-app', /src\/App/],
  ['Build a typing speed test', 'web-app', /src\/App/],
  ['Build a Trello clone', 'web-app', /src\/App/],
  ['Build a Notion clone', 'web-app', /src\/App/],
  ['Build a Spotify clone', 'web-app', /src\/App/],
  ['Build a Slack clone', 'web-app', /src\/App/],
  ['Build a Discord clone', 'web-app', /src\/App/],
  ['Fix bugs in my coffee shop website', 'web-app', /./],
  ['Add dark mode to the dashboard', 'web-app', /src\/App/],
  ['Build a sales dashboard for my shoe store', 'web-app', /src\/App/],
  ['Build a scraper for my coffee shop website', 'python', /requirements|\.py/],
  ['Build a web crawler for prices', 'python', /requirements|\.py/],
  ['Build a 2D platformer', 'game', /src\/App/],
  ['Build an RPG', 'game', /src\/App/],
  ['Build a Vite plugin', 'library', /src\/index/],
  ['Build a Next.js middleware', 'library', /src\/index/],
  ['Build a Vue composable package', 'library', /src\/index/],
  ['Build a Cheerio scraper', 'node-cli', /bin\/cli/],
  ['Build a Colly scraper in Go', 'unknown', /README\.md/, /index\.html/],
  ['Create a Chrome MV3 extension', 'extension', /manifest\.json|extension\.js/],
  ['Gimme a CLI for renaming', 'node-cli', /bin\/cli/],
  ['coffee inventory CLI', 'node-cli', /bin\/cli/],
  ['shop inventory API', 'node-api', /src\/server/],
  ['I need tests for the parser', 'test-suite', /\.test\.|tests\//],
  ['Make something that renames PDFs', 'node-cli', /bin\/cli/],
  ['Ship a Cloudflare worker', 'node-cli', /bin\/cli/],
  ['Build a queue consumer', 'node-cli', /bin\/cli/],
  ['Build a Rails API', 'unknown', /README\.md/, /src\/server/],
  ['Build a Spring Boot API', 'unknown', /README\.md/, /src\/server/],
  ['Build a Gin API in Go', 'unknown', /README\.md/, /src\/server/],
  ['Build a PHP CLI', 'unknown', /README\.md/, /bin\/cli/],
  ['Build a Dockerfile for the API', 'unknown', /README\.md/, /src\/server/],
  ['Build a Redis commander clone', 'web-app', /src\/App/],
  ['Build a control panel for IoT', 'web-app', /src\/App/],
  ['Build a Monaco editor app', 'web-app', /src\/App/],
  ['Create an SDK', 'library', /src\/index/],
  ['Build middleware', 'library', /src\/index/],
  ['Build a trie package', 'library', /src\/index/],
  ['Build a LRU cache package', 'library', /src\/index/],
  ['Build a Scrapy spider', 'python', /requirements|\.py/],
  ['Fine-tune an LLM', 'python', /requirements|\.py/],
  ['Build a cron job that emails reports', 'node-cli', /bin\/cli/],
  ['Build a PDF splitter', 'node-cli', /bin\/cli/],
  ['Build a QR code generator', 'node-cli', /bin\/cli/],
  ['Build a YouTube downloader', 'node-cli', /bin\/cli/],
  ['Build a remark plugin', 'library', /src\/index/],
  ['Build a Pandas ETL script', 'python', /requirements|\.py/],
  ['Build a DuckDB query tool', 'python', /requirements|\.py/],
  ['Build a Dash app', 'python', /requirements|\.py/],
  ['Build a Panel dashboard', 'python', /requirements|\.py/],
  ['Build a TipTap editor', 'web-app', /src\/App/],
  ['Build a Novel editor clone', 'web-app', /src\/App/],
  ['Build a speech-to-text app', 'web-app', /src\/App/],
  ['Build a Stable Diffusion UI', 'web-app', /src\/App/],
  ['Build an OCR pipeline', 'python', /requirements|\.py/],
  ['Build a spam classifier', 'python', /requirements|\.py/],
  ['keyboard macro extension', 'extension', /manifest\.json|extension\.js/],
  ['Make a worker', 'node-cli', /bin\/cli/],
  ['Build a Bun script', 'node-cli', /bin\/cli/],
  ['Build a neural net from scratch', 'python', /requirements|\.py/],
  ['Build a Fuse.js search', 'web-app', /src\/App/],
  ['Build a podcast RSS generator', 'node-cli', /bin\/cli/],
  ['Build a Remix app', 'web-app', /src\/App/],
  ['Build a SolidJS app', 'web-app', /src\/App/],
  ['Build a Qwik app', 'web-app', /src\/App/],
  ['Build a HTMX app', 'web-app', /src\/App/],
  ['Build a Svelte action', 'library', /src\/index/],
  ['Build an IMAP client', 'library', /src\/index/],
  ['Build a MDX compiler', 'library', /src\/index/],
  ['Build a full-text search engine', 'library', /src\/index/],
  ['Build a Git hook', 'node-cli', /bin\/cli/],
  ['Build a pre-commit hook', 'node-cli', /bin\/cli/],
  ['Build a Husky hook', 'node-cli', /bin\/cli/],
  ['Build an email parser', 'node-cli', /bin\/cli/],
  ['Build a Matter.js physics demo', 'web-app', /src\/App/],
  ['Build a Konva canvas editor', 'web-app', /src\/App/],
  ['Build a Fabric.js designer', 'web-app', /src\/App/],
  ['Build a Cesium globe', 'web-app', /src\/App/],
  ['Build a WebXR experience', 'web-app', /src\/App/],
  ['Build an A-Frame VR scene', 'web-app', /src\/App/],
  ['Build a R3F 3D scene', 'web-app', /src\/App/],
  ['Build a Web Audio synth', 'web-app', /src\/App/],
  ['Build a Tone.js drum machine', 'web-app', /src\/App/],
  ['Build a MIDI controller app', 'web-app', /src\/App/],
  ['Build a barcode scanner app', 'web-app', /src\/App/],
  ['Build a recommendation engine', 'python', /requirements|\.py/],
  ['Build a collaborative filter', 'python', /requirements|\.py/],
  ['Build a Geopandas pipeline', 'python', /requirements|\.py/],
  ['Build a Folium map', 'python', /requirements|\.py/],
  ['Build a ComfyUI workflow', 'python', /requirements|\.py/],
  ['Build a Fuse.js search', 'web-app', /src\/App/],
  ['Build a kanban board', 'web-app', /src\/App/],
  ['Build a collaborative filter', 'python', /requirements|\.py/],
  ['Build a Stable Diffusion UI', 'web-app', /src\/App/],
  ['Build a typing speed test', 'web-app', /src\/App/],
  ['Build a Three.js scene', 'web-app', /src\/App/],
  ['Build a TipTap editor', 'web-app', /src\/App/],
  ['Build a Gradio chat interface', 'python', /requirements|\.py/],
  ['Build a vector search service', 'node-cli', /bin\/cli/],
  ['Build a CRM for a dental clinic', 'web-app', /src\/App/],
  ['Wrap the OpenAI API in a small client', 'library', /src\/index/],
  ['Port this Python script to Node', 'node-cli', /bin\/cli/],
  ['Build a Lambda function for webhooks', 'node-cli', /bin\/cli/],
  ['Build a markdown note editor', 'web-app', /src\/App/],
  ['Build a Web Audio synth', 'web-app', /src\/App/],
  ['Build a Panel dashboard', 'python', /requirements|\.py/],
  ['Build a Folium map', 'python', /requirements|\.py/],
  ['Build a Supabase edge function', 'node-cli', /bin\/cli/],
  ['Build a Firebase Cloud Function', 'node-cli', /bin\/cli/],
  ['Build an Azure Function', 'node-cli', /bin\/cli/],
  ['Build a Cypress e2e suite', 'test-suite', /\.test\.|cypress|e2e/],
  ['Build a Discord.js bot', 'node-cli', /bin\/cli/],
  ['Build a Socket.io multiplayer lobby', 'node-api', /src\/server/],
  ['Build a regex tester', 'static-web', /index\.html|App/],
  ['Build a JWT debugger', 'static-web', /index\.html|App/],
  ['Build a Postman clone', 'web-app', /src\/App/],
  ['Build an Excalidraw clone', 'web-app', /src\/App/],
  ['Build a GraphQL playground', 'web-app', /src\/App/],
  ['Build a HTTP client UI like Insomnia', 'web-app', /src\/App/],
  ['Build a GitHub API SDK', 'library', /src\/index/],
  ['Build a Makefile for the project', 'unknown', /README\.md/, /index\.html/],
  ['Build a Snapcraft package', 'unknown', /README\.md/, /src\/index/],
  ['Build a .deb package', 'unknown', /README\.md/, /src\/index/],
  ['Build a Zig CLI', 'unknown', /README\.md/, /bin\/cli/],
  ['Build a .NET Web API', 'unknown', /README\.md/, /src\/server/],
  ['Build a Qt desktop app', 'unknown', /README\.md/, /electron\//],
  ['Build an Ember.js app', 'web-app', /src\/App/],
  ['Build an Angular dashboard', 'web-app', /src\/App/],
  ['Build a poetry project for ETL', 'python', /requirements|\.py/],
  ['Build a Reddit bot with PRAW', 'python', /requirements|\.py/],
  ['Build a YouTube chatbot', 'node-cli', /bin\/cli/],
  ['Build a R Shiny dashboard', 'unknown', /README\.md/, /src\/App/],
  ['Build a Haskell library', 'unknown', /README\.md/, /src\/index/],
  ['Build a gift shop website', 'product-site', /src\/App/],
  ['Build an online store', 'product-site', /src\/App/],
  ['Build a shop', 'web-app', /src\/App/],
  ['Write me a library for dates', 'library', /src\/index/],
  ['Spin up a Cloudflare worker', 'node-cli', /bin\/cli/],
  ['Dashboard for my shoe store', 'web-app', /src\/App/],
  ['CLI for the coffee shop', 'node-cli', /bin\/cli/],
  ['Scraper for Amazon prices', 'python', /requirements|\.py/],
  ['Tests for checkout', 'test-suite', /\.test\.|tests\//],
  // Wave5 lock-in — plugins/hooks/APIs/CLIs must never invent a storefront.
  ['Build a React hook for media queries', 'library', /src\/index/],
  ['Build a Fastify plugin for JWT auth', 'library', /src\/index/],
  ['Build a Prisma middleware for soft deletes', 'library', /src\/index/],
  ['Write a Vue composable for infinite scroll', 'library', /src\/index/],
  ['Create an ESLint plugin that bans console.log', 'library', /src\/index/],
  ['Build a dashboard API with Express', 'node-api', /src\/server/],
  ['Create a Go chi HTTP API for users', 'unknown', /README\.md/, /index\.html/],
  ['Build a webhook receiver for Stripe events', 'node-api', /src\/server/],
  ['write me a worker', 'node-cli', /bin\/cli/],
  ['Write a landing page generator CLI', 'node-cli', /bin\/cli/],
  ['Create a shop inventory CLI', 'node-cli', /bin\/cli/],
  ['Write an API for a store catalog', 'node-api', /src\/server/],
  ['Build a serverless function for email sending', 'node-cli', /bin\/cli/],
  ['Build a GitHub Action that lints PRs', 'unknown', /README\.md/, /index\.html/],
  ['Build a Playwright e2e suite for login', 'test-suite', /\.test\.|e2e|playwright/],
  ['Create a Flutter widget for a login form', 'unknown', /README\.md/, /src\/App/],
  ['Build a React Native screen for a todo list', 'unknown', /README\.md/, /src\/App/],
  ['I want a GraphQL schema and resolvers', 'node-api', /src\/server/],
  ['Build a static site generator as a Node package', 'library', /src\/index/],
  // Wave6 lock-in
  ['Write a Jotai atom package', 'library', /src\/index/],
  ['need a middleware for CORS', 'library', /src\/index/],
  ['I need a Cloudflare worker', 'node-cli', /bin\/cli/],
  ['Implement a rate limiter middleware', 'library', /src\/index/],
  ['Convert this Python scraper to Playwright', 'node-cli', /bin\/cli/],
  ['Refactor the CLI to use yargs', 'node-cli', /bin\/cli/],
  ['Build ESP32 firmware for sensors', 'unknown', /README\.md/, /index\.html/],
  ['Create a Homebrew formula', 'unknown', /README\.md/, /index\.html/],
  ['Write a SwiftUI counter app', 'unknown', /README\.md/, /src\/App/],
  ['Build a Kotlin Compose settings screen', 'unknown', /README\.md/, /src\/App/],
  ['Build a NestJS interceptor for logging', 'library', /src\/index/],
  ['Build a CLI for a gift shop inventory', 'node-cli', /bin\/cli/],
  ['Create an API for an online store catalog', 'node-api', /src\/server/],
  ['Build a scraper for my boutique website', 'python', /requirements|\.py/],
  // Wave7 lock-in
  ['want an Electron notes app', 'electron', /electron\/main/],
  ['Rewrite the scraper in Playwright', 'node-cli', /bin\/cli/],
  ['Create a webhook for Stripe checkout events', 'node-api', /src\/server/],
  ['Build a Tauri notepad', 'unknown', /README\.md/, /electron\//],
  ['queue consumer', 'node-cli', /bin\/cli/],
  ['auth middleware', 'library', /src\/index/],
  ['vitest suite', 'test-suite', /\.test\.|tests\//],
  ['discord bot', 'node-cli', /bin\/cli/],
  ['Build a CLI that syncs Shopify inventory', 'node-cli', /bin\/cli/],
];

for (const [ask, want, pathRe, notPathRe] of rows) {
  const kind = resolveArtifactKind(ask);
  assert.equal(kind, want, `${ask} → ${kind} (want ${want})`);
  const pk = projectKindFromArtifactKind(kind);
  const files = buildScaffoldFiles(pk, { name: 'X', summary: ask, artifactKind: kind });
  const map = Object.fromEntries(files.map((f) => [f.path.replace(/\\/g, '/'), f.content]));
  const paths = Object.keys(map).join(',');
  assert.match(paths, pathRe, `${ask} scaffold ${paths}`);
  if (notPathRe) assert.doesNotMatch(paths, notPathRe, `${ask} scaffold must not include ${notPathRe}`);
  if (kind === 'electron') {
    const finalEv = verifyArtifactFiles(map, kind, { requireImplementation: true });
    assert.equal(finalEv.runOk, false, `${ask} electron seed must fail final: ${finalEv.runDetail}`);
  }
  if (isNonWebArtifactKind(kind) || kind === 'unknown') {
    if (isNonWebArtifactKind(kind)) {
      const ev = verifyArtifactFiles(map, kind);
      assert.equal(ev.runOk, true, `${ask} evidence: ${ev.runDetail}`);
      // Seed scaffolds are structural, not shippable: final Ready must reject no-op
      // main(), /health-only servers, and tautological python tests.
      const finalEv = verifyArtifactFiles(map, kind, { requireImplementation: true });
      if (kind === 'node-cli' || kind === 'node-api' || kind === 'python' || kind === 'library' || kind === 'test-suite' || kind === 'extension' || kind === 'game') {
        assert.equal(finalEv.runOk, false, `${ask} final evidence must reject scaffold: ${finalEv.runDetail}`);
      } else {
        assert.equal(finalEv.runOk, true, `${ask} final evidence: ${finalEv.runDetail}`);
      }
    }
    const craft = formatThinCreateCraftRules({ brief: ask, productName: 'X', artifactKind: kind }).join('\n');
    assert.match(craft, /CODING CREATE|Electron shell/i, `${ask} craft must be coding (not React web)`);
    assert.doesNotMatch(craft, /ALWAYS write src\/App\.jsx/i, `${ask} craft must not force App.jsx`);
  }
}

{
  const strict = (files, kind) => verifyArtifactFiles(files, kind, { requireImplementation: true });
  // Extension final gate rejects seed stubs; real tab/editor logic passes.
  {
    const mv3Seed = Object.fromEntries(
      buildScaffoldFiles('unknown', {
        name: 'Block',
        summary: 'Build a Chrome extension that blocks sites',
        artifactKind: 'extension',
      }).map((f) => [f.path.replace(/\\/g, '/'), f.content]),
    );
    assert.equal(strict(mv3Seed, 'extension').runOk, false, 'MV3 seed fails final evidence');
    assert.equal(strict({
      ...mv3Seed,
      'background.js': "chrome.runtime.onInstalled.addListener(() => { console.log('Block installed'); });\n",
    }, 'extension').runOk, false, 'changed log string still fails final evidence');
    const realBg = `chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === 'complete' && /blocked\\.example/.test(tab.url || '')) {
    chrome.tabs.remove(id);
  }
  if (tab && tab.title && tab.title.includes('spam')) {
    chrome.tabs.update(id, { muted: true });
  }
});
`;
    assert.equal(strict({ ...mv3Seed, 'background.js': realBg }, 'extension').runOk, true, 'tabs.onUpdated logic passes final evidence');
    const slashInUrlBg = `const u = 'https://x.com//p';
chrome.tabs.query({}, (t) => {
  if (t.length) chrome.tabs.remove(t[0].id);
});
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === 'complete' && String(tab.url || '').startsWith(u)) {
    chrome.tabs.update(id, { muted: true });
  }
});
`;
    assert.equal(strict({ ...mv3Seed, 'background.js': slashInUrlBg }, 'extension').runOk, true, '// inside URL string does not hide chrome.tabs');
    const contentOnlyMan = JSON.stringify({
      manifest_version: 3,
      name: 'Highlight',
      version: '0.1.0',
      content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }],
    }, null, 2);
    const contentJs = `const words = ['todo', 'fixme'];
for (const el of document.querySelectorAll('p, span, li')) {
  const text = el.textContent || '';
  if (words.some((w) => text.toLowerCase().includes(w))) {
    el.style.outline = '2px solid orange';
    el.setAttribute('data-nova-hit', '1');
  }
}
`;
    assert.equal(strict({
      'package.json': '{"name":"highlight"}',
      'manifest.json': contentOnlyMan,
      'content.js': contentJs,
    }, 'extension').runOk, true, 'content-script-only MV3 with DOM edits passes final evidence');
    const swMan = JSON.stringify({
      manifest_version: 3,
      name: 'SW',
      version: '0.1.0',
      background: { service_worker: 'service_worker.js' },
    }, null, 2);
    assert.equal(strict({
      'package.json': '{"name":"sw"}',
      'manifest.json': swMan,
      'service_worker.js': realBg,
    }, 'extension').runOk, true, 'manifest service_worker.js with tabs.onUpdated passes final evidence');
    assert.equal(strict({
      'package.json': '{"name":"sw"}',
      'manifest.json': swMan,
    }, 'extension').runOk, false, 'manifest declaring missing service_worker fails structural');
    const forEachContent = `document.querySelectorAll('p, li, span').forEach((el) => {
  const raw = String(el.textContent || '');
  el.textContent = raw.replace(/\\bfixme\\b/gi, 'FIXED').replace(/\\btodo\\b/gi, 'DONE');
  el.classList.add('nova-patched');
  el.setAttribute('data-nova', '1');
});
document.querySelectorAll('a[href]').forEach((a) => {
  if (!a.rel) a.rel = 'noopener';
});
`;
    assert.equal(strict({
      'package.json': '{"name":"highlight"}',
      'manifest.json': contentOnlyMan,
      'content.js': forEachContent,
    }, 'extension').runOk, true, 'content script querySelectorAll+forEach passes final evidence');
    const vsSeed = Object.fromEntries(
      buildScaffoldFiles('unknown', {
        name: 'TodoExt',
        summary: 'Build a VS Code extension for todo notes',
        artifactKind: 'extension',
      }).map((f) => [f.path.replace(/\\/g, '/'), f.content]),
    );
    assert.equal(strict(vsSeed, 'extension').runOk, false, 'VS Code seed fails final evidence');
    const vsReal = `const vscode = require('vscode');
function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('nova.hello', () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed) return;
    const doc = ed.document;
    const text = doc.getText();
    if (text.includes('TODO')) {
      ed.edit((b) => b.insert(new vscode.Position(0, 0), '// reviewed\\n'));
    }
  }));
}
function deactivate() {}
module.exports = { activate, deactivate };
`;
    assert.equal(strict({ ...vsSeed, 'extension.js': vsReal }, 'extension').runOk, true, 'VS Code editor edit logic passes final evidence');
  }
  {
    const electronSeed = Object.fromEntries(
      buildScaffoldFiles('vite-react', {
        name: 'Notes',
        summary: 'Build an Electron desktop app for notes',
        artifactKind: 'electron',
      }).map((f) => [f.path.replace(/\\/g, '/'), f.content]),
    );
    assert.equal(strict(electronSeed, 'electron').runOk, false, 'electron seed fails final evidence');
    assert.equal(strict({
      ...electronSeed,
      'electron/main.cjs': `${electronSeed['electron/main.cjs'] || ''}
const { ipcMain } = require('electron');
const fs = require('fs');
ipcMain.handle('notes:save', async (_e, text) => { fs.writeFileSync('notes.txt', String(text || '')); return true; });
`,
    }, 'electron').runOk, true, 'electron ipcMain.handle passes final evidence');
    assert.equal(strict({
      ...electronSeed,
      'electron/preload.cjs': "const { contextBridge, ipcRenderer } = require('electron');\ncontextBridge.exposeInMainWorld('api', { save: (t) => ipcRenderer.invoke('save', t) });\n",
    }, 'electron').runOk, true, 'electron preload invoke bridge passes final evidence');
    const rendererCalc = `import { useState } from 'react';
export default function App() {
  const [n, setN] = useState(0);
  const [mem, setMem] = useState(0);
  return (
    <div className="calc">
      <button type="button" onClick={() => setN((x) => x + 1)}>+1</button>
      <button type="button" onClick={() => setN((x) => x - 1)}>-1</button>
      <button type="button" onClick={() => { setMem(n); setN(0); }}>MC</button>
      <p>value {n} mem {mem}</p>
      <button type="button" onClick={() => setN(mem)}>MR</button>
    </div>
  );
}
`;
    assert.equal(strict({
      ...electronSeed,
      'src/App.jsx': rendererCalc,
    }, 'electron').runOk, true, 'electron renderer-only calculator logic passes final evidence');
    assert.equal(strict({
      'package.json': '{"name":"notes","main":"main.js"}',
      'main.js': "const { app, BrowserWindow, ipcMain } = require('electron');\nconst fs = require('fs');\nipcMain.handle('save', (_e, t) => { fs.writeFileSync('n.txt', String(t||'')); return true; });\napp.whenReady().then(() => new BrowserWindow({ width: 800, height: 600 }));\n",
      'preload.js': "const { contextBridge, ipcRenderer } = require('electron');\ncontextBridge.exposeInMainWorld('api', { save: (t) => ipcRenderer.invoke('save', t) });\n",
    }, 'electron').runOk, true, 'root main.js with ipcMain passes final evidence');
  }
{
  const { unknownHasRealSource } = await import('../src/lib/novaBuildLoop.ts');
  const readmeOnly = await runReadyAndAssetsCheck({ 'README.md': '# Go service\n' }, 'X', 'Build a Go API', [], 'unknown');
  assert.equal(readmeOnly.ok, false, 'unknown README-only fails Ready');
  assert.equal(unknownHasRealSource({ 'README.md': '# x\n', 'go.mod': 'module x\n' }, 'Build a Go API'), false, 'go.mod-only is not real source');
  assert.equal(unknownHasRealSource({
    'README.md': '# x\n',
    'main.go': 'package main\n\nfunc main() {\n  println("hi from server")\n}\n',
  }, 'Build a Go API'), true, 'Go main with body is real source');
  const tauriOk = await runReadyAndAssetsCheck({
    'README.md': '# Tauri\n',
    'index.html': '<html></html>\n',
    'src-tauri/src/main.rs': 'fn main() {}\n',
  }, 'X', 'Build a Tauri desktop app', [], 'unknown');
  assert.equal(tauriOk.ok, true, 'unknown Tauri with index.html + src-tauri passes Ready');
  assert.equal(loopWroteNonMetaCode({
    updated: ['src/server.js'],
    steps: [{ tool: 'write', ok: true, detail: 'src/server.js' }],
  }), true, 'round0 non-meta write counts');
  assert.equal(loopWroteNonMetaCode({
    updated: ['package.json'],
    steps: [{ tool: 'patch', ok: true, detail: 'package.json' }],
  }), false, 'package.json-only round does not count as code write');
  assert.equal(loopWroteNonMetaCode({
    updated: ['go.mod'],
    steps: [{ tool: 'write', ok: true, detail: 'go.mod' }],
  }), false, 'go.mod-only write does not count as code write');
}
  {
    const gameSeed = Object.fromEntries(
      buildScaffoldFiles('vite-react', {
        name: 'Snake',
        summary: 'Make a canvas snake game',
        artifactKind: 'game',
      }).map((f) => [f.path.replace(/\\/g, '/'), f.content]),
    );
    assert.equal(strict(gameSeed, 'game').runOk, false, 'game seed fails final evidence');
    const canvasLoop = `${gameSeed['src/App.jsx'] || ''}
export function play(canvas) {
  const ctx = canvas.getContext('2d');
  let x = 0;
  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillRect(x, 40, 20, 20);
    x = (x + 2) % canvas.width;
    requestAnimationFrame(loop);
  }
  loop();
}
`;
    assert.equal(strict({ ...gameSeed, 'src/App.jsx': canvasLoop }, 'game').runOk, true, 'canvas requestAnimationFrame loop passes final evidence');
  }
  assert.equal(strict({
    'package.json': '{"name":"coffee","bin":{"coffee":"bin/cli.js"}}',
    'bin/cli.js': "#!/usr/bin/env node\nconst re = 'a//b';\nif (process.argv[2]) console.log(re);\n" + '// pad so entry stays long enough for evidence\n'.repeat(8),
  }, 'node-cli').runOk, true, '// inside string does not hide process.argv');
  assert.equal(strict({
    'package.json': '{"name":"stub","bin":{"stub":"bin/cli.js"}}',
    'bin/cli.js': "#!/usr/bin/env node\nconsole.log('hi');\n// process.argv[2] is documented only\n",
  }, 'node-cli').runOk, false, 'real // comment still hides process.argv from evidence');
  assert.equal(strict({
    'package.json': '{"name":"coffee","bin":{"coffee":"bin/cli.js"}}',
    'bin/cli.js': '#!/usr/bin/env node\nconst item = process.argv[2] || "beans";\nconsole.log(item);\n',
  }, 'node-cli').runOk, true, 'real CLI logic passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"rename","type":"module","scripts":{"start":"node bin/cli.js"}}',
    'bin/cli.js': "#!/usr/bin/env node\nconst fs = require('fs');\nconst path = require('path');\nif (process.argv.length < 4) process.exit(1);\nfs.renameSync(process.argv[2], process.argv[3]);\n",
  }, 'node-cli').runOk, false, 'require() under type:module fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"rename","type":"module","scripts":{"start":"node bin/cli.js"}}',
    'bin/cli.js': "#!/usr/bin/env node\nimport fs from 'node:fs';\nimport path from 'node:path';\nif (process.argv.length < 4) process.exit(1);\nfs.renameSync(process.argv[2], process.argv[3]);\n",
  }, 'node-cli').runOk, true, 'import under type:module passes final evidence');
  {
    const contaminated = {
      'package.json': '{"name":"cli","type":"module","scripts":{"start":"node bin/cli.js"}}',
      'bin/cli.js': "#!/usr/bin/env node\nimport fs from 'node:fs';\nfs.renameSync(process.argv[2], process.argv[3]);\n",
      'src/App.jsx': 'export default function App(){return <div/>}',
      'vite.config.js': 'export default {}',
      'index.html': '<div id="root"></div>',
    };
    const cleaned = stripWebShellFromNonWebFiles(contaminated, 'node-cli');
    assert.equal(Boolean(cleaned['src/App.jsx']), false, 'strip drops App.jsx from node-cli');
    assert.equal(Boolean(cleaned['vite.config.js']), false, 'strip drops vite.config from node-cli');
    assert.equal(Boolean(cleaned['bin/cli.js']), true, 'strip keeps bin/cli.js');
  }
  assert.equal(strict({
    'package.json': '{"name":"coffee","bin":{"coffee":"bin/cli.js"}}',
    'bin/cli.js': '#!/usr/bin/env node\nimport { run } from "./run.js";\nrun();\n',
    'bin/run.js': 'export function run() { console.log(process.argv.slice(2)); }\n',
  }, 'node-cli').runOk, true, 'thin local CLI wrapper passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"coffee","bin":{"coffee":"bin/cli.js"}}',
    'bin/cli.js': '#!/usr/bin/env node\nimport { run } from "./run.js";\nrun();\n',
  }, 'node-cli').runOk, false, 'thin wrapper without local target fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"coffee","bin":{"coffee":"bin/cli.js"}}',
    'bin/cli.js': '#!/usr/bin/env node\nimport { run } from "./lib/index.js";\nrun();\n',
    'bin/lib/index.js': 'export function run() { console.log(process.argv.slice(2)); }\n',
  }, 'node-cli').runOk, true, 'thin wrapper importing ./lib/index.js passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"coffee","bin":{"coffee":"bin/cli.js"}}',
    'bin/cli.js': '#!/usr/bin/env node\nimport { run } from "./run.js";\nrun();\n',
    'bin/run.ts': 'export function run() { console.log(process.argv.slice(2)); }\n',
  }, 'node-cli').runOk, true, 'thin wrapper ./run.js resolves to bin/run.ts');
  assert.equal(strict({
    'package.json': '{"name":"worker","bin":{"worker":"bin/cli.js"}}',
    'bin/cli.js': '#!/usr/bin/env node\nconsole.log("worker cli");\n',
  }, 'node-cli').runOk, false, 'CLI seed stub alone fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"worker","bin":{"worker":"bin/cli.js"}}',
    'bin/cli.js': '#!/usr/bin/env node\nconsole.log("worker cli");\n',
    'src/worker.js': "export default { async fetch(req) { if (req.method === 'POST') { return new Response('ok'); } return new Response('hi'); } };\n",
  }, 'node-cli').runOk, true, 'CLI host + Cloudflare-style worker fetch passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"lambda","bin":{"lambda":"bin/cli.js"}}',
    'bin/cli.js': '#!/usr/bin/env node\nconsole.log("lambda cli");\n',
    'src/handler.js': 'exports.handler = async (event) => { if (!event) return {}; return { statusCode: 200, body: JSON.stringify(event) }; };\n',
  }, 'node-cli').runOk, true, 'CLI host + Lambda handler passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"tiny","bin":{"tiny":"bin/cli.js"}}',
    'bin/cli.js': '#!/usr/bin/env node\nconsole.log("tiny cli");\n',
    'src/util.js': 'const x = 1;\n',
  }, 'node-cli').runOk, false, 'tiny util without export fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"bot","scripts":{"start":"node src/bot.js"}}',
    'src/bot.js': 'const token = process.env.BOT_TOKEN;\nfor (const ch of ["a", "b"]) {\n  if (token) console.log(ch, token.slice(0, 4));\n}\n',
  }, 'node-cli').runOk, true, 'scripts.start → src/bot.js with real logic passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"bot","scripts":{"start":"node src/bot.js"}}',
  }, 'node-cli').runOk, false, 'scripts.start with missing src/bot.js fails structural');
  assert.equal(strict({
    'package.json': '{"name":"bot","bin":{"bot":"bin/cli.js"},"scripts":{"start":"node src/bot.js"}}',
    'bin/cli.js': '#!/usr/bin/env node\nconsole.log("bot cli");\n',
    'src/bot.js': 'client.on("ready", () => {});\nclient.login(process.env.TOKEN);\n',
  }, 'node-cli').runOk, true, 'seed bin left + start bot with .login passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"cli","bin":{"cli":"dist/main.js"}}',
    'src/main.ts': 'const a = process.argv.slice(2);\nif (a[0]) console.log(a.join(" "));\n',
  }, 'node-cli').runOk, true, 'bin→dist/main.js maps to src/main.ts with argv');
  assert.equal(strict({
    'package.json': '{"name":"cli","bin":{"cli":"dist/cli.js"}}',
    'src/cli.ts': 'console.log("hi");\n',
  }, 'node-cli').runOk, false, 'bin→dist with console.log-only src fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"api"}',
    'src/server.js': 'app.get("/health", () => {});\napp.get("/bookings", () => {});\napp.listen(3000);\n',
  }, 'node-api').runOk, true, 'API with a real endpoint passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"api"}',
    'src/server.js': 'app.get("/bookings", () => {});\n',
  }, 'node-api').runOk, false, 'API routes without .listen() fail final evidence');
  assert.equal(verifyArtifactFiles({
    'package.json': '{"name":"api"}',
    'src/server.js': 'app.get("/health", () => {});\n',
  }, 'node-api').runOk, true, 'Express /health seed still passes structural gate');
  assert.equal(strict({
    'package.json': '{"name":"api"}',
    'src/server.js': 'app.get("/health", () => {});\n',
  }, 'node-api').runOk, false, 'Express /health-only seed fails final gate');
  assert.equal(strict({
    'package.json': '{"name":"api"}',
    'src/server.js': "import { Router } from 'express';\nconst routes = Router();\nroutes.get('/health', () => {});\nroutes.get('/bookings', () => {});\nexport default routes;\nconst app = { listen() {} };\napp.listen(3000);\n",
  }, 'node-api').runOk, true, 'routes.get /health + bookings passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"api"}',
    'src/server.js': "import express from 'express';\nimport healthRouter from './routes/health.js';\nconst app = express();\napp.use('/health', healthRouter);\napp.get('/bookings', () => {});\napp.listen(3000);\n",
    'src/routes/health.js': "import { Router } from 'express';\nconst router = Router();\nrouter.get('/health', (_req, res) => res.json({ ok: true }));\nexport default router;\n",
  }, 'node-api').runOk, true, 'mounted health router file passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"grpc-api"}',
    'src/server.js': "import grpc from '@grpc/grpc-js';\nconst server = new grpc.Server();\nserver.addService(svc, impl);\n",
  }, 'node-api').runOk, true, 'gRPC Server + addService passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"sock"}',
    'src/server.js': "import { Server } from 'socket.io';\nconst io = new Server();\nio.on('connection', (s) => { s.emit('hi'); });\n",
  }, 'node-api').runOk, true, 'socket.io connection handler passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"ws"}',
    'src/server.js': "import { WebSocketServer } from 'ws';\nconst wss = new WebSocketServer({ port: 8080 });\n",
  }, 'node-api').runOk, false, 'ws import without connection handler fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"nest-api"}',
    'src/main.ts': "import { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  await app.listen(3000);\n}\nbootstrap();\n",
    'src/users.controller.ts': "import { Controller, Get } from '@nestjs/common';\n@Controller('users')\nexport class UsersController {\n  @Get('/health') health() { return { ok: true }; }\n  @Get('/users') list() { return []; }\n}\n",
  }, 'node-api').runOk, true, 'NestJS src/main.ts + controller routes passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"hono-api"}',
    'src/app.ts': "import { Hono } from 'hono';\nimport { serve } from '@hono/node-server';\nconst app = new Hono();\napp.get('/health', (c) => c.json({ ok: true }));\napp.get('/users', (c) => c.json([]));\nserve({ fetch: app.fetch, port: 3000 });\n",
  }, 'node-api').runOk, true, 'Hono src/app.ts + serve passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"api"}',
    'src/server.js': "import { Router } from 'express';\nconst router = Router();\nrouter.get('/health', () => {});\nrouter.route('/bookings').get(list).post(create);\napp.listen(3000);\n",
  }, 'node-api').runOk, true, 'router.route chained bookings + health passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"api"}',
    'src/server.js': "const BASE = '/b';\napp.get('/health', () => {});\napp.get(BASE, handler);\napp.listen(3000);\n",
  }, 'node-api').runOk, true, 'app.get(BASE, handler) + health passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"api"}',
    'src/server.mjs': "app.get('/health', () => {});\napp.get('/items', () => {});\napp.listen(3000);\n",
  }, 'node-api').runOk, true, 'src/server.mjs /health+/items passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"api"}',
    'src/server.mjs': "app.get('/health', () => {});\n",
  }, 'node-api').runOk, false, 'src/server.mjs /health-only fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"todos"}',
    'src/server.js': "app.get('/todos', () => {});\napp.post('/todos', () => {});\napp.listen(3000);\n",
  }, 'node-api').runOk, true, 'todos GET/POST without /health passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"nest"}',
    'src/main.ts': 'import { NestFactory } from "@nestjs/core";\nasync function bootstrap() { const app = await NestFactory.create(AppModule); await app.listen(3000); }\n',
    'src/users.controller.ts': "@Controller('users')\nexport class UsersController {\n  @Get() list() { return []; }\n}\n",
  }, 'node-api').runOk, true, 'Nest @Controller + bare @Get() passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"nest"}',
    'src/main.ts': 'import { NestFactory } from "@nestjs/core";\nasync function bootstrap() { const app = await NestFactory.create(AppModule); await app.listen(3000); }\n',
    'src/health.controller.ts': "@Controller('health')\nexport class HealthController {\n  @Get() ok() { return { ok: true }; }\n}\n",
  }, 'node-api').runOk, false, 'Nest health-only controller fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"hono"}',
    'src/app.ts': "import { Hono } from 'hono';\nimport { serve } from '@hono/node-server';\nserve({ fetch: new Hono().get('/users', (c) => c.json([])).fetch });\n",
  }, 'node-api').runOk, true, 'chained new Hono().get(/users) passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"fastify"}',
    'src/server.js': "fastify.route({ method: 'GET', url: '/items', handler: () => [] });\nfastify.listen(3000);\n",
  }, 'node-api').runOk, true, 'Fastify route({ method, url }) passes final evidence');
  assert.equal(verifyArtifactFiles({
    'package.json': '{"name":"api"}',
    'src/server.js': "app.get('/health', () => {});\n",
  }, 'node-api').runOk, true, 'seed /health-only still passes non-strict evidence');
  assert.equal(strict({
    'package.json': '{"name":"api"}',
    'src/server.js': 'const app = express();\napp.listen(3000);\n',
  }, 'node-api').runOk, false, 'no routes at all fails final evidence');
  assert.equal(verifyArtifactFiles({
    'package.json': '{"name":"api"}',
    'src/server.js': 'const app = express();\napp.listen(3000);\n',
  }, 'node-api').runOk, false, 'no routes at all fails seed evidence');
  assert.equal(strict({
    'app/main.py': 'import sys\n\ndef main() -> None:\n    print(sys.argv[1] if len(sys.argv) > 1 else "coffee")\n\nif __name__ == "__main__":\n    main()\n',
  }, 'python').runOk, true, 'Python with real logic passes final evidence');
  assert.equal(strict({
    'app/main.py': 'x = 1\n',
  }, 'python').runOk, false, 'Python trivial assign fails final evidence');
  assert.equal(strict({
    'app/main.py': 'import requests\n\ndef fetch(u):\n    r = requests.get(u)\n    return r.text\n',
  }, 'python').runOk, true, 'Python fetch helper passes final evidence');
  assert.equal(strict({
    'app/main.py': 'print("hello")\n',
  }, 'python').runOk, false, 'Python print-only fails final evidence');
  assert.equal(strict({
    'app/main.py': 'from fastapi import FastAPI\napp = FastAPI()\n@app.get("/health")\ndef health():\n    return {"status": "ok"}\n',
  }, 'python').runOk, false, 'Python FastAPI /health-only fails final evidence');
  assert.equal(strict({
    'app/main.py': 'import argparse\n\ndef main():\n    p = argparse.ArgumentParser()\n    p.add_argument("files", nargs="+")\n    args = p.parse_args()\n    for f in args.files:\n        print(f)\n',
  }, 'python').runOk, true, 'Python argparse + loop passes final evidence');
  assert.equal(strict({
    'app/main.py': 'from fastapi import FastAPI\napp = FastAPI()\n@app.get("/health")\ndef health():\n    return {"ok": True}\n@app.get("/items")\ndef items():\n    rows = [{"id": 1}]\n    if not rows:\n        return []\n    return rows\n',
  }, 'python').runOk, true, 'Python FastAPI /items with body passes final evidence');
  assert.equal(strict({
    'requirements.txt': 'pytest>=8.0\n',
    'tests/test_parser.py': 'def test_parses():\n    assert parse("x") == "x"\n',
  }, 'test-suite').runOk, true, 'non-tautological pytest passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"suite","scripts":{"test":"node --test"}}',
    'src/x.test.js': "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('truth', () => { assert.ok(true); });\n",
  }, 'test-suite').runOk, false, 'tautological JS test rejected by final evidence');
  assert.equal(strict({
    'package.json': '{"name":"suite","scripts":{"test":"node --test"}}',
    'test/foo.test.mjs': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/add.mjs';\ntest('add', () => { assert.equal(add(1, 2), 3); });\n",
    'src/add.mjs': 'export function add(a, b) { return a + b; }\n',
  }, 'test-suite').runOk, true, 'node:test foo.test.mjs with real assert.equal passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"suite","scripts":{"test":"node --test"}}',
    'test/foo.test.mjs': "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('truth', () => { assert.ok(true); });\n",
  }, 'test-suite').runOk, false, 'tautological .test.mjs rejected by final evidence');
  assert.equal(strict({
    'package.json': '{"name":"suite","scripts":{"test":"node --test"}}',
    'src/sample.js': 'export function add(a, b) { return a + b; }\n',
    'src/sample.test.js': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from './sample.js';\ntest('add', () => { assert.equal(add(1, 2), 3); });\n",
  }, 'test-suite').runOk, false, 'JS seed sample.test alone fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"suite","scripts":{"test":"node --test"}}',
    'src/sample.js': 'export function add(a, b) { return a + b; }\n',
    'src/sample.test.js': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from './sample.js';\ntest('add', () => { assert.equal(add(1, 2), 3); });\n",
    'src/parser.test.js': "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('parse', () => { assert.equal(parse('x'), 'x'); });\n",
  }, 'test-suite').runOk, true, 'JS seed + real subject test passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"suite","scripts":{"test":"node --test"}}',
    'src/sample.js': 'export function add(a, b) { return a + b; }\n',
    'src/sample.test.js': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from './sample.js';\ntest('add', () => { assert.equal(add(1, 2), 3); });\n",
    'src/parser.test.js': "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('truth', () => { assert.ok(true); });\n",
  }, 'test-suite').runOk, false, 'JS seed + tautological user test fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"cy","devDependencies":{"cypress":"^13.0.0"},"scripts":{"cy:run":"cypress run"}}',
    'cypress/e2e/login.cy.js': "describe('login', () => {\n  it('shows form', () => {\n    cy.visit('/login');\n    cy.get('form').should('be.visible');\n  });\n});\n",
  }, 'test-suite').runOk, true, 'Cypress e2e .cy.js with .should passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"pw","devDependencies":{"@playwright/test":"^1.40.0"},"scripts":{"test:e2e":"playwright test"}}',
    'e2e/home.spec.ts': "import { test, expect } from '@playwright/test';\ntest('home', async ({ page }) => {\n  await page.goto('/');\n  await expect(page.getByRole('heading')).toBeVisible();\n});\n",
  }, 'test-suite').runOk, true, 'Playwright e2e spec passes final evidence');
  assert.equal(strict({
    'requirements.txt': 'pytest>=8.0\n',
    'tests/test_sample.py': 'def test_truth():\n    assert True\n',
  }, 'test-suite').runOk, false, 'Python seed test_sample alone fails final evidence');
  assert.equal(strict({
    'requirements.txt': 'pytest>=8.0\n',
    'tests/test_sample.py': 'def test_truth():\n    assert True\n',
    'tests/test_parser.py': 'def test_parses():\n    assert parse("x") == "x"\n',
  }, 'test-suite').runOk, true, 'Python seed + parser test passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.js': '/** X */\nexport function hello(name = \'world\') {\n  return `hello ${name}`;\n}\n',
  }, 'library').runOk, false, 'library hello scaffold rejected by final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.js': 'export function addDays(d, n) {\n  const out = new Date(d);\n  out.setDate(out.getDate() + Number(n) || 0);\n  return out;\n}\nexport function formatIso(d) {\n  return new Date(d).toISOString().slice(0, 10);\n}\n',
  }, 'library').runOk, true, 'real library API passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.js': "export const VERSION = '1.0.0';\n",
  }, 'library').runOk, false, 'trivial VERSION export fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.js': 'export function noop() {}\n',
  }, 'library').runOk, false, 'empty noop export fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.js': 'export function add(a, b) { return a + b; }\n',
  }, 'library').runOk, false, 'one-liner add body under 40 fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.js': 'export function sum(xs) {\n  let t = 0;\n  for (const x of xs) t += Number(x) || 0;\n  return t;\n}\n',
  }, 'library').runOk, true, 'multi-statement sum with loop passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.js': 'function sum(xs) {\n  let t = 0;\n  for (const x of xs) {\n    t += Number(x) || 0;\n  }\n  return t;\n}\nexport { sum };\n',
  }, 'library').runOk, true, 'local function + export { sum } passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.js': "export default function make(o) {\n  if (!o) throw new Error('opts');\n  return { ...o, ready: true };\n}\n",
  }, 'library').runOk, true, 'export default function with real body passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"slug"}',
    'src/index.js': "function slugify(s) {\n  return String(s || '').toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9-]/g, '');\n}\nmodule.exports = { slugify };\n",
  }, 'library').runOk, true, 'CJS module.exports slugify with real body passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"slug"}',
    'src/index.js': "function hello(name) {\n  return 'hello ' + name;\n}\nmodule.exports = { hello };\n",
  }, 'library').runOk, false, 'CJS hello-only fails final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.mjs': 'export function sum(xs) {\n  let t = 0;\n  for (const x of xs) t += Number(x) || 0;\n  return t;\n}\n',
  }, 'library').runOk, true, 'src/index.mjs with real export passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.ts': "export function addDays(d: Date, n: number): Date {\n  const out = new Date(d);\n  out.setDate(out.getDate() + Number(n) || 0);\n  return out;\n}\n",
  }, 'library').runOk, true, 'TS return-typed function body passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.ts': "export * from './date';\n",
    'src/date.ts': "export function addDays(d: Date, n: number): Date {\n  const out = new Date(d);\n  out.setDate(out.getDate() + Number(n) || 0);\n  return out;\n}\n",
  }, 'library').runOk, true, 'barrel export * from real module passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.ts': 'export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));\n',
  }, 'library').runOk, true, 'expression-bodied arrow utility passes final evidence');
  assert.equal(strict({
    'package.json': '{"name":"dates"}',
    'src/index.ts': "export * from './hello';\n",
    'src/hello.ts': "export function hello(name = 'world') {\n  return `hello ${name}`;\n}\n",
  }, 'library').runOk, false, 'barrel to hello seed still fails final evidence');
}

{
  assert.equal(looksLikeTalkBeforeCreateAsk("I'm trying to build a game, need your help"), true, 'trying to build + need help → talk');
  assert.equal(looksLikeTalkBeforeCreateAsk('need help building a game'), true, 'need help building → talk');
  assert.equal(looksLikeTalkBeforeCreateAsk('I need help making a game'), true, 'need help making → talk');
  assert.equal(looksLikeTalkBeforeCreateAsk('I want a game idea'), true, 'want a game idea → talk');
  assert.equal(looksLikeTalkBeforeCreateAsk('I need an API'), false, 'I need an API still creates');
  assert.equal(looksLikeTalkBeforeCreateAsk('Gimme a CLI for renaming'), false, 'Gimme a CLI still creates');
}

{
  const cliLoopBrief = buildCreateBrief({
    brief: 'Build a node CLI tool for coffee shop inventory',
    productName: 'Cask',
    projectId: 'p',
    coderId: 'c',
    coderName: 'c',
    files: { 'bin/cli.js': '#!/usr/bin/env node\nconsole.log(1)\n' },
    host: { pushStatus() {} },
    artifactKind: 'node-cli',
  });
  assert.match(cliLoopBrief, /as a \*\*node-cli\*\* artifact/);
  assert.doesNotMatch(cliLoopBrief, /Vite \+ React|Put the product in App/);
  assert.match(cliLoopBrief, /bin\/cli\.js/);
}

// Web-resolved kinds must get web craft even if the brief mentions API/npm (markers).
{
  const host = { pushStatus() {} };
  const base = { productName: 'App', projectId: 'p', coderId: 'c', coderName: 'c', files: { 'src/App.jsx': 'export default function App(){return null}' }, host };
  const fullstack = buildCreateBrief({
    ...base,
    brief: 'Build a REST API with a React frontend',
    artifactKind: 'web-app',
  });
  assert.match(fullstack, /Vite \+ React/i);
  assert.doesNotMatch(fullstack, /CODING CREATE/i);
  const landingPkg = buildCreateBrief({
    ...base,
    brief: 'Build a landing page for our npm package',
    artifactKind: 'web-app',
  });
  assert.match(landingPkg, /Vite \+ React/i);
  assert.doesNotMatch(landingPkg, /CODING CREATE/i);
  const rails = buildCreateBrief({
    ...base,
    brief: 'Build a Rails API',
    files: { 'README.md': '# Rails' },
    artifactKind: 'unknown',
  });
  assert.match(rails, /CODING CREATE|not a website|non-web \(stack inferred/i);
  assert.doesNotMatch(rails, /Vite \+ React/i);
  assert.match(rails, /Never put code in README/i);
  assert.doesNotMatch(rails, /Prefer editing:\s*README/i);
}

// TS test-suite scaffold must use a TS-capable runner.
{
  const tsSuite = buildScaffoldFiles('node-cli', {
    name: 'X',
    summary: 'Write vitest tests in TypeScript for the parser',
    artifactKind: 'test-suite',
    preferredLanguage: 'ts',
  });
  const tsPkg = JSON.parse(tsSuite.find((f) => f.path === 'package.json').content);
  assert.match(String(tsPkg.scripts?.test || ''), /tsx/, 'TS test-suite uses tsx runner');
  const jsSuite = buildScaffoldFiles('node-cli', {
    name: 'X',
    summary: 'Write tests for the parser',
    artifactKind: 'test-suite',
  });
  const jsPkg = JSON.parse(jsSuite.find((f) => f.path === 'package.json').content);
  assert.equal(jsPkg.scripts?.test, 'node --test', 'JS test-suite keeps node --test');
}

// TS node-api scaffold must seed .ts + tsx toolchain.
{
  const tsApi = buildScaffoldFiles('node-cli', {
    name: 'X',
    summary: 'Build a TypeScript Express API',
    artifactKind: 'node-api',
    preferredLanguage: 'ts',
  });
  assert.ok(tsApi.some((f) => f.path === 'src/server.ts'), 'TS API seeds src/server.ts');
  assert.ok(tsApi.some((f) => f.path === 'tsconfig.json'), 'TS API includes tsconfig.json');
  const tsApiPkg = JSON.parse(tsApi.find((f) => f.path === 'package.json').content);
  assert.ok(tsApiPkg.devDependencies?.tsx, 'TS API has devDependencies.tsx');
  const jsApi = buildScaffoldFiles('node-cli', {
    name: 'X',
    summary: 'Build a TypeScript Express API',
    artifactKind: 'node-api',
  });
  assert.ok(jsApi.some((f) => f.path === 'src/server.js'), 'JS API keeps src/server.js');
  assert.equal(jsApi.some((f) => f.path === 'tsconfig.json'), false, 'JS API has no tsconfig');
}

// TS library scaffold must ship tsconfig with outDir dist.
{
  const tsLib = buildScaffoldFiles('node-cli', {
    name: 'X',
    summary: 'Build a TypeScript library for date math',
    artifactKind: 'library',
    preferredLanguage: 'ts',
  });
  const tsconfig = tsLib.find((f) => f.path === 'tsconfig.json');
  assert.ok(tsconfig, 'TS library includes tsconfig.json');
  assert.match(tsconfig.content, /"outDir":\s*"dist"/, 'TS library tsconfig outDir dist');
  const tsLibPkg = JSON.parse(tsLib.find((f) => f.path === 'package.json').content);
  assert.match(String(tsLibPkg.scripts?.test || ''), /npm run build/, 'TS library test builds first');
  const jsLib = buildScaffoldFiles('node-cli', {
    name: 'X',
    summary: 'Build a TypeScript library for date math',
    artifactKind: 'library',
  });
  assert.equal(jsLib.some((f) => f.path === 'tsconfig.json'), false, 'JS library has no tsconfig');
}

// Non-web step budget must allow multi-file stacks after Ready tightening.
{
  assert.equal(codingLoopMaxSteps('node-cli', {}), 12, 'CLI default maxSteps 12');
  assert.equal(codingLoopMaxSteps('unknown', {}), 12, 'unknown default maxSteps 12');
  assert.equal(codingLoopMaxSteps('unknown', { agentLoopMaxSteps: 30 }), 20, 'unknown ceiling 20');
  assert.equal(codingLoopMaxSteps('electron', { agentLoopMaxSteps: 30 }), 20, 'electron ceiling 20');
  assert.equal(codingLoopMaxSteps('node-api', { agentLoopMaxSteps: 30 }), 16, 'API ceiling 16');
  assert.equal(codingLoopMaxSteps('node-cli', { agentLoopMaxSteps: 4 }), 10, 'pref floor is 10');
}

// npm only when scaffold actually has package.json (pytest/unknown must not).
{
  const pytestFiles = buildScaffoldFiles('node-cli', {
    name: 'X',
    summary: 'Write a pytest test suite for the parser',
    artifactKind: 'test-suite',
  });
  assert.equal(
    projectUsesNpm(projectKindFromArtifactKind('test-suite'), pytestFiles),
    false,
    'pytest scaffold must not run npm',
  );
  const cliFiles = buildScaffoldFiles('node-cli', {
    name: 'X',
    summary: 'Build a node CLI tool for coffee shop inventory',
    artifactKind: 'node-cli',
  });
  assert.equal(
    projectUsesNpm(projectKindFromArtifactKind('node-cli'), cliFiles),
    true,
    'node-cli scaffold runs npm',
  );
  const railsFiles = buildScaffoldFiles('unknown', {
    name: 'X',
    summary: 'Build a Rails API',
    artifactKind: 'unknown',
  });
  assert.equal(
    projectUsesNpm(projectKindFromArtifactKind('unknown'), railsFiles),
    false,
    'unknown README scaffold must not run npm',
  );
}

// Wrote-check: fuzzy README labels must not count as code writes.
{
  assert.equal(loopWroteNonMetaCode({
    updated: [],
    steps: [{ tool: 'patch', ok: true, label: 'Patch README.md (2 edits)' }],
  }), false, 'README label with suffix is not a code write');
  assert.equal(loopWroteNonMetaCode({
    updated: [],
    steps: [{ tool: 'write', ok: true, label: 'Write src/worker.js' }],
  }), true, 'code path in label counts as write');
  assert.equal(loopWroteNonMetaCode({
    updated: [],
    steps: [{ tool: 'patch', ok: true, label: 'Patched a few files' }],
  }), false, 'label with no path is not a code write');
  assert.equal(loopWroteNonMetaCode({
    updated: ['src/handler.js'],
    steps: [{ tool: 'patch', ok: true, label: 'Patch README.md (2 edits)' }],
  }), true, 'updated code path still wins');
}

// Unknown Ready: README-only fails; real stack file passes; Vite App pollution fails.
{
  const railsAsk = 'Build a Rails API';
  const railsKind = resolveArtifactKind(railsAsk);
  assert.equal(railsKind, 'unknown', 'Rails API stays unknown');
  const railsPk = projectKindFromArtifactKind(railsKind);
  const railsFiles = Object.fromEntries(
    buildScaffoldFiles(railsPk, { name: 'RailsApi', summary: railsAsk, artifactKind: railsKind })
      .map((f) => [f.path.replace(/\\/g, '/'), f.content]),
  );
  const seedReady = await runReadyAndAssetsCheck(railsFiles, 'RailsApi', railsAsk, [], railsKind);
  assert.equal(seedReady.ok, false, `README-only unknown must NOT Ready: ${seedReady.reasons.join('; ')}`);
  assert.match(seedReady.reasons.join(' '), /README-only|real source/i);
  const withGo = {
    ...railsFiles,
    'src/main.go': 'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("rails api listening")\n}\n',
  };
  const goReady = await runReadyAndAssetsCheck(withGo, 'RailsApi', railsAsk, [], railsKind);
  assert.equal(goReady.ok, true, `unknown + main.go body must Ready: ${goReady.reasons.join('; ')}`);
  const emptyGo = await runReadyAndAssetsCheck(
    { ...railsFiles, 'src/main.go': 'package main\nfunc main() {}\n' },
    'RailsApi',
    railsAsk,
    [],
    railsKind,
  );
  assert.equal(emptyGo.ok, false, 'unknown + empty main.go must NOT Ready');
  const polluted = {
    ...railsFiles,
    'src/App.jsx': 'export default function App(){ return <div>shop</div> }',
  };
  const pollutedReady = await runReadyAndAssetsCheck(polluted, 'RailsApi', railsAsk, [], railsKind);
  assert.equal(pollutedReady.ok, false, 'unknown + src/App.jsx must fail Ready (code-only)');
  assert.match(pollutedReady.reasons.join(' '), /website shell|code-only/i);
}

console.log('smoke-coding-fidelity-matrix: ok', rows.length, 'asks');
