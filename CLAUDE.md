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
                     read), social/ (supabaseClient.ts — Phase 2 accounts,
                     see §5.8)
  scripts/          Node-only tooling (npm run eval:predictor / sweep:predictor /
                     test:news) — excluded from tsconfig, never shipped
  supabase/         schema.sql — paste-and-run in the Supabase SQL Editor;
                     not applied by the app itself, no migration tooling
  components/       ui/, charts/, expenses/, portfolio/, markets/, stocks/,
                     chat/, reviews/, security/, settings/, onboarding/, games/,
                     navigation/ (SlidingTabs, MarketsPortfolioSwitch),
                     scanner/ (CompanyResultSheet), news/ (NewsCard),
                     auth/ (AuthGate — §5.8)
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

**Live fetching must stay throttled and backed off — this is load-bearing, not tuning.** Screens poll `getQuote` every 3s across every tracked symbol, so an ungoverned refresh fired ~27 simultaneous requests every 3 seconds (~540/min). Yahoo rate-limits that instantly, and because a symbol's `fetchedAt` is only stamped on *success*, every failure was permanently past its TTL and retried the same burst forever — the app could never recover and every price stayed mock indefinitely. That was the real reason "live prices don't work" survived several rounds of fixes. All network work therefore goes through `liveMarketData.ts`'s queue (max 3 in flight, ≥150ms apart) with per-symbol exponential backoff (20s → 5min). Quote refreshes use a cheap 5-day range and **must never write to `barsCache`** (a 5-day series would overwrite the 2-year history charts depend on *and* satisfy the 6h bars TTL). `Settings › Market data` renders `getMarketDataStatus()` — provider, live-symbol counts, request/failure counts, last error — so a failing install can be diagnosed from the device instead of guessed at.

`computePortfolioVsBenchmark`'s date "spine" is anchored on `TICKERS[0]` (fine — it needs the full ticker universe anyway); `computeNetWorthHistory`'s spine is anchored on whichever *traded* symbol has the longest cached history. These are deliberately different — don't unify them.

**News tab** (`app/(tabs)/news/`, data in `services/news/marketNews.ts`) reuses `services/news/newsFeed.ts`'s `fetchHeadlines` — the same Yahoo search endpoint the predictor's headline scan uses — sectioned into Market (general), Today's biggest movers (reuses the mover concept from `MarketSpotlightCard`), and one section per symbol held or watchlisted (capped at 12). It inherits the rate-limit lesson above rather than repeating the mistake: every section has its own 1h TTL cache, and real fetches within one `loadMarketNews()` call run sequentially with a 250ms gap between them (mirroring `services/predictor/startupScan.ts`'s existing spacing), never in a burst. A pull-to-refresh (`loadMarketNews(true)`) bypasses every section's TTL; the screen also re-runs a normal (TTL-respecting) load every hour while it sits focused, since the TTL alone only refetches on the *next* call, which wouldn't happen if someone just leaves the tab open.

### 5.5 Subscriptions

Free / Pro / Max. `constants/subscription.ts`'s `TIER_FEATURES` is the single source of truth for what unlocks per tier. Demo pricing: Pro $5/mo · $49.99/yr · $129.99 lifetime — Max $15/mo · $139.99/yr · $349.99 lifetime (real store prices once RevenueCat is configured). Without a RevenueCat key, the paywall shows a **dev-only tier switcher** instead of real purchases — intentional.

### 5.6 Notifications

Local-only, no backend. Three kinds, each idempotent: 8pm daily check-in, same-day 9pm "streak at risk" nudge, per-recurring-expense "due tomorrow" 9am nudge. All gated behind the notifications toggle *and* `TIER_FEATURES[tier].pushAlerts` (Pro/Max).

### 5.7 Gamification

`useStreakStore.awardBadge(id)` is a generic, idempotent one-off award. `constants/badges.ts` is the single badge registry — a new badge needs an entry there plus an `awardBadge` call. `app/settings/achievements.tsx` renders every entry, earned or locked.

### 5.8 Accounts (Supabase) — Phase 2, foundation only

The **first real backend this app has ever had** — everything else in this repo is 100% local/on-device. `services/social/supabaseClient.ts` is the only place the app talks to Supabase. Fully additive/optional: with `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` unset, `isSupabaseConfigured()` is false and the app behaves exactly as before — no auth wall.

