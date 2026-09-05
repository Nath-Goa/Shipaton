# CLAUDE.md — Shipaton / Stock Market Predictor and Tutor

This file is permanent project memory, auto-loaded at the start of every session in this repo. It is the single source of truth for how this project works — read it before doing anything else.

**Keep it current.** When asked to "update CLAUDE.md" (or similar), edit this file in place to reflect the new state — don't create separate handoff/summary files elsewhere in the repo for this purpose. This file is the one that travels with every new chat.

App code lives in the **`Expense Tracker/`** subfolder of this repo, not the repo root — `cd` there for all `npm`/`expo`/`tsc` commands.

---

## 1. Project goals

Built for the **RevenueCat Shipaton** hackathon (team: Nathan Kumtakar, Arya Kakani). A combined "financial life" app: **mock/paper stock trading** + a **personal expense tracker**, wrapped in one app so a subscription (via RevenueCat) has enough real feature surface to gate meaningfully. Everything financial is simulated — no real brokerage, no real bank connection, no real money at risk. The pitch is educational: practice trading and budgeting with zero real-world downside, while learning the underlying concepts through the Learn tab.

## 2. Working conventions — read before doing anything

**The user works entirely from an Android phone — no laptop, no terminal of their own.** Claude drives the entire dev workflow directly. These rules are established and must keep holding across every session:

- **Always commit and push directly to `main`.** Never a feature branch, never a PR for routine work — there's no practical way for the user to review one from a phone.
- **Never trigger a new EAS Build unless explicitly asked** ("trigger build" / "trigger the build"). Pushing to `main` is routine; a build is a separate, explicit, costed action.
- **Real secrets only in the local `.env`** (gitignored) or the **EAS dashboard's environment variables** — never committed. `.env.example` documents every variable.
- Loop for every change: implement → `npx tsc --noEmit` clean → self-review the diff for correctness → commit with a real, descriptive message → push.
- **The user's bug reports are plain and sometimes vague, from live device testing** ("the home button doesn't work", "for some reason when I open a tab..."). Treat every one as a real bug and root-cause it in the code — every report so far has pointed at a genuine bug, never user error.
- Artifacts (design docs, handoffs, written summaries) go to Claude Artifacts when the user wants something to read/share, not into the repo — unless, as with this file, they explicitly ask for it to live in the codebase.

`AGENTS.md` (in `Expense Tracker/`) says: *"Expo HAS CHANGED — read the exact versioned docs at docs.expo.dev/versions/v57.0.0 before writing any code."* Expo SDK is **57.0.19** — don't assume older-SDK APIs still apply.

## 3. Tech stack

- **Expo SDK 57**, React Native, TypeScript, **expo-router** (file-based routing, typed routes)
- **Zustand** for all state, `persist` + `createJSONStorage(() => AsyncStorage)` for anything that survives restarts
- **react-native-reanimated** for animation (spring configs centralized in `constants/animations.ts`), plus a sound/haptic feedback helper (`triggerFeedback(category)`)
- **RevenueCat** (`react-native-purchases` + `react-native-purchases-ui`) for subscriptions — dev-mode tier switcher when no API key is configured
- AI: direct HTTP to **Claude, OpenAI, Gemini, and OpenRouter** — no SDK abstraction layer beyond `services/ai/client.ts`
- **Sentry** for crash reporting (no-op without a DSN), **expo-notifications**, **expo-local-authentication** (biometric lock), **expo-store-review**, **expo-sharing** + **react-native-view-shot** (share-as-image), **@react-native-community/datetimepicker**
- **No automated test suite.** Verification is `tsc --noEmit` + manual/self code review only. Be extra careful with anything load-bearing (recurring-cursor math, date arithmetic, store-selector purity) — nothing will catch a regression automatically.
- **`npx expo export --platform android --output-dir <tmp>` is the strongest check available short of a build**, and worth running after any change that touches imports, routes, or assets. It statically requires every route file and compiles the whole bundle to Hermes bytecode, so it catches unresolved imports, missing assets, and module-init errors that `tsc --noEmit` cannot see. Takes a few minutes; write the output somewhere temporary, never into the repo.

## 4. Repository structure

