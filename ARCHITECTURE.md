# ARCHITECTURE.md — Shipaton / Markva

A structural map of this repository: what lives where, how the pieces connect, and why the layout looks the way it does. This is a companion to **`CLAUDE.md`** (the project's living memory — conventions, history, current state, next steps) and **`AGENTS.md`** (the same content, mirrored for Codex-based agents). Read those for *why decisions were made*; read this for *where things are*.

> The repo root and the app are not the same directory. **All app code lives in `Expense Tracker/`** — that's where `package.json`, `app.json`, and every `npm`/`expo`/`tsc` command must run from.

---

## 1. Repository root

```
Shipaton/                         (git root)
  CLAUDE.md                       Full project memory — read first, always
  AGENTS.md                       Mirror of CLAUDE.md for Codex sessions
  README.md                       One-line pointer (team + hackathon name)
  LICENSE
  .github/workflows/eas-build.yml CI: triggers EAS builds
  .claude/, .agents/              Claude Code / Codex local tool config + skills
  tmp/                            Untracked scratch space (gitignored; currently
                                   holds an unrelated "moot_court" transcription
                                   experiment — not part of this app)
  Expense Tracker/                *** The actual app — everything below lives here ***
```

Two duplicate-looking files are **not duplicates**: `Expense Tracker/CLAUDE.md` is a one-line pointer (`@AGENTS.md`) to `Expense Tracker/AGENTS.md`, which itself is a short note ("Expo HAS CHANGED — read the versioned v57 docs before writing code") — distinct from the root-level `CLAUDE.md`/`AGENTS.md`, which are the full project-memory files.

---

## 2. The app: `Expense Tracker/`

A single Expo Router app. Root-level config:

| File | Role |
|---|---|
| `app.json` / `app.config.ts` | Expo config — package id `com.nathgoa.markva` (Android), scheme `mockstocktrainer`, plugins (RECORD_AUDIO explicitly disabled — see CLAUDE.md §8) |
| `eas.json` | Build profiles: `development` / `preview` / `production` / `judge` |
| `tsconfig.json` | TypeScript config; `scripts/` is excluded (Node-only tooling, never shipped) |
| `metro.config.js` | Metro bundler config |
| `.env.example` / `.env.local` | Every optional env var documented; app is fully functional with none set |
| `supabase/schema.sql` | Hand-run-once Postgres schema for the optional accounts/social feature (not applied automatically) |
| `PRIVACY.md` | Source of truth for the privacy policy — kept in the repo deliberately, unlike other docs |
| `plugins/withJudgeBuildType.js` | Config plugin supporting the temporary "judge mode" build variant |

### 2.1 Top-level app directories

```
app/            expo-router file-based routes (screens) — §3
store/          Zustand state stores, one file per domain — §4
services/       Business logic / integrations, one folder per domain — §5
components/     Reusable UI, grouped by feature area — §6
constants/      Static config, content banks, design tokens — §7
hooks/          Cross-cutting React hooks
utils/          Pure helper functions (date/money/id/stats/portfolio math/etc.)
types/          Shared TypeScript types
scripts/        Node-only CLI tooling (predictor eval/sweep, news test, bar fetch)
assets/         Images, sounds, fonts
android/        Generated native Android project (from `expo prebuild`)
```

---

## 3. Routing (`app/`)

Expo Router (file-based, typed routes). Route files map directly to screens; folders are stacks.

```
app/
  _layout.tsx              Root layout — onboarding gate, age gate, app lock,
                            startup effects (dividends/auto-invest/bill reminders/
                            RevenueCat sync/review prompt)
  (tabs)/
    _layout.tsx             Custom sliding tab navigator (6 tabs) — §3.1
    index.tsx                Home
    learn/                    Streak, flashcards, quiz, narrative daily challenge,
                               trivia, per-course lesson (4 modes), level-select,
                               focus-session
    markets/                  Ticker list/search, per-symbol detail, practice,
                               backtest, arena ($100k-vs-AI), and a nested
                               portfolio/ stack (index, manage, leaderboard,
                               networth, trade/[symbol], social/ — friends/
                               families/duels)
    news/                     Swipeable single-headline feed
    expenses/                 List, add, [id], budgets, goals
    assistant/                AI chat
  settings/                 index, upgrade (paywall), achievements,
                             quality-of-life, records, debug
  recap.tsx                 Weekly Recap — full-screen Stories-style card deck
  scanner.tsx                Camera/photo → AI company ID → related stock info
  search.tsx                 Global search across courses + tickers
  toolkit.tsx                Investor-tools reference screen (calculators/glossary)
  game.tsx                   Dev-only Flappy-Bird-style loading-screen preview
                              (redirects to `/` outside `__DEV__`)
  +html.tsx / +not-found.tsx  Web shell / 404
```

### 3.1 Navigation model

- Six bottom tabs: **Home, Learn, Markets, News, Expenses, Assistant.** Each tab owns its own `Stack`, so pushed sub-screens mount/unmount normally.
- **Portfolio is not a tab** — it's nested under `markets/portfolio/`, reached via `router.push('/markets/portfolio')`. A `SegmentedControl` (`components/navigation/MarketsPortfolioSwitch.tsx`) flips between Markets and Portfolio via `router.replace` both ways, so the two read as peer sections rather than a drill-down.
- **Tabs slide horizontally.** `components/navigation/SlidingTabs.tsx` replaces expo-router's stock `<Tabs>` entirely — built on React Navigation's `useNavigationBuilder(TabRouter)` + `createNavigatorFactory`, surfaced through `withLayoutContext`. All six tab roots live in one row; switching animates the whole row's `translateX`, so jumping tabs visibly passes the ones in between. The tab bar itself (icons, labels, active pill) is rendered by this same navigator, driven by the same shared value as the content.
- Settings is a sibling stack off Home's gear icon, not nested inside a tab.

See `CLAUDE.md` §5.1 and §7 rule 3 for the full history (two earlier per-screen entrance-animation approaches were tried and reverted before this navigator replaced them).

---

## 4. State (`store/`)

Zustand, one store per domain, `persist` + `AsyncStorage` for anything that survives a restart. Cross-store reads go through `useXStore.getState()` — an intentional pattern for one store to read another without subscribing to it.

| Store | Domain |
|---|---|
| `useExpenseStore` | Expenses, recurring series, round-up trigger |
| `useBudgetStore` | Overall + per-category budgets |
| `useSavingsGoalStore` | Goals — manual/recurring/round-up contributions |
| `usePortfolioStore` | Multi-portfolio trading, dividends, limit orders, auto-invest, watchlist |
| `useMarketStore` | One `epoch` counter — bumping re-seeds the whole mock market |
| `useStockViewStore` | Free-tier lookup gate + simulated ad-slot counter |
| `useStreakStore` | Daily streak, badges, pattern/analyst counters |
| `useQuizStore` / `useFlashcardStore` / `useCourseStore` | Learn-tab progress, spaced repetition, lesson state |
| `useTriviaStore` | Daily trivia battle — cursor-based "already played today" |
| `usePredictorStore` | Price-direction model state / on-device learning |
| `useMistakeJournalStore` | Trade-reflection / mistake tracking |
| `useSavedChartsStore` | Saved chart configurations |
| `useQolStore` | Quality-of-life settings screen state |
| `useChatStore` | Assistant chat threads (general + per-symbol) |
| `useAiUsageStore` | Shared daily AI-action counter |
| `useUsageStore` | General usage/analytics-style counters |
| `useSettingsStore` | Theme, accent, tier, AI provider/keys, notifications, biometric lock |
| `useAgeStore` | Date-of-birth gate, age band, judge-mode flag, AI-data consent |
| `useAuthStore` | Supabase auth session (only initialized when the social screen mounts) |
| `useReviewStore` / `useToastStore` | In-app review prompt state / global toast (not persisted) |

**Non-negotiable rule (CLAUDE.md §7.1):** a selector must return a referentially-stable value — never a freshly-built array/object from inside `useStore(selector)`. A violation of this crashed the app app-wide once ("Maximum update depth exceeded").

---

## 5. Services (`services/`)

Business logic and third-party integration, deliberately kept out of components/screens. Each screen talks to one dispatch point per domain, never to a provider file directly.

| Folder | Responsibility |
|---|---|
| `ai/` | `client.ts` — **single dispatch point** for every AI feature (chat, quizzes, receipts, insights, recap). Picks provider/key, `sendStructuredPrompt<T>()`, quota enforcement, Gemini/OpenRouter racing, broken-key tracking. `prompts.ts`, `errorMessage.ts`, `learn.ts` (cached headline explainer) |
| `marketData/` | `marketData.ts` is the only import point; dispatches to `liveMarketData.ts` (Twelve Data → Yahoo Finance → `mockMarketData.ts`). Throttled request queue + per-symbol exponential backoff — load-bearing, see CLAUDE.md §5.4 |
| `market/` | `backtest.ts`, `signals.ts` — strategy backtesting and signal computation over market data |
| `predictor/` | Trained L2 logistic-regression price-direction model, feature engineering, launch-time self-test tripwire, `startupScan.ts` |
| `news/` | `newsFeed.ts` (shared Yahoo search endpoint) + `sentiment.ts` (on-device scoring) + `marketNews.ts` (sectioned News-tab feed) |
| `arena/` | Self-contained $100k-vs-AI engine — its own seeded price paths, never touches real/mock market data or the predictor |
| `scanner/` | Camera capture + AI company identification (mirrors `receipts/`'s vision pattern) |
| `receipts/` | Receipt photo → AI auto-fill for expense entry |
| `social/` | `supabaseClient.ts`, `friends.ts`, `families.ts`, `duels.ts` — optional accounts feature, Phase 2 |
| `recap/` | `weeklyRecap.ts` — local-only, no-AI-dependency "Wrapped" deck builder |
| `purchases/` | RevenueCat wiring, incl. `paywallUI.ts` for the judge-mode Test Store flow |
| `notifications/` | Local-only scheduled notifications (daily check-in, streak-risk, bill due) |
| `leaderboard/` | Seeded local bot opponents for portfolio ranking |
| `export/` | CSV export for expenses |
| `monitoring/` | `sentry.ts` — no-op without a DSN |
| `images/` | `prepareCapturedImage.ts`, platform-split `storedImageFiles`/`.web.ts` |
| `network/` | `fetchWithTimeout.ts` |
| `security/` | `appLock.ts` — biometric lock |
| `storage/` | `debouncedStorage.ts` — AsyncStorage write batching (used by bars cache etc.) |

---

## 6. Components (`components/`)

Grouped by the feature area they serve, plus a shared `ui/` kit:

```
ui/            Text, Button, Card, Chip, Screen, TopBar, TierBadge, FeedbackPressable, …
                (Text specifically wraps react-native's Text for font/scale settings —
                never import Text from 'react-native' directly, see CLAUDE.md §7.8)
charts/        Chart primitives (donut, line, etc.)
navigation/    SlidingTabs, MarketsPortfolioSwitch
expenses/ portfolio/ markets/ stocks/ chat/ reviews/ security/ settings/
onboarding/    OnboardingScreen, AgeGateScreen (incl. judge-mode prompt step)
scanner/       CompanyResultSheet
news/          NewsCard
recap/         RecapCardView
auth/          SocialAuthGate — scoped to the social screens only, not app-wide
games/         FlappyBirdLoader, LoadingGame, MarketMatchLoader — loading-screen
               mini-games shown during longer waits
home/          MarketSpotlightCard
```

---

## 7. Constants (`constants/`)

Static configuration and content, no logic beyond simple lookups:

`theme`, `typography`, `fonts`, `animations` (centralized spring configs), `subscription` (`TIER_FEATURES` — single source of truth for what's gated), `ageCompliance` (`AGE_PERMISSIONS` — parallel to but never merged with `TIER_FEATURES`; no upgrade lifts an age restriction), `judgeMode` (temporary hackathon switch — `JUDGE_MODE_ENABLED`), `categories`, `tickers`, `badges`, `quizTopics`/`quizBank`, `flashcardBank`, `courses`/`expandedCourseBlueprints`, `investorTools`, `learningRewards`, `materials`, `mockExpenseChart`, `aiModels`, `build` (`IS_JUDGE_BUILD` etc.).

---

## 8. Data flow, at a glance

```
Screen (app/**)
   │  reads via selector, no derived allocation in the selector itself
   ▼
Zustand store (store/**)  ──getState()──▶  another store, cross-read
   │  actions call into services for anything beyond local state
   ▼
Services (services/**)
   │
   ├─▶ services/ai/client.ts        ──▶ Claude / OpenAI / Gemini / OpenRouter (HTTP, no SDK)
   ├─▶ services/marketData/*.ts     ──▶ Twelve Data → Yahoo Finance → local mock engine
   ├─▶ services/purchases/*.ts      ──▶ react-native-purchases (RevenueCat) / Test Store
   ├─▶ services/social/*.ts         ──▶ Supabase (only when the social screen is opened)
   └─▶ services/monitoring/sentry.ts ─▶ Sentry (no-op without a DSN)
```

Everything financial is simulated locally; Supabase is the only backend touched, and only for the optional accounts/friends/families/duels feature.

---

## 9. Verification loop (no automated tests)

There is **no test suite**. Verification is:
1. `npx tsc --noEmit` (from inside `Expense Tracker/`)
2. Manual self-review of the diff
3. For anything touching imports/routes/assets: `npx expo export --platform android --output-dir <tmp>` — the strongest static check available; catches unresolved imports and module-init errors `tsc` can't see
4. For UI changes: run and interact with the feature (device/emulator) where possible

`experiments.typedRoutes` is on, but the generated route union only exists after the dev server has run once (`.expo/types/`) — a fresh clone won't catch a stale route string via `tsc`. Route strings have to be checked by reading, not tooling.

---

## 10. Where to go deeper

This file is a map, not the manual. For:
- **Working conventions** (commit/push rules, what needs explicit permission) → `CLAUDE.md` §2
- **Full architecture rationale per subsystem** (predictor, market data throttling, age gating, judge mode, subscriptions) → `CLAUDE.md` §5
- **Coding standards with the bug each one prevents** → `CLAUDE.md` §7
- **Env vars and what each unlocks** → `CLAUDE.md` §8
- **Current build state and outstanding manual steps** → `CLAUDE.md` §9–10
