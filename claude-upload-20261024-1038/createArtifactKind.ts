/**
 * Single artifact-kind resolver for create/edit.
 * Chosen once from the user brief; downstream gates must consume this — not re-guess
 * "product site" from substring heuristics (that hijacked CLI/API/dashboard asks).
 *
 * Leaf module: no createJobStore / create.ts imports.
 */

export type ArtifactKind =
  | 'product-site'
  | 'web-app'
  | 'static-web'
  | 'node-cli'
  | 'node-api'
  | 'python'
  | 'library'
  | 'game'
  | 'electron'
  | 'extension'
  | 'test-suite'
  | 'unknown';

const PRODUCT_NOUN_RE =
  /\b(?:mouse|mice|keyboard|headset|headphones?|desk|monitor|chair|gpu|peripheral|bottle|mug|coffee|apparel|shoe|sneaker|bag|delivery|sku|product\s+line|gift|candle|soap|tea|wine|jewelry|watch|perfume|skincare)\b/i;

const SITE_TOKEN_RE =
  /\b(?:landing|website|site|store|storefront|shop|homepage|brand\s+(?:site|page)|marketing\s+(?:site|page))\b/i;

const NON_PRODUCT_RE =
  /\b(?:dashboard|admin|control\s+panel|configure|config|preset|manage|electron|cli|command[\s-]?line|api|server|backend|library|package|game|extension|test(?:s|ing)?|unit\s+test|playwright|cypress|ipc|script|tool|bot(?!\s+tle))\b/i;

/** Tests-first ask ("Write tests for the parser") — classifyTurn creates these; never static-web. */
const TEST_FIRST_ASK_RE =
  /^\s*(?:please\s+)?(?:write|add|create|generate|make|build)\s+(?:me\s+)?(?:some\s+|a\s+|the\s+)?(?:unit\s+|integration\s+|e2e\s+|pytest\s+|jest\s+|vitest\s+|playwright\s+)?(?:tests?|test\s+cases?)\b/i;

/**
 * Explicit coding / non-web ask markers. When present, never treat as product-site
 * even if the brief also mentions coffee/shop/desk nouns ("CLI for a coffee shop").
 */
export function briefHasCodingArtifactMarker(brief: string): boolean {
  const t = String(brief || '');
  if (!t.trim()) return false;
  return (
    /\b(?:node\s+cli|cli\s+tool|cli\s+app|command[\s-]?line\s+tool|command[\s-]?line)\b/i.test(t)
    || /\b(?:express|fastify|koa|hono|rest\s+api|http\s+api|backend\s+api|api\s+server|grpc|websocket\s+server)\b/i.test(t)
    || /\b(?:npm\s+package|typescript\s+library|js\s+library|node\s+library|publishable\s+library|middleware|sdk)\b/i.test(t)
    || /\b(?:electron|ipc|desktop\s+app|tray\s+app|tauri)\b/i.test(t)
    || /\b(?:chrome\s+(?:mv3\s+)?extension|browser\s+extension|firefox\s+(?:addon|extension)|edge\s+extension|mv3\s+extension|vs\s*code\s+extension|vscode\s+extension)\b/i.test(t)
    || /\b(?:pytest|unit\s+tests?|test\s+suite|vitest|jest|web\s+scraper|scrapers?|crawler|playwright|puppeteer)\b/i.test(t)
    || /\b(?:chat\s?bot|(?:slack|discord|telegram|twitter|reddit)\s+bot|slack\s+app)\b/i.test(t)
    || /\b(?:lambda|cloudflare\s+worker|kafka\s+consumer|react\s+native|flutter|golang|\brust\b|terraform|helm\s+chart|dockerfile|docker\s+compose|makefile|prisma|cron\s+job|github\s+actions?|monorepo|turborepo|sql\s+migration|unity|godot|bevy|unreal|arduino|esp32|firmware|wordpress\s+plugin|shopify\s+app|figma\s+plugin|obsidian\s+plugin|raycast\s+extension|userscript|tampermonkey|greasemonkey)\b/i.test(t)
    || TEST_FIRST_ASK_RE.test(t)
    || (
      /\b(?:cli|argv|yargs|commander|oclif)\b/i.test(t)
      && /\b(?:build|create|make|write|scaffold|implement|tool|script)\b/i.test(t)
    )
    || (
      /\b(?:library|package)\b/i.test(t)
      && /\b(?:build|create|make|scaffold|publish)\b/i.test(t)
      && !SITE_TOKEN_RE.test(t)
    )
  );
}

/** Explicit product / brand storefront invent — only path that may run product ladder / desk-hardware seeds. */
export function isProductSiteAsk(brief: string): boolean {
  const t = String(brief || '');
  if (!t.trim()) return false;
  // Coding artifacts always win — "CLI for a coffee shop" is not a storefront.
  if (briefHasCodingArtifactMarker(t)) return false;
  // Fix/edit/debug of an existing site is not a product invent ask.
  if (/\b(?:fix|debug|repair|patch|refactor|rewrite|update|improve|add|change)\b/i.test(t)
    && /\b(?:bug|bugs|issue|broken|error|dark\s+mode|feature|button|nav|footer|header)\b/i.test(t)) {
    return false;
  }
  // Dashboard/admin/API/CLI/etc. never become product landings even if "store"/"shop" nouns appear.
  if (/\b(?:dashboard|admin(?:\s+panel)?|control\s+panel|cli|command[\s-]?line|api|server|backend|library|package|extension|electron|bot|scraper|crawler|pytest|test\s+suite)\b/i.test(t)) {
    return false;
  }
  if (NON_PRODUCT_RE.test(t) && !SITE_TOKEN_RE.test(t)) return false;
  // "coffee shop" / "gift shop" alone is a business noun, not a website ask.
  // Require a real web/storefront token (not bare "shop") OR shop+website/brand invent.
  const webSiteToken = /\b(?:landing|website|site|store|storefront|homepage|brand\s+(?:site|page)|marketing\s+(?:site|page)|online\s+store)\b/i.test(t);
  const shopAsStorefront = /\bshop\b/i.test(t)
    && /\b(?:website|site|landing|storefront|online|ecommerce|e-commerce|buy|cart|checkout)\b/i.test(t);
  if ((webSiteToken || shopAsStorefront) && PRODUCT_NOUN_RE.test(t)) return true;
  if (
    /\b(?:brand\s+(?:website|site|page|landing)|product\s+(?:website|site|page|landing)|online\s+store|storefront)\b/i.test(t)
    && !NON_PRODUCT_RE.test(t)
  ) {
    return true;
  }
  if (
    /\b(?:gaming\s+desk|standing\s+desk|desk\s+brand|gaming\s+mouse|mechanical\s+keyboard)\b/i.test(t)
    && webSiteToken
  ) {
    return true;
  }
  return false;
}