```
Expense Tracker/                (app root — cd here for everything)
  app/
    _layout.tsx                 Root layout: onboarding gate, app lock, startup
                                 effects (dividends/auto-invest/goal-contributions/
                                 bill-reminders processing, RevenueCat sync, review prompt)
    (tabs)/_layout.tsx           Sliding tab navigator config (6 tabs) — §5.1
    (tabs)/index.tsx             Home
    (tabs)/learn/                 Learn — index, quiz, flashcards, narrative
    (tabs)/markets/                Markets — index, [symbol], practice, backtest,
                                    portfolio/ (nested Stack: index, manage,
                                    leaderboard, networth, trade/[symbol]) — §5.1
    (tabs)/news/                     News — index (sectioned market/trending/
                                      per-stock headlines, hourly) — §5.1
    (tabs)/expenses/                   Expenses — index, add, [id], budgets, goals
    (tabs)/assistant/                   Assistant — AI chat
    settings/                           index, upgrade (paywall), achievements
    recap.tsx                           Weekly Recap — full-screen "Wrapped"-
                                         style card deck, opened from Home
  store/            Zustand stores — see §5.2 (usePredictorStore, documented
                     in §5.4 alongside the rest of the predictor, is one of
                     several added since §5.2's table was last refreshed —
                     that table is known stale, not a to-do for this session)
  services/         ai/, marketData/, purchases/, notifications/, export/,
                     receipts/, leaderboard/, market/, sound/, monitoring/,
                     predictor/ (trained price-direction model — §5.4), news/
                     (services/news/newsFeed.ts + sentiment.ts — real Yahoo
                     headlines + on-device scoring, feeds both the predictor
                     and the News tab), scanner/ (camera capture, mirrors
                     receipts/), arena/ (self-contained $100k-vs-AI engine —
                     never touches the real/mock market data other screens
                     read), social/ (supabaseClient.ts, friends.ts,
                     families.ts, duels.ts — Phase 2 accounts, see §5.8),
                     recap/ (weeklyRecap.ts — local-only "Wrapped" deck
                     builder, no AI dependency, see §5.4)
  scripts/          Node-only tooling (npm run eval:predictor / sweep:predictor /
                     test:news) — excluded from tsconfig, never shipped
  supabase/         schema.sql — paste-and-run in the Supabase SQL Editor;
                     not applied by the app itself, no migration tooling
  components/       ui/, charts/, expenses/, portfolio/, markets/, stocks/,
                     chat/, reviews/, security/, settings/, onboarding/, games/,
                     navigation/ (SlidingTabs, MarketsPortfolioSwitch),
                     scanner/ (CompanyResultSheet), news/ (NewsCard),
                     recap/ (RecapCardView — the Weekly Recap deck's per-card
                     view, §5.4), auth/ (SocialAuthGate — scoped to the
                     social screens only, not an app-wide gate; the earlier
                     AuthGate.tsx that DID gate the whole app was built and
                     deleted in an earlier session — §5.8's history note).
  constants/        theme, animations, subscription, categories, tickers,
                     badges, quizTopics, quizBank, flashcardBank, courses
  hooks/            useTheme, useQuotes, useAiQuota, useHasApiKey, useUpgradeToTier
  utils/            date, money, id, confirm, portfolioMath, stats, prng
  types/            ai, chat, expense, narrative, quiz, stock, prediction, pattern
```

## 5. Architecture

### 5.1 Navigation

`expo-router` with a `(tabs)` group of six tabs — **Home, Learn, Markets, News, Expenses, Assistant**. Each tab is its own `Stack`, so pushed sub-screens (`expenses/add`, `markets/[symbol]`, `markets/portfolio/manage`) unmount/remount normally on push/pop. Settings is a sibling stack off Home's gear icon.

**Portfolio is not a bottom tab — it's nested under Markets** (`app/(tabs)/markets/portfolio/`, its own Stack: `index`, `manage`, `leaderboard`, `networth`, `trade/[symbol]`), reached via `router.push('/markets/portfolio')`/`router.replace`, not a peer route in the tab bar. This was a deliberate fold, not a demotion: six bottom tabs plus a requested seventh (News) was one too many, and Markets/Portfolio are two views of the same trading domain (you check one to inform the other) rather than genuinely separate ones — Learn, Expenses, and Assistant stayed as full tabs because they're not naturally paired with anything else. `components/navigation/MarketsPortfolioSwitch.tsx` is a small `SegmentedControl` rendered at the top of both `markets/index.tsx` and `markets/portfolio/index.tsx` that `router.replace`s between them (replace both ways, so ping-ponging between the two never grows the stack) — it's what makes the fold read as flipping between peer sections rather than drilling into a sub-screen. **If you ever add a `router.push`/`ctaRoute`/deep-link to `/portfolio/...`, it's stale** — the route is `/markets/portfolio/...` now. **Nothing in the verification loop catches a stale route**, so this has to be checked by reading: `experiments.typedRoutes` is on in `app.json`, but the generated route union lives in `.expo/types/`, which only the dev server writes and which does not exist in a fresh clone — `npx tsc --noEmit` therefore passes cleanly on `router.push('/this/does/not/exist')` (verified directly, not assumed). `constants/courses.ts`'s `ctaRoute` is additionally a plain `string`, cast `as any` at its one call site.

**Tabs slide horizontally**, via a custom navigator in `components/navigation/SlidingTabs.tsx` — expo-router's stock `<Tabs>` is no longer used. All six tabs live in one row `tabCount` screens wide, and switching animates that row's `translateX`, so jumping several tabs at once physically travels past the ones in between and you see them go by. A stock bottom-tabs navigator cannot do this: it only ever renders the focused screen.

It's built on React Navigation's supported custom-navigator API — `useNavigationBuilder(TabRouter)` + `createNavigatorFactory`, surfaced to expo-router through `withLayoutContext` (React Navigation is re-exported from `expo-router/react-navigation` in SDK 57; there is no separate `@react-navigation/*` dependency). Routing and per-tab nested stacks are untouched — only presentation changed. No native dependency was added (`react-native-pager-view` is deliberately not used).

Details that matter if you touch it: slide duration scales with distance (300ms for a neighbour, +55ms per extra tab, capped at 560ms — well inside the 1.5s ceiling) on a Material-3 "emphasized decelerate" curve, with no spring, so there's no overshoot to read as flutter. Off-centre tabs dim and scale back very slightly so a long slide reads as passing real screens. **The tab bar is rendered by this navigator** (blur, labels, icons, and the circular active pill), and the pill is driven by the *same* shared value as the content, so indicator and screens move as one. Tab roots stay mounted once rendered; the focused tab renders immediately and the rest are warmed ~700ms after first paint, so a slide has real content to travel past without putting all six screens on the startup path.

### 5.2 State — 15 Zustand stores (`store/`)

All persisted stores use AsyncStorage via `persist`. Cross-store calls go through `useXStore.getState()` — an established pattern, not an accident.

