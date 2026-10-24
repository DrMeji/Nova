/**
 * Minimal non-web Ready evidence — CLI/API/library/python can Ready without a Live URL.
 * Leaf-ish: no create.ts imports.
 */

import type { ArtifactKind } from '@/lib/createArtifactKind';

export type ArtifactEvidence = {
  kind: ArtifactKind;
  runOk: boolean;
  runDetail: string;
  testOk?: boolean;
  httpStatus?: number;
  outputSample?: string;
  evidencePath: string;
};

export type ArtifactEvidenceOptions = {
  /** Final Ready gate: seed scaffolds (no-op main, /health-only, tautological tests) must not pass. */
  requireImplementation?: boolean;
};

const stripJsComments = (s: string) => {
  let out = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    const d = s[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      out += c; i++;
      while (i < n && s[i] !== q) {
        if (s[i] === '\\' && i + 1 < n) { out += s[i] + s[i + 1]; i += 2; continue; }
        out += s[i++];
      }
      if (i < n) out += s[i++];
      continue;
    }
    if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c; i++;
  }
  return out;
};

const stripJsStrings = (s: string) => s
  .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '""');

function readPath(files: Record<string, string>, path: string): string {
  return String(files[path] || files[path.replace(/\//g, '\\')] || '');
}

function pythonCodeOnly(src: string): string {
  return String(src || '')
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/'''[\s\S]*?'''/g, '')
    .replace(/#.*$/gm, '');
}

function pythonHasSubstance(src: string): boolean {
  const code = pythonCodeOnly(src);
  const lines = code.split('\n').map((l) => l.trim()).filter((t) =>
    t
    && !/^(?:import\b|from\b|def\b|async\s+def\b|class\b|@|if\s+__name__\s*==|pass$|\.\.\.$|return(?:\s+None)?$|main\(\)$)/.test(t)
    // seed noise: print of a bare literal, app/router construction, literal-only returns
    && !/^print\(\s*(['"]).*\1\s*\)$/.test(t)
    && !/^\w+\s*=\s*(?:FastAPI|Flask|APIRouter|Blueprint)\s*\(.*\)$/.test(t)
    && !/^return\s+[{\[(]?\s*(?:['"][^'"]*['"]\s*:\s*['"][^'"]*['"]\s*)?[}\])]?$/.test(t),
  );
  if (!lines.length) return false;
  // any registered non-health route is a real endpoint, even with a one-line handler
  const anyRoutes = [...code.matchAll(/@\w+\.(?:get|post|put|patch|delete|route)\(\s*['"]([^'"]*)/g)].map((m) => m[1]);
  if (anyRoutes.some((r) => r !== '/' && !/^\/?health\b/i.test(r))) return true;
  // health-only web API: every registered route is /health
  const routes = [...code.matchAll(/@\w+\.(?:get|post|put|patch|delete|route)\(\s*['"]([^'"]*)/g)].map((m) => m[1]);
  if (routes.length && routes.every((r) => /^\/?health\b/i.test(r))
      && lines.length < 3) return false;
  const control = lines.some((t) => /^(?:if|for|while|try|with|elif|except|raise|yield|await)\b|\bargparse\b|\bsys\.argv\b|\bopen\(|\brequests\.|\bhttpx\./.test(t));
  return control || lines.length >= 2;
}

function pythonTestHasSubstance(src: string): boolean {
  const code = pythonCodeOnly(src);
  if (!/^\s*def\s+test_/m.test(code)) return false;
  return /^\s*(?:assert\s+(?!True\b|False\b|1\b|0\b).+|with\s+pytest\.raises\b|self\.assert\w+\s*\(|pytest\.raises\s*\()/m.test(code);
}

const TEST_ASSERT_RE = /(?:\b(?:assert(?:\.\w+)?\s*\(|expect\s*\()|\.should\b|\bt\.(?:is|equal|deepEqual|true|false|truthy|falsy)\s*\()/;
const TEST_PATH_RE = /(?:\.test\.|\.spec\.|\.cy\.|\.e2e\.|__tests__\/|(?:^|\/)(?:tests?|cypress|e2e)\b)/i;
const TEST_TAUTOLOGY_RE = /\b(?:assert\s*\(\s*(?:true|1)\s*\)|assert\.(?:ok|equal|strictEqual|deepEqual)\s*\(\s*(?:true|1|['"][^'"]*['"])\s*(?:,\s*(?:true|1|['"][^'"]*['"]))?\s*\)|expect\s*\(\s*(?:true|1)\s*\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*(?:true|1)\s*\))/gi;

function jsTestHasSubstance(src: string): boolean {
  const code = stripJsComments(String(src || ''));
  if (!TEST_ASSERT_RE.test(code)) return false;
  return TEST_ASSERT_RE.test(code.replace(TEST_TAUTOLOGY_RE, ''));
}

/** Sync structural check — seed presence by default; final Ready must pass requireImplementation. */
export function verifyArtifactFiles(
  files: Record<string, string>,
  kind: ArtifactKind,
  opts?: ArtifactEvidenceOptions,
): ArtifactEvidence {
  const requireImplementation = opts?.requireImplementation === true;
  const paths = Object.keys(files || {}).map((p) => p.replace(/\\/g, '/'));
  const has = (re: RegExp) => paths.some((p) => re.test(p));
  const body = (re: RegExp) => {
    const key = paths.find((p) => re.test(p));
    return key ? readPath(files, key) : '';
  };

  if (kind === 'node-cli') {
    let pkg: {
      bin?: string | Record<string, string>;
      scripts?: Record<string, string>;
      main?: string;
    } | null = null;
    try { pkg = JSON.parse(body(/package\.json$/i)); } catch { pkg = null; }
    const cliFile = paths.find((p) => /^(?:bin\/cli\.js|src\/cli\.[jt]s|cli\.[jt]s)$/i.test(p)) || '';
    const binPaths = typeof pkg?.bin === 'string'
      ? [pkg.bin]
      : (pkg?.bin && typeof pkg.bin === 'object' ? Object.values(pkg.bin) : []);
    const binTarget = binPaths
      .map((b) => String(b).replace(/^\.\//, '').replace(/\\/g, '/'))
      .find((b) => paths.some((p) => p.toLowerCase() === b.toLowerCase())) || '';
    const binExists = Boolean(binTarget);
    const startRel = (() => {
      const s = String(pkg?.scripts?.start || '');
      const m = s.match(/\bnode\s+(?:--[\w-]+\s+)*(\.?\/?[\w./-]+\.(?:[cm]?[jt]s))\b/);
      const main = typeof pkg?.main === 'string' ? String(pkg.main) : '';
      return (m?.[1] || main).replace(/^\.\//, '').replace(/\\/g, '/');
    })();
    const distToSrc = (b: string) => {
      const m = b.replace(/\\/g, '/').match(/^(?:dist|build|lib|out)\/(.+)\.[cm]?js$/i);
      return m ? paths.find((p) => p.toLowerCase().startsWith(`src/${m[1]}.`.toLowerCase()) && /\.[cm]?[jt]sx?$/i.test(p)) || '' : '';
    };
    const srcBinTarget = binPaths.map((b) => distToSrc(String(b).replace(/^\.\//, ''))).find(Boolean) || '';
    const startTarget = startRel
      ? (paths.find((p) => p.toLowerCase() === startRel.toLowerCase()) || '')
      : '';
    const entryPath = cliFile || binTarget || startTarget || srcBinTarget;
    const entryLogic = (ep: string) => {
      const raw = stripJsComments(ep ? readPath(files, ep) : '');
      const code = stripJsStrings(raw);
      return /\bprocess\.(?:argv|stdin|stdout|env)\b/.test(code)
        || /\b(?:if|for|while|switch)\s*\(/.test(code)
        || /\.\s*(?:on|login|listen|command|action|parse)\s*\(/.test(code);
    };
    // Seed bin/cli.js stub may stay while package start / bin points at the real entry.
    const altEntryLogic = [startTarget, srcBinTarget].filter((e) => e && e !== entryPath).some(entryLogic);
    const cliRaw = stripJsComments(entryPath ? readPath(files, entryPath) : '');
    const cliCode = stripJsStrings(cliRaw);
    // A thin bin wrapper that imports local code and calls it is a real CLI,
    // not the `console.log('<title> cli')` scaffold stub — but the target must exist.
    const entryDir = entryPath.split('/').slice(0, -1);
    const localExists = (spec: string) => {
      const parts = [...entryDir];
      for (const seg of spec.split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') parts.pop(); else parts.push(seg);
      }
      const stem = parts.join('/').toLowerCase().replace(/\.[cm]?[jt]sx?$/, '');
      return paths.some((p) => {
        const q = p.toLowerCase();
        const rest = q.slice(stem.length);
        return q.startsWith(stem)
          && (/^\.[cm]?[jt]sx?$/.test(rest) || /^\/index\.[cm]?[jt]sx?$/.test(rest));
      });
    };
    const localImports = [...cliRaw.matchAll(
      /(?:from\s+|require\s*\(\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g,
    )].map((m) => m[1]);
    const thinWrapper = localImports.some(localExists) && /[A-Za-z_$][\w$]*\s*\(/.test(cliCode);
    const cliLogic = thinWrapper
      || /\bprocess\.(?:argv|stdin|stdout|env)\b/.test(cliCode)
      || /(?:require\s*\(\s*['"](?:node:)?(?:fs|readline)(?:\/promises)?['"]|from\s+['"](?:node:)?(?:fs|readline)(?:\/promises)?['"]|require\s*\(\s*['"](?:yargs|commander|minimist|oclif)['"]|from\s+['"](?:yargs|commander|minimist|oclif)['"])/.test(cliRaw)
      || /\b(?:if|for|while|switch)\s*\(/.test(cliCode)
      || /console\.(?:log|error|warn)\s*\(\s*[A-Za-z_$]/.test(cliCode);
    // Workers / lambdas / bots / consumers often put real code in src/* while bin/cli stays a stub.
    const otherLogic = paths.some((p) =>
      /\.(?:[jt]s|mjs|cjs)$/i.test(p)
      && p !== entryPath
      && !/(?:\.test\.|\.spec\.|__tests__\/|(?:^|\/)tests?\/|\.config\.)/i.test(p)
      && (() => {
        const raw = stripJsComments(readPath(files, p));
        const c = stripJsStrings(raw);
        // Length on comment-stripped source (strings still count) — stripJsStrings alone
        // shrinks Cloudflare/Lambda samples under 120 and falsely rejects them.
        return raw.replace(/\s+/g, '').length > 100
          && (/\b(?:function|class)\b|=>|\basync\s+\w+\s*\(/.test(c))
          && /\bexport\b|module\.exports|\bexports\./.test(c);
      })());
    const structural = Boolean(cliFile) || Boolean(startTarget) || Boolean(srcBinTarget) || (Boolean(pkg) && binExists);
    const ok = structural && (!requireImplementation || cliLogic || otherLogic || altEntryLogic);
    return {
      kind,
      runOk: ok,
      runDetail: ok
        ? (cliLogic ? 'CLI entry present' : 'CLI host + implemented worker/handler entry')
        : !structural
          ? 'missing bin/cli.js or package.bin target'
          : 'CLI entry is a scaffold stub — add real CLI logic',
      evidencePath: cliFile || binTarget || 'package.json',
    };
  }

  if (kind === 'node-api') {
    const serverPath = paths.find((p) => /^(?:src\/(?:server|index|main|app)\.[cm]?[jt]s|(?:server|index|main|app)\.[cm]?[jt]s)$/i.test(p))
      || paths.find((p) => /^(?:src\/)?[\w/-]+\.[cm]?[jt]s$/i.test(p)
        && !/(?:\.test\.|\.spec\.|__tests__\/|(?:^|\/)tests?\/)/i.test(p)
        && /\.listen\s*\(|\bserve\s*\(|NestFactory\.create|createServer\s*\(/.test(readPath(files, p)))
      || '';
    const ok = Boolean(serverPath) && has(/package\.json$/i);
    const sample = serverPath
      ? String(files[serverPath] || files[serverPath.replace(/\//g, '\\')] || '')
      : (body(/server\.[cm]?[jt]s$/i) || body(/index\.[cm]?[jt]s$/i));
    const looksLikeJs = /(?:import|require|export|function|const|=>|listen\s*\()/i.test(sample)
      && !/\{\{\{/.test(sample);
    // Same receivers as routeRe (+ h/hono); scan all server files, not only the entry.
    const healthRouteRe = /(?:app|router|routes|server|fastify|api|r|h|hono)\s*\.\s*(?:get|post|put|patch|delete|all)\s*\(\s*['"`]\/health\b|@(?:Get|All)\s*\(\s*['"`](?:\/)?health\b/i;
    const allServerCode = paths
      .filter((p) => /\.[cm]?[jt]s$/i.test(p) && !/(?:\.test\.|\.spec\.|__tests__\/|tests?\/)/i.test(p))
      .map((p) => stripJsComments(readPath(files, p)))
      .join('\n');
    const hasHealthRoute = healthRouteRe.test(allServerCode);
    const routeRe = /(?:app|router|routes|server|fastify|api|r|h|hono)\s*\.\s*(?:get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)|@(?:Get|Post|Put|Patch|Delete|All)\s*\(\s*['"`]([^'"`]+)/gi;
    const routePaths = [...allServerCode.matchAll(routeRe)].map((m) => String(m[1] || m[2] || ''));
    const mountRe = /(?:app|router|routes|server|fastify|api|r|h|hono)\s*\.\s*use\s*\(\s*['"`]([^'"`]+)/gi;
    for (const m of allServerCode.matchAll(mountRe)) routePaths.push(String(m[1] || ''));
    const chainRe = /\.\s*route\s*\(\s*['"`]([^'"`]+)/gi;
    for (const m of allServerCode.matchAll(chainRe)) routePaths.push(String(m[1] || ''));
    const varRouteRe = /(?:app|router|routes|server|fastify|api|r|h|hono)\s*\.\s*(?:get|post|put|patch|delete|all)\s*\(\s*[A-Za-z_$][\w$.]*\s*,/gi;
    if (varRouteRe.test(allServerCode.replace(/['"`][^'"`]*['"`]/g, '""'))) routePaths.push('/__dynamic');
    // NestJS: @Controller('users') + bare @Get() has no string path on the verb decorator.
    for (const m of allServerCode.matchAll(/@Controller\s*\(\s*['"`]([^'"`]+)/g)) routePaths.push(String(m[1] || ''));
    const nestCtrl = [...allServerCode.matchAll(/@Controller\s*\(\s*(?:['"`]([^'"`]*)['"`])?/g)].map((m) => String(m[1] || ''));
    if (nestCtrl.some((c) => !/^\/?health\b/i.test(c)) && /@(?:Get|Post|Put|Patch|Delete)\s*\(\s*\)/.test(allServerCode)) routePaths.push('/__nest');
    // Chained `new Hono().get('/x', …)` and Fastify `route({ method, url })`.
    for (const m of allServerCode.matchAll(/\)\s*\.\s*(?:get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)/g)) routePaths.push(String(m[1] || ''));
    if (/\bmethod\s*:/.test(allServerCode)) {
      for (const m of allServerCode.matchAll(/\burl\s*:\s*['"`]([^'"`]+)/g)) routePaths.push(String(m[1] || ''));
    }
    const hasRealRoute = routePaths.some((p) => p !== '/' && !/^\/?health\b/i.test(p));
    // Final-gate only: gRPC / Socket.io / WS / GraphQL / tRPC are real APIs without Express /health.
    const altProto = /@grpc\/grpc-js|\bgrpc\.Server\b|socket\.io|from\s+['"]ws['"]|WebSocketServer|ApolloServer|graphql-yoga|createYoga|@trpc\/server|initTRPC|makeExecutableSchema|buildSchema\s*\(/.test(allServerCode);
    const altHandlers = /\.addService\s*\(|\bio\.on\s*\(|\.on\s*\(\s*['"]connection['"]|\bresolvers\b|\bQuery\s*:|\.(?:query|mutation)\s*\(/.test(allServerCode);
    // Seed gate keeps /health as the scaffold marker; final gate only needs a real route
    // (or non-HTTP protocol handlers). Free models often ship /todos without /health.
    const realOk = hasRealRoute || (altProto && altHandlers);
    const pass = ok && looksLikeJs
      && (requireImplementation ? realOk : hasHealthRoute);
    return {
      kind,
      runOk: pass,
      runDetail: pass
        ? (hasHealthRoute
          ? 'API server + registered /health route'
          : hasRealRoute
            ? 'API server + registered route'
            : 'API server + non-HTTP protocol handlers')
        : !ok
          ? 'missing src/server.js (or equivalent) + package.json'
          : !looksLikeJs
            ? 'API entry is not valid JS'
            : !hasHealthRoute && !requireImplementation
              ? 'missing registered /health route'
              : 'API stub: only /health route — add a real endpoint',
      evidencePath: serverPath || '',
      outputSample: sample.slice(0, 200),
    };
  }

  if (kind === 'python') {
    const structural = has(/^(?:app\/main\.py|main\.py|src\/main\.py)$/i)
      || has(/\.py$/i);
    const implementationPaths = paths.filter((p) =>
      /\.py$/i.test(p)
      && !/(?:^|\/)(?:tests?|__tests__)\/|(?:^|\/)test_[^/]*\.py$|(?:^|\/)[^/]*_test\.py$|(?:^|\/)(?:setup|conftest|noxfile)\.py$/i.test(p),
    );
    const hasSubstance = implementationPaths.some((p) => pythonHasSubstance(readPath(files, p)));
    const ok = structural && (!requireImplementation || hasSubstance);
    return {
      kind,
      runOk: ok,
      runDetail: ok
        ? 'Python entry present'
        : !structural
          ? 'missing .py entry'
          : 'Python entry is a scaffold stub — add real logic',
      evidencePath: paths.find((p) => /\.py$/i.test(p)) || '',
    };
  }

  if (kind === 'library') {
    const entryPath = paths.find((p) => /^(?:src\/index\.[cm]?[jt]sx?|index\.[cm]?[jt]sx?|lib\/index\.[cm]?[jt]s)$/i.test(p)) || '';
    const structural = has(/package\.json$/i) && Boolean(entryPath);
    const sample = entryPath ? readPath(files, entryPath) : '';
    const code = stripJsComments(sample);
    // Seed scaffold is `export function hello(name = 'world') { return \`hello ${name}\`; }` — not enough for final Ready.
    const scaffoldHello = /export\s+function\s+hello\s*\(\s*name\s*=\s*['"]world['"]\s*\)\s*\{[\s\S]*?return\s+`hello\s+\$\{name\}`\s*;?\s*\}/.test(code)
      && !/\bexport\s+(?:(?:async\s+)?function|const|class)\s+(?!hello\b)/.test(code);
    const hasExport = /\bexport\s+(?:(?:async\s+)?function\*?|const|let|var|class|enum|default|\{|\*)/.test(code)
      || /\bmodule\s*\.\s*exports\b|\bexports\s*\.\s*\w+\s*=/.test(code);
    // Implementation often lives beside a re-export barrel (src/index.ts -> ./date); scan all lib sources.
    const libSrc = [...new Set([entryPath, ...paths.filter((p) =>
      /^(?:src|lib)\/.+\.[cm]?[jt]sx?$/i.test(p)
      && !/(?:\.test\.|\.spec\.|\.d\.ts$|__tests__\/)/i.test(p))].filter(Boolean))]
      .map((p) => stripJsComments(readPath(files, p))).join('\n');
    const fnBodies = [...libSrc.matchAll(
      /\b(?:async\s+)?function\s*\*?\s*\w*\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{;=]+?)?\s*\{([\s\S]*?)\n\}|=>\s*\{([\s\S]*?)\n\}|\bclass\s+\w+[^{]*\{([\s\S]*?)\n\}/g,
    )].map((m) => String(m[1] ?? m[2] ?? m[3] ?? '').replace(/\s+/g, ''));
    const arrowExpr = [...libSrc.matchAll(/=>\s*([^{\n;][^\n;]*)/g)].map((m) => m[1].replace(/\s+/g, ''));
    const realBody = fnBodies.some((b) =>
      b.length > 40 && /\b(?:if|for|while|switch|try|throw|await|new|return\w|\.\w+\()/.test(b))
      || arrowExpr.some((b) => b.length > 25 && /\.\w+\(|[?:+*\/<>]|\bnew\b/.test(b));
    const libLogic = hasExport && !scaffoldHello && realBody;
    const ok = structural && (!requireImplementation || libLogic);
    return {
      kind,
      runOk: ok,
      runDetail: ok
        ? 'library package + entry'
        : !structural
          ? 'missing package.json / src/index entry'
          : 'library entry is a scaffold stub — export real API surface',
      evidencePath: entryPath || 'package.json',
    };
  }

  if (kind === 'test-suite') {
    const isJsLikeTest = (p: string) => /\.(?:[cm]?[jt]sx?|py)$/i.test(p) || /\.cy\.[jt]s$/i.test(p);
    const testPaths = paths.filter((p) => TEST_PATH_RE.test(p) && isJsLikeTest(p));
    const nonSample = testPaths.filter((p) => !/(?:^|\/)(?:sample\.test\.[cm]?[jt]sx?|test_sample\.py)$/i.test(p));
    const testFile = (nonSample[0] || testPaths[0]
      || paths.find((p) => /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(p))
      || paths.find((p) => /(?:__tests__\/|tests?\/)/i.test(p) && isJsLikeTest(p))
      || '');
    const sample = testFile ? readPath(files, testFile) : '';
    // Final gate: the seed sample test must not vouch for the user's own (possibly tautological) tests.
    const userTestPaths = requireImplementation ? nonSample : testPaths;
    const testSubstance = userTestPaths.some((p) =>
      /\.py$/i.test(p) ? pythonTestHasSubstance(readPath(files, p)) : jsTestHasSubstance(readPath(files, p)),
    );
    // Final gate: seed sample tests alone never count as shipping the user's suite.
    const seedOnly = testPaths.length > 0 && testPaths.every((p) =>
      /(?:^|\/)(?:sample\.test\.[cm]?[jt]sx?|test_sample\.py)$/i.test(p));
    const implementationOk = !requireImplementation || (testSubstance && !seedOnly);
    if (/\.py$/i.test(testFile)) {
      const hasPytestDeps = has(/requirements\.txt$/i) || has(/pytest\.ini$/i) || has(/pyproject\.toml$/i);
      const hasTestFn = /(?:^|\n)\s*def\s+test_\w+/m.test(sample)
        || /\b(?:import\s+pytest|from\s+pytest)\b/.test(sample);
      const ok = Boolean(testFile) && hasPytestDeps && hasTestFn && implementationOk;
      return {
        kind,
        runOk: ok,
        runDetail: ok
          ? 'pytest test + requirements'
          : requireImplementation && seedOnly
            ? 'only the seed sample test exists — add tests for the real subject'
            : requireImplementation && !testSubstance && testFile && hasPytestDeps && hasTestFn
              ? 'pytest test is a scaffold stub — assert real behavior'
              : 'missing pytest test/requirements',
        testOk: ok,
        evidencePath: testFile,
      };
    }
    let pkg: {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    } | null = null;
    try { pkg = JSON.parse(body(/package\.json$/i)); } catch { pkg = null; }
    const scriptBlob = Object.values(pkg?.scripts || {}).join(' ');
    const runner = Boolean(
      pkg?.scripts?.test
      || pkg?.devDependencies?.vitest || pkg?.devDependencies?.jest
      || pkg?.devDependencies?.cypress || pkg?.devDependencies?.['@playwright/test'] || pkg?.devDependencies?.mocha
      || pkg?.dependencies?.vitest || pkg?.dependencies?.jest
      || /(?:vitest|jest|cypress|playwright|mocha|node:test)/i.test(scriptBlob)
      || /node:test|from\s+['"]vitest['"]|from\s+['"]jest['"]|cy\.|@playwright\/test/.test(sample),
    );
    const ok = Boolean(pkg) && Boolean(testFile) && runner
      && /\b(?:import|require|(?:test|it|describe)\s*\()/i.test(sample)
      && implementationOk;
    return {
      kind,
      runOk: ok,
      runDetail: ok
        ? 'test runner + test files'
        : requireImplementation && seedOnly
          ? 'only the seed sample test exists — add tests for the real subject'
          : requireImplementation && !testSubstance && Boolean(pkg) && Boolean(testFile) && runner
            ? 'test suite has only tautological assertions — test real behavior'
            : 'missing package test script/runner or test body',
      testOk: ok,
      evidencePath: testFile,
    };
  }

  if (kind === 'extension') {
    let pkg: { engines?: { vscode?: string }; main?: string } | null = null;
    try { pkg = JSON.parse(body(/package\.json$/i)); } catch { pkg = null; }
    const mainRel = typeof pkg?.main === 'string' ? pkg.main.replace(/^\.\//, '') : '';
    const vscodeEntry = (mainRel
      ? paths.find((p) => p.toLowerCase() === mainRel.toLowerCase())
      : '') || paths.find((p) => /^(?:src\/)?extension\.[jt]s$/i.test(p)) || '';
    const vscodeSample = vscodeEntry
      ? String(files[vscodeEntry] || files[vscodeEntry.replace(/\//g, '\\')] || '')
      : '';
    const extJs = paths.filter((p) =>
      /\.(?:[jt]s|mjs|cjs)$/i.test(p) && !/(?:\.test\.|\.spec\.|\.config\.)/i.test(p));
    const extReal = extJs.some((p) => {
      const c = stripJsStrings(stripJsComments(readPath(files, p)));
      // Strip seed-stub noise so scaffold activate/onInstalled alone cannot pass final.
      const noLog = c
        .replace(/console\.\w+\s*\([^)]*\)\s*;?/g, '')
        .replace(/vscode\.window\.showInformationMessage\s*\([^)]*\)\s*;?/g, '')
        .replace(/(?:chrome|browser)\.runtime\.onInstalled\.addListener\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\)\s*;?/g, '');
      return noLog.replace(/\s+/g, '').length > 80
        && /\b(?:if|for|while|switch|try)\b|\.addEventListener\s*\(|\.(?:forEach|map|filter|reduce)\s*\(|document\.(?:querySelector(?:All)?|getElementById|createTreeWalker|createElement)\s*\(|(?:chrome|browser)\.(?:tabs|storage|webRequest|alarms|scripting|commands|contextMenus|action|declarativeNetRequest|runtime\.onMessage)\b[.\w]*|vscode\.(?:window|workspace|languages)\.\w+/.test(noLog);
    });
    let mfDnr: { declarative_net_request?: { rule_resources?: Array<{ path?: string }> } } | null = null;
    try { mfDnr = JSON.parse(body(/manifest\.json$/i)); } catch { mfDnr = null; }
    const dnrReal = (mfDnr?.declarative_net_request?.rule_resources || []).some((r) => {
      const rel = typeof r?.path === 'string' ? r.path.replace(/^\.?\//, '') : '';
      if (!rel) return false;
      const key = paths.find((p) => p.toLowerCase() === rel.toLowerCase());
      if (!key) return false;
      try {
        const rules = JSON.parse(readPath(files, key));
        return Array.isArray(rules) && rules.length > 0;
      } catch { return false; }
    });
    const extOk = (base: boolean) => base && (!requireImplementation || extReal || dnrReal);
    if (pkg?.engines?.vscode && vscodeEntry && /\b(?:activate|registerCommand)\b/.test(vscodeSample)) {
      const ok = extOk(true);
      return {
        kind,
        runOk: ok,
        runDetail: ok
          ? 'VS Code extension package + activate entry'
          : 'extension entry is a scaffold stub — add real behavior',
        evidencePath: vscodeEntry,
      };
    }
    const man = body(/manifest\.json$/i);
    const mv3 = /"manifest_version"\s*:\s*3\b/.test(man);
    let mf: {
      background?: { service_worker?: string };
      action?: { default_popup?: string };
      browser_action?: { default_popup?: string };
      side_panel?: { default_path?: string };
      options_page?: string;
      options_ui?: { page?: string };
      content_scripts?: Array<{ js?: string[] }>;
    } | null = null;
    try { mf = JSON.parse(man); } catch { mf = null; }
    const declared: string[] = [
      mf?.background?.service_worker,
      mf?.action?.default_popup,
      mf?.browser_action?.default_popup,
      mf?.side_panel?.default_path,
      mf?.options_page,
      mf?.options_ui?.page,
      ...(Array.isArray(mf?.content_scripts) ? mf.content_scripts.flatMap((c) => c?.js || []) : []),
    ].filter((x): x is string => typeof x === 'string')
      .map((x) => x.replace(/^\.?\//, '').toLowerCase());
    const hasEntry = declared.some((d) => paths.some((p) => p.toLowerCase() === d))
      || has(/background\.[jt]s$/i) || has(/popup\.html$/i);
    const structural = has(/manifest\.json$/i) && mv3 && hasEntry;
    const ok = extOk(structural);
    return {
      kind,
      runOk: ok,
      runDetail: ok
        ? 'extension MV3 manifest + background/popup'
        : requireImplementation && structural && !extReal
          ? 'extension entry is a scaffold stub — add real behavior'
          : !mv3 && has(/manifest\.json$/i)
            ? 'extension requires manifest_version 3'
            : 'missing manifest.json / background',
      evidencePath: paths.find((p) => /manifest\.json$/i.test(p)) || '',
    };
  }

  if (kind === 'electron') {
    let ePkg: { main?: string } | null = null;
    try { ePkg = JSON.parse(body(/package\.json$/i)); } catch { ePkg = null; }
    const mainRel = typeof ePkg?.main === 'string' ? ePkg.main.replace(/^\.\//, '').replace(/\\/g, '/') : '';
    const mainPath = (mainRel
      ? paths.find((p) => p.toLowerCase() === mainRel.toLowerCase()) || ''
      : '')
      || paths.find((p) => /^(?:electron\/main\.[cm]?js|main\.[cm]?js|src\/main\.[cm]?js|src\/main\/index\.[cm]?js)$/i.test(p))
      || '';
    const mainSrc = stripJsStrings(stripJsComments(mainPath ? readPath(files, mainPath) : ''));
    const preload = readPath(files, 'electron/preload.cjs') || readPath(files, 'electron/preload.js')
      || readPath(files, 'preload.cjs') || readPath(files, 'preload.js');
    const structural = has(/package\.json$/i) && Boolean(mainSrc) && paths.length >= 2;
    const mainReal = /\bipcMain\.(?:handle|on)\s*\(|\bMenu\b|\bTray\b|\bdialog\.|\bfs\.|require\(\s*['"](?:node:)?(?:fs|path|os)['"]\s*\)[\s\S]*\bipcMain\b/.test(mainSrc);
    const bridged = /ipcRenderer\./.test(preload || '')
      || /\bcontextBridge\.exposeInMainWorld\([^)]*\{[^}]*(?:invoke|send|on)\b/.test(preload || '');
    const rendererReal = paths.some((p) => {
      if (mainPath && p.toLowerCase() === mainPath.toLowerCase()) return false;
      if (/(?:\.test\.|\.spec\.|node_modules\/|preload)/i.test(p)) return false;
      if (!/\.(?:[jt]sx?|html?|mjs|cjs)$/i.test(p)) return false;
      const c = stripJsStrings(stripJsComments(readPath(files, p)));
      return c.replace(/\s+/g, '').length > 250
        && /\b(?:useState|useReducer|addEventListener|onClick|fetch\s*\(|localStorage|sessionStorage|if|for|while)\b/.test(c);
    });
    const ok = structural && (!requireImplementation || mainReal || bridged || rendererReal);
    return {
      kind,
      runOk: ok,
      runDetail: ok
        ? 'electron files present'
        : !structural
          ? 'missing electron/main + package.json'
          : 'electron main is the scaffold seed — add real IPC or native behavior',
      evidencePath: mainPath || 'electron/main.cjs',
    };
  }

  if (kind === 'game') {
    const structural = has(/package\.json$/i) && paths.length >= 2;
    const codeSrc = paths
      .filter((p) => /\.(?:[jt]sx?|html?|py|lua|gd)$/i.test(p)
        && !/(?:\.test\.|\.spec\.|node_modules\/)/i.test(p))
      .map((p) => stripJsComments(readPath(files, p)))
      .join('\n');
    const impl = codeSrc.replace(/\s+/g, '').length > 300
      && /\b(?:requestAnimationFrame|setInterval|getContext\s*\(|THREE\.|Phaser|(?:update|loop|tick)\s*\()|<canvas/.test(codeSrc);
    const ok = structural && (!requireImplementation || impl);
    return {
      kind,
      runOk: ok,
      runDetail: ok
        ? 'game files present'
        : !structural
          ? 'missing game package scaffolding'
          : 'game entry is a scaffold stub — add real game loop/rendering',
      evidencePath: 'package.json',
    };
  }

  // Web kinds should not use this path — report not-ok so callers fall through.
  return {
    kind,
    runOk: false,
    runDetail: `artifactEvidence not used for ${kind}`,
    evidencePath: '',
  };
}