export function isWebArtifactKind(kind: ArtifactKind): boolean {
  return kind === 'product-site' || kind === 'web-app' || kind === 'static-web' || kind === 'game' || kind === 'electron';
}

export function isNonWebArtifactKind(kind: ArtifactKind): boolean {
  return kind === 'node-cli'
    || kind === 'node-api'
    || kind === 'python'
    || kind === 'library'
    || kind === 'test-suite'
    || kind === 'extension';
}

/** Resolve once from the user ask. Prefer this over scattered briefWants* regexes. */
export function resolveArtifactKind(brief: string): ArtifactKind {
  const t = String(brief || '');
  const lower = t.toLowerCase();
  if (!t.trim()) return 'unknown';

  // Coding artifacts BEFORE product-site — "CLI for coffee shop" / "API for booking website".
  if (
    /\b(?:electron|ipc|tray\s+app)\b/i.test(t)
    && !/\b(?:website|landing|storefront|tauri)\b/i.test(t)
  ) {
    return 'electron';
  }
  // Tauri / Qt / Swing / WPF / etc. are desktop but not Electron — leave unknown.
  if (
    /\b(?:tauri|qt\b|gtk|swing|javafx|wpf|winui|maui|xamarin)\b/i.test(t)
    && /\b(?:app|desktop|build|create|make|scaffold)\b/i.test(t)
  ) {
    return 'unknown';
  }
  if (
    /\b(?:desktop\s+app)\b/i.test(t)
    && !/\b(?:website|landing|storefront|tauri|flutter|react\s+native|qt\b|gtk|swing|javafx|wpf|winui|maui|python|tkinter|pyqt\d?|pyside\d?|kivy|wxpython|winforms|csharp|java|kotlin|swift(?:ui)?|rust|golang|c\+\+)\b/i.test(t)
    && !/(?:^|[^\w])c#|\.net\b/i.test(t)
  ) {
    return 'electron';
  }

  // Raycast / userscript / Obsidian / Figma plugins are not Chrome MV3 or VS Code —
  // keep them on unknown + README (no fake manifest). Require plugin/extension token so
  // "Figma-like website" stays web. Soft "keyboard macro extension" names none of these.
  if (
    /\b(?:raycast|userscript|tampermonkey|greasemonkey|obsidian|figma)\b/i.test(t)
    && /\b(?:build|create|make|write|scaffold)\b/i.test(t)
    && /\b(?:extension|plugin|userscript|addon)\b/i.test(t)
  ) {
    return 'unknown';
  }

  // Explicit non-JS language / engine asks must not get Node/Vite seeds (game, API, library, bot, CLI).
  {
    const lang = '(?:rust|golang|go|c\\+\\+|c#|csharp|java|kotlin|swift|zig|php|ruby|scala|elixir|lua|haskell|ocaml)';
    const headLang = new RegExp(`^\\s*(?:please\\s+)?(?:build|create|make|write|scaffold|implement|develop)\\s+(?:me\\s+)?(?:an?|the)?\\s*${lang}(?=[\\s-])`, 'i');
    const inLang = new RegExp(`\\b(?:in|using|with|written\\s+in)\\s+${lang}(?=[\\s.,;!?]|$)`, 'i');
    const engine = /\b(?:love2d|löve|roblox|raylib|sfml|sdl2?|monogame|libgdx|gamemaker|rpg\s+maker|pico-?8|defold)\b/i;
    if (
      (headLang.test(t) || inLang.test(t) || engine.test(t))
      && /\b(?:build|create|make|write|scaffold|implement|develop)\b/i.test(t)
      && !/\b(?:node(?:js)?|javascript|typescript|npm|python|pip|\.py|react|vite|three\.?js|phaser|canvas|webgl|browser|electron|wasm|webassembly|website|landing|storefront)\b/i.test(t)
    ) {
      return 'unknown';
    }
  }

  if (
    /\b(?:chrome\s+(?:mv3\s+)?extension|browser\s+extension|firefox\s+(?:addon|extension)|edge\s+extension|web\s+extension|mv3\s+extension|vs\s*code\s+extension|vscode\s+extension|keyboard\s+(?:macro\s+)?extension|macro\s+extension)\b/i.test(t)
    || (
      /\b(?:build|create|make|write|scaffold|update)\b/i.test(t)
      && /\b(?:chrome|browser|firefox|edge)\b/i.test(t)
      && /\b(?:extension|addon)\b/i.test(t)
    )
  ) {
    return 'extension';
  }

  if (
    TEST_FIRST_ASK_RE.test(t)
    || (
      (
        /\b(?:unit\s+tests?|test\s+suite|jest|vitest|pytest)\b/i.test(t)
        || (
          /\b(?:playwright|cypress)\b/i.test(t)
          && /\b(?:tests?|suite|e2e)\b/i.test(t)
        )
      )
      && /\b(?:write|add|create|generate|build)\b/i.test(t)
      && !/\b(?:website|landing|storefront|scraper|crawl)\b/i.test(t)
    )
    || (
      // Soft "I need tests for the parser" / "Tests for checkout"
      (
        /\b(?:need|want|gimme|give\s+me)\b/i.test(t)
        || /^(?:please\s+)?tests?\s+for\b/i.test(t)
      )
      && /\b(?:tests?|test\s+cases?|test\s+suite)\b/i.test(t)
      && !/\b(?:website|landing|storefront)\b/i.test(t)
    )
    || (
      /\b(?:build|create|make|write|scaffold)\b/i.test(t)
      && /\b(?:cypress|vitest|jest)\s+(?:e2e\s+)?(?:suite|tests?)\b/i.test(t)
    )
    || /^(?:(?:please\s+)?(?:vitest|jest|pytest)\s+suite)\b/i.test(t.trim())
  ) {
    return 'test-suite';
  }

  if (
    (
      /\b(?:npm\s+package|node\s+library|typescript\s+library|js\s+library|publishable\s+library|component\s+library|design\s+system\s+library|ui\s+component\s+library|zod\s+(?:schema|package)|utility\s+package|utils?\s+package|axios\s+interceptor|interceptor\s+package|logger\s+wrapper|react\s+hooks?(?:\s+library)?|vue\s+composable(?:\s+package)?|composable\s+package|zustand\s+store(?:\s+package)?|jotai\s+atom(?:\s+package)?|xstate\s+machine(?:\s+package)?|atom\s+package|rate\s+limiter(?:\s+middleware)?)\b/i.test(t)
      || /\b(?:vite|webpack|rollup|esbuild|babel|eslint|prettier|postcss|tailwind|swc|remark|rehype|unified|fastify|express|koa|hono|nestjs|nest\s+js)\s+plugin\b/i.test(t)
      || /\b(?:webpack|vite)\s+loader\b/i.test(t)
      || /\b(?:next\.?js|express|fastify|koa|hono|clerk|nextauth|next-auth|prisma)\s+(?:auth\s+)?middleware\b/i.test(t)
      || /\b(?:auth\s+middleware|clerk\s+auth|prisma\s+middleware|rate\s+limiter\s+middleware|cors\s+middleware)\b/i.test(t)
      || /\b(?:nestjs|nest\s+js)\s+(?:interceptor|pipe|guard)\b/i.test(t)
      || (
        /\b(?:static\s+site\s+generator|ssg)\b/i.test(t)
        && /\b(?:package|library|npm|node)\b/i.test(t)
      )
      || /\b(?:svelte\s+action|mdx\s+compiler|imap\s+client|smtp\s+client|full-?text\s+search(?:\s+engine)?|openapi\s+spec\s+generator|block\s+kit\s+builder|embed\s+builder)\b/i.test(t)
      || /\b(?:tailwind\s+ui\s+kit|shadcn\s+component\s+package|storybook\s+addon)\b/i.test(t)
      || (
        /\b(?:lru\s+cache|bloom\s+filter|priority\s+queue|trie|pathfinding|graph\s+algorithms?)\s+(?:package|library)\b/i.test(t)
      )
      || (
        /\b(?:package|library)\b/i.test(t)
        && /\b(?:build|create|make|scaffold|publish|convert|migrate|refactor|rewrite|write|implement)\b/i.test(t)
        && !/\b(?:website|landing|homepage|storefront|docs?\s+site|app|dashboard|game|snapcraft|\.deb|flatpak|msi|homebrew|nix)\b/i.test(t)
      )
      || (
        /\blibrary\b/i.test(t)
        && /\b(?:build|create|make|scaffold|publish|convert|migrate|refactor|rewrite|write|implement)\b/i.test(t)
      )
      || (
        (
          /\b(?:wrap|wrapper)\b/i.test(t)
          || /\b(?:api|openai|stripe)\b/i.test(t) && /\bclient\b/i.test(t)
        )
        && /\b(?:api|openai|stripe|sdk)\b/i.test(t)
        && /\b(?:build|create|make|write|scaffold|wrap)\b/i.test(t)
        // "HTTP client UI like Insomnia" is a web app, not a library.
        && !/\b(?:ui|insomnia|postman|playground)\b/i.test(t)
      )
      || (
        // Soft "Create an SDK" / "Build middleware" / "need a middleware for CORS"
        /^(?:please\s+)?(?:build|create|make|write|scaffold|implement)\s+(?:me\s+)?(?:an|a|the)?\s*(?:sdk|middleware|rate\s+limiter)\b/i.test(t)
        || (
          /\b(?:need|want|gimme|give\s+me)\b/i.test(t)
          && /\b(?:sdk|middleware|rate\s+limiter)\b/i.test(t)
          && !/\b(?:website|landing|dashboard|playground|ui)\b/i.test(t)
        )
        || (
          /\bsdk\b/i.test(t)
          && /\b(?:build|create|make|scaffold|write|publish)\b/i.test(t)
          && !/\b(?:website|landing|dashboard|playground|ui)\b/i.test(t)
        )
      )
    )
    // Python package/library must scaffold Python, never the npm/TS library scaffold.
    && !/\b(?:python|pip|\.py)\b/i.test(lower)
    // Non-JS language packages must not get the npm library scaffold.
    && !/\b(?:haskell|ocaml|julia|swift|spm|cocoa|cargo|crate|gem|wheel|conda)\b/i.test(lower)
    // "landing page for our npm package" / "docs site for library" are sites, not libraries.
    && !/\b(?:website|landing|homepage|storefront|docs?\s+site|documentation\s+site|marketing)\b/i.test(t)
    && !/\b(?:dashboard)\b/i.test(t)
    // OS packaging formats are not npm libraries.
    && !/\b(?:snapcraft|\.deb\b|deb\s+package|flatpak|msi\s+installer|homebrew|nix\s+flake)\b/i.test(t)
  ) {
    return 'library';
  }

  // Infra packaging / Makefile / Nix — unknown README, never fake Vite/npm.
  if (
    /\b(?:snapcraft|flatpak|\.deb\b|deb\s+package|msi\s+installer|nix\s+flake|homebrew\s+(?:formula|tap)|makefile)\b/i.test(lower)
    && /\b(?:build|create|make|write|scaffold|package)\b/i.test(lower)
  ) {
    return 'unknown';
  }

  // Non-JS language packages / R Shiny / scientific stacks — unknown or handled elsewhere.
  if (
    /\b(?:haskell|ocaml|julia|r\s+shiny|shiny\s+dashboard|swift\s+package|spm\s+library|cocoa(?:pod)?)\b/i.test(lower)
    && /\b(?:build|create|make|scaffold|write|package|library|app|dashboard)\b/i.test(lower)
    && !/\b(?:node|javascript|typescript|js|ts|npm|python|pip)\b/i.test(lower)
  ) {
    return 'unknown';
  }

  if (
    (
      /\b(?:python|flask|fastapi|django|pip|\.py|pygame|pyglet|ursina|panda3d|tkinter|pyqt\d?|pyside\d?|kivy|wxpython|streamlit|gradio|jupyter|airflow|dbt\b|pyspark|spark\s+job|scrapy|beautifulsoup|selenium|pandas|polars|duckdb|pytorch|tensorflow|huggingface|hugging\s+face|plotly\s+dash|\bdash\s+app\b|bokeh|panel\s+dashboard|geopandas|folium|comfyui|recommendation\s+engine|collaborative\s+filter|poetry|praw)\b/i.test(lower)
      || /\b(?:web\s+scraper|scrapers?|scrape|scraping|crawlers?|crawl|spider)\b/i.test(lower)
      || /^(?:please\s+)?scraper\s+for\b/i.test(lower)
    )
    // "scraper for X website" is still a scraper — only skip when the ask is primarily a site invent.
    && !(
      /\b(?:website|landing|storefront)\b/i.test(t)
      && !/\b(?:scraper|scrapers?|scrape|scraping|crawler|crawl)\b/i.test(t)
    )
    // Python backend + React/Vue frontend is a fullstack web-app, not backend-only python.
    && !(
      /\b(?:with|plus|and)\b/i.test(lower)
      && /\b(?:react|vite|next|vue|svelte|frontend|spa)\b/i.test(lower)
      && /\b(?:api|backend|server|rest|flask|fastapi|django)\b/i.test(lower)
    )
  ) {
    // Port/convert TO node/JS wins over source-language python mention.
    if (
      /\b(?:port|convert|migrate|rewrite|translate)\b/i.test(lower)
      && /\b(?:to|into)\s+(?:node|nodejs|javascript|typescript|js|ts)\b/i.test(lower)
    ) {
      return 'node-cli';
    }
    // Non-Node scrapers (Go Colly, etc.) stay unknown — don't fake a Python scaffold.
    if (
      /\b(?:golang|\bgo\b|rust|colly|java|kotlin|c\+\+|csharp|c#)\b/i.test(lower)
      && /\b(?:scrape|scraper|scraping|crawl|crawler|spider)\b/i.test(lower)
      && !/\b(?:node|javascript|typescript|js|python|pip|\.py|puppeteer|playwright|cheerio)\b/i.test(lower)
    ) {
      return 'unknown';
    }
    // Python CLI still python; scrapers default to python unless JS/node/playwright/puppeteer/cheerio explicit.
    if (
      (
        /\b(?:node|javascript|typescript|js|puppeteer|playwright|cheerio)\b/i.test(lower)
        && /\b(?:scrape|scraper|scraping|crawl|crawler)\b/i.test(lower)
      )
      || /\b(?:puppeteer|playwright|cheerio)\b/i.test(lower)
    ) {
      return 'node-cli';
    }
    return 'python';
  }

    // Head-of-ask primary artifact (game/dashboard before supporting API mentions).
  {
    const head = lower.trim().replace(
      /^(?:please\s+)?(?:build|create|make|scaffold|write|implement)\s+(?:me\s+)?(?:an|a|the)?\s*/,
      '',
    );
    const mentionsSite = /\b(?:website|site|landing|storefront|store|shop|homepage)\b/.test(head);
    // A game server/backend/API is the server artifact, not the game client.
    if (/\b(?:game|multiplayer)\s+(?:server|backend|api)\b/.test(head)) {
      return 'node-api';
    }
    // "dashboard API with Express" is an API, not a Vite dashboard SPA.
    if (
      /^(?:dashboard|admin|billing|analytics)\s+api\b/.test(head)
      || (
        /\bdashboard\s+api\b/.test(head)
        && /\b(?:express|fastify|koa|hono|nestjs|nest\s+js|trpc|graphql)\b/.test(lower)
      )
    ) {
      return 'node-api';
    }
    // Native engines (Unity/Godot/Bevy/Unreal) are not Vite canvas games.
    if (/\b(?:unity|godot|bevy|unreal(?:\s+engine)?)\b/.test(head)) {
      return 'unknown';
    }
    if (
      /^(?:(?:browser|web|canvas|html5|2d|3d)\s+)?(?:game|arcade|shooter|platformer|puzzle\s+game|roguelike|rpg|tower\s+defense)\b/.test(head)
      && !mentionsSite
      && !/\b(?:unity|godot|bevy|unreal)\b/.test(head)
    ) {
      return 'game';
    }
    if (
      (
        /^(?:dashboard|admin\s+panel|web\s+app|spa|saas|react\s+app|vite\s+app)\b/.test(head)
        || /^(?:dashboard)\s+for\b/.test(head)
      )
      && !mentionsSite
      && !/\b(?:api|express|fastify|koa|hono|nestjs|trpc|graphql)\b/.test(head)
    ) {
      return 'web-app';
    }
    // API clients / SDKs / middleware / wrappers are libraries — not servers or static stubs.
    // "HTTP client UI like Insomnia" is a web app — not an SDK package.
    if (
      (
        /^(?:(?:typescript|javascript|js|ts|node|rest|http|graphql|json|api|openapi)\s+client|sdk|(?:[\w-]+\s+){0,3}wrapper|(?:express|fastify|koa|hono)?\s*middleware|rate\s+limiter)\b/.test(head)
        || /^(?:middleware\s+package|npm\s+middleware|auth\s+middleware|jwt\s+(?:auth\s+)?middleware)\b/.test(head)
        || /\b(?:cache|redis)\s+wrapper\b/.test(head)
      )
      && !/\b(?:ui|insomnia|postman|playground|like\s+insomnia)\b/.test(head)
    ) {
      return 'library';
    }
    // Fullstack "REST API with a React frontend" is a web-app host — not bare API.
    if (
      /(?:api|backend|server|rest|express|fastify|koa|hono)\b/.test(head)
      && /\b(?:react|vite|next|vue|svelte|frontend|spa)\b/.test(head)
      && /\b(?:with|plus|and|&\+)\b/.test(head)
    ) {
      return 'web-app';
    }
    // Playgrounds / client UIs are web apps — not bare GraphQL/HTTP servers.
    if (
      /^(?:graphql|sql|prompt|css\s+gradient)\s+playground\b/.test(head)
      || /^(?:http\s+client\s+ui|websocket\s+echo\s+tester|markdown\s+previewer|diff\s+viewer)\b/.test(head)
      || /\bplayground\b/.test(head) && /\b(?:graphql|sql|prompt)\b/.test(head)
    ) {
      return 'web-app';
    }
    // Head-of-ask API wins before CLI ("Build an API with a CLI admin tool").
    if (
      /^(?:(?:rest|http|graphql|json)\s+)?(?:api|backend|server)\b/.test(head)
      || /^(?:rest|http|graphql)\s+service\b/.test(head)
    ) {
      return 'node-api';
    }
  }

  // Explicit CLI primary ("Build a CLI that fetches … from an API") before soft API.
  // Do not force a Node bin scaffold onto Go/Rust/Java/C++/C#/PHP CLIs — leave unknown.
  const nonNodeLangCli = /\b(?:golang|\bgo\b|rust|cargo|java|kotlin|c\+\+|csharp|c#|\.net|swift|php|ruby|perl|zig|crystal|nim|haskell|ocaml|elixir|julia|matlab)\b/i.test(lower)
    && !/\b(?:node|javascript|typescript|js|ts|npm|python|pip|\.py)\b/i.test(lower);
  if (
    !nonNodeLangCli
    && (
      /\b(?:node\s+cli|command[\s-]?line\s+tool|cli\s+tool|cli\s+app)\b/i.test(lower)
      || (
        /^(?:please\s+)?(?:build|create|make|scaffold|write|implement|add)\s+(?:me\s+)?(?:an|a|the)?\s*(?:cli|script)\b/i.test(lower)
      )
      || (
        // Soft "Gimme a CLI for renaming" / "coffee inventory CLI" / "CLI for the coffee shop"
        (
          /\b(?:need|want|gimme|give\s+me)\b/i.test(lower)
          || /(?:^|[\s,;])cli(?:\s|$)/i.test(lower)
          || /\b\w+\s+cli\b/i.test(lower)
          || /^(?:please\s+)?cli\s+for\b/i.test(lower)
        )
        && /\bcli\b/i.test(lower)
        && !/\b(?:dashboard|frontend|react\s+app|vite\s+app|website|landing)\b/i.test(lower)
      )
      || (
        /\b(?:bun|deno)\s+script\b/i.test(lower)
        && /\b(?:build|create|make|write|scaffold)\b/i.test(lower)
      )
      || (
        // Soft workers without "build a cloudflare worker" phrasing
        /^(?:please\s+)?(?:make|build|create|ship|write)\s+(?:me\s+)?(?:an|a|the)?\s*worker\b/i.test(lower)
        && !/\b(?:website|landing|service\s+worker)\b/i.test(lower)
      )
      || (
        // Soft "I need a Cloudflare worker" / "want a worker for jobs" / bare "queue consumer"
        (
          (
            /\b(?:need|want|gimme|give\s+me)\b/i.test(lower)
            && /\b(?:cloudflare\s+worker|(?:background|queue|job)?\s*workers?|lambda|serverless)\b/i.test(lower)
          )
          || /^(?:queue|message|sqs|kafka)\s+consumer\b/i.test(lower.trim())
          || /^(?:discord|slack|telegram)\s+bots?\b/i.test(lower.trim())
        )
        && !/\b(?:website|landing|service\s+worker|dashboard)\b/i.test(lower)
      )
      || (
        // Git hooks / email utilities as Node CLIs
        /\b(?:build|create|make|write|scaffold)\b/i.test(lower)
        && /\b(?:git\s+hook|pre-commit\s+hook|husky\s+hook|email\s+parser|mbox\s+parser)\b/i.test(lower)
      )
      || (
        // "commander" alone matches "Redis commander clone" — require CLI toolkit context.
        /\b(?:cli|command[\s-]?line|argv|yargs|oclif|commander\.js|use\s+commander)\b/i.test(lower)
        && /\b(?:build|create|make|write|scaffold|implement|tool|app|script|refactor|rewrite|convert|migrate|fix|add)\b/i.test(lower)
        && !/\b(?:dashboard|frontend|react\s+app|vite\s+app|clone)\b/i.test(lower)
        && !/^(?:please\s+)?(?:build|create|make|scaffold)\s+(?:me\s+)?(?:an|a|the)?\s*(?:api|backend|server)\b/i.test(lower)
      )
      || (
        /\b(?:add|create|write|make)\s+(?:a\s+)?script\b/i.test(lower)
        && /\b(?:rename|files?|batch|folder|directory|pdfs?)\b/i.test(lower)
      )
      || (
        // "Make a thing that renames files" / "something that renames PDFs"
        /\b(?:build|create|make|write|scaffold)\b/i.test(lower)
        && /\brename/i.test(lower)
        && /\b(?:files?|folders?|directories|batch|pdfs?|images?|docs?)\b/i.test(lower)
      )
      || (
        // File converters / generators / aggregators / splitters as CLI tools.
        /\b(?:build|create|make|write|scaffold)\b/i.test(lower)
        && /\b(?:converter|generator|aggregator|transformer|splitter|merger|resizer|downloader|transcoder|migration\s+runner|release\s+script)\b/i.test(lower)
        && /\b(?:csv|json|pdf|xml|yaml|files?|report|password|qr\s*code|image|video|youtube|ffmpeg|rss|atom|podcast|feed|changelog|sitemap|robots\.?txt|favicon|og\s+image|postgres|semver|env|monorepo|release)\b/i.test(lower)
        && !/\b(?:website|landing|dashboard|react\s+app|color\s+palette|lorem|uuid\s+generator\s+page)\b/i.test(lower)
      )
      || (
        // Network/dev utility CLIs (load tester, DNS, scanner) — not websites.
        /\b(?:build|create|make|write|scaffold)\b/i.test(lower)
        && /\b(?:load\s+tester|port\s+scanner|dns\s+lookup|http\s+benchmark|ping\s+tool)\b/i.test(lower)
      )
      || (
        /\bbash\s+script\b/i.test(lower)
        || (
          /\b(?:shell|bash|zsh|fish)\s+script\b/i.test(lower)
          && /\b(?:build|create|make|write|scaffold)\b/i.test(lower)
        )
      )
    )
  ) {
    // Bash/shell scripts are still node-cli projectKind collapse today (bin entry) —
    // prefer unknown until a shell scaffold exists; only Node/Python CLIs ship.
    if (/\b(?:bash|zsh|fish|shell)\s+script\b/i.test(lower) && !/\b(?:node|javascript|typescript|python)\b/i.test(lower)) {
      return 'unknown';
    }
    return 'node-cli';
  }

  // Non-Node API frameworks must not get a Node Express scaffold.
  if (
    (
      /\b(?:rails|ruby\s+on\s+rails|spring\s+boot|axum|rocket\.?rs|actix|gin\s+api|fiber\s+api|chi\s+(?:http\s+)?api|golang|phoenix(?:\s+live)?|elixir|laravel|django\s+rest|flask|asp\.?\s*net|blazor)\b/i.test(lower)
      || /\.net\b/i.test(lower)
      || (
        (
          /\bgolang\b/i.test(lower)
          || /\bgo\s+(?:chi|gin|fiber|echo)\b/i.test(lower)
          || (/\bgo\b/i.test(lower) && /\b(?:chi|gin|fiber|echo)\b/i.test(lower))
        )
        && /\b(?:chi|gin|fiber|echo|gorilla|api|http)\b/i.test(lower)
      )
    )
    && /\b(?:api|backend|server|service|mvc|site|web\s+api|http)\b/i.test(lower)
    && !/\b(?:node|express|fastify|javascript|typescript|js|ts|npm)\b/i.test(lower)
    // Django/Flask are handled as python above — this guard is for leftover non-python/non-node.
    && !/\b(?:python|pip|django|flask|fastapi)\b/i.test(lower)
  ) {
    return 'unknown';
  }

  if (
    (
      (
        /\b(?:express|fastify|koa|hono|nestjs|nest\s+js|trpc|graphql|rest\s+api|http\s+api|backend\s+api|rest\s+service|backend\s+service|grpc\s+(?:service|server|api)|websocket\s+(?:server|api|service)|socket\.?io|webhook\s+(?:handler|receiver)|webhooks?\s+for\b|stripe\s+webhook|stripe\s+(?:checkout\s+)?events?|multiplayer\s+lobby|signaling\s+server|hasura\s+action)\b/i.test(lower)
        // GraphQL/SQL playgrounds are web UIs — handled above / in business apps.
        && !/\bplayground\b/i.test(lower)
        // Fastify/Express/Hono *plugins* are libraries (handled above).
        && !/\b(?:fastify|express|koa|hono|nestjs)\s+plugin\b/i.test(lower)
      )
      || (
        /\b(?:api|backend|server)\b/i.test(lower)
        && /\b(?:build|create|make|scaffold|write|implement)\b/i.test(lower)
        && !/\b(?:react|vite|frontend|dashboard|website|landing|cli\s+tool|\bcli\b)\b/i.test(lower)
      )
      || (
        /\b(?:lambda|cloudflare\s+worker|serverless\s+function|queue\s+worker|background\s+worker|kafka\s+consumer|sqs\s+consumer|message\s+consumer|queue\s+consumer|bullmq|job\s+processor|node-?cron|cron\s+scheduler|cron\s+job|supabase\s+edge\s+function|firebase\s+(?:cloud\s+)?function|azure\s+function|pubsub\s+worker)\b/i.test(lower)
        && /\b(?:build|create|make|scaffold|write|implement|ship|spin\s+up|kick\s+off)\b/i.test(lower)
      )
      || (
        // Soft "I need an API" / "want a REST API" / "shop inventory API"
        (
          /\b(?:need|want|gimme|give\s+me)\b/i.test(lower)
          || /(?:^|[\s,;])api(?:\s|$)/i.test(lower)
          || /\b\w+\s+api\b/i.test(lower)
        )
        && /\b(?:(?:rest|http|graphql)\s+)?api\b/i.test(lower)
        && !/\b(?:client|wrapper|sdk|middleware|website|landing|cli)\b/i.test(lower)
      )
    )
    && /\b(?:api|server|backend|rest|http|express|fastify|nestjs|trpc|graphql|grpc|websocket|socket|webhook|lambda|worker|serverless|consumer|bullmq|processor|cron|scheduler|edge\s+function|cloud\s+function|azure\s+function|hasura|lobby|signaling)\b/i.test(lower)
    && !/\b(?:react\s+app|vite\s+app|frontend\s+app)\b/i.test(lower)
    // Middleware / wrappers are libraries (handled in head); bare Express apps stay API.
    && !/\b(?:middleware|rate\s+limiter|cache\s+wrapper)\b/i.test(lower)
    // Dockerfile/compose/infra asks mentioning API are not Node API apps.
    && !/\b(?:dockerfile|docker\s+compose|helm\s+chart|terraform|makefile)\b/i.test(lower)
  ) {
    // Serverless workers / Lambdas share the CLI host shape for free-model scaffolding.
    if (/\b(?:lambda|cloudflare\s+worker|serverless|queue\s+worker|background\s+worker|kafka\s+consumer|sqs\s+consumer|message\s+consumer|queue\s+consumer|bullmq|job\s+processor|node-?cron|cron\s+scheduler|cron\s+job|supabase\s+edge\s+function|firebase\s+(?:cloud\s+)?function|azure\s+function|pubsub\s+worker)\b/i.test(lower)
      && !/\b(?:api|server|express|fastify|graphql|grpc|websocket)\b/i.test(lower)) {
      return 'node-cli';
    }
    // "Express API for a restaurant booking website" / bare "build an API" — still API.
    return 'node-api';
  }

  // Chatbots (Slack/Discord/…) are coding artifacts — not static-web landings.
  {
    const botAsk = /\b(?:chat\s?bots?|(?:slack|discord|telegram)\s+app|(?:slack|discord|telegram|whatsapp|twitch|twitter|reddit|mastodon|bluesky|youtube|instagram|line)\s+bot|discord\.?js\s+bot|telegraf\s+bot)\b/i.test(lower)
      || /\bbot\b[^.]{0,40}\b(?:slack|discord|telegram|whatsapp|twitch|twitter|reddit|mastodon|bluesky|youtube)\b/i.test(lower)
      || (
        /\b(?:build|create|make|write|implement)\s+(?:me\s+)?(?:a|an|the)?\s*(?:[\w.-]+\s+){0,2}(?:chat)?bots?\b/i.test(lower)
        && !/\b(?:website|site|landing|storefront)\b/i.test(lower)
      );
    if (botAsk) {
      // PRAW / python bots stay python (handled above); messaging API bots → API.
      return /\b(?:api|webhooks?|http|endpoint|server|express|route|slash\s+commands?|messaging)\b/i.test(lower)
        ? 'node-api'
        : 'node-cli';
    }
  }

  if (isProductSiteAsk(t)) return 'product-site';

  if (
    /\b(?:unity|godot|bevy|unreal(?:\s+engine)?)\b/i.test(lower)
    && /\b(?:game|project|app|build|create|make|scaffold)\b/i.test(lower)
  ) {
    return 'unknown';
  }

  // Terminal / text games are Node CLIs, not Vite canvas games.
  if (
    /\b(?:build|create|make|write)\b/i.test(lower)
    && (
      /\b(?:terminal|console|cli|command[\s-]?line|ascii|text[-\s]?based|text\s+adventure)\b[^.]{0,30}\bgame\b/i.test(lower)
      || /\bgame\b[^.]{0,20}\b(?:in|for)\s+(?:the\s+)?(?:terminal|console|command\s+line)\b/i.test(lower)
    )
    && !/\b(?:browser|web|canvas|react|website)\b/i.test(lower)
  ) {
    return 'node-cli';
  }

  if (
    /\b(?:game|playable|arcade|fps|shooter|pong|snake|pac-?man|canvas\s+game|webgl\s+game|platformer|roguelike|\brpg\b|tower\s+defense|sudoku|2048|flappy\s+bird|minesweeper|tetris|chess|checkers)\b/i.test(lower)
    && !SITE_TOKEN_RE.test(t)
    && !/\b(?:unity|godot|bevy|unreal)\b/i.test(lower)
  ) {
    return 'game';
  }

  // React Native / Flutter / Capacitor / Ionic / native mobile — not Vite web-apps.
  if (/\b(?:react\s+native|flutter|android\s+app|ios\s+app|expo\s+app|swiftui|capacitor|ionic)\b/i.test(lower)) {
    return 'unknown';
  }

  if (
    /\b(?:dashboard|admin\s+panel|control\s+panel|spa|react\s+app|vite\s+app|web\s+app|saas|next\.?js|vue(?:\.js)?\s+app|svelte(?:kit)?(?:\s+app)?|astro\s+(?:site|app)|remix\s+app|solid(?:js)?\s+app|qwik\s+app|htmx\s+app|ember\.?js\s+app|angular\s+(?:app|dashboard))\b/i.test(lower)
    // R Shiny / Blazor / ASP.NET are not Vite web-apps.
    && !/\b(?:r\s+shiny|shiny\s+dashboard|blazor|asp\.?\s*net)\b/i.test(lower)
    || (
      /\b(?:build|create|make|scaffold)\b/i.test(lower)
      && /\b(?:react|vite|next|vue|svelte|sveltekit|astro|remix|solidjs|qwik|htmx|ember|angular)\b/i.test(lower)
      && !/\b(?:r\s+shiny|blazor|asp\.?\s*net)\b/i.test(lower)
      && !/\breact\s+native\b/i.test(lower)
      // Vite/Next/Vue *plugins*, middleware packages, composables/hooks are libraries — not SPAs.
      && !/\b(?:plugin|loader|middleware|composable|action|hooks?|package|library)\b/i.test(lower)
      && !isProductSiteAsk(t)
    )
    // Fullstack "REST API with a React frontend" is a web app host, not bare API.
    || (
      /\b(?:react|vite|next|vue|frontend)\b/i.test(lower)
      && /\b(?:api|backend|rest)\b/i.test(lower)
      && /\b(?:with|plus|and)\b/i.test(lower)
      && !/\breact\s+native\b/i.test(lower)
      && !/\b(?:plugin|loader|middleware|package|library)\b/i.test(lower)
    )
  ) {
    return 'web-app';
  }

  if (
    /\b(?:static\s+html|plain\s+html|simple\s+site|sticky\s+notes?|todo(?:s)?|to-?do\s+list|timer|counter|tip\s*calc(?:ulator)?|tip\s+jar|stopwatch|world\s+clock|color\s+picker|unit\s+converter|color\s+palette\s+generator|regex\s+tester|jwt\s+debugger|base64\s+encoder|uuid\s+generator|lorem\s+ipsum|json\s+formatter)\b/i.test(lower)
    && t.length < 400
    && !/\b(?:dashboard|admin|electron|cli|api|library)\b/i.test(lower)
  ) {
    return 'static-web';
  }

  // Small web tools / editors / business apps / "X clone" that are not product landings.
  if (
    (
      /\b(?:kanban|markdown\s+(?:note\s+)?editor|note\s+editor|whiteboard|drawing\s+pad|paint\s+app|pomodoro|prompt\s+playground|llm\s+chat|chat\s+ui|crm|inventory\s+management|booking\s+system|pos\s+system|point\s+of\s+sale|helpdesk|ticket\s+tracker|project\s+management|time\s+tracking|expense\s+tracker|invoicing\s+app|quiz\s+app|flashcard|habit\s+tracker|mood\s+journal|typing\s+(?:speed\s+)?test|monaco\s+editor|codemirror|tiptap|quill|lexical|slate|blocknote|speech-?to-?text|text-?to-?speech|stable\s+diffusion\s+ui|mapbox|leaflet\s+map|three\.?js\s+scene|fuse\.?js\s+search|search\s+(?:ui|demo|page)|matter\.?js|konva|fabric\.?js|cesium|webxr|a-?frame|r3f|react\s+three\s+fiber|web\s+audio|tone\.?js|midi\s+controller|barcode\s+scanner|css\s+gradient\s+playground|markdown\s+previewer|diff\s+viewer|yaml\s+editor|sql\s+playground|graphql\s+playground|websocket\s+echo|http\s+client\s+ui|insomnia|postman|excalidraw|draw\.?io|figma-?like)\b/i.test(lower)
      || /\b(?:linkedin|twitter|x\.com|trello|notion|uber|airbnb|spotify|youtube|slack|discord|instagram|tiktok|netflix|pinterest|redis\s+commander|novel\s+editor|postman|excalidraw|draw\.?io)\s+clone\b/i.test(lower)
      || /\b(?:editor)\s+clone\b/i.test(lower)
      || /\bclone\s+of\s+(?:linkedin|twitter|trello|notion|uber|airbnb|spotify|youtube|slack|discord)\b/i.test(lower)
    )
    && /\b(?:build|create|make|scaffold|write)\b/i.test(lower)
    && !isProductSiteAsk(t)
  ) {
    return 'web-app';
  }

  // AI/ML pipelines — prefer python for vision/training, node-cli for agent/RAG tools.
  if (
    /\b(?:yolo|object\s+detector|fine-?tun(?:e|ing)?|train(?:ing)?\s+(?:a\s+)?(?:model|llm)|pytorch|tensorflow|ocr\s+pipeline|spam\s+classifier|sentiment\s+analysis|ner\s+service|neural\s+net|decision\s+tree|k-?means)\b/i.test(lower)
    && /\b(?:build|create|make|scaffold|write|train|fine|detect|classif)\b/i.test(lower)
  ) {
    return 'python';
  }
  if (
    /\b(?:rag\s+pipeline|langchain|llama[\s-]?index|vector\s+search|embedding\s+indexer|ai\s+agent)\b/i.test(lower)
    && /\b(?:build|create|make|scaffold|write|implement)\b/i.test(lower)
    && !/\b(?:website|landing|storefront)\b/i.test(lower)
  ) {
    return /\b(?:python|pytorch|fastapi)\b/i.test(lower) ? 'python' : 'node-cli';
  }

  if (SITE_TOKEN_RE.test(t) && !NON_PRODUCT_RE.test(t)) {
    // Generic website without a clear product noun — still web, not product ladder.
    return 'web-app';
  }

  // Landing/docs for a package/library still means a site, not unknown.
  if (
    /\b(?:landing|website|homepage|docs?\s+site|documentation\s+site)\b/i.test(t)
    && /\b(?:build|create|make|scaffold)\b/i.test(t)
  ) {
    return 'web-app';
  }

  // Ordinary “build a weather/notes/portfolio app” asks — Vite web-app, not unknown code-only.
  if (
    /\b(?:build|create|make|design|develop|code|write)\b/i.test(lower)
    && /\b(?:app|application|tool|page|tracker|planner|finder|viewer|player|gallery|calculator|converter|generator|blog|portfolio|menu|board|manager|quiz|widget|notes?)\b/i.test(lower)
    && !briefHasCodingArtifactMarker(t)
    && !/\b(?:golang|go|rust|cargo|java|kotlin|c\+\+|csharp|c#|\.net|swift|php|ruby|perl|zig|haskell|ocaml|elixir|julia|matlab|android|ios|mobile|native|firmware|plugin|formula|package|module|stack|terraform|docker|makefile|workflow|action|hook|shell|bash|desktop|qt|gtk|wpf|unity|godot|widget\s+for|screen|compose)\b/i.test(lower)
  ) {
    return 'web-app';
  }

  return 'unknown';
}

/** Product invent / Premium ladder may run only for product-site artifacts. */
export function artifactWantsProductLadder(
  kind: ArtifactKind | null | undefined,
  brief?: string,
): boolean {
  if (kind === 'product-site') return true;
  if (kind && kind !== 'unknown') return false;
  // Legacy fallback when kind was never set — still prefer isProductSiteAsk over old regex sprawl.
  return isProductSiteAsk(String(brief || ''));
}

/** Vite/React shell inject is only for SPA-like web artifacts — not static HTML. */
export function artifactWantsVite(kind: ArtifactKind | null | undefined): boolean {
  return kind === 'product-site'
    || kind === 'web-app'
    || kind === 'game'
    || kind === 'electron';
}

/** Map artifact → project stack kind used by scaffolds / npm. */
export function projectKindFromArtifactKind(kind: ArtifactKind): 'static-web' | 'vite-react' | 'python' | 'node-cli' | 'unknown' {
  switch (kind) {
    case 'python':
      return 'python';
    case 'node-cli':
    case 'node-api':
    case 'library':
    case 'test-suite':
    case 'extension':
      return 'node-cli';
    case 'static-web':
      return 'static-web';
    case 'product-site':
    case 'web-app':
    case 'game':
    case 'electron':
      return 'vite-react';
    default:
      return 'unknown';
  }
}