| Store | Purpose |
|---|---|
| `useExpenseStore` | Expenses, recurring-expense series (cursor-based catch-up), round-up-savings trigger on add |
| `useBudgetStore` | Overall + per-category monthly budgets |
| `useSavingsGoalStore` | Goals: create/contribute/delete, recurring auto-contributions, round-up target |
| `usePortfolioStore` | Multiple portfolios (Max), trades, dividends, limit orders, auto-invest, watchlist |
| `useMarketStore` | One `epoch` counter — bumping it re-seeds the whole mock market |
| `useStockViewStore` | Free-tier "5 lookups/day" gate + simulated ad-slot counter |
| `useStreakStore` | Daily streak, badge list, pattern/analyst counters |
| `useQuizStore` | Per-topic progress, spaced-repetition due dates, mastery |
| `useFlashcardStore` | Flashcard deck progress/history per topic |
| `useWeeklyRecapStore` | Caches the last AI weekly recap until manually refreshed |
| `useChatStore` | Assistant chat threads (general + per-symbol) |
| `useAiUsageStore` | Shared daily AI-action counter (only meaningful without a personal key) |
| `useSettingsStore` | Theme, accent, tier, AI provider/keys, notifications, biometric lock, broken-key flags |
| `useReviewStore` | Whether the in-app review prompt has fired |
| `useToastStore` | Global single-slot toast (not persisted) |

### 5.3 AI subsystem

`services/ai/client.ts` is the **single dispatch point for every AI feature** (chat, quizzes, daily challenges, pattern detection, receipt auto-fill, spending insight, weekly recap) — never call a provider file directly from a screen. It picks the user's provider + key (or falls back to a shared key), exposes `sendStructuredPrompt<T>()` as the workhorse for every "give me back JSON" feature, enforces `AI_FEATURE_DAILY_LIMIT[tier]` only while on a shared key, races Gemini against a shared OpenRouter free model when both are configured, and tracks broken personal keys so the UI can nudge instead of silently failing. Prompts live in `services/ai/prompts.ts`; error copy goes through `services/ai/errorMessage.ts`.

### 5.4 Market data

`services/marketData/marketData.ts` is the only module screens import from; it always dispatches to `liveMarketData.ts`, which tries **Twelve Data** first when `EXPO_PUBLIC_TWELVEDATA_API_KEY` is set, then **Yahoo Finance's** free unofficial chart endpoint (`yahooFinance.ts`, no key needed), and only falls back per symbol to `mockMarketData.ts` — fully local, deterministic, 400 days of seeded history per symbol. Reads are always synchronous: a symbol paints instantly from cache (mock on first paint) and swaps once a background fetch lands. TTLs are 6h bars / 5min quotes. Bars persist to AsyncStorage (debounced, trimmed to 400 sessions), so `quoteFromBars` can serve a real price even when a live quote hasn't landed.

**Live fetching must stay throttled and backed off — this is load-bearing, not tuning.** Screens poll `getQuote` every 3s across every tracked symbol, so an ungoverned refresh fired ~27 simultaneous requests every 3 seconds (~540/min). Yahoo rate-limits that instantly, and because a symbol's `fetchedAt` is only stamped on *success*, every failure was permanently past its TTL and retried the same burst forever — the app could never recover and every price stayed mock indefinitely. That was the real reason "live prices don't work" survived several rounds of fixes. All network work therefore goes through `liveMarketData.ts`'s queue (max 4 in flight, ≥120ms apart — bumped once from 3/150ms after measuring headroom, still nowhere near the ~27-at-once burst above; loosen further only with a real measurement, not a guess) with per-symbol exponential backoff (15s → 5min). Quote refreshes use a cheap 5-day range and **must never write to `barsCache`** (a 5-day series would overwrite the 2-year history charts depend on *and* satisfy the 6h bars TTL). `Settings › Market data` renders `getMarketDataStatus()` — provider, live-symbol counts, request/failure counts, last error — so a failing install can be diagnosed from the device instead of guessed at.

**Search beyond the curated 27**: `getQuote`/`getHistory`/`getFullHistory` already worked for *any* symbol string before this was added — they fall through live fetch → cached bars → the mock engine's generic per-symbol defaults (`tickerOf(symbol) ?? { basePrice: 100, volatility: 0.02 }`), never require a `TICKERS` match. Markets' search bar now uses that: once the local `TICKERS` filter comes up empty, a debounced `searchSymbols()` (new, `yahooFinance.ts`, the `/v1/finance/search` endpoint's `quotes` array — same endpoint `newsFeed.ts` already hit for `news`) looks up real tickers, and tapping one opens a **reduced** `markets/[symbol].tsx` view: live price + chart + watchlist only, no buy/sell/predictor/forecast/sentiment, since none of those are measured or fitted for anything outside the curated universe and showing them would overclaim. `tickerOf(symbol)` returning `undefined` is exactly the branch that renders this reduced view — don't reintroduce the old flat "Unknown symbol." there.

`computePortfolioVsBenchmark`'s date "spine" is anchored on `TICKERS[0]` (fine — it needs the full ticker universe anyway); `computeNetWorthHistory`'s spine is anchored on whichever *traded* symbol has the longest cached history. These are deliberately different — don't unify them.

**News tab** (`app/(tabs)/news/`, data in `services/news/marketNews.ts`) reuses `services/news/newsFeed.ts`'s `fetchHeadlines` — the same Yahoo search endpoint the predictor's headline scan uses — sectioned into Market (general), Today's biggest movers (reuses the mover concept from `MarketSpotlightCard`), and one section per symbol held or watchlisted (capped at 12). **The general/"Market" section queries three real index symbols (`^GSPC`/`^DJI`/`^IXIC`), not a free-text search** — an earlier version queried the literal string `"stock market news"`, and a loose text match against Yahoo's search endpoint could (and did) pull back off-topic results that only mentioned "stock" or "market" in passing. Querying a real ticker gets Yahoo's actual per-security news feed instead — the same mechanism every per-stock section already relied on — so the fix was to make the general section use it too, merging and deduping the three feeds by id and re-sorting by recency. It inherits the rate-limit lesson above rather than repeating the mistake: every section has its own 1h TTL cache (5min if that section's last fetch came back empty, so a dead endpoint retries on the next visit instead of sitting dark for the full hour), and real fetches within one `loadMarketNews()` call run sequentially with a 250ms gap between them (mirroring `services/predictor/startupScan.ts`'s existing spacing), never in a burst. A pull-to-refresh (`loadMarketNews(true)`) bypasses every section's TTL; the screen also re-runs a normal (TTL-respecting) load every hour while it sits focused, since the TTL alone only refetches on the *next* call, which wouldn't happen if someone just leaves the tab open. Presented via `components/news/NewsCard.tsx` as an InShort-style single-headline-at-a-time swipeable feed. The AI gloss (`explainHeadlineCached`, `services/ai/learn.ts`) loads **automatically** for whichever single card is currently centered (tracked via the feed's `onViewableItemsChanged`) — not an "Explain this" button any more — so the app answers "why does this matter" without the user leaving for the source link, at the same cost as the old on-demand version (one call per newly-viewed headline; the shared module-wide cache, keyed by headline id, is what makes re-swiping back free). The same cached-explain function feeds the product scanner's per-candidate news too (§9) — never call the underlying `explainHeadline` directly from a screen, always through the cache wrapper.