When configured, `app/_layout.tsx` renders `components/auth/AuthGate.tsx` (sign-in/sign-up/verify-code/reset-password, one component with internal step state, same shape as `OnboardingScreen`) in place of the main app whenever there's no session. `store/useAuthStore.ts` mirrors Supabase's own auth listener — it is deliberately **not** `persist`-backed itself, since Supabase's client already persists the session to AsyncStorage.

**A real crash was found and fixed here**: Expo Router's web output does an initial server-side render pass (plain Node, no `window`), and Supabase's client touches session storage the moment it's constructed — with no guard, that killed the entire dev server (`ReferenceError: window is not defined`, process exit code 7), not just a caught browser error. Fixed by disabling `persistSession`/`autoRefreshToken` and the `storage` adapter whenever `typeof window === 'undefined'`. Do not remove that guard.

`supabase/schema.sql` has the full schema (`profiles` auto-created via trigger on signup, `friendships`, `families`/`family_members`, `duels`) with Row Level Security on every table — paste-and-run once in the Supabase SQL Editor; nothing in the app applies it automatically, there is no migration tooling.

**Dashboard setting required, not yet done**: Supabase's signup confirmation email defaults to a magic link. The Auth email template (Authentication → Email Templates → Confirm signup) must be switched to the OTP/code variant, or users will get a link instead of the 6-digit code `AuthGate` asks them to enter.

## 6. Feature inventory, by tab

