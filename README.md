# Maqro

A personal macro calculator, meal planner, and weight-tracking journal.
Next.js app with a Supabase-backed optional account for multi-device sync —
or run it fully local in **guest mode** and everything lives in your
browser's IndexedDB.

## What it does

- **Calculator** Mifflin-St Jeor BMR, TDEE from activity, target calories
  from a signed weekly weight-change rate (1 kg ≈ 7700 kcal, clamped at
  ±1%/week of bodyweight and floored at `max(BMR, 1200)`). Optional manual
  TDEE override for calibrating against real-world weight change when the
  textbook formula misses.
- **Meal Plan** log foods against four meals (Breakfast / Lunch / Dinner
  / Snacks); auto-fill a day that hits your macro targets via a 3×3 linear
  solve over a protein-dominant / carb-dominant / fat-dominant food triplet,
  with portions snapped to 5 g.
- **Daily logs** every day's meals are persisted by `YYYY-MM-DD` key, with
  a date navigator to browse history without losing today's in-flight state.
- **Meal templates** save any logged meal as a reusable template ("Greek
  yogurt bowl") and apply it to any meal slot on any day.
- **Recipes** named bundles of ingredients (catalog references + grams)
  with optional cuisine and prep notes. Build one manually, or generate one
  via AI based on your diet / cuisine / allergy settings (review before
  saving no auto-commit). Macros are computed deterministically from each
  ingredient's per-100g snapshot × portion (the AI never invents nutrient
  values). Apply a recipe to any meal slot from the slot menu its
  ingredients expand into the slot as individual foods you can still adjust
  per-portion. Diet compatibility is derived on the fly from ingredients'
  `dietKind`s, so a vegan never sees a chicken recipe in the picker.
- **Weight history + progress** log weigh-ins, see a sparkline of recent
  weight and a macro-adherence chart against your daily targets.
- **Food search** three sources merged into one box:
  - **Built-in**: a curated set in [`data/food-database.ts`](data/food-database.ts)
  - **My foods**: custom foods you saved (IndexedDB, persists across reloads)
  - **Open Food Facts**: live search via a same-origin proxy at
    `/api/off-search` (caches 60 s at the edge). "Save to my foods" copies an
    OFF result into IndexedDB so it's available offline next time.
- **Account (optional)** passwordless email OTP sign-in via Supabase.
  Once signed in, profile + logs + weight history + custom foods + meal
  templates + recipes sync across devices on each sign-in (one-shot
  reconcile, not a live channel). Includes change-email, export-as-JSON,
  and a type-your-email-to-confirm delete-account flow.

## Stack