**Weekly Recap** (`app/recap.tsx`, deck built by `services/recap/weeklyRecap.ts`) is a Spotify-Wrapped-style full-screen card deck, opened from a launcher card on Home. **Deliberately has no AI dependency** — every card is computed synchronously from local state (portfolio, watchlist, expenses, goals, streak) so it renders instantly and works the very first time someone opens the app, before any AI call, network request, or a week of real activity could exist. The stock-focused cards (biggest weekly mover, average weekly change) use the union of held + watchlisted symbols when there is one, and fall back to the whole `TICKERS` universe — a genuine general-market recap — when there isn't; the portfolio/expenses/goals cards are each independently conditional on that data existing, but intro, the stock card, the streak card, and the outro are unconditional, so the deck is never fewer than those. Weekly price change per symbol comes from `getFullHistory` bars (closest bar to 7 days back vs. the latest), not `Quote.changePct` (that's a single day's move). Navigation is tap-driven — a left-third/right-two-thirds tap split like Stories apps — built on the exact `translateX`-row technique `SlidingTabs.tsx` already uses to slide between tabs, not a `FlatList`'s own scroll (no dependence on `scrollToOffset` behaving a particular way against a disabled-scroll list). A single shared value drives the currently-active Stories-style progress segment's fill (segments before/after it just render as a plain full/empty bar, so the deck's length doesn't need one shared value per card), and it resets on every index change — whether that came from the 15s auto-advance timer or a manual tap — restarting both the fill animation and the timer together. Each card's pop-in animation is driven by an `isActive` prop change inside `components/recap/RecapCardView.tsx`, not a remount, for the same touch-hit-testing reason as rule #2 below. No gradient library is installed (adding one is a new native dependency needing a fresh EAS build), so each card gets a solid tone color from the existing palette (`success`/`danger`/`warning`/`accent`/neutral `surface2`) instead — `colors.onAccent` already flips per theme for exactly this kind of bright-background text, reused for every tone, not just `accent`. The old AI-generated text recap (`useWeeklyRecapStore`, `generateWeeklyRecap`, `buildWeeklyRecapPrompt`) was removed entirely rather than kept alongside this — it's what the Home launcher card used to open inline, and there's no reason to maintain two disconnected "weekly recap" concepts.

### 5.5 Subscriptions

Free / Pro / Max. `constants/subscription.ts`'s `TIER_FEATURES` is the single source of truth for what unlocks per tier. Demo pricing: Pro $5/mo · $49.99/yr · $129.99 lifetime — Max $15/mo · $139.99/yr · $349.99 lifetime (real store prices once RevenueCat is configured). Without a RevenueCat key, the paywall shows a **dev-only tier switcher** instead of real purchases — intentional.

### 5.6 Notifications

Local-only, no backend. Three kinds, each idempotent: 8pm daily check-in, same-day 9pm "streak at risk" nudge, per-recurring-expense "due tomorrow" 9am nudge. All gated behind the notifications toggle *and* `TIER_FEATURES[tier].pushAlerts` (Pro/Max).

### 5.7 Gamification

`useStreakStore.awardBadge(id)` is a generic, idempotent one-off award. `constants/badges.ts` is the single badge registry — a new badge needs an entry there plus an `awardBadge` call. `app/settings/achievements.tsx` renders every entry, earned or locked.

### 5.8 Accounts + Friends/Families/Duels (Supabase)

**Built and shipped.** The rest of the app still needs no account at all — the only place that ever asks for one is `/markets/portfolio/social` (an icon on Portfolio's TopBar), gated by `components/auth/SocialAuthGate.tsx`. Unlike the deleted app-wide `AuthGate.tsx` (history below), this gate is rendered *only inside* the social screens — sign in, use Friends/Family/Duels, sign out, and every other tab is completely unaffected either way. `store/useAuthStore.ts` (signUp/signIn/signOut/requestPasswordReset, mirrors Supabase's own auth listener) is only initialized (`useAuthStore.getState().init()`) when the social screen actually mounts, not app-wide.