- **Home** — net worth/P&L stats, free-tier upsell, watchlist, quick actions, AI weekly recap
- **Learn** — streak/badges, spaced-repetition next-topic, flashcards, narrative daily challenge, full topic list; bank-first content with AI fallback
- **Markets** — searchable ticker list, watchlist stars, trend summary, practice trade, regenerate market, backtest (Max), per-symbol detail with a trained price-direction model, forecast band/sentiment (Pro+); **Portfolio** lives here too (§5.1), reached via the Markets/Portfolio switch or `router.push('/markets/portfolio')` — multi-portfolio (Max), net worth history, vs-benchmark chart, holdings, diversification donut, auto-invest plans, dividend income, recent trades, share-as-image, leaderboard
- **News** — sectioned market headlines (general, today's biggest movers, one section per held/watchlisted stock), refreshes hourly, star a stock right from its section (§5.4)
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
| `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Accounts, email verification, families/friends/duels (§5.8) | No auth wall at all — app works exactly as today |

`eas.json`: `development` / `preview` / `production` build profiles. `app.json`: bundle id `com.nathgoa.mockstocktrainer`, scheme `mockstocktrainer`.

## 9. Current state (last updated: this session)

Everything in §6 plus the additions below is built, typechecks clean, and is pushed to `main`. Tabs slide horizontally via a custom navigator (§5.1), replacing the per-screen entrance animation entirely (§7 rule #3), and the font/text-scale setting applies app-wide (§7 rule #8). Bottom tab bar: Home, Learn, Markets, News, Expenses, Assistant — Portfolio is nested under Markets, not a bottom tab (kept at six rather than growing to seven). The tab bar's active-tab highlight is a rounded rect covering the whole tab button (icon+label), not a small circle behind just the icon. All 8 modal backdrops use the split entrance/touch pattern from rule #2.

**This session's big additions, in the order they were built:**
1. **Price-direction predictor** (§5.4, `services/predictor/`) — a real, measured L2 logistic regression (not a heuristic), shipped weights fitted offline over 152k samples/90 tickers, ~58% accurate on the ~14% of calls it's confident enough to make. Ships with a launch-time self-test tripwire (`services/predictor/selfTest.ts`) that switches predictions off if on-device learning ever drifts the weights below shipped quality. Data collection is opt-in, asked during onboarding.
2. **News tab** (`app/(tabs)/news/`, `services/news/marketNews.ts`) — sectioned fetch (Market / today's biggest movers / one section per held-or-watched stock), presented as an InShort-style swipeable one-headline-at-a-time card feed with an on-demand "Explain this" AI gloss per headline.
3. **Product scanner** (Pro/Max, `app/scanner.tsx`, `services/scanner/`) — camera or library photo → AI identifies the company (mirrors the existing receipt-extraction vision-AI pattern exactly) → a draggable "blob" bottom sheet, swipe between ranked candidates, deep-links to the matching stock if tracked. Entry point: "Scan" action on Markets.
4. **$100k vs AI investing arena** (`app/(tabs)/markets/arena.tsx`, `services/arena/arenaEngine.ts`) — a time-boxed head-to-head against a simple AI trader, entirely self-contained (its own seeded price paths, its own portfolio math) — never touches the real/mock market engine and never imports the predictor. Configurable cash/duration/AI difficulty/stock count, adjustable playback speed + instant skip-ahead. Entry point: button on the practice-trade sandbox.
5. **Supabase accounts — foundation only** (§5.8) — sign-up/sign-in/email-code-verification/password-reset all working, `supabase/schema.sql` ready to run (profiles/friendships/families/duels, full RLS). **Friends/families/duels UI is NOT built yet** — this is the single biggest piece of unfinished, explicitly-requested work. See §10.
6. Two **local-only, fake-credential** "owner" logins added to the existing hidden dev-login modal (Settings title tapped 9×) that jump straight to Max — deliberately not real emails/passwords, since this file's history is public once pushed.

EAS builds run under the `nathgoas-team` account. `app.json`'s `owner: "nathgoas-team"` and `extra.eas.projectId` are NOT optional or auto-recreated — confirmed by a real build failing with "EAS project not configured" while they were absent. Both fields must stay committed; if either is ever missing, someone must re-run `eas init --account nathgoas-team` (interactive, real terminal — cannot self-configure non-interactively) and commit the resulting `app.json` diff.

A second contributor (Arya) also pushes directly to `main` via their own Claude Code sessions, often running in parallel with whichever session is reading this file — commits show up authored as "Claude" or their own name. **This happened repeatedly this session**: treat any push you didn't make yourself as a real, possibly-conflicting change, not noise — `git fetch`/`git log HEAD..origin/main` before every commit, and if the same files are involved, read what changed before assuming your version should win (twice this session, the other side's design was genuinely better and got adopted instead of overwritten — see the News tab in point 2 above).

**Known gaps**, not bugs:
- No automated tests exist (§3) — accepted, not a TODO, unless asked.
- Predictor and News headline fetches are CORS-blocked on the **web preview only** — expected, works on native (confirmed via curl with a browser User-Agent). Don't mistake this for a real bug when testing in the browser pane.

## 10. Suggested next steps

**In progress / explicitly requested, not finished — do this first if the user doesn't specify:**
- **Families/friends/duels UI** (§5.8) — the actual reason Phase 2 was started. Schema (`supabase/schema.sql`) is ready; needs: a friend-request flow (search/add by email or username, accept/decline), a "create/join family" flow, and a duel flow (challenge a friend or another family, both sides' portfolios trade the same simulated period, track `time_skip_votes` — "no time-skipping unless all participants agree" is a **Pro/Max-gated** rule per the original request, needs a new `FeatureFlags` flag). Supabase Realtime channels are the natural fit for live duel score updates (avoid polling).
- **Supabase dashboard setting**: the signup confirmation email currently defaults to a magic link, not the 6-digit code `AuthGate` expects the user to type in. Someone with dashboard access needs to switch Authentication → Email Templates → "Confirm signup" to the OTP/code template.
- **Learn-tab modes** (the rest of the original big feature request, not started): ELI5 toggle on lesson screens (free), a Pro/Max "visual learning mode" with animated charts (realistically 2-3 flagship courses with true custom visuals, not all 10 — said explicitly when scoped), a free storytelling mode (reuse the `generateNarrative` AI pattern), free text-to-speech (needs adding the `expo-speech` dependency — a genuinely new native module, needs a new EAS build to take effect), and a free daily trivia battle vs a seeded (not AI-per-question) bot opponent.

**Older, discussed-but-not-started ideas** (lower priority than the above unless asked):
- **Debt/loan payoff tracker** — mirror of savings goals (balance going down instead of up); reuses the recurring-contribution and progress-bar machinery almost entirely.
- **Activity heatmap** — GitHub-style day-by-day grid of app activity.
- **Custom expense categories** — user-defined categories beyond the fixed list in `constants/categories.ts`.
- **Goal milestones on the net worth chart** — annotate `computeNetWorthHistory`'s chart with markers at each goal's `completedAt` date.

Otherwise: ask the user what they want next rather than assuming one of the above.