| Concern       | Choice                                                       |
| ------------- | ------------------------------------------------------------ |
| Framework     | Next.js 16 (App Router, Turbopack)                           |
| Runtime       | React 19                                                     |
| Language      | TypeScript 6 (`strict: true`)                                |
| Styles        | Tailwind CSS 4 + CSS variables                               |
| Motion        | [`motion`](https://motion.dev) (Framer Motion's successor)   |
| UI primitives | shadcn/ui (Radix)                                            |
| Local storage | [`idb`](https://github.com/jakearchibald/idb) over IndexedDB |
| Auth + sync   | Supabase (Postgres + RLS, `@supabase/ssr`, email OTP)        |
| AI planner    | Claude Haiku 4.5 via `@anthropic-ai/sdk` (opt-in)            |
| Drag and drop | `@dnd-kit/core` + `@dnd-kit/sortable`                        |
| Unit tests    | Vitest                                                       |
| E2E tests     | Playwright (Chromium)                                        |
| Lint          | ESLint 9 flat config via `eslint-config-next`                |
| Format        | Prettier 3                                                   |

## Requirements

- Node.js ≥ 24 (the repo's `.nvmrc` pins 25)
- npm

## Setup

```bash
nvm use            # picks up Node 25 from .nvmrc
npm install
cp .env.local.example .env.local   # optional  only needed for auth/sync
npm run dev        # http://localhost:3000
```

Without `.env.local` the app runs in **guest mode**: everything is stored
in IndexedDB on this device and there's no sign-in. To enable multi-device
sync, follow Supabase setup below.

### Supabase setup (auth + sync, optional)

The app uses Supabase as the cloud backend for auth (passwordless email
OTP paste the code, no link) and multi-device sync. Locally it runs
fine without it sign-in is disabled and the app stays on IndexedDB.

1. Create a project at <https://supabase.com> (free tier is enough).
1. In the Supabase dashboard, go to **Project Settings → API Keys** and
   copy the **Project URL** plus the **publishable key** (prefix
   `sb_publishable_…`). Don't copy the secret key it must never reach
   the browser.

   Older projects show "anon" + "service_role" instead of "publishable" +
   "secret" the anon JWT (`eyJ…`) works in `PUBLISHABLE_KEY` if that's
   still what your dashboard surfaces; the SDK accepts either format.

1. Paste them into `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
   ```

1. **Apply schema migrations via the Supabase CLI**. The CLI is bundled
   as a devDependency, so no global install needed. One-time per machine:

   ```bash
   npx supabase login                          # opens a browser for OAuth
   npx supabase link --project-ref <your-ref>  # find ref in dashboard URL
   ```

   Then to push any new or pending migrations:

   ```bash
   npm run db:push    # alias for `supabase db push`
   ```

   This applies every file in [`supabase/migrations/`](supabase/migrations/)
   that hasn't been run on the remote project yet. After the first push
   you should see six tables under **Table Editor**: `profiles`,
   `daily_logs`, `weight_history`, `custom_foods`, `meal_templates`,
   `recipes`, each with row-level security so users only see their own
   rows.

   Other db scripts:

   | Command             | What it does                            |
   | ------------------- | --------------------------------------- |
   | `npm run db:status` | List which migrations have been applied |
   | `npm run db:pull`   | Pull remote schema into a new migration |
   | `npm run db:new`    | Scaffold a new migration file           |

   For automated migrations on merge to `main`, see
   [`.github/workflows/supabase-migrations.yml`](.github/workflows/supabase-migrations.yml).
   It needs three GitHub secrets (Settings → Secrets and variables →
   Actions → New repository secret):

   | Secret                  | Where to get it                                                                      |
   | ----------------------- | ------------------------------------------------------------------------------------ |
   | `SUPABASE_ACCESS_TOKEN` | <https://supabase.com/dashboard/account/tokens> → Generate new token                 |
   | `SUPABASE_PROJECT_ID`   | Subdomain of your Supabase URL                                                       |
   | `SUPABASE_DB_PASSWORD`  | Database password (set at project creation, or reset at Project Settings → Database) |

   On PRs that touch `supabase/`, the workflow does a dry run (`supabase
migration list`) so reviewers can see exactly what will land at merge.
   On `push` to `main`, it runs `supabase db push`.

1. In **Authentication → URL configuration**, set the **Site URL** to
   the URL you'll be testing from (`http://localhost:3000` for local,
   `https://yourapp.vercel.app` for prod). Add
   `http://localhost:3000/auth/callback` and the equivalent prod URL to
   **Redirect URLs**.
1. **Customize the magic-link email template** (Authentication → Email
   Templates → Magic Link) to include the OTP code. Supabase's default
   template only has the link, but the app's sign-in form expects a
   numeric one-time code (6 or 8 digits, depending on your Supabase OTP
   length setting under Auth → Providers → Email) that works cross-device
   clicking the link only works on the browser the request came from.
   Replace the body with:

   ```html
   <h2>Your sign-in code</h2>
   <p>Enter this code in the app:</p>
   <p style="font-size: 1.6em; font-family: monospace; letter-spacing: 0.3em;">
     <strong>{{ .Token }}</strong>
   </p>
   <p>
     Or click the link (works only on the browser you requested it from):
     <a href="{{ .ConfirmationURL }}">Sign in</a>
   </p>
   ```

   Without this change the email contains only a link and there's no
   code to paste the link will still work but it's the brittle path.

1. Restart `npm run dev`. The sidebar should now show "Sign in" instead
   of "Guest".

Notes:

- Free-tier Supabase projects pause after a week of inactivity and
  auto-resume on the next request (one-time delay of a few seconds).
- The **secret key** (`sb_secret_…`, formerly `service_role`) is
  server-only never expose it to the browser. It's read by
  [`app/api/delete-account/route.ts`](app/api/delete-account/route.ts)
  to call `auth.admin.deleteUser` when a user opts to delete their
  account. If you leave `SUPABASE_SECRET_KEY` unset the rest of the app
  still works; only the "Delete account" button is disabled (the route
  returns 503 and the UI surfaces a "not configured" message). Add the
  same secret to your Vercel project's env vars (Production + Preview)
  before relying on the button in deployed builds.

### AI meal planning + recipe generation (optional)

Two routes route through **Claude Haiku 4.5** in a multi-turn agent loop:

- **`/api/meal-plan`** the **Auto-fill** button on the Meal Plan view.
  Produces a coherent one-day plan (breakfasts that look like breakfasts,
  etc.) more believable than what the deterministic 3×3 Cramer solver
  can do. Falls back to the solver on every error path.
- **`/api/recipes/generate`** the **Generate** button on the Recipes
  view. Composes one recipe (4–10 ingredients) honoring the user's diet
  preference, cuisines, allergies, and disliked foods, with an optional
  one-line hint ("something Korean and light"). Returns a draft that
  opens in the recipe form for review-before-save.

Both routes share the same hardening: catalog-bounded ingredient names
(macros computed server-side from catalog × portion never invented),
prompt caching on system + tools + transcript, in-loop validation
feedback when the model paraphrases a name past matching, OFF-search
fallback with 5 s timeout, and a forced-submit on the final iteration
so the loop is guaranteed to exit. Both are **opt-in by env var**.

1. Get an Anthropic API key from
   [console.anthropic.com](https://console.anthropic.com) → Settings → API
   keys. Set a usage budget while you're there a single Auto-fill or
   recipe generation costs ≪$0.001 with Haiku 4.5 (prompt-cache hits on
   turns 2+ make multi-iteration runs roughly free), but a budget is
   cheap insurance.
1. Add it to `.env.local`:

   ```env
   ANTHROPIC_API_KEY=sk-ant-…
   ```

1. Add the same key to your Vercel project (Production + Preview, server-
   only do **not** tick "expose to client"). Redeploy.

Behavior (applies to both `/api/meal-plan` and `/api/recipes/generate`):

- **Signed-in users only.** The routes verify the Supabase session before
  calling Anthropic; guest users get the deterministic planner (meal
  plan) or a "Sign in to use AI suggestions" message (recipes).
- **Diet-preference aware.** Both routes filter the food catalog by the
  user's preference _before_ sending to the AI, so a vegan never gets
  chicken (matches the deterministic planner's behavior).
- **Catalog-bounded.** The AI can only pick foods from the built-in
  catalog + the user's `My Foods` + Open Food Facts results pulled in
  this run; macros are computed server-side from catalog × portion, so
  hallucinated nutrient values can't slip through. Hallucinated _names_
  trigger an in-loop validation-feedback retry the model is told which
  names didn't match and is given another shot before the request
  errors.
- **Graceful fallback (meal-plan).** Unset / wrong key, rate limit, 502
  from Anthropic, network error all surface a short message and the
  deterministic plan instead. The Auto-fill button never gets stuck.
- **Review-before-save (recipes).** A successful generate opens the
  recipe form pre-filled with the AI draft the user reviews and
  explicitly saves. AI output never silently lands in your library.

If you skip this entirely the rest of the app still works; only the AI
flavour of Auto-fill and the AI recipe generator are disabled.

## Scripts

| Command              | What it does                            |
| -------------------- | --------------------------------------- |
| `npm run dev`        | Dev server with Turbopack               |
| `npm run build`      | Production build                        |
| `npm run start`      | Serve the production build              |
| `npm run lint`       | ESLint                                  |
| `npm run typecheck`  | `tsc --noEmit`                          |
| `npm test`           | Vitest run-once                         |
| `npm run test:watch` | Vitest watch mode                       |
| `npm run e2e`        | Playwright (auto-starts the dev server) |
| `npm run format`     | Prettier write                          |

A `Makefile` wraps these for CI: `make ci` runs `pre-commit fmt-check lint
typecheck test sec build` and is what should pass before any merge.
`make help` prints the full list.

## Tests

- [`lib/macros.test.ts`](lib/macros.test.ts) TDEE math, deficit/surplus
  symmetry, rate cap, BMR/1200 floor, manual TDEE override path.
- [`lib/meal-planner.test.ts`](lib/meal-planner.test.ts) `det3` /
  `solve3x3`, near-singular rejection, `planMeal` hits targets within
  tolerance, custom-foods inclusion, full-day `planDay` summary.
- [`lib/db.test.ts`](lib/db.test.ts) IDB round-trips for every store
  (profile, daily logs, weight history, custom foods, meal templates,
  recipes), the `addCustomFood` regression for `keyPath` +
  `autoIncrement` + `id: undefined`, plus `clearAllStores` for the
  delete-account flow.
- [`lib/sync/mappers.test.ts`](lib/sync/mappers.test.ts) pure
  camelCase ↔ snake_case + epoch ms ↔ ISO mapping for each table row,
  including the `diet_kind` nullable round-trip and recipe ingredient
  JSONB shape.
- [`lib/diet.test.ts`](lib/diet.test.ts) food classifier + per-diet
  compatibility (including "unknown = omnivore-only" safety default and
  explicit `dietKind` override behavior) plus `recipeDietCompatibility`
  derivation from ingredient kinds.
- [`lib/ai/plan.test.ts`](lib/ai/plan.test.ts) converts AI-shaped
  picks into local `Meal[]`: normalized name matching with word-boundary
  substring fallback, hallucinated-food drop, portion clamp + 5g snap,
  by-name meal-slot resolution.
- [`lib/ai/recipe.test.ts`](lib/ai/recipe.test.ts) recipe-side
  counterpart of `plan.test.ts`: `resolveAiRecipe` macro-snapshot +
  portion clamp + diet-kind derivation, plus tolerance for malformed
  model output.
- [`lib/ai/off-search.test.ts`](lib/ai/off-search.test.ts) Open Food
  Facts wrapper: 5 s timeout, limit clamping, brand parsing, calorie
  fallback chain (`energy-kcal_100g` → `energy-kcal` → derived 4/4/9).
- [`app/api/meal-plan/route.test.ts`](app/api/meal-plan/route.test.ts)
  and
  [`app/api/recipes/generate/route.test.ts`](app/api/recipes/generate/route.test.ts)
  scripted-SDK + mocked-OFF integration tests for the agent loops:
  happy path, OFF-error recovery via `is_error` tool_result, empty-plan
  validation-feedback retry, and cache_control breakpoints on the
  growing transcript.
- [`lib/storage-status.test.ts`](lib/storage-status.test.ts) IndexedDB
  availability detection (covers private-mode browsers).
- [`hooks/use-today.test.ts`](hooks/use-today.test.ts) and
  [`hooks/use-daily-log.test.ts`](hooks/use-daily-log.test.ts) date
  rollover at midnight and IDB hydration flow.
- [`tests/e2e/smoke.spec.ts`](tests/e2e/smoke.spec.ts) render, sidebar
  nav, food search, Auto-fill. Does not yet exercise the auth surface.

## Architecture

Single-page client app. View state lives in [`macro-calculator.tsx`](macro-calculator.tsx)
(the page root) and is wired into a sidebar-driven `AppShell`. Persistence
is layered:

1. **IndexedDB (always)** [`lib/db.ts`](lib/db.ts) is the source of truth
   on each device. Six stores: `profile`, `dailyLogs`, `weightHistory`,
   `customFoods`, `mealTemplates`, `recipes`. All entity ids are
   client-minted UUIDs so the same row can exist locally and on the server
   under the same key.
1. **Supabase (when signed in)** same six tables, RLS-scoped to the
   owner. [`lib/sync/`](lib/sync/) reconciles IDB ↔ Supabase once per
   sign-in (push every local row via upsert, then pull every remote row
   into IDB). Not a live channel manual re-sync via the topbar pill.
1. **Auth cookies** refreshed on every request by [`proxy.ts`](proxy.ts)
   (Next.js 16 renamed `middleware` → `proxy`) so the session stays valid
   across page loads.

Pure logic (`lib/macros.ts`, `lib/meal-planner.ts`, `lib/sync/mappers.ts`)
is kept free of React and IDB so it's testable in isolation.

```text
proxy.ts                          # Next.js 16 proxy  refreshes Supabase session cookies
app/
  layout.tsx                      # ThemeProvider, fonts, mounts SyncManager
  page.tsx                        # Single-page mount point
  globals.css                     # Monochrome design tokens (light/dark)
  login/page.tsx                  # Passwordless email-OTP sign-in
  auth/callback/route.ts          # PKCE code → session exchange
  auth/confirm/route.ts           # Magic-link verify (fallback path)
  api/off-search/route.ts         # Same-origin proxy to OFF Search-a-licious
  api/delete-account/route.ts    # Service-role admin.deleteUser (server-only)
  api/meal-plan/route.ts          # Claude Haiku 4.5 auto-fill (signed-in, opt-in via ANTHROPIC_API_KEY)
  api/recipes/generate/route.ts   # Claude Haiku 4.5 recipe generator (same gating)
components/
  shell/                          # AppShell, Sidebar, Topbar, UserMenu, MobileBottomNav,
                                  #   SyncManager, SyncStatusPill, DateNavigator,
                                  #   StorageBanner, MiniLineChart, NumberTicker,
                                  #   ThemeToggle
  macro/                          # Calculator, Meal Plan, ProgressView, RecipesView,
                                  #   SettingsView (account + export + delete),
                                  #   Add/Edit/Apply/Save dialogs (foods, templates,
                                  #   recipes), FoodItem, MealItem, PersonalInfoForm,
                                  #   DailyTotals
  ui/                             # shadcn primitives (Button, Input, AlertDialog,…)
hooks/
  use-user.ts                     # Supabase auth subscription
  use-profile.ts                  # IDB-hydrated profile state
  use-daily-log.ts                # IDB-hydrated day log state
  use-food-search.ts              # Debounced merged search (builtin + custom + OFF)
  use-today.ts                    # Live today-date, rolls at midnight
  use-mobile.tsx                  # Breakpoint helper
lib/
  db.ts                           # IndexedDB wrapper (idb)
  macros.ts                       # BMR, TDEE, target calories
  meal-planner.ts                 # 3×3 Cramer-based portion solver
  openfoodfacts.ts                # Client for /api/off-search
  ai-plan.ts                      # Client for /api/meal-plan with discriminated error mapping
  ai/env.ts                       # Server-only ANTHROPIC_API_KEY accessor
  ai/anthropic-helpers.ts         # Shared cache_control helper for both agent routes
  ai/off-search.ts                # Server-side OFF wrapper (5s timeout, used by both AI routes)
  ai/plan.ts                      # AI meal-plan response → Meal[] converter (catalog matching, portion clamp/snap)
  ai/recipe.ts                    # AI recipe submit → Recipe converter (same matching + macro snapshot)
  export.ts                       # Bundle IDB → downloadable JSON
  storage-status.ts               # IDB availability detection
  sync-status.ts                  # Sync pill global store (useSyncExternalStore)
  sync/index.ts                   # runInitialSync, triggerSync (push + pull)
  sync/mappers.ts                 # camelCase ↔ snake_case row mappers
  supabase/
    env.ts                        # NEXT_PUBLIC_ + server-only secret config
    client.ts                     # Browser singleton (publishable key)
    server.ts                     # Cookie-bound server client
    proxy.ts                      # Session refresh used by proxy.ts
data/food-database.ts             # Built-in foods
supabase/
  config.toml                     # CLI config
  migrations/0001_init.sql        # Tables + RLS for the first five stores
  migrations/0002_custom_foods_diet_kind.sql  # Adds diet_kind to custom_foods
  migrations/0003_recipes.sql     # Adds the recipes table + RLS + updated_at trigger
tests/e2e/smoke.spec.ts           # Playwright smoke
```

## Open Food Facts

The browser can't reach `search.openfoodfacts.org` directly (no
`Access-Control-Allow-Origin`). Requests go through `app/api/off-search/`,
which:

- Validates `q` and clamps `limit` (1–25)
- Sends a `User-Agent` per OFF's API guidelines
- Forwards the client `AbortSignal`
- Adds `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
- Returns `502` on upstream failure

## Deployment

The main app is a standard Next.js 16 deploy on Vercel; no special build step.
Two things that have bitten this repo and aren't obvious:

- **`NEXT_PUBLIC_*` env vars are inlined at build time, not read at
  runtime.** If you add or change `NEXT_PUBLIC_SUPABASE_URL` or
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel, you must **redeploy
  with the build cache disabled** for the new values to land in the
  client bundle. Symptom of a stale build: the deployed `/login` page
  says "Supabase isn't configured for this build". Verify by viewing
  source on `/login` and searching for `supabase.co` if it's missing,
  the env wasn't in the build.
- **Set env vars for the Production environment** (Vercel checkboxes
  Production / Preview / Development). Custom domains serve the
  Production deployment, so a var that's only ticked for Preview won't
  reach your `*.app` hostname.
- **Supabase URL configuration is strict-matched.** Each domain you
  serve from needs entries in Supabase Dashboard → Authentication →
  URL Configuration:
  - **Site URL** primary host (`https://your-domain.app`)
  - **Redirect URLs** `https://your-domain.app/auth/callback`,
    `https://your-domain.app/auth/confirm`, plus the localhost and
    preview-deployment equivalents you still test from.
    Without these the OTP/magic-link flow will reject the callback even
    if the env vars are correct.
- **Server-only `SUPABASE_SECRET_KEY`** (no `NEXT_PUBLIC_` prefix) must
  also be in Vercel for `/api/delete-account` to function. Leave it
  unset and the rest of the app works fine the Delete account button
  just shows a "not configured" message.

## Roadmap

Done:

- **Phase 1** visual / layout revamp, theme, motion, sidebar nav.
- **Phase 2** Profile + meal-log persistence in IndexedDB.
- **Phase 3** Daily-log history (date navigator), saved meal templates,
  weight history, progress charts (sparkline + macro-adherence).
- **Phase 4** Supabase backend: email-OTP auth, Postgres schema with RLS,
  one-shot push/pull sync on sign-in, manual re-sync, automated migrations
  via the Supabase CLI + GitHub Actions.
- **Phase 5 (account management)** Change email, export-as-JSON,
  delete-account (cascades server-side via FK, wipes IDB locally).
- **Phase 6 (UX + AI)** Drag-and-drop foods between meals (`@dnd-kit`),
  pending-changes signal on the sync pill, inclusive gender options +
  diet-preference filtering, classifiable My Foods view, mobile bottom
  tab nav, and AI-generated meal plans via Claude Haiku 4.5 with
  deterministic fallback.
- **Phase 7 (Recipes)** Named bundles of ingredients with optional
  cuisine + prep notes. Manual CRUD, AI generation (review-before-save),
  and "Apply recipe" from any meal-slot menu. Reuses the meal-plan
  agent-loop hardening: prompt caching, OFF-search timeout, in-loop
  validation feedback when the model paraphrases names past matching.
  Stored client-minted in `recipes` IDB store + Supabase table with RLS.

Possibly next (not committed, in rough priority order):

- **Defensive sync** 60s timeout + `AbortSignal` on every Supabase call
  inside `runInitialSync` so an upstream hang turns into "Sync error"
  rather than an indefinite spinner.
- **Auth + sync E2E coverage** Playwright spec that signs in, asserts
  the sync pill cycles to "Synced", signs out. Gated on env so it skips
  locally without creds.
- **Change-email via OTP code** match the sign-in UX. Today it uses
  Supabase's confirmation link, which is fragile cross-device for the
  same reason we abandoned PKCE links at sign-in.
- **JSON import** the dual of `lib/export.ts`. Currently you can take
  your data out; you can't put it back in.

## Status

`make ci` green: lint 0, tsc 0, **176 unit tests** across 15 files, build,
security audit. 3 Playwright smoke tests pass against the dev server.

[Apache License 2.0](./LICENSE)