**Friends** (`services/social/friends.ts`): add by email via `find_profile_by_email()`, a `SECURITY DEFINER` Postgres function — email is deliberately never exposed through a direct `profiles` SELECT (see the column-privilege lockdown in `schema.sql`: `revoke select on profiles from authenticated; grant select (id, display_name, created_at) ...`), so this RPC is the only way to resolve an email to a user id, and it only ever returns id/display_name. Send/accept/decline/unfriend all go through the `friendships` table directly under RLS.

**Families** (`services/social/families.ts`): create or join. **A family's own `uuid` is its invite code** — no separate short-code generation; sharing an unguessable id is the same trust model as a shareable link, and `family_members`'s insert policy already allows any signed-in user to add themselves to a family id they were given.

**Duels** (`services/social/duels.ts`): challenge a friend, or another family. **A duel does not run a second market or a simulated clock** — it scores each participant's *existing* active portfolio (the one they already trade in the Portfolio tab) by % net-worth change from a baseline captured at challenge/accept time, over the duel's real-time window. That's the whole design rationale: no need to keep two devices' simulated time in sync, no second price engine — this app already has one real, live market, and a duel is just a lens on it. **A family duel currently compares the two families' owner/representative — not a full-member-roster aggregate**: a true aggregate needs every member's own device to individually report a baseline, which needs its own per-member join flow this pass didn't build; noted as a real follow-up in `duels.ts`'s `challengeFamily` comment, not a silent limitation. "No time-skipping unless everyone agrees" (new `duelTimeSkip` flag, Pro/Max, `constants/subscription.ts`) is reframed as *voting to end the duel early* rather than fast-forwarding time, for the same "no simulated clock" reason. Every write that touches shared state (net worth, time-skip votes) goes through a Postgres RPC (`report_duel_net_worth`, `cast_duel_time_skip_vote`, `finalize_duel_if_ready`) rather than a client-side read-modify-write, to stay race-free against the other participant's device — a plain `.update()` from two clients at once would silently drop one side's write. Finalizing a duel is **resolve-on-view** (checked via `finalize_duel_if_ready` whenever a duel screen opens), the same pattern as recurring expenses/dividends/limit orders (§7 rule #6) rather than a server cron job. Live score updates push via a Supabase Realtime channel per duel (`subscribeToDuel`).

**Two manual steps still needed before any of this actually works against a real project — the code is done, the backend isn't provisioned yet:**
1. **Re-run `supabase/schema.sql`** in the dashboard's SQL editor — it's additive/idempotent (`if not exists`, `create or replace`, `drop policy if exists` throughout) so re-running it on top of the Phase 2 foundation schema is safe, but it has to actually be run: it's what adds the `profiles.email` column + lockdown + RPC, the duel RPCs, and the friendships/family_members delete policies.
2. **Turn on Realtime for the `duels` table** — Database → Replication in the dashboard, toggle `duels` onto the `supabase_realtime` publication. Not something `schema.sql` can safely do itself (publication membership isn't reliably idempotent via plain SQL across Postgres versions). Without this, everything still works — `subscribeToDuel` just never fires, so a duel's score only updates on the next manual open/refresh instead of pushing live.

Neither of those has been done by a Claude session — confirm with whoever has dashboard access before assuming duels work live.

History worth knowing, so the app-wide version doesn't get rebuilt the same way twice: an earlier `components/auth/AuthGate.tsx` was built and wired into `app/_layout.tsx`, gating the *entire app* behind a real Supabase session before anything else could be reached. That broke the two fake "owner" dev-login accounts (Settings' 9-tap tier switcher) — they became unreachable once Settings itself was locked behind a real sign-in first. Rather than special-case those fake accounts into the real login screen, the login wall was removed entirely: nobody had asked for the whole app to require login just to use it. That `AuthGate.tsx` was deleted; the current `SocialAuthGate.tsx` is a different, narrower component built specifically to avoid repeating that mistake.

**A real crash was found and fixed here, and the fix must stay**: Expo Router's web output does an initial server-side render pass (plain Node, no `window`), and Supabase's client touches session storage the moment it's constructed — with no guard, that killed the entire dev server (`ReferenceError: window is not defined`, process exit code 7), not just a caught browser error. `supabaseClient.ts` disables `persistSession`/`autoRefreshToken` and the `storage` adapter whenever `typeof window === 'undefined'`. Do not remove that guard.

## 6. Feature inventory, by tab

- **Home** — net worth/P&L stats, free-tier upsell, watchlist, quick actions (Portfolio/Log expense/Explore markets/Ask the analyst, 2x2), a **Weekly Recap** launcher card opening `/recap` (see below)
- **Learn** — streak/badges, spaced-repetition next-topic, flashcards, narrative daily challenge, full topic list; bank-first content with AI fallback
- **Markets** — searchable ticker list (falls back to a live symbol search for anything outside the curated 27 — §5.4), watchlist stars, trend summary, practice trade, regenerate market, scan a product, backtest (Max), per-symbol detail with a trained price-direction model, forecast band/sentiment (Pro+); **Portfolio** lives here too (§5.1), reached via the Markets/Portfolio switch or `router.push('/markets/portfolio')` — multi-portfolio (Max), net worth history, vs-benchmark chart, holdings, diversification donut, auto-invest plans, dividend income, recent trades, share-as-image, leaderboard, **Friends/Family/Duels** (`/markets/portfolio/social` — §5.8, needs a Supabase account, everything else in the app doesn't)
- **News** — InShort-style single-headline-at-a-time swipeable feed (general market via real index symbols, today's biggest movers, one section per held/watchlisted stock), refreshes hourly, star a stock right from its card, an AI gloss loads automatically for the focused headline (§5.4)
- **Expenses** — filterable list, category donut, AI spending insight, budgets, savings goals (manual + recurring + round-up), CSV export
- **Assistant** — general + per-symbol chat threads, history, quota/broken-key messaging

Starring a stock (the watchlist) is one mechanism used everywhere: `usePortfolioStore`'s `watchlist`/`toggleWatchlist`, surfaced via the shared `components/stocks/StarButton.tsx` on Markets' list, Home's watchlist section, and News' per-stock section headers. It's always been unrestricted (no tier gate) and always meant "save and monitor without buying" — if a future request asks to "add starring," check here first before building a second mechanism.

## 7. Coding standards — non-negotiable, each backed by a real bug this project already shipped and fixed

1. **Zustand selector referential stability.** A selector passed to `useStore(selector)` must return an `Object.is`-stable value across calls against an unchanged snapshot. Never return a freshly built array/object/Set/Map (`.map()`, `.filter()`, `Array.from()`, spread, an inline literal) from inside a selector — it breaks `useSyncExternalStore` and can cause **"Maximum update depth exceeded"** (crashed the app on every open via `LimitOrderWatcher.tsx`). Select the store's own raw field; derive anything computed with `useMemo` in the component. A primitive return (`s.badges.length`) is always safe.
2. **Reanimated `entering=` must never share a native view with touch handling.** A view mid-entrance-animation can have unreliable touch hit-testing for its first tap or two. Entrance animation goes on a plain, non-touchable `Animated.View`; touch handling goes on a plain `Pressable` nested inside it — never `AnimatedPressable` carrying both `entering=` and `onPress` at once. (Bit six modal sheets + a flashcard flip-card — Submit needed "a few tries.")
3. **Tab transitions are the navigator's job, not each screen's.** There is no per-screen entrance animation any more: `hooks/useTabEntrance.ts` and every `useTabEntrance(...)`/`entering=`-on-tab-root usage were deleted when tabs moved to the horizontal sliding navigator (§5.1). Don't reintroduce one. The history is worth knowing, because two separate attempts to animate tab roots individually both failed in ways that are easy to repeat: a remount `key=` to replay `entering=` on focus recreated every `Pressable` inside and multiplied rule #2's touch-hit-testing bug across every button on every tab switch; and a hook driving opacity/translateY off `useFocusEffect` worked mechanically but was tuned so small and fast (8px over 180ms, stagger squashed to 60ms) that it was imperceptible, so the tabs looked static and the feature read as broken. The slide replaced both: it is one animation owned by one place, it is visible by construction because the screens physically move, and it needs no cooperation from screen code. `entering=` is still correct for things that genuinely mount — list rows, modal sheets — subject to rule #2.

4. **`useCallback` deps must include every prop function actually called inside the callback.** A handler that calls `props.onX?.(e)` but is memoized on unrelated deps will go stale and call an outdated closure. If you see a suppressed `react-hooks/exhaustive-deps` warning on a handler that forwards to a prop callback, that's a bug, not a style choice — fix the deps, don't suppress. (This exact bug in the custom tab bar was the most likely cause of "the Home button literally does not work.")
5. **Never reimplement month-arithmetic.** `Date.setMonth()` on a day that doesn't exist in the target month silently rolls into the following month (Jan 31 + 1 → "Mar 3"). Always use `utils/date.ts`'s `addMonthsStr`, which clamps to the real last day and is shared by every recurring schedule.
6. **Recurring/catch-up processing is always cursor-based.** Every "catch up N cycles since last time" feature (recurring expenses, dividends, limit orders, auto-invest, goal contributions, bill reminders) uses a *persisted cursor field*, advanced in a guard-capped `while` loop — never recomputed from what's currently visible in an array (breaks the moment an item is deleted and re-added).
7. **Historical-value date "spines" must come from the most-complete series**, not an arbitrary/first one, when reconstructing values day-by-day against cached price bars — see §5.4 for the one deliberate exception and why.
8. **Always import `Text` from `components/ui/Text`, never from `react-native`.** It's a drop-in wrapper that applies the user's font-family and text-scale settings (Settings › Learning Environment) — a no-op at the defaults, so it's always safe to use. Importing `Text` straight from `react-native` silently opts that screen out of both settings (this was true of ~150 screens before it was fixed app-wide in one pass). `AppText` (variant + color convenience) already delegates to it — don't reapply scale/family on top of `AppText`, that double-scales.

9. **Nothing expensive goes on the tap path, and app-wide hooks must stay allocation-free.** `triggerFeedback` runs *synchronously inside `onPressIn`*, ahead of the press animation and the button's own `onPress`, so anything slow it touches is felt as button lag on every button in the app. Four rules came out of fixing exactly that: (a) `services/sound/soundEffects.ts` keeps **one long-lived `AudioPlayer` per category** and rewinds it — it used to call `createAudioPlayer()` per press, putting a native player allocation in front of every tap; never go back to per-play construction. (b) `paletteFor` is **memoized per scheme+accent** — `useTheme` is called by nearly every component on every render, and returning a fresh spread each time both allocated constantly and broke the referential stability that `useMemo`/`useCallback`/memoized children depend on. (c) `components/ui/Text` **fast-paths the default settings** (system font, 1x scale) and skips `StyleSheet.flatten` entirely; it wraps every piece of text in the app, so per-node work there is multiplied by hundreds. (d) `useQuotes` **returns the previous Map when no price changed** so a poll that finds nothing new causes no re-render — it polls on a timer against data that can only change once per its 5-minute TTL, and a tap landing behind a 27-row re-render is felt as input lag, not as a slow list.

General style: no dead code, no speculative abstraction, no comments explaining *what* (only non-obvious *why*), match existing patterns in the file you're editing before introducing a new one.

## 8. Environment & secrets

Everything is optional and additive — the app is fully functional in demo mode with zero env vars set. Full docs in `Expense Tracker/.env.example`.

| Variable | Unlocks | Without it |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_*_API_KEY` | Real store purchases | Dev-only tier switcher |
| `EXPO_PUBLIC_SHARED_GEMINI_API_KEY` | AI features work without BYOK | User must add their own key |
| `EXPO_PUBLIC_SHARED_OPENROUTER_API_KEY` | Raced against Gemini for text features | Gemini-only fallback |
| `EXPO_PUBLIC_TWELVEDATA_API_KEY` | Real live-ish market data | Local mock random-walk engine |
| `EXPO_PUBLIC_SENTRY_DSN` | Crash reporting | No-op |
| `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Accounts + friends/families/duels, reached only via `/markets/portfolio/social` (§5.8) | That one screen shows "not set up"; everything else in the app is unaffected either way |

`eas.json`: `development` / `preview` / `production` build profiles. `app.json`: bundle id `com.nathgoa.mockstocktrainer`, scheme `mockstocktrainer`.

## 9. Current state (last updated: this session)

Everything in §6 plus the additions below is built, typechecks clean, and is pushed to `main`. Tabs slide horizontally via a custom navigator (§5.1), replacing the per-screen entrance animation entirely (§7 rule #3), and the font/text-scale setting applies app-wide (§7 rule #8). Bottom tab bar: Home, Learn, Markets, News, Expenses, Assistant — Portfolio is nested under Markets, not a bottom tab (kept at six rather than growing to seven). The tab bar's active-tab highlight is a rounded rect covering the whole tab button (icon+label), not a small circle behind just the icon. All 8 modal backdrops use the split entrance/touch pattern from rule #2.

**This session's big additions, in the order they were built:**
1. **Price-direction predictor** (§5.4, `services/predictor/`) — a real, measured L2 logistic regression (not a heuristic), shipped weights fitted offline (`npm run eval:predictor`) and periodically refreshed against current data. Re-measured and retuned this session after an explicit attempt to reach 65% accuracy at 50% confident-call coverage — **not achievable**: real measurement (`npm run sweep:predictor`) shows the honest accuracy/coverage curve tops out around 55-58% accuracy near 15-17% coverage, or ~54% (essentially the always-majority baseline) if pushed toward 50%+ coverage. That's a real precision/coverage tradeoff in how hard short-horizon direction genuinely is from price/technical features, not a tuning gap — don't let a future request for "just make it more accurate" turn into faking the number instead of re-running the measurement. Did find real wins from that pass, in two rounds: horizon moved from 10 to 20 trading days (`HORIZON_DAYS`/`PREDICTOR_L2` in `config.ts`), which measurably improved confident-call coverage on the app's own 27 tickers without hurting accuracy; then, chasing a follow-up "65%/20%?" ask, four engineered interaction features were added to `features.ts` (`rsiXmktVol`, `trendXmktDrawdown`, `gapXvolScaledMom`, `mktVol20Sq` — hypothesized from the existing weight ranking: market vol/drawdown were already the two strongest features, and a plain linear model can't see their interaction with anything else unless it's handed explicitly), which moved out-of-sample AUC on the app's tickers 0.581→0.584 and confident accuracy up ~1.5-2 points at a given threshold. Current shipped operating point (`CONFIDENCE_THRESHOLD = 0.555`): **64% accuracy over 20% coverage on the app's own 27 tickers** — genuinely close to 65%/20%, not exactly there (every threshold in this region is a real tradeoff along the same curve; there is no point that clears both 65 and 20 at once with this model/feature set). See `config.ts`'s comments on `HORIZON_DAYS` and `CONFIDENCE_THRESHOLD` for the full reasoning, and why the in-app footnote (`PRETRAINED_METRICS`) deliberately still shows the more conservative, larger-sample **pooled** 90-symbol number (currently ~56%/~18%) rather than the flashier 27-ticker figure — `evaluate.ts`'s `confidenceThreshold` param now defaults to the real `CONFIDENCE_THRESHOLD` constant instead of a hardcoded value that would've silently drifted out of sync with it (a real bug found and fixed in the same pass). **If a future request asks to push this further, re-run `npm run eval:predictor`/`sweep:predictor` and report the real measured number — do not just move the threshold and round generously.** Ships with a launch-time self-test tripwire (`services/predictor/selfTest.ts`) that switches predictions off if on-device learning ever drifts the weights below shipped quality. Data collection is opt-in, asked during onboarding.
2. **News tab** (`app/(tabs)/news/`, `services/news/marketNews.ts`) — sectioned fetch (Market / today's biggest movers / one section per held-or-watched stock), presented as an InShort-style swipeable one-headline-at-a-time card feed with an on-demand "Explain this" AI gloss per headline. See §5.4 for two fixes made after this shipped: the general section moved from a free-text query to real index symbols (an off-topic-results bug), and the card layout was reworked to actually use the screen's height instead of clustering everything under the meta row.
3. **Product scanner** (Pro/Max, `app/scanner.tsx`, `services/scanner/`) — camera or library photo → AI identifies the company (mirrors the existing receipt-extraction vision-AI pattern exactly) → a draggable "blob" bottom sheet, swipe between ranked candidates. Reworked this session: each candidate card shows its stock's price, a mini chart, and up to 3 auto-summarized related headlines **inline** (only fetched for the currently active/paged-to candidate, never all of them at once — same rate-limit lesson as §5.4) instead of a "View X stock" button that used to send you to a separate screen. The horizontal swipe between candidates is gated on the vertical expand/collapse drag actually finishing (`FlatList`'s `scrollEnabled` tied to the pan gesture's live state), so paging never fights an in-progress drag. Entry point: "Scan" action on Markets.
4. **$100k vs AI investing arena** (`app/(tabs)/markets/arena.tsx`, `services/arena/arenaEngine.ts`) — a time-boxed head-to-head against a simple AI trader, entirely self-contained (its own seeded price paths, its own portfolio math) — never touches the real/mock market engine and never imports the predictor. Configurable cash/duration/AI difficulty/stock count, adjustable playback speed + instant skip-ahead. Entry point: button on the practice-trade sandbox.
5. **Friends, families, and duels** (§5.8) — built this session on top of the earlier Supabase foundation, gated by a new scoped `SocialAuthGate` (not an app-wide login wall — the rest of the app needs no account at all). **Two manual dashboard steps are still outstanding before this works against a real project** — re-running the updated `supabase/schema.sql`, and toggling Realtime on for the `duels` table — see §5.8 for exactly what and why. Not yet live-tested against real Supabase data for that reason.
6. **Local-only dev tier switcher, no login, no modal.** Superseded twice since it was first built: it started as a fake-credential login modal, then Arya replaced that with tapping the Settings title 9× to cycle free → pro → max directly (no modal at all). That still had a real bug fixed later the same day: the tap target was only the title `Text`'s native-header slot (~60pt of a full-width bar), so tapping anywhere else on the bar did nothing. Settings now renders its own top bar (`headerShown: false` on that one screen, like the tab roots already do) so the *entire* bar is one `Pressable` — back button nested inside it wins its own taps, everything else counts toward the 9 — plus a countdown toast for the last 3 taps so a tap that didn't register isn't mistaken for the gesture being broken. Unaffected by point 5 — this shortcut lives inside Settings and was never behind a login wall.
7. **Pro/Max tier badge** (`components/ui/TierBadge.tsx`) — a small diamond-icon pill next to the title on every screen using `TopBar`, reading the tier live off `useSettingsStore`. Free renders nothing.
8. **Weekly Recap** (§5.4, `app/recap.tsx`) — a Spotify-Wrapped-style card deck replacing the old inline AI-generated text recap on Home entirely (that machinery — `useWeeklyRecapStore`, `generateWeeklyRecap`, `buildWeeklyRecapPrompt` — was deleted, not kept alongside this).
9. **Search any real stock** (§5.4, Markets tab) — the search bar falls back to a live symbol search once the curated `TICKERS` list comes up empty, and an untracked result opens a reduced stock-detail view (live price + chart + watchlist, no trading/predictor). Replaces the old flat "Unknown symbol." for anything typed that isn't one of the 27.

EAS builds run under the `nathgoas-team` account. `app.json`'s `owner: "nathgoas-team"` and `extra.eas.projectId` are NOT optional or auto-recreated — confirmed by a real build failing with "EAS project not configured" while they were absent. Both fields must stay committed; if either is ever missing, someone must re-run `eas init --account nathgoas-team` (interactive, real terminal — cannot self-configure non-interactively) and commit the resulting `app.json` diff.

A second contributor (Arya) also pushes directly to `main` via their own Claude Code sessions, often running in parallel with whichever session is reading this file — commits show up authored as "Claude" or their own name. **This happened repeatedly this session**: treat any push you didn't make yourself as a real, possibly-conflicting change, not noise — `git fetch`/`git log HEAD..origin/main` before every commit, and if the same files are involved, read what changed before assuming your version should win (twice this session, the other side's design was genuinely better and got adopted instead of overwritten — see the News tab in point 2 above).

**Known gaps**, not bugs:
- No automated tests exist (§3) — accepted, not a TODO, unless asked.
- Predictor, News, and the Markets search fallback's headline/symbol fetches are all CORS-blocked on the **web preview only** — expected, works on native (confirmed via curl with a browser User-Agent). Don't mistake this for a real bug when testing in the browser pane. **This is also the first thing to check for any "search/lookup doesn't return anything" report from someone testing on web** — but a report from an actual phone/native build testing a feature this same session shipped is far more likely to mean they're on a build that predates the push (EAS builds aren't auto-triggered — §2) than a real bug; confirm which before assuming either.

## 10. Suggested next steps

**In progress / explicitly requested, not finished — do this first if the user doesn't specify:**
- **Two Supabase dashboard steps for Phase 2** (§5.8) — re-run the updated `supabase/schema.sql`, and turn on Realtime replication for `duels`. Code-complete but unverified against real backend data until these happen; ask whoever has dashboard access before assuming friends/families/duels work live on a real project.
- **Family-duel full-roster aggregate** (§5.8) — currently owner-vs-owner, not every member's own portfolio. Needs a per-member join/accept flow (each member's own device reporting its own baseline), not just a bigger `participant_ids` array.
- **Learn-tab modes** (the rest of the original big feature request, not started): ELI5 toggle on lesson screens (free), a Pro/Max "visual learning mode" with animated charts (realistically 2-3 flagship courses with true custom visuals, not all 10 — said explicitly when scoped), a free storytelling mode (reuse the `generateNarrative` AI pattern), free text-to-speech (needs adding the `expo-speech` dependency — a genuinely new native module, needs a new EAS build to take effect), and a free daily trivia battle vs a seeded (not AI-per-question) bot opponent.

**Older, discussed-but-not-started ideas** (lower priority than the above unless asked):
- **Debt/loan payoff tracker** — mirror of savings goals (balance going down instead of up); reuses the recurring-contribution and progress-bar machinery almost entirely.
- **Activity heatmap** — GitHub-style day-by-day grid of app activity.
- **Custom expense categories** — user-defined categories beyond the fixed list in `constants/categories.ts`.
- **Goal milestones on the net worth chart** — annotate `computeNetWorthHistory`'s chart with markers at each goal's `completedAt` date.

Otherwise: ask the user what they want next rather than assuming one of the above.
