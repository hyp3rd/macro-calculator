# Macro Calculator

A personal macro calculator and meal planner. Single-page Next.js app, no
backend, no accounts — your custom foods live in your browser's IndexedDB.

## What it does

- **Calculator** — Mifflin-St Jeor BMR, TDEE from activity, target calories
  from a signed weekly weight-change rate (1 kg ≈ 7700 kcal, clamped at
  ±1%/week of bodyweight and floored at `max(BMR, 1200)`). Optional manual
  TDEE override for calibrating against real-world weight change when the
  textbook formula misses.
- **Meal Plan** — log foods against four meals (Breakfast / Lunch / Dinner
  / Snacks); auto-fill a day that hits your macro targets via a 3×3 linear
  solve over a protein-dominant / carb-dominant / fat-dominant food triplet,
  with portions snapped to 5 g.
- **Food search** — three sources merged into one box:
  - **Built-in**: a curated set in `data/food-database.ts`
  - **My foods**: custom foods you saved (IndexedDB, persists across reloads)
  - **Open Food Facts**: live search via a same-origin proxy at
    `/api/off-search` (caches 60 s at the edge). "Save to my foods" copies an
    OFF result into IndexedDB so it's available offline next time.

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
| Unit tests    | Vitest                                                       |
| E2E tests     | Playwright (Chromium)                                        |
| Lint          | ESLint 9 flat config via `eslint-config-next`                |
| Format        | Prettier 3                                                   |

## Requirements

- Node.js ≥ 22 (the repo's `.nvmrc` pins 25)
- npm

## Setup

```bash
nvm use            # picks up Node 25 from .nvmrc
npm install
cp .env.local.example .env.local   # optional — only needed for auth/sync
npm run dev        # http://localhost:3000
```

Without `.env.local` the app runs in **guest mode**: everything is stored
in IndexedDB on this device and there's no sign-in. To enable multi-device
sync, follow Supabase setup below.

### Supabase setup (auth + sync, optional)

The app uses Supabase as the cloud backend for auth (magic link) and
multi-device sync. Locally it runs fine without it — sign-in is disabled
and the app stays on IndexedDB.

1. Create a project at <https://supabase.com> (free tier is enough).
2. In the Supabase dashboard, go to **Project Settings → API** and copy
   the **Project URL** and the **anon public** key.
3. Paste them into `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc…
   ```

4. Run the schema migration in the dashboard's **SQL Editor**: open
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql),
   paste it, run it. This creates five tables (`profiles`, `daily_logs`,
   `weight_history`, `custom_foods`, `meal_templates`) with row-level
   security so users only see their own rows.
5. In **Authentication → URL configuration**, add `http://localhost:3000`
   to the **Site URL** and add `http://localhost:3000/auth/callback` to
   **Redirect URLs**. Repeat for your production URL when you deploy.
6. Restart `npm run dev`. The sidebar should now show "Sign in" instead
   of "Guest".

Note: free-tier Supabase projects pause after a week of inactivity and
auto-resume on the next request (one-time delay of a few seconds).

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

- `lib/macros.test.ts` — TDEE math, deficit/surplus symmetry, rate cap,
  BMR/1200 floor, manual TDEE override path.
- `lib/meal-planner.test.ts` — `det3` / `solve3x3`, near-singular rejection,
  `planMeal` hits targets within tolerance, custom-foods inclusion, full-day
  `planDay` summary.
- `lib/db.test.ts` — `addCustomFood` against `fake-indexeddb`, including a
  regression for the `keyPath` + `autoIncrement` + `id: undefined` crash.
- `tests/e2e/smoke.spec.ts` — render, sidebar nav, food search, Auto-fill.

## Architecture

Single-page client app. State lives in `macro-calculator.tsx` (the page
root) and is wired into a sidebar-driven `AppShell`. The pure calculation
and planning logic is extracted to `lib/macros.ts` and `lib/meal-planner.ts`
so it's testable in isolation.

```text
app/
  api/off-search/route.ts   # Same-origin proxy to OFF Search-a-licious
  globals.css               # Monochrome design tokens (light/dark)
  layout.tsx                # ThemeProvider, fonts
components/
  shell/                    # AppShell, Sidebar, Topbar, ThemeToggle, NumberTicker
  macro/                    # Calculator + Meal Plan screens
  ui/                       # shadcn primitives
hooks/use-food-search.ts    # Merged debounced search
lib/
  db.ts                     # IndexedDB wrapper (idb)
  macros.ts                 # BMR, TDEE, target calories
  meal-planner.ts           # 3×3 Cramer-based portion solver
  openfoodfacts.ts          # Client for /api/off-search
data/food-database.ts       # Built-in foods
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

## Roadmap

Done:

- Phase 1 — visual / layout revamp, theme, motion, sidebar nav.

Next:

- Phase 2 — Profile data model + persistence. `personalInfo`, meal log, and
  weight history move from React state into IndexedDB (extending what
  `lib/db.ts` already does for custom foods).
- Phase 3 — Saved meal templates, daily log history, progress charts.

## Status

`make ci` green: lint 0, tsc 0, 28 unit tests, build, security audit. 3
Playwright smoke tests pass against the dev server.

No LICENSE file present in the repo at the moment.
